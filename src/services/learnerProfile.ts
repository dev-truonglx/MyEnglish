/**
 * Who the learner is, beyond the CEFR level: settings that make the app fit an absolute beginner.
 *  - foundation mode ("A0 — mất gốc"): foundation grammar first, only function words
 *    count as already known in the reader, recall (typing) starts later
 *  - simple mode: no scheduling jargon (FSRS, S/D, leech), Vietnamese labels, fewer choices on screen
 *  - interface scale: bigger text for the main window
 * Kept in localStorage (mirrored to SQLite by storageBackup like every "myenglish_" key).
 */
import { persistKeyNow } from "./storageBackup";

const FOUNDATION_KEY = "myenglish_foundation_mode_v1";
const SIMPLE_KEY = "myenglish_simple_mode_v1";
const SCALE_KEY = "myenglish_ui_scale_v1";
/** The level the learner chose (userProficiency reads and writes it; defined here to keep this module light) */
export const LEVEL_OVERRIDE_KEY = "myenglish_user_cefr_override_v1";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
    persistKeyNow(key);
    window.dispatchEvent(new CustomEvent("myenglish-profile-updated"));
  } catch {}
}

/** The level the learner chose (A1…C1), or null */
export function chosenLevel(): string | null {
  return read(LEVEL_OVERRIDE_KEY);
}

/** Foundation grammar (to be, pronouns, plurals…) is part of the curriculum for A0/A1 learners only */
export function includesFoundationGrammar(): boolean {
  const level = chosenLevel();
  return isFoundationMode() || level === null || level === "A1";
}

export function isFoundationMode(): boolean {
  return read(FOUNDATION_KEY) === "1";
}

export function setFoundationMode(on: boolean): void {
  write(FOUNDATION_KEY, on ? "1" : "0");
}

/** Beginners: foundation mode, or a chosen level of A1/A2, or no level at all */
export function isBeginner(): boolean {
  const level = chosenLevel();
  return isFoundationMode() || level === null || level === "A1" || level === "A2";
}

/** The learner's own choice when they made one; otherwise on for beginners */
export function isSimpleMode(): boolean {
  const stored = read(SIMPLE_KEY);
  if (stored === "1" || stored === "0") return stored === "1";
  return isBeginner();
}

export function setSimpleMode(on: boolean): void {
  write(SIMPLE_KEY, on ? "1" : "0");
}

/** Recognition stability (days) a word needs before its typing (recall) drill starts */
export function productionUnlockDays(): number {
  return isFoundationMode() ? 7 : 3;
}

export const UI_SCALES = [1, 1.1, 1.25] as const;
export type UiScale = (typeof UI_SCALES)[number];

export function getUiScale(): UiScale {
  const n = Number(read(SCALE_KEY));
  return (UI_SCALES as readonly number[]).includes(n) ? (n as UiScale) : 1;
}

/** Changed from Settings, which is in the main window: apply right away */
export function setUiScale(scale: UiScale): void {
  write(SCALE_KEY, String(scale));
  applyUiScale();
}

/**
 * Bigger text for the main window. Most labels use fixed pixel sizes (text-[11px]), which a root font
 * size would not change, so the whole page is zoomed instead (WebKit and WebView2 both support `zoom`).
 */
export function applyUiScale(): void {
  try {
    const scale = getUiScale();
    (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = scale === 1 ? "" : String(scale);
  } catch {}
}
