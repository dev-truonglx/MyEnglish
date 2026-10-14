import { describe, it, expect, vi } from "vitest";
import p1 from "./fixtures/grammarBook/ch01-p1.json";
import p2 from "./fixtures/grammarBook/ch01-p2.json";
import type { GrammarBookFile, GrammarBookItem } from "@/types/grammarBook";

const files = () => [structuredClone(p1), structuredClone(p2)] as unknown as GrammarBookFile[];

/** Fresh modules and database with the sample chapter imported */
async function importedBook() {
  vi.resetModules();
  const db = await import("@/services/db");
  await db.getDatabase();
  const book = await import("@/services/grammarBook");
  await book.saveGrammarBookChapter(book.mergeChapterParts(files()).get("ch01")!);
  const grammar = await import("@/services/grammarService");
  await grammar.initGrammarStorage();
  const session = await import("@/services/grammarSession");
  const items = await import("@/services/grammarItems");
  await book.getAllBookChapters();
  return { db, book, grammar, session, items };
}

const item = (over: Partial<GrammarBookItem>): GrammarBookItem =>
  ({ setId: "ch01-s09", n: 1, prompt: "They ___ late yesterday.", answers: [["was"]], answerSentence: "", ...over }) as GrammarBookItem;

describe("answers written with '/' or cut off", () => {
  it("an answer written 'was / were' (or 'a/ b') is two accepted answers that can be typed", async () => {
    const book = await import("@/services/grammarBook");
    const items = await import("@/services/grammarItems");
    for (const written of ["was / were", "was/ were"]) {
      const fixed = book.normalizeItemAnswers(item({ answers: [[written]] }));
      expect(fixed.answers).toEqual([["was", "were"]]);
      expect(fixed.selfGrade).toBeUndefined();
      expect(items.isSelfGraded(fixed, "fill_blank")).toBe(false);
      const task = items.buildTask(fixed, "fill_blank", "type");
      expect(items.checkTask(task, { kind: "typed", values: ["were"] }).correct).toBe(true);
      expect(items.checkTask(task, { kind: "typed", values: ["was"] }).correct).toBe(true);
      expect(items.checkTask(task, { kind: "typed", values: ["is"] }).correct).toBe(false);
      // The sentence shown is built from the first alternative
      expect(task.full).toBe("They was late yesterday.");
    }
  });

  it("a whole-sentence answer that lists complete sentences is split; the learner can type either", async () => {
    const book = await import("@/services/grammarBook");
    const items = await import("@/services/grammarItems");
    const raw = item({
      prompt: "Rewrite: She cooks dinner and he washes up.",
      answers: [["She cooks dinner. / He washes up."]],
      answerSentence: "She cooks dinner. / He washes up.",
    });
    const fixed = book.normalizeItemAnswers(raw);
    expect(fixed.answers).toEqual([["She cooks dinner.", "He washes up."]]);
    expect(fixed.answerSentence).toBe("She cooks dinner.");
    const task = items.buildTask(fixed, "rewrite", "type");
    expect(items.checkTask(task, { kind: "typed", values: ["he washes up"] }).correct).toBe(true);
  });

  it("an answer with '...' or '…' is self-graded", async () => {
    const book = await import("@/services/grammarBook");
    const items = await import("@/services/grammarItems");
    for (const cut of ["If I were you, I...", "If I were you, I…"]) {
      const raw = item({ prompt: "Complete: If I were you,", answers: [[cut]], answerSentence: cut });
      expect(book.normalizeItemAnswers(raw).selfGrade).toBe(true);
      expect(items.isSelfGraded(raw, "rewrite")).toBe(true);
    }
    // A cut-off answerSentence alone is enough for a whole-sentence item
    expect(items.isSelfGraded(item({ prompt: "Say it.", answers: [["Fine."]], answerSentence: "Fine, but..." }), "rewrite")).toBe(true);
  });

  it("a '/' that cannot be split safely makes the item self-graded", async () => {
    const book = await import("@/services/grammarBook");
    const items = await import("@/services/grammarItems");
    const cases = [
      "and/or", // no space next to it
      "was / ", // an empty alternative
      "She is / was happy today with us", // pieces of one sentence
    ];
    for (const written of cases) {
      const raw = item({ answers: [[written]] });
      expect(book.normalizeItemAnswers(raw).selfGrade, written).toBe(true);
      expect(items.isSelfGraded(raw, "fill_blank"), written).toBe(true);
    }
    // Whole-sentence answers whose parts start differently ("I am / was late") are inline alternatives
    const inline = item({ prompt: "Say it.", answers: [["I am / was late"]], answerSentence: "I am / was late" });
    expect(book.normalizeItemAnswers(inline).selfGrade).toBe(true);
  });

  it("answers loaded from the database come out already split, and the import warns about the rest", async () => {
    const { book, items } = await importedBook();
    const file = {
      format: "myenglish-grammar-book",
      version: 2,
      chapterId: "ch01",
      lessons: [{ id: "ch01-l01", title: "A", titleVn: "A", blocks: [] }],
      exerciseSets: [
        {
          id: "ch01-s09",
          type: "fill_blank",
          items: [
            { n: 1, prompt: "They ___ late yesterday.", answers: [["was / were"]], lessonIds: ["ch01-l01"] },
            { n: 2, prompt: "I ___ the news.", answers: [["heard..."]], lessonIds: ["ch01-l01"] },
          ],
        },
      ],
    };
    const res = book.validateGrammarBookFile(file, "f.json");
    expect(res.valid).toBe(true);
    expect(res.warnings.some((w) => w.message.includes("câu ch01-s09#2") || w.message.includes("ch01-s09#2"))).toBe(true);
    const [one, two] = res.data!.exerciseSets![0].items!;
    expect(one.answers).toEqual([["was", "were"]]);
    expect(one.selfGrade).toBeUndefined();
    expect(two.selfGrade).toBe(true);

    // A stored item still holding the raw text (a seeded or older import) is fixed when it is loaded
    const db = await (await import("@/services/db")).getDatabase();
    const row = await db.select<Array<{ data: string }>>("SELECT data FROM grammar_book_items WHERE id = 'ch01:ch01-s01#1';");
    const data = JSON.parse(row[0].data);
    data.prompt = "They ___ late yesterday.";
    data.answers = [["was / were"]];
    await db.execute("UPDATE grammar_book_items SET data = $1 WHERE id = 'ch01:ch01-s01#1';", [JSON.stringify(data)]);
    book.clearBookCache();
    const chapter = (await book.getAllBookChapters())[0];
    const loaded = chapter.practiceGroups!.flatMap((g) => g.items).find((it) => book.bookItemKey(it) === "ch01-s01#1")!;
    expect(loaded.answers).toEqual([["was", "were"]]);
    expect(items.isSelfGraded(loaded, "verb_form")).toBe(false);
  });
});

