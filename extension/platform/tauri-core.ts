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

const commands: Record<string, (args: Args) => unknown> = {
  // Update Chrome Extension toolbar icon badge count & document title
  set_tray_due_count: (a) => {
    const due = Number(a?.reviews ?? 0);
    document.title = due > 0 ? `(${due}) ${BASE_TITLE}` : BASE_TITLE;
    if (typeof chrome !== "undefined" && chrome.action?.setBadgeText) {
      chrome.action.setBadgeText({ text: due > 0 ? String(due) : "" });
      chrome.action.setBadgeBackgroundColor({ color: "#0891b2" });
    }
    if (typeof chrome !== "undefined" && chrome.storage?.local?.set) {
      chrome.storage.local.set({ dueCount: due });
    }
  },
  send_desktop_notification: (a) => notify(String(a?.title ?? BASE_TITLE), String(a?.body ?? "")),
  get_popup_blockers: () => ({ fullscreen_app: null, screen_sharing_app: null, focus_mode: null, idle_seconds: null }),
  show_review_popup: () => unsupported("show_review_popup"),
  show_review_nudge: () => unsupported("show_review_nudge"),
  hide_review_popup: () => {},
  hide_review_nudge: () => {},
  take_review_nudge_payload: () => null,
  is_cursor_over_nudge: () => false,
  show_main_window: () => {
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
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
