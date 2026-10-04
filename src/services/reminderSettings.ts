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
};

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
  return minutes;
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
    await invoke("show_review_popup");
    return true;
  } catch (err) {
    console.warn("invoke show_review_popup failed (fallback to in-app event):", err);
    window.dispatchEvent(new CustomEvent("open-review-popup-preview"));
    return false;
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
