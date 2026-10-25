import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

export type ReminderInterval = 0 | 15 | 30 | 45 | 60 | 120; // 0 = disabled, others in minutes
export type ReminderTrigger = "due_only" | "due_then_random" | "all_words";
export type QuizMode = "multiple_choice" | "typing" | "flashcard";
export type SnoozeDuration = 5 | 10 | 15 | 30; // in minutes
export type BlurOverlayLevel = "light" | "medium" | "heavy";

export type WordsPerSession = 3 | 5 | 10;
export type GrammarLevel = "A1" | "A2" | "B1" | "B2" | "C1";

export interface ReminderSettings {
  enabled: boolean;
  intervalMinutes: ReminderInterval;
  snoozeMinutes: SnoozeDuration;
  triggerCondition: ReminderTrigger;
  quizMode?: QuizMode;
  wordsPerSession: number;
  blurOverlay: BlurOverlayLevel;
  autoPlayAudio: boolean; // strictly false by user requirement
  snoozedUntil: number | null; // timestamp ms
  includeGrammar: boolean; // whether to review grammar in popup alongside vocabulary
  grammarLevels?: GrammarLevel[]; // deprecated: popup uses selected book lessons
  respectFocus: boolean; // postpone the popup while full screen, sharing the screen, in Focus mode or idle
  preferPrimaryMonitor: boolean; // show the reminder on the primary monitor instead of the one under the cursor
  // Learns from the learner's day: also remind at natural transitions (back at the computer, screen share / full
  // screen over), and skip clock-based reminders in hours where they are almost always ignored
  smartReminders: boolean;
  escalateMissed: boolean; // cards missed twice in a row (never pointed at) come again as a system notification
  stopAfterGoal: boolean; // no more reminders today once the daily goal is reached
  nightQuiet: boolean; // no reminders from NIGHT_QUIET_START to NIGHT_QUIET_END
  maxNudgesPerDay: number; // at most this many reminders a day (0 = no limit)
  anchors: ReminderAnchor[]; // study times chosen by the learner ("after lunch"), see reminderMoments
  nudgeSound?: boolean; // subtle two-note chime when the corner reminder card appears
}

/** Storage key of the reminder settings (shared by the windows: a write in one fires `storage` in the others) */
export const REMINDER_SETTINGS_STORAGE_KEY = "myenglish_reminder_settings_v1";
const SETTINGS_STORAGE_KEY = REMINDER_SETTINGS_STORAGE_KEY;

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  intervalMinutes: 30, // Default 30 minutes
  snoozeMinutes: 10,   // Default 10 minutes snooze
  triggerCondition: "due_only", // Default only when words are due
  quizMode: "multiple_choice",  // Legacy fallback
  wordsPerSession: 3,  // Default 3 items per popup
  blurOverlay: "medium", // Backdrop blur
  autoPlayAudio: false, // DO NOT play audio when displayed
  snoozedUntil: null,
  includeGrammar: true,
  respectFocus: true,
  preferPrimaryMonitor: false,
  smartReminders: true,
  escalateMissed: true,
  stopAfterGoal: true,
  nightQuiet: true,
  maxNudgesPerDay: 8,
  anchors: [],
  nudgeSound: true,
};

/** Night hours without reminders (local time): from 22:00 to 07:00 */
export const NIGHT_QUIET_START = 22;
export const NIGHT_QUIET_END = 7;

export type ReminderPause = "night" | "goal_reached" | "daily_cap";

/**
 * Why a clock reminder should not be shown now, or null. A habit app that keeps asking after the day's
 * work is done, late at night or all day long teaches people to ignore it (or to quit).
 */
export function reminderPause(
  settings: Pick<ReminderSettings, "stopAfterGoal" | "nightQuiet" | "maxNudgesPerDay">,
  ctx: { hour: number; goalReached: boolean; shownToday: number }
): ReminderPause | null {
  if (settings.nightQuiet && (ctx.hour >= NIGHT_QUIET_START || ctx.hour < NIGHT_QUIET_END)) return "night";
  if (settings.stopAfterGoal && ctx.goalReached) return "goal_reached";
  if (settings.maxNudgesPerDay > 0 && ctx.shownToday >= settings.maxNudgesPerDay) return "daily_cap";
  return null;
}

const NUDGES_TODAY_KEY = "myenglish_nudges_today_v1";

