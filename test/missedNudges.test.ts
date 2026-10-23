import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReminderSettings } from "@/services/reminderSettings";
import {
  getIgnoredNudgeCount,
  getReminderSettings,
  resetIgnoredNudges,
  saveReminderSettings,
  shouldEscalate,
  snoozeIgnoredNudge,
} from "@/services/reminderSettings";
import {
  getConsecutiveSkipCount,
  getMissedNudgeStreak,
  incrementConsecutiveSkipCount,
  resetConsecutiveSkipCount,
} from "@/services/duoMotivation";

// Native side mocked as in gd4-tray.test.ts: the commands the worker calls are recorded
const native = vi.hoisted(() => {
  const calls: Array<{ cmd: string; args: unknown }> = [];
  const api = {
    invoke: async (cmd: string, args?: unknown) => {
      calls.push({ cmd, args });
      if (cmd === "get_popup_blockers") return null;
      if (cmd === "show_review_nudge") return true;
      return undefined;
    },
    listen: async () => () => {},
    emit: async () => {},
    isPermissionGranted: async () => true,
    requestPermission: async () => "granted",
    sendNotification: () => {},
  };
  return { calls, api };
});
vi.mock("@tauri-apps/api/core", () => native.api);
vi.mock("@tauri-apps/api/event", () => native.api);

const MIN = 60 * 1000;
const at = (iso: string) => {
  vi.setSystemTime(new Date(iso));
};

beforeEach(() => {
  native.calls.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ignored reminders are counted per day", () => {
  it("yesterday's ignored cards do not slow down today's first reminder", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-11T20:00:00");
    saveReminderSettings({ snoozeMinutes: 10, intervalMinutes: 30 });
    expect([snoozeIgnoredNudge(), snoozeIgnoredNudge(), snoozeIgnoredNudge()]).toEqual([30, 60, 120]);
    expect(getIgnoredNudgeCount()).toBe(3);

    at("2026-10-12T08:00:00");
    expect(getIgnoredNudgeCount()).toBe(0);
    expect(snoozeIgnoredNudge()).toBe(30);
  });

  it("an old count saved as a bare number is dropped", () => {
    localStorage.setItem("myenglish_ignored_nudges_v1", "3");
    expect(getIgnoredNudgeCount()).toBe(0);
  });
});

describe("a card nobody pointed at is missed, not ignored", () => {
  it("keeps the normal wait, leaves the tone alone, and only counts the miss", () => {
    saveReminderSettings({ snoozeMinutes: 10, intervalMinutes: 30 });
    expect([1, 2, 3, 4].map(() => snoozeIgnoredNudge(false))).toEqual([30, 30, 30, 30]);
    expect(getIgnoredNudgeCount()).toBe(0);
    expect(getConsecutiveSkipCount()).toBe(0);
    expect(getMissedNudgeStreak()).toBe(4);
  });

  it("a seen card that times out still backs off and counts as a skip", () => {
    saveReminderSettings({ snoozeMinutes: 10, intervalMinutes: 30 });
    expect([snoozeIgnoredNudge(true), snoozeIgnoredNudge(true)]).toEqual([30, 60]);
    expect(getConsecutiveSkipCount()).toBe(2);
    expect(getMissedNudgeStreak()).toBe(0);
  });

  it("the miss streak is per day and any answer or study resets it", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-11T20:00:00");
    snoozeIgnoredNudge(false);
    snoozeIgnoredNudge(false);
    expect(getMissedNudgeStreak()).toBe(2);
    at("2026-10-12T08:00:00");
    expect(getMissedNudgeStreak()).toBe(0);

    snoozeIgnoredNudge(false);
    resetIgnoredNudges(); // an answered reminder, or the review opened from the notification
    expect(getMissedNudgeStreak()).toBe(0);

    snoozeIgnoredNudge(false);
    incrementConsecutiveSkipCount();
    resetConsecutiveSkipCount(); // a review finished
    expect(getMissedNudgeStreak()).toBe(0);
  });
});

describe("shouldEscalate", () => {
  const on = { escalateMissed: true };
  it("needs two misses in a row, and at most two notifications a day", () => {
    expect(shouldEscalate(on, { missedStreak: 1, escalationsToday: 0 })).toBe(false);
    expect(shouldEscalate(on, { missedStreak: 2, escalationsToday: 0 })).toBe(true);
    expect(shouldEscalate(on, { missedStreak: 5, escalationsToday: 1 })).toBe(true);
    expect(shouldEscalate(on, { missedStreak: 5, escalationsToday: 2 })).toBe(false);
  });

  it("never when the learner turned it off", () => {
    expect(shouldEscalate({ escalateMissed: false }, { missedStreak: 9, escalationsToday: 0 })).toBe(false);
  });
});

