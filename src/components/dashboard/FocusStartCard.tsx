import { useEffect, useState } from "react";
import { Timer, Zap } from "lucide-react";
import { FOCUS_DURATIONS, focusPreview, focusPreviewText, getFocusSettings, saveFocusSettings } from "@/services/focusSession";
import { getStudyLimits } from "@/services/srs";
import { focusPitch, loadFocusPitchInput, type FocusPitchInput } from "@/services/focusPitch";

interface FocusStartCardProps {
  onStart: (minutes: number) => void;
  disabled?: boolean;
  /** Shows the "F" shortcut (Today tab) */
  shortcut?: boolean;
  /** Cards due now, for the pitch ("40 thẻ đang chờ bạn") */
  due?: number;
  /** A slim one-line row (Today, when its list already has a loud focus button) */
  quiet?: boolean;
  /** Today's work, for the line saying what the session will hold */
  work?: { reviews: number; newToday: number };
}

/**
 * Start a focus session: pick 5 / 10 / 15 / 25 minutes (the last choice is kept). Loud (gradient, pulsing icon)
 * until a session is done today, then a quiet card; the line on it says why now (see focusPitch).
 */
export default function FocusStartCard({ onStart, disabled = false, shortcut = false, due = 0, quiet = false, work }: FocusStartCardProps) {
  const [minutes, setMinutes] = useState(() => getFocusSettings().minutes);
  const [input, setInput] = useState<FocusPitchInput | null>(null);

  useEffect(() => {
    const load = () => loadFocusPitchInput(minutes, due).then((r) => setInput(r.input)).catch(() => {});
    load();
    window.addEventListener("words-changed", load);
    return () => window.removeEventListener("words-changed", load);
  }, [due]);

  const pick = (m: number) => {
    setMinutes(m);
    saveFocusSettings({ minutes: m });
  };
  const pitch = focusPitch({
    ...(input ?? {
      due,
      todaySessions: 0,
      todayMinutes: 0,
      yesterdayMinutes: 0,
      completedTotal: 1,
      returnLiftPoints: null,
      hour: new Date().getHours(),
    }),
    minutes,
  });
  const strong = pitch.tone === "strong" && !quiet;
  const preview = work ? focusPreviewText(focusPreview(work, minutes, getStudyLimits().maxSessionSize), minutes) : null;

  const chips = (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Thời lượng">
      {FOCUS_DURATIONS.map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={minutes === m}
          onClick={() => pick(m)}
          className={`max-md:min-h-10 max-md:min-w-10 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            strong
              ? minutes === m
                ? "bg-white text-violet-700 shadow-sm"
                : "bg-white/15 text-white hover:bg-white/25"
              : minutes === m
                ? "bg-violet-600 text-white"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
          }`}
        >
          {m}′
        </button>
      ))}
    </div>
  );

  // Today's slim row: one line, the pitch in full on hover
  if (quiet) {
    return (
      <div
        className="rounded-xl border border-violet-200 dark:border-violet-800/50 bg-white dark:bg-zinc-900 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2"
        title={`${pitch.title}. ${pitch.body}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 basis-[130px]">
          <Timer className="w-4 h-4 text-violet-600 dark:text-violet-300 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{pitch.title}</div>
            <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">{pitch.body}</div>
          </div>
        </div>
        {chips}
        <button
          onClick={() => onStart(minutes)}
          disabled={disabled}
          className="max-md:min-h-10 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 active:scale-[0.98] text-white text-xs font-bold transition-all disabled:opacity-40"
        >
          Bắt đầu
          {shortcut && <kbd className="hidden md:inline ml-1.5 px-1 rounded bg-white/20 font-mono text-[10px]">F</kbd>}
        </button>
        {preview && <div className="basis-full text-[11px] text-slate-500 dark:text-zinc-400">{preview}</div>}
      </div>
    );
  }

  if (!strong) {
    return (
      <div className="rounded-2xl border border-violet-200 dark:border-violet-800/50 bg-white dark:bg-zinc-900 p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1 basis-[220px]">
          <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center text-violet-600 dark:text-violet-300 shrink-0">
            <Timer className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 dark:text-white">{pitch.title}</div>
            <div className="text-xs text-slate-500 dark:text-zinc-400">{pitch.body}</div>
          </div>
        </div>
        {chips}
        <button
          onClick={() => onStart(minutes)}
          disabled={disabled}
          className="max-md:min-h-10 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 active:scale-[0.98] text-white text-xs font-bold shadow-sm shadow-violet-600/30 transition-all disabled:opacity-40"
        >
          Thêm {minutes} phút
          {shortcut && <kbd className="hidden md:inline ml-2 px-1 rounded bg-white/20 font-mono text-[10px]">F</kbd>}
        </button>
        {preview && <div className="basis-full text-[11px] text-slate-500 dark:text-zinc-400">{preview}</div>}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-indigo-600 to-fuchsia-600 p-4 sm:p-6 text-white shadow-lg shadow-violet-600/25">
      {/* Soft light in the corner */}
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex flex-wrap items-start gap-4">
        <div className="relative shrink-0">
          <span aria-hidden className="absolute inset-0 rounded-2xl bg-white/30 animate-ping motion-reduce:animate-none" />
          <div className="relative w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
            <Timer className="w-6 h-6" />
          </div>
        </div>
        <div className="min-w-0 flex-1 basis-[240px] space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-white/70">Phiên tập trung</div>
          <div className="text-lg font-bold leading-snug">{pitch.title}</div>
          <p className="text-sm text-white/85">{pitch.body}</p>
        </div>
      </div>
      <div className="relative mt-4 flex flex-wrap items-center gap-3">
        {chips}
        <button
          onClick={() => onStart(minutes)}
          disabled={disabled}
          className="ml-auto max-md:min-h-10 px-5 py-2.5 rounded-xl bg-white hover:bg-violet-50 active:scale-[0.98] text-violet-700 text-sm font-bold shadow-md inline-flex items-center gap-2 transition-all disabled:opacity-50"
        >
          Bắt đầu {minutes} phút
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[11px] font-bold">
            <Zap className="w-3 h-3 fill-amber-500 text-amber-500" />+{pitch.xp} XP
          </span>
          {shortcut && <kbd className="hidden md:inline px-1 rounded bg-violet-100 font-mono text-[10px] text-violet-600">F</kbd>}
        </button>
        {preview && <div className="basis-full text-xs text-white/80">{preview}</div>}
      </div>
    </div>
  );
}
