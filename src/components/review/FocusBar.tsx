import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Pause, Timer, X, Check } from "lucide-react";
import type { FocusPause } from "@/hooks/useFocusSession";
import { getFocusSettings, saveFocusSettings } from "@/services/focusSession";

function mmss(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface FocusBarProps {
  remainingMs: number;
  plannedMs: number;
  paused: FocusPause;
  timeUp: boolean;
  cards: number;
  canFinish: boolean;
  /** Leave early (asks first: the session counts as unfinished) */
  onExit: () => void;
  /** "Xong": enough of the time is done, end with the summary */
  onDone: () => void;
  /** The leave question opened or closed: the clock stops while it is open */
  onConfirmChange?: (open: boolean) => void;
}

/**
 * Thin bar above the card during a focus session: time left (can be hidden), cards done, why the clock is
 * stopped, and the way out. Esc asks before leaving.
 */
export default function FocusBar({ remainingMs, plannedMs, paused, timeUp, cards, canFinish, onExit, onDone, onConfirmChange }: FocusBarProps) {
  const [hideClock, setHideClock] = useState(() => getFocusSettings().hideClock);
  const [confirming, setConfirming] = useState(false);

  const confirmingRef = useRef(false);
  confirmingRef.current = confirming;
  // The clock waits while the question is open; "Học tiếp" (or Esc, or a click outside) starts it again
  useEffect(() => {
    onConfirmChange?.(confirming);
  }, [confirming]);
  // Capture phase: while the question is open, the card's shortcuts (Enter, 1-4...) must not answer behind it.
  // The dialog's own buttons still work (their default action is kept).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmingRef.current) {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          setConfirming(false);
        }
        return;
      }
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setConfirming(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const toggleClock = () => {
    const next = !hideClock;
    setHideClock(next);
    saveFocusSettings({ hideClock: next });
  };
  const leave = () => (canFinish ? onDone() : setConfirming(true));
  const done = plannedMs > 0 ? Math.min(1, 1 - remainingMs / plannedMs) : 0;

  return (
    <div className="w-full shrink-0 mb-3">
      <div className="flex items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-violet-700 dark:text-violet-300">
          <Timer className="w-4 h-4" /> Phiên tập trung
        </span>
        <span className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
          {timeUp ? "Hết giờ" : hideClock ? "••:••" : mmss(remainingMs)}
        </span>
        <button
          onClick={toggleClock}
          title={hideClock ? "Hiện đồng hồ" : "Ẩn đồng hồ (đỡ áp lực khi thấy đếm ngược)"}
          className="p-1 rounded text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200"
        >
          {hideClock ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
        <span className="text-slate-500 dark:text-zinc-400">{cards} thẻ</span>
        {timeUp ? (
          <span className="text-amber-600 dark:text-amber-400">Làm nốt câu này là xong</span>
        ) : paused ? (
          <span className="inline-flex items-center gap-1 text-slate-500 dark:text-zinc-400">
            <Pause className="w-3 h-3" />
            {paused === "away" ? "Tạm dừng khi bạn rời cửa sổ" : paused === "dialog" ? "Đã tạm dừng" : "Tạm dừng, thao tác để tiếp tục"}
          </span>
        ) : null}
        <button
          onClick={leave}
          className={`ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-colors ${
            canFinish
              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
              : "text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
          }`}
        >
          {canFinish ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
          {canFinish ? "Xong" : "Thoát"}
        </button>
      </div>
      <div className="mt-2 h-1 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
        <div className="h-full bg-violet-500 transition-[width] duration-1000 ease-linear" style={{ width: `${hideClock ? 0 : done * 100}%` }} />
      </div>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Thoát phiên tập trung"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirming(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-5 space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-bold text-slate-900 dark:text-white">Thoát phiên tập trung?</p>
            <p className="text-xs text-slate-600 dark:text-zinc-300">
              {canFinish
                ? "Bạn đã học gần hết thời gian, phiên này vẫn được tính là hoàn thành."
                : `Đồng hồ đang tạm dừng, còn ${mmss(remainingMs)}. Thoát bây giờ thì phiên tính là chưa xong và không được thưởng XP. Các câu đã trả lời vẫn được lưu.`}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                autoFocus
                onClick={() => setConfirming(false)}
                className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold"
              >
                Học tiếp
              </button>
              <button
                onClick={() => {
                  setConfirming(false);
                  if (canFinish) onDone();
                  else onExit();
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 text-xs"
              >
                Thoát
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
