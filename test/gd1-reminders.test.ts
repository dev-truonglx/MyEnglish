import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PopupBlockers } from "@/services/srs";
import type { ReminderSettings } from "@/services/reminderSettings";
import { ignoredNudgeSnoozeMinutes, triggerReviewNudge, getNudgesShownToday } from "@/services/reminderSettings";
import { isMainSessionActive, setMainSessionActive } from "@/services/activeSession";
import { getDailyGoal, getLocalDateString } from "@/services/streak";

// Native commands are mocked: blockers come from `blockers`, show_review_nudge answers `nudgeShown`
let blockers: PopupBlockers;
let nudgeShown: boolean;
const invokeCalls: string[] = [];
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    invokeCalls.push(cmd);
    if (cmd === "get_popup_blockers") return blockers;
    if (cmd === "show_review_nudge") return nudgeShown;
    return undefined;
  }),
}));

const none: PopupBlockers = { fullscreen_app: null, screen_sharing_app: null, focus_mode: null, idle_seconds: 30 };

beforeEach(() => {
  invokeCalls.length = 0;
  blockers = { ...none };
  nudgeShown = true;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ignored reminders back off from the reminder interval (N3)", () => {
  it("a 2 h interval waits 2 h, then 4 h at most", () => {
    expect([0, 1, 2, 3].map((n) => ignoredNudgeSnoozeMinutes(n, 10, 120))).toEqual([120, 240, 240, 240]);
  });

  it("a 30 min interval waits 30, 60, 120, then 4 h", () => {
    expect([0, 1, 2, 3, 4].map((n) => ignoredNudgeSnoozeMinutes(n, 10, 30))).toEqual([30, 60, 120, 240, 240]);
  });

  it("with reminders off the snooze itself doubles 10, 20, 40, 80 and stops there", () => {
    expect([0, 1, 2, 3, 4, 9].map((n) => ignoredNudgeSnoozeMinutes(n, 10, 0))).toEqual([10, 20, 40, 80, 80, 80]);
  });
});

describe("isMainSessionActive (item 5)", () => {
  it("is on while the main window keeps refreshing the flag, and off once it goes stale", () => {
    const t = Date.parse("2026-10-11T10:00:00");
    expect(isMainSessionActive(t)).toBe(false);
    setMainSessionActive(true, t);
    expect(isMainSessionActive(t + 1000)).toBe(true);
    expect(isMainSessionActive(t + 10 * 60 * 1000 - 1)).toBe(true);
    expect(isMainSessionActive(t + 10 * 60 * 1000)).toBe(false); // a closed session stops blocking
    setMainSessionActive(false);
    expect(isMainSessionActive(t + 61 * 1000)).toBe(false);
  });
});

// Same worker setup as popup.test.ts: one new word, the last reminder shown `lastPopupAgoMs` ago
async function setup(opts: Partial<ReminderSettings> & { lastPopupAgoMs?: number } = {}) {
  // Let a previous tick's tray refresh finish its lazy imports before the reset (see gd4-tray.test.ts)
  await vi.dynamicImportSettled();
  vi.resetModules();
  const db = await import("@/services/db");
  const srs = await import("@/services/srs");
  const reminders = await import("@/services/reminderSettings");
  const { lastPopupAgoMs = 60 * 60 * 1000, ...settings } = opts;
  const id = await db.insertEnrichedWord({ word: "latency", meaning_vn: "độ trễ", synonyms: [], antonyms: [], examples: [] });
  reminders.saveReminderSettings({
    enabled: true,
    intervalMinutes: 60,
    triggerCondition: "due_only",
    respectFocus: false,
    contextMoments: false,
    snoozedUntil: null,
    ...settings,
  });
  reminders.recordPopupDisplayed(Date.now() - lastPopupAgoMs);
  invokeCalls.length = 0;
  return { db, srs, reminders, id, worker: srs.srsWorker };
}

const shown = () => invokeCalls.includes("show_review_nudge");

