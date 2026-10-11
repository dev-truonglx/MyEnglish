import { describe, it, expect, vi, afterEach } from "vitest";
import p1 from "./fixtures/grammarBook/ch01-p1.json";
import p2 from "./fixtures/grammarBook/ch01-p2.json";
import type { GrammarBookFile, GrammarBookItem, GrammarExerciseSetType } from "@/types/grammarBook";

/**
 * Grammar engine fixes (review 2026-10-11, GĐ2): lessons with no question, cross-locked lessons, review
 * sessions that grade every lesson they give, self-graded translations, "Tính là đúng" and "Mình chưa biết",
 * the first grade, mastery, a path that takes in new chapters, the daily goal, the popup, session size, tiles.
 */

afterEach(() => {
  vi.useRealTimers();
});

const DAY = 86_400_000;
const fixture = () => [structuredClone(p1), structuredClone(p2)] as unknown as GrammarBookFile[];

function makeItem(setId: string, n: number, lessonIds: string[], extra: Partial<GrammarBookItem> = {}): GrammarBookItem {
  return {
    setId,
    n,
    lessonIds,
    prompt: `Item ${n}: yesterday they ___ (go) there.`,
    given: "",
    underline: "",
    options: [],
    answers: [["went"]],
    answerSentence: `Item ${n}: yesterday they went there.`,
    keyRaw: "went",
    keyPartial: false,
    noKey: false,
    parts: [],
    ai: { vi: "Hôm qua họ đã đến đó.", distractors: [["gone", "going", "goes"]], wrongSentences: [], explainVn: "", suggestedAnswers: [] },
    ...extra,
  };
}

function rewriteItem(setId: string, n: number, lessonIds: string[]): GrammarBookItem {
  return makeItem(setId, n, lessonIds, {
    prompt: `They go there ${n} times.`,
    answers: [[`They went there ${n} times.`]],
    answerSentence: `They went there ${n} times.`,
    ai: { vi: "", distractors: [], wrongSentences: [], explainVn: "", suggestedAnswers: [] },
  });
}

/** A chapter of the given lessons; items listed with their lessons (each becomes its own practice group) */
function chapter(
  chapterId: string,
  order: number,
  lessonIds: string[],
  items: GrammarBookItem[],
  sets: Array<{ id: string; type: GrammarExerciseSetType; wordBank?: string[]; passage?: string | null }> = [{ id: `${chapterId}-s01`, type: "verb_form" }]
): GrammarBookFile {
  return {
    format: "myenglish-grammar-book",
    version: 2,
    chapterId,
    chapter: { order, title: `CHAPTER ${order}`, titleVn: `CHƯƠNG ${order}` },
    lessons: lessonIds.map((id, i) => ({
      id,
      order: i + 1,
      title: `Lesson ${id}`,
      titleVn: `Bài ${id}`,
      blocks: [{ type: "formula", label: "Khẳng định", text: "S + V2" }],
    })),
    chapterNotes: [],
    exerciseSets: sets.map((s, i) => ({
      id: s.id,
      roman: String(i + 1),
      instruction: "Supply the correct verb form.",
      type: s.type,
      wordBank: s.wordBank ?? [],
      example: null,
      passage: s.passage ?? null,
      itemCount: items.filter((it) => it.setId === s.id).length,
    })),
    practiceGroups: items.map((it, i) => ({ id: `${chapterId}-g${i + 1}`, lessonIds: it.lessonIds!, title: "", items: [it] })),
  };
}

/** Fresh modules and database with the given chapters imported */
async function freshBook(chapters: GrammarBookFile[] = []) {
  vi.resetModules();
  const db = await import("@/services/db");
  await db.getDatabase();
  const book = await import("@/services/grammarBook");
  for (const ch of chapters) await book.saveGrammarBookChapter(ch);
  const grammar = await import("@/services/grammarService");
  await grammar.initGrammarStorage();
  const path = await import("@/services/grammarPath");
  const session = await import("@/services/grammarSession");
  const items = await import("@/services/grammarItems");
  await book.getAllBookChapters();
  return { db, book, grammar, path, session, items };
}

async function fixtureBook(extra: GrammarBookFile[] = []) {
  vi.resetModules();
  const book = await import("@/services/grammarBook");
  return freshBook([book.mergeChapterParts(fixture()).get("ch01")!, ...extra]);
}

