import { describe, it, expect, vi, afterEach } from "vitest";
import p1 from "./fixtures/grammarBook/ch01-p1.json";
import p2 from "./fixtures/grammarBook/ch01-p2.json";
import type { GrammarBookFile, GrammarBookItem } from "@/types/grammarBook";

afterEach(() => {
  vi.useRealTimers();
});

async function freshGrammar() {
  vi.resetModules();
  return import("@/services/grammarService");
}

const files = () => [structuredClone(p1), structuredClone(p2)] as unknown as GrammarBookFile[];

/** The sample chapter merged, and a lookup of its items by place in the book ("ch01-s01#3") */
async function sampleChapter() {
  const book = await import("@/services/grammarBook");
  const chapter = book.mergeChapterParts(files()).get("ch01")!;
  const items = new Map(chapter.practiceGroups!.flatMap((g) => g.items.map((it) => [book.bookItemKey(it), it] as const)));
  const setType = (it: GrammarBookItem) => chapter.exerciseSets!.find((s) => s.id === it.setId)!.type;
  return { book, chapter, item: (key: string) => items.get(key)!, setType };
}

/** Fresh modules and database with the sample chapter imported */
async function importedBook() {
  vi.resetModules();
  const db = await import("@/services/db");
  await db.getDatabase();
  const book = await import("@/services/grammarBook");
  const chapter = book.mergeChapterParts(files()).get("ch01")!;
  await book.saveGrammarBookChapter(chapter);
  const grammar = await import("@/services/grammarService");
  await grammar.initGrammarStorage();
  const path = await import("@/services/grammarPath");
  const session = await import("@/services/grammarSession");
  await book.getAllBookChapters();
  return { db, book, grammar, path, session };
}

const keysOf = (entries: Array<{ task: { itemKey: string } }>) => entries.map((e) => e.task.itemKey).sort();

describe("importing the book data", () => {
  it("accepts the sample parts and merges them into one chapter", async () => {
    const { book, chapter } = await sampleChapter();
    for (const f of files()) expect(book.validateGrammarBookFile(f, "f.json").errors).toEqual([]);
    expect(book.validateChapterFiles(files())).toEqual([]);
    expect(chapter.lessons!.map((l) => l.id)).toEqual(["ch01-l01", "ch01-l02", "ch01-l03"]);
    expect(chapter.exerciseSets).toHaveLength(4);
    expect(chapter.stats).toMatchObject({ lessons: 3, sets: 4, groups: 4, items: 10 });
    // Importing the same part twice adds nothing
    const twice = book.mergeChapterParts([...files(), structuredClone(p2) as unknown as GrammarBookFile]).get("ch01")!;
    expect(twice.stats!.items).toBe(10);
  });

  it("reports what needs every file: a missing part, a set with fewer items, unknown lessons", async () => {
    const book = await import("@/services/grammarBook");
    const onlyExercises = [structuredClone(p2)] as unknown as GrammarBookFile[];
    const warnings = book.validateChapterFiles(onlyExercises).map((w) => w.message);
    expect(warnings.some((m) => m.includes("thiếu phần 1/2"))).toBe(true);
    const short = structuredClone(p2) as unknown as GrammarBookFile;
    short.exerciseSets![0].itemCount = 6;
    expect(book.validateChapterFiles([structuredClone(p1) as unknown as GrammarBookFile, short]).map((w) => w.message)).toContain(
      "Nhóm I: có 5/6 câu"
    );
  });

  it("rejects a wrong format, keeps a doubtful item as self-graded", async () => {
    const book = await import("@/services/grammarBook");
    expect(book.validateGrammarBookFile({ format: "x", version: 2, chapterId: "ch01" }).valid).toBe(false);
    expect(book.validateGrammarBookFile({ format: "myenglish-grammar-book", version: 2, chapterId: "ch99" }).valid).toBe(false);
    const bad = structuredClone(p2) as unknown as GrammarBookFile;
    bad.practiceGroups![0].items[0].answers = [["drives"], ["extra"]];
    const res = book.validateGrammarBookFile(bad, "bad.json");
    expect(res.valid).toBe(true);
    expect(res.warnings.some((w) => w.message.includes("1 chỗ trống nhưng 2 đáp án"))).toBe(true);
    expect(res.data!.practiceGroups![0].items[0].selfGrade).toBe(true);
  });

  it("saves to the database and loads back in book order; re-importing a part adds to the chapter, replace drops the rest", async () => {
    const { book } = await importedBook();
    const chapters = await book.getAllBookChapters();
    expect(chapters).toHaveLength(1);
    expect(chapters[0].practiceGroups!.reduce((n, g) => n + g.items.length, 0)).toBe(10);
    expect(book.getKnownLessonIds()).toEqual(["ch01-l01", "ch01-l02", "ch01-l03"]);
    const onlyPart1 = () => book.mergeChapterParts([structuredClone(p1) as unknown as GrammarBookFile]).get("ch01")!;
    await book.saveGrammarBookChapter(onlyPart1());
    const again = await book.getAllBookChapters();
    expect(again[0].practiceGroups!.reduce((n, g) => n + g.items.length, 0)).toBe(10);
    await book.saveGrammarBookChapter(onlyPart1(), { mode: "replace" });
    const replaced = await book.getAllBookChapters();
    expect(replaced[0].practiceGroups).toHaveLength(0);
    expect(replaced[0].lessons).toHaveLength(3);
  });
});

