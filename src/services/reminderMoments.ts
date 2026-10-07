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
  | "after_fullscreen";

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
 */
export function detectMoment(
  prev: PopupBlockers | null,
  cur: PopupBlockers | null,
  gapMs: number,
  opts: { hour: number; studiedToday: boolean }
): ReminderMoment | null {
  if (!cur) return null;
  if (prev?.screen_sharing_app && !cur.screen_sharing_app) return "after_share";
  if (prev?.fullscreen_app && !cur.fullscreen_app && !cur.screen_sharing_app) return "after_fullscreen";
  const activeNow = cur.idle_seconds != null && cur.idle_seconds < BACK_ACTIVE_SECONDS;
  const wasAway = (prev?.idle_seconds != null && prev.idle_seconds >= AWAY_SECONDS) || gapMs >= AWAY_SECONDS * 1000;
  if (prev !== null && activeNow && wasAway) {
    return !opts.studiedToday && opts.hour >= 5 && opts.hour < 11 ? "morning" : "back";
  }
  return null;
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

export function getQuietHours(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(QUIET_KEY) || "null") as { hours?: number[] } | null;
    return Array.isArray(raw?.hours) ? raw!.hours : [];
  } catch {
    return [];
  }
}

/** Recompute the hours to avoid from the last 30 days, at most once a day */
export async function refreshQuietHours(now: Date = new Date()): Promise<number[]> {
  const today = getLocalDateString(now);
  try {
    const raw = JSON.parse(localStorage.getItem(QUIET_KEY) || "null") as { day?: string; hours?: number[] } | null;
    if (raw?.day === today && Array.isArray(raw.hours)) return raw.hours;
  } catch {}
  const events = await getLearningEventsSince(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), [
    "nudge_shown",
    "nudge_opened",
    "nudge_quiz",
  ]);
  const hours = quietHours(events);
  try {
    localStorage.setItem(QUIET_KEY, JSON.stringify({ day: today, hours }));
    persistKeyNow(QUIET_KEY);
  } catch {}
  return hours;
}
