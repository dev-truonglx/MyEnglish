import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import p1 from "./fixtures/grammarBook/ch01-p1.json";
import p2 from "./fixtures/grammarBook/ch01-p2.json";
import type { GrammarBookFile, GrammarBookImportMode } from "@/types/grammarBook";

type Book = typeof import("@/services/grammarBook");
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const raw = (file: unknown): Json => structuredClone(file) as Json;
/** The sample chapter renamed to another chapter (same content, other ids) */
const asChapter = (file: unknown, chapterId: string): Json => JSON.parse(JSON.stringify(file).split("ch01").join(chapterId));
const itemsOf = (ch?: GrammarBookFile | null) => (ch?.practiceGroups ?? []).reduce((n, g) => n + g.items.length, 0);
const keysOf = (ch?: GrammarBookFile | null) => (ch?.practiceGroups ?? []).flatMap((g) => g.items.map((it) => `${it.setId}#${it.n}`)).sort();

async function freshBook(): Promise<Book> {
  vi.resetModules();
  const db = await import("@/services/db");
  await db.getDatabase();
  return import("@/services/grammarBook");
}

/** The dialog's path: each file validated, the parts merged, the chapters saved */
async function importFiles(book: Book, files: unknown[], mode?: GrammarBookImportMode) {
  const valid = files.map((f, i) => {
    const res = book.validateGrammarBookFile(f, `f${i}.json`);
    expect(res.errors).toEqual([]);
    return res.data!;
  });
  const result = await book.importGrammarBookChapters(book.mergeChapterParts(valid).values(), { mode });
  expect(result.failed).toEqual([]);
  return result;
}

afterEach(() => {
  vi.doUnmock("@/services/db");
  vi.restoreAllMocks();
});

describe("importing adds to what is already imported (G1)", () => {
  it("part 1 and then part 2 on its own: both are kept", async () => {
    const book = await freshBook();
    await importFiles(book, [raw(p1)]);
    let ch = await book.getBookChapter("ch01");
    expect(ch!.lessons).toHaveLength(3);
    expect(itemsOf(ch)).toBe(0);

    await importFiles(book, [raw(p2)]);
    ch = await book.getBookChapter("ch01");
    expect(ch!.lessons!.map((l) => l.id)).toEqual(["ch01-l01", "ch01-l02", "ch01-l03"]);
    expect(itemsOf(ch)).toBe(10);
    expect(ch!.importedParts).toEqual([1, 2]);
    expect(ch!.chapterNotes).toHaveLength(1);

    // Part 1 imported again: notes are replaced, not doubled; exercises stay
    await importFiles(book, [raw(p1)]);
    ch = await book.getBookChapter("ch01");
    expect(itemsOf(ch)).toBe(10);
    expect(ch!.chapterNotes).toHaveLength(1);
  });

  it("a part imported again updates its items and keeps the rest", async () => {
    const book = await freshBook();
    await importFiles(book, [raw(p1), raw(p2)]);
    const fixed = raw(p2);
    fixed.practiceGroups[0].items = [{ ...fixed.practiceGroups[0].items[0], answers: [["drives"]], answerSentence: "Fixed sentence." }];
    fixed.practiceGroups = [fixed.practiceGroups[0]];
    await importFiles(book, [fixed]);
    const ch = await book.getBookChapter("ch01");
    expect(itemsOf(ch)).toBe(10);
    const item = ch!.practiceGroups!.flatMap((g) => g.items).find((it) => it.setId === "ch01-s01" && it.n === 1)!;
    expect(item.answerSentence).toBe("Fixed sentence.");
  });

  it("the missing-part warning names the parts and counts the ones already imported", async () => {
    const book = await freshBook();
    await importFiles(book, [raw(p1)]);
    const stored = await book.getAllBookChapters();
    const part2 = book.validateGrammarBookFile(raw(p2)).data!;
    expect(book.validateChapterFiles([part2]).map((w) => w.message).find((m) => m.includes("thiếu phần"))).toContain("thiếu phần 1/2");
    expect(book.validateChapterFiles([part2], stored).some((w) => w.message.includes("thiếu phần"))).toBe(false);
  });

  it("replace mode drops the chapter's old content", async () => {
    const book = await freshBook();
    await importFiles(book, [raw(p1), raw(p2)]);
    await importFiles(book, [raw(p1)], "replace");
    const ch = await book.getBookChapter("ch01");
    expect(ch!.lessons).toHaveLength(3);
    expect(itemsOf(ch)).toBe(0);
    expect(ch!.importedParts).toEqual([1]);
  });

  it("importing several chapters sends one update event", async () => {
    const book = await freshBook();
    let events = 0;
    const count = () => events++;
    window.addEventListener("myenglish-grammar-updated", count);
    window.addEventListener("myenglish-grammar-book-updated", count);
    try {
      await importFiles(book, [raw(p1), raw(p2), asChapter(p1, "ch02"), asChapter(p2, "ch02"), asChapter(p1, "ch03")]);
    } finally {
      window.removeEventListener("myenglish-grammar-updated", count);
      window.removeEventListener("myenglish-grammar-book-updated", count);
    }
    expect(events).toBe(1);
    expect((await book.getAllBookChapters()).map((c) => c.chapterId)).toEqual(["ch01", "ch02", "ch03"]);
  });
});

