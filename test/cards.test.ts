import { describe, it, expect, afterEach, vi } from "vitest";
import { Rating, State } from "ts-fsrs";
import { directionForExercise, exerciseDirection, getDueCards, isValidEvidence, isWordDue, toCard, practiceCards } from "@/services/cards";
import { buildReviewSession, selectExerciseType, type ExerciseType } from "@/services/smartReview";
import { saveStudyLimits } from "@/services/srs";
import { freshServices, makeWord, reviewSrs, DAY_MS } from "./helpers";

afterEach(() => {
  vi.useRealTimers();
});

const RECOGNITION: ExerciseType[] = ["flip", "multiple_choice", "context_match", "meaning_match", "reverse_cloze", "listening"];
const PRODUCTION: ExerciseType[] = ["spelling", "cloze"];

describe("card helpers", () => {
  it("maps exercises to the memory they train", () => {
    for (const t of RECOGNITION) expect(directionForExercise(t)).toBe("recognition");
    for (const t of PRODUCTION) expect(directionForExercise(t)).toBe("production");
  });

  it("treats sentence building as practice only and rejects mismatched evidence", () => {
    expect(exerciseDirection("sentence_builder")).toBeNull();
    expect(isValidEvidence("sentence_builder", "recognition")).toBe(false);
    expect(isValidEvidence("spelling", "recognition")).toBe(false);
    expect(isValidEvidence("multiple_choice", "production")).toBe(false);
    expect(isValidEvidence("cloze", "production")).toBe(true);
  });

  it("keeps the recognition schedule on production cards", () => {
    const word = makeWord("cache", {
      srs: reviewSrs(10, 2),
      srsProduction: { ...(reviewSrs(4, 5) as never), word_id: "cache" },
    });
    const card = toCard(word, "production");
    expect(card.direction).toBe("production");
    expect(card.srs.stability).toBe(4);
    expect(card.srsRecognition.stability).toBe(10);
    // Converting the card again must not lose the recognition schedule
    expect(toCard(card, "recognition").srs.stability).toBe(10);
  });

  it("falls back to recognition when there is no production card", () => {
    expect(toCard(makeWord("new"), "production").direction).toBe("recognition");
    expect(practiceCards([makeWord("new")])[0].direction).toBe("recognition");
  });

  it("treats a word as due when either card is due", () => {
    const future = new Date(Date.now() + 3 * DAY_MS).toISOString();
    const word = makeWord("queue", {
      srs: { ...reviewSrs(10, 2), next_review_date: future },
      srsProduction: { ...(reviewSrs(2, 5) as never), word_id: "queue" },
    });
    expect(isWordDue(word)).toBe(true);
    expect(getDueCards(word).map((c) => c.direction)).toEqual(["production"]);
  });
});

describe("selectExerciseType by direction", () => {
  const withExample = { examples: [{ id: "e", word_id: "w", sentence_en: "We cache results daily.", grammar_analysis: "" }] };

  it("never asks a production card to only recognise the word", () => {
    const word = makeWord("w", { ...withExample, srs: reviewSrs(10, 2), srsProduction: { ...(reviewSrs(5, 2) as never), word_id: "w" } });
    const card = toCard(word, "production");
    for (let i = 0; i < 50; i++) expect(PRODUCTION).toContain(selectExerciseType(card));
  });

  it("keeps recognition cards on recognition exercises, even for leeches", () => {
    const card = toCard(makeWord("w", { ...withExample, srs: reviewSrs(1, 3, { lapses: 9 }) }), "recognition");
    for (let i = 0; i < 50; i++) expect(RECOGNITION).toContain(selectExerciseType(card));
  });
});

describe("buildReviewSession with two directions", () => {
  it("adds at most one card per word and shares one new-card budget between directions", async () => {
    await freshServices();
    saveStudyLimits({ newCardsPerDay: 3, maxSessionSize: 30 });
    const both = makeWord("both", { srs: reviewSrs(2, 10), srsProduction: { ...(reviewSrs(1, 10) as never), word_id: "both" } });
    const newRecall = makeWord("recall", {
      srs: { ...reviewSrs(30, 1), next_review_date: new Date(Date.now() + 20 * DAY_MS).toISOString() },
      srsProduction: { word_id: "recall", ease_factor: 2.5, interval: 0, repetitions: 0, state: 0, reps: 0, next_review_date: new Date(Date.now() - 1000).toISOString() },
    });
    const brandNew = makeWord("brand-new");

    // 3 a day, 1 already introduced: 2 left, one new word and one new recall card
    const session = buildReviewSession([both, newRecall, brandNew], { recognition: 1, production: 0 });
    expect(session.filter((c) => c.id === "both")).toHaveLength(1);
    expect(session.find((c) => c.id === "recall")?.direction).toBe("production");
    expect(session.some((c) => c.id === "brand-new")).toBe(true);

    // Only 1 left: the new word goes first, the new recall card waits
    const one = buildReviewSession([newRecall, brandNew], { recognition: 1, production: 1 });
    expect(one.map((c) => c.id)).toEqual(["brand-new"]);

    // Budget used up (by either direction): nothing new until tomorrow
    const later = buildReviewSession([newRecall], { recognition: 2, production: 1 });
    expect(later.some((c) => c.id === "recall")).toBe(false);
  });
});