describe("the merged smart reminders setting", () => {
  const stored = (v: Record<string, unknown>) =>
    localStorage.setItem("myenglish_reminder_settings_v1", JSON.stringify(v));

  it("is on by default", () => {
    expect(getReminderSettings().smartReminders).toBe(true);
    expect(getReminderSettings().escalateMissed).toBe(true);
  });

  it("settings saved with the two old switches stay on unless one was turned off", () => {
    stored({ contextMoments: true, avoidQuietHours: true });
    expect(getReminderSettings().smartReminders).toBe(true);
    stored({ contextMoments: false, avoidQuietHours: true });
    expect(getReminderSettings().smartReminders).toBe(false);
    stored({ contextMoments: true, avoidQuietHours: false });
    expect(getReminderSettings().smartReminders).toBe(false);
    stored({ intervalMinutes: 60 });
    expect(getReminderSettings().smartReminders).toBe(true);
  });

  it("the old keys are not carried over, and the new value wins once saved", () => {
    stored({ contextMoments: false, avoidQuietHours: false, smartReminders: true });
    const s = getReminderSettings() as ReminderSettings & Record<string, unknown>;
    expect(s.smartReminders).toBe(true);
    expect("contextMoments" in s).toBe(false);
    expect("avoidQuietHours" in s).toBe(false);
  });
});

// Same worker setup as gd4-tray.test.ts: one new word, the last reminder shown `lastPopupAgoMs` ago
async function setup(opts: Partial<ReminderSettings> & { lastPopupAgoMs?: number } = {}) {
  await vi.dynamicImportSettled();
  vi.resetModules();
  const db = await import("@/services/db");
  const srs = await import("@/services/srs");
  const reminders = await import("@/services/reminderSettings");
  const motivation = await import("@/services/duoMotivation");
  const { lastPopupAgoMs = 60 * MIN, ...settings } = opts;
  await db.insertEnrichedWord({ word: "latency", meaning_vn: "độ trễ", synonyms: [], antonyms: [], examples: [] });
  reminders.saveReminderSettings({
    enabled: true,
    intervalMinutes: 60,
    triggerCondition: "due_only",
    respectFocus: false,
    smartReminders: false,
    snoozedUntil: null,
    ...settings,
  });
  reminders.recordPopupDisplayed(Date.now() - lastPopupAgoMs);
  native.calls.length = 0;
  return { srs, reminders, motivation, worker: srs.srsWorker };
}

const sent = (cmd: string) => native.calls.filter((c) => c.cmd === cmd).length;

describe("the worker escalates a missed card to a system notification", () => {
  it("shows the card first, then a notification once two cards were missed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-12T15:00:00");
    const { worker, reminders, motivation } = await setup();

    await worker.tick();
    expect(sent("show_review_nudge")).toBe(1);
    expect(sent("send_desktop_notification")).toBe(0);

    // The card closes unseen twice
    motivation.incrementMissedNudgeStreak();
    motivation.incrementMissedNudgeStreak();
    at("2026-10-12T16:05:00");
    native.calls.length = 0;
    await worker.tick();
    expect(sent("send_desktop_notification")).toBe(1);
    expect(sent("show_review_nudge")).toBe(0);
    expect(reminders.getEscalationsToday()).toBe(1);
    // It counts as a reminder of the day and restarts the interval
    expect(reminders.getNudgesShownToday()).toBe(2);
    expect(Date.now() - reminders.getLastPopupDisplayTime()).toBeLessThan(MIN);
  });

  it("falls back to the card after two notifications in a day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-12T10:00:00");
    const { worker, motivation } = await setup();
    motivation.incrementMissedNudgeStreak();
    motivation.incrementMissedNudgeStreak();

    await worker.tick();
    at("2026-10-12T11:05:00");
    await worker.tick();
    expect(sent("send_desktop_notification")).toBe(2);

    at("2026-10-12T12:10:00");
    native.calls.length = 0;
    await worker.tick();
    expect(sent("send_desktop_notification")).toBe(0);
    expect(sent("show_review_nudge")).toBe(1);
  });

  it("does nothing special when the learner turned it off", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-12T15:00:00");
    const { worker, motivation } = await setup({ escalateMissed: false });
    motivation.incrementMissedNudgeStreak();
    motivation.incrementMissedNudgeStreak();
    await worker.tick();
    expect(sent("send_desktop_notification")).toBe(0);
    expect(sent("show_review_nudge")).toBe(1);
  });

  it("goes through the same pauses as the card: night, snooze and the daily cap", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const run = async (iso: string, settings: Partial<ReminderSettings> = {}) => {
      at(iso);
      const ctx = await setup(settings);
      ctx.motivation.incrementMissedNudgeStreak();
      ctx.motivation.incrementMissedNudgeStreak();
      native.calls.length = 0;
      await ctx.worker.tick();
      return ctx;
    };

    await run("2026-10-12T23:00:00");
    expect(sent("send_desktop_notification") + sent("show_review_nudge")).toBe(0);

    await run("2026-10-13T15:00:00", { snoozedUntil: Date.parse("2026-10-13T16:00:00") });
    expect(sent("send_desktop_notification") + sent("show_review_nudge")).toBe(0);

    const ctx = await run("2026-10-14T15:00:00", { maxNudgesPerDay: 1 });
    expect(sent("send_desktop_notification")).toBe(1);
    // The notification used the day's only reminder: nothing more today
    at("2026-10-14T16:05:00");
    native.calls.length = 0;
    await ctx.worker.tick();
    expect(sent("send_desktop_notification") + sent("show_review_nudge")).toBe(0);
  });
});
