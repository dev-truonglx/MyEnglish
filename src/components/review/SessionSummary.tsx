import { useEffect, useState } from "react";
import { Award, CalendarCheck, RotateCcw, Sparkles, Zap } from "lucide-react";
import type { FSRSResult } from "@/services/srs";
import type { WordDetail, ReviewCard } from "@/types/database";
import type { XPState } from "@/services/smartReview";
import type { SessionStats } from "@/hooks/useReviewSession";
import { loadWorkloadForecast } from "@/services/progress";
import { minutesFor } from "@/services/comeback";
import { isSimpleMode } from "@/services/learnerProfile";

interface SessionSummaryProps {
  wordsToReview: Array<WordDetail | ReviewCard>;
  sessionStats: SessionStats;
  reviewCount: number;
  xpState: XPState;
  lastResult: FSRSResult | null;
  onFinish: () => void;
}

/**
 * End of a session. Starts with what went well (remembered, new words met, words now in long-term
 * memory), presents the words to revisit as normal ("they come back soon"), and closes the day with
 * tomorrow's workload. No red error counts.
 */
export default function SessionSummary({
  wordsToReview,
  sessionStats,
  reviewCount,
  xpState,
  lastResult,
  onFinish,
}: SessionSummaryProps) {
  const simple = isSimpleMode();
  const [tomorrow, setTomorrow] = useState<number | null>(null);
  useEffect(() => {
    loadWorkloadForecast(2)
      .then((f) => setTomorrow(f.days[1]?.reviews ?? 0))
      .catch(() => setTomorrow(null));
  }, []);

  const remembered = sessionStats.firstTryCorrect + sessionStats.retryCorrect;
  const newWords = wordsToReview.filter((w) => (w.srs?.reps ?? 0) === 0).length;
  const comingBack = sessionStats.revealedCount + sessionStats.skippedCount;
  const totalWords = wordsToReview.length || 1;
  const rememberedShare = remembered / totalWords;

  const headline =
    rememberedShare >= 0.8
      ? "Rất tốt! Bạn nhớ được gần hết 🌟"
      : rememberedShare >= 0.5
        ? "Tốt lắm, bạn đang tiến bộ đều 🎯"
        : "Phiên này hơi khó, và như vậy là bình thường 💪";
  const headlineNote =
    rememberedShare >= 0.5
      ? "Mỗi lần nhớ lại được là trí nhớ chắc thêm một chút."
      : "Những từ chưa nhớ sẽ quay lại sớm. Gặp lại vài lần là não tự ghi nhớ, đó chính là cách học này hoạt động.";

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-xl mx-auto text-center space-y-5 animate-in zoom-in-95 duration-200">
      <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center text-white shadow-xl shadow-emerald-500/20">
        <Award className="w-8 h-8" />
      </div>

      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Xong phiên học! 🎉</h2>
        <p className="text-sm text-slate-600 dark:text-zinc-400">
          Bạn vừa học <span className="text-emerald-600 dark:text-emerald-400 font-bold">{reviewCount}</span> câu.
        </p>
      </div>

      {/* What went well, first */}
      <div className="w-full p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 text-left space-y-2">
        <div className="text-base font-bold text-emerald-800 dark:text-emerald-200">{headline}</div>
        <p className="text-sm text-slate-700 dark:text-zinc-300">{headlineNote}</p>
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-900/60">
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{remembered}</div>
            <div className="text-xs text-slate-500 dark:text-zinc-400">từ nhớ được</div>
          </div>
          <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-900/60">
            <div className="text-xl font-bold text-cyan-600 dark:text-cyan-400">{newWords}</div>
            <div className="text-xs text-slate-500 dark:text-zinc-400">từ mới đã gặp</div>
          </div>
          <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-900/60">
            <div className="text-xl font-bold text-slate-700 dark:text-zinc-200">{comingBack}</div>
            <div className="text-xs text-slate-500 dark:text-zinc-400">từ sẽ quay lại sớm</div>
          </div>
        </div>
        {sessionStats.masteredWords.length > 0 && (
          <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            🎉 {sessionStats.masteredWords.length} từ vào trí nhớ dài hạn: {sessionStats.masteredWords.join(", ")}
          </div>
        )}
        {sessionStats.rescuedCount > 0 && (
          <div className="text-xs text-emerald-700 dark:text-emerald-300">
            🧠 Nhớ lại kịp {sessionStats.rescuedCount} từ đang phai dần: đây là những lượt ôn giá trị nhất.
          </div>
        )}
        {sessionStats.leechesSlain > 0 && (
          <div className="text-xs text-emerald-700 dark:text-emerald-300">
            💪 Nhớ được {sessionStats.leechesSlain} từ trước đây hay quên.
          </div>
        )}
      </div>

      {/* Close the day */}
      <div className="w-full p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-left flex items-start gap-3">
        <CalendarCheck className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
        <div className="text-sm text-slate-700 dark:text-zinc-300">
          {tomorrow === null
            ? "Hẹn gặp lại lần ôn tới."
            : tomorrow > 0
              ? `Hẹn mai: ${tomorrow} thẻ, khoảng ${minutesFor(tomorrow)} phút. App sẽ nhắc đúng lúc.`
              : "Mai chưa có thẻ nào đến hạn. Học thêm từ mới nếu bạn muốn."}
        </div>
      </div>

      {/* XP */}
      <div className="w-full p-3.5 rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/40 dark:to-yellow-950/40 text-left space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
            <Zap className="w-4 h-4" /> Điểm kinh nghiệm
          </span>
          <span className="text-lg font-extrabold font-mono text-amber-600 dark:text-amber-400">+{sessionStats.totalXPEarned} XP</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
            <span>{xpState.rankEmoji}</span>
            <span className="font-semibold">Cấp {xpState.level}</span>
            <span className="text-amber-500">({xpState.rank})</span>
          </div>
          <div className="flex-1 h-2 rounded-full bg-amber-200/50 dark:bg-amber-900/40 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full transition-all duration-500"
              style={{ width: `${xpState.progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {!simple && lastResult && (
        <div className="w-full p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-400 flex flex-wrap justify-between gap-2 font-mono">
          <span>Thẻ cuối: S={lastResult.stability}d</span>
          <span>D={lastResult.difficulty}/10</span>
          <span>Chu kỳ {lastResult.interval}d</span>
          <span>{lastResult.repetitions} lần ôn</span>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          onClick={onFinish}
          autoFocus
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 !text-white text-sm font-semibold shadow-lg shadow-cyan-500/25 transition-all inline-flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" /> Hoàn tất
        </button>
        {comingBack > 0 && (
          <span className="self-center text-xs text-slate-500 dark:text-zinc-400 inline-flex items-center gap-1">
            <RotateCcw className="w-3.5 h-3.5" /> Từ chưa nhớ đã được hẹn lại
          </span>
        )}
      </div>
    </div>
  );
}
