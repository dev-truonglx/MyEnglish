import { describe, it, expect } from "vitest";
import { detectMoment, quietHours, AWAY_SECONDS } from "@/services/reminderMoments";
import { evaluateMotivationState } from "@/services/duoMotivation";
import type { PopupBlockers } from "@/services/srs";
import type { LearningEvent } from "@/services/learningEvents";

const state = (p: Partial<PopupBlockers> = {}): PopupBlockers => ({
  fullscreen_app: null,
  screen_sharing_app: null,
  focus_mode: null,
  idle_seconds: 10,
  ...p,
});
const opts = { hour: 14, studiedToday: true };

describe("transition moments", () => {
  it("back at the computer after being idle, or after the computer slept", () => {
    expect(detectMoment(state({ idle_seconds: AWAY_SECONDS + 60 }), state({ idle_seconds: 5 }), 15_000, opts)).toBe("back");
    expect(detectMoment(state({ idle_seconds: 30 }), state({ idle_seconds: 5 }), 2 * 60 * 60 * 1000, opts)).toBe("back");
    // Still away, or only a short pause
    expect(detectMoment(state({ idle_seconds: AWAY_SECONDS + 60 }), state({ idle_seconds: AWAY_SECONDS + 75 }), 15_000, opts)).toBeNull();
    expect(detectMoment(state({ idle_seconds: 120 }), state({ idle_seconds: 5 }), 15_000, opts)).toBeNull();
    // First reading after launch: nothing to compare with
    expect(detectMoment(null, state({ idle_seconds: 5 }), 0, opts)).toBeNull();
  });

  it("the first time back in the morning is a morning moment", () => {
    expect(detectMoment(state({ idle_seconds: 9999 }), state({ idle_seconds: 3 }), 15_000, { hour: 8, studiedToday: false })).toBe("morning");
    expect(detectMoment(state({ idle_seconds: 9999 }), state({ idle_seconds: 3 }), 15_000, { hour: 8, studiedToday: true })).toBe("back");
  });

  it("screen share or full screen just ended", () => {
    expect(detectMoment(state({ screen_sharing_app: "Zoom" }), state(), 15_000, opts)).toBe("after_share");
    expect(detectMoment(state({ fullscreen_app: "Keynote" }), state(), 15_000, opts)).toBe("after_fullscreen");
    expect(detectMoment(state({ fullscreen_app: "Keynote" }), state({ fullscreen_app: "Keynote" }), 15_000, opts)).toBeNull();
  });

  it("the nudge says why now", () => {
    const base = { dueCount: 8, consecutiveSkips: 0, streak: 3, todayCount: 0, dailyGoal: 10, hour: 9 };
    expect(evaluateMotivationState({ ...base, moment: "morning" }).title).toMatch(/buổi sáng/);
    const share = evaluateMotivationState({ ...base, moment: "after_share" });
    expect(share.title).toMatch(/trình bày/);
    expect(share.isMicroQuizPreferred).toBe(true);
    // Nothing due: no moment message
    expect(evaluateMotivationState({ ...base, dueCount: 0, moment: "back" }).title).not.toMatch(/quay lại máy/);
  });
});

describe("quiet hours", () => {
  const at = (h: number, day: number) => new Date(2026, 9, day, h, 5).toISOString();
  const ev = (type: LearningEvent["type"], h: number, day: number): LearningEvent => ({ type, at: at(h, day) });

  it("hours where reminders are almost always ignored, when another hour works", () => {
    const events: LearningEvent[] = [];
    for (let d = 1; d <= 6; d++) {
      events.push(ev("nudge_shown", 15, d), ev("nudge_ignored", 15, d)); // 15h: always ignored
      events.push(ev("nudge_shown", 9, d), ev("nudge_opened", 9, d)); // 9h: always opened
    }
    expect(quietHours(events)).toEqual([15]);
  });

  it("nothing is avoided when every hour is ignored (moving reminders would not help) or data is thin", () => {
    const allIgnored = [1, 2, 3, 4, 5].flatMap((d) => [ev("nudge_shown", 15, d), ev("nudge_shown", 9, d)]);
    expect(quietHours(allIgnored)).toEqual([]);
    expect(quietHours([ev("nudge_shown", 15, 1), ev("nudge_shown", 9, 1), ev("nudge_opened", 9, 1)])).toEqual([]);
  });
});

describe("reminder pauses", () => {
  const on = { stopAfterGoal: true, nightQuiet: true, maxNudgesPerDay: 8 };

  it("stays quiet at night, after the daily goal and past the daily cap", async () => {
    const { reminderPause } = await import("@/services/reminderSettings");
    const day = { hour: 10, goalReached: false, shownToday: 0 };
    expect(reminderPause(on, day)).toBeNull();
    expect(reminderPause(on, { ...day, hour: 22 })).toBe("night");
    expect(reminderPause(on, { ...day, hour: 6 })).toBe("night");
    expect(reminderPause(on, { ...day, hour: 7 })).toBeNull();
    expect(reminderPause(on, { ...day, goalReached: true })).toBe("goal_reached");
    expect(reminderPause(on, { ...day, shownToday: 8 })).toBe("daily_cap");
  });

  it("each pause can be turned off", async () => {
    const { reminderPause } = await import("@/services/reminderSettings");
    const off = { stopAfterGoal: false, nightQuiet: false, maxNudgesPerDay: 0 };
    expect(reminderPause(off, { hour: 23, goalReached: true, shownToday: 50 })).toBeNull();
  });

  it("counts reminders shown today and starts again the next day", async () => {
    localStorage.clear();
    const { getNudgesShownToday, triggerReviewNudge } = await import("@/services/reminderSettings");
    expect(getNudgesShownToday()).toBe(0);
    await triggerReviewNudge(3).catch(() => {});
    expect(getNudgesShownToday()).toBe(1);
    expect(getNudgesShownToday(new Date(Date.now() + 86400000))).toBe(0);
  });
});