/** Lessons ch02-l01 (theory only), l02 + l03 (only one mixed question between them), l04 (questions of its own) */
const lockedChapter = () =>
  chapter(
    "ch02",
    2,
    ["ch02-l01", "ch02-l02", "ch02-l03", "ch02-l04"],
    [
      makeItem("ch02-s01", 1, ["ch02-l02", "ch02-l03"]),
      makeItem("ch02-s01", 2, ["ch02-l04"]),
      makeItem("ch02-s01", 3, ["ch02-l04"]),
      makeItem("ch02-s01", 4, ["ch02-l04"]),
    ],
    [{ id: "ch02-s01", type: "verb_form", wordBank: ["went", "gone"], passage: "Last week we went to Hue." }]
  );

describe("G2: lessons with no question, cross-locked lessons", () => {
  it("a lesson with no question is marked as read and the path goes on; it is never due", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T09:00:00"));
    const { session, path, grammar } = await freshBook([lockedChapter()]);
    expect(await session.lessonHasExercises("ch02-l01")).toBe(false);
    expect(await session.buildLearnSession("ch02-l01")).toEqual([]);
    expect((await path.getNextLessonToLearn())!.id).toBe("ch02-l01");

    expect(session.markLessonRead("ch02-l01")).toBe(true);
    expect(path.isLessonStudied("ch02-l01")).toBe(true);
    expect(session.markLessonRead("ch02-l01")).toBe(false);
    expect((await path.getNextLessonToLearn())!.id).toBe("ch02-l02");
    expect((await path.getTodayGrammarPlan()).newLessonDoneToday).toBe(true);

    vi.setSystemTime(new Date("2027-06-01T09:00:00"));
    expect(grammar.getDueGrammarLessons()).not.toContain("ch02-l01");
    expect(session.lessonStatus("ch02-l01")).toBe("learning");
  });

  it("two lessons that only share a mixed question are not locked; a lesson whose questions are all hidden is not due", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T09:00:00"));
    const { session, grammar, book } = await freshBook([lockedChapter()]);
    expect(await session.lessonHasExercises("ch02-l02")).toBe(true);
    expect(await session.lessonHasExercises("ch02-l03")).toBe(true);
    const learn = await session.buildLearnSession("ch02-l02");
    expect(learn.map((e) => e.task.itemKey)).toEqual(["ch02-s01#1"]);

    // A scheduled lesson whose every question was hidden leaves the due list
    await session.finishLearnSession("ch02-l04", [true, true, true]);
    vi.setSystemTime(new Date("2027-06-01T09:00:00"));
    expect(grammar.getDueGrammarLessons()).toContain("ch02-l04");
    for (const n of [2, 3, 4]) book.hideItem(`ch02-s01#${n}`);
    await session.buildReviewSession();
    expect(grammar.getDueGrammarLessons()).not.toContain("ch02-l04");
  });
});

describe("G7: what the exercise set gives a question", () => {
  it("entries carry the set's instruction (in Vietnamese), word box and passage", async () => {
    const { session } = await freshBook([lockedChapter()]);
    const [e] = await session.buildLessonExerciseSession("ch02-l04");
    expect(e.instruction).toBe("Chia dạng đúng của động từ");
    expect(e.wordBank).toEqual(["went", "gone"]);
    expect(e.passage).toBe("Last week we went to Hue.");
    expect(e.task.instruction).toBe(e.instruction);
    expect(e.task.wordBank).toEqual(["went", "gone"]);
  });
});

describe("G3: a review session grades every lesson it gives", () => {
  it("6 due lessons, 12 questions: 4 lessons with 3 questions each, the other 2 wait", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T09:00:00"));
    const lessons = Array.from({ length: 6 }, (_, i) => `ch03-l0${i + 1}`);
    const items = lessons.flatMap((id, li) => Array.from({ length: 4 }, (_, k) => makeItem("ch03-s01", li * 10 + k + 1, [id])));
    const { session, grammar } = await freshBook([chapter("ch03", 3, lessons, items)]);
    expect(grammar.MIN_LESSON_ANSWERS).toBe(grammar.LESSON_GRADE_ANSWERS);
    for (const id of lessons) await session.finishLearnSession(id, [true, true, true, true]);

    vi.setSystemTime(new Date("2027-06-01T09:00:00"));
    expect(grammar.getDueGrammarLessons().sort()).toEqual(lessons);
    const review = await session.buildReviewSession(12);
    const perLesson = new Map<string, number>();
    for (const e of review) for (const id of e.lessonIds) perLesson.set(id, (perLesson.get(id) ?? 0) + 1);
    expect(perLesson.size).toBe(4);
    for (const n of perLesson.values()) expect(n).toBeGreaterThanOrEqual(3);

    for (const e of review) await session.recordGrammarAnswer(e, true, { mode: "review" });
    const stillDue = grammar.getDueGrammarLessons();
    expect(stillDue).toHaveLength(2);
    for (const id of perLesson.keys()) expect(stillDue).not.toContain(id);
  });
});

