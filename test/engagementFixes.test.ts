import { describe, it, expect, vi, afterEach } from "vitest";
import { availableQuests, firstTryTarget, pickDailyQuests, type QuestPickContext } from "@/services/dailyQuests";
import {
  buildCandidatePool,
  recordReflexCompletion,
  reflexXpLeftToday,
  getReflexStats,
  REFLEX_DAILY_XP_MAX,
  type ReflexSummary,
} from "@/services/reflexChallenge";
import { getXPState } from "@/services/smartReview";
import { itemsLeft } from "@/lib/utils";
import { makeWord, reviewSrs } from "./helpers";

afterEach(() => {
  delete (globalThis as { __tauriInvoke?: unknown }).__tauriInvoke;
});

function ctx(over: Partial<QuestPickContext> = {}): QuestPickContext {
  return {
    dailyGoal: 30,
    newAllowed: 0,
    hasStudied: true,
    forgottenCount: 0,
    grammarAvailable: true,
    pronunciationAvailable: true,
    lastDone: {},
    ...over,
  };
}

describe("B1: the first-try quest follows the cards of the day", () => {
  it("never asks for more than 80% of what can be graded today", () => {
    expect(firstTryTarget({ dailyGoal: 30 })).toBe(20);
    expect(firstTryTarget({ dailyGoal: 30, gradableToday: 100 })).toBe(20);
    expect(firstTryTarget({ dailyGoal: 30, gradableToday: 12 })).toBe(9);
    expect(firstTryTarget({ dailyGoal: 15, gradableToday: 5 })).toBe(4);
  });

  it("is left out on a day with too few cards, and the day still gets its quests", () => {
    expect(firstTryTarget({ dailyGoal: 15, gradableToday: 2 })).toBeNull();
    const c = ctx({ gradableToday: 2 });
    expect(availableQuests(c).some((q) => q.id === "first_try")).toBe(false);
    const picked = pickDailyQuests("2026-10-22", c);
    expect(picked.length).toBe(3);
    expect(picked.every((q) => q.id !== "first_try")).toBe(true);
  });
});

function summary(totalXP: number): ReflexSummary {
  return {
    tiersCleared: 3,
    totalXP,
    baseXP: totalXP,
    bonusXP: 0,
    perfectBonus: false,
    secondChanceUsed: false,
    secondChanceTier: null,
    totalAnswered: 37,
    totalCorrect: 30,
    totalWrong: 7,
    accuracy: 81,
    avgResponseTimeMs: 2000,
    speedTitle: "",
    wrongWords: [],
    answers: [],
  };
}

describe("B2: reflex challenge XP is capped per day", () => {
  it("awards at most REFLEX_DAILY_XP_MAX a day over every run, and again the next day", () => {
    const day1 = new Date(2026, 9, 22, 9);
    const xpBefore = getXPState().totalXP;
    expect(recordReflexCompletion(summary(25), day1)).toBe(25);
    expect(reflexXpLeftToday(day1)).toBe(REFLEX_DAILY_XP_MAX - 25);
    expect(recordReflexCompletion(summary(90), new Date(2026, 9, 22, 10))).toBe(REFLEX_DAILY_XP_MAX - 25);
    expect(recordReflexCompletion(summary(90), new Date(2026, 9, 22, 11))).toBe(0);
    expect(getXPState().totalXP - xpBefore).toBe(REFLEX_DAILY_XP_MAX);
    // The best score is the run's own, before the cap
    expect(getReflexStats().bestXP).toBe(90);

    const day2 = new Date(2026, 9, 23, 9);
    expect(reflexXpLeftToday(day2)).toBe(REFLEX_DAILY_XP_MAX);
    expect(recordReflexCompletion(summary(15), day2)).toBe(15);
  });

  it("does not count a word never introduced as a word being learnt", () => {
    const waiting = makeWord("waiting", { word: "waiting", meaning_vn: "đang chờ" });
    const learnt = makeWord("learnt", { word: "learnt", meaning_vn: "đã học", srs: reviewSrs(5, 1) });
    const pool = buildCandidatePool([waiting, learnt]);
    expect(pool.find((c) => c.id === "waiting")?.category).toBe("catalog");
    expect(pool.find((c) => c.id === "learnt")?.category).not.toBe("catalog");
  });
});

describe("B6: session progress never goes back", () => {
  it("counts the cards left, which a card asked again never pushes up, and the bar never moves back", () => {
    let length = 5;
    let index = 0;
    const seen: Array<{ left: number; bar: number }> = [];
    const step = (insertsCopy: boolean) => {
      if (insertsCopy) length++; // a forgotten card / a new word's quiz goes back in as this card is answered
      index++;
      seen.push({ left: itemsLeft(length, index), bar: (index + 1) / length });
    };
    seen.push({ left: itemsLeft(length, index), bar: (index + 1) / length });
    [true, true, false, true, false, false, true, false, false, false].forEach(step);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].left).toBeLessThanOrEqual(seen[i - 1].left);
      expect(seen[i].bar).toBeGreaterThanOrEqual(seen[i - 1].bar);
    }
    expect(seen[0].left).toBe(5);
    expect(seen[seen.length - 1].left).toBe(0);
  });
});

describe("B7: free writing only with an AI CLI", () => {
  it("checks the CLI once for a while, and a failed AI call turns it off until the next check", async () => {
    vi.resetModules();
    const ai = await import("@/services/ai");
    const calls: string[] = [];
    (globalThis as { __tauriInvoke?: unknown }).__tauriInvoke = (cmd: string) => {
      calls.push(cmd);
      return { installed: true };
    };
    const t0 = 1_000_000;
    expect(await ai.isAiCliReady(t0)).toBe(true);
    expect(await ai.isAiCliReady(t0 + 60_000)).toBe(true);
    expect(calls).toEqual(["check_cli_status"]);

    ai.markAiCliUnavailable(Date.now());
    expect(await ai.isAiCliReady()).toBe(false);
  });

  it("treats a missing or failing check as no AI", async () => {
    vi.resetModules();
    const ai = await import("@/services/ai");
    (globalThis as { __tauriInvoke?: unknown }).__tauriInvoke = () => {
      throw new Error("no CLI");
    };
    expect(await ai.isAiCliReady()).toBe(false);
  });
});
