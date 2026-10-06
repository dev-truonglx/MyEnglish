import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  evaluateMotivationState,
  getConsecutiveSkipCount,
  incrementConsecutiveSkipCount,
  resetConsecutiveSkipCount,
  selectMicroQuizQuestion,
  evaluateMicroQuizAnswer,
} from "@/services/duoMotivation";
import { Rating } from "ts-fsrs";
import type { WordDetail } from "@/types/database";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@/services/srs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/srs")>();
  return {
    ...actual,
    recordReview: vi.fn().mockResolvedValue({}),
  };
});

vi.mock("@/services/streak", () => ({
  recordDailyActivity: vi.fn(),
  computeStreak: vi.fn().mockReturnValue({ current: 5, longest: 10, freezes: 1, frozenDates: [] }),
  getActivityLogs: vi.fn().mockReturnValue({}),
  getDailyGoal: vi.fn().mockReturnValue(10),
}));

describe("duoMotivation algorithm", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("evaluateMotivationState", () => {
    it("returns level 1 encouraging tone for fresh reminder", () => {
      const state = evaluateMotivationState({
        dueCount: 5,
        consecutiveSkips: 0,
        streak: 3,
        todayCount: 5,
        dailyGoal: 10,
        hour: 9, // 9 AM
      });
      expect(state.tone).toBe("level_1_encouraging");
      expect(state.mascotMood).toBe("happy");
      expect(state.isMicroQuizPreferred).toBe(false);
      expect(state.title).toContain("Đến giờ ôn tập");
    });

    it("returns level 2 playful guilt when user skipped 1 or 2 times", () => {
      const state1 = evaluateMotivationState({
        dueCount: 5,
        consecutiveSkips: 1,
        streak: 3,
        todayCount: 2,
        dailyGoal: 10,
        hour: 15,
      });
      expect(state1.tone).toBe("level_2_playful_guilt");
      expect(state1.mascotMood).toBe("pleading");
      expect(state1.isMicroQuizPreferred).toBe(false);

      const state2 = evaluateMotivationState({
        dueCount: 5,
        consecutiveSkips: 2,
        streak: 3,
        todayCount: 2,
        dailyGoal: 10,
        hour: 15,
      });
      expect(state2.tone).toBe("level_2_playful_guilt");
      expect(state2.isMicroQuizPreferred).toBe(true); // Auto trigger micro-quiz on 2 skips!
    });

    it("returns level 3 streak fomo in the late evening when goal is not reached", () => {
      const state = evaluateMotivationState({
        dueCount: 8,
        consecutiveSkips: 0,
        streak: 7,
        todayCount: 3,
        dailyGoal: 10,
        hour: 21, // 9 PM
      });
      expect(state.tone).toBe("level_3_streak_fomo");
      expect(state.mascotMood).toBe("alarm");
      expect(state.title).toContain("Cứu Streak");
      expect(state.isMicroQuizPreferred).toBe(true);
    });

    it("returns level 4 drama resignation when user skipped >= 3 times", () => {
      const state = evaluateMotivationState({
        dueCount: 12,
        consecutiveSkips: 3,
        streak: 10,
        todayCount: 1,
        dailyGoal: 10,
        hour: 14,
      });
      expect(state.tone).toBe("level_4_drama_resignation");
      expect(state.mascotMood).toBe("dramatic");
      expect(state.isMicroQuizPreferred).toBe(true);
    });

    it("handles large backlog of due words with backlog relief message", () => {
      const state = evaluateMotivationState({
        dueCount: 35,
        consecutiveSkips: 0,
        streak: 2,
        todayCount: 0,
        dailyGoal: 10,
        hour: 10,
      });
      expect(state.title).toContain("Cứu hộ khẩn cấp");
      expect(state.title).toContain("35 từ");
      expect(state.message).toContain("Đừng sợ số lượng nhiều");
    });

    it("provides smart timing contextual message for lunchtime", () => {
      const state = evaluateMotivationState({
        dueCount: 4,
        consecutiveSkips: 0,
        streak: 2,
        todayCount: 2,
        dailyGoal: 10,
        hour: 12, // 12 PM
      });
      expect(state.title).toContain("Tráng miệng");
    });

    it("provides smart timing contextual message for work end", () => {
      const state = evaluateMotivationState({
        dueCount: 4,
        consecutiveSkips: 0,
        streak: 2,
        todayCount: 2,
        dailyGoal: 10,
        hour: 18, // 6 PM
      });
      expect(state.title).toContain("Gập task xả hơi");
    });
  });

  describe("skip tracking", () => {
    it("increments and resets consecutive skips", () => {
      expect(getConsecutiveSkipCount()).toBe(0);
      expect(incrementConsecutiveSkipCount()).toBe(1);
      expect(incrementConsecutiveSkipCount()).toBe(2);
      expect(getConsecutiveSkipCount()).toBe(2);
      resetConsecutiveSkipCount();
      expect(getConsecutiveSkipCount()).toBe(0);
    });
  });

  describe("selectMicroQuizQuestion", () => {
    const dummyWords: WordDetail[] = [
      {
        id: "w1",
        word: "reluctant",
        phonetic: "/rɪˈlʌk.tənt/",
        part_of_speech: "adj",
        meaning_vn: "miễn cưỡng, bất đắc dĩ",
        topic: "General",
        created_at: new Date().toISOString(),
        srs: { state: 1, reps: 2, lapses: 0, difficulty: 4, stability: 2, scheduled_days: 1, elapsed_days: 2 },
      },
      {
        id: "w2",
        word: "procrastinate",
        phonetic: "/prəˈkræs.tə.neɪt/",
        part_of_speech: "verb",
        meaning_vn: "trì hoãn, chần chừ",
        topic: "General",
        created_at: new Date().toISOString(),
        srs: { state: 1, reps: 3, lapses: 3, difficulty: 7, stability: 1, scheduled_days: 1, elapsed_days: 5 }, // higher urgency (lapses & overdueness)
      },
      {
        id: "w3",
        word: "diligent",
        phonetic: "/ˈdɪl.ɪ.dʒənt/",
        part_of_speech: "adj",
        meaning_vn: "chăm chỉ, siêng năng",
        topic: "General",
        created_at: new Date().toISOString(),
        srs: { state: 1, reps: 5, lapses: 0, difficulty: 2, stability: 10, scheduled_days: 10, elapsed_days: 2 },
      },
    ];

    it("selects the most urgent word and generates 3 multiple choice options", () => {
      const q = selectMicroQuizQuestion(dummyWords, dummyWords);
      expect(q).not.toBeNull();
      // "procrastinate" has 3 lapses and high difficulty, so it has higher urgency score than w1 and w3
      expect(q?.word).toBe("procrastinate");
      expect(q?.options.length).toBeLessThanOrEqual(3);
      expect(q?.options.some((o) => o.isCorrect)).toBe(true);
    });
  });

  describe("evaluateMicroQuizAnswer", () => {
    const options = [
      { id: "opt1", text: "trì hoãn, chần chừ", isCorrect: true },
      { id: "opt2", text: "chăm chỉ, siêng năng", isCorrect: false },
      { id: "opt3", text: "miễn cưỡng", isCorrect: false },
    ];

    it("rates fast correct answer as Easy", async () => {
      const res = await evaluateMicroQuizAnswer({
        wordId: "w2",
        selectedChoiceId: "opt1",
        options,
        targetMeaning: "trì hoãn, chần chừ",
        responseTimeMs: 2000,
      });
      expect(res.isCorrect).toBe(true);
      expect(res.rating).toBe(Rating.Easy);
      expect(res.ratingLabel).toBe("Easy");
    });

    it("rates normal speed correct answer as Good", async () => {
      const res = await evaluateMicroQuizAnswer({
        wordId: "w2",
        selectedChoiceId: "opt1",
        options,
        targetMeaning: "trì hoãn, chần chừ",
        responseTimeMs: 5000,
      });
      expect(res.isCorrect).toBe(true);
      expect(res.rating).toBe(Rating.Good);
      expect(res.ratingLabel).toBe("Good");
    });

    it("rates slow correct answer as Hard", async () => {
      const res = await evaluateMicroQuizAnswer({
        wordId: "w2",
        selectedChoiceId: "opt1",
        options,
        targetMeaning: "trì hoãn, chần chừ",
        responseTimeMs: 9000,
      });
      expect(res.isCorrect).toBe(true);
      expect(res.rating).toBe(Rating.Hard);
      expect(res.ratingLabel).toBe("Hard");
    });

    it("rates incorrect answer as Again", async () => {
      const res = await evaluateMicroQuizAnswer({
        wordId: "w2",
        selectedChoiceId: "opt2",
        options,
        targetMeaning: "trì hoãn, chần chừ",
        responseTimeMs: 3000,
      });
      expect(res.isCorrect).toBe(false);
      expect(res.rating).toBe(Rating.Again);
      expect(res.ratingLabel).toBe("Again");
    });
  });
});
