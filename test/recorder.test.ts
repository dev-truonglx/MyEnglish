import { describe, it, expect, vi } from "vitest";
import { Rating } from "ts-fsrs";
import { freshServices, makeWord, reviewSrs, DAY_MS } from "./helpers";
import { buildTrainingItems } from "@/services/fsrsOptimizer";
import { bucketForecast, computeCalibration, computeRetention, type ProgressLog } from "@/services/progress";

const input = (word: string, extra: Record<string, unknown> = {}) => ({
  word,
  meaning_vn: "nghĩa của " + word,
  synonyms: [],
  antonyms: [],
  examples: [{ sentence_en: `The ${word} works.`, grammar_analysis: "S + V" }],
  ...extra,
});

async function services() {
  const base = await freshServices();
  const recorder = await import("@/services/reviewRecorder");
  const cards = await import("@/services/cards");
  return { ...base, recorder, cards };
}

describe("recordCardAnswer", () => {
  it("logs the memory state before the answer and credits recognition from a correct recall", async () => {
    const { db, recorder, cards } = await services();
    const conn = await db.getDatabase();
    const id = await db.insertEnrichedWord(input("cache"));
    const past = (d: number) => new Date(Date.now() - d * DAY_MS).toISOString();
    // Both cards in Review and due
    for (const table of ["srs_reviews", "srs_production"]) {
      await conn.execute(
        `INSERT OR REPLACE INTO ${table} (word_id, next_review_date, stability, difficulty, reps, lapses, state, last_review, scheduled_days)
         VALUES ($1, $2, 4, 5, 3, 0, 2, $3, 4)`,
        [id, past(1), past(5)]
      );
    }
    const [word] = await db.getWordsByIds([id]);
    const card = cards.toCard(word, "production");
    const res = await recorder.recordCardAnswer({
      card,
      exerciseType: "spelling",
      rating: Rating.Good,
      wrongAttempts: 0,
      responseTimeMs: 4000,
      scheduled: true,
      countsForDailyGoal: true,
    });
    expect(res.result?.direction).toBe("production");
    expect(res.implicit).not.toBeNull();

    const logs = await conn.select<Array<{ is_scheduled: number; direction: string; state_before: number; r_predicted: number; elapsed_days_before: number }>>(
      `SELECT is_scheduled, direction, state_before, r_predicted, elapsed_days_before FROM review_logs WHERE word_id = $1 ORDER BY is_scheduled`,
      [id]
    );
    expect(logs.map((l) => [l.is_scheduled, l.direction])).toEqual([
      [1, "production"],
      [2, "recognition"],
    ]);
    expect(logs[0].state_before).toBe(2);
    expect(logs[0].r_predicted).toBeGreaterThan(0.5);
    expect(logs[0].elapsed_days_before).toBeCloseTo(5, 0);
    // Recognition is no longer due (credited)
    const [after] = await db.getWordsByIds([id]);
    expect(new Date(after.srs.next_review_date).getTime()).toBeGreaterThan(Date.now());
  });

  it("suspends a word that becomes a leech when the leech action is suspend", async () => {
    const { db, recorder, cards, smart } = await services();
    smart.saveLeechSettings({ threshold: 2, action: "suspend", enabled: true });
    const conn = await db.getDatabase();
    const id = await db.insertEnrichedWord(input("mutex"));
    await conn.execute(
      `UPDATE srs_reviews SET next_review_date = $1, stability = 3, difficulty = 7, reps = 6, lapses = 1, state = 2, last_review = $2 WHERE word_id = $3`,
      [new Date(Date.now() - DAY_MS).toISOString(), new Date(Date.now() - 4 * DAY_MS).toISOString(), id]
    );
    const [word] = await db.getWordsByIds([id]);
    const res = await recorder.recordCardAnswer({
      card: cards.toCard(word, "recognition"),
      exerciseType: "multiple_choice",
      rating: Rating.Again,
      wrongAttempts: 1,
      responseTimeMs: 5000,
      scheduled: true,
      countsForDailyGoal: true,
    });
    expect(res.becameLeech).toBe(true);
    expect(res.suspended).toBe(true);
    expect((await db.getDueWordsFromDb()).map((w) => w.id)).not.toContain(id);
  });

  it("an introduction consumes the new-word budget; a quiz too soon postpones the card, still new", async () => {
    const { db, recorder, cards, smart } = await services();
    const id = await db.insertEnrichedWord(input("queue"));
    const [word] = await db.getWordsByIds([id]);
    const card = cards.toCard(word, "recognition");
    await recorder.recordIntro(card);
    expect((await smart.getNewCardsIntroducedToday()).recognition).toBe(1);
    expect((await recorder.getRecentIntros()).has(`${id}:recognition`)).toBe(true);

    await recorder.postponeNewCard(id, "recognition", 10);
    const [after] = await db.getWordsByIds([id]);
    expect(after.srs.state).toBe(0);
    expect(new Date(after.srs.next_review_date).getTime()).toBeGreaterThan(Date.now() + 9 * 60000);
  });
});

describe("due counts", () => {
  it("separates due reviews from new words waiting", async () => {
    const { db } = await freshServices();
    const conn = await db.getDatabase();
    const a = await db.insertEnrichedWord(input("alpha"));
    await db.insertEnrichedWord(input("beta"));
    await db.insertEnrichedWord(input("gamma"));
    await conn.execute(`UPDATE srs_reviews SET reps = 3, state = 2, next_review_date = $1 WHERE word_id = $2`, [
      new Date(Date.now() - 1000).toISOString(),
      a,
    ]);
    expect(await db.countDueCards()).toEqual({ reviews: 1, newWaiting: 2, newRecallWaiting: 0 });
  });
});

