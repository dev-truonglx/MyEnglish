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

  it("resets the schedule on failure and does not advance on an immediate correct retry", async () => {
    const g = await freshGrammar();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T08:00:00Z"));
    await g.recordPracticeResult(lessonId, 100);

    // Come back when due, then fail
    vi.setSystemTime(new Date("2026-10-20T08:00:00Z"));
    await g.recordPracticeResult(lessonId, 40);
    const failed = g.getLessonProgress(lessonId);
    expect(failed.reps).toBe(0);
    expect(failed.lapses).toBe(1);

    await g.recordPracticeResult(lessonId, 100);
    expect(g.getLessonProgress(lessonId).reps).toBe(0);
  });

  it("lets mastery go down after a poor result", async () => {
    const g = await freshGrammar();
    await g.recordPracticeResult(lessonId, 100);
    const before = g.getLessonProgress(lessonId).mastery;
    await g.recordPracticeResult(lessonId, 20);
    expect(g.getLessonProgress(lessonId).mastery).toBeLessThan(before);
  });
});