describe("checking the data (G12, G13)", () => {
  it("a broken item is left out with a warning; the rest of the file is imported", async () => {
    const book = await freshBook();
    const bad = raw(p2);
    delete bad.practiceGroups[0].items[0].prompt;
    delete bad.practiceGroups[0].items[1].n;
    delete bad.practiceGroups[1].items[0].setId;
    bad.practiceGroups[1].items[1] = "not an item";
    const res = book.validateGrammarBookFile(bad, "bad.json");
    expect(res.valid).toBe(true);
    const dropped = res.warnings.filter((w) => w.dropped).map((w) => w.message);
    expect(dropped).toHaveLength(4);
    expect(dropped.some((m) => m.includes("thiếu đề"))).toBe(true);
    expect(dropped.some((m) => m.includes('"n"'))).toBe(true);
    expect(dropped.some((m) => m.includes('"setId"'))).toBe(true);
    await importFiles(book, [raw(p1), bad]);
    const ch = await book.getBookChapter("ch01");
    expect(itemsOf(ch)).toBe(6);
    expect(keysOf(ch).some((k) => k.startsWith("undefined") || k.startsWith("misc"))).toBe(false);
  });

  it("ids without the chapter prefix are left out; the chapter order comes from its id", async () => {
    const book = await freshBook();
    const theory = raw(p1);
    theory.chapter.order = 7;
    theory.lessons.push({ id: "ch02-l01", order: 9, title: "Other chapter", titleVn: "", blocks: [] });
    const exercises = raw(p2);
    exercises.exerciseSets.push({ id: "ch02-s01", roman: "IX", instruction: "", type: "verb_form", items: [{ n: 1, prompt: "x ___", answers: [["y"]] }] });
    exercises.practiceGroups[0].items.push({ ...exercises.practiceGroups[0].items[0], setId: "ch02-s01", n: 2 });
    exercises.practiceGroups[1].id = "g-wrong";

    const t = book.validateGrammarBookFile(theory, "t.json");
    expect(t.data!.lessons!.map((l) => l.id)).toEqual(["ch01-l01", "ch01-l02", "ch01-l03"]);
    expect(t.data!.chapter!.order).toBe(1);
    const e = book.validateGrammarBookFile(exercises, "e.json");
    expect(e.data!.exerciseSets!.map((s) => s.id)).not.toContain("ch02-s01");
    expect(e.warnings.filter((w) => w.dropped).length).toBe(2);
    // A wrong practice-group id only loses the id: the importer rebuilds it from the lessons
    expect(e.warnings.some((w) => w.message.includes("g-wrong") && !w.dropped)).toBe(true);

    await importFiles(book, [theory, exercises]);
    const ch = await book.getBookChapter("ch01");
    expect(ch!.chapter!.order).toBe(1);
    expect(itemsOf(ch)).toBe(10);
    expect(ch!.lessons!.map((l) => l.id)).not.toContain("ch02-l01");
  });

  it("a flat answers list is wrapped", async () => {
    const book = await freshBook();
    const file = raw(p2);
    const [one, , two] = [file.practiceGroups[0].items[0], null, file.practiceGroups[2].items[0]];
    one.answers = ["drives"];
    two.answers = ["drinks", "is drinking"];
    file.practiceGroups[1].items[0].answers = "are playing";
    const res = book.validateGrammarBookFile(file, "flat.json");
    const items = res.data!.practiceGroups!.flatMap((g) => g.items);
    expect(items.find((it) => it.n === 1 && it.setId === "ch01-s01")!.answers).toEqual([["drives"]]);
    expect(items.find((it) => it.n === 3 && it.setId === "ch01-s01")!.answers).toEqual([["drinks"], ["is drinking"]]);
    expect(items.find((it) => it.n === 2 && it.setId === "ch01-s01")!.answers).toEqual([["are playing"]]);
    expect(items.filter((it) => it.selfGrade && it.setId === "ch01-s01" && it.n <= 3)).toEqual([]);
    // Alternatives for a single blank stay one list
    file.practiceGroups[0].items[0].answers = ["drives", "is driving"];
    const again = book.validateGrammarBookFile(file, "flat.json").data!.practiceGroups![0].items[0];
    expect(again.answers).toEqual([["drives", "is driving"]]);
  });

  it("the example in docs/grammar-import-prompt.md imports as it is", async () => {
    const book = await freshBook();
    const { readFileSync } = await import("node:fs");
    const doc = readFileSync(new URL("../docs/grammar-import-prompt.md", import.meta.url), "utf8");
    const example = doc.slice(doc.indexOf("# 7."), doc.indexOf("# 8."));
    const parsed = book.parseGrammarBookJson(example);
    expect(parsed.ok).toBe(true);
    const res = book.validateGrammarBookFile(parsed.ok ? parsed.value : null, "example.json");
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([]);
    const ch = book.mergeChapterParts([res.data!]).get("ch01")!;
    expect(ch.practiceGroups!.map((g) => g.id)).toEqual(["ch01-g01", "ch01-g05-06"]);
    expect(ch.practiceGroups![0].items[0].setId).toBe("ch01-s01");
  });

  it("items given inside their exercise set (flat format) are grouped by their lessons", async () => {
    const book = await freshBook();
    const flat = raw(p2);
    const bySet = new Map<string, Json[]>();
    for (const g of flat.practiceGroups) for (const it of g.items) bySet.set(it.setId, [...(bySet.get(it.setId) ?? []), (({ setId: _s, ...rest }) => rest)(it)]);
    for (const s of flat.exerciseSets) s.items = bySet.get(s.id) ?? [];
    delete flat.practiceGroups;
    await importFiles(book, [raw(p1), flat]);
    const ch = await book.getBookChapter("ch01");
    expect(itemsOf(ch)).toBe(10);
    expect(ch!.practiceGroups!.map((g) => g.id).sort()).toEqual(["ch01-g01", "ch01-g01-02", "ch01-g02", "ch01-g03"]);
  });

  it("blocks of the wrong shape are fixed or left out, and the handbook never crashes", async () => {
    const book = await freshBook();
    const file = raw(p1);
    file.lessons[0].blocks = [
      { type: "table", headers: "x", rows: "y" },
      { type: "table", rows: [["a", "b"], "c"] },
      { type: "wordlist" },
      { type: "bullet", items: ["one", "two"] },
      { type: "text", text: 5 },
      { type: "example", text: "Hi there." },
      "A plain line",
      { type: "weird", text: "shown as text" },
      null,
    ];
    file.lessons[1].blocks = "not a list";
    const res = book.validateGrammarBookFile(file, "blocks.json");
    expect(res.valid).toBe(true);
    const blocks = res.data!.lessons![0].blocks;
    expect(blocks.map((b) => b.type)).toEqual(["table", "bullet", "bullet", "text", "example", "text", "text"]);
    expect(blocks[0]).toEqual({ type: "table", headers: [], rows: [["a", "b"], ["c"]] });
    expect(res.data!.lessons![1].blocks).toEqual([]);
    expect(res.warnings.some((w) => w.message.includes("bỏ 3 khối"))).toBe(true);

    const HandbookView = (await import("@/components/grammar/HandbookView")).default;
    const broken = [
      { type: "table" },
      { type: "table", headers: ["h"], rows: ["not a row", null] },
      { type: "wordlist", items: [null, "x", { en: { bad: 1 } }] },
      { type: "text", text: { not: "text" } },
      null,
    ];
    const html = renderToStaticMarkup(createElement(HandbookView, { blocks: broken as never, chapterNotes: "x" as never }));
    expect(typeof html).toBe("string");
    expect(renderToStaticMarkup(createElement(HandbookView, { blocks: undefined as never }))).toContain("div");
  });
});

