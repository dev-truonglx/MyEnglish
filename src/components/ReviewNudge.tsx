import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { BookOpen, Clock, Play } from "lucide-react";
import {
  buildNudgePayload,
  hideReviewNudge,
  resetIgnoredNudges,
  snoozeIgnoredNudge,
  snoozeReminder,
  triggerReviewPopup,
  type ReviewNudgePayload,
} from "@/services/reminderSettings";

interface ReviewNudgeProps {
  /** Browser preview only: called after an action instead of hiding a native window */
  onDone?: () => void;
}

/**
 * Corner reminder shown before the full review popup. It never takes keyboard focus.
 * - "Học ngay" opens the review now
 * - "Hoãn" snoozes the reminder
 * - ignoring it: the reminder is snoozed when the countdown ends (paused while the pointer is on it)
 */
const TICK_MS = 250;

export default function ReviewNudge({ onDone }: ReviewNudgeProps) {
  const [payload, setPayload] = useState<ReviewNudgePayload>(() => buildNudgePayload(0));
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [animationKey, setAnimationKey] = useState(0);
  // Browser-preview fallback only: > 0 while the pointer is over the card
  const hoverAtRef = useRef(0);
  // Wall-clock moment the countdown ends; pushed back while hovered
  const deadlineRef = useRef(0);
  const lastTickRef = useRef(0);
  const actedRef = useRef(false);
  const lastNudgeIdRef = useRef<number | null>(null);
  // First frame of a new reminder: no width transition, so the bar doesn't animate 0→100%
  const [freshBar, setFreshBar] = useState(false);

  const begin = useCallback((next: ReviewNudgePayload & { nudgeId?: number }) => {
    // The same reminder can arrive both by event and by take_review_nudge_payload
    if (next.nudgeId !== undefined) {
      if (next.nudgeId === lastNudgeIdRef.current) return;
      lastNudgeIdRef.current = next.nudgeId;
    }
    actedRef.current = false;
    hoverAtRef.current = 0; // the window may have hidden before mouseleave fired
    deadlineRef.current = Date.now() + next.autoOpenSeconds * 1000;
    lastTickRef.current = Date.now();
    setPayload(next);
    setSecondsLeft(next.autoOpenSeconds);
    setFreshBar(true);
    setAnimationKey((k) => k + 1); // replay the slide-in for every reminder
  }, []);

  useEffect(() => {
    if (!freshBar) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setFreshBar(false)));
    return () => cancelAnimationFrame(id);
  }, [freshBar]);

  // "timeout" = nobody answered: snoozed with a growing delay; any click resets that delay
  const finish = useCallback(async (action: "start" | "snooze" | "timeout") => {
    if (actedRef.current) return;
    actedRef.current = true;
    hoverAtRef.current = 0;
    setSecondsLeft(null);
    if (action === "timeout") {
      snoozeIgnoredNudge();
      await hideReviewNudge();
    } else if (action === "snooze") {
      resetIgnoredNudges();
      snoozeReminder();
      await hideReviewNudge();
    } else {
      resetIgnoredNudges();
      // show_review_popup also hides this card
      await triggerReviewPopup();
    }
    onDone?.();
  }, [onDone]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    listen<ReviewNudgePayload>("review-nudge-opened", (event) => {
      if (!cancelled && event.payload) begin(event.payload);
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    // The reminder may have been emitted before this lazy chunk registered its listener
    if ("__TAURI_INTERNALS__" in window) {
      invoke<(ReviewNudgePayload & { nudgeId?: number }) | null>("take_review_nudge_payload")
        .then((pending) => {
          if (!cancelled && pending) begin(pending);
        })
        .catch(() => {});
    }

    // Browser preview: there is no native event, start right away
    if (!("__TAURI_INTERNALS__" in window)) begin(buildNudgePayload(5));

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [begin]);

  // Countdown against a wall-clock deadline, so ticks throttled by the OS for a background,
  // non-focused window are caught up instead of silently lost. The deadline is pushed back while
  // the cursor is over the card. Hover comes from the native cursor position (DOM mouseleave is
  // unreliable on a non-key transparent window); in a browser preview it falls back to DOM events.
  const running = secondsLeft !== null;
  useEffect(() => {
    if (!running) return;
    const native = "__TAURI_INTERNALS__" in window;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        let hovered: boolean;
        if (native) {
          hovered = await invoke<boolean>("is_cursor_over_nudge").catch(() => hoverAtRef.current > 0);
        } else {
          hovered = hoverAtRef.current > 0;
        }
        if (actedRef.current) return;
        const now = Date.now();
        const elapsed = now - lastTickRef.current;
        lastTickRef.current = now;
        if (hovered) {
          deadlineRef.current += elapsed;
          return;
        }
        const left = Math.max(0, Math.ceil((deadlineRef.current - now) / 1000));
        setSecondsLeft((s) => (s === null || s === left ? s : left));
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  // Nobody answered: default to snoozing
  useEffect(() => {
    if (secondsLeft === 0) finish("timeout");
  }, [secondsLeft, finish]);

  const progress = secondsLeft === null ? 0 : secondsLeft / payload.autoOpenSeconds;
  const subtitle =
    payload.dueCount > 0
      ? `${payload.dueCount} từ đến hạn · ${payload.sessionSize} câu · ~${payload.estimatedMinutes} phút`
      : `Ôn nhanh ${payload.sessionSize} câu · ~${payload.estimatedMinutes} phút`;

  return (
    <div className="w-screen h-screen flex items-start justify-end p-1 bg-transparent select-none">
      <div
        key={animationKey}
        className="nudge-enter w-full rounded-2xl border border-slate-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/95 backdrop-blur shadow-xl overflow-hidden"
        onMouseEnter={() => (hoverAtRef.current = Date.now())}
        onMouseLeave={() => (hoverAtRef.current = 0)}
      >
        <div className="p-3.5 flex items-start gap-3">
          <span className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 text-white flex items-center justify-center shadow-sm">
            <BookOpen className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-slate-900 dark:text-white">Đến giờ ôn tập</div>
            <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">{subtitle}</div>
            <div className="mt-2.5 flex items-center gap-2" role="group" aria-label="Nhắc ôn tập">
              <button
                onClick={() => finish("start")}
                aria-label="Học ngay"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 !text-white text-[11px] font-semibold transition-colors"
              >
                <Play className="w-3 h-3 fill-white" />
                Học ngay
              </button>
              <button
                onClick={() => finish("snooze")}
                aria-label={`Hoãn nhắc ôn tập ${payload.snoozeMinutes} phút`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 text-[11px] font-semibold transition-colors"
              >
                <Clock className="w-3 h-3 text-amber-500" />
                Hoãn {payload.snoozeMinutes}p
              </button>
              {secondsLeft !== null && (
                <span className="ml-auto text-[10px] text-slate-500 dark:text-zinc-500 tabular-nums">
                  Tự hoãn sau {secondsLeft}s
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Countdown bar */}
        <div className="h-1 bg-slate-100 dark:bg-zinc-800">
          <div
            className={`h-full bg-cyan-500 ${freshBar ? "" : "transition-[width] duration-1000 ease-linear"}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
