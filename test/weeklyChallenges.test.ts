import { describe, it, expect } from "vitest";
import {
  ALL_DONE_BONUS_XP,
  EMPTY_WEEK_FACTS,
  KINDS,
  TIER_XP,
  WEEKLY_KEY,
  availableKinds,
  challengeTitle,
  claimWeeklyRewards,
  ensureWeeklyState,
  pickWeeklyChallenges,
  readWeeklyState,
  roomFor,
  targetFor,
  weekFactsFrom,
  type PickContext,
  type WeekFacts,
} from "@/services/weeklyChallenges";
import { getXPState } from "@/services/smartReview";

const WEEK = "2026-10-12";
// A roomy plan and plenty of near-mastered / forgotten words: the room never binds unless a test says so
const ctx = (over: Partial<PickContext> = {}): PickContext => ({
  topic: "A1",
  forgottenCount: 30,
  grammarAvailable: true,
  pronunciationAvailable: true,
  hasStudied: true,
  lastWeek: null,
  plan: { newCardsPerDay: 20, dailyGoal: 60, focusMinutes: 5 },
  nearMastered: 60,
  ...over,
});
const weeks = Array.from({ length: 40 }, (_, i) => `2026-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + i).padStart(2, "0")}`);

describe("picking the week's challenges", () => {
  it("three different kinds, one per tier, the same for the same week", () => {
    const a = pickWeeklyChallenges(WEEK, ctx());
    expect(a).toEqual(pickWeeklyChallenges(WEEK, ctx()));
    expect(a.map((c) => c.tier).sort()).toEqual(["easy", "hard", "medium"]);
    expect(new Set(a.map((c) => c.kind)).size).toBe(3);
  });

  it("varies across weeks and never pairs two kinds of the same habit", () => {
    const seen = new Set<string>();
    for (const w of weeks) {
      const kinds = pickWeeklyChallenges(w, ctx()).map((c) => c.kind);
      kinds.forEach((k) => seen.add(k));
      expect(kinds.includes("active_days") && kinds.includes("goal_days")).toBe(false);
      expect(kinds.includes("review_correct") && kinds.includes("level_correct")).toBe(false);
    }
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });

  it("only offers what the learner can do", () => {
    const c = ctx({ topic: null, forgottenCount: 0, grammarAvailable: false, pronunciationAvailable: false, hasStudied: false });
    expect(availableKinds(c).sort()).toEqual(["active_days", "goal_days", "new_words", "review_correct"]);
    for (const w of weeks) expect(pickWeeklyChallenges(w, c)).toHaveLength(3);
  });

  it("the level challenge names its level", () => {
    const week = weeks.find((w) => pickWeeklyChallenges(w, ctx()).some((c) => c.kind === "level_correct"))!;
    const c = pickWeeklyChallenges(week, ctx({ topic: "B1" })).find((x) => x.kind === "level_correct")!;
    expect(challengeTitle(c)).toMatch(/cấp độ B1$/);
  });
});

describe("difficulty: targets follow last week", () => {
  it("floors without history, harder tiers ask more", () => {
    expect(targetFor("active_days", "easy", null)).toBe(3);
    expect(targetFor("active_days", "medium", null)).toBe(5);
    expect(targetFor("active_days", "hard", null)).toBe(7);
  });

  it("scales last week's figure by tier, within the floor and the cap", () => {
    // 200 right answers last week: easy 120, medium 200, hard 280
    expect(targetFor("review_correct", "easy", 200)).toBe(120);
    expect(targetFor("review_correct", "medium", 200)).toBe(200);
    expect(targetFor("review_correct", "hard", 200)).toBe(280);
    // A quiet week does not make it trivial: the floor holds
    expect(targetFor("review_correct", "hard", 10)).toBe(KINDS.review_correct.floor.hard);
    // A week has 7 days
    expect(targetFor("active_days", "hard", 7)).toBe(7);
  });

  it("the pick uses last week's figures, within the week's room", () => {
    const last: WeekFacts = { ...EMPTY_WEEK_FACTS, review_correct: 300, new_words: 50, focus: 10, mastered: 20 };
    const c0 = ctx({ lastWeek: last });
    for (const c of pickWeeklyChallenges(WEEK, c0)) {
      expect(c.target).toBe(targetFor(c.kind, c.tier, last[c.kind], roomFor(c.kind, c0)));
    }
  });
});

