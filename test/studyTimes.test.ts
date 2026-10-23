import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReminderSettings } from "@/services/reminderSettings";
import {
  getIgnoredNudgeCount,
  getReminderSettings,
  remindAt,
  reminderTimeOptions,
  saveReminderSettings,
} from "@/services/reminderSettings";
import {
  anchorTime,
  bestReminderHour,
  customAnchor,
  dueAnchor,
  getBestReminderHour,
  isCustomAnchor,
  markAnchorFired,
  markBestHourGuarantee,
  markQuietHourProbe,
  bestHourGuaranteeOpen,
  quietHourProbeOpen,
  QUIET_PROBE_EVERY_DAYS,
} from "@/services/reminderMoments";
import { dismissStudyAnchorSuggestion, suggestStudyAnchor } from "@/services/habits";
import type { LearningEvent } from "@/services/learningEvents";

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

/** Answers on `days` consecutive days (from 2026-10-01), a session at each of `times` ("HH:MM") */
function answers(days: number, times: string[], extraPerSession = 3): string[] {
  const out: string[] = [];
  for (let d = 0; d < days; d++) {
    for (const t of times) {
      for (let i = 0; i < extraPerSession; i++) {
        const base = new Date(`2026-10-${String(1 + d).padStart(2, "0")}T${t}:00`);
        out.push(new Date(base.getTime() + i * 2 * MIN).toISOString());
      }
    }
  }
  return out;
}

describe("a study time learned from when the learner answers", () => {
  it("finds the usual start of a session and suggests a little before it", () => {
    const s = suggestStudyAnchor(answers(10, ["20:40"]));
    expect(s).toEqual({ hour: 20, minute: 40, days: 10, activeDays: 10 });
  });

  it("answers a few minutes apart are one session, hours apart are two", () => {
    const s = suggestStudyAnchor(answers(8, ["12:00", "20:00"]));
    // Two habits of equal weight: the earlier window is kept
    expect(s?.hour).toBe(12);
    expect(s?.days).toBe(8);
  });

  it("uses the earlier quarter of the starts when they spread over the window", () => {
    const spread = [
      ...answers(4, ["19:00"]),
      ...answers(4, ["19:40"]).map((t) => t),
    ];
    // Same days twice: 8 starts on 4 days; quarter point is 19:00
    const s = suggestStudyAnchor(spread);
    expect(s).toMatchObject({ hour: 19, minute: 0, days: 4 });
  });

  it("needs a habit: four days and 40% of the days with any study", () => {
    expect(suggestStudyAnchor(answers(3, ["20:40"]))).toBeNull();
    // 10 days of study at all hours, no stretch repeating on 40% of them
    const scattered = ["07:30", "10:00", "13:00", "16:30", "19:00", "21:00"].flatMap((t, i) =>
      answers(2, [t]).map((iso) => new Date(new Date(iso).getTime() + i * 24 * 60 * MIN).toISOString())
    );
    expect(suggestStudyAnchor(scattered)).toBeNull();
    expect(suggestStudyAnchor([])).toBeNull();
  });

  it("never suggests a night time, where reminders are paused", () => {
    expect(suggestStudyAnchor(answers(10, ["23:10"]))).toBeNull();
    expect(suggestStudyAnchor(answers(10, ["05:30"]))).toBeNull();
  });

  it("stays quiet when a study time within an hour already exists", () => {
    const log = answers(10, ["20:40"]);
    expect(suggestStudyAnchor(log, [{ hour: 20, minute: 0 }])).toBeNull();
    expect(suggestStudyAnchor(log, [{ hour: 17, minute: 30 }])).not.toBeNull();
  });

  it("'later' keeps it away for two weeks", () => {
    // The suggestion itself is loaded from SQLite (loadStudyAnchorSuggestion); the dismissal is a stored deadline
    dismissStudyAnchorSuggestion(Date.parse("2026-10-12T10:00:00"));
    expect(Number(localStorage.getItem("myenglish_anchor_suggestion_dismissed_v1"))).toBe(
      Date.parse("2026-10-26T10:00:00")
    );
  });
});

describe("custom study times", () => {
  it("are stored as at_HHMM and read back", () => {
    expect(customAnchor(8, 5)).toBe("at_0805");
    expect(isCustomAnchor("at_2040")).toBe(true);
    expect(isCustomAnchor("at_2460")).toBe(false);
    expect(isCustomAnchor("after_lunch")).toBe(false);
    expect(anchorTime("at_2040")).toMatchObject({ hour: 20, minute: 40, moment: "anchor_custom" });
    expect(anchorTime("after_lunch")).toMatchObject({ hour: 13, minute: 15, moment: "anchor_lunch" });
    expect(anchorTime("lunch?")).toBeNull();
  });

  it("fire once a day inside their window, like the fixed ones", () => {
    const anchors = [customAnchor(20, 40)];
    expect(dueAnchor(new Date("2026-10-12T20:30:00"), anchors)).toBeNull();
    expect(dueAnchor(new Date("2026-10-12T20:41:00"), anchors)).toBe("at_2040");
    expect(dueAnchor(new Date("2026-10-12T22:15:00"), anchors)).toBeNull(); // past the 90-minute window
    markAnchorFired("at_2040", new Date("2026-10-12T20:41:00"));
    expect(dueAnchor(new Date("2026-10-12T20:50:00"), anchors)).toBeNull();
    expect(dueAnchor(new Date("2026-10-13T20:50:00"), anchors)).toBe("at_2040");
  });

  it("a corrupted entry is skipped, not a crash", () => {
    expect(dueAnchor(new Date("2026-10-12T20:41:00"), ["nonsense" as never, customAnchor(20, 40)])).toBe("at_2040");
  });
});