function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Reminders shown today (counted when the corner card is shown) */
export function getNudgesShownToday(now: Date = new Date()): number {
  try {
    const parsed = JSON.parse(localStorage.getItem(NUDGES_TODAY_KEY) || "{}");
    return parsed.day === localDay(now) && Number.isFinite(parsed.count) ? parsed.count : 0;
  } catch {
    return 0;
  }
}

function countNudgeShown(now: Date = new Date()): void {
  try {
    localStorage.setItem(NUDGES_TODAY_KEY, JSON.stringify({ day: localDay(now), count: getNudgesShownToday(now) + 1 }));
  } catch {}
}

/** Corner cards missed in a row before the next reminder comes as a system notification */
export const MISSED_BEFORE_ESCALATION = 2;
/** System notifications a day sent for missed cards (they also count in the daily cap) */
export const MAX_ESCALATIONS_PER_DAY = 2;

const ESCALATIONS_TODAY_KEY = "myenglish_escalations_today_v1";

export function getEscalationsToday(now: Date = new Date()): number {
  try {
    const parsed = JSON.parse(localStorage.getItem(ESCALATIONS_TODAY_KEY) || "{}");
    return parsed.day === localDay(now) && Number.isFinite(parsed.count) ? parsed.count : 0;
  } catch {
    return 0;
  }
}

/**
 * Whether the next reminder should be a system notification instead of the corner card. The card closes by
 * itself after a few seconds, so a learner who was not looking never sees it; a notification stays in the
 * Notification Center until they do. Only after the card was missed twice in a row, at most twice a day.
 * The pauses (night, goal, daily cap, snooze, focus) are checked before this, as for the card.
 */
export function shouldEscalate(
  settings: Pick<ReminderSettings, "escalateMissed">,
  ctx: { missedStreak: number; escalationsToday: number }
): boolean {
  return settings.escalateMissed && ctx.missedStreak >= MISSED_BEFORE_ESCALATION && ctx.escalationsToday < MAX_ESCALATIONS_PER_DAY;
}

/** A missed card was replaced by a system notification: counts as a reminder shown today and restarts the interval */
export function recordEscalation(now: Date = new Date()): void {
  try {
    localStorage.setItem(ESCALATIONS_TODAY_KEY, JSON.stringify({ day: localDay(now), count: getEscalationsToday(now) + 1 }));
  } catch {}
  countNudgeShown(now);
  recordPopupDisplayed(now.getTime());
}

/** Seconds the corner reminder waits before opening the review by itself */
export const NUDGE_AUTO_OPEN_SECONDS = 20;
/** Rough time per popup question, used for the "~N phút" estimate */
const SECONDS_PER_QUESTION = 20;

import type { DuoMotivationState, MicroQuizQuestion } from "./duoMotivation";
import { anchorTime, type ReminderAnchor, type ReminderMoment } from "./reminderMoments";
import {
  getConsecutiveSkipCount,
  incrementConsecutiveSkipCount,
  incrementMissedNudgeStreak,
  resetConsecutiveSkipCount,
} from "./duoMotivation";

export interface ReviewNudgePayload {
  dueCount: number;
  sessionSize: number;
  estimatedMinutes: number;
  autoOpenSeconds: number;
  snoozeMinutes: number;
  consecutiveSkips?: number;
  motivation?: DuoMotivationState;
  microQuiz?: MicroQuizQuestion | null;
  /** Up to 3 distinct questions so the learner can chain 1–3 quick answers directly on the nudge card */
  microQuizQueue?: MicroQuizQuestion[];
  /** Shown at a natural transition (see reminderMoments.ts) rather than by the clock */
  moment?: ReminderMoment | null;
  /** Learner's progress today, for the Goal Gradient chip on the reminder card */
  todayCount?: number;
  dailyGoal?: number;
  streak?: number;
  /** Due studied words whose recall probability fell below FADING_RETRIEVABILITY */
  fadingCount?: number;
  /** Highest-stability fading word to highlight on the card */
  fadingWord?: string | null;
  fadingStabilityDays?: number | null;
  /** Whether to play a subtle chime when the reminder card appears */
  nudgeSound?: boolean;
}

