import { describe, it, expect } from "vitest";
import { Rating } from "ts-fsrs";
import { freshServices, DAY_MS } from "./helpers";

const input = (word: string) => ({
  word,
  meaning_vn: "nghĩa của " + word,
  synonyms: [],
  antonyms: [],
  examples: [{ sentence_en: `The ${word} works.`, grammar_analysis: "S + V" }],
});

async function services() {
  const base = await freshServices();
  const recorder = await import("@/services/reviewRecorder");
  const cards = await import("@/services/cards");
  const streak = await import("@/services/streak");
  return { ...base, recorder, cards, streak };
}

const past = (d: number) => new Date(Date.now() - d * DAY_MS).toISOString();
const answersToday = (logs: Record<string, number>) => Object.values(logs).reduce((n, v) => n + v, 0);

describe("recordCardAnswer re-checks the stored schedule (no double grading)", () => {
  it("a stale snapshot of a card graded since is recorded as practice, outside the daily goal", async () => {
    const { db, recorder, cards, streak } = await services();
    const conn = await db.getDatabase();
    const id = await db.insertEnrichedWord(input("cache"));
    await conn.execute(
      `UPDATE srs_reviews SET next_review_date = $1, stability = 4, difficulty = 5, reps = 3, lapses = 0, state = 2, last_review = $2, scheduled_days = 4 WHERE word_id = $3`,
      [past(1), past(5), id]
    );
    // The session queue's snapshot, taken while the card was due
    const [word] = await db.getWordsByIds([id]);
    const snapshot = cards.toCard(word, "recognition");
    const answer = () =>
      recorder.recordCardAnswer({
        card: snapshot,
        exerciseType: "multiple_choice",
        rating: Rating.Good,
        wrongAttempts: 0,
        responseTimeMs: 3000,
        scheduled: recorder.schedulingDecision({ card: snapshot, exerciseType: "multiple_choice" }).scheduled,
        countsForDailyGoal: true,
      });

    const first = await answer();
    expect(first.scheduled).toBe(true);
    expect(first.practiceReason).toBeNull();
    expect(first.result).not.toBeNull();
    expect(answersToday(streak.getActivityLogs())).toBe(1);
    const [afterFirst] = await db.getWordsByIds([id]);
    expect(new Date(afterFirst.srs.next_review_date).getTime()).toBeGreaterThan(Date.now());

    // Same snapshot again (popup graded it / the session was remounted): still "due" on the snapshot
    expect(recorder.schedulingDecision({ card: snapshot, exerciseType: "multiple_choice" }).scheduled).toBe(true);
    const second = await answer();
    expect(second.scheduled).toBe(false);
    expect(second.practiceReason).toBe("not_due");
    expect(second.result).toBeNull();
    expect(second.mastered).toBe(false);
    expect(second.rescued).toBe(false);
    // Schedule untouched, daily goal not counted twice
    const [afterSecond] = await db.getWordsByIds([id]);
    expect(afterSecond.srs.next_review_date).toBe(afterFirst.srs.next_review_date);
    expect(afterSecond.srs.reps).toBe(afterFirst.srs.reps);
    expect(afterSecond.srs.stability).toBe(afterFirst.srs.stability);
    expect(answersToday(streak.getActivityLogs())).toBe(1);

    const logs = await conn.select<Array<{ is_scheduled: number }>>(
      `SELECT is_scheduled FROM review_logs WHERE word_id = $1 ORDER BY is_scheduled`,
      [id]
    );
    // One scheduled answer, one practice answer
    expect(logs.map((l) => l.is_scheduled)).toEqual([0, 1]);
  });

  it("checks the row of the card's own direction (production due, recognition not)", async () => {
    const { db, recorder, cards } = await services();
    const conn = await db.getDatabase();
    const id = await db.insertEnrichedWord(input("mutex"));
    const future = new Date(Date.now() + 3 * DAY_MS).toISOString();
    await conn.execute(
      `UPDATE srs_reviews SET next_review_date = $1, stability = 6, difficulty = 5, reps = 4, state = 2, last_review = $2 WHERE word_id = $3`,
      [future, past(3), id]
    );
    await conn.execute(
      `INSERT OR REPLACE INTO srs_production (word_id, next_review_date, stability, difficulty, reps, lapses, state, last_review, scheduled_days)
       VALUES ($1, $2, 3, 5, 2, 0, 2, $3, 3)`,
      [id, past(1), past(4)]
    );
    const [word] = await db.getWordsByIds([id]);
    const res = await recorder.recordCardAnswer({
      card: cards.toCard(word, "production"),
      exerciseType: "spelling",
      rating: Rating.Good,
      wrongAttempts: 0,
      responseTimeMs: 4000,
      scheduled: true,
      countsForDailyGoal: true,
    });
    expect(res.scheduled).toBe(true);
    expect(res.result?.direction).toBe("production");
  });

  it("a practice answer stays practice and still counts toward the daily goal when the caller says so", async () => {
    const { db, recorder, cards, streak } = await services();
    const id = await db.insertEnrichedWord(input("queue"));
    const [word] = await db.getWordsByIds([id]);
    const res = await recorder.recordCardAnswer({
      card: cards.toCard(word, "recognition"),
      exerciseType: "multiple_choice",
      rating: Rating.Good,
      wrongAttempts: 0,
      responseTimeMs: 2000,
      scheduled: false,
      countsForDailyGoal: true,
    });
    expect(res.scheduled).toBe(false);
    expect(res.practiceReason).toBeNull();
    expect(answersToday(streak.getActivityLogs())).toBe(1);
  });
});
