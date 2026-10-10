import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PopupBlockers } from "@/services/srs";

// Native commands are mocked per test: get_popup_blockers returns `blockers`, other calls are recorded
let blockers: PopupBlockers | Error;
const invokeCalls: string[] = [];
const invokeArgs: Array<{ cmd: string; args: unknown }> = [];
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: unknown) => {
    invokeCalls.push(cmd);
    invokeArgs.push({ cmd, args });
    if (cmd === "get_popup_blockers") {
      if (blockers instanceof Error) throw blockers;
      return blockers;
    }
    return undefined;
  }),
}));

// User paused 30s ago: a natural break, nothing blocks
const none: PopupBlockers = { fullscreen_app: null, screen_sharing_app: null, focus_mode: null, idle_seconds: 30 };

beforeEach(() => {
  invokeCalls.length = 0;
  invokeArgs.length = 0;
  blockers = { ...none };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getPopupBlockReason", () => {
  it("returns null when nothing blocks", async () => {
    const { getPopupBlockReason } = await import("@/services/srs");
    expect(await getPopupBlockReason()).toBeNull();
  });

  it.each([
    [{ screen_sharing_app: "Zoom (đang chia sẻ màn hình)" }, /chia sẻ màn hình/],
    [{ fullscreen_app: "Keynote" }, /Keynote/],
    [{ focus_mode: true }, /Focus/],
    [{ idle_seconds: 6 * 60 }, /không dùng máy/],
  ])("blocks for %o", async (partial, expected) => {
    const { getPopupBlockReason } = await import("@/services/srs");
    blockers = { ...none, ...partial };
    expect(await getPopupBlockReason()).toMatch(expected);
  });

  it("does not block when detection fails", async () => {
    const { getPopupBlockReason } = await import("@/services/srs");
    blockers = new Error("not supported");
    expect(await getPopupBlockReason()).toBeNull();
  });
});

describe("popupBlockReasonFrom", () => {
  it("waits for a natural pause, but not longer than the max wait", async () => {
    const { popupBlockReasonFrom, MAX_WAIT_FOR_BREAK_MS } = await import("@/services/srs");
    const typing = { ...none, idle_seconds: 2 };
    expect(popupBlockReasonFrom(typing, 0)).toMatch(/thao tác/);
    expect(popupBlockReasonFrom(typing, MAX_WAIT_FOR_BREAK_MS)).toBeNull();
  });

  it("caps how long a full-screen app can postpone the reminder", async () => {
    const { popupBlockReasonFrom, MAX_WAIT_FOR_FULLSCREEN_MS } = await import("@/services/srs");
    const fullscreen = { ...none, fullscreen_app: "Safari" };
    expect(popupBlockReasonFrom(fullscreen, 0)).toMatch(/toàn màn hình/);
    expect(popupBlockReasonFrom(fullscreen, MAX_WAIT_FOR_FULLSCREEN_MS)).toBeNull();
  });

  it("never blocks on idle where it can't be measured (non-macOS)", async () => {
    const { popupBlockReasonFrom } = await import("@/services/srs");
    expect(popupBlockReasonFrom({ ...none, idle_seconds: null }, 0)).toBeNull();
  });
});

describe("nudge payload", () => {
  it("estimates the session length", async () => {
    const { buildNudgePayload, getReminderSettings } = await import("@/services/reminderSettings");
    const p = buildNudgePayload(12, { ...getReminderSettings(), wordsPerSession: 10, snoozeMinutes: 15 });
    expect(p).toMatchObject({ dueCount: 12, sessionSize: 10, estimatedMinutes: 4, snoozeMinutes: 15, autoOpenSeconds: 20 });
  });
});