describe("reading a file pasted from the chat (G13)", () => {
  const small = (extra = "") =>
    `{
  "format": "myenglish-grammar-book",
  "version": 2,
  "chapterId": "ch01",
  "lessons": [
    { "id": "ch01-l01", "order": 1, "title": "Present simple", "titleVn": "Hiện tại đơn", "blocks": [{ "type": "text", "text": "Line one
line two" },], },
  ],${extra}
}`;

  it("drops the BOM, the ```json fence, text around the JSON and trailing commas", async () => {
    const book = await freshBook();
    const text = `﻿Đây là part 1 của chương 1:\n\`\`\`json\n${small()}\n\`\`\`\nTên file gợi ý: ch01-p1.json`;
    const parsed = book.parseGrammarBookJson(text);
    expect(parsed.ok).toBe(true);
    const res = book.validateGrammarBookFile(parsed.ok ? parsed.value : null, "chat.json");
    expect(res.valid).toBe(true);
    expect(res.data!.lessons![0].blocks[0]).toEqual({ type: "text", text: "Line one\nline two" });
  });

  it("a file cut off in the middle says so", async () => {
    const book = await freshBook();
    const cut = JSON.stringify(p2, null, 2).slice(0, 900);
    expect(book.parseGrammarBookJson(cut)).toEqual({ ok: false, message: book.TRUNCATED_JSON_MESSAGE });
    expect(book.parseGrammarBookJson("```json\n" + cut)).toEqual({ ok: false, message: book.TRUNCATED_JSON_MESSAGE });
    expect(book.parseGrammarBookJson(JSON.stringify(p2).slice(0, -3))).toEqual({ ok: false, message: book.TRUNCATED_JSON_MESSAGE });
  });

  it("other syntax errors are explained in Vietnamese with the line", async () => {
    const book = await freshBook();
    const missingComma = `{\n  "format": "myenglish-grammar-book"\n  "version": 2,\n  "chapterId": "ch01"\n}`;
    const res = book.parseGrammarBookJson(missingComma);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toContain("gần dòng 3");
      expect(res.message).not.toMatch(/Unexpected|JSON\.parse|position/);
    }
    const twoBlocks = book.parseGrammarBookJson(`${small()}\n${small()}`);
    expect(!twoBlocks.ok && twoBlocks.message).toContain("hai khối JSON");
    const nothing = book.parseGrammarBookJson("Xin lỗi, tôi không đọc được file PDF.");
    expect(!nothing.ok && nothing.message).toContain("Không thấy dữ liệu JSON");
  });
});

