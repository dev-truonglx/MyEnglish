import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Sparkles, CornerDownLeft, X, Terminal, ArrowUpRight, Clipboard } from "lucide-react";

interface QuickInputProps {
  onSubmitted?: (word: string) => void;
  isStandalone?: boolean;
}

/**
 * Validates and cleans candidate word from clipboard.
 * Accepts English words and technical terms (e.g. idempotent, debounce, event loop, thread-safe).
 * Strips surrounding quotes, backticks, and trailing punctuation.
 */
function sanitizeCandidateWord(raw: string): string | null {
  if (!raw) return null;
  let text = raw.trim();

  // Strip surrounding quotes and backticks: "word", 'word', `word`, “word”
  text = text.replace(/^["'`“‘]+|["'`”’]+$/g, "").trim();

  // Strip trailing punctuation: .,;:?!
  text = text.replace(/[.,;:?!]+$/, "").trim();

  // Length check: 2 to 45 chars
  if (text.length < 2 || text.length > 45) return null;

  // Reject if contains newlines or tabs
  if (/[\r\n\t]/.test(text)) return null;

  // Reject URLs and file paths
  if (
    text.includes("http://") ||
    text.includes("https://") ||
    text.includes("www.") ||
    text.includes("/") ||
    text.includes("\\")
  ) {
    return null;
  }

  // Reject code blocks / code operators
  if (/[{}()\[\]=<>;*&$%#@^]/.test(text)) return null;

  // Only allow English letters, spaces, hyphens, and apostrophes
  if (!/^[a-zA-Z\s\-']+$/.test(text)) return null;

  return text;
}

export default function QuickInput({ onSubmitted, isStandalone = true }: QuickInputProps) {
  const [word, setWord] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [fromClipboard, setFromClipboard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Reads clipboard text natively via Tauri (pbpaste on macOS) or fallback,
   * then automatically applies and selects valid candidate words.
   */
  const checkAndApplyClipboard = async (customText?: string) => {
    let clipText = customText;

    if (clipText === undefined) {
      // 1. Try native Tauri command (pbpaste on macOS - 100% reliable)
      try {
        const nativeText = await invoke<string>("get_clipboard_text");
        if (nativeText && typeof nativeText === "string") {
          clipText = nativeText;
        }
      } catch {
        // Fallback to web navigator.clipboard
        if (navigator.clipboard?.readText) {
          try {
            clipText = await navigator.clipboard.readText();
          } catch {}
        }
      }
    }

    if (!clipText) return;

    const candidate = sanitizeCandidateWord(clipText);
    if (candidate) {
      setWord(candidate);
      setFromClipboard(true);
      setFeedback(null);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  };

  useEffect(() => {
    let isCancelled = false;
    let unlistenFn: (() => void) | null = null;

    // Auto-focus input
    inputRef.current?.focus();

    // 1. Initial check when mounted
    checkAndApplyClipboard();

    // 2. Listen to Tauri backend event "quick-input-opened" (emitted on ⌘⇧E or toggle_quick_input)
    listen<{ clipboard?: string }>("quick-input-opened", (event) => {
      if (isCancelled) return;
      const clip = event.payload?.clipboard;
      checkAndApplyClipboard(clip);
    })
      .then((fn) => {
        if (isCancelled) fn();
        else unlistenFn = fn;
      })
      .catch(() => {});

    // 3. Listen to window focus (whenever window regains focus)
    const onFocus = () => {
      if (!isCancelled) {
        checkAndApplyClipboard();
      }
    };
    window.addEventListener("focus", onFocus);

    return () => {
      isCancelled = true;
      if (unlistenFn) unlistenFn();
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const handleDismiss = async () => {
    try {
      await invoke("hide_quick_input");
    } catch {
      setFeedback("Closed");
    }
  };

  const handleOpenDashboard = async () => {
    try {
      await invoke("show_main_window");
    } catch {
      setFeedback("Dashboard opened");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      handleDismiss();
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = word.trim();
    if (!clean || submitting) return;

    setSubmitting(true);
    setFeedback(null);

    try {
      await invoke("submit_word", { word: clean });
      setWord("");
      setFromClipboard(false);
      setFeedback(`Word "${clean}" queued for AI enrichment!`);
      if (onSubmitted) {
        onSubmitted(clean);
      }
    } catch (err) {
      console.warn("Backend submit error or browser fallback:", err);
      setFeedback(`Word "${clean}" captured (Preview mode)`);
      if (onSubmitted) {
        onSubmitted(clean);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`w-full flex items-center justify-center ${
        isStandalone ? "h-screen bg-transparent p-2" : "py-2"
      }`}
    >
      <div className="w-full max-w-[620px] rounded-2xl bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-300 dark:border-slate-700/80 shadow-2xl shadow-slate-300/40 dark:shadow-cyan-950/40 p-2.5 transition-all">
        <form onSubmit={handleSubmit} className="relative flex items-center gap-2.5">
          {/* Logo / Sparkle Badge */}
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20 shrink-0">
            {submitting ? (
              <Sparkles className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Terminal className="w-4 h-4 text-white" />
            )}
          </div>

          {/* Search Input */}
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={word}
              onChange={(e) => {
                setWord(e.target.value);
                setFromClipboard(false);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Nhập hoặc copy từ tiếng Anh (e.g. idempotent, debounce)..."
              disabled={submitting}
              className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none font-medium pr-8 font-mono"
              autoComplete="off"
              spellCheck="false"
            />
            {word && (
              <button
                type="button"
                onClick={() => {
                  setWord("");
                  setFromClipboard(false);
                }}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Quick Paste Button */}
            <button
              type="button"
              onClick={() => checkAndApplyClipboard()}
              title="Đọc từ Clipboard"
              className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1"
            >
              <Clipboard className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
              <span>Dán</span>
            </button>

            {/* Open Dashboard button */}
            <button
              type="button"
              onClick={handleOpenDashboard}
              title="Mở Dashboard chính"
              className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700/80 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1"
            >
              <span>Dashboard</span>
              <ArrowUpRight className="w-3 h-3 text-slate-500 dark:text-slate-400" />
            </button>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!word.trim() || submitting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold shadow-md shadow-cyan-500/20 transition-all disabled:opacity-40 disabled:pointer-events-none"
            >
              <span>{submitting ? "Đang thêm..." : "Thêm"}</span>
              <span className="flex items-center text-[10px] bg-white/20 px-1 py-0.5 rounded font-mono">
                <CornerDownLeft className="w-2.5 h-2.5" />
              </span>
            </button>
          </div>
        </form>

        {/* Footer shortcuts helper */}
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[10px] text-slate-700 dark:text-slate-300">
                ⌘⇧E
              </kbd>
              Phím tắt
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[10px] text-slate-700 dark:text-slate-300">
                Esc
              </kbd>
              Đóng
            </span>
          </div>

          {feedback ? (
            <span className="text-cyan-600 dark:text-cyan-400 font-medium truncate max-w-[200px]">{feedback}</span>
          ) : fromClipboard ? (
            <span className="text-emerald-600 dark:text-emerald-300 font-medium flex items-center gap-1.5 font-mono text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Tự nhận diện từ Clipboard • Nhấn Enter để thêm
            </span>
          ) : (
            <span className="text-slate-500 dark:text-slate-400 font-mono text-[10px]">Nhấn Enter để phân tích AI</span>
          )}
        </div>
      </div>
    </div>
  );
}