describe("production cards in the database", () => {
  async function addWord(db: Awaited<ReturnType<typeof freshServices>>["db"], word: string) {
    return db.insertEnrichedWord({ word, meaning_vn: "nghĩa", synonyms: [], antonyms: [], examples: [] });
  }

  it("creates a recall card due tomorrow once recognition graduates", async () => {
    const { db, srs } = await freshServices();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));
    const id = await addWord(db, "sharding");

    await srs.recordReview(id, Rating.Easy); // straight to Review
    const [word] = await db.getAllWords();
    expect(word.srsProduction?.state).toBe(State.New);
    expect(new Date(word.srsProduction!.next_review_date).getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
  });

  it("waits for a recognition stability of 3 days before creating the recall card", async () => {
    const { db, srs } = await freshServices();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));
    const id = await addWord(db, "cache");

    // Learnt in one sitting (Good through the minute steps): graduated, but stability is under 3 days,
    // so no typing drill yet
    let last = await srs.recordReview(id, Rating.Good);
    for (let i = 0; i < 3 && last.state !== State.Review; i++) {
      vi.setSystemTime(new Date(Date.now() + 11 * 60 * 1000));
      last = await srs.recordReview(id, Rating.Good);
    }
    expect(last.state).toBe(State.Review);
    expect(last.stability).toBeLessThan(srs.PRODUCTION_UNLOCK_STABILITY_DAYS);
    let [word] = await db.getAllWords();
    expect(word.srsProduction ?? null).toBeNull();

    // Remembered again after a few days: now it is known, recall training starts
    vi.setSystemTime(new Date(Date.now() + 3 * DAY_MS));
    await srs.recordReview(id, Rating.Good);
    [word] = await db.getAllWords();
    expect(word.srsProduction?.state).toBe(State.New);
  });

  it("records production answers on the production card, falling back to recognition before it exists", async () => {
    const { db, srs } = await freshServices();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));
    const id = await addWord(db, "replica");

    const early = await srs.recordReview(id, Rating.Good, "production");
    expect(early.direction).toBe("recognition");

    await srs.recordReview(id, Rating.Easy);
    vi.setSystemTime(new Date(Date.now() + 2 * DAY_MS));
    const recall = await srs.recordReview(id, Rating.Good, "production");
    expect(recall.direction).toBe("production");

    const [word] = await db.getAllWords();
    expect(word.srsProduction?.reps).toBe(1);
  });

  it("lists words whose only due card is the production card", async () => {
    const { db } = await freshServices();
    const conn = await db.getDatabase();
    const id = await addWord(db, "latency");
    const future = new Date(Date.now() + 10 * DAY_MS).toISOString();
    await conn.execute(`UPDATE srs_reviews SET next_review_date = $1, state = 2, reps = 3, stability = 10 WHERE word_id = $2`, [future, id]);
    await conn.execute(`INSERT INTO srs_production (word_id, next_review_date, state) VALUES ($1, $2, 2)`, [id, new Date(Date.now() - 1000).toISOString()]);

    expect((await db.getDueWordsFromDb()).map((w) => w.id)).toEqual([id]);
    expect(await db.countDueWords()).toBe(1);
  });

  it("migration v4 seeds recall cards from known words at half stability, never due later", async () => {
    const { db } = await freshServices();
    const conn = await db.getDatabase();
    const known = await addWord(db, "throughput");
    const learning = await addWord(db, "mutex");
    const due = new Date(Date.now() + 8 * DAY_MS).toISOString();
    const last = new Date(Date.now() - 2 * DAY_MS).toISOString();
    await conn.execute(
      `UPDATE srs_reviews SET state = 2, stability = 10, scheduled_days = 10, reps = 4, last_review = $1, next_review_date = $2 WHERE word_id = $3`,
      [last, due, known]
    );
    await conn.execute(`UPDATE srs_reviews SET state = 1, stability = 1 WHERE word_id = $1`, [learning]);
    await conn.execute(`DELETE FROM srs_production`);

    // Re-run migrations from version 3
    await conn.execute(`PRAGMA user_version = 3`);
    await db.initSchema(conn);

    const rows = await conn.select<{ word_id: string; stability: number; next_review_date: string; state: number }[]>(
      `SELECT word_id, stability, next_review_date, state FROM srs_production`
    );
    expect(rows.map((r) => r.word_id)).toEqual([known]);
    expect(rows[0].stability).toBe(5);
    expect(rows[0].state).toBe(2);
    expect(new Date(rows[0].next_review_date).getTime()).toBeLessThanOrEqual(new Date(due).getTime());
    // last review + half of the 10-day interval
    expect(new Date(rows[0].next_review_date).getTime()).toBeCloseTo(new Date(last).getTime() + 5 * DAY_MS, -4);
  });
});