describe("import check of options uses the player's matcher", () => {
  it("a curly apostrophe or a contraction in the options does not force self-grading", async () => {
    const book = await import("@/services/grammarBook");
    const file = (answer: string, options: string[]) => ({
      format: "myenglish-grammar-book",
      version: 2,
      chapterId: "ch01",
      lessons: [{ id: "ch01-l01", title: "A", titleVn: "A", blocks: [] }],
      exerciseSets: [{ id: "ch01-s09", type: "choose", items: [{ n: 1, prompt: "We ___ finished.", options, answers: [[answer]], lessonIds: ["ch01-l01"] }] }],
    });
    const curly = book.validateGrammarBookFile(file("haven't", ["haven’t", "have", "has"]), "f.json");
    expect(curly.warnings.some((w) => w.message.includes("các lựa chọn"))).toBe(false);
    expect(curly.data!.exerciseSets![0].items![0].selfGrade).toBeUndefined();
    const contraction = book.validateGrammarBookFile(file("have not", ["haven't", "have", "has"]), "f.json");
    expect(contraction.data!.exerciseSets![0].items![0].selfGrade).toBeUndefined();
    const missing = book.validateGrammarBookFile(file("had", ["have", "has", "having"]), "f.json");
    expect(missing.data!.exerciseSets![0].items![0].selfGrade).toBe(true);
  });
});

