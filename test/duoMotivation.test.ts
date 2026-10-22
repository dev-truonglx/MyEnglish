import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  evaluateMotivationState,
  getConsecutiveSkipCount,
  incrementConsecutiveSkipCount,
  resetConsecutiveSkipCount,
  selectMicroQuizQuestion,
  evaluateMicroQuizAnswer,
  copyVariantIndex,
  localDayNumber,
  reminderVariants,
  REMINDER_BRANCHES,
  type ReminderBranch,
  type ReminderCopyFacts,
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

/** The facts evaluateMotivationState builds from its params (no personal extras) */
const factsOf = (p: { dueCount: number; streak: number; todayCount: number; dailyGoal: number; freezes?: number }): ReminderCopyFacts => ({
  dueCount: p.dueCount,
  streak: p.streak,
  freezes: p.freezes ?? 0,
  todayCount: p.todayCount,
  dailyGoal: p.dailyGoal,
  fadingCount: 0,
  newToday: 0,
  questsLeft: 0,
});
const titlesOf = (branch: ReminderBranch, f: ReminderCopyFacts) => reminderVariants(branch, f).map((v) => v.title);

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
      expect(titlesOf("default", factsOf({ dueCount: 5, streak: 3, todayCount: 5, dailyGoal: 10 }))).toContain(state.title);
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
      expect(state1.mascotMood).toBe("happy"); // a skipped reminder is never answered with a pleading face
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
      const titles = titlesOf("evening", factsOf({ dueCount: 8, streak: 7, todayCount: 3, dailyGoal: 10 }));
      expect(titles).toContain(state.title);
      expect(titles.some((t) => t.includes("Chuỗi 7 ngày"))).toBe(true);
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
      expect(state.mascotMood).toBe("happy");
      expect(state.message).not.toContain("FSRS");
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
      const variants = reminderVariants("backlog", factsOf({ dueCount: 35, streak: 2, todayCount: 0, dailyGoal: 10 }));
      expect(variants.map((v) => v.message)).toContain(state.message);
      expect(variants[0].title).toBe("Ôn dần, mỗi lần vài từ");
      expect(variants[0].message).toContain("không cần ôn hết một lúc");
      // Every wording that gives a number gives the real one
      for (const v of variants) if (/\d+ từ đang chờ/.test(v.message)) expect(v.message).toContain("35 từ");
      expect(state.mascotMood).toBe("happy");
    });

    it("never says the streak is 1 day when it is 0, nor promises a freeze the learner doesn't have", () => {
      const base = { dueCount: 8, todayCount: 0, dailyGoal: 10 };
      // Every wording of the evening branch, whichever the day picks
      const noStreak = reminderVariants("evening", factsOf({ ...base, streak: 0 }));
      expect(noStreak[0].title).toBe("Bắt đầu chuỗi hôm nay");
      for (const v of noStreak) {
        expect(`${v.title} ${v.message}`).not.toMatch(/Chuỗi 0|0 ngày|1 ngày/);
        expect(v.message).not.toContain("đóng băng");
      }
      for (const v of reminderVariants("evening", factsOf({ ...base, streak: 3, freezes: 0 }))) expect(v.message).not.toContain("đóng băng");
      expect(reminderVariants("evening", factsOf({ ...base, streak: 9, freezes: 1 })).some((v) => v.message.includes("1 lượt đóng băng"))).toBe(true);
      const state = evaluateMotivationState({ ...base, consecutiveSkips: 0, hour: 21, streak: 0 });
      expect(state.message).not.toContain("đóng băng");
    });

    it("gives an honest time estimate instead of '1 phút' for many cards", () => {
      for (const v of reminderVariants("default", factsOf({ dueCount: 19, streak: 2, todayCount: 0, dailyGoal: 10 }))) {
        expect(v.message).not.toContain("1 phút là xong");
        expect(v.message).not.toMatch(/khoảng 1 phút/);
      }
      expect(reminderVariants("default", factsOf({ dueCount: 19, streak: 2, todayCount: 0, dailyGoal: 10 }))[0].message).toContain("phút");
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
      expect(titlesOf("lunch", factsOf({ dueCount: 4, streak: 2, todayCount: 2, dailyGoal: 10 }))).toContain(state.title);
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
      expect(titlesOf("work_end", factsOf({ dueCount: 4, streak: 2, todayCount: 2, dailyGoal: 10 }))).toContain(state.title);
    });
  });

  describe("reminder wording (B12)", () => {
    const facts = factsOf({ dueCount: 6, streak: 4, todayCount: 2, dailyGoal: 10 });

    it("has 4 to 6 wordings in every branch", () => {
      for (const b of REMINDER_BRANCHES) {
        const n = reminderVariants(b, facts).length;
        expect(n, b).toBeGreaterThanOrEqual(4);
        expect(n, b).toBeLessThanOrEqual(6);
      }
    });

    it("keeps a day's wording and never repeats it the next day", () => {
      for (const b of REMINDER_BRANCHES) {
        const n = reminderVariants(b, facts).length;
        for (let day = 20000; day < 20120; day++) {
          expect(copyVariantIndex(b, day, n)).toBe(copyVariantIndex(b, day, n));
          expect(copyVariantIndex(b, day + 1, n), `${b} day ${day}`).not.toBe(copyVariantIndex(b, day, n));
        }
        // Every wording comes up
        const seen = new Set(Array.from({ length: n * 3 }, (_, i) => copyVariantIndex(b, 20000 + i, n)));
        expect(seen.size, b).toBe(n);
      }
      const params = { dueCount: 4, consecutiveSkips: 0, streak: 2, todayCount: 2, dailyGoal: 10, hour: 9 };
      const morning = evaluateMotivationState({ ...params, now: new Date(2026, 9, 22, 9) });
      expect(evaluateMotivationState({ ...params, now: new Date(2026, 9, 22, 16) }).title).toBe(morning.title);
      expect(evaluateMotivationState({ ...params, now: new Date(2026, 9, 23, 9) }).title).not.toBe(morning.title);
      expect(localDayNumber(new Date(2026, 9, 23, 0, 5)) - localDayNumber(new Date(2026, 9, 22, 23, 55))).toBe(1);
    });

    it("weaves in the learner's own numbers when they are known", () => {
      const own = { ...facts, fadingCount: 4, newToday: 3, questsLeft: 2 };
      const all = REMINDER_BRANCHES.flatMap((b) => reminderVariants(b, own)).map((v) => `${v.title} ${v.message}`);
      expect(all.some((t) => t.includes("4 từ"))).toBe(true);
      expect(all.some((t) => t.includes("Còn 2 nhiệm vụ"))).toBe(true);
      expect(all.some((t) => t.includes("3 từ mới"))).toBe(true);
      expect(all.some((t) => t.includes("Chuỗi 4 ngày") || t.includes("4 ngày"))).toBe(true);
      // Unknown numbers are never shown as 0
      const none = REMINDER_BRANCHES.flatMap((b) => reminderVariants(b, facts)).map((v) => `${v.title} ${v.message}`);
      expect(none.some((t) => /\b0 từ sắp quên|Còn 0 nhiệm vụ|0 từ mới/.test(t))).toBe(false);
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

    it("asks a due, already-studied recognition card with 3 options (learning cards first)", () => {
      const due = new Date(Date.now() - 60_000).toISOString();
      const words = dummyWords.map((w) => ({ ...w, srs: { ...w.srs, next_review_date: due } })) as WordDetail[];
      const q = selectMicroQuizQuestion(words, words);
      expect(q).not.toBeNull();
      expect(q?.scheduled).toBe(true);
      expect(q?.direction).toBe("recognition");
      expect(q?.options.length).toBe(3);
      expect(q?.options.filter((o) => o.isCorrect)).toHaveLength(1);
    });

    it("never asks a brand-new word, and falls back to practice when nothing is due", () => {
      const fresh = { ...dummyWords[0], id: "new", word: "brandnew", srs: { state: 0, reps: 0, next_review_date: new Date(0).toISOString() } } as WordDetail;
      expect(selectMicroQuizQuestion([fresh], [fresh])).toBeNull();
      const future = new Date(Date.now() + 86_400_000).toISOString();
      const words = dummyWords.map((w) => ({ ...w, srs: { ...w.srs, next_review_date: future } })) as WordDetail[];
      const q = selectMicroQuizQuestion([], words);
      expect(q?.scheduled).toBe(false);
    });
  });

  describe("evaluateMicroQuizAnswer", () => {
    const options = [
      { id: "opt1", text: "trì hoãn, chần chừ", isCorrect: true },
      { id: "opt2", text: "chăm chỉ, siêng năng", isCorrect: false },
      { id: "opt3", text: "miễn cưỡng", isCorrect: false },
    ];

    it("never rates a fast correct answer Easy (a 3-option pick proves recognition, not mastery)", async () => {
      const res = await evaluateMicroQuizAnswer({
        wordId: "w2",
        selectedChoiceId: "opt1",
        options,
        targetMeaning: "trì hoãn, chần chừ",
        responseTimeMs: 2000,
      });
      expect(res.isCorrect).toBe(true);
      expect(res.rating).toBe(Rating.Good);
      expect(res.ratingLabel).toBe("Good");
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

    it("rates a slow correct answer as Good (speed never lowers the grade)", async () => {
      const res = await evaluateMicroQuizAnswer({
        wordId: "w2",
        selectedChoiceId: "opt1",
        options,
        targetMeaning: "trì hoãn, chần chừ",
        responseTimeMs: 16000,
      });
      expect(res.isCorrect).toBe(true);
      expect(res.rating).toBe(Rating.Good);
      expect(res.ratingLabel).toBe("Good");
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
