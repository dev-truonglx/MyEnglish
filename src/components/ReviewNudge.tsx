import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { BookOpen, Clock, Play } from "lucide-react";
import {
  buildNudgePayload,
  hideReviewNudge,
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
 * - "Bắt đầu" opens the review now
 * - "Hoãn" snoozes the reminder
 * - ignoring it: the review opens by itself when the countdown ends (paused while hovered)
 */
export default function ReviewNudge({ onDone }: ReviewNudgeProps) {
  const [payload, setPayload] = useState<ReviewNudgePayload>(() => buildNudgePayload(0));
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [animationKey, setAnimationKey] = useState(0);
  const hoveredRef = useRef(false);
  const actedRef = useRef(false);

  const begin = useCallback((next: ReviewNudgePayload) => {
    actedRef.current = false;
    setPayload(next);
    setSecondsLeft(next.autoOpenSeconds);
    setAnimationKey((k) => k + 1); // replay the slide-in for every reminder
  }, []);

  const finish = useCallback(async (action: "start" | "snooze") => {
    if (actedRef.current) return;
    actedRef.current = true;
    setSecondsLeft(null);
    if (action === "snooze") {
      snoozeReminder();
      await hideReviewNudge();
    } else {
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

    // Browser preview: there is no native event, start right away
    if (!("__TAURI_INTERNALS__" in window)) begin(buildNudgePayload(5));

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [begin]);

  // Countdown: one tick per second, skipped while the pointer is over the card (reading/deciding)
  const running = secondsLeft !== null;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      if (!hoveredRef.current) setSecondsLeft((s) => (s === null ? s : Math.max(0, s - 1)));
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (secondsLeft === 0) finish("start");
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
        onMouseEnter={() => (hoveredRef.current = true)}
        onMouseLeave={() => (hoveredRef.current = false)}
      >
        <div className="p-3.5 flex items-start gap-3">
          <span className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 text-white flex items-center justify-center shadow-sm">
            <BookOpen className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-slate-900 dark:text-white">Đến giờ ôn tập</div>
            <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">{subtitle}</div>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                onClick={() => finish("start")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 !text-white text-[11px] font-semibold transition-colors"
              >
                <Play className="w-3 h-3 fill-white" />
                Bắt đầu
              </button>
              <button
                onClick={() => finish("snooze")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 text-[11px] font-semibold transition-colors"
              >
                <Clock className="w-3 h-3 text-amber-500" />
                Hoãn {payload.snoozeMinutes}p
              </button>
              {secondsLeft !== null && (
                <span className="ml-auto text-[10px] text-slate-400 dark:text-zinc-500 tabular-nums">
                  Tự mở sau {secondsLeft}s
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Countdown bar */}
        <div className="h-1 bg-slate-100 dark:bg-zinc-800">
          <div
            className="h-full bg-cyan-500 transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
