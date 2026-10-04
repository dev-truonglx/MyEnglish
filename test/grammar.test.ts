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