describe("exercise formats from one item", () => {
  it("builds the full sentence from the prompt and its answers (cues removed)", async () => {
    const { item } = await sampleChapter();
    const items = await import("@/services/grammarItems");
    expect(items.fullSentence(item("ch01-s01#3"))).toBe("She usually drinks tea, but today she is drinking coffee.");
    expect(items.fillBlanks("It ___ (be) (1) cold, so we ___ (stay) (2) in.", ["was", "stayed"])).toBe("It was cold, so we stayed in.");
  });

  it("drops a distractor that is in fact a right answer", async () => {
    const { item } = await sampleChapter();
    const items = await import("@/services/grammarItems");
    expect(items.cleanDistractors(item("ch01-s01#5"), 0)).toEqual(["will rain", "rained"]);
  });

  it("multiple choice: one option per pair of forms for two blanks, exactly one right", async () => {
    const { item, setType } = await sampleChapter();
    const items = await import("@/services/grammarItems");
    const it = item("ch01-s01#3");
    const task = items.buildTask(it, setType(it), "choice");
    expect(task.options).toHaveLength(4);
    expect(task.options!.filter((o) => o === "drinks … is drinking")).toHaveLength(1);
    expect(items.checkTask(task, { kind: "option", index: task.correctOption! }).correct).toBe(true);
    const wrong = task.options!.findIndex((_, i) => i !== task.correctOption);
    expect(items.checkTask(task, { kind: "option", index: wrong }).correct).toBe(false);
  });

  it("error spotting marks exactly the wrong form", async () => {
    const { item, setType } = await sampleChapter();
    const items = await import("@/services/grammarItems");
    const it = item("ch01-s01#2");
    const task = items.buildTask(it, setType(it), "error", () => 0);
    const [a, b] = task.errorSpan!;
    expect(task.errorTokens!.slice(a, b + 1).join(" ")).toBe("play");
    expect(task.errorFix).toBe("are playing");
    expect(items.checkTask(task, { kind: "token", index: a }).correct).toBe(true);
    expect(items.checkTask(task, { kind: "token", index: 0 }).correct).toBe(false);
  });

  it("typing accepts contractions and case; tiles rebuild the answer; rewrites pick the right sentence", async () => {
    const { item, setType } = await sampleChapter();
    const items = await import("@/services/grammarItems");
    const listen = item("ch01-s02#2");
    const typed = items.buildTask(listen, setType(listen), "type");
    expect(typed.format).toBe("choice"); // a "choose" set is never typed
    const drink = item("ch01-s01#3");
    const t2 = items.buildTask(drink, setType(drink), "type");
    expect(items.checkTask(t2, { kind: "typed", values: ["Drinks", "is drinking"] }).correct).toBe(true);
    expect(items.checkTask(t2, { kind: "typed", values: ["drinks", "drinks"] }).correct).toBe(false);
    expect(items.wrongBlanks(t2, ["drinks", "drinks"])).toEqual([1]);

    const play = item("ch01-s01#2");
    const tiles = items.buildTask(play, setType(play), "order");
    expect(tiles.tilesIntoBlank).toBe(true);
    expect(items.checkTask(tiles, { kind: "tiles", tiles: ["are", "playing"] }).correct).toBe(true);

    const rewrite = item("ch01-s03#1");
    const pick = items.buildTask(rewrite, setType(rewrite), "pick_sentence");
    expect(pick.options).toHaveLength(3);
    expect(pick.options![pick.correctOption!]).toBe(rewrite.answerSentence);
    const write = items.buildTask(rewrite, setType(rewrite), "type");
    expect(items.checkTask(write, { kind: "typed", values: ["tom did not come to class yesterday because he was ill"] }).correct).toBe(true);
  });

  it("open completions are self-graded; an accepted answer counts from then on", async () => {
    const { item, setType } = await sampleChapter();
    const items = await import("@/services/grammarItems");
    const book = await import("@/services/grammarBook");
    const open = item("ch01-s04#1");
    expect(items.availableFormats(open, setType(open))).toEqual(["self"]);
    const visit = item("ch01-s01#4");
    const task = items.buildTask(visit, setType(visit), "type");
    expect(items.checkTask(task, { kind: "typed", values: ["went to see"] }).correct).toBe(false);
    book.saveUserAcceptedAnswer(task.itemKey, "went to see", 0);
    const again = items.buildTask(visit, setType(visit), "type");
    expect(items.checkTask(again, { kind: "typed", values: ["went to see"] }).correct).toBe(true);
  });

  it("the ladder goes from recognition to production", async () => {
    const { item, setType } = await sampleChapter();
    const items = await import("@/services/grammarItems");
    const it = item("ch01-s01#1");
    expect(items.formatForLevel(it, setType(it), 0)).toBe("choice");
    expect(items.formatForLevel(it, setType(it), 1)).toBe("error");
    expect(items.formatForLevel(it, setType(it), 2)).toBe("type");
    expect(items.updateItemReviewLevel("ch01-s01#1", true)).toBe(1);
    expect(items.updateItemReviewLevel("ch01-s01#1", true)).toBe(2);
    expect(items.updateItemReviewLevel("ch01-s01#1", true)).toBe(2);
    expect(items.updateItemReviewLevel("ch01-s01#1", false)).toBe(1);
  });
});