describe("background worker", () => {
  async function setup(
    respectFocus: boolean,
    opts: { contextMoments?: boolean; intervalMinutes?: 15 | 60; lastPopupAgoMs?: number } = {}
  ) {
    vi.resetModules();
    const db = await import("@/services/db");
    const srs = await import("@/services/srs");
    const reminders = await import("@/services/reminderSettings");
    await db.insertEnrichedWord({ word: "latency", meaning_vn: "độ trễ", synonyms: [], antonyms: [], examples: [] });
    reminders.saveReminderSettings({
      enabled: true,
      intervalMinutes: opts.intervalMinutes ?? 15,
      triggerCondition: "due_only",
      respectFocus,
      snoozedUntil: null,
      contextMoments: opts.contextMoments ?? false,
    });
    // By default the last popup was an hour ago -> due now
    reminders.recordPopupDisplayed(Date.now() - (opts.lastPopupAgoMs ?? 60 * 60 * 1000));
    invokeCalls.length = 0;
    invokeArgs.length = 0;
    return srs.srsWorker;
  }

  const nudgePayload = () =>
    (invokeArgs.find((c) => c.cmd === "show_review_nudge")?.args as { payload: Record<string, any> } | undefined)?.payload;

  it("brings the reminder forward when the learner comes back to the computer", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T14:00:00"));
    // Clock reminder only every hour, the last one 30 minutes ago
    const worker = await setup(true, { contextMoments: true, intervalMinutes: 60, lastPopupAgoMs: 30 * 60 * 1000 });
    blockers = { ...none, idle_seconds: 9 * 60 }; // away
    await worker.tick();
    expect(invokeCalls).not.toContain("show_review_nudge");

    vi.setSystemTime(new Date("2026-10-05T14:00:20"));
    blockers = { ...none, idle_seconds: 20 }; // back, and pausing
    await worker.tick();
    expect(invokeCalls).toContain("show_review_nudge");
    expect(nudgePayload()?.moment).toBe("back");
    expect(nudgePayload()?.motivation?.title).toMatch(/quay lại máy/);
  });

  it("a moment never comes right after the previous reminder", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T14:00:00"));
    const worker = await setup(true, { contextMoments: true, intervalMinutes: 60, lastPopupAgoMs: 5 * 60 * 1000 });
    blockers = { ...none, screen_sharing_app: "Zoom" };
    await worker.tick();
    vi.setSystemTime(new Date("2026-10-05T14:00:20"));
    blockers = { ...none };
    await worker.tick();
    expect(invokeCalls).not.toContain("show_review_nudge");
  });

  it("the clock reminder skips hours where reminders are always ignored", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T14:30:00"));
    const worker = await setup(false);
    localStorage.setItem("myenglish_quiet_hours_v1", JSON.stringify({ day: "2026-10-05", hours: [14] }));
    await worker.tick();
    expect(invokeCalls).not.toContain("show_review_nudge");

    vi.setSystemTime(new Date("2026-10-05T15:01:00"));
    await worker.tick();
    expect(invokeCalls).toContain("show_review_nudge");
  });

  it("postpones the reminder while an app is full screen and shows the corner nudge once free", async () => {
    // A daytime hour: at night the quiet hours would hold the reminder whatever the blockers
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T14:00:00"));
    const worker = await setup(true);
    blockers = { ...none, fullscreen_app: "Keynote" };
    await worker.tick();
    expect(invokeCalls).not.toContain("show_review_nudge");

    blockers = { ...none };
    await worker.tick();
    expect(invokeCalls).toContain("show_review_nudge");
    // The gentle path never opens the full review directly
    expect(invokeCalls).not.toContain("show_review_popup");
  });

  it("waits while the user is typing, then shows the nudge after the max wait", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T10:00:00"));
    const worker = await setup(true);
    blockers = { ...none, idle_seconds: 1 };
    await worker.tick();
    expect(invokeCalls).not.toContain("show_review_nudge");

    vi.setSystemTime(new Date("2026-10-05T10:11:00"));
    await worker.tick();
    expect(invokeCalls).toContain("show_review_nudge");
  });

  it("ignores blockers when the setting is off", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T14:00:00"));
    const worker = await setup(false);
    blockers = { ...none, fullscreen_app: "Keynote" };
    await worker.tick();
    expect(invokeCalls).not.toContain("get_popup_blockers");
    expect(invokeCalls).toContain("show_review_nudge");
  });

  it("opens the full review directly on a manual trigger", async () => {
    const worker = await setup(true);
    await worker.tick(true);
    expect(invokeCalls).toContain("show_review_popup");
    expect(invokeCalls).not.toContain("show_review_nudge");
  });
});
