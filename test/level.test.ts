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
  const knownWords = (count: number, cefr: string | null) =>
    Array.from({ length: count }, (_, i) =>
      makeWord(`${cefr ?? "x"}-${i}`, { cefr_level: cefr, srs: reviewSrs(15, 3) })
    );

  async function masterGrammar(level: string) {
    const { GRAMMAR_LESSONS } = await import("@/data/grammarData");
    const g = await import("@/services/grammarService");
    for (const lesson of GRAMMAR_LESSONS.filter((l) => l.level === level)) {
      await g.saveLessonProgress({
        lessonId: lesson.id,
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

  it("stays at A1 until A1 grammar AND A1 vocabulary are both done", async () => {
    vi.resetModules();
    const { assessUserProficiency } = await import("@/services/userProficiency");
    // Plenty of A1 words but no grammar yet
    expect(assessUserProficiency(knownWords(45, "A1")).assessedLevel).toBe("A1");

    await masterGrammar("A1");
    // Grammar done but only 10 known A1 words (+ tagged words of other levels)
    expect(assessUserProficiency([...knownWords(10, "A1"), ...knownWords(20, "B2")]).assessedLevel).toBe("A1");
    // Both done -> working on A2
    expect(assessUserProficiency(knownWords(45, "A1")).assessedLevel).toBe("A2");
  });

  it("does not let XP or streak raise the level", async () => {
    vi.resetModules();
    localStorage.setItem("myenglish_xp_v1", "90000");
    const { assessUserProficiency } = await import("@/services/userProficiency");
    const profile = assessUserProficiency(knownWords(5, "A1"));
    expect(profile.assessedLevel).toBe("A1");
    expect(profile.habitScore).toBeGreaterThan(0);
  });

  it("falls back to total known words when words are not tagged yet", async () => {
    vi.resetModules();
    const { assessUserProficiency } = await import("@/services/userProficiency");
    await masterGrammar("A1");
    const profile = assessUserProficiency(knownWords(35, null));
    expect(profile.levelVocab.A1).toEqual({ known: 35, target: 30 });
    expect(profile.assessedLevel).toBe("A2");
  });
});