export function buildNudgePayload(
  dueCount: number,
  settings: ReminderSettings = getReminderSettings(),
  extra?: Partial<ReviewNudgePayload>
): ReviewNudgePayload {
  const sessionSize = Math.max(3, settings.wordsPerSession || 3);
  return {
    dueCount,
    sessionSize,
    estimatedMinutes: Math.max(1, Math.ceil((sessionSize * SECONDS_PER_QUESTION) / 60)),
    autoOpenSeconds: NUDGE_AUTO_OPEN_SECONDS,
    snoozeMinutes: settings.snoozeMinutes ?? 10,
    consecutiveSkips: getConsecutiveSkipCount(),
    nudgeSound: settings.nudgeSound !== false,
    ...extra,
  };
}

/**
 * Get current reminder configuration from localStorage
 */
export function getReminderSettings(): ReminderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_REMINDER_SETTINGS };
    const parsed = JSON.parse(raw);
    const wordsPerSession =
      typeof parsed.wordsPerSession === "number" && [3, 5, 10].includes(parsed.wordsPerSession)
        ? parsed.wordsPerSession
        : 3;
    const includeGrammar = true; // Automatically interleave grammar questions when available
    const triggerCondition: ReminderTrigger =
      parsed.triggerCondition === "due_then_random" || parsed.triggerCondition === "all_words"
        ? parsed.triggerCondition
        : "due_only";

    // Settings saved before the two switches became one: it stays on unless the learner had turned one off
    const { contextMoments, avoidQuietHours, ...rest } = parsed;
    const smartReminders =
      typeof rest.smartReminders === "boolean" ? rest.smartReminders : contextMoments !== false && avoidQuietHours !== false;

    return {
      ...DEFAULT_REMINDER_SETTINGS,
      ...rest,
      smartReminders,
      triggerCondition,
      wordsPerSession,
      includeGrammar,
      autoPlayAudio: false, // enforce no sound on display
    };
  } catch {
    return { ...DEFAULT_REMINDER_SETTINGS };
  }
}

/**
 * Save updated reminder configuration to localStorage and dispatch event
 */
export function saveReminderSettings(settings: Partial<ReminderSettings>): ReminderSettings {
  try {
    const current = getReminderSettings();
    const updated: ReminderSettings = {
      ...current,
      ...settings,
      autoPlayAudio: false, // enforce no sound on display
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("myenglish-reminder-settings-updated", { detail: updated }));
    return updated;
  } catch (err) {
    console.warn("Failed to save reminder settings:", err);
    return { ...DEFAULT_REMINDER_SETTINGS, ...settings, autoPlayAudio: false };
  }
}

/**
 * Snooze reminders for specified minutes (or setting default)
 */
export function snoozeReminder(customMinutes?: number): number {
  const settings = getReminderSettings();
  const minutes = customMinutes ?? settings.snoozeMinutes ?? 10;
  const snoozedUntil = Date.now() + minutes * 60 * 1000;
  saveReminderSettings({ snoozedUntil });
  // A deliberate snooze is the learner's choice, not a "skip": it never escalates the reminder tone
  return minutes;
}

export interface ReminderTimeOption {
  label: string;
  /** Timestamp (ms) the next reminder is asked for */
  at: number;
}

/** Shortest wait offered on the card (a nearer time is what "Hoãn" is for) */
const MIN_OPTION_MS = 30 * 60 * 1000;
const MAX_TIME_OPTIONS = 4;
/** Times of day offered when the learner has no study time of their own left today */
const FALLBACK_SLOTS: Array<[number, number]> = [
  [13, 15],
  [17, 30],
  [20, 0],
];

const clock = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * "Nhắc lúc…" on the reminder card: a few times the learner can pick without typing (the card never takes
 * keyboard focus): in 1 or 2 hours, their own study times (or lunch / end of day / evening) still to come today,
 * and tomorrow morning when little is left of the day. Never at night: those would be pushed to 07:00 anyway.
 */
