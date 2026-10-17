import { describe, it, expect } from "vitest";
import { classifyKnownWords } from "@/services/knownWords";
import { freshServices, makeWord, DAY_MS } from "./helpers";

const NOW = Date.now();
const ago = (d: number) => new Date(NOW - d * DAY_MS).toISOString();

describe("words marked Đã biết", () => {
  it("waiting while only marked; confirmed or failed once checked; others are not listed", () => {
    const words = [
      makeWord("wait", { srs: { state: 2, reps: 1, lapses: 0, stability: 9, last_review: ago(2), next_review_date: ago(-7) } }),
      makeWord("ok", { srs: { state: 2, reps: 2, lapses: 0, stability: 25, last_review: ago(1), next_review_date: ago(-25) } }),
      makeWord("bad", { srs: { state: 3, reps: 2, lapses: 1, stability: 1, last_review: ago(1), next_review_date: ago(-1) } }),
      makeWord("normal", { srs: { state: 2, reps: 5, lapses: 0, stability: 10, last_review: ago(1), next_review_date: ago(-9) } }),
    ];
    const marks = new Map([
      ["ok", ago(12)],
      ["bad", ago(9)],
    ]);
    const byId = Object.fromEntries(classifyKnownWords(words, marks).map((e) => [e.word.id, e]));
    expect(byId.wait).toMatchObject({ status: "waiting", markedAt: ago(2) });
    expect(byId.ok).toMatchObject({ status: "confirmed", rememberedLong: true });
    expect(byId.bad).toMatchObject({ status: "failed" });
    expect(byId.normal).toBeUndefined();
  });

  it("checks soonest first among the waiting words", () => {
    const words = [
      makeWord("later", { srs: { state: 2, reps: 1, lapses: 0, stability: 9, last_review: ago(1), next_review_date: ago(-9) } }),
      makeWord("sooner", { srs: { state: 2, reps: 1, lapses: 0, stability: 4, last_review: ago(1), next_review_date: ago(-3) } }),
    ];
    expect(classifyKnownWords(words, new Map()).map((e) => e.word.id)).toEqual(["sooner", "later"]);
  });

  it("'Kiểm tra ngay' makes the check due now, and only for a word still only marked", async () => {
    const { db } = await freshServices();
    const recorder = await import("@/services/reviewRecorder");
    const known = await import("@/services/knownWords");
    const cards = await import("@/services/cards");
    const input = (word: string) => ({ word, meaning_vn: "nghĩa", synonyms: [], antonyms: [], examples: [{ sentence_en: `The ${word} works.`, grammar_analysis: "S + V" }] });
    const a = await db.insertEnrichedWord(input("cache"));
    const b = await db.insertEnrichedWord(input("queue"));
    expect(await recorder.markWordKnown(a)).toBe(true);
    const conn = await db.getDatabase();
    // b is a word being learned normally
    await conn.execute(`UPDATE srs_reviews SET state = 2, reps = 4, next_review_date = $1 WHERE word_id = $2`, [ago(-5), b]);

    const marks = await known.loadKnownMarks();
    expect(marks.has(a)).toBe(true);
    let [wa] = await db.getWordsByIds([a]);
    expect(cards.isWordDue(wa)).toBe(false);

    expect(await known.checkKnownNow([a, b])).toBe(1);
    [wa] = await db.getWordsByIds([a]);
    const [wb] = await db.getWordsByIds([b]);
    expect(cards.isWordDue(wa)).toBe(true);
    expect(cards.isWordDue(wb)).toBe(false);
  });
});

describe("Đã biết list: filters and pages", async () => {
  const { filterKnown, levelCounts, pageOf, pageButtons, levelOf } = await import("@/services/knownWords");
  const entry = (id: string, level: string | null, status: "waiting" | "confirmed" | "failed", extra: Record<string, unknown> = {}) => ({
    word: makeWord(id, { cefr_level: level, topic: "General Tech", meaning_vn: `nghĩa ${id}` }),
    status,
    markedAt: ago(10),
    checkAt: status === "waiting" ? ago(-5) : null,
    rememberedLong: false,
    ...extra,
  });
  const list = [
    entry("cat", "A1", "waiting", { checkAt: ago(-9) }),
    entry("dog", "A1", "waiting", { checkAt: ago(-2) }),
    entry("bird", "B1", "waiting"),
    entry("api", null, "waiting"),
    entry("tree", "A2", "confirmed", { rememberedLong: true }),
    entry("road", "A2", "confirmed"),
    entry("lamp", "B1", "failed"),
  ];
  const base = { view: "waiting" as const, level: "all", result: "all" as const, query: "", sort: "check" as const };

  it("by level, with a group for words without one", () => {
    expect(levelOf(list[3].word)).toBe("Khác");
    expect(levelCounts(list.filter((e) => e.status === "waiting"))).toEqual([
      { level: "A1", count: 2 },
      { level: "B1", count: 1 },
      { level: "Khác", count: 1 },
    ]);
    expect(filterKnown(list, { ...base, level: "A1" }).map((e) => e.word.id)).toEqual(["dog", "cat"]);
  });

  it("checked words by result, and search by word or meaning", () => {
    const checked = { ...base, view: "checked" as const };
    expect(filterKnown(list, { ...checked, result: "failed" }).map((e) => e.word.id)).toEqual(["lamp"]);
    expect(filterKnown(list, { ...checked, result: "remembered" }).map((e) => e.word.id)).toEqual(["tree"]);
    expect(filterKnown(list, { ...checked, result: "confirmed" })).toHaveLength(2);
    expect(filterKnown(list, { ...base, query: "nghĩa bird" }).map((e) => e.word.id)).toEqual(["bird"]);
  });

  it("orders by check date or A-Z", () => {
    expect(filterKnown(list, base).map((e) => e.word.id)).toEqual(["dog", "api", "bird", "cat"]);
    expect(filterKnown(list, { ...base, sort: "az" }).map((e) => e.word.id)).toEqual(["api", "bird", "cat", "dog"]);
  });

  it("pages, and the page buttons around the current one", () => {
    const items = Array.from({ length: 95 }, (_, i) => i);
    expect(pageOf(items, 2, 30)).toMatchObject({ page: 2, pages: 4, from: 31, to: 60 });
    expect(pageOf(items, 9, 30)).toMatchObject({ page: 4, from: 91, to: 95 });
    expect(pageOf([], 1, 30)).toMatchObject({ page: 1, pages: 1, from: 0, to: 0 });
    expect(pageButtons(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageButtons(1, 3)).toEqual([1, 2, 3]);
  });
});
