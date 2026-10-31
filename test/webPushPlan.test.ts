import { beforeEach, describe, expect, it, vi } from "vitest";

// The web reminder plan (web/shell/pushPlan.ts) only reads the app's own reminder settings and helpers.
// Due counts and the learned best hour are stubbed: the plan must follow them, not compute its own.
let due = 5;
let bestHour: number | null = null;
vi.mock("@/services/db", () => ({ countDueCards: vi.fn(async () => ({ reviews: due, newWaiting: 0, newRecallWaiting: 0 })) }));
vi.mock("@/services/reminderMoments", async (orig) => ({
  ...(await orig<typeof import("@/services/reminderMoments")>()),
  getBestReminderHour: () => bestHour,
}));

const { buildPushPlan } = await import("../web/shell/pushPlan");
const { saveReminderSettings, DEFAULT_REMINDER_SETTINGS } = await import("@/services/reminderSettings");
const { customAnchor } = await import("@/services/reminderMoments");

// Saturday 31 Oct 2026, 10:00 local time
const NOW = new Date(2026, 9, 31, 10, 0);
const at = (dayOffset: number, h: number, m = 0) => new Date(2026, 9, 31 + dayOffset, h, m).toISOString();

beforeEach(() => {
  localStorage.clear();
  due = 5;
  bestHour = null;
  saveReminderSettings({ ...DEFAULT_REMINDER_SETTINGS, smartReminders: false });
});

describe("web push plan", () => {
  it("is empty when reminders are off", async () => {
    saveReminderSettings({ enabled: false });
    expect(await buildPushPlan(NOW)).toEqual([]);
  });

  it("reminds at the learner's study times, today and tomorrow, with the due count", async () => {
    saveReminderSettings({ anchors: [customAnchor(12, 30)] });
    const plan = await buildPushPlan(NOW);
    expect(plan.map((p) => p.at)).toEqual([at(0, 12, 30), at(1, 12, 30)]);
    expect(plan[0]).toMatchObject({ title: "MyEnglish", body: "5 thẻ đang chờ bạn ôn", due: 5 });
  });

  it("uses the learned best hour when smart reminders are on", async () => {
    bestHour = 15;
    saveReminderSettings({ smartReminders: true });
    expect((await buildPushPlan(NOW)).map((p) => p.at)).toEqual([at(0, 15), at(1, 15)]);
  });

  it("reminds at nothing without any study time", async () => {
    expect(await buildPushPlan(NOW)).toEqual([]);
  });

  it("keeps quiet at night, during a snooze and past times", async () => {
    saveReminderSettings({ anchors: [customAnchor(23, 0), customAnchor(8, 0)] });
    // 23:00 is night; today's 8:00 has passed
    expect((await buildPushPlan(NOW)).map((p) => p.at)).toEqual([at(1, 8)]);
    saveReminderSettings({ anchors: [customAnchor(19, 0)], snoozedUntil: new Date(2026, 9, 31, 20, 0).getTime() });
    expect((await buildPushPlan(NOW)).map((p) => p.at)).toEqual([at(1, 19)]);
  });

  it("skips times with nothing due when reminders are for due cards only", async () => {
    saveReminderSettings({ anchors: [customAnchor(19, 0)] });
    due = 0;
    expect(await buildPushPlan(NOW)).toEqual([]);
    saveReminderSettings({ triggerCondition: "all_words" });
    const plan = await buildPushPlan(NOW);
    expect(plan).toHaveLength(2);
    expect(plan[0].body).toBe("Dành vài phút ôn từ nhé");
  });

  it("merges study times closer than 30 minutes", async () => {
    saveReminderSettings({ anchors: [customAnchor(12, 0), customAnchor(12, 20)] });
    expect((await buildPushPlan(NOW)).map((p) => p.at)).toEqual([at(0, 12), at(1, 12)]);
  });
});