export function reminderTimeOptions(now: Date, anchors: string[] = []): ReminderTimeOption[] {
  const t = now.getTime();
  const isNight = (d: Date) => d.getHours() >= NIGHT_QUIET_START || d.getHours() < NIGHT_QUIET_END;
  const out: ReminderTimeOption[] = [];
  const add = (label: string, at: number) => {
    const d = new Date(at);
    if (at - t < MIN_OPTION_MS || isNight(d)) return;
    if (out.some((o) => Math.abs(o.at - at) < 15 * 60 * 1000)) return;
    out.push({ label, at });
  };
  add("1 giờ nữa", t + 60 * 60 * 1000);
  add("2 giờ nữa", t + 2 * 60 * 60 * 1000);

  const today = (h: number, m: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime();
  const own = anchors
    .map(anchorTime)
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .map((a) => today(a.hour, a.minute));
  const slots = (own.length > 0 ? own : FALLBACK_SLOTS.map(([h, m]) => today(h, m))).sort((a, b) => a - b);
  for (const at of slots) add(clock(new Date(at)), at);

  if (out.length < MAX_TIME_OPTIONS) {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, NIGHT_QUIET_END, 30).getTime();
    out.push({ label: `Sáng mai ${clock(new Date(tomorrow))}`, at: tomorrow });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_TIME_OPTIONS);
}

/** The reminder comes back at `at`, picked on the card: a deliberate choice, so it never counts as ignored. Returns the minutes. */
export function remindAt(at: number, now: number = Date.now()): number {
  return snoozeReminder(Math.max(1, Math.ceil((at - now) / (60 * 1000))));
}

const IGNORED_NUDGES_KEY = "myenglish_ignored_nudges_v1";

/**
 * Reminders in a row that the learner saw and let time out (reset as soon as the user responds). Counted per
 * day: yesterday's ignored cards must not slow down the first reminder of today.
 */
export function getIgnoredNudgeCount(now: Date = new Date()): number {
  try {
    const parsed = JSON.parse(localStorage.getItem(IGNORED_NUDGES_KEY) || "null");
    return parsed?.day === localDay(now) && Number.isFinite(parsed.count) && parsed.count > 0 ? parsed.count : 0;
  } catch {
    return 0;
  }
}

export function resetIgnoredNudges(): void {
  try {
    localStorage.removeItem(IGNORED_NUDGES_KEY);
    resetConsecutiveSkipCount();
  } catch {}
}

/**
 * Snooze length after `ignoredBefore` reminders were already ignored in a row. The base is the normal
 * reminder interval (the snooze length when reminders are off) and it doubles with each ignored reminder
 * (base -> 2x -> 4x -> 8x), so a busy user is spaced out rather than nagged. The wait never exceeds
 * 4 hours, unless the base itself is longer.
 */
export function ignoredNudgeSnoozeMinutes(ignoredBefore: number, snoozeMinutes: number, intervalMinutes: number): number {
  const base = Math.max(snoozeMinutes, intervalMinutes || snoozeMinutes);
  return Math.min(base * 2 ** Math.min(ignoredBefore, 3), Math.max(base, 240));
}

/**
 * The reminder timed out unanswered: snooze it. Returns the minutes snoozed.
 * `seen`: the learner pointed at the card before it closed, so it was ignored and the wait grows (backoff).
 * A card nobody pointed at was most likely not seen (meeting, other screen): the wait stays the normal one and
 * the miss only counts towards a system notification (shouldEscalate).
 */
export function snoozeIgnoredNudge(seen: boolean = true): number {
  const settings = getReminderSettings();
  const ignored = getIgnoredNudgeCount();
  const minutes = ignoredNudgeSnoozeMinutes(seen ? ignored : 0, settings.snoozeMinutes ?? 10, settings.intervalMinutes);
  // A longer pause picked from the tray while the card was up stays: the card was not ignored (N9)
  const pausedMs = (settings.snoozedUntil ?? 0) - Date.now();
  if (settings.snoozedUntil === getTrayPauseEnd() && pausedMs > minutes * 60 * 1000) {
    return Math.ceil(pausedMs / (60 * 1000));
  }
  if (seen) {
    try {
      localStorage.setItem(IGNORED_NUDGES_KEY, JSON.stringify({ day: localDay(), count: ignored + 1 }));
    } catch {}
    // Timed out without any answer (unlike a deliberate snooze): offer the 1-question quiz next time
    incrementConsecutiveSkipCount();
  } else {
    incrementMissedNudgeStreak();
  }
  return snoozeReminder(minutes);
}

/**
 * Cancel active snooze
 */
export function cancelSnooze(): void {
  saveReminderSettings({ snoozedUntil: null });
}

/** End of the last pause picked from the tray: a timed-out card must not shorten it */
const TRAY_PAUSE_KEY = "myenglish_tray_pause_until_v1";