describe("pipeline", () => {
  it("refuses terms the AI step would reject, without leaving a placeholder", async () => {
    const { db } = await freshServices();
    const { pipeline } = await import("@/services/pipeline");
    const res = await pipeline.enqueue("what?, a; b");
    expect(res.accepted).toBe(false);
    expect(await db.getAllWords()).toHaveLength(0);
  });

  it("keeps the learner's context sentence as an example", async () => {
    const { db } = await freshServices();
    const { pipeline } = await import("@/services/pipeline");
    const res = await pipeline.enqueue("idempotent", { context: "Our retry handler must be idempotent to be safe." });
    expect(res.accepted).toBe(true);
    await vi.waitFor(async () => {
      const [w] = await db.getAllWords();
      expect(w.examples.some((e) => e.source === "user_context")).toBe(true);
    });
  });
});

describe("migrations", () => {
  it("upgrades a v6 database to the latest version", async () => {
    const { db } = await freshServices();
    const conn = await db.getDatabase();
    await conn.execute(`ALTER TABLE review_logs DROP COLUMN r_predicted;`);
    await conn.execute(`ALTER TABLE words DROP COLUMN suspended;`);
    await conn.execute(`PRAGMA user_version = 6;`);
    await db.initSchema(conn);
    const cols = (await conn.select<{ name: string }[]>(`PRAGMA table_info(review_logs);`)).map((c) => c.name);
    expect(cols).toContain("r_predicted");
    const wordCols = (await conn.select<{ name: string }[]>(`PRAGMA table_info(words);`)).map((c) => c.name);
    expect(wordCols).toContain("suspended");
    const [{ user_version }] = await conn.select<{ user_version: number }[]>(`PRAGMA user_version;`);
    expect(user_version).toBe(10);
    const tables = (await conn.select<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type = 'table';`)).map((t) => t.name);
    expect(tables).toContain("learning_events");
    expect(tables).toContain("mistakes");
    expect(tables).toContain("vocab_catalog");
    expect(wordCols).toEqual(expect.arrayContaining(["catalog_id", "variants", "forms"]));
  });
});

describe("backup", () => {
  it("round-trips words, schedules and logs without overwriting existing words", async () => {
    const { db } = await freshServices();
    const exp = await import("@/services/dataExport");
    await db.insertEnrichedWord(input("cache"));
    await db.insertEnrichedWord(input("queue"));
    const backup = await exp.buildBackup();
    expect(backup.tables.words).toHaveLength(2);

    const fresh = await freshServices();
    const exp2 = await import("@/services/dataExport");
    await fresh.db.insertEnrichedWord(input("cache"));
    const report = await exp2.importBackup(exp2.parseBackup(JSON.stringify(backup)));
    expect(report.skippedExistingWords).toBe(1);
    expect(report.inserted.words).toBe(1);
    expect((await fresh.db.getAllWords()).map((w) => w.word).sort()).toEqual(["cache", "queue"]);
  });
});

describe("measurement", () => {
  const log = (p: Partial<ProgressLog>): ProgressLog => ({ wordId: "w", rating: 3, isScheduled: true, timestamp: new Date().toISOString(), stateBefore: 2, ...p });

  it("true retention counts only scheduled answers to Review-state cards", () => {
    const logs = [
      log({ rating: 3 }),
      log({ rating: 1 }),
      log({ rating: 3, stateBefore: 0 }), // new card: excluded
      log({ rating: 1, isScheduled: false }), // practice: excluded
      log({ rating: 2, direction: "production" }),
    ];
    const r = computeRetention(logs, 0.9);
    expect(r.count).toBe(3);
    expect(r.trueRetention).toBeCloseTo(2 / 3);
    expect(r.production).toEqual({ retention: 1, count: 1 });
  });

  it("groups predicted vs actual recall", () => {
    const bins = computeCalibration([log({ rPredicted: 0.91, rating: 3 }), log({ rPredicted: 0.92, rating: 1 }), log({ rPredicted: 0.5, rating: 1 })]);
    const b90 = bins.find((b) => b.from === 0.9)!;
    expect(b90.count).toBe(2);
    expect(b90.actual).toBe(0.5);
    expect(bins.find((b) => b.from === 0)!.actual).toBe(0);
  });

  it("buckets the forecast by local day, overdue counted today", () => {
    const now = new Date(2026, 9, 7, 12, 0, 0);
    const days = bucketForecast(
      [new Date(2026, 9, 1).toISOString(), new Date(2026, 9, 7, 20).toISOString(), new Date(2026, 9, 9, 8).toISOString()],
      7,
      now
    );
    expect(days[0].reviews).toBe(2);
    expect(days[2].reviews).toBe(1);
  });

  it("builds optimizer histories per card with day gaps, dropping single reviews", () => {
    const t = (d: number, h = 9) => new Date(2026, 9, d, h).toISOString();
    const items = buildTrainingItems([
      { word_id: "a", direction: "recognition", rating: 3, timestamp: t(1) },
      { word_id: "a", direction: "recognition", rating: 3, timestamp: t(1, 18) },
      { word_id: "a", direction: "recognition", rating: 1, timestamp: t(4) },
      { word_id: "a", direction: "production", rating: 3, timestamp: t(2) },
      { word_id: "b", direction: null, rating: 3, timestamp: t(1) },
      { word_id: "b", direction: null, rating: 2, timestamp: t(3) },
    ]);
    expect(items).toEqual([
      { reviews: [{ rating: 3, deltaT: 0 }, { rating: 3, deltaT: 0 }, { rating: 1, deltaT: 3 }] },
      { reviews: [{ rating: 3, deltaT: 0 }, { rating: 2, deltaT: 2 }] },
    ]);
  });
});

void reviewSrs;
void makeWord;
