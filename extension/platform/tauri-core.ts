/**
 * Chrome Extension stand-in for @tauri-apps/api/core.
 * Bridges desktop commands to Chrome Extension APIs (Action badge, Notifications, Tabs, etc.).
 */
import { emit } from "./tauri-event";
import { computeFsrsParameters } from "./fsrs";

const BASE_TITLE = "MyEnglish";

function unsupported(cmd: string): never {
  throw new Error(`"${cmd}" is not available on the Chrome Extension version`);
}

function download(contents: string, fileName: string): string {
  const type = fileName.endsWith(".csv") ? "text/csv;charset=utf-8" : "application/json";
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return fileName;
}

function notify(title: string, body: string): boolean {
  if (typeof chrome !== "undefined" && chrome.notifications?.create) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime?.getURL ? chrome.runtime.getURL("icons/icon-128.png") : "/app-icon.png",
      title,
      message: body,
    });
    return true;
  }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  try {
    new Notification(title, { body, icon: "/app-icon.png" }).onclick = () => window.focus();
    return true;
  } catch {
    return false;
  }
}

type Args = Record<string, unknown> | undefined;

let nudgeSeq = 0;
let lastNudgePayload: Record<string, unknown> | null = null;
let reviewPopupVisible = false;

const commands: Record<string, (args: Args) => unknown> = {
  // Update Chrome Extension toolbar icon badge count & document title
  set_tray_due_count: (a) => {
    const reviews = Number(a?.reviews ?? 0);
    const newCards = Number(a?.newCards ?? 0);
    const due = reviews > 0 ? reviews : reviews + newCards;
    const hasUrgent = reviews > 0;
    const text = due > 0 ? (due > 999 ? "999+" : String(due)) : "";
    document.title = due > 0 ? `(${due}) ${BASE_TITLE}` : BASE_TITLE;
    if (typeof chrome !== "undefined" && chrome.action?.setBadgeText) {
      chrome.action.setBadgeText({ text });
      chrome.action.setBadgeBackgroundColor({ color: hasUrgent && due > 0 ? "#ef4444" : "#0891b2" });
    }
    if (typeof chrome !== "undefined" && chrome.storage?.local?.set) {
      chrome.storage.local.set({ dueCount: due, hasUrgentReviews: hasUrgent });
    }
  },
  send_desktop_notification: (a) => notify(String(a?.title ?? BASE_TITLE), String(a?.body ?? "")),
  get_popup_blockers: () => ({ fullscreen_app: null, screen_sharing_app: null, focus_mode: null, idle_seconds: null }),
  show_review_popup: () => {
    lastNudgePayload = null;
    reviewPopupVisible = true;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("close-review-nudge-preview"));
      window.dispatchEvent(new CustomEvent("open-review-popup-preview"));
    }
    return true;
  },
  show_review_nudge: (a) => {
    if (reviewPopupVisible) return false;
    const raw = (a?.payload && typeof a.payload === "object" ? a.payload : {}) as Record<string, unknown>;
    const payload = { ...raw, nudgeId: ++nudgeSeq };
    lastNudgePayload = payload;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open-review-nudge-preview", { detail: payload }));
    }
    void emit("review-nudge-opened", payload);
    return true;
  },
  hide_review_popup: () => {
    reviewPopupVisible = false;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("close-review-popup-preview"));
    }
  },
  hide_review_nudge: () => {
    lastNudgePayload = null;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("close-review-nudge-preview"));
    }
  },
  take_review_nudge_payload: () => {
    const p = lastNudgePayload;
    lastNudgePayload = null;
    return p;
  },
  is_cursor_over_nudge: () => false,
  show_main_window: () => {
    if (typeof chrome !== "undefined" && chrome.tabs?.query) {
      const url = chrome.runtime.getURL("index.html");
      chrome.tabs.query({ url: chrome.runtime.getURL("index.html*") }, (tabs) => {
        if (tabs.length > 0 && tabs[0].id) {
          chrome.tabs.update(tabs[0].id, { active: true });
          if (tabs[0].windowId) chrome.windows.update(tabs[0].windowId, { focused: true });
        } else {
          chrome.tabs.create({ url });
        }
      });
    } else if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
    } else {
      window.focus();
    }
  },
  trigger_review_navigation: () => emit("open-review-tab", {}),
  prepare_update_exit: () => {},
  cancel_update_exit: () => {},
  log_debug: (a) => console.debug(`[${String(a?.tag ?? "debug")}]`, a?.message),
  export_backup: (a) => download(String(a?.contents ?? ""), String(a?.fileName ?? "myenglish-backup.json")),
  check_cli_status: () => ({ installed: false, path: "", details: "Tính năng AI qua CLI chỉ có trên bản desktop" }),
  enrich_word_with_gemini: () => unsupported("enrich_word_with_gemini"),
  generate_grammar_exercises_ai: () => unsupported("generate_grammar_exercises_ai"),
  generate_vocabulary_recommendations_ai: () => unsupported("generate_vocabulary_recommendations_ai"),
  grade_sentence_ai: () => unsupported("grade_sentence_ai"),
  correct_writing_ai: () => unsupported("correct_writing_ai"),
  generate_memory_aid_ai: () => unsupported("generate_memory_aid_ai"),
  compute_fsrs_parameters: (a) => computeFsrsParameters(a?.items),
};

export async function invoke<T>(cmd: string, args?: Args): Promise<T> {
  const run = commands[cmd];
  if (!run) unsupported(cmd);
  return (await run(args)) as T;
}

export function isTauri(): boolean {
  return false;
}
