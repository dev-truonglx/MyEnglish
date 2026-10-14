import { describe, it, expect } from "vitest";
import { Rating } from "ts-fsrs";
import type { CatalogEntry, StudyLevel } from "@/services/vocabCatalog";
import { freshServices } from "./helpers";

function entry(word: string, cefr: StudyLevel, order: number): CatalogEntry {
  return {
    id: word, word, cefr, list: 3000, order, freq: order, it: false, pos: "noun", vn: `nghĩa của ${word}`,
    senses: [{ pos: "noun", vn: `nghĩa của ${word}` }], ipaUs: [`/${word}/`], ipaUk: [`/${word}/`], variants: [], irregular: [],
    examples: [
      { en: `I see the ${word} here.`, vi: "Tôi thấy nó ở đây.", focus: [word] },
      { en: `The ${word} is new.`, vi: "Nó mới.", focus: [word] },
    ],
  };
}
const DECK = Array.from({ length: 30 }, (_, i) => entry(`word${i}`, "A1", i + 1));

async function setup() {
  const services = await freshServices();
  const catalog = await import("@/services/vocabCatalog");
  await catalog.ensureCatalogSeeded(async () => ({ version: catalog.CATALOG_VERSION, words: DECK }));
  const feed = await import("@/services/vocabFeed");
  return { ...services, catalog, feed };
}

const toInput = (e: CatalogEntry, at: string) => ({
  catalogId: e.id, word: e.word, phonetic: null, partOfSpeech: "noun", meaningVn: e.vn, cefr: e.cefr, variants: [], forms: [],
  examples: e.examples, createdAt: at,
});

describe("two windows topping up at once", () => {
  it("creates each word once and gives cards and examples only to the rows that exist", async () => {
    const { db } = await setup();
    const items = DECK.slice(0, 12).map((e) => toInput(e, new Date().toISOString()));
    const [a, b] = await Promise.all([db.insertCatalogWordsReport(items), db.insertCatalogWordsReport(items)]);
    expect(a.created.length + b.created.length).toBe(12);
    const conn = await db.getDatabase();
    const count = async (sql: string) => Number((await conn.select<Array<{ n: number }>>(sql))[0].n);
    expect(await count(`SELECT COUNT(*) AS n FROM words`)).toBe(12);
    expect(await count(`SELECT COUNT(*) AS n FROM srs_reviews`)).toBe(12);
    expect(await count(`SELECT COUNT(*) AS n FROM examples`)).toBe(24);
    expect(await count(`SELECT COUNT(*) AS n FROM examples WHERE word_id NOT IN (SELECT id FROM words)`)).toBe(0);
    // Both calls report the real ids
    expect([...a.ids.entries()].sort()).toEqual([...b.ids.entries()].sort());
  });
});

describe("deck loading", () => {
  it("does not cache a deck that is still being copied, and skips corrupt rows", async () => {
    const { db, catalog } = await setup();
    const conn = await db.getDatabase();
    await conn.execute(`UPDATE vocab_catalog_meta SET value = '0' WHERE key = 'version'`);
    await catalog.loadCatalogMeanings();
    await conn.execute(`UPDATE vocab_catalog_meta SET value = $1 WHERE key = 'version'`, [String(catalog.CATALOG_VERSION)]);
    await conn.execute(`UPDATE vocab_catalog SET data = '{broken' WHERE id = 'word3'`);
    // Retried (not cached) and the corrupt row is left out instead of throwing
    expect(await catalog.loadCatalogMeanings()).toBe(30);
    expect((await catalog.getCatalogEntries(["word2", "word3", "word4"])).map((e) => e.id)).toEqual(["word2", "word4"]);
    expect((await catalog.findCatalogWord("WORD5")).map((e) => e.id)).toEqual(["word5"]);
  });
});

describe("bulk Đã biết", () => {
  it("marks every word with one change notification and one log each", async () => {
    const { db, feed } = await setup();
    feed.setStudyLevels(["A1"]);
    const events: string[] = [];
    window.addEventListener("words-changed", () => events.push("changed"));
    expect(await feed.markCatalogWordsKnown(DECK.slice(0, 20).map((e) => e.id))).toBe(20);
    expect(events).toHaveLength(1);
    const conn = await db.getDatabase();
    const logs = await conn.select<Array<{ n: number }>>(`SELECT COUNT(*) AS n FROM review_logs WHERE exercise_type = 'known'`);
    expect(Number(logs[0].n)).toBe(20);
    const srs = await conn.select<Array<{ n: number }>>(`SELECT COUNT(*) AS n FROM srs_reviews WHERE state = 2 AND reps = 1`);
    expect(Number(srs[0].n)).toBe(20);
    // A second time: already studied, left alone
    expect(await feed.markCatalogWordsKnown(DECK.slice(0, 5).map((e) => e.id))).toBe(0);
  });
});

