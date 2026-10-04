import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PopupBlockers } from "@/services/srs";

// Native commands are mocked per test: get_popup_blockers returns `blockers`, other calls are recorded
let blockers: PopupBlockers | Error;
const invokeCalls: string[] = [];
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    invokeCalls.push(cmd);
    if (cmd === "get_popup_blockers") {
      if (blockers instanceof Error) throw blockers;
      return blockers;
    }
    return undefined;
  }),
}));

const none: PopupBlockers = { fullscreen_app: null, screen_sharing_app: null, focus_mode: null, idle_seconds: 3 };

beforeEach(() => {
  invokeCalls.length = 0;
  blockers = { ...none };
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

describe("background worker", () => {
  async function setup(respectFocus: boolean) {
    vi.resetModules();
    const db = await import("@/services/db");
    const srs = await import("@/services/srs");
    const reminders = await import("@/services/reminderSettings");
    await db.insertEnrichedWord({ word: "latency", meaning_vn: "độ trễ", synonyms: [], antonyms: [], examples: [] });
    reminders.saveReminderSettings({ enabled: true, intervalMinutes: 15, triggerCondition: "due_only", respectFocus, snoozedUntil: null });
    reminders.recordPopupDisplayed(Date.now() - 60 * 60 * 1000); // last popup an hour ago -> due now
    invokeCalls.length = 0;
    return srs.srsWorker;
  }

  it("postpones the popup while an app is full screen and shows it once free", async () => {
    const worker = await setup(true);
    blockers = { ...none, fullscreen_app: "Keynote" };
    await worker.tick();
    expect(invokeCalls).not.toContain("show_review_popup");

    blockers = { ...none };
    await worker.tick();
    expect(invokeCalls).toContain("show_review_popup");
  });

  it("ignores blockers when the setting is off", async () => {
    const worker = await setup(false);
    blockers = { ...none, fullscreen_app: "Keynote" };
    await worker.tick();
    expect(invokeCalls).not.toContain("get_popup_blockers");
    expect(invokeCalls).toContain("show_review_popup");
  });
});
