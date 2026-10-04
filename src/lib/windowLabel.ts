import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

/** Label of the current window (main, quick-input, review-popup, review-nudge); `?window=` wins. */
export function getInitialWindowLabel(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlWin = params.get("window");
    if (urlWin) return urlWin;

    const current = getCurrentWebviewWindow();
    if (current?.label) {
      return current.label;
    }
  } catch (e) {
    // Browser preview mode fallback
  }
  return "main";
}
