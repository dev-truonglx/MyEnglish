import { describe, it, expect } from "vitest";
import {
  formatNextReviewRelative,
  predictFutureWordReviews,
  predictFutureGrammarReviews,
  compareNextReview,
} from "@/utils/reviewSchedule";
import type { WordDetail } from "@/types/database";
import type { GrammarProgress } from "@/types/grammar";

describe("reviewSchedule utils", () => {
  const baseNow = new Date("2026-10-06T12:00:00.000Z");

  it("classifies new words correctly", () => {
    const res = formatNextReviewRelative(undefined, true, baseNow);
    expect(res.bucket).toBe("new");
    expect(res.urgency).toBe("new");
    expect(res.shortLabel).toBe("Mới");
  });

  it("classifies overdue items correctly", () => {
    // 2 hours ago
    const pastDate = new Date(baseNow.getTime() - 2 * 3600 * 1000);
    const res = formatNextReviewRelative(pastDate, false, baseNow);
    expect(res.bucket).toBe("due");
    expect(res.urgency).toBe("overdue");
    expect(res.label).toContain("Quá hạn 2 giờ");
  });

  it("classifies items due today correctly", () => {
    // 4 hours in the future
    const futureDate = new Date(baseNow.getTime() + 4 * 3600 * 1000);
    const res = formatNextReviewRelative(futureDate, false, baseNow);
    expect(res.bucket).toBe("today");
    expect(res.urgency).toBe("today");
    expect(res.label).toContain("Sau 4 giờ (Hôm nay)");
  });

  it("classifies items due in 1-3 days correctly", () => {
    // 2 days in the future
    const futureDate = new Date(baseNow.getTime() + 2 * 86400 * 1000);
    const res = formatNextReviewRelative(futureDate, false, baseNow);
    expect(res.bucket).toBe("1-3d");
    expect(res.urgency).toBe("near");
    expect(res.label).toContain("Sau 2 ngày");
  });

  it("classifies items due in 4-7 days correctly", () => {
    // 5 days in the future
    const futureDate = new Date(baseNow.getTime() + 5 * 86400 * 1000);
    const res = formatNextReviewRelative(futureDate, false, baseNow);
    expect(res.bucket).toBe("4-7d");
    expect(res.urgency).toBe("week");
    expect(res.label).toContain("Sau 5 ngày");
  });

  it("classifies long-term items (> 7 days) correctly", () => {
    // 20 days in the future
    const futureDate = new Date(baseNow.getTime() + 20 * 86400 * 1000);
    const res = formatNextReviewRelative(futureDate, false, baseNow);
    expect(res.bucket).toBe("future");
    expect(res.urgency).toBe("future");
    expect(res.label).toContain("Sau 20 ngày");
  });

  it("predicts future 4 reviews for a word using FSRS", () => {
    const mockWord: WordDetail = {
      id: "word-1",
      word: "synthesize",
      meaning_vn: "tổng hợp",
      image_url: null,
      synonyms: "[]",
      antonyms: "[]",
      created_at: baseNow.toISOString(),
      examples: [],
      srs: {
        word_id: "word-1",
        ease_factor: 2.5,
        interval: 3,
        repetitions: 2,
        stability: 3.5,
        difficulty: 4.8,
        next_review_date: new Date(baseNow.getTime() + 3 * 86400 * 1000).toISOString(),
      },
    };

    const projections = predictFutureWordReviews(mockWord, 4, baseNow);
    expect(projections).toHaveLength(4);
    expect(projections[0].step).toBe(1);
    expect(projections[0].isCurrentSchedule).toBe(true);

    // Each subsequent projection should be further in the future
    for (let i = 1; i < projections.length; i++) {
      expect(projections[i].date.getTime()).toBeGreaterThan(projections[i - 1].date.getTime());
    }
  });

  it("predicts future 4 reviews for a grammar lesson", () => {
    const mockProgress: GrammarProgress = {
      lessonId: "present-simple",
      diagnosticStatus: "passed_first_try",
      score: 100,
      mastery: 85,
      reps: 3,
      lapses: 0,
      streak: 3,
      stability: 5.0,
      difficulty: 4.0,
      nextReviewDate: new Date(baseNow.getTime() + 5 * 86400 * 1000).toISOString(),
    };

    const projections = predictFutureGrammarReviews(mockProgress, 4, baseNow);
    expect(projections).toHaveLength(4);
    expect(projections[0].step).toBe(1);
    for (let i = 1; i < projections.length; i++) {
      expect(projections[i].date.getTime()).toBeGreaterThan(projections[i - 1].date.getTime());
    }
  });

  it("sorts words correctly with compareNextReview (due soonest first, then future, then new)", () => {
    const overdueWord: WordDetail = {
      id: "w-overdue",
      word: "alpha",
      meaning_vn: "alpha",
      image_url: null,
      synonyms: "[]",
      antonyms: "[]",
      created_at: baseNow.toISOString(),
      examples: [],
      srs: {
        word_id: "w-overdue",
        ease_factor: 2.5,
        interval: 1,
        repetitions: 2,
        next_review_date: new Date(baseNow.getTime() - 2 * 3600 * 1000).toISOString(),
      },
    };

    const soonWord: WordDetail = {
      id: "w-soon",
      word: "beta",
      meaning_vn: "beta",
      image_url: null,
      synonyms: "[]",
      antonyms: "[]",
      created_at: baseNow.toISOString(),
      examples: [],
      srs: {
        word_id: "w-soon",
        ease_factor: 2.5,
        interval: 1,
        repetitions: 2,
        next_review_date: new Date(baseNow.getTime() + 4 * 3600 * 1000).toISOString(),
      },
    };

    const distantWord: WordDetail = {
      id: "w-distant",
      word: "gamma",
      meaning_vn: "gamma",
      image_url: null,
      synonyms: "[]",
      antonyms: "[]",
      created_at: baseNow.toISOString(),
      examples: [],
      srs: {
        word_id: "w-distant",
        ease_factor: 2.5,
        interval: 10,
        repetitions: 5,
        next_review_date: new Date(baseNow.getTime() + 10 * 86400 * 1000).toISOString(),
      },
    };

    const newWord: WordDetail = {
      id: "w-new",
      word: "delta",
      meaning_vn: "delta",
      image_url: null,
      synonyms: "[]",
      antonyms: "[]",
      created_at: baseNow.toISOString(),
      examples: [],
      srs: {
        word_id: "w-new",
        ease_factor: 2.5,
        interval: 0,
        repetitions: 0,
        next_review_date: baseNow.toISOString(),
      },
    };

    const list = [distantWord, newWord, soonWord, overdueWord];
    list.sort((a, b) => compareNextReview(a, b, baseNow));

    expect(list.map((w) => w.id)).toEqual([
      "w-overdue", // 2h overdue
      "w-soon",    // in 4h
      "w-distant", // in 10d
      "w-new",     // unlearned new word
    ]);
  });
});