describe("rewards", () => {
  it("pays each challenge once by tier, then the bonus when all three are done", () => {
    const state = ensureWeeklyState(WEEK, ctx());
    expect(readWeeklyState(WEEK)).toEqual(state);
    const [a, b, c] = state.challenges;
    const before = getXPState().totalXP;

    const facts: WeekFacts = { ...EMPTY_WEEK_FACTS, [a.kind]: a.target };
    expect(claimWeeklyRewards(WEEK, facts)).toEqual({ kinds: [a.kind], bonus: false, xp: TIER_XP[a.tier] });
    expect(claimWeeklyRewards(WEEK, facts)).toBeNull();

    const all: WeekFacts = { ...facts, [b.kind]: b.target, [c.kind]: c.target + 5 };
    const r = claimWeeklyRewards(WEEK, all)!;
    expect(r.bonus).toBe(true);
    expect(r.xp).toBe(TIER_XP[b.tier] + TIER_XP[c.tier] + ALL_DONE_BONUS_XP);
    expect(getXPState().totalXP).toBe(before + TIER_XP.easy + TIER_XP.medium + TIER_XP.hard + ALL_DONE_BONUS_XP);
    expect(claimWeeklyRewards(WEEK, all)).toBeNull();
  });

  it("a new week picks again; a broken stored state is ignored", () => {
    ensureWeeklyState(WEEK, ctx());
    expect(readWeeklyState("2026-10-19")).toBeNull();
    localStorage.setItem(WEEKLY_KEY, "{oops");
    expect(readWeeklyState(WEEK)).toBeNull();
  });
});

describe("week figures from the records", () => {
  it("counts only this week's records", () => {
    const from = new Date(2026, 9, 12);
    const to = new Date(2026, 9, 19);
    const at = (d: number) => new Date(2026, 9, d, 10).toISOString();
    const log = (wordId: string, d: number, rating = 3, isScheduled = true) => ({ wordId, rating, isScheduled, timestamp: at(d) });
    const facts = weekFactsFrom({
      from,
      to,
      logs: [log("a", 12), log("a", 13), log("b", 14, 1), log("c", 15, 3, false), log("a", 11)],
      topicWordIds: new Set(["a"]),
      forgottenIds: new Set(["c"]),
      activity: { "2026-10-11": 30, "2026-10-12": 30, "2026-10-13": 5, "2026-10-18": 12 },
      dailyGoal: 10,
      intros: 7,
      events: [
        { type: "focus_completed", at: at(13) },
        { type: "mastered", at: at(14) },
        { type: "mastered", at: at(9) },
        { type: "pronunciation_quiz", at: at(16) },
      ],
      grammarAttempts: [at(15), at(3)],
    });
    expect(facts).toEqual({
      level_correct: 2,
      review_correct: 2,
      active_days: 3,
      goal_days: 2,
      new_words: 7,
      focus: 1,
      mastered: 1,
      forgotten: 1,
      grammar: 1,
      pronunciation: 1,
    });
  });
});

describe("tooltip text", async () => {
  const { challengeHowTo, challengeDifficultyNote } = await import("@/services/weeklyChallenges");
  const kinds = Object.keys(KINDS) as Array<keyof typeof KINDS>;

  it("every kind says what counts, with its target", () => {
    for (const kind of kinds) {
      const text = challengeHowTo({ kind, tier: "medium", target: 7, topic: "B1" }, { dailyGoal: 30, lastWeek: null });
      expect(text.length).toBeGreaterThan(40);
      expect(text).toContain("7");
    }
    expect(challengeHowTo({ kind: "goal_days", tier: "easy", target: 3 }, { dailyGoal: 30, lastWeek: null })).toContain("30 câu");
    expect(challengeHowTo({ kind: "level_correct", tier: "hard", target: 9, topic: "A2" }, { dailyGoal: 30, lastWeek: null })).toContain("cấp độ A2");
  });

  it("explains the size from last week, or the default", () => {
    expect(challengeDifficultyNote({ kind: "focus", tier: "hard", target: 7 }, { dailyGoal: 30, lastWeek: 5 })).toBe(
      "Mức Khó (+100 XP): khoảng 140% kết quả tuần trước của bạn (5), không thấp hơn mức tối thiểu."
    );
    expect(challengeDifficultyNote({ kind: "focus", tier: "easy", target: 2 }, { dailyGoal: 30, lastWeek: null })).toContain("mục tiêu mặc định");
  });
});
