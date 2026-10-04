import { describe, it, expect, afterEach, vi } from "vitest";
import { freshServices, DAY_MS } from "./helpers";

afterEach(() => {
  vi.useRealTimers();
});

async function addWord(db: Awaited<ReturnType<typeof freshServices>>["db"], word: string) {
  return db.insertEnrichedWord({
    word,
    meaning_vn: "nghĩa của " + word,
    synonyms: [],
    antonyms: [],
    examples: [{ sentence_en: `We use ${word} daily.`, grammar_analysis: "S + V" }],
  });
}

describe("recordReview (FSRS persisted in SQLite)", () => {
  it("graduates a new card to Review after Good presses, persisting learning_steps", async () => {
    const { db, srs } = await freshServices();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));
    const id = await addWord(db, "latency");

    const first = await srs.recordReview(id, srs.Rating.Good);
    expect(first.state).toBe(srs.State.Learning);
    expect(first.learningSteps).toBe(1);

    const [row] = (await db.getAllWords()).filter((w) => w.id === id);
    expect(row.srs.learning_steps).toBe(1);

    // Come back when the 10-minute step is due
    vi.setSystemTime(new Date(new Date(first.nextReviewDate).getTime() + 1000));
    const second = await srs.recordReview(id, srs.Rating.Good);
    expect(second.state).toBe(srs.State.Review);
    expect(second.scheduled_days).toBeGreaterThanOrEqual(1);
  });

  it("only counts a lapse when a Review card is forgotten", async () => {
    const { db, srs } = await freshServices();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));
    const id = await addWord(db, "throughput");

    // Failing repeatedly while learning is not a lapse
    await srs.recordReview(id, srs.Rating.Again);
    const learningAgain = await srs.recordReview(id, srs.Rating.Again);
    expect(learningAgain.lapses).toBe(0);

    // Graduate, then forget once in Review
    await srs.recordReview(id, srs.Rating.Easy);
    vi.setSystemTime(new Date(Date.now() + 30 * DAY_MS));
    const forgotten = await srs.recordReview(id, srs.Rating.Again);
    expect(forgotten.state).toBe(srs.State.Relearning);
    expect(forgotten.lapses).toBe(1);
  });

  it("reports retrievability close to the requested retention on the due date", async () => {
    const { db, srs } = await freshServices();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));
    const id = await addWord(db, "idempotent");
    await srs.recordReview(id, srs.Rating.Easy);

    const [row] = (await db.getAllWords()).filter((w) => w.id === id);
    const r = srs.getCardRetrievability(row.srs, new Date(row.srs.next_review_date));
    // Fuzz moves the due date slightly, so allow a small band around 0.9
    expect(r).toBeGreaterThan(0.85);
    expect(r).toBeLessThan(0.95);
  });
});

describe("interval previews", () => {
  it("match the interval the card actually gets when graded seconds later", async () => {
    const { db, srs } = await freshServices();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));
    const id = await addWord(db, "rollback");
    await srs.recordReview(id, srs.Rating.Easy);
    vi.setSystemTime(new Date("2026-10-20T08:00:00Z"));

    const [word] = await db.getAllWords();
    const preview = srs.getFSRSScheduler().repeat(srs.srsRowToCard(word.srs), new Date())[srs.Rating.Good].card;
    vi.setSystemTime(new Date(Date.now() + 4000)); // user reads the buttons, then presses Good
    const graded = await srs.recordReview(id, srs.Rating.Good);
    expect(graded.scheduled_days).toBe(preview.scheduled_days);
  });
});

describe("study limits", () => {
  it("falls back to defaults and persists overrides", async () => {
    const { srs } = await freshServices();
    expect(srs.getStudyLimits()).toEqual(srs.DEFAULT_STUDY_LIMITS);
    srs.saveStudyLimits({ newCardsPerDay: 5 });
    expect(srs.getStudyLimits()).toEqual({ ...srs.DEFAULT_STUDY_LIMITS, newCardsPerDay: 5 });
  });
});