function getTrayPauseEnd(): number | null {
  try {
    const n = parseInt(localStorage.getItem(TRAY_PAUSE_KEY) || "", 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function markTrayPause(until: number | null): void {
  try {
    localStorage.setItem(TRAY_PAUSE_KEY, String(until));
  } catch {}
}

/**
 * Pause reminders until tomorrow morning, when the night quiet hours end (tray menu, N9).
 * Before 04:00 the night is still going on, so "tomorrow" is this morning. Returns the end timestamp.
 */
export function snoozeUntilTomorrow(now: Date = new Date()): number {
  const dayOffset = now.getHours() < 4 ? 0 : 1;
  const until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, NIGHT_QUIET_END, 0).getTime();
  saveReminderSettings({ snoozedUntil: until });
  markTrayPause(until);
  return until;
}

/** Turn reminders back on after a pause or snooze (tray menu, N9) */
export function resumeReminders(): void {
  saveReminderSettings({ snoozedUntil: null });
}

/** Reminder actions of the tray menu, sent by Rust as the `tray-reminder-action` event */
export const TRAY_REMINDER_EVENT = "tray-reminder-action";
export type TrayReminderAction = "pause_1h" | "pause_tomorrow" | "resume";

/** Apply a reminder action picked from the tray menu. False for an unknown action. */
export function applyTrayReminderAction(action: unknown, now: Date = new Date()): boolean {
  if (action === "pause_1h") {
    snoozeReminder(60);
    markTrayPause(getReminderSettings().snoozedUntil);
  } else if (action === "pause_tomorrow") {
    snoozeUntilTomorrow(now);
  } else if (action === "resume") {
    resumeReminders();
  } else {
    return false;
  }
  return true;
}

/** "HH:MM" when the active pause ends, for the tray tooltip; null while reminders are not paused */
export function snoozedUntilLabel(now: number = Date.now()): string | null {
  const { snoozedUntil } = getReminderSettings();
  if (!snoozedUntil || snoozedUntil <= now) return null;
  const d = new Date(snoozedUntil);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** When an active pause ends, for the header: "14:35", "07:00 mai", or "20/10 07:00" further away */
export function snoozeEndText(until: number, now: number = Date.now()): string {
  const d = new Date(until);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const today = new Date(now);
  const dayDiff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      86_400_000
  );
  if (dayDiff <= 0) return time;
  if (dayDiff === 1) return `${time} mai`;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${time}`;
}

/**
 * Check if reminder is currently snoozed
 */
export function isSnoozed(): boolean {
  const settings = getReminderSettings();
  if (!settings.snoozedUntil) return false;
  // Expired snooze is kept until the popup is shown, so the next popup fires at snooze end
  return Date.now() < settings.snoozedUntil;
}

/**
 * Get remaining snooze minutes (0 if not snoozed)
 */
export function getSnoozeRemainingMinutes(): number {
  const settings = getReminderSettings();
  if (!settings.snoozedUntil) return 0;
  const remainingMs = settings.snoozedUntil - Date.now();
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / (60 * 1000));
}

/**
 * Key for recording the exact timestamp (ms) when the popup was last displayed.
 * Note: Next reminder time MUST be strictly calculated starting from this timestamp.
 */
export const LAST_POPUP_DISPLAY_KEY = "myenglish_srs_last_trigger_ms";

/** A stored reminder time further than this in the future means the clock went back (N18) */
export const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;

/**
 * Get timestamp (ms) when the Focus Review Pop-up was last displayed
 */
export function getLastPopupDisplayTime(): number {
  try {
    const raw = localStorage.getItem(LAST_POPUP_DISPLAY_KEY);
    if (!raw) return 0;
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) return 0;
    // The system clock was set back: a display time in the future would hold every reminder until
    // the clock catches up (N18). Clamp it to now and keep the fix.
    const now = Date.now();
    if (parsed > now + CLOCK_SKEW_TOLERANCE_MS) {
      localStorage.setItem(LAST_POPUP_DISPLAY_KEY, now.toString());
      return now;
    }
    return parsed;
  } catch {
    return 0;
  }
}

/**
 * Record that the popup was displayed at timestamp (default: Date.now())
 * Dispatches events to synchronize all components and windows.
 */
export function recordPopupDisplayed(timestamp: number = Date.now()): void {
  try {
    localStorage.setItem(LAST_POPUP_DISPLAY_KEY, timestamp.toString());
    // The popup consumed an expired snooze: clear it so normal interval scheduling resumes
    const { snoozedUntil } = getReminderSettings();
    if (snoozedUntil && snoozedUntil <= timestamp) {
      saveReminderSettings({ snoozedUntil: null });
    }
    window.dispatchEvent(
      new CustomEvent("myenglish-popup-displayed", { detail: { timestamp } })
    );
  } catch (err) {
    console.warn("Failed to record popup display time:", err);
  }
}

/**
 * Calculate timestamp (ms) when the popup should next be displayed.
 * STRICT REQUIREMENT: Calculated starting from the last time the popup was displayed!
 */
export function getNextReminderTime(): number {
  const settings = getReminderSettings();
  if (!settings.enabled || settings.intervalMinutes === 0) {
    return 0;
  }

  const intervalMs = settings.intervalMinutes * 60 * 1000;
  const lastDisplay = getLastPopupDisplayTime();

  // 1. NẾU ĐANG BỊ HOÃN (SNOOZED): Thời điểm hiển thị kế tiếp CHÍNH XÁC là khi hết thời gian hoãn!
  // Still applies after the snooze expired, until the popup is actually shown again.
  if (settings.snoozedUntil && settings.snoozedUntil > lastDisplay) {
    return settings.snoozedUntil;
  }

  // 2. NẾU KHÔNG HOÃN: Thời gian hiển thị kế tiếp = lần cuối cùng popup hiển thị + chu kỳ cài đặt

  // If popup has never been displayed yet, next time is calculated from now
  const baseTime = lastDisplay > 0 ? lastDisplay : Date.now();
  return baseTime + intervalMs;
}

/**
 * Get remaining seconds until next scheduled review popup (0 if overdue or disabled)
 */
export function getRemainingSecondsToNextReminder(): number {
  const nextTime = getNextReminderTime();
  if (nextTime === 0) return 0;
  const remainingMs = nextTime - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

/**
 * Trigger the native desktop Focus Review Pop-up window
 */
export async function triggerReviewPopup(): Promise<boolean> {
  // Record that the popup is being displayed right now
  recordPopupDisplayed(Date.now());
  try {
    await invoke("show_review_popup", { preferPrimary: getReminderSettings().preferPrimaryMonitor });
    return true;
  } catch (err) {
    console.warn("invoke show_review_popup failed (fallback to in-app event):", err);
    window.dispatchEvent(new CustomEvent("open-review-popup-preview"));
    return false;
  }
}

/**
 * Show the small corner reminder (no focus stealing). Falls back to the full popup if the
 * reminder window is unavailable.
 */
export async function triggerReviewNudge(
  dueCount: number,
  extraPayload?: Partial<ReviewNudgePayload>
): Promise<boolean> {
  recordPopupDisplayed(Date.now());
  const settings = getReminderSettings();
  try {
    // false = not shown (the review popup is already open)
    const payload = buildNudgePayload(dueCount, settings, extraPayload);
    const shown = await invoke<boolean>("show_review_nudge", {
      payload,
      preferPrimary: settings.preferPrimaryMonitor,
    });
    // Count only a reminder that actually appeared (N4)
    if (shown) countNudgeShown();
    return shown;
  } catch (err) {
    console.warn("invoke show_review_nudge failed, opening the review directly:", err);
    return triggerReviewPopup();
  }
}

/** Event to the main window: start a focus session of `minutes` */
export const START_FOCUS_EVENT = "start-focus-session";

/** From a reminder: bring the main window forward and start a focus session there */
export async function startFocusFromReminder(minutes: number): Promise<void> {
  try {
    await invoke("show_main_window");
  } catch (err) {
    console.warn("invoke show_main_window failed:", err);
  }
  try {
    await emit(START_FOCUS_EVENT, { minutes });
  } catch (err) {
    console.warn("start focus event not sent:", err);
  }
}

export async function hideReviewNudge(): Promise<void> {
  try {
    await invoke("hide_review_nudge");
  } catch (err) {
    console.warn("invoke hide_review_nudge failed:", err);
  }
}

/**
 * Hide the native desktop Focus Review Pop-up window
 */
export async function hideReviewPopup(): Promise<void> {
  try {
    await invoke("hide_review_popup");
  } catch (err) {
    console.warn("invoke hide_review_popup failed:", err);
    window.dispatchEvent(new CustomEvent("close-review-popup-preview"));
  }
}