describe("G5: translations into Vietnamese are self-graded", () => {
  it("a translate item with a Vietnamese answer is marked by the learner, an English one is not", async () => {
    vi.resetModules();
    const items = await import("@/services/grammarItems");
    const vn = makeItem("ch30-s01", 1, ["ch30-l01"], {
      prompt: "She has lived here for ten years.",
      answers: [["Cô ấy đã sống ở đây được mười năm."]],
      answerSentence: "Cô ấy đã sống ở đây được mười năm.",
    });
    expect(items.isSelfGraded(vn, "translate")).toBe(true);
    expect(items.availableFormats(vn, "translate")).toEqual(["self"]);
    expect(items.buildTask(vn, "translate", "translate").tiles).toBeUndefined();
    const en = makeItem("ch30-s01", 2, ["ch30-l01"], {
      prompt: "Cô ấy đã sống ở đây được mười năm.",
      answers: [["She has lived here for ten years."]],
      answerSentence: "She has lived here for ten years.",
    });
    expect(items.isSelfGraded(en, "translate")).toBe(false);
  });
});

describe("G8 / G6: answers the learner did not really give", () => {
  it("selfAccepted shows as right but does not climb the ladder nor feed the lesson grade; skipped is a miss", async () => {
    const { session, items, grammar } = await fixtureBook();
    await session.finishLearnSession("ch01-l01", [true, true, true]);
    const entries = await session.buildLessonExerciseSession("ch01-l01");
    const [a, b, c] = entries;

    await session.recordGrammarAnswer(a, true, { mode: "review", selfAccepted: true, given: "x" });
    expect(items.getItemReviewLevel(a.task.itemKey)).toBe(0);
    expect(localStorage.getItem("myenglish_grammar_answer_pool_v1") ?? "{}").not.toContain("ch01-l01");

    await session.recordGrammarAnswer(b, true, { mode: "review" });
    expect(items.getItemReviewLevel(b.task.itemKey)).toBe(1);
    expect(JSON.parse(localStorage.getItem("myenglish_grammar_answer_pool_v1")!)["ch01-l01"]).toMatchObject({ total: 1, correct: 1 });

    await session.recordGrammarAnswer(c, true, { mode: "review", skipped: true });
    expect(items.getItemReviewLevel(c.task.itemKey)).toBe(0);
    expect(grammar.getGrammarExerciseHistoryMap()[c.task.itemKey]).toMatchObject({ incorrect: 1, skipped: 1 });
    expect(JSON.parse(localStorage.getItem("myenglish_grammar_answer_pool_v1")!)["ch01-l01"]).toMatchObject({ total: 2, correct: 1 });
  });
});

describe("G9 / G11: first grade, mastery, XP", () => {
  it("the first grade after learning is at most Good, Hard on any miss; a redo the same day earns no XP", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = new Date("2026-10-11T09:00:00");
    vi.setSystemTime(now);
    const { session, grammar } = await fixtureBook();
    const { createEmptyCard, Rating } = await import("ts-fsrs");
    const { getGrammarScheduler } = await import("@/services/srs");
    const difficultyFor = (r: typeof Rating.Good) => Number(getGrammarScheduler().next(createEmptyCard(now), now, r).card.difficulty.toFixed(4));

    const perfect = await session.finishLearnSession("ch01-l01", [true, true, true, true]);
    expect(grammar.getLessonProgress("ch01-l01").difficulty).toBe(difficultyFor(Rating.Good));
    expect(perfect.xpEarned).toBe(25);
    const redo = await session.finishLearnSession("ch01-l01", [true, true, true, true]);
    expect(redo.xpEarned).toBe(0);

    await session.finishLearnSession("ch01-l02", [true, true, true, true, true, true, true, false]);
    expect(grammar.getLessonProgress("ch01-l02").difficulty).toBe(difficultyFor(Rating.Hard));

    // A practice result on a lesson that is not due gives no XP
    expect((await grammar.recordPracticeResult("ch01-l01", 100)).xpEarned).toBe(0);
  });

  it("'Đã thuộc' needs two graded reviews, not only a perfect quick check", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T09:00:00"));
    const { session, grammar } = await fixtureBook();
    await session.finishLearnSession("ch01-l01", [true, true, true, true]);
    expect(grammar.getLessonProgress("ch01-l01")).toMatchObject({ mastery: 100, reps: 1 });
    expect(session.lessonStatus("ch01-l01")).toBe("learning");
    expect(grammar.getGrammarSummaryStats().masteredCount).toBe(0);
    expect(grammar.getLessonNextReview("ch01-l01")!.days).toBeGreaterThanOrEqual(1);
    expect(grammar.getLessonNextReview("ch01-l02")).toBeNull();

    vi.setSystemTime(new Date("2027-06-01T09:00:00"));
    expect((await grammar.recordPracticeResult("ch01-l01", 100)).xpEarned).toBe(15);
    expect(grammar.getLessonProgress("ch01-l01").reps).toBe(2);
    expect(session.lessonStatus("ch01-l01")).toBe("mastered");
    expect(grammar.getGrammarSummaryStats().masteredCount).toBe(1);
  });
});

