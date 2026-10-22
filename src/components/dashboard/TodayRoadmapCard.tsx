import { useCallback, useEffect, useState } from "react";
import { Layers, PartyPopper } from "lucide-react";
import { STUDY_LEVELS, type StudyLevel } from "@/services/vocabCatalog";
import {
  changeStudyLevels,
  getStudyLevels,
  isFeedExhausted,
  levelWeights,
  loadLevelProgress,
  suggestNextLevel,
  type LevelProgress,
  type NextLevelSuggestion,
} from "@/services/vocabFeed";
import { countNewWordsSince, estimateNewWordsPerDay, levelEtaDays, nextMetMilestone, startOfLocalWeek } from "@/services/progress";
import { getStudyLimits } from "@/services/srs";
import { useWordsStore } from "@/stores/wordsStore";

/** "~12 ngày", "~5 tuần" */
function formatEta(days: number): string {
  return days <= 21 ? `~${days} ngày` : `~${Math.round(days / 7)} tuần`;
}

interface TodayRoadmapCardProps {
  simple: boolean;
  /** A "Nhớ lâu" milestone to celebrate today (100 / 250 / 500 / 1000), or null */
  milestone: number | null;
  onOpenPath: () => void;
}

/**
 * The Oxford path on Today: per chosen level, words met and the next near milestone with the days to it at the
 * current pace ("A1: 120/911 từ · còn 30 từ tới mốc 150, ~15 ngày"; the whole level, months away at a 5-minute
 * pace, discouraged beginners on day one), this week's new words; a one-line celebration at "Nhớ lâu"
 * milestones; the next level when the chosen ones have no new word left (or are learnt well enough). Simple mode
 * shows the current level only.
 */
export default function TodayRoadmapCard({ simple, milestone, onOpenPath }: TodayRoadmapCardProps) {
  const [progress, setProgress] = useState<LevelProgress[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [weekNew, setWeekNew] = useState(0);
  const refreshWords = useWordsStore((s) => s.refreshWords);
  const reload = useCallback(() => {
    loadLevelProgress().then(setProgress).catch(() => setProgress(null));
    countNewWordsSince(startOfLocalWeek()).then(setWeekNew).catch(() => {});
  }, []);
  useEffect(() => {
    reload();
    window.addEventListener("words-changed", reload);
    window.addEventListener("myenglish-study-levels-changed", reload);
    return () => {
      window.removeEventListener("words-changed", reload);
      window.removeEventListener("myenglish-study-levels-changed", reload);
    };
  }, [reload]);

  if (!progress) return null;
  const levels = getStudyLevels();
  const chosen = progress.filter((p) => levels.includes(p.level));
  if (chosen.length === 0) return null;

  // The level mix shares the new words among the levels that still have some
  const open = chosen.filter((p) => p.total - p.met > 0);
  const weights = levelWeights(open.map((p) => p.level));
  const weightSum = [...weights.values()].reduce((a, b) => a + b, 0) || 1;
  const perDay = estimateNewWordsPerDay(getStudyLimits().newCardsPerDay);
  const shown = simple ? [open[0] ?? chosen[chosen.length - 1]] : chosen;

  const suggestion: NextLevelSuggestion | null =
    suggestNextLevel(progress, levels) ??
    (isFeedExhausted() === true ? { next: STUDY_LEVELS[levels.length] ?? null, reason: "exhausted" } : null);
  const nextLevel = suggestion?.next ?? null;

  const openNext = async (next: StudyLevel) => {
    setBusy(true);
    try {
      await changeStudyLevels([...levels, next]);
      refreshWords();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-zinc-200">
          <Layers className="w-4 h-4 text-cyan-500" /> Lộ trình từ vựng Oxford
        </span>
        <button onClick={onOpenPath} className="text-xs font-medium text-cyan-700 dark:text-cyan-300 hover:underline">
          Đổi cấp · Lướt từ đã biết
        </button>
      </div>

      <div className="space-y-2.5">
        {shown.map((p) => {
          const remaining = p.total - p.met;
          const goal = nextMetMilestone(p.met, p.total);
          const toGo = goal === null ? 0 : goal - p.met;
          const eta = levelEtaDays(toGo, perDay, (weights.get(p.level) ?? 0) / weightSum);
          const pct = (n: number) => `${Math.min(100, Math.round((n * 100) / Math.max(1, p.total)))}%`;
          return (
            <div key={p.level} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-800 dark:text-zinc-200">
                  {p.level}: {p.met}/{p.total} từ
                  {p.remembered > 0 && <span className="font-normal text-slate-500 dark:text-zinc-400"> · {p.remembered} nhớ lâu</span>}
                </span>
                <span className="text-slate-500 dark:text-zinc-400 text-right">
                  {remaining <= 0 || goal === null
                    ? "Đã gặp hết ✓"
                    : goal >= p.total
                      ? `còn ${toGo} từ là gặp hết, ${formatEta(eta)}`
                      : `còn ${toGo} từ tới mốc ${goal}, ${formatEta(eta)}`}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-cyan-300 dark:bg-cyan-800" style={{ width: pct(p.met) }} />
                <div className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: pct(p.remembered) }} />
              </div>
            </div>
          );
        })}
      </div>

      {weekNew > 0 && (
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Tuần này: <span className="font-semibold text-cyan-700 dark:text-cyan-300">+{weekNew} từ mới</span>
        </p>
      )}

      {milestone !== null && (
        <p className="flex items-start gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
          <PartyPopper className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            <span className="font-semibold">Mốc mới: {milestone} từ nhớ lâu!</span> Những từ này đã vào trí nhớ dài hạn, ít nhất 3 tuần
            nữa mới cần ôn lại.
          </span>
        </p>
      )}

      {suggestion && (
        <div
          className={`rounded-lg border p-3 space-y-2 text-xs ${
            suggestion.reason === "exhausted"
              ? "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200"
              : "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
          }`}
        >
          <p>
            {suggestion.reason === "exhausted"
              ? suggestion.next
                ? `Bạn đã nhận hết từ mới của ${levels.join(", ")}. Từ đã nhận vẫn được ôn như thường; mở thêm ${suggestion.next} để có từ mới mỗi ngày.`
                : "Bạn đã nhận hết từ của bộ Oxford. Các từ đã nhận vẫn được ôn như bình thường."
              : `Bạn đã gặp phần lớn từ ${levels.join(", ")} và nhớ lâu được hơn một nửa. Sẵn sàng học thêm cấp ${suggestion.next}.`}
          </p>
          {nextLevel && (
            <button
              onClick={() => openNext(nextLevel)}
              disabled={busy}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold"
            >
              Mở thêm {nextLevel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