describe("the grammar path and sessions", () => {
  it("nothing picked means the whole book; unticking keeps the others", async () => {
    const { path } = await importedBook();
    expect(path.getEffectiveLessonIds()).toEqual(["ch01-l01", "ch01-l02", "ch01-l03"]);
    path.toggleLessonSelection("ch01-l02");
    expect(path.getEffectiveLessonIds()).toEqual(["ch01-l01", "ch01-l03"]);
  });

  it("a new lesson's quick check uses only that lesson (and lessons already studied)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T09:00:00"));
    const { path, session, grammar } = await importedBook();
    expect((await path.getNextLessonToLearn())!.id).toBe("ch01-l01");
    const first = await session.buildLearnSession("ch01-l01");
    expect(keysOf(first)).toEqual(["ch01-s01#1", "ch01-s01#5", "ch01-s02#1", "ch01-s03#2"]);

    await session.finishLearnSession("ch01-l01", [true, true, true, false]);
    expect(path.isLessonStudied("ch01-l01")).toBe(true);
    expect(grammar.getLessonProgress("ch01-l01").reps).toBe(1);
    const plan = await path.getTodayGrammarPlan();
    expect(plan.nextLesson!.id).toBe("ch01-l02");
    expect(plan.newLessonDoneToday).toBe(true);

    // The mixed question needs lesson 1, which is now studied
    expect(keysOf(await session.buildLearnSession("ch01-l02"))).toEqual(["ch01-s01#2", "ch01-s01#3", "ch01-s02#2"]);
  });

  it("reviews only due lessons, with questions whose lessons are all studied; answers grade the lesson", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T09:00:00"));
    const { session, grammar } = await importedBook();
    await session.finishLearnSession("ch01-l01", [true, true, true, true]);
    await session.finishLearnSession("ch01-l03", [true, true]);
    expect(await session.buildReviewSession()).toEqual([]); // nothing due yet

    vi.setSystemTime(new Date("2026-11-30T09:00:00"));
    expect(grammar.getDueGrammarLessons().sort()).toEqual(["ch01-l01", "ch01-l03"]);
    const review = await session.buildReviewSession(12);
    // Lesson 2 is not studied: the mixed question (lessons 1+2) is left out; the open completion too
    expect(keysOf(review)).toEqual(["ch01-s01#1", "ch01-s01#4", "ch01-s01#5", "ch01-s02#1", "ch01-s03#1", "ch01-s03#2"]);

    const before = grammar.getLessonProgress("ch01-l01");
    const l01 = review.filter((e) => e.lessonIds.includes("ch01-l01")).slice(0, 3);
    for (const e of l01) await session.recordGrammarAnswer(e, true, { mode: "review" });
    const after = grammar.getLessonProgress("ch01-l01");
    expect(after.reps).toBe(before.reps + 1);
    expect(new Date(after.nextReviewDate).getTime()).toBeGreaterThan(new Date("2026-11-30T09:00:00").getTime());
  });

  it("practice by tense: only questions that use the picked lessons", async () => {
    const { session } = await importedBook();
    expect(keysOf(await session.buildPracticeSession(["ch01-l02"]))).toEqual(["ch01-s01#2", "ch01-s02#2"]);
    expect(keysOf(await session.buildPracticeSession(["ch01-l01", "ch01-l02"]))).toEqual([
      "ch01-s01#1", "ch01-s01#2", "ch01-s01#3", "ch01-s01#5", "ch01-s02#1", "ch01-s02#2", "ch01-s03#2",
    ]);
  });

  it("a lesson's exercises: only the questions of that tense alone, missed ones first", async () => {
    const { session } = await importedBook();
    const l01 = await session.buildLessonExerciseSession("ch01-l01");
    expect(keysOf(l01)).toEqual(["ch01-s01#1", "ch01-s01#5", "ch01-s02#1", "ch01-s03#2"]); // not the mixed ch01-s01#3
    expect(l01.map((e) => e.task.itemKey)).toEqual(["ch01-s01#1", "ch01-s01#5", "ch01-s02#1", "ch01-s03#2"]); // book order
    const l03 = await session.buildLessonExerciseSession("ch01-l03");
    expect(l03.find((e) => e.task.itemKey === "ch01-s04#1")?.task.format).toBe("self");
    // A question answered right waits (cooldown), a missed one comes first
    const g = await import("@/services/grammarService");
    g.recordGrammarExerciseAttempt("ch01-s01#1", true);
    g.recordGrammarExerciseAttempt("ch01-s02#1", false);
    const again = (await session.buildLessonExerciseSession("ch01-l01", new Date(Date.now() + 3_600_000))).map((e) => e.task.itemKey);
    expect(again[again.length - 1]).toBe("ch01-s01#1");
    expect(session.lessonExerciseMode("ch01-l01")).toBe("practice");
    await session.finishLearnSession("ch01-l01", [true]);
    expect(session.lessonExerciseMode("ch01-l01")).toBe("review");
  });

  it("a hidden question is never asked again", async () => {
    const { session, book } = await importedBook();
    book.hideItem("ch01-s01#2");
    expect(keysOf(await session.buildPracticeSession(["ch01-l02"]))).toEqual(["ch01-s02#2"]);
  });

  it("a book exercise set keeps its order and native format, and its score", async () => {
    const { session } = await importedBook();
    const set = await session.buildBookSetSession("ch01-s01");
    expect(set.map((e) => e.task.itemKey)).toEqual(["ch01-s01#1", "ch01-s01#2", "ch01-s01#3", "ch01-s01#4", "ch01-s01#5"]);
    expect(set.every((e) => e.task.format === "type")).toBe(true);
    const score = await session.finishBookSet("ch01-s01", set.map((entry, i) => ({ entry, correct: i !== 2 })));
    expect(score).toBe(80);
    expect(session.getSetScores()["ch01-s01"]).toMatchObject({ best: 80, last: 80 });
  });

  it("popup: never introduces a new lesson, reviews studied lessons in pairs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T09:00:00"));
    const { session, path } = await importedBook();
    // Nothing studied yet: nothing to review, and no lesson is met in a popup
    expect(await session.getPopupGrammarItems(4)).toEqual([]);
    expect(path.isLessonStudied("ch01-l01")).toBe(false);

    await session.finishLearnSession("ch01-l01", [true, true, true]);
    const later = await session.getPopupGrammarItems(4);
    expect(later.length).toBe(2);
    expect(later.every((p) => !p.intro && p.entry.lessonIds.every((id) => id === "ch01-l01"))).toBe(true);
    expect(later[0].lesson.formula.positive).toContain("Khẳng định: S + V(s/es)");
    for (const p of later) expect(p.exercise.options!.filter((o) => o === p.exercise.correctAnswer[0])).toHaveLength(1);
    expect(path.isLessonStudied("ch01-l02")).toBe(false);
  });

  it("a lesson taken off the path is not due", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T09:00:00"));
    const { session, grammar, path } = await importedBook();
    await session.finishLearnSession("ch01-l01", [true]);
    vi.setSystemTime(new Date("2026-12-30T09:00:00"));
    expect(grammar.getDueGrammarLessons()).toEqual(["ch01-l01"]);
    path.toggleLessonSelection("ch01-l01");
    expect(grammar.getDueGrammarLessons()).toEqual([]);
    expect(grammar.getGrammarSummaryStats()).toMatchObject({ totalLessons: 2, studiedCount: 0, dueCount: 0 });
  });
});

