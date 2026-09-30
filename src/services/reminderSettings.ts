import { invoke } from "@tauri-apps/api/core";

export type ReminderInterval = 0 | 15 | 30 | 45 | 60 | 120; // 0 = disabled, others in minutes
export type ReminderTrigger = "due_only" | "all_words";
export type QuizMode = "multiple_choice" | "typing" | "flashcard";
export type SnoozeDuration = 5 | 10 | 15 | 30; // in minutes
export type BlurOverlayLevel = "light" | "medium" | "heavy";

export type WordsPerSession = 3 | 5 | 10;

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
}

const SETTINGS_STORAGE_KEY = "myenglish_reminder_settings_v1";

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  intervalMinutes: 30, // Default 30 minutes
  snoozeMinutes: 10,   // Default 10 minutes snooze
  triggerCondition: "due_only", // Default only when words are due
  quizMode: "multiple_choice",  // Legacy fallback
  wordsPerSession: 3,  // Default 3 words per popup
  blurOverlay: "medium", // Backdrop blur
  autoPlayAudio: false, // DO NOT play audio when displayed
  snoozedUntil: null,
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
    return {
      ...DEFAULT_REMINDER_SETTINGS,
      ...parsed,
      wordsPerSession,
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
  if (Date.now() < settings.snoozedUntil) {
    return true;
  }
  // Auto-clear expired snooze
  saveReminderSettings({ snoozedUntil: null });
  return false;
}

/**
 * Get remaining snooze minutes (0 if not snoozed)
 */
export function getSnoozeRemainingMinutes(): number {
  const settings = getReminderSettings();
  if (!settings.snoozedUntil) return 0;
  const remainingMs = settings.snoozedUntil - Date.now();
  if (remainingMs <= 0) {
    saveReminderSettings({ snoozedUntil: null });
    return 0;
  }
  return Math.ceil(remainingMs / (60 * 1000));
}

/**
 * Trigger the native desktop Focus Review Pop-up window
 */
export async function triggerReviewPopup(): Promise<boolean> {
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
