import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  calculateReflexXP,
  speedRating,
  buildCandidatePool,
  generateReflexQuestions,
  getReflexStats,
  recordReflexCompletion,
  classifyWord,
  WORD_CATEGORY_LABELS,
  isReflexPracticedToday,
  type ReflexSummary,
} from "@/services/reflexChallenge";
import type { WordDetail } from "@/types/database";
import type { CatalogEntry } from "@/services/vocabCatalog";

function makeFakeWord(id: string, word: string, meaning: string, pos = "noun", wrongAttempts = 0): WordDetail {
  return {
    id,
    word,
    phonetic: "/test/",
    part_of_speech: pos,
    meaning_vn: meaning,
    image_url: null,
    synonyms: "[]",
    antonyms: "[]",
    created_at: new Date().toISOString(),
    srs: {
      word_id: id,
      ease_factor: 2.5,
      interval: 1,
      repetitions: 1,
      next_review_date: new Date().toISOString(),
      state: 1,
      stability: 3,
      difficulty: 3,
      reps: 2,
      lapses: 0,
      due: new Date().toISOString(),
      last_review: new Date().toISOString(),
    },
    stats: {
      totalAttempts: 5,
      correctCount: 5 - wrongAttempts,
      wrongCount: wrongAttempts,
      accuracy: Math.round(((5 - wrongAttempts) / 5) * 100),
    },
  };
}

function makeFakeCatalog(id: string, word: string, vn: string, pos = "noun"): CatalogEntry {
  return {
    id,
    word,
    cefr: "A1",
    list: 3000,
    order: 1,
    freq: 100,
    it: false,
    pos,
    vn,
    senses: [{ pos, vn }],
    ipaUs: ["/us/"],
    ipaUk: ["/uk/"],
    variants: [],
    irregular: [],
    examples: [],
  };
}

