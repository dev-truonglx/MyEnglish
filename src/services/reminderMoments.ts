/**
 * Reminders at natural transitions instead of only by the clock. A desktop app can see when the learner
 * comes back to the computer, stops sharing their screen or leaves a full-screen app: right then, a
 * 2-minute review fits ("after X, I review") far better than in the middle of focused work.
 *
 * Also learns the hours when reminders are almost always snoozed or ignored, and skips the clock-based
 * reminder in those hours (transition moments still come through).
 */
import type { PopupBlockers } from "./srs";
import { getLearningEventsSince, type LearningEvent } from "./learningEvents";
import { getLocalDateString } from "./streak";
import { persistKeyNow } from "./storageBackup";

export type ReminderMoment =
  /** Back at the computer for the first time today, in the morning */
  | "morning"
  /** Back after being away (idle or asleep) for a while */
  | "back"
  /** Just stopped sharing the screen (presentation or meeting share over) */
  | "after_share"
  /** Just left a full-screen app (video call, presentation, focused work) */
  | "after_fullscreen"
  /** The time the learner chose to study at: after lunch / at the end of the work day */
  | "anchor_lunch"
  | "anchor_evening"
  /** A study time learned from when the learner actually studies and accepted by them (see habits.suggestStudyAnchor) */
  | "anchor_custom";

/**
 * Study times the learner picks at onboarding ("after lunch, I review"). Tying a habit to an existing
 * routine works better than a reminder every N minutes. Each anchor fires at most once a day, within
 * ANCHOR_WINDOW_MS of its time.
 */
export type PresetAnchor = "after_lunch" | "end_of_day";
/** A time of the learner's own, stored as "at_HHMM" ("at_2040" = 20:40) */
export type CustomAnchor = `at_${string}`;
export type ReminderAnchor = PresetAnchor | CustomAnchor;
export const ANCHOR_TIMES: Record<PresetAnchor, { hour: number; minute: number; moment: ReminderMoment; label: string }> = {
  after_lunch: { hour: 13, minute: 15, moment: "anchor_lunch", label: "Sau bữa trưa (13:15)" },
  end_of_day: { hour: 17, minute: 30, moment: "anchor_evening", label: "Cuối ngày làm việc (17:30)" },
};
/** Custom study times a learner can keep at once */
export const MAX_CUSTOM_ANCHORS = 2;

const CUSTOM_ANCHOR = /^at_([01]\d|2[0-3])([0-5]\d)$/;

export function customAnchor(hour: number, minute: number): CustomAnchor {
  return `at_${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}`;
}

export function isCustomAnchor(a: string): a is CustomAnchor {
  return CUSTOM_ANCHOR.test(a);
}

/** Clock time, moment and label of an anchor; null for anything that is not an anchor (a corrupted setting) */
export function anchorTime(a: string): { hour: number; minute: number; moment: ReminderMoment; label: string } | null {
  if (a in ANCHOR_TIMES) return ANCHOR_TIMES[a as PresetAnchor];
  const m = CUSTOM_ANCHOR.exec(a);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]), moment: "anchor_custom", label: `Giờ bạn hay học (${m[1]}:${m[2]})` };
}
export const ANCHOR_WINDOW_MS = 90 * 60 * 1000;
const ANCHOR_FIRED_KEY = "myenglish_anchor_fired_v1";

function firedToday(now: Date): ReminderAnchor[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ANCHOR_FIRED_KEY) || "{}");
    return parsed.day === getLocalDateString(now) && Array.isArray(parsed.fired) ? parsed.fired : [];
  } catch {
    return [];
  }
}

/** The chosen anchor whose time has come today and which has not reminded yet, or null */
export function dueAnchor(now: Date, anchors: ReminderAnchor[]): ReminderAnchor | null {
  const done = firedToday(now);
  for (const a of anchors) {
    const t = anchorTime(a);
    if (!t || done.includes(a)) continue;
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t.hour, t.minute).getTime();
    if (now.getTime() >= at && now.getTime() < at + ANCHOR_WINDOW_MS) return a;
  }
  return null;
}

export function markAnchorFired(anchor: ReminderAnchor, now: Date = new Date()): void {
  try {
    const fired = [...new Set([...firedToday(now), anchor])];
    localStorage.setItem(ANCHOR_FIRED_KEY, JSON.stringify({ day: getLocalDateString(now), fired }));
  } catch {}
}

/** Away from the keyboard this long (or the computer slept this long) before "back" counts */
export const AWAY_SECONDS = 5 * 60;
/** ...and active again within this many seconds */
const BACK_ACTIVE_SECONDS = 60;
/** A moment is used within this window, otherwise it has passed (the learner went back to work) */
export const MOMENT_WINDOW_MS = 10 * 60 * 1000;
/** Never remind again sooner than this after the previous reminder, moment or not */
export const MIN_GAP_AFTER_REMINDER_MS = 20 * 60 * 1000;