describe("reminder tick", () => {
  it("a wait for a quiet moment restarts after a tick that was not ready (N1)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T10:00:00"));
    const { worker, reminders } = await setup({ respectFocus: true });
    blockers = { ...none, idle_seconds: 1 }; // typing
    await worker.tick();
    expect(shown()).toBe(false);

    // Snoozed: this tick is not ready, so the earlier wait must not carry over
    vi.setSystemTime(new Date("2026-10-05T10:01:00"));
    reminders.saveReminderSettings({ snoozedUntil: new Date("2026-10-05T10:03:00").getTime() });
    await worker.tick();

    vi.setSystemTime(new Date("2026-10-05T10:04:00"));
    await worker.tick(); // blocked again: the wait starts now
    vi.setSystemTime(new Date("2026-10-05T10:11:00"));
    await worker.tick(); // 7 minutes into the new wait (11 since the first block): still held
    expect(shown()).toBe(false);

    vi.setSystemTime(new Date("2026-10-05T10:15:00")); // 11 minutes into the new wait: max wait passed
    await worker.tick();
    expect(shown()).toBe(true);
  });

  it("an anchor study time is shown even after the daily cap is reached (N4)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T13:20:00")); // "after lunch" is 13:15
    localStorage.setItem("myenglish_nudges_today_v1", JSON.stringify({ day: "2026-10-05", count: 8 }));
    const { worker } = await setup({ maxNudgesPerDay: 8, anchors: ["after_lunch"] });
    await worker.tick();
    expect(shown()).toBe(true);
  });

  it("the daily cap still holds the clock reminder (N4)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T13:20:00"));
    localStorage.setItem("myenglish_nudges_today_v1", JSON.stringify({ day: "2026-10-05", count: 8 }));
    const { worker } = await setup({ maxNudgesPerDay: 8, anchors: [] });
    await worker.tick();
    expect(shown()).toBe(false);
  });

  it("a nudge that did not appear is not counted toward the daily cap (N4)", async () => {
    await setup();
    nudgeShown = false; // the review popup is already open
    expect(await triggerReviewNudge(3)).toBe(false);
    expect(getNudgesShownToday()).toBe(0);

    nudgeShown = true;
    expect(await triggerReviewNudge(3)).toBe(true);
    expect(getNudgesShownToday()).toBe(1);
  });

  it("the daily goal does not stop reminders while a review is still due (S5)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T10:00:00"));
    const { srs, id, worker } = await setup();
    // Graduate the word, then let its review fall due at midday
    const first = await srs.recordReview(id, srs.Rating.Good);
    vi.setSystemTime(new Date(new Date(first.nextReviewDate).getTime() + 1000));
    const second = await srs.recordReview(id, srs.Rating.Good);
    const dueAt = new Date(second.nextReviewDate);
    const noon = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate(), 12);
    vi.setSystemTime(noon.getTime() >= dueAt.getTime() ? noon : new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate() + 1, 12));
    // Today's goal is met, but a review is still waiting
    localStorage.setItem("myenglish_study_logs_v1", JSON.stringify({ [getLocalDateString()]: getDailyGoal() }));
    await worker.tick();
    expect(shown()).toBe(true);
  });

  it("the daily goal stops reminders once nothing is due (S5)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T10:00:00"));
    const { worker } = await setup(); // only a new word, no review due
    localStorage.setItem("myenglish_study_logs_v1", JSON.stringify({ [getLocalDateString()]: getDailyGoal() }));
    await worker.tick();
    expect(shown()).toBe(false);
  });

  it("is held while the main window is studying (item 5)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T10:00:00"));
    const { worker } = await setup();
    setMainSessionActive(true, Date.now());
    await worker.tick();
    expect(shown()).toBe(false);

    setMainSessionActive(false);
    await worker.tick();
    expect(shown()).toBe(true);
  });

  it("due_then_random triggers reminders for practice even when 0 words are due", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T10:00:00"));
    const { worker, srs, id } = await setup({ triggerCondition: "due_then_random" });
    // Graduate the word far in the future so work.total is 0
    await srs.recordReview(id, srs.Rating.Easy);
    await worker.tick();
    expect(shown()).toBe(true);
  });
});