describe("the book cache (G19)", () => {
  /** The real database, with the whole-book reads held back or failing on demand */
  async function bookWithControlledReads() {
    vi.resetModules();
    const control = { failNext: false, gate: Promise.resolve() as Promise<void> };
    vi.doMock("@/services/db", async () => {
      const actual = await vi.importActual<typeof import("@/services/db")>("@/services/db");
      return {
        ...actual,
        getDatabase: async () => {
          const real = await actual.getDatabase();
          return new Proxy(real, {
            get(target, prop) {
              if (prop === "select") {
                return async (sql: string, params?: unknown[]) => {
                  const wholeBook = /FROM grammar_book_\w+ ORDER BY/.test(sql);
                  if (wholeBook && control.failNext) {
                    control.failNext = false;
                    throw new Error("database is locked");
                  }
                  const rows = await target.select(sql, params);
                  if (wholeBook) await control.gate;
                  return rows;
                };
              }
              const value = Reflect.get(target, prop);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        },
      };
    });
    const book = await import("@/services/grammarBook");
    return { book, control };
  }

  it("a load that was running when the book changed is not used", async () => {
    const { book, control } = await bookWithControlledReads();
    await importFiles(book, [raw(p1), raw(p2)]);
    let release = () => {};
    control.gate = new Promise((resolve) => (release = resolve));
    const pending = book.getAllBookChapters(); // reads the old book, then waits
    await new Promise((r) => setTimeout(r, 10));
    await importFiles(book, [asChapter(p1, "ch02")]);
    control.gate = Promise.resolve();
    release();
    expect((await pending).map((c) => c.chapterId)).toEqual(["ch01", "ch02"]);
    expect((await book.getAllBookChapters()).map((c) => c.chapterId)).toEqual(["ch01", "ch02"]);
  });

  it("a failed load is not cached as an empty book", async () => {
    const { book, control } = await bookWithControlledReads();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await importFiles(book, [raw(p1), raw(p2)]);
    control.failNext = true;
    expect(await book.getAllBookChapters()).toEqual([]);
    expect((await book.getAllBookChapters()).map((c) => c.chapterId)).toEqual(["ch01"]);
  });
});

describe("hidden items and accepted answers (API for the screens)", () => {
  it("hides and unhides; lists and removes accepted answers", async () => {
    const book = await freshBook();
    book.hideItem("ch01-s01#2");
    book.hideItem("ch01-s02#1");
    expect(book.getHiddenItemKeys().sort()).toEqual(["ch01-s01#2", "ch01-s02#1"]);
    book.unhideItem("ch01-s01#2");
    expect(book.getHiddenItemKeys()).toEqual(["ch01-s02#1"]);

    book.saveUserAcceptedAnswer("ch01-s01#4", "went to see");
    book.saveUserAcceptedAnswer("ch01-s01#3", "is having", 1);
    expect(book.getUserAcceptedAnswers("ch01-s01#4")).toEqual(["went to see"]);
    expect(book.listUserAcceptedAnswers()).toEqual([
      { itemKey: "ch01-s01#4", blankIndex: 0, answer: "went to see" },
      { itemKey: "ch01-s01#3", blankIndex: 1, answer: "is having" },
    ]);
    book.removeUserAcceptedAnswer("ch01-s01#3", "is having", 1);
    book.removeUserAcceptedAnswer("ch01-s01#4", "went to see");
    expect(book.listUserAcceptedAnswers()).toEqual([]);
    expect(book.getAcceptedAnswersMap()).toEqual({});
  });
});