/**
 * The transition between two readings of the computer's state (null = nothing worth a reminder).
 * `gapMs` = time since the previous reading (a long gap means the computer was asleep).
 * `firstToday` = first reading of the day (defaults to "no previous reading": the app just started).
 * "after_fullscreen" here is the raw transition; FullscreenExitTracker decides whether it counts (N11).
 */
export function detectMoment(
  prev: PopupBlockers | null,
  cur: PopupBlockers | null,
  gapMs: number,
  opts: { hour: number; studiedToday: boolean; firstToday?: boolean }
): ReminderMoment | null {
  if (!cur) return null;
  if (prev?.screen_sharing_app && !cur.screen_sharing_app) return "after_share";
  if (prev?.fullscreen_app && !cur.fullscreen_app && !cur.screen_sharing_app) return "after_fullscreen";
  const activeNow = cur.idle_seconds != null && cur.idle_seconds < BACK_ACTIVE_SECONDS;
  const morning = !opts.studiedToday && opts.hour >= 5 && opts.hour < 11;
  // Launched at login / autostart: nothing to compare with, but the learner has just sat down (N12).
  // Where idle time can't be measured (not macOS), assume they are there.
  const firstToday = opts.firstToday ?? prev === null;
  if (firstToday && morning && (activeNow || cur.idle_seconds == null) && !cur.fullscreen_app && !cur.screen_sharing_app) {
    return "morning";
  }
  const wasAway = (prev?.idle_seconds != null && prev.idle_seconds >= AWAY_SECONDS) || gapMs >= AWAY_SECONDS * 1000;
  if (prev !== null && activeNow && wasAway) {
    return morning ? "morning" : "back";
  }
  return null;
}

/** A full-screen app must have been in front this long before leaving it counts as work done (N11) */
export const FULLSCREEN_MIN_STRETCH_MS = 20 * 60 * 1000;
/** ...and stay out of full screen for this many readings after leaving it (a quick Cmd+Tab is not "done") */
export const FULLSCREEN_EXIT_CONFIRM_READINGS = 2;
/** At most one "after_fullscreen" moment this often */
export const FULLSCREEN_MOMENT_GAP_MS = 60 * 60 * 1000;

/**
 * Tells a finished stretch of full-screen work from a Cmd+Tab out of a full-screen IDE (N11): the app
 * must have been in front for FULLSCREEN_MIN_STRETCH_MS, full screen must not come back within the next
 * FULLSCREEN_EXIT_CONFIRM_READINGS readings, and the moment fires at most once per FULLSCREEN_MOMENT_GAP_MS.
 * A quick return to full screen keeps the same stretch going.
 */
export class FullscreenExitTracker {
  /** Start of the current full-screen stretch (null = not in full screen) */
  private since: number | null = null;
  /** First reading out of full screen, while waiting to see whether it comes back */
  private exitAt: number | null = null;
  private readingsOut = 0;
  private lastReadingAt: number | null = null;
  private lastMomentAt = Number.NEGATIVE_INFINITY;

  /** Feed one reading; true when a long full-screen stretch has just ended for good */
  observe(b: PopupBlockers | null, now: number): boolean {
    if (!b) return false;
    // A long gap between readings (asleep, worker stopped): the stretch is not known to be continuous
    if (this.lastReadingAt !== null && now - this.lastReadingAt > AWAY_SECONDS * 1000) this.reset();
    this.lastReadingAt = now;

    if (b.fullscreen_app) {
      this.exitAt = null;
      this.readingsOut = 0;
      if (this.since === null) this.since = now;
      return false;
    }
    if (this.since === null) return false;
    if (this.exitAt === null) {
      this.exitAt = now;
      return false;
    }
    if (++this.readingsOut < FULLSCREEN_EXIT_CONFIRM_READINGS) return false;

    const stretchMs = this.exitAt - this.since;
    this.since = null;
    this.exitAt = null;
    this.readingsOut = 0;
    // Still sharing the screen: "after_share" will come when the share ends
    if (b.screen_sharing_app || stretchMs < FULLSCREEN_MIN_STRETCH_MS) return false;
    if (now - this.lastMomentAt < FULLSCREEN_MOMENT_GAP_MS) return false;
    this.lastMomentAt = now;
    return true;
  }

  private reset() {
    this.since = null;
    this.exitAt = null;
    this.readingsOut = 0;
  }
}

// ─── Hours to avoid ──────────────────────────────────────────────────────────

const QUIET_KEY = "myenglish_quiet_hours_v1";
const QUIET_MIN_SHOWN = 4;
const QUIET_MAX_RATE = 0.15;
const GOOD_RATE = 0.4;

/**
 * Hours where at least QUIET_MIN_SHOWN reminders were shown and fewer than 15% were acted on.
 * Only when some other hour works (40%+ acted on): otherwise the learner ignores reminders at any hour,
 * and moving them would not help.
 */
