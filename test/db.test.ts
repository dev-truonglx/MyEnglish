import { describe, it, expect } from "vitest";
import { freshServices } from "./helpers";

const input = (word: string, meaning = "nghĩa") => ({
  word,
  meaning_vn: meaning,
  synonyms: [],
  antonyms: [],
  examples: [{ sentence_en: `The ${word} works.`, grammar_analysis: "S + V" }],
});

describe("schema migrations", () => {
  it("runs to the latest version with the FSRS and logging columns", async () => {
    const { db } = await freshServices();
    const conn = await db.getDatabase();
    const [{ user_version }] = await conn.select<{ user_version: number }[]>(`PRAGMA user_version;`);
    expect(user_version).toBeGreaterThanOrEqual(3);

    const srsCols = await conn.select<{ name: string }[]>(`PRAGMA table_info(srs_reviews);`);
    expect(srsCols.map((c) => c.name)).toContain("learning_steps");
    const logCols = await conn.select<{ name: string }[]>(`PRAGMA table_info(review_logs);`);
    expect(logCols.map((c) => c.name)).toContain("is_scheduled");
  });
});

describe("due words", () => {
  it("returns due words, and treats words without an SRS row as new and due", async () => {
    const { db } = await freshServices();
    const conn = await db.getDatabase();
    const due = await db.insertEnrichedWord(input("cache"));
    const later = await db.insertEnrichedWord(input("queue"));
    const orphan = await db.insertEnrichedWord(input("mutex"));

    const future = new Date(Date.now() + 5 * 86400000).toISOString();
    await conn.execute(`UPDATE srs_reviews SET next_review_date = $1 WHERE word_id = $2`, [future, later]);
    await conn.execute(`DELETE FROM srs_reviews WHERE word_id = $1`, [orphan]);

    const ids = (await db.getDueWordsFromDb()).map((w) => w.id).sort();
    expect(ids).toEqual([due, orphan].sort());
    expect(await db.countDueWords()).toBe(2);
  });
});

describe("word writes", () => {
  it("insertWordIfAbsent never modifies an existing word", async () => {
    const { db } = await freshServices();
    const id = await db.insertEnrichedWord(input("deploy", "triển khai"));
    const res = await db.insertWordIfAbsent(input("Deploy", "nghĩa khác"));
    expect(res).toEqual({ id, inserted: false });

    const [word] = await db.getAllWords();
    expect(word.meaning_vn).toBe("triển khai");
    expect(word.examples).toHaveLength(1);
  });

  it("re-enriching keeps exactly the new examples", async () => {
    const { db } = await freshServices();
    const id = await db.insertEnrichedWord(input("rollback"));
    await db.insertEnrichedWord({
      ...input("rollback"),
      examples: [
        { sentence_en: "We rolled back the release.", grammar_analysis: "Past simple" },
        { sentence_en: "A rollback was required.", grammar_analysis: "Passive" },
      ],
    });
    const [word] = (await db.getAllWords()).filter((w) => w.id === id);
    expect(word.examples.map((e) => e.sentence_en).sort()).toEqual([
      "A rollback was required.",
      "We rolled back the release.",
    ]);
  });

  it("detects placeholder meanings", async () => {
    const { db } = await freshServices();
    expect(db.isPlaceholderMeaning("Đang phân tích nghĩa & cấu trúc ngữ pháp...")).toBe(true);
    expect(db.isPlaceholderMeaning("Chờ phân tích (Lỗi CLI)")).toBe(true);
    expect(db.isPlaceholderMeaning("")).toBe(true);
    expect(db.isPlaceholderMeaning("độ trễ")).toBe(false);
  });
});