describe("reflexChallenge service", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("calculateReflexXP", () => {
    it("returns 0 XP when no tiers are cleared", () => {
      const res = calculateReflexXP(0, null, false);
      expect(res.totalXP).toBe(0);
      expect(res.baseXP).toBe(0);
      expect(res.perfectBonus).toBe(0);
      expect(res.tierBreakdown).toEqual([]);
    });

    it("awards 15 XP for Tier 1", () => {
      const res = calculateReflexXP(1, null, false);
      expect(res.totalXP).toBe(15);
      expect(res.tierBreakdown).toEqual([15]);
    });

    it("awards 40 XP for Tier 2 (15 + 25)", () => {
      const res = calculateReflexXP(2, null, false);
      expect(res.totalXP).toBe(40);
      expect(res.tierBreakdown).toEqual([15, 25]);
    });

    it("awards 80 XP for Tier 3 (15 + 25 + 40)", () => {
      const res = calculateReflexXP(3, null, false);
      expect(res.totalXP).toBe(80);
      expect(res.tierBreakdown).toEqual([15, 25, 40]);
    });

    it("adds +10 Perfect Bonus when all 3 tiers are cleared with no mistakes", () => {
      const res = calculateReflexXP(3, null, true);
      expect(res.totalXP).toBe(90);
      expect(res.baseXP).toBe(80);
      expect(res.perfectBonus).toBe(10);
    });

    it("applies 50% penalty to the tier where second chance was used", () => {
      // Used second chance in tier 3: tier 3 reward is 40 * 0.5 = 20
      const res = calculateReflexXP(3, 3, false);
      expect(res.tierBreakdown).toEqual([15, 25, 20]);
      expect(res.totalXP).toBe(60);

      // Used second chance in tier 2: tier 2 reward is Math.round(25 * 0.5) = 13
      const res2 = calculateReflexXP(2, 2, false);
      expect(res2.tierBreakdown).toEqual([15, 13]);
      expect(res2.totalXP).toBe(28);
    });
  });

  describe("speedRating", () => {
    it("classifies response times correctly", () => {
      expect(speedRating(1200).title).toContain("Tia chớp");
      expect(speedRating(2000).title).toContain("Nhanh như gió");
      expect(speedRating(3000).title).toContain("Vững vàng");
      expect(speedRating(4000).title).toContain("Bền bỉ");
    });
  });

  describe("buildCandidatePool", () => {
    it("extracts words from user deck and supplements from catalog when needed", () => {
      const words = [
        makeFakeWord("1", "apple", "quả táo"),
        makeFakeWord("2", "banana", "quả chuối"),
      ];
      const catalog = [
        makeFakeCatalog("c1", "cat", "con mèo"),
        makeFakeCatalog("c2", "dog", "con chó"),
      ];

      const pool = buildCandidatePool(words, catalog);
      expect(pool.length).toBe(4);
      expect(pool.some((w) => w.word === "apple")).toBe(true);
      expect(pool.some((w) => w.word === "cat")).toBe(true);
    });

    it("avoids duplicates in word pool", () => {
      const words = [
        makeFakeWord("1", "apple", "quả táo"),
        makeFakeWord("2", "Apple", "quả táo khác"),
      ];
      const pool = buildCandidatePool(words, []);
      expect(pool.length).toBe(1);
    });
  });

  describe("generateReflexQuestions", () => {
    it("generates exactly 37 questions divided into 3 tiers (10, 12, 15)", () => {
      const words: WordDetail[] = [];
      for (let i = 0; i < 20; i++) {
        words.push(makeFakeWord(`w_${i}`, `word_${i}`, `nghĩa của từ ${i}`, i % 2 === 0 ? "noun" : "verb"));
      }

      const questions = generateReflexQuestions(words, []);
      expect(questions.length).toBe(37);

      const tier1 = questions.filter((q) => q.tier === 1);
      const tier2 = questions.filter((q) => q.tier === 2);
      const tier3 = questions.filter((q) => q.tier === 3);

      expect(tier1.length).toBe(10);
      expect(tier2.length).toBe(12);
      expect(tier3.length).toBe(15);
    });

    it("ensures each choice question has valid options and matching correctIndex", () => {
      const words: WordDetail[] = [];
      for (let i = 0; i < 15; i++) {
        words.push(makeFakeWord(`w_${i}`, `word_${i}`, `nghĩa ${i}`));
      }

      const questions = generateReflexQuestions(words, []);
      const choiceQuestions = questions.filter((q) => q.type === "choice");

      expect(choiceQuestions.length).toBeGreaterThan(0);
      for (const q of choiceQuestions) {
        expect(q.options).toBeDefined();
        expect(q.options!.length).toBe(4);
        expect(q.correctIndex).toBeDefined();
        expect(q.correctIndex!).toBeGreaterThanOrEqual(0);
        expect(q.correctIndex!).toBeLessThan(q.options!.length);

        const correctText = q.options![q.correctIndex!];
        if (q.direction === "en_to_vn") {
          expect(correctText).toBe(q.targetMeaning);
        } else {
          expect(correctText).toBe(q.word);
        }
      }
    });

    it("ensures true_false questions have valid displayed pairs and isTrue flag", () => {
      const words: WordDetail[] = [];
      for (let i = 0; i < 10; i++) {
        words.push(makeFakeWord(`w_${i}`, `term_${i}`, `ý nghĩa ${i}`));
      }

      const questions = generateReflexQuestions(words, []);
      const tfQuestions = questions.filter((q) => q.type === "true_false");

      expect(tfQuestions.length).toBeGreaterThan(0);
      for (const q of tfQuestions) {
        expect(q.displayedPair).toBeDefined();
        expect(typeof q.isTrue).toBe("boolean");
        if (q.isTrue) {
          expect(q.displayedPair!.meaning).toBe(q.targetMeaning);
        }
      }
    });
  });

  describe("classifyWord and memory categories", () => {
    it("has labels defined for all 5 categories", () => {
      expect(WORD_CATEGORY_LABELS.leech).toBeDefined();
      expect(WORD_CATEGORY_LABELS.learning).toBeDefined();
      expect(WORD_CATEGORY_LABELS.remembered_long).toBeDefined();
      expect(WORD_CATEGORY_LABELS.known).toBeDefined();
      expect(WORD_CATEGORY_LABELS.catalog).toBeDefined();
    });

    it("classifies leech words with high wrongCount or lapses", () => {
      const leechWord = makeFakeWord("leech1", "obfuscate", "làm khó hiểu", "verb", 3);
      expect(classifyWord(leechWord)).toBe("leech");
    });

    it("classifies remembered_long words with high stability", () => {
      const longWord = makeFakeWord("long1", "apple", "quả táo", "noun", 0);
      longWord.srs = {
        ...longWord.srs!,
        stability: 30,
        state: 2,
      };
      expect(classifyWord(longWord)).toBe("remembered_long");
    });

    it("classifies known words", () => {
      const knownWord = makeFakeWord("known1", "hello", "xin chào", "noun", 0);
      knownWord.srs = {
        ...knownWord.srs!,
        state: 2,
        reps: 1,
        lapses: 0,
      };
      expect(classifyWord(knownWord)).toBe("known");
    });

    it("classifies learning words with low stability", () => {
      const learnWord = makeFakeWord("learn1", "serendipity", "sự may mắn tình cờ", "noun", 0);
      learnWord.srs = {
        ...learnWord.srs!,
        stability: 2,
        state: 1,
      };
      expect(classifyWord(learnWord)).toBe("learning");
    });
  });

  describe("stats and persistence", () => {
    it("records completion and updates reflex stats", () => {
      const summary: ReflexSummary = {
        tiersCleared: 3,
        totalXP: 90,
        baseXP: 80,
        bonusXP: 10,
        perfectBonus: true,
        secondChanceUsed: false,
        secondChanceTier: null,
        totalAnswered: 37,
        totalCorrect: 37,
        totalWrong: 0,
        accuracy: 100,
        avgResponseTimeMs: 1450,
        speedTitle: "Tia chớp ⚡",
        wrongWords: [],
        answers: [],
      };

      recordReflexCompletion(summary);
      const stats = getReflexStats();

      expect(stats.timesPlayed).toBe(1);
      expect(stats.bestXP).toBe(90);
      expect(stats.bestTier).toBe(3);
      expect(stats.fastestAvgMs).toBe(1450);
      expect(isReflexPracticedToday()).toBe(true);
    });

    it("returns false for isReflexPracticedToday when not played", () => {
      expect(isReflexPracticedToday()).toBe(false);
    });
  });
});
