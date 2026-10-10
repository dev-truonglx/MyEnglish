import { invoke } from "@tauri-apps/api/core";

export type ReminderInterval = 0 | 15 | 30 | 45 | 60 | 120; // 0 = disabled, others in minutes
export type ReminderTrigger = "due_only" | "all_words";
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
  grammarLevels: GrammarLevel[]; // selected grammar levels (multi-select)
  respectFocus: boolean; // postpone the popup while full screen, sharing the screen, in Focus mode or idle
  preferPrimaryMonitor: boolean; // show the reminder on the primary monitor instead of the one under the cursor
  contextMoments: boolean; // also remind at natural transitions: back at the computer, screen share / full screen over
  avoidQuietHours: boolean; // skip clock-based reminders in hours where they are almost always ignored
  stopAfterGoal: boolean; // no more reminders today once the daily goal is reached
  nightQuiet: boolean; // no reminders from NIGHT_QUIET_START to NIGHT_QUIET_END
  maxNudgesPerDay: number; // at most this many reminders a day (0 = no limit)
  anchors: ReminderAnchor[]; // study times chosen by the learner ("after lunch"), see reminderMoments
}

const SETTINGS_STORAGE_KEY = "myenglish_reminder_settings_v1";

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
  grammarLevels: ["A1", "A2", "B1"],
  respectFocus: true,
  preferPrimaryMonitor: false,
  contextMoments: true,
  avoidQuietHours: true,
  stopAfterGoal: true,
  nightQuiet: true,
  maxNudgesPerDay: 8,
  anchors: [],
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

/** Seconds the corner reminder waits before opening the review by itself */
export const NUDGE_AUTO_OPEN_SECONDS = 20;
/** Rough time per popup question, used for the "~N phút" estimate */
const SECONDS_PER_QUESTION = 20;

import type { DuoMotivationState, MicroQuizQuestion } from "./duoMotivation";
import type { ReminderAnchor, ReminderMoment } from "./reminderMoments";
import {
  getConsecutiveSkipCount,
  incrementConsecutiveSkipCount,
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
  /** Shown at a natural transition (see reminderMoments.ts) rather than by the clock */
  moment?: ReminderMoment | null;
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
    const grammarLevels: GrammarLevel[] =
      Array.isArray(parsed.grammarLevels) && parsed.grammarLevels.length > 0
        ? parsed.grammarLevels
        : ["A1", "A2", "B1"];
    const includeGrammar = parsed.includeGrammar !== undefined ? Boolean(parsed.includeGrammar) : true;

    return {
      ...DEFAULT_REMINDER_SETTINGS,
      ...parsed,
      wordsPerSession,
      includeGrammar,
      grammarLevels,
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

const IGNORED_NUDGES_KEY = "myenglish_ignored_nudges_v1";

/** Reminders in a row that timed out without an answer (reset as soon as the user responds) */
export function getIgnoredNudgeCount(): number {
  try {
    const n = parseInt(localStorage.getItem(IGNORED_NUDGES_KEY) || "0", 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
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
 * Snooze length after `ignoredBefore` reminders were already ignored in a row: doubles each time
 * (10 -> 20 -> 40 min) so a busy user is not nagged every few minutes, but never longer than the
 * normal reminder interval.
 */
export function ignoredNudgeSnoozeMinutes(ignoredBefore: number, snoozeMinutes: number, intervalMinutes: number): number {
  const cap = Math.max(snoozeMinutes, intervalMinutes || snoozeMinutes);
  return Math.min(cap, snoozeMinutes * 2 ** Math.min(ignoredBefore, 10));
}

/** The reminder timed out unanswered: snooze it with backoff. Returns the minutes snoozed. */
export function snoozeIgnoredNudge(): number {
  const settings = getReminderSettings();
  const ignored = getIgnoredNudgeCount();
  const minutes = ignoredNudgeSnoozeMinutes(ignored, settings.snoozeMinutes ?? 10, settings.intervalMinutes);
  try {
    localStorage.setItem(IGNORED_NUDGES_KEY, String(ignored + 1));
  } catch {}
  // Timed out without any answer (unlike a deliberate snooze): offer the 1-question quiz next time
  incrementConsecutiveSkipCount();
  return snoozeReminder(minutes);
}

/**
 * Cancel active snooze
 */
export function cancelSnooze(): void {
  saveReminderSettings({ snoozedUntil: null });
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

/**
 * Get timestamp (ms) when the Focus Review Pop-up was last displayed
 */
export function getLastPopupDisplayTime(): number {
  try {
    const raw = localStorage.getItem(LAST_POPUP_DISPLAY_KEY);
    if (!raw) return 0;
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? 0 : parsed;
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
  countNudgeShown();
  const settings = getReminderSettings();
  try {
    // false = not shown (the review popup is already open)
    const payload = buildNudgePayload(dueCount, settings, extraPayload);
    return await invoke<boolean>("show_review_nudge", {
      payload,
      preferPrimary: settings.preferPrimaryMonitor,
    });
  } catch (err) {
    console.warn("invoke show_review_nudge failed, opening the review directly:", err);
    return triggerReviewPopup();
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