describe("a bigger top-up asked while one runs", () => {
  it("runs again for the larger target", async () => {
    const { feed } = await setup();
    feed.setStudyLevels(["A1"]);
    const small = feed.topUpNewWords({ target: 3 });
    const big = feed.topUpNewWords({ target: 12 });
    await Promise.all([small, big]);
    expect(await feed.countWaitingWords()).toBe(12);
  });
});

describe("restoring a backup", () => {
  it("replaces an untouched buffer word with the backed-up progress, and keeps a studied one", async () => {
    const first = await setup();
    first.feed.setStudyLevels(["A1"]);
    await first.db.insertCatalogWords(DECK.slice(0, 4).map((e) => toInput(e, new Date().toISOString())));
    const srs = await import("@/services/srs");
    const conn1 = await first.db.getDatabase();
    const rows1 = await conn1.select<Array<{ id: string; catalog_id: string }>>(`SELECT id, catalog_id FROM words`);
    const idOf1 = (c: string) => rows1.find((r) => r.catalog_id === c)!.id;
    await srs.recordReview(idOf1("word0"), Rating.Good);
    await srs.recordReview(idOf1("word1"), Rating.Good);
    const exp = await import("@/services/dataExport");
    const backup = await exp.buildBackup();
    expect(backup.tables.grammar_exercise_imports).toBeDefined();

    // A new machine: its own buffer holds word0 (untouched) and word1 (studied there with its own progress)
    const second = await setup();
    await second.db.insertCatalogWords(DECK.slice(0, 4).map((e) => toInput(e, new Date().toISOString())));
    const conn2 = await second.db.getDatabase();
    const rows2 = await conn2.select<Array<{ id: string; catalog_id: string }>>(`SELECT id, catalog_id FROM words`);
    const idOf2 = (c: string) => rows2.find((r) => r.catalog_id === c)!.id;
    const srs2 = await import("@/services/srs");
    await srs2.recordReview(idOf2("word1"), Rating.Again);
    const exp2 = await import("@/services/dataExport");
    const report = await exp2.importBackup(exp2.parseBackup(JSON.stringify(backup)));
    expect(report.replacedUntouchedWords).toBe(1); // word0
    expect(report.skippedExistingWords).toBe(3); // word1 (studied here), word2, word3 (no progress in the backup)
    const state = async (c: string) =>
      (await conn2.select<Array<{ reps: number }>>(`SELECT s.reps FROM srs_reviews s JOIN words w ON w.id = s.word_id WHERE w.catalog_id = $1`, [c]))[0]?.reps;
    expect(await state("word0")).toBe(1);
    expect(await state("word1")).toBe(1);
    const words = await conn2.select<Array<{ n: number }>>(`SELECT COUNT(*) AS n FROM words`);
    expect(Number(words[0].n)).toBe(4);
  });
});

describe("stored values that are not what was written", () => {
  it("do not break the activity log, achievements or mnemonics", async () => {
    await freshServices();
    localStorage.setItem("myenglish_study_logs_v1", "null");
    localStorage.setItem("myenglish_mnemonics_v1", "null");
    localStorage.setItem("myenglish_achievements_v1", "null");
    const streak = await import("@/services/streak");
    expect(streak.getActivityLogs()).toEqual({});
    expect(() => streak.calculateStreakAndGoal([])).not.toThrow();
    const mn = await import("@/services/aiMnemonic");
    expect(mn.getStoredMnemonic("x")).toBeNull();
    const ach = await import("@/services/achievements");
    expect(() => ach.checkAndUnlockAchievements({})).not.toThrow();
  });
});

describe("pronunciation quiz retakes", () => {
  it("count toward the daily goal only the first time per lesson per day", async () => {
    await freshServices();
    const streak = await import("@/services/streak");
    const pron = await import("@/services/pronunciation");
    pron.recordPronunciationQuiz("p1", 6, 8);
    pron.recordPronunciationQuiz("p1", 7, 8);
    pron.recordPronunciationQuiz("p1", 8, 8);
    expect(streak.getActivityLogs()[streak.getLocalDateString()]).toBe(8);
    pron.recordPronunciationQuiz("p2", 5, 8);
    expect(streak.getActivityLogs()[streak.getLocalDateString()]).toBe(16);
  });
});

describe("writing feedback without a score", () => {
  it("is rejected instead of shown as 0/100", async () => {
    const { parseWritingFeedback } = await import("@/services/ai");
    expect(() => parseWritingFeedback(JSON.stringify({ corrections: [] }))).toThrow();
    expect(parseWritingFeedback(JSON.stringify({ score: 0, corrections: [] })).score).toBe(0);
  });
});