describe("book revision across windows", () => {
  it("an update bumps the revision; a storage event for it in another window drops this window's copy", async () => {
    const { db, book } = await importedBook();
    const before = await book.getAllBookChapters();
    expect(book.getKnownLessonIds()).toHaveLength(3);
    const events: unknown[] = [];
    const on = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener("myenglish-grammar-updated", on);

    // The other window deleted the book
    const revisionBefore = localStorage.getItem(book.BOOK_REVISION_KEY);
    await (await db.getDatabase()).execute("DELETE FROM grammar_book_items;");
    window.dispatchEvent(Object.assign(new Event("storage"), { key: "some_other_key" }));
    expect(await book.getAllBookChapters()).toBe(before);

    window.dispatchEvent(Object.assign(new Event("storage"), { key: book.BOOK_REVISION_KEY }));
    window.removeEventListener("myenglish-grammar-updated", on);
    expect(book.getKnownLessonIds()).toEqual([]);
    expect(events).toEqual([{ book: true, chapterIds: [] }]);
    const after = await book.getAllBookChapters();
    expect(after).not.toBe(before);
    expect(after[0].practiceGroups).toHaveLength(0);
    expect(revisionBefore).not.toBeNull();
  });

  it("saving, replacing and clearing the book each write a new revision", async () => {
    const { book } = await importedBook();
    const seen = new Set([localStorage.getItem(book.BOOK_REVISION_KEY)]);
    await book.saveGrammarBookChapter(book.mergeChapterParts(files()).get("ch01")!, { mode: "replace" });
    seen.add(localStorage.getItem(book.BOOK_REVISION_KEY));
    await book.clearGrammarBook();
    seen.add(localStorage.getItem(book.BOOK_REVISION_KEY));
    expect(seen.size).toBe(3);
    expect(seen.has(null)).toBe(false);
  });
});

describe("the session index", () => {
  it("is built once until the book, the hidden items or the accepted answers change; hiding does not reload the book", async () => {
    const { book, session } = await importedBook();
    const chapters = await book.getAllBookChapters();
    const first = await session.loadBookIndex();
    expect(await session.loadBookIndex()).toBe(first);

    const key = first.items[0].key;
    book.hideItem(key);
    expect(await book.getAllBookChapters()).toBe(chapters);
    const hiddenIndex = await session.loadBookIndex();
    expect(hiddenIndex).not.toBe(first);
    expect(hiddenIndex.items.some((it) => it.key === key)).toBe(false);
    expect(await session.loadBookIndex()).toBe(hiddenIndex);

    book.unhideItem(key);
    const back = await session.loadBookIndex();
    expect(back.items.some((it) => it.key === key)).toBe(true);

    book.saveUserAcceptedAnswer(key, "something else");
    expect(await session.loadBookIndex()).not.toBe(back);

    book.clearBookCache();
    expect(await session.loadBookIndex()).not.toBe(back);
  });

  it("the accepted answers and ladder levels are shared maps that are never changed in place", async () => {
    const { book, items } = await importedBook();
    const a = book.getAcceptedAnswersMap();
    book.saveUserAcceptedAnswer("ch01-s01#1", "ok");
    expect(a["ch01-s01#1"]).toBeUndefined();
    expect(book.getAcceptedAnswersMap()["ch01-s01#1"]).toEqual(["ok"]);
    expect(book.getAcceptedAnswersMap()).toBe(book.getAcceptedAnswersMap());

    const levels = items.readItemLevels();
    items.updateItemReviewLevel("ch01-s01#1", true);
    expect(levels["ch01-s01#1"]).toBeUndefined();
    expect(items.getItemReviewLevel("ch01-s01#1")).toBe(1);
    expect(items.readItemLevels()).toBe(items.readItemLevels());
  });

  it("lessonStatus takes the due lessons worked out once", async () => {
    const { grammar, session } = await importedBook();
    await grammar.recordDiagnosticResult("ch01-l01", true, 100);
    const now = new Date();
    expect(session.lessonStatus("ch01-l01", now, new Set())).not.toBe("due");
    expect(session.lessonStatus("ch01-l01", now, new Set(["ch01-l01"]))).toBe("due");
    expect(session.lessonStatus("ch01-l01", now, ["ch01-l01"])).toBe("due");
    expect(session.lessonStatus("ch01-l02", now, new Set(["ch01-l02"]))).toBe("new");
  });
});

