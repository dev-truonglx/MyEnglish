import { describe, it, expect, vi } from "vitest";
import { freshServices } from "./helpers";

const input = (word: string) => ({
  word,
  meaning_vn: "nghĩa",
  synonyms: [],
  antonyms: [],
  examples: [{ sentence_en: `The ${word} works.`, grammar_analysis: "S + V" }],
});

describe("getWordsLite", () => {
  it("returns words with both schedules but no examples; studiedOnly keeps answered words", async () => {
    const { db } = await freshServices();
    const conn = await db.getDatabase();
    const a = await db.insertEnrichedWord(input("cache"));
    await db.insertEnrichedWord(input("queue"));
    await conn.execute(`UPDATE srs_reviews SET reps = 2, state = 2, stability = 4 WHERE word_id = $1`, [a]);

    const all = await db.getWordsLite();
    expect(all.map((w) => w.word).sort()).toEqual(["cache", "queue"]);
    expect(all.every((w) => w.examples.length === 0)).toBe(true);
    expect(all.find((w) => w.id === a)?.srs.stability).toBe(4);

    const studied = await db.getWordsLite({ studiedOnly: true });
    expect(studied.map((w) => w.word)).toEqual(["cache"]);
    // The full loader still has the examples
    const [full] = await db.getWordsByIds([a]);
    expect(full.examples).toHaveLength(1);
  });
});

describe("start-up repair and indexes", () => {
  it("runs the intro repair once and creates the v15 indexes", async () => {
    const { db } = await freshServices();
    const conn = await db.getDatabase();
    const flag = await conn.select<{ value: string }[]>(`SELECT value FROM app_kv WHERE key = 'repair_intro_last_review_v1'`);
    expect(flag).toHaveLength(1);
    const names = (await conn.select<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type = 'index'`)).map(
      (r) => r.name
    );
    for (const idx of [
      "idx_review_logs_type_time",
      "idx_review_logs_word_stats",
      "idx_learning_events_at",
      "idx_srs_reviews_last_review",
      "idx_srs_production_last_review",
    ]) {
      expect(names).toContain(idx);
    }
  });
});

describe("persistKeyNow", () => {
  it("batches writes and stores the latest value", async () => {
    vi.resetModules();
    const db = await import("@/services/db");
    const backup = await import("@/services/storageBackup");
    const conn = await db.getDatabase();
    localStorage.setItem("myenglish_test_a", "1");
    backup.persistKeyNow("myenglish_test_a");
    localStorage.setItem("myenglish_test_a", "2");
    localStorage.setItem("myenglish_test_b", "x");
    backup.persistKeyNow("myenglish_test_a");
    backup.persistKeyNow("myenglish_test_b");
    // Nothing written yet: the write waits for the batch
    expect(await conn.select(`SELECT key FROM app_kv WHERE key LIKE 'myenglish_test_%'`)).toHaveLength(0);
    await backup.flushPersistedKeys();
    const rows = await conn.select<{ key: string; value: string }[]>(
      `SELECT key, value FROM app_kv WHERE key LIKE 'myenglish_test_%' ORDER BY key`
    );
    expect(rows).toEqual([
      { key: "myenglish_test_a", value: "2" },
      { key: "myenglish_test_b", value: "x" },
    ]);
  });

  it("skips a key removed before the batch is written", async () => {
    vi.resetModules();
    const db = await import("@/services/db");
    const backup = await import("@/services/storageBackup");
    const conn = await db.getDatabase();
    localStorage.setItem("myenglish_test_gone", "1");
    backup.persistKeyNow("myenglish_test_gone");
    localStorage.removeItem("myenglish_test_gone");
    await backup.flushPersistedKeys();
    expect(await conn.select(`SELECT key FROM app_kv WHERE key = 'myenglish_test_gone'`)).toHaveLength(0);
  });
});

describe("ensureGrammarBookSeeded", () => {
  it("does not bring back a book the learner cleared; a reset reseeds it", async () => {
    vi.resetModules();
    const db = await import("@/services/db");
    await db.getDatabase();
    const book = await import("@/services/grammarBook");
    await book.ensureGrammarBookSeeded();
    expect(await book.getAllBookChapters()).toHaveLength(31);

    await book.clearGrammarBook();
    await book.ensureGrammarBookSeeded();
    expect(await book.getAllBookChapters()).toHaveLength(0);

    await book.ensureGrammarBookSeeded({ reseed: true });
    expect(await book.getAllBookChapters()).toHaveLength(31);
  });
});
