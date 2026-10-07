import { describe, it, expect } from "vitest";
import { Rating } from "ts-fsrs";
import { crossedMastery } from "@/services/reviewRecorder";
import { celebrationFor } from "@/services/celebrations";
import { answersByHour, habitAdvice, masteredPerWeek, reminderFunnel } from "@/services/habits";
import type { LearningEvent } from "@/services/learningEvents";
import type { FSRSResult } from "@/services/srs";
import { freshServices, DAY_MS } from "./helpers";

const result = (stability: number, state = 2): FSRSResult =>
  ({ direction: "recognition", stability, state, difficulty: 5, reps: 4, lapses: 0, nextReviewDate: "", scheduled_days: 0 } as unknown as FSRSResult);

describe("milestones", () => {
  it("a card reaches long-term memory when its stability crosses 21 days", () => {
    expect(crossedMastery(12, result(25))).toBe(true);
    expect(crossedMastery(25, result(40))).toBe(false); // already mastered
    expect(crossedMastery(12, result(18))).toBe(false);
    expect(crossedMastery(12, result(25, 3))).toBe(false); // relearning, not mastered
    expect(crossedMastery(12, null)).toBe(false);
  });

  it("praises long-term memory and just-in-time recall, nothing else", () => {
    expect(celebrationFor({ mastered: true, rescued: true, direction: "recognition", word: "cache" })?.kind).toBe("mastered");
    expect(celebrationFor({ mastered: false, rescued: true, direction: "recognition", word: "cache" })?.kind).toBe("rescued");
    expect(celebrationFor({ mastered: true, rescued: false, direction: "production", word: "cache" })?.title).toContain("tự nhớ ra");
    expect(celebrationFor({ mastered: false, rescued: false, direction: "recognition", word: "cache" })).toBeNull();
  });

  it("recordCardAnswer logs a mastered event and flags a rescued review", async () => {
    const { db } = await freshServices();
    const recorder = await import("@/services/reviewRecorder");
    const cards = await import("@/services/cards");
    const events = await import("@/services/learningEvents");
    const conn = await db.getDatabase();
    const id = await db.insertEnrichedWord({ word: "cache", meaning_vn: "bộ nhớ đệm", synonyms: [], antonyms: [], examples: [] });
    // Stability 15 days, last seen 80 days ago (R well below 0.8): a Good now crosses 21 days
    await conn.execute(
      `UPDATE srs_reviews SET stability = 15, difficulty = 4, reps = 5, state = 2, last_review = $1, next_review_date = $2, scheduled_days = 15 WHERE word_id = $3`,
      [new Date(Date.now() - 80 * DAY_MS).toISOString(), new Date(Date.now() - 65 * DAY_MS).toISOString(), id]
    );
    const [word] = await db.getWordsByIds([id]);
    const res = await recorder.recordCardAnswer({
      card: cards.toCard(word, "recognition"),
      exerciseType: "multiple_choice",
      rating: Rating.Good,
      wrongAttempts: 0,
      responseTimeMs: 3000,
      scheduled: true,
      countsForDailyGoal: true,
    });
    expect(res.rescued).toBe(true);
    expect(res.result!.stability).toBeGreaterThanOrEqual(21);
    expect(res.mastered).toBe(true);
    const logged = await events.getLearningEventsSince(new Date(Date.now() - DAY_MS), ["mastered"]);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ wordId: id, direction: "recognition" });
  });
});

describe("habits", () => {
  const at = (d: Date) => d.toISOString();
  const ev = (type: LearningEvent["type"], d: Date, direction: LearningEvent["direction"] = null): LearningEvent => ({ type, at: at(d), direction });

  it("counts words reaching long-term memory per week (recognition only)", () => {
    const now = new Date(2026, 9, 7, 12); // Wednesday
    const weeks = masteredPerWeek(
      [
        ev("mastered", new Date(2026, 9, 6), "recognition"),
        ev("mastered", new Date(2026, 9, 6), "production"),
        ev("mastered", new Date(2026, 8, 30), "recognition"),
        ev("mastered", new Date(2026, 6, 1), "recognition"), // outside the window
      ],
      4,
      now
    );
    expect(weeks.map((w) => w.count)).toEqual([0, 0, 1, 1]);
    expect(weeks[3].weekStart).toBe("2026-10-05");
  });

  it("measures reminder response and suggests better hours", () => {
    const events: LearningEvent[] = [];
    for (let i = 0; i < 6; i++) events.push(ev("nudge_shown", new Date(2026, 9, i + 1, 9)), ev("nudge_opened", new Date(2026, 9, i + 1, 9)));
    for (let i = 0; i < 10; i++) events.push(ev("nudge_shown", new Date(2026, 9, i + 1, 15)), ev("nudge_ignored", new Date(2026, 9, i + 1, 15)));
    const f = reminderFunnel(events);
    expect(f.shown).toBe(16);
    expect(f.opened).toBe(6);
    expect(f.bestHours[0]).toBe(9);
    expect(habitAdvice(f, answersByHour([at(new Date(2026, 9, 1, 9))]))).toContain("9h");
  });

  it("buckets answers by local hour", () => {
    const hours = answersByHour([at(new Date(2026, 9, 1, 9, 5)), at(new Date(2026, 9, 2, 9, 50)), at(new Date(2026, 9, 2, 21))]);
    expect(hours[9]).toBe(2);
    expect(hours[21]).toBe(1);
  });
});