describe("mistake cards from grammar answers", () => {
  it("'find the error' stores the wrong span and its fix, not the tapped word and the joined blanks", async () => {
    const { book, session, items } = await importedBook();
    const chapter = (await book.getAllBookChapters())[0];
    const it = chapter.practiceGroups!.flatMap((g) => g.items).find((x) => book.bookItemKey(x) === "ch01-s01#2")!;
    const task = items.buildTask(it, "verb_form", "error", () => 0);
    const entry = { task, lessonIds: ["ch01-l01"] };
    const [from, to] = task.errorSpan!;
    const tapped = task.errorTokens!.findIndex((_, i) => i < from || i > to);
    expect(session.grammarMistakeOf(entry, task.errorTokens![tapped])).toEqual({
      wrong: task.errorTokens!.slice(from, to + 1).join(" "),
      right: task.errorFix,
    });
  });

  it("no answer at all makes no card; a typed or chosen answer is the 'wrong' side", async () => {
    const { book, session, items } = await importedBook();
    const chapter = (await book.getAllBookChapters())[0];
    const it = chapter.practiceGroups!.flatMap((g) => g.items).find((x) => book.bookItemKey(x) === "ch01-s01#2")!;
    const task = items.buildTask(it, "verb_form", "type");
    const entry = { task, lessonIds: ["ch01-l01"] };
    expect(session.grammarMistakeOf(entry, undefined)).toBeNull();
    expect(session.grammarMistakeOf(entry, "   ")).toBeNull();
    expect(session.grammarMistakeOf(entry, "plays")).toEqual({ wrong: "plays", right: task.answers.map((a) => a[0]).join(" … ") });
  });

  it("a wrong answer is saved without the next question waiting for it", async () => {
    const { db, book, session, items } = await importedBook();
    const chapter = (await book.getAllBookChapters())[0];
    const it = chapter.practiceGroups!.flatMap((g) => g.items).find((x) => book.bookItemKey(x) === "ch01-s01#2")!;
    const entry = { task: items.buildTask(it, "verb_form", "type"), lessonIds: ["ch01-l01"] };
    await session.recordGrammarAnswer(entry, false, { mode: "practice", given: "plays" });
    const handle = await db.getDatabase();
    await vi.waitFor(async () => {
      const rows = await handle.select<Array<{ source: string; wrong_text: string }>>("SELECT source, wrong_text FROM mistakes;");
      expect(rows).toEqual([{ source: "grammar", wrong_text: "plays" }]);
    });
    // Skipped: no card
    await session.recordGrammarAnswer(entry, false, { mode: "practice", skipped: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(await handle.select("SELECT id FROM mistakes;")).toHaveLength(1);
  });

  it("the same mistake is found by its normalized key, also for rows saved without one", async () => {
    vi.resetModules();
    const db = await (await import("@/services/db")).getDatabase();
    const mistakes = await import("@/services/mistakes");
    const old = new Date(2026, 0, 1).toISOString();
    // A row from an older build: no norm_key column value
    await db.execute(
      `INSERT INTO mistakes (id, wrong_text, right_text, source, created_at, next_review_date) VALUES ('old1', 'He don''t know', 'He doesn''t know', 'free_writing', $1, $1);`,
      [old]
    );
    const res = await mistakes.saveMistakes(
      [
        { wrong: "he don’t know.", right: "He doesn’t know" },
        { wrong: "an new idea", right: "a new idea" },
        { wrong: "an new idea", right: "A new idea" },
      ],
      { source: "grammar" }
    );
    expect(res).toEqual({ added: 1, repeated: 2 });
    const rows = await db.select<Array<{ id: string; occurrences: number; norm_key: string | null }>>("SELECT id, occurrences, norm_key FROM mistakes ORDER BY created_at;");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.norm_key)).toBe(true);
    expect(rows.find((r) => r.id === "old1")!.occurrences).toBe(2);
  });
});

