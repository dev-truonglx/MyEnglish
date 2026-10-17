import { describe, it, expect, beforeEach } from "vitest";
import {
  allQuestsDone,
  availableQuests,
  chestReward,
  claimChest,
  ensureQuestState,
  parseQuestState,
  pickDailyQuests,
  questProgress,
  questTitle,
  readQuestState,
  CHEST_XP_CHOICES,
  CHEST_XP_MAX,
  EMPTY_FACTS,
  QUESTS_KEY,
  type QuestFacts,
  type QuestPickContext,
} from "@/services/dailyQuests";
import { BONUS_FREEZES_KEY, computeStreak, MAX_FREEZES, readBonusFreezeDates } from "@/services/streak";
import { getXPState } from "@/services/smartReview";

const DAY = "2026-10-17";

function ctx(over: Partial<QuestPickContext> = {}): QuestPickContext {
  return {
    dailyGoal: 10,
    newAllowed: 8,
    hasStudied: true,
    forgottenCount: 4,
    grammarAvailable: true,
    pronunciationAvailable: true,
    lastDone: { focus: "2026-10-16", grammar: "2026-10-16", pronunciation: "2026-10-16" },
    ...over,
  };
}

function days(n: number, from = "2026-01-01"): string[] {
  const [y, m, d] = from.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(y, m - 1, d + i);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  });
}

const done = (over: Partial<QuestFacts> = {}): QuestFacts => ({
  first_try: 99,
  new_words: 99,
  focus: 9,
  forgotten: 9,
  grammar: 9,
  pronunciation: 9,
  ...over,
});

describe("picking daily quests", () => {
  it("is the same for the same day and context", () => {
    expect(pickDailyQuests(DAY, ctx())).toEqual(pickDailyQuests(DAY, ctx()));
  });

  it("gives 3 different quests, at least one about vocabulary", () => {
    for (const day of days(60)) {
      const q = pickDailyQuests(day, ctx());
      expect(q).toHaveLength(3);
      expect(new Set(q.map((x) => x.id)).size).toBe(3);
      expect(q.some((x) => x.id === "first_try" || x.id === "new_words")).toBe(true);
    }
  });

  it("rotates across days", () => {
    const sets = new Set(days(30).map((d) => pickDailyQuests(d, ctx()).map((q) => q.id).sort().join(",")));
    expect(sets.size).toBeGreaterThan(3);
  });

  it("always includes a skill left alone for 3+ days", () => {
    for (const day of days(30, "2026-10-01")) {
      const c = ctx({
        forgottenCount: 0,
        lastDone: { focus: day, pronunciation: day, grammar: "2026-09-01" },
      });
      expect(pickDailyQuests(day, c).map((q) => q.id)).toContain("grammar");
    }
  });

  it("leans toward neglected skills without forcing them", () => {
    let grammar = 0;
    for (const day of days(200, "2026-03-01")) {
      const c = ctx({ lastDone: { focus: day, pronunciation: day, grammar: shift(day, -2) } });
      if (pickDailyQuests(day, c).some((q) => q.id === "grammar")) grammar++;
    }
    // 2 days of neglect: weight 3 against 1 for the others, but no forced slot
    expect(grammar).toBeGreaterThan(60);
    expect(grammar).toBeLessThan(200);
  });

  it("never offers what the learner can't do today", () => {
    const c = ctx({ grammarAvailable: false, pronunciationAvailable: false, forgottenCount: 0, newAllowed: 1 });
    for (const day of days(30)) {
      const ids = pickDailyQuests(day, c).map((q) => q.id);
      expect(ids).not.toContain("grammar");
      expect(ids).not.toContain("pronunciation");
      expect(ids).not.toContain("forgotten");
      expect(ids).not.toContain("new_words");
    }
  });

  it("gives fewer quests when the pool is small (brand-new learner)", () => {
    const c = ctx({ hasStudied: false, forgottenCount: 0, grammarAvailable: false, pronunciationAvailable: false, lastDone: {} });
    const q = pickDailyQuests(DAY, c);
    expect(q.map((x) => x.id).sort()).toEqual(["first_try", "new_words"]);
  });

  it("never offers reading (removed)", () => {
    for (const day of days(60)) expect(pickDailyQuests(day, ctx()).map((q) => q.id as string)).not.toContain("reading");
  });

  it("a reading quest picked earlier today is replaced, the other two stay", () => {
    localStorage.setItem(
      QUESTS_KEY,
      JSON.stringify({ day: DAY, claimed: false, quests: [{ id: "first_try", target: 15 }, { id: "reading", target: 3 }, { id: "grammar", target: 1 }] })
    );
    const ids = ensureQuestState(DAY, ctx()).quests.map((q) => q.id as string);
    expect(ids).toHaveLength(3);
    expect(ids.slice(0, 2)).toEqual(["first_try", "grammar"]);
    expect(ids).not.toContain("reading");
    expect(new Set(ids).size).toBe(3);
  });

  it("sizes targets from the context", () => {
    const byId = (c: QuestPickContext) => Object.fromEntries(availableQuests(c).map((q) => [q.id, q.target]));
    expect(byId(ctx({ dailyGoal: 10, newAllowed: 8, forgottenCount: 4 }))).toMatchObject({ first_try: 15, new_words: 5, forgotten: 3, focus: 1 });
    expect(byId(ctx({ dailyGoal: 1, newAllowed: 3, forgottenCount: 1 }))).toMatchObject({ first_try: 8, new_words: 3, forgotten: 1 });
    expect(byId(ctx({ dailyGoal: 50 })).first_try).toBe(20);
  });
});