describe("G10: the path keeps the lessons left out", () => {
  it("a chapter imported later joins the path; the old picked list is migrated", async () => {
    const { path, book } = await fixtureBook();
    path.toggleLessonSelection("ch01-l02");
    expect(path.getExcludedLessonIds()).toEqual(["ch01-l02"]);
    await book.saveGrammarBookChapter(lockedChapter());
    await book.getAllBookChapters();
    expect(path.getEffectiveLessonIds()).toEqual(["ch01-l01", "ch01-l03", "ch02-l01", "ch02-l02", "ch02-l03", "ch02-l04"]);
  });

  it("migrates a saved picked list: excluded = lessons of the book − picked", async () => {
    const { path, book } = await fixtureBook();
    localStorage.removeItem(path.GRAMMAR_EXCLUDED_KEY);
    localStorage.setItem(path.GRAMMAR_SELECTION_KEY, JSON.stringify(["ch01-l01", "ch01-l03"]));
    expect(path.getEffectiveLessonIds()).toEqual(["ch01-l01", "ch01-l03"]);
    expect(JSON.parse(localStorage.getItem(path.GRAMMAR_EXCLUDED_KEY)!)).toEqual(["ch01-l02"]);
    expect(localStorage.getItem(path.GRAMMAR_SELECTION_KEY)).toBeNull();
    await book.saveGrammarBookChapter(lockedChapter());
    await book.getAllBookChapters();
    expect(path.getEffectiveLessonIds()).toContain("ch02-l04");
    expect(path.getEffectiveLessonIds()).not.toContain("ch01-l02");
  });
});

describe("G11: grammar answers count toward the daily goal", () => {
  it("one count per question answered in the hub; retries and popup answers are not counted here", async () => {
    const { session } = await fixtureBook();
    const streak = await import("@/services/streak");
    const today = () => streak.getActivityLogs()[streak.getLocalDateString()] ?? 0;
    const [a, b, c, d] = await session.buildLessonExerciseSession("ch01-l01");
    await session.recordGrammarAnswer(a, true, { mode: "practice" });
    expect(today()).toBe(1);
    await session.recordGrammarAnswer(b, false, { mode: "learn", given: "x" });
    expect(today()).toBe(2);
    await session.recordGrammarAnswer(a, true, { mode: "retry" });
    await session.recordGrammarAnswer(c, true, { mode: "popup" });
    expect(today()).toBe(2);
    await session.recordGrammarAnswer(d, true, { mode: "review", hinted: true });
    expect(today()).toBe(3);
  });
});

describe("G15: the popup never introduces a lesson", () => {
  it("nothing studied: no grammar in the popup, and an intro answer does not mark the lesson as studied", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T09:00:00"));
    const { session, path } = await fixtureBook();
    expect(await session.getPopupGrammarItems(4)).toEqual([]);
    const [e] = await session.buildLessonExerciseSession("ch01-l01");
    await session.recordGrammarAnswer({ ...e, intro: true }, true, { mode: "popup" });
    expect(path.isLessonStudied("ch01-l01")).toBe(false);
    expect(path.lessonsIntroducedToday()).toEqual([]);
  });
});

