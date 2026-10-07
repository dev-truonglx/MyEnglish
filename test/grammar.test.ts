import { describe, it, expect, vi, afterEach } from "vitest";
import { GRAMMAR_LESSONS } from "@/data/grammarData";

afterEach(() => {
  vi.useRealTimers();
});

async function freshGrammar() {
  vi.resetModules();
  return import("@/services/grammarService");
}

describe("grammar data", () => {
  const exercises = GRAMMAR_LESSONS.flatMap((l) => [...l.diagnosticExercises, ...l.practiceExercises]);

  it("has unique exercise and lesson ids", () => {
    const ids = exercises.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const lessonIds = GRAMMAR_LESSONS.map((l) => l.id);
    expect(new Set(lessonIds).size).toBe(lessonIds.length);
  });

  it("keeps every multiple-choice answer among its options", () => {
    for (const ex of exercises.filter((e) => e.type === "multiple_choice")) {
      const answers = Array.isArray(ex.correctAnswer) ? ex.correctAnswer : [ex.correctAnswer];
      const options = (ex.options ?? []).map((o) => o.toLowerCase());
      expect(answers.some((a) => options.includes(a.toLowerCase())), ex.id).toBe(true);
    }
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
  const lessonId = GRAMMAR_LESSONS[0].id;

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

  it("prioritizes skipped exercises during smart preparation", async () => {
    const g = await freshGrammar();
    const ex1 = {
      id: "ex_mastered_1",
      type: "multiple_choice" as const,
      promptEn: "He ___ every day.",
      correctAnswer: "walks",
      options: ["walk", "walks", "walked"],
      explanation: "Present simple third person singular.",
    };
    const ex2 = {
      id: "ex_skipped_2",
      type: "conjugation" as const,
      promptEn: "They ___ (leave) yesterday.",
      correctAnswer: "left",
      explanation: "Past simple irregular verb.",
    };

    // Mark ex1 as answered correctly multiple times
    g.recordGrammarExerciseAttempt(ex1.id, true, false);
    g.recordGrammarExerciseAttempt(ex1.id, true, false);

    // Mark ex2 as skipped (user did not know it)
    g.recordGrammarExerciseAttempt(ex2.id, false, true);

    const prepared = g.smartPrepareGrammarExercises([ex1, ex2]);
    // ex2 should be sorted first due to urgency weighting of skipped/incorrect status
    expect(prepared[0].id).toBe(ex2.id);
  });
});


describe("popup grammar comes in lesson pairs", () => {
  it("returns exercises two per lesson so a lesson is graded on two answers", async () => {
    vi.resetModules();
    const db = await import("@/services/db");
    await db.getDatabase();
    const g = await import("@/services/grammarService");
    const items = await g.getGrammarExercisesForReview(["A1", "A2"], 4);
    expect(items).toHaveLength(4);
    const perLesson = new Map<string, number>();
    for (const i of items) perLesson.set(i.lesson.id, (perLesson.get(i.lesson.id) ?? 0) + 1);
    for (const n of perLesson.values()) expect(n).toBe(g.MIN_LESSON_ANSWERS);
  });
});
