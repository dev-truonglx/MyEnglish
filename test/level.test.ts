import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeCefr, isWithinLevel } from "@/services/cefr";
import { makeWord, reviewSrs } from "./helpers";

let aiResponse: unknown;
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => aiResponse),
}));

beforeEach(() => {
  aiResponse = undefined;
});

describe("CEFR helpers", () => {
  it("parses loose level strings", () => {
    expect(normalizeCefr("b1")).toBe("B1");
    expect(normalizeCefr("Level C1+")).toBe("C1");
    expect(normalizeCefr("advanced")).toBeNull();
    expect(normalizeCefr(undefined)).toBeNull();
  });

  it("keeps words at or below the learner level", () => {
    expect(isWithinLevel("A1", "A1")).toBe(true);
    expect(isWithinLevel("A2", "A1")).toBe(false);
    expect(isWithinLevel("A1", "B2")).toBe(true);
    expect(isWithinLevel(null, "A1")).toBe(true);
  });
});

describe("AI results", () => {
  it("drops recommended words above the learner level", async () => {
    vi.resetModules();
    const { generateVocabularyRecommendationsAI } = await import("@/services/ai");
    aiResponse = [
      { word: "meeting", cefr: "A1", meaning_vn: "cuộc họp", topic: "Everyday Life" },
      { word: "idempotent", cefr: "C1", meaning_vn: "lũy đẳng", topic: "System Design" },
      { word: "send", cefr: "a1", meaning_vn: "gửi", topic: "weird topic" },
    ];
    const words = await generateVocabularyRecommendationsAI("A1", []);
    expect(words.map((w) => w.word)).toEqual(["meeting", "send"]);
    expect(words[1].topic).toBe("General Tech"); // unknown topics snap to the fixed list
  });

  it("reads the term's CEFR level from enrichment", async () => {
    vi.resetModules();
    const { enrichWordWithGemini } = await import("@/services/ai");
    aiResponse = { cefr: "B2", meaning_vn: "độ trễ", topic: "Networking & APIs", examples: [], synonyms: [], antonyms: [] };
    const res = await enrichWordWithGemini("latency", "A1");
    expect(res.cefr).toBe("B2");
    expect(res.topic).toBe("Networking & APIs");
  });
});

describe("word CEFR tag", () => {
  it("is stored with the word", async () => {
    vi.resetModules();
    const db = await import("@/services/db");
    await db.insertEnrichedWord({ word: "meeting", meaning_vn: "cuộc họp", cefr_level: "A1", synonyms: [], antonyms: [], examples: [] });
    const [w] = await db.getAllWords();
    expect(w.cefr_level).toBe("A1");
  });
});

describe("assessUserProficiency", () => {
  // A level's vocabulary is complete at 80% of the deck's words of that level (A1: 729 of 911, A2: 646 of 808)
  const A1_TARGET = 729;
  const A2_TARGET = 646;
  const knownWords = (count: number, cefr: string | null) =>
    Array.from({ length: count }, (_, i) =>
      makeWord(`${cefr ?? "x"}-${i}`, { cefr_level: cefr, srs: reviewSrs(15, 3) })
    );

  async function masterGrammar(lessonIds: string[]) {
    const g = await import("@/services/grammarService");
    for (const id of lessonIds) {
      await g.saveLessonProgress({
        lessonId: id,
        diagnosticStatus: "passed_first_try",
        score: 100,
        mastery: 100,
        reps: 3,
        lapses: 0,
        streak: 3,
        nextReviewDate: new Date(Date.now() + 10 * 86400000).toISOString(),
      });
    }
  }

  it("stays at A1 until A1 vocabulary target is reached", async () => {
    vi.resetModules();
    const { assessUserProficiency } = await import("@/services/userProficiency");
    // Only 10 known A1 words (+ tagged words of other levels) -> stays A1
    expect(assessUserProficiency([...knownWords(10, "A1"), ...knownWords(20, "B2")]).assessedLevel).toBe("A1");
    // Target reached -> working on A2
    expect(assessUserProficiency(knownWords(A1_TARGET, "A1")).assessedLevel).toBe("A2");
  });

  it("calculates grammarScore based on percentage of selected lessons mastered", async () => {
    vi.resetModules();
    const { saveSelectedLessonIds } = await import("@/services/grammarPath");
    const { assessUserProficiency } = await import("@/services/userProficiency");
    saveSelectedLessonIds(["ch01-l01", "ch01-l02"]);
    await masterGrammar(["ch01-l01"]);

    const prof = assessUserProficiency([]);
    expect(prof.grammarScore).toBe(50); // 1 of 2 mastered
  });

  it("does not let XP or streak raise the level", async () => {
    vi.resetModules();
    localStorage.setItem("myenglish_xp_v1", "90000");
    const { assessUserProficiency } = await import("@/services/userProficiency");
    const profile = assessUserProficiency(knownWords(5, "A1"));
    expect(profile.assessedLevel).toBe("A1");
    expect(profile.habitScore).toBeGreaterThan(0);
  });

  it("counts untagged words toward the lowest unfinished levels", async () => {
    vi.resetModules();
    const { assessUserProficiency } = await import("@/services/userProficiency");
    expect(assessUserProficiency(knownWords(35, null)).levelVocab.A1).toEqual({ known: 35, target: A1_TARGET });
    const profile = assessUserProficiency([...knownWords(10, "A1"), ...knownWords(A1_TARGET - 10 + 5, null)]);
    expect(profile.levelVocab.A1).toEqual({ known: A1_TARGET, target: A1_TARGET });
    expect(profile.levelVocab.A2).toEqual({ known: 5, target: A2_TARGET });
    expect(profile.assessedLevel).toBe("A2");
  });

  it("does not pass a lesson from a single lucky practice answer", async () => {
    vi.resetModules();
    const g = await import("@/services/grammarService");
    await g.recordPracticeResult("ch01-l01", 100);
    const lesson = g.getLessonProgress("ch01-l01");
    expect(lesson.diagnosticStatus).toBe("unattempted");
    expect(lesson.mastery).toBe(50);
    // Practiced lessons still get scheduled reviews
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 30 * 86400000));
    expect(g.getDueGrammarLessons()).toContain("ch01-l01");
    vi.useRealTimers();
  });
});