describe("gradeFromScore", () => {
  it("maps scores to FSRS grades", async () => {
    const g = await freshGrammar();
    const { Rating } = await import("ts-fsrs");
    expect(g.gradeFromScore(40)).toBe(Rating.Again);
    expect(g.gradeFromScore(70)).toBe(Rating.Hard);
    expect(g.gradeFromScore(100)).toBe(Rating.Good);
    expect(g.gradeFromScore(100, true)).toBe(Rating.Easy);
  });
});

describe("recordPracticeResult", () => {
  const lessonId = "ch01-l01";

  it("advances the interval once per session, not once per question", async () => {
    const g = await freshGrammar();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));

    await g.recordPracticeResult(lessonId, 100);
    const afterFirst = g.getLessonProgress(lessonId);
    await g.recordPracticeResult(lessonId, 100);
    await g.recordPracticeResult(lessonId, 100);
    const afterThree = g.getLessonProgress(lessonId);

    expect(afterThree.reps).toBe(afterFirst.reps);
    expect(afterThree.nextReviewDate).toBe(afterFirst.nextReviewDate);
  });

  it("brings a failed lesson back soon and ignores an immediate correct retry", async () => {
    const g = await freshGrammar();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));
    await g.recordPracticeResult(lessonId, 100);

    // Come back when due, then fail
    vi.setSystemTime(new Date("2026-11-20T08:00:00Z"));
    await g.recordPracticeResult(lessonId, 40);
    const failed = g.getLessonProgress(lessonId);
    expect(failed.lapses).toBe(1);
    expect(new Date(failed.nextReviewDate).getTime() - Date.now()).toBeLessThanOrEqual(3 * 86400000);

    await g.recordPracticeResult(lessonId, 100);
    const retried = g.getLessonProgress(lessonId);
    expect(retried.nextReviewDate).toBe(failed.nextReviewDate);
    expect(retried.reps).toBe(failed.reps);
  });

  it("schedules whole days, never minute-level learning steps", async () => {
    const g = await freshGrammar();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));
    await g.recordPracticeResult(lessonId, 40);
    const p = g.getLessonProgress(lessonId);
    expect(new Date(p.nextReviewDate).getTime() - Date.now()).toBeGreaterThanOrEqual(86400000 - 1000);
    expect(p.stability).toBeGreaterThan(0);
  });

  it("counts a failure on a lesson that is not due yet, but only once per session", async () => {
    const g = await freshGrammar();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));
    await g.recordPracticeResult(lessonId, 100);

    vi.setSystemTime(new Date("2026-10-06T08:00:00Z")); // before the next review date
    await g.recordPracticeResult(lessonId, 40);
    const afterFail = g.getLessonProgress(lessonId);
    await g.recordPracticeResult(lessonId, 40);
    expect(g.getLessonProgress(lessonId).nextReviewDate).toBe(afterFail.nextReviewDate);
  });

  it("converts progress from the old fixed-interval schedule", async () => {
    const g = await freshGrammar();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T08:00:00Z"));
    // Old format: 3 consecutive reps, 14-day interval that is now due, no FSRS fields
    await g.saveLessonProgress({
      lessonId,
      diagnosticStatus: "reviewed_and_passed",
      score: 100,
      mastery: 90,
      reps: 3,
      lapses: 0,
      streak: 3,
      lastAttemptDate: "2026-10-05T08:00:00Z",
      nextReviewDate: "2026-10-19T08:00:00Z",
    });
    await g.recordPracticeResult(lessonId, 100);
    const p = g.getLessonProgress(lessonId);
    // A 14-day memory recalled on time grows well beyond the old interval
    expect(p.stability).toBeGreaterThan(14);
    expect(new Date(p.nextReviewDate).getTime() - Date.now()).toBeGreaterThan(14 * 86400000);
  });

  it("lets mastery go down after a poor result", async () => {
    const g = await freshGrammar();
    await g.recordPracticeResult(lessonId, 100);
    const before = g.getLessonProgress(lessonId).mastery;
    await g.recordPracticeResult(lessonId, 20);
    expect(g.getLessonProgress(lessonId).mastery).toBeLessThan(before);
  });
});