describe("merging with overwrite", () => {
  it("a later copy of an item replaces the earlier one, in one pass, also across groups", async () => {
    const book = await import("@/services/grammarBook");
    const stored = book.mergeChapterParts(files()).get("ch01")!;
    const count = (c: GrammarBookFile) => c.practiceGroups!.reduce((n, g) => n + g.items.length, 0);
    const before = count(stored);

    const keyed = stored.practiceGroups!.flatMap((g) => g.items)[0];
    const incoming = structuredClone(p2) as unknown as GrammarBookFile;
    const target = incoming.practiceGroups![0].items[0];
    expect(book.bookItemKey(target)).toBe(book.bookItemKey(keyed));
    target.prompt = "Replaced sentence ___ here.";
    // The same item twice in the incoming file: the last one wins
    incoming.practiceGroups![0].items.push({ ...target, prompt: "Replaced again ___ here." });
    const merged = book.mergeChapterParts([stored, incoming], { overwrite: true }).get("ch01")!;
    expect(count(merged)).toBe(before);
    const same = merged.practiceGroups!.flatMap((g) => g.items).filter((it) => book.bookItemKey(it) === book.bookItemKey(target));
    expect(same).toHaveLength(1);
    expect(same[0].prompt).toBe("Replaced again ___ here.");
  });
});

describe("popup and player grade grammar the same way", () => {
  const entryOf = (format: string, extra: Record<string, unknown> = {}) =>
    ({
      task: { itemKey: "test-item", format, prompt: "She ___ here.", blanks: 1, answers: [["works"]], full: "She works here." },
      lessonIds: [],
      ...extra,
    }) as never;

  it("a right answer in an easier popup format does not lift the item past it", async () => {
    const { session, items } = await importedBook();
    localStorage.setItem("myenglish_grammar_item_levels_v1", JSON.stringify({ "test-item": 1 }));
    await session.recordGrammarAnswer(entryOf("choice", { belowLevel: true }), true, { mode: "popup" });
    expect(items.getItemReviewLevel("test-item")).toBe(1);
    // In the item's own format it moves up as usual, and a miss always moves it down
    await session.recordGrammarAnswer(entryOf("choice"), true, { mode: "popup" });
    expect(items.getItemReviewLevel("test-item")).toBe(2);
    await session.recordGrammarAnswer(entryOf("choice", { belowLevel: true }), false, { mode: "popup" });
    expect(items.getItemReviewLevel("test-item")).toBe(1);
  });

  it("the popup's typed check is the player's (checkTask)", async () => {
    const { items } = await importedBook();
    const task = { itemKey: "k", format: "type", prompt: "I ___ (not / like) it.", blanks: 1, answers: [["don't like", "do not like"]], full: "I don't like it." } as never;
    expect(items.checkTask(task, { kind: "typed", values: ["do not like"] }).correct).toBe(true);
    expect(items.checkTask(task, { kind: "typed", values: ["don’t like"] }).correct).toBe(true);
    expect(items.checkTask(task, { kind: "typed", values: ["doesn't like"] }).correct).toBe(false);
  });
});
