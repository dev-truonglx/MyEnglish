import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PopupBlockers } from "@/services/srs";
import type { ReminderSettings } from "@/services/reminderSettings";
import {
  snoozeUntilTomorrow,
  resumeReminders,
  applyTrayReminderAction,
  snoozedUntilLabel,
  snoozeIgnoredNudge,
  isSnoozed,
  getReminderSettings,
  getLastPopupDisplayTime,
  LAST_POPUP_DISPLAY_KEY,
} from "@/services/reminderSettings";
import { detectMoment, FullscreenExitTracker, FULLSCREEN_MOMENT_GAP_MS } from "@/services/reminderMoments";

// Native side mocked: blockers come from `blockers`, listeners are kept per event (attached after a
// round trip, like the real `listen`), other commands are recorded
const native = vi.hoisted(() => {
  const listeners = new Map<string, Set<(e: { payload: unknown }) => void>>();
  const calls: Array<{ cmd: string; args: unknown }> = [];
  const state: { blockers: unknown } = { blockers: null };
  const api = {
    invoke: async (cmd: string, args?: unknown) => {
      calls.push({ cmd, args });
      if (cmd === "get_popup_blockers") return state.blockers;
      if (cmd === "show_review_nudge") return true;
      return undefined;
    },
    listen: async (event: string, handler: (e: { payload: unknown }) => void) => {
      await Promise.resolve();
      await Promise.resolve();
      const set = listeners.get(event) ?? new Set();
      set.add(handler);
      listeners.set(event, set);
      return () => {
        set.delete(handler);
      };
    },
    emit: async () => {},
    isPermissionGranted: async () => true,
    requestPermission: async () => "granted",
    sendNotification: () => {},
  };
  return { listeners, calls, state, api };
});
vi.mock("@tauri-apps/api/core", () => native.api);
vi.mock("@tauri-apps/api/event", () => native.api);

const none: PopupBlockers = { fullscreen_app: null, screen_sharing_app: null, focus_mode: null, idle_seconds: 30 };
const MIN = 60 * 1000;

beforeEach(() => {
  native.calls.length = 0;
  native.listeners.clear();
  native.state.blockers = { ...none };
});

afterEach(() => {
  vi.useRealTimers();
});

const at = (iso: string) => {
  vi.setSystemTime(new Date(iso));
};
const shownNudge = () => native.calls.find((c) => c.cmd === "show_review_nudge");
const nudgeMoment = () => (shownNudge()?.args as { payload: { moment?: string | null } } | undefined)?.payload.moment;

// Same worker setup as gd1-reminders.test.ts: one new word, the last reminder shown `lastPopupAgoMs` ago
async function setup(opts: Partial<ReminderSettings> & { lastPopupAgoMs?: number } = {}) {
  vi.resetModules();
  const db = await import("@/services/db");
  const srs = await import("@/services/srs");
  const reminders = await import("@/services/reminderSettings");
  const { lastPopupAgoMs = 60 * MIN, ...settings } = opts;
  await db.insertEnrichedWord({ word: "latency", meaning_vn: "độ trễ", synonyms: [], antonyms: [], examples: [] });
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
  native.calls.length = 0;
  return { srs, reminders, worker: srs.srsWorker };
}

describe("tray pauses (N9)", () => {
  it("pauses until 07:00 tomorrow, or this morning when the night is still going on", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-11T15:30:00");
    expect(snoozeUntilTomorrow()).toBe(new Date("2026-10-12T07:00:00").getTime());
    expect(isSnoozed()).toBe(true);
    expect(snoozedUntilLabel()).toBe("07:00");

    at("2026-10-12T02:00:00");
    expect(snoozeUntilTomorrow()).toBe(new Date("2026-10-12T07:00:00").getTime());
  });

  it("resumes reminders, and the tooltip label goes away", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-11T15:30:00");
    snoozeUntilTomorrow();
    resumeReminders();
    expect(isSnoozed()).toBe(false);
    expect(getReminderSettings().snoozedUntil).toBeNull();
    expect(snoozedUntilLabel()).toBeNull();
  });

  it("applies the tray menu actions", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-11T15:30:00");
    expect(applyTrayReminderAction("pause_1h")).toBe(true);
    expect(snoozedUntilLabel()).toBe("16:30");
    expect(applyTrayReminderAction("pause_tomorrow")).toBe(true);
    expect(snoozedUntilLabel()).toBe("07:00");
    expect(applyTrayReminderAction("resume")).toBe(true);
    expect(isSnoozed()).toBe(false);
    expect(applyTrayReminderAction("format_disk")).toBe(false);
  });

  it("a card timing out after a tray pause does not shorten the pause", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-11T15:30:00");
    const until = snoozeUntilTomorrow();
    snoozeIgnoredNudge();
    expect(getReminderSettings().snoozedUntil).toBe(until);
  });

  it("the worker applies a tray action and refreshes the tooltip", async () => {
    const { worker } = await setup();
    await worker.start();
    const handlers = native.listeners.get("tray-reminder-action");
    expect(handlers?.size).toBe(1);
    handlers!.forEach((h) => h({ payload: { action: "pause_1h" } }));
    expect(isSnoozed()).toBe(true);
    await vi.waitFor(() => expect(native.calls.some((c) => c.cmd === "set_tray_due_count")).toBe(true));
    const args = native.calls.find((c) => c.cmd === "set_tray_due_count")!.args as { pausedUntil: string | null };
    expect(args.pausedUntil).toMatch(/^\d\d:\d\d$/);
    worker.stop();
  });
});