describe("recordGrammarExerciseAttempt & skipping", () => {
  it("records skipped exercise attempt and increments skipped count", async () => {
    const g = await freshGrammar();
    const testExId = "test_skip_ex_1";
    g.recordGrammarExerciseAttempt(testExId, false, true);

    const history = g.getGrammarExerciseHistoryMap();
    expect(history[testExId]).toBeDefined();
    expect(history[testExId].attempts).toBe(1);
    expect(history[testExId].incorrect).toBe(1);
    expect(history[testExId].skipped).toBe(1);
  });


  it("clears skipped flag and decrements incorrect count upon consecutive correct answers", async () => {
    const g = await freshGrammar();
    const testExId = "test_decay_ex_1";

    // First user makes a mistake then skips
    g.recordGrammarExerciseAttempt(testExId, false, false);
    g.recordGrammarExerciseAttempt(testExId, false, true);
    let history = g.getGrammarExerciseHistoryMap();
    expect(history[testExId].attempts).toBe(2);
    expect(history[testExId].incorrect).toBe(2);
    expect(history[testExId].skipped).toBe(1);
    expect(history[testExId].consecutiveCorrect).toBe(0);

    // Then user answers correctly: skipped is cleared immediately, incorrect is decremented
    g.recordGrammarExerciseAttempt(testExId, true, false);
    history = g.getGrammarExerciseHistoryMap();
    expect(history[testExId].attempts).toBe(3);
    expect(history[testExId].incorrect).toBe(1); // 2 - 1
    expect(history[testExId].skipped).toBe(0); // cleared!
    expect(history[testExId].consecutiveCorrect).toBe(1);

    // Another consecutive correct answer reduces incorrect further
    g.recordGrammarExerciseAttempt(testExId, true, false);
    history = g.getGrammarExerciseHistoryMap();
    expect(history[testExId].attempts).toBe(4);
    expect(history[testExId].incorrect).toBe(0); // 1 - 2 => 0
    expect(history[testExId].consecutiveCorrect).toBe(2);
  });

  it("calculates reasonable cooldown hours based on consecutive correct answers", async () => {
    const g = await freshGrammar();
    expect(g.getGrammarExerciseCooldownHours(0)).toBe(0.75); // a missed question waits 45 minutes
    expect(g.getGrammarExerciseCooldownHours(1)).toBe(12); // 12 hours
    expect(g.getGrammarExerciseCooldownHours(2)).toBe(48); // 2 days
    expect(g.getGrammarExerciseCooldownHours(3)).toBe(120); // 5 days
    expect(g.getGrammarExerciseCooldownHours(4)).toBe(240); // 10 days
  });

  it("returns the stored history as is (no hard-coded resets erase mistakes)", async () => {
    const g = await freshGrammar();
    const stored = {
      "prac-ps-3": { exerciseId: "prac-ps-3", attempts: 9, incorrect: 4, skipped: 2, lastAttempt: "2026-10-08T04:44:20.918Z" },
    };
    localStorage.setItem("myenglish_grammar_exercise_history_v1", JSON.stringify(stored));
    expect(g.getGrammarExerciseHistoryMap()).toEqual(stored);
  });
});