function shift(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

describe("progress", () => {
  it("caps at the target and is done only when every quest is", () => {
    const quests = [
      { id: "first_try" as const, target: 15 },
      { id: "grammar" as const, target: 1 },
    ];
    expect(questProgress(quests[0], { ...EMPTY_FACTS, first_try: 40 })).toBe(15);
    expect(allQuestsDone(quests, { ...EMPTY_FACTS, first_try: 15 })).toBe(false);
    expect(allQuestsDone(quests, { ...EMPTY_FACTS, first_try: 15, grammar: 2 })).toBe(true);
    expect(allQuestsDone([], done())).toBe(false);
  });

  it("has a Vietnamese title for every quest", () => {
    for (const q of availableQuests(ctx())) expect(questTitle(q)).toMatch(/\S/);
  });
});

describe("chest", () => {
  beforeEach(() => localStorage.clear());

  it("holds capped XP and a freeze only while the stock has room", () => {
    let freezes = 0;
    for (const day of days(400)) {
      const r = chestReward(day, 0);
      expect(CHEST_XP_CHOICES).toContain(r.xp);
      expect(r.xp).toBeLessThanOrEqual(CHEST_XP_MAX);
      if (r.freeze) freezes++;
      expect(chestReward(day, MAX_FREEZES).freeze).toBe(false);
    }
    expect(freezes / 400).toBeGreaterThan(0.15);
    expect(freezes / 400).toBeLessThan(0.35);
  });

  it("opens once a day, only with every quest done, and awards the XP", () => {
    const state = ensureQuestState(DAY, ctx());
    expect(claimChest(DAY, EMPTY_FACTS, 0)).toBeNull();
    const before = getXPState().totalXP;
    const reward = claimChest(DAY, done(), 0);
    expect(reward).not.toBeNull();
    expect(getXPState().totalXP - before).toBe(reward!.xp);
    expect(claimChest(DAY, done(), 0)).toBeNull();
    expect(getXPState().totalXP - before).toBe(reward!.xp);
    expect(readQuestState(DAY)).toMatchObject({ quests: state.quests, claimed: true, reward });
  });

  it("keeps the day's quests once picked, even if the context changes", () => {
    const first = ensureQuestState(DAY, ctx());
    expect(ensureQuestState(DAY, ctx({ grammarAvailable: false, forgottenCount: 0 })).quests).toEqual(first.quests);
    // A new day picks again
    expect(readQuestState("2026-10-18")).toBeNull();
  });

  it("stores a bonus freeze on a lucky day", () => {
    const lucky = days(100).find((d) => chestReward(d, 0).freeze)!;
    ensureQuestState(lucky, ctx());
    expect(claimChest(lucky, done(), 0)?.freeze).toBe(true);
    expect(readBonusFreezeDates()).toEqual([lucky]);
  });

  it("rejects stored garbage", () => {
    expect(parseQuestState("nope")).toBeNull();
    expect(parseQuestState(JSON.stringify({ day: DAY, quests: [{ id: "x", target: 1 }] }))).toBeNull();
    expect(parseQuestState(JSON.stringify({ day: DAY, quests: [{ id: "focus", target: 1 }], claimed: 1, reward: { xp: 500 } }))).toEqual({
      day: DAY,
      quests: [{ id: "focus", target: 1 }],
      claimed: true,
      reward: { xp: CHEST_XP_MAX, freeze: false },
    });
    localStorage.setItem(QUESTS_KEY, "{bad");
    expect(readQuestState(DAY)).toBeNull();
  });
});

describe("bonus freezes in the streak", () => {
  beforeEach(() => localStorage.clear());

  it("covers a missed day after a bonus freeze", () => {
    const active = ["2026-10-10", "2026-10-11", "2026-10-13"];
    const today = new Date(2026, 9, 13);
    expect(computeStreak(active, today, []).current).toBe(1);
    const withBonus = computeStreak(active, today, ["2026-10-11"]);
    expect(withBonus.current).toBe(3);
    expect(withBonus.frozenDates).toEqual(["2026-10-12"]);
  });

  it("counts today's bonus before any activity, and never beyond MAX_FREEZES", () => {
    expect(computeStreak(["2026-10-16"], new Date(2026, 9, 17), ["2026-10-17"]).freezes).toBe(1);
    const week = days(14, "2026-10-01");
    expect(computeStreak(week, new Date(2026, 9, 14), ["2026-10-14"]).freezes).toBe(MAX_FREEZES);
  });

  it("reads the stored dates by default", () => {
    localStorage.setItem(BONUS_FREEZES_KEY, JSON.stringify(["2026-10-11"]));
    expect(computeStreak(["2026-10-10", "2026-10-11", "2026-10-13"], new Date(2026, 9, 13)).current).toBe(3);
  });
});