describe("the hour reminders are answered most", () => {
  const ev = (type: LearningEvent["type"], hour: number): LearningEvent => ({
    type,
    at: new Date(2026, 9, 10, hour, 0).toISOString(),
    wordId: null,
    direction: null,
    meta: null,
  });
  const many = (type: LearningEvent["type"], hour: number, n: number) => Array.from({ length: n }, () => ev(type, hour));

  it("is the best rate among hours with 3+ reminders, and 40% or more", () => {
    const events = [
      ...many("nudge_shown", 9, 4),
      ...many("nudge_opened", 9, 2), // 50%
      ...many("nudge_shown", 20, 4),
      ...many("nudge_opened", 20, 3), // 75%
      ...many("nudge_shown", 14, 10), // 0%
    ];
    expect(bestReminderHour(events)).toBe(20);
  });

  it("is null when nothing is answered often enough", () => {
    expect(bestReminderHour([...many("nudge_shown", 9, 5), ...many("nudge_opened", 9, 1)])).toBeNull();
    expect(bestReminderHour([...many("nudge_shown", 9, 2), ...many("nudge_opened", 9, 2)])).toBeNull(); // too few
    expect(bestReminderHour([])).toBeNull();
  });

  it("the guarantee is open at that hour once a day", () => {
    localStorage.setItem("myenglish_quiet_hours_v1", JSON.stringify({ day: "2026-10-12", hours: [], best: 20 }));
    expect(getBestReminderHour()).toBe(20);
    expect(bestHourGuaranteeOpen(new Date("2026-10-12T20:10:00"))).toBe(true);
    expect(bestHourGuaranteeOpen(new Date("2026-10-12T14:10:00"))).toBe(false);
    markBestHourGuarantee(new Date("2026-10-12T20:10:00"));
    expect(bestHourGuaranteeOpen(new Date("2026-10-12T20:40:00"))).toBe(false);
    expect(bestHourGuaranteeOpen(new Date("2026-10-13T20:10:00"))).toBe(true);
  });

  it("no best hour, no guarantee", () => {
    expect(getBestReminderHour()).toBeNull();
    expect(bestHourGuaranteeOpen(new Date("2026-10-12T20:10:00"))).toBe(false);
  });
});

describe("quiet hours are tried again now and then", () => {
  // The first date from 2026-10-12 on whose day number is a multiple of the probe period
  const dayNumber = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
  const probeDay = (() => {
    for (let i = 0; i < QUIET_PROBE_EVERY_DAYS; i++) {
      const d = new Date(2026, 9, 12 + i, 15, 10);
      if (dayNumber(d) % QUIET_PROBE_EVERY_DAYS === 0) return d;
    }
    throw new Error("no probe day");
  })();
  const otherDay = new Date(probeDay.getTime() + 24 * 60 * MIN);

  it("opens on one day in five, and once on that day", () => {
    expect(quietHourProbeOpen(probeDay)).toBe(true);
    expect(quietHourProbeOpen(otherDay)).toBe(false);
    markQuietHourProbe(probeDay);
    expect(quietHourProbeOpen(new Date(probeDay.getTime() + 30 * MIN))).toBe(false);
  });

  it("the worker lets one reminder through a skipped hour on a probe day only", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    // An ordinary day: the skipped hour holds the reminder back
    at(otherDay.toISOString());
    let ctx = await setup({ intervalMinutes: 15 });
    localStorage.setItem("myenglish_quiet_hours_v1", JSON.stringify({ day: key(otherDay), hours: [15], best: null }));
    await ctx.worker.tick();
    expect(sent("show_review_nudge")).toBe(0);

    // A probe day: one gets through, the next in that hour does not
    at(probeDay.toISOString());
    ctx = await setup({ intervalMinutes: 15 });
    localStorage.setItem("myenglish_quiet_hours_v1", JSON.stringify({ day: key(probeDay), hours: [15], best: null }));
    await ctx.worker.tick();
    expect(sent("show_review_nudge")).toBe(1);
    at(new Date(probeDay.getTime() + 20 * MIN).toISOString());
    native.calls.length = 0;
    await ctx.worker.tick();
    expect(sent("show_review_nudge")).toBe(0);
  });
});

