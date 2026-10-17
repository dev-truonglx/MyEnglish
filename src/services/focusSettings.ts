/**
 * Focus session length and clock display, kept apart from focusSession.ts (which pulls in the XP and event
 * services) so the reminder windows can read them cheaply.
 */
export const FOCUS_DURATIONS = [5, 10, 15, 25] as const;
export const DEFAULT_FOCUS_MINUTES = 10;

const SETTINGS_KEY = "myenglish_focus_settings_v1";
/** Fired when the length or the clock setting changes (the buttons showing the length follow it) */
export const FOCUS_SETTINGS_EVENT = "myenglish-focus-settings-changed";

export interface FocusSettings {
  minutes: number;
  hideClock: boolean;
}

export function getFocusSettings(): FocusSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    const minutes = (FOCUS_DURATIONS as readonly number[]).includes(raw?.minutes) ? raw.minutes : DEFAULT_FOCUS_MINUTES;
    return { minutes, hideClock: raw?.hideClock === true };
  } catch {
    return { minutes: DEFAULT_FOCUS_MINUTES, hideClock: false };
  }
}

export function saveFocusSettings(patch: Partial<FocusSettings>): FocusSettings {
  const next = { ...getFocusSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(FOCUS_SETTINGS_EVENT));
  } catch {}
  return next;
}