export function quietHours(events: LearningEvent[]): number[] {
  const shown = new Array<number>(24).fill(0);
  const acted = new Array<number>(24).fill(0);
  for (const e of events) {
    const h = new Date(e.at).getHours();
    if (e.type === "nudge_shown") shown[h]++;
    if (e.type === "nudge_opened" || e.type === "nudge_quiz") acted[h]++;
  }
  const rate = (h: number) => (shown[h] > 0 ? acted[h] / shown[h] : 0);
  const hasGoodHour = shown.some((n, h) => n >= 3 && rate(h) >= GOOD_RATE);
  if (!hasGoodHour) return [];
  return shown.map((n, h) => (n >= QUIET_MIN_SHOWN && rate(h) < QUIET_MAX_RATE ? h : -1)).filter((h) => h >= 0);
}

/**
 * The hour where reminders get answered most: at least 3 shown and 40%+ acted on, the best rate first (null when
 * no hour qualifies). One reminder a day is kept for it even when the daily cap is used up.
 */
export function bestReminderHour(events: LearningEvent[]): number | null {
  const shown = new Array<number>(24).fill(0);
  const acted = new Array<number>(24).fill(0);
  for (const e of events) {
    const h = new Date(e.at).getHours();
    if (e.type === "nudge_shown") shown[h]++;
    if (e.type === "nudge_opened" || e.type === "nudge_quiz") acted[h]++;
  }
  let best: number | null = null;
  let bestRate = 0;
  for (let h = 0; h < 24; h++) {
    if (shown[h] < 3) continue;
    const rate = acted[h] / shown[h];
    if (rate >= GOOD_RATE && (best === null || rate > bestRate || (rate === bestRate && shown[h] > shown[best]))) {
      best = h;
      bestRate = rate;
    }
  }
  return best;
}

function readQuietRecord(): { day?: string; hours?: number[]; best?: number | null } | null {
  try {
    return JSON.parse(localStorage.getItem(QUIET_KEY) || "null");
  } catch {
    return null;
  }
}

export function getQuietHours(): number[] {
  const raw = readQuietRecord();
  return Array.isArray(raw?.hours) ? raw!.hours : [];
}

export function getBestReminderHour(): number | null {
  const best = readQuietRecord()?.best;
  return typeof best === "number" && best >= 0 && best < 24 ? best : null;
}

const BEST_HOUR_USED_KEY = "myenglish_best_hour_nudge_v1";
const QUIET_PROBE_USED_KEY = "myenglish_quiet_probe_v1";

function usedToday(key: string, now: Date): boolean {
  try {
    return JSON.parse(localStorage.getItem(key) || "null")?.day === getLocalDateString(now);
  } catch {
    return false;
  }
}

function markUsedToday(key: string, now: Date): void {
  try {
    localStorage.setItem(key, JSON.stringify({ day: getLocalDateString(now) }));
  } catch {}
}

/** The day's reminder at the best hour may go past the daily cap, once a day */
export function bestHourGuaranteeOpen(now: Date): boolean {
  const best = getBestReminderHour();
  return best !== null && now.getHours() === best && !usedToday(BEST_HOUR_USED_KEY, now);
}
export function markBestHourGuarantee(now: Date = new Date()): void {
  markUsedToday(BEST_HOUR_USED_KEY, now);
}

/** Every Nth day a reminder may come in an hour that was learned as "always ignored" */
export const QUIET_PROBE_EVERY_DAYS = 5;

function dayNumber(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/**
 * A skipped hour is learned from reminders that were ignored there, and no reminder is shown there afterwards:
 * the learner's habits can change (a new schedule) with nothing left to show it. So every few days one
 * clock reminder is let through in such an hour. If it is answered, the hour leaves the list at the next refresh.
 */
export function quietHourProbeOpen(now: Date): boolean {
  return dayNumber(now) % QUIET_PROBE_EVERY_DAYS === 0 && !usedToday(QUIET_PROBE_USED_KEY, now);
}
export function markQuietHourProbe(now: Date = new Date()): void {
  markUsedToday(QUIET_PROBE_USED_KEY, now);
}

/** Recompute the hours to avoid from the last 30 days, at most once a day */
export async function refreshQuietHours(now: Date = new Date()): Promise<number[]> {
  const today = getLocalDateString(now);
  try {
    const raw = readQuietRecord();
    if (raw?.day === today && Array.isArray(raw.hours)) return raw.hours;
  } catch {}
  const events = await getLearningEventsSince(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), [
    "nudge_shown",
    "nudge_opened",
    "nudge_quiz",
  ]);
  const hours = quietHours(events);
  try {
    localStorage.setItem(QUIET_KEY, JSON.stringify({ day: today, hours, best: bestReminderHour(events) }));
    persistKeyNow(QUIET_KEY);
  } catch {}
  return hours;
}