describe("reminder times offered on the card", () => {
  const labels = (iso: string, anchors: string[] = []) => reminderTimeOptions(new Date(iso), anchors).map((o) => o.label);

  it("in the morning: 1 and 2 hours, then lunch and the end of the day", () => {
    expect(labels("2026-10-12T10:00:00")).toEqual(["1 giờ nữa", "2 giờ nữa", "13:15", "17:30"]);
  });

  it("uses the learner's own study times when they have some", () => {
    expect(labels("2026-10-12T10:00:00", [customAnchor(20, 40)])).toEqual(["1 giờ nữa", "2 giờ nữa", "20:40", "Sáng mai 07:30"]);
  });

  it("never offers a night time, and falls back to tomorrow morning", () => {
    expect(labels("2026-10-12T20:00:00")).toEqual(["1 giờ nữa", "Sáng mai 07:30"]); // 22:00 is already night
    expect(labels("2026-10-12T21:00:00")).toEqual(["Sáng mai 07:30"]);
    expect(labels("2026-10-12T23:30:00")).toEqual(["Sáng mai 07:30"]);
    const [tomorrow] = reminderTimeOptions(new Date("2026-10-12T23:30:00"));
    expect(tomorrow.at).toBe(new Date("2026-10-13T07:30:00").getTime());
  });

  it("nothing nearer than half an hour, and no two almost at the same time", () => {
    const options = reminderTimeOptions(new Date("2026-10-12T12:20:00"));
    expect(options.every((o) => o.at - new Date("2026-10-12T12:20:00").getTime() >= 30 * MIN)).toBe(true);
    const times = options.map((o) => o.at);
    expect(new Set(times).size).toBe(times.length);
    // 13:15 is within 15 minutes of "1 giờ nữa" (13:20): only one of them is kept
    expect(options.filter((o) => Math.abs(o.at - new Date("2026-10-12T13:20:00").getTime()) < 15 * MIN)).toHaveLength(1);
  });

  it("picking one sets the next reminder to that time and never counts as ignored", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-12T10:00:00");
    const [, , lunch] = reminderTimeOptions(new Date());
    expect(remindAt(lunch.at)).toBe(195);
    expect(getReminderSettings().snoozedUntil).toBe(lunch.at);
    expect(getIgnoredNudgeCount()).toBe(0);
  });
});

// Same worker setup as missedNudges.test.ts: one new word, the last reminder shown `lastPopupAgoMs` ago
async function setup(opts: Partial<ReminderSettings> & { lastPopupAgoMs?: number } = {}) {
  await vi.dynamicImportSettled();
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
    smartReminders: true,
    snoozedUntil: null,
    ...settings,
  });
  reminders.recordPopupDisplayed(Date.now() - lastPopupAgoMs);
  native.calls.length = 0;
  return { srs, reminders, worker: srs.srsWorker };
}

const sent = (cmd: string) => native.calls.filter((c) => c.cmd === cmd).length;
const nudgeMoment = () =>
  (native.calls.find((c) => c.cmd === "show_review_nudge")?.args as { payload: { moment?: string | null } } | undefined)?.payload
    .moment;

describe("the worker and the learner's own study time", () => {
  it("reminds at a custom study time, with its own wording", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-12T20:45:00");
    // The clock reminder is not due (every 2 hours, the last one 30 minutes ago): only the study time can bring it
    const { worker } = await setup({ intervalMinutes: 120, lastPopupAgoMs: 30 * MIN, anchors: [customAnchor(20, 40)] });
    await worker.tick();
    expect(nudgeMoment()).toBe("anchor_custom");
  });
});

describe("the best hour keeps one reminder past the daily cap", () => {
  const capUsed = (iso: string) => {
    const d = new Date(iso);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    localStorage.setItem("myenglish_nudges_today_v1", JSON.stringify({ day, count: 1 }));
    localStorage.setItem("myenglish_quiet_hours_v1", JSON.stringify({ day, hours: [], best: 15 }));
  };

  it("at the best hour, once; at other hours the cap holds", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-12T14:10:00");
    const { worker } = await setup({ maxNudgesPerDay: 1, intervalMinutes: 15 });
    capUsed("2026-10-12T14:10:00");

    await worker.tick();
    expect(sent("show_review_nudge")).toBe(0); // 14h: the cap holds

    at("2026-10-12T15:10:00");
    await worker.tick();
    expect(sent("show_review_nudge")).toBe(1); // 15h: the best hour

    at("2026-10-12T15:40:00");
    native.calls.length = 0;
    await worker.tick();
    expect(sent("show_review_nudge")).toBe(0); // used for today
  });

  it("not when smart reminders are off", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-12T15:10:00");
    const { worker } = await setup({ maxNudgesPerDay: 1, intervalMinutes: 15, smartReminders: false });
    capUsed("2026-10-12T15:10:00");
    await worker.tick();
    expect(sent("show_review_nudge")).toBe(0);
  });

  it("the saved setting survives a reload", () => {
    saveReminderSettings({ anchors: [customAnchor(20, 40)] });
    expect(getReminderSettings().anchors).toEqual(["at_2040"]);
  });
});
