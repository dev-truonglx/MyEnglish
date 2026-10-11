/**
 * Cross-window flag: the main window is in a study session, so the reminder worker must not show the
 * nudge/popup on top of it (the same card could be graded twice). Stored in localStorage, shared by all
 * windows. The session refreshes the timestamp on every answer; a crashed or closed session stops
 * blocking reminders after STALE_MS.
 */
const MAIN_SESSION_KEY = "myenglish_main_session_v1";
const STALE_MS = 10 * 60 * 1000;

export function setMainSessionActive(active: boolean, now: number = Date.now()): void {
  try {
    if (active) localStorage.setItem(MAIN_SESSION_KEY, String(now));
    else localStorage.removeItem(MAIN_SESSION_KEY);
  } catch {}
}

export function isMainSessionActive(now: number = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(MAIN_SESSION_KEY) || 0);
    return at > 0 && now - at >= 0 && now - at < STALE_MS;
  } catch {
    return false;
  }
}
