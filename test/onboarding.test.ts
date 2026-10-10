import { describe, it, expect } from "vitest";
import { applyDailyPlan, DAILY_PLANS, isOnboardingDone, shouldShowOnboarding } from "@/services/onboarding";
import { getStudyLimits } from "@/services/srs";
import { getDailyGoal } from "@/services/streak";
import { getReminderSettings } from "@/services/reminderSettings";

describe("onboarding", () => {
  it("is shown once to a learner without words; learners with words skip it for good", () => {
    expect(shouldShowOnboarding(0, true)).toBe(false); // still loading
    expect(shouldShowOnboarding(0, false)).toBe(true);
    expect(shouldShowOnboarding(12, false)).toBe(false);
    expect(isOnboardingDone()).toBe(true);
    expect(shouldShowOnboarding(0, false)).toBe(false);
  });

  it("the minutes per day set new words, session size, daily goal and reminders", () => {
    applyDailyPlan(5, true);
    expect(getStudyLimits()).toEqual({ newCardsPerDay: 3, maxSessionSize: 20 });
    expect(getDailyGoal()).toBe(DAILY_PLANS[5].dailyGoal);
    expect(getReminderSettings()).toMatchObject({ enabled: true, intervalMinutes: 60 });
    applyDailyPlan(15, false);
    expect(getStudyLimits().newCardsPerDay).toBe(8);
    expect(getReminderSettings()).toMatchObject({ enabled: false, intervalMinutes: 0 });
  });
});