describe("lesson grading from popup answers", () => {
  it("pools first answers until there are 3, so one miss is Hard rather than Again", async () => {
    const g = await freshGrammar();
    expect(g.poolLessonAnswer("ch01-l01", true)).toBeNull();
    expect(g.poolLessonAnswer("ch01-l01", false)).toBeNull();
    const score = g.poolLessonAnswer("ch01-l01", true);
    expect(score).toBe(67);
    expect(g.gradeFromScore(score!)).toBe(2); // Hard
    expect(g.poolLessonAnswer("ch01-l01", true)).toBeNull(); // a new pool starts
  });
});

describe("the tense table", () => {
  it("places the 13 tense titles of the book (as the data names them) in their cells", async () => {
    const { tenseCell, buildTenseGrid } = await import("@/utils/tenseGrid");
    const titles = [
      "The Present Simple Tense", "The Present Continuous Tense", "The Present Perfect Tense", "The Present Perfect Continuous Tense",
      "The Past Simple Tense", "The Past Continuous Tense", "The Past Perfect Tense", "The Past Perfect Continuous Tense",
      "The simple Future Tense", "Near Future", "The Future Continuous Tense", "The Future Perfect Tense", "The Future Perfect Continuous Tense",
    ];
    expect(tenseCell("The simple Future Tense")).toEqual({ time: "future", aspect: "simple" });
    expect(tenseCell("Near Future")).toEqual({ time: "future", aspect: "near" });
    expect(tenseCell("The Past Perfect Continuous Tense")).toEqual({ time: "past", aspect: "perfect_continuous" });
    expect(tenseCell("Relative clauses")).toBeNull();
    const grid = buildTenseGrid(titles.map((title, i) => ({ id: `l${i + 1}`, title })))!;
    expect(grid.cells.size).toBe(12);
    expect(grid.near?.id).toBe("l10");
    expect(grid.cells.get("future:perfect_continuous")?.id).toBe("l13");
    // Not a tense chapter
    expect(buildTenseGrid(["Who", "Which", "Whose", "Where"].map((title, i) => ({ id: `r${i}`, title })))).toBeNull();
  });
});