describe("worker start/stop race (N17)", () => {
  const count = (event: string) => native.listeners.get(event)?.size ?? 0;

  it("two overlapping starts leave one set of listeners and one timer", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { worker } = await setup();
    await Promise.all([worker.start(), worker.start()]);
    expect(count("srs-heartbeat")).toBe(1);
    expect(count("review-popup-opened")).toBe(1);
    expect(count("tray-reminder-action")).toBe(1);
    expect(vi.getTimerCount()).toBe(1);

    worker.stop();
    expect(count("srs-heartbeat") + count("review-popup-opened") + count("tray-reminder-action")).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a stop while start is still attaching leaves nothing behind", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { worker } = await setup();
    const starting = worker.start();
    worker.stop();
    await starting;
    expect(count("srs-heartbeat") + count("review-popup-opened") + count("tray-reminder-action")).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("morning reminder at launch (N12)", () => {
  const state = (p: Partial<PopupBlockers> = {}): PopupBlockers => ({ ...none, idle_seconds: 5, ...p });

  it("the first reading of the day counts as morning when nothing was studied yet", () => {
    expect(detectMoment(null, state(), 0, { hour: 8, studiedToday: false })).toBe("morning");
    // Past midnight with an earlier reading: the first reading of the new day
    expect(detectMoment(state(), state(), 15_000, { hour: 8, studiedToday: false, firstToday: true })).toBe("morning");
    // Already studied, outside the morning, away, or in a full-screen app
    expect(detectMoment(null, state(), 0, { hour: 8, studiedToday: true })).toBeNull();
    expect(detectMoment(null, state(), 0, { hour: 14, studiedToday: false })).toBeNull();
    expect(detectMoment(null, state({ idle_seconds: 600 }), 0, { hour: 8, studiedToday: false })).toBeNull();
    expect(detectMoment(null, state({ fullscreen_app: "Keynote" }), 0, { hour: 8, studiedToday: false })).toBeNull();
    // Idle time can't be measured (not macOS): the app just started, so the learner is there
    expect(detectMoment(null, state({ idle_seconds: null }), 0, { hour: 8, studiedToday: false })).toBe("morning");
    // Not the first reading: the usual "back at the computer" rule
    expect(detectMoment(state(), state(), 15_000, { hour: 8, studiedToday: false })).toBeNull();
  });

  it("the worker's first tick after an 8:00 launch shows the morning reminder", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-12T08:00:00");
    // Clock reminder only every hour, the last one 30 minutes ago
    const { worker } = await setup({ contextMoments: true, lastPopupAgoMs: 30 * MIN });
    native.state.blockers = state();
    await worker.tick();
    expect(nudgeMoment()).toBe("morning");
  });
});

describe("leaving full screen (N11)", () => {
  const full = (app = "Code"): PopupBlockers => ({ ...none, fullscreen_app: app });
  const t0 = Date.parse("2026-10-12T14:00:00");

  /** Full screen from t0 for `minutes`, read every 4 minutes; returns the time of the last reading */
  function stretch(tracker: FullscreenExitTracker, from: number, minutes: number): number {
    let t = from;
    for (; t <= from + minutes * MIN; t += 4 * MIN) expect(tracker.observe(full(), t)).toBe(false);
    return t - 4 * MIN;
  }

  it("a short full-screen stretch is not work done", () => {
    const tracker = new FullscreenExitTracker();
    const end = stretch(tracker, t0, 8);
    expect([0, 15, 30, 45].map((s) => tracker.observe(none, end + MIN + s * 1000))).toEqual([false, false, false, false]);
  });

  it("a Cmd+Tab away and back keeps the stretch going; leaving for good counts once", () => {
    const tracker = new FullscreenExitTracker();
    const end = stretch(tracker, t0, 24);
    expect(tracker.observe(none, end + 15_000)).toBe(false); // Cmd+Tab to the browser
    expect(tracker.observe(full(), end + 30_000)).toBe(false); // back in the IDE
    expect(tracker.observe(none, end + 45_000)).toBe(false); // left again
    expect(tracker.observe(none, end + 60_000)).toBe(false); // ...and stays out
    expect(tracker.observe(none, end + 75_000)).toBe(true); // for good
    expect(tracker.observe(none, end + 90_000)).toBe(false);
  });

  it("at most once an hour", () => {
    const tracker = new FullscreenExitTracker();
    let end = stretch(tracker, t0, 24);
    const leave = (from: number) => [15, 30, 45].map((s) => tracker.observe(none, from + s * 1000)).includes(true);
    expect(leave(end)).toBe(true);
    end = stretch(tracker, end + MIN, 24); // a second long stretch within the hour
    expect(leave(end)).toBe(false);
    end = stretch(tracker, t0 + FULLSCREEN_MOMENT_GAP_MS, 24);
    expect(leave(end)).toBe(true);
  });

  it("a gap in the readings (asleep) breaks the stretch", () => {
    const tracker = new FullscreenExitTracker();
    tracker.observe(full(), t0);
    tracker.observe(full(), t0 + 30 * MIN); // nothing read in between
    const later = t0 + 30 * MIN;
    expect([15, 30, 45].map((s) => tracker.observe(none, later + s * 1000))).toEqual([false, false, false]);
  });

  it("the worker reminds after a long stretch ends for good, not on a Cmd+Tab", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(t0);
    // Clock reminder due at 14:30
    const { worker } = await setup({ contextMoments: true, lastPopupAgoMs: 30 * MIN });
    const read = async (t: number, b: PopupBlockers) => {
      vi.setSystemTime(t);
      native.state.blockers = b;
      await worker.tick();
    };
    for (let m = 0; m <= 24; m += 4) await read(t0 + m * MIN, full());
    await read(t0 + 25 * MIN, none); // Cmd+Tab out...
    await read(t0 + 25 * MIN + 15_000, full()); // ...and back
    await read(t0 + 26 * MIN, full());
    expect(shownNudge()).toBeUndefined();

    await read(t0 + 27 * MIN, none);
    await read(t0 + 27 * MIN + 15_000, none);
    expect(shownNudge()).toBeUndefined();
    await read(t0 + 27 * MIN + 30_000, none);
    expect(nudgeMoment()).toBe("after_fullscreen");
  });
});

describe("automatic reminders off keeps the chosen study times (N10)", () => {
  it("interval 0 still reminds at an anchor time, once", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-12T13:20:00"); // "after lunch" is 13:15
    const { worker } = await setup({ intervalMinutes: 0, anchors: ["after_lunch"] });
    await worker.tick();
    expect(nudgeMoment()).toBe("anchor_lunch");

    native.calls.length = 0;
    at("2026-10-12T13:50:00"); // still in the anchor window, but it already reminded today
    await worker.tick();
    expect(shownNudge()).toBeUndefined();
  });

  it("interval 0 shows nothing outside an anchor time, nor right after another reminder", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-12T11:00:00");
    const { worker } = await setup({ intervalMinutes: 0, anchors: ["after_lunch"] });
    await worker.tick();
    expect(shownNudge()).toBeUndefined();

    at("2026-10-12T13:20:00");
    const { worker: w2 } = await setup({ intervalMinutes: 0, anchors: ["after_lunch"], lastPopupAgoMs: 5 * MIN });
    await w2.tick();
    await w2.tick();
    expect(shownNudge()).toBeUndefined();
  });

  it("reminders turned off turn the anchors off too", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-12T13:20:00");
    const { worker } = await setup({ enabled: false, anchors: ["after_lunch"] });
    await worker.tick();
    expect(shownNudge()).toBeUndefined();
  });
});

describe("system clock set back (N18)", () => {
  it("a display time in the future is clamped to now and saved", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-12T10:00:00");
    const now = Date.now();
    localStorage.setItem(LAST_POPUP_DISPLAY_KEY, String(now + 3 * 60 * MIN));
    expect(getLastPopupDisplayTime()).toBe(now);
    expect(localStorage.getItem(LAST_POPUP_DISPLAY_KEY)).toBe(String(now));
    // Within the tolerance it is left alone
    localStorage.setItem(LAST_POPUP_DISPLAY_KEY, String(now + 30_000));
    expect(getLastPopupDisplayTime()).toBe(now + 30_000);
  });

  it("reminders come back one interval after the clock went back", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-12T10:00:00");
    // The last reminder was recorded "tomorrow" before the clock was set back a day
    const { worker } = await setup({ intervalMinutes: 15, lastPopupAgoMs: -24 * 60 * MIN });
    await worker.tick();
    expect(shownNudge()).toBeUndefined();
    at("2026-10-12T10:16:00");
    await worker.tick();
    expect(shownNudge()).toBeDefined();
  });
});
