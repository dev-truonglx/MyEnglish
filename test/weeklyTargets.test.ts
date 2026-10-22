import { describe, it, expect } from "vitest";
import {
  availableKinds,
  challengeDifficultyNote,
  countNearMastered,
  pickWeeklyChallenges,
  roomFor,
  targetFor,
  type PickContext,
} from "@/services/weeklyChallenges";
import { makeWord, reviewSrs, DAY_MS } from "./helpers";

/** A learner on the 5-minute plan (onboarding DAILY_PLANS: 3 new cards, 15 answers a day), in week 1 */
const fiveMinutes = (over: Partial<PickContext> = {}): PickContext => ({
  topic: "A1",
  forgottenCount: 0,
  grammarAvailable: true,
  pronunciationAvailable: true,
  hasStudied: true,
  lastWeek: null,
  plan: { newCardsPerDay: 3, dailyGoal: 15, focusMinutes: 10 },
  nearMastered: 0,
  ...over,
});
const weeks = Array.from({ length: 30 }, (_, i) => `2026-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + i).padStart(2, "0")}`);

describe("B8: weekly targets fit the learner's plan", () => {
  it("never asks a 5-minute learner for more new words than the plan gives", () => {
    const c = fiveMinutes();
    expect(roomFor("new_words", c)).toBe(12); // 3 a day × 7 × 0.6
    for (const tier of ["easy", "medium", "hard"] as const) {
      expect(targetFor("new_words", tier, null, roomFor("new_words", c))).toBeLessThanOrEqual(12);
    }
    // Tiers stay apart even when the room shrinks the floors
    const easy = targetFor("new_words", "easy", null, 12);
    const hard = targetFor("new_words", "hard", null, 12);
    expect(easy).toBeLessThan(hard);
    for (const w of weeks) {
      for (const ch of pickWeeklyChallenges(w, c)) expect(ch.target).toBeLessThanOrEqual(Math.min(roomFor(ch.kind, c), Infinity));
    }
  });

  it("offers 'Nhớ lâu' only with words close to it this week, sized to them", () => {
    expect(availableKinds(fiveMinutes())).not.toContain("mastered");
    const c = fiveMinutes({ nearMastered: 6 });
    expect(availableKinds(c)).toContain("mastered");
    expect(roomFor("mastered", c)).toBe(4); // 70% of 6
    expect(targetFor("mastered", "hard", null, roomFor("mastered", c))).toBeLessThanOrEqual(4);
  });

  it("counts only cards near long-term memory that come due this week", () => {
    const weekEnd = new Date(Date.now() + 4 * DAY_MS);
    const near = makeWord("near", { srs: reviewSrs(14, 12) }); // due 2 days ago
    const later = makeWord("later", { srs: reviewSrs(14, 2) }); // due in 12 days
    const young = makeWord("young", { srs: reviewSrs(4, 5) });
    const done = makeWord("done", { srs: reviewSrs(40, 50) });
    expect(countNearMastered([near, later, young, done], weekEnd)).toBe(1);
  });

  it("a week picked on Friday leaves room for three days only, and says why a target is small", () => {
    const friday = fiveMinutes({ daysLeft: 3 });
    expect(roomFor("active_days", friday)).toBe(3);
    expect(roomFor("new_words", friday)).toBe(5); // 3 × 3 × 0.6
    const ch = { kind: "new_words" as const, tier: "hard" as const, target: targetFor("new_words", "hard", null, 5) };
    expect(challengeDifficultyNote(ch, { dailyGoal: 15, lastWeek: null })).toContain("hạn mức từ mới");
  });
});