describe("G16: progress written by another window", () => {
  it("is kept when this window saves, and a storage event refreshes the cache", async () => {
    const { grammar } = await fixtureBook();
    const key = "myenglish_grammar_progress_v1";
    const other = {
      lessonId: "ch01-l03",
      diagnosticStatus: "passed_first_try",
      score: 100,
      mastery: 90,
      reps: 2,
      lapses: 0,
      streak: 2,
      nextReviewDate: new Date(Date.now() + 5 * DAY).toISOString(),
    };
    const stored = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...stored, "ch01-l03": other }));
    await grammar.recordPracticeResult("ch01-l01", 100);
    expect(Object.keys(JSON.parse(localStorage.getItem(key)!))).toEqual(expect.arrayContaining(["ch01-l01", "ch01-l03"]));

    const later = { ...other, lessonId: "ch01-l02", mastery: 70 };
    const value = JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), "ch01-l02": later });
    localStorage.setItem(key, value);
    window.dispatchEvent(Object.assign(new Event("storage"), { key, newValue: value }));
    expect(grammar.getLessonProgress("ch01-l02").mastery).toBe(70);
  });
});

describe("G17: one lesson's exercises stay short", () => {
  it("at most 20 questions, every kind of exercise included", async () => {
    const items = [
      ...Array.from({ length: 25 }, (_, i) => makeItem("ch04-s01", i + 1, ["ch04-l01"])),
      ...Array.from({ length: 5 }, (_, i) => rewriteItem("ch04-s02", i + 1, ["ch04-l01"])),
    ];
    const ch = chapter("ch04", 4, ["ch04-l01"], items, [
      { id: "ch04-s01", type: "verb_form" },
      { id: "ch04-s02", type: "rewrite" },
    ]);
    const { session } = await freshBook([ch]);
    const entries = await session.buildLessonExerciseSession("ch04-l01");
    expect(entries).toHaveLength(session.LESSON_SESSION_MAX);
    expect(entries.filter((e) => e.task.setType === "rewrite")).toHaveLength(5);
  });
});

describe("G18: tiles accept every complete accepted answer", () => {
  it("another word order listed in the accepted answers is right", async () => {
    vi.resetModules();
    const items = await import("@/services/grammarItems");
    const met = makeItem("ch05-s01", 1, ["ch05-l01"], {
      prompt: "I met ___ at the station.",
      answers: [["Tom and Mary", "Mary and Tom"]],
      answerSentence: "I met Tom and Mary at the station.",
      ai: { vi: "Tôi gặp Tom và Mary ở nhà ga.", distractors: [[]], wrongSentences: [], explainVn: "", suggestedAnswers: [] },
    });
    const translate = items.buildTask(met, "fill_blank", "translate");
    expect(translate.format).toBe("translate");
    expect(items.checkTask(translate, { kind: "tiles", tiles: "I met Mary and Tom at the station.".split(" ") }).correct).toBe(true);
    expect(items.checkTask(translate, { kind: "tiles", tiles: "I met Tom at the station and Mary.".split(" ") }).correct).toBe(false);

    const ill = rewriteItem("ch05-s02", 1, ["ch05-l01"]);
    ill.prompt = "Tom was ill. He didn't come.";
    ill.answers = [["Tom didn't come because he was ill.", "Because he was ill, Tom didn't come."]];
    ill.answerSentence = "Tom didn't come because he was ill.";
    const order = items.buildTask(ill, "combine", "order");
    expect(order.format).toBe("order");
    expect(items.checkTask(order, { kind: "tiles", tiles: ["Because", "he", "was", "ill.", "Tom", "didn't", "come"] }).correct).toBe(true);
  });
});

describe("mistakes: the lesson link of a category comes from the imported book", () => {
  it("no book, no link; the tense chapter's first lesson once imported; no link for a chapter not imported", async () => {
    vi.resetModules();
    const empty = await import("@/services/mistakes");
    expect(await empty.getCategoryLesson("tense")).toBeUndefined();
    expect(empty.CATEGORY_LESSON.article).toBeUndefined();

    await fixtureBook();
    const mistakes = await import("@/services/mistakes");
    expect(await mistakes.getCategoryLesson("tense")).toMatchObject({ id: "ch01-l01" });
    expect(mistakes.CATEGORY_LESSON.tense?.id).toBe("ch01-l01");
    expect(await mistakes.getCategoryLesson("article")).toBeUndefined();
    expect(mistakes.CATEGORY_LESSON.agreement).toBeUndefined();
  });
});
