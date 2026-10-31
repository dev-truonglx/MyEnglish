import { useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCheck, Info, Loader2, X } from "lucide-react";
import {
  STUDY_LEVELS,
  type StudyLevel,
  CATALOG_LEVEL_COUNTS,
} from "@/services/vocabCatalog";
import {
  countUnstudiedWordsForLevel,
  markLevelWordsKnown,
  type LevelProgress,
} from "@/services/vocabFeed";

export const LEVEL_NAMES: Record<StudyLevel, string> = {
  A1: "Mới bắt đầu",
  A2: "Cơ bản",
  B1: "Trung cấp",
  B2: "Khá",
  C1: "Thành thạo",
};

interface MarkLevelKnownModalProps {
  level: StudyLevel;
  progress: LevelProgress | null;
  levels: StudyLevel[];
  onClose: () => void;
  onDone: (nextLevels?: StudyLevel[]) => void;
}

export default function MarkLevelKnownModal({
  level,
  progress,
  levels,
  onClose,
  onDone,
}: MarkLevelKnownModalProps) {
  const [unstudiedCount, setUnstudiedCount] = useState<number | null>(() => {
    if (progress) return Math.max(0, progress.total - progress.met);
    return null;
  });
  const [loadingCount, setLoadingCount] = useState(unstudiedCount === null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressStatus, setProgressStatus] = useState<{ done: number; total: number } | null>(null);

  const nextLevelIndex = STUDY_LEVELS.indexOf(level) + 1;
  const nextLevel: StudyLevel | null = nextLevelIndex < STUDY_LEVELS.length ? STUDY_LEVELS[nextLevelIndex] : null;
  const canAdvance = nextLevel !== null && !levels.includes(nextLevel);
  const [autoAdvance, setAutoAdvance] = useState(canAdvance);

  useEffect(() => {
    let cancelled = false;
    countUnstudiedWordsForLevel(level)
      .then((count) => {
        if (!cancelled) {
          setUnstudiedCount(count);
          setLoadingCount(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingCount(false);
      });
    return () => {
      cancelled = true;
    };
  }, [level]);

  const total = progress?.total ?? CATALOG_LEVEL_COUNTS[level];
  const countToMark = unstudiedCount ?? (progress ? Math.max(0, progress.total - progress.met) : total);
  const alreadyMet = total - countToMark;

  const handleConfirm = async () => {
    if (countToMark === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    setProgressStatus({ done: 0, total: countToMark });

    try {
      await markLevelWordsKnown(level, (done, total) => {
        setProgressStatus({ done, total });
      });

      let updatedLevels: StudyLevel[] | undefined = undefined;
      if (autoAdvance && nextLevel) {
        // Contiguous up to nextLevel
        updatedLevels = STUDY_LEVELS.slice(0, nextLevelIndex + 1);
      }

      onDone(updatedLevels);
    } catch (err) {
      setError(`Không thể đánh dấu từ đã biết: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  };

  const progressPercent =
    progressStatus && progressStatus.total > 0
      ? Math.min(100, Math.round((progressStatus.done / progressStatus.total) * 100))
      : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mark-level-title"
        className="w-full max-w-lg max-md:overflow-x-hidden max-md:overflow-y-auto max-h-[90dvh] md:max-h-none md:overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl p-4 md:p-6 space-y-5"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 id="mark-level-title" className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <CheckCheck className="w-5 h-5 text-emerald-500 shrink-0" />
              Đánh dấu toàn bộ cấp {level} là đã biết
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {level} · {LEVEL_NAMES[level]} (tổng cộng {total.toLocaleString("vi-VN")} từ Oxford)
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="p-2.5 md:p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats card */}
        <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/80 dark:border-zinc-800 text-center">
          <div>
            <span className="block text-[11px] text-slate-500 dark:text-zinc-400">Tổng số từ</span>
            <span className="text-base font-bold text-slate-900 dark:text-white">{total.toLocaleString("vi-VN")}</span>
          </div>
          <div>
            <span className="block text-[11px] text-slate-500 dark:text-zinc-400">Đã học trước</span>
            <span className="text-base font-bold text-cyan-600 dark:text-cyan-400">{alreadyMet.toLocaleString("vi-VN")}</span>
          </div>
          <div>
            <span className="block text-[11px] text-slate-500 dark:text-zinc-400">Sẽ đánh dấu</span>
            <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
              {loadingCount ? "..." : countToMark.toLocaleString("vi-VN")}
            </span>
          </div>
        </div>

        {/* Context and Spaced Repetition explanation */}
        <div className="space-y-2 text-xs text-slate-600 dark:text-zinc-300">
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="space-y-1">
              <p>
                <b>{countToMark.toLocaleString("vi-VN")} từ</b> chưa học sẽ được chuyển thẳng vào mục <b>"Đã biết"</b> và không còn xuất hiện trong phần học từ mới.
              </p>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                Các từ này không vào lịch ôn. Để kiểm chứng, mỗi phiên ôn app hỏi ngẫu nhiên <b>2–3 từ</b> của cấp này: đúng từ 90% thì cấp
                được công nhận, đúng 50% trở xuống thì các từ chưa được xác nhận sẽ quay lại học từ đầu. Hết từ mới ở cấp đang học thì app tự
                mở cấp tiếp theo.
              </p>
            </div>
          </div>

          {alreadyMet > 0 && (
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 italic">
              * {alreadyMet} từ bạn đã học thật trước đây sẽ được giữ nguyên lịch ôn tập hiện tại, không bị ghi đè.
            </p>
          )}
        </div>

        {/* Option to automatically open the next level */}
        {canAdvance && nextLevel && (
          <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/50 dark:bg-cyan-950/20 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoAdvance}
              disabled={busy}
              onChange={(e) => setAutoAdvance(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 shrink-0"
            />
            <div className="space-y-0.5 text-xs text-slate-700 dark:text-zinc-200">
              <span className="font-semibold text-slate-900 dark:text-white">
                Mở thêm cấp {nextLevel} · {LEVEL_NAMES[nextLevel]} vào lộ trình học
              </span>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Sau khi bỏ qua cấp {level}, bạn có thể bắt đầu nhận từ mới của cấp {nextLevel} ngay từ buổi học tiếp theo.
              </p>
            </div>
          </label>
        )}

        {/* Progress Bar while working */}
        {busy && progressStatus && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                Đang xử lý {progressStatus.done}/{progressStatus.total} từ...
              </span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{progressPercent}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-150 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex max-md:flex-wrap items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="max-md:min-h-10 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || countToMark === 0}
            className="inline-flex items-center max-md:justify-center gap-2 max-md:min-h-10 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {countToMark === 0
              ? "Đã học hết cấp này"
              : `Xác nhận đánh dấu ${countToMark.toLocaleString("vi-VN")} từ`}
          </button>
        </div>
      </div>
    </div>
  );
}
