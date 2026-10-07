import { Award, TrendingUp, Zap } from "lucide-react";
import type { FSRSResult } from "@/services/srs";
import type { WordDetail, ReviewCard } from "@/types/database";
import type { XPState } from "@/services/smartReview";
import type { SessionStats } from "@/hooks/useReviewSession";

interface SessionSummaryProps {
  wordsToReview: Array<WordDetail | ReviewCard>;
  sessionStats: SessionStats;
  reviewCount: number;
  xpState: XPState;
  lastResult: FSRSResult | null;
  onFinish: () => void;
}

/** Session Completed view with Learning Evaluation Metrics */
export default function SessionSummary({
  wordsToReview,
  sessionStats,
  reviewCount,
  xpState,
  lastResult,
  onFinish,
}: SessionSummaryProps) {
  const totalWords = wordsToReview.length || 1; // unique words (re-queued cards are not double counted)
  const masteryPercent = Math.min(
    100,
    Math.round(
      ((sessionStats.firstTryCorrect * 1 + sessionStats.retryCorrect * 0.65) / totalWords) * 100
    )
  );

  let evaluationTitle = "Xuất sắc! Nhớ được gần hết ngay lần đầu 🌟";
  let evaluationDesc = "Bạn đã nhớ và gõ chính xác hầu hết từ vựng ngay từ lần đầu tiên.";
  let evaluationBadge = "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300";

  if (masteryPercent < 50) {
    evaluationTitle = "Cần củng cố thêm từ vựng 📚";
    evaluationDesc = "Nhiều từ cần xem lại hoặc thử lại. Hệ thống FSRS sẽ tối ưu lịch lặp lại sớm để giúp bạn ghi nhớ sâu.";
    evaluationBadge = "bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300";
  } else if (masteryPercent < 80) {
    evaluationTitle = "Khá tốt! Phản xạ từ vựng ổn định 🎯";
    evaluationDesc = "Bạn đã hoàn thành tốt các câu hỏi sau một vài lần thử hoặc xem gợi ý.";
    evaluationBadge = "bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300";
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 max-w-xl mx-auto text-center space-y-5 animate-in zoom-in-95 duration-200">
      <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center text-white shadow-xl shadow-emerald-500/20">
        <Award className="w-8 h-8" />
      </div>

      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Phiên ôn tập hoàn tất! 🎉
        </h2>
        <p className="text-xs text-slate-600 dark:text-zinc-400">
          Bạn đã ôn tập thành công <span className="text-emerald-600 dark:text-emerald-400 font-bold">{reviewCount}</span> từ vựng.
        </p>
      </div>

      {/* What this session did for long-term memory */}
      {(sessionStats.masteredWords.length > 0 || sessionStats.rescuedCount > 0) && (
        <div className="w-full p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 text-left space-y-1.5">
          {sessionStats.masteredWords.length > 0 && (
            <div className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
              🎉 {sessionStats.masteredWords.length} từ vào trí nhớ dài hạn: {sessionStats.masteredWords.join(", ")}
            </div>
          )}
          {sessionStats.rescuedCount > 0 && (
            <div className="text-xs text-emerald-700 dark:text-emerald-300">
              🧠 Cứu kịp {sessionStats.rescuedCount} từ đang phai dần — đây là những lượt ôn giá trị nhất.
            </div>
          )}
        </div>
      )}

      {/* Learning Evaluation Card */}
      <div className={`w-full p-4 rounded-2xl border text-left space-y-2 ${evaluationBadge}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 font-mono">
            <TrendingUp className="w-4 h-4" />
            Đánh giá mức độ ghi nhớ
          </span>
          <span className="text-base font-extrabold font-mono">
            {masteryPercent}%
          </span>
        </div>
        <div className="text-sm font-bold text-slate-900 dark:text-white">
          {evaluationTitle}
        </div>
        <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
          {evaluationDesc}
        </p>
      </div>

      {/* Detailed Breakdown Scorecard */}
      <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-2 text-left">
        <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
          <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Đúng lần đầu</div>
          <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
            {sessionStats.firstTryCorrect} <span className="text-[10px] text-slate-400 font-normal">từ</span>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
          <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Đúng sau thử lại</div>
          <div className="text-base font-bold text-blue-600 dark:text-blue-400 font-mono">
            {sessionStats.retryCorrect} <span className="text-[10px] text-slate-400 font-normal">từ</span>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
          <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Xem đáp án</div>
          <div className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono">
            {sessionStats.revealedCount} <span className="text-[10px] text-slate-400 font-normal">từ</span>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
          <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Bỏ qua / Sai</div>
          <div className="text-base font-bold text-slate-700 dark:text-zinc-300 font-mono">
            {sessionStats.skippedCount} <span className="text-[10px] text-slate-400 font-normal">từ</span>
          </div>
        </div>
      </div>

      {sessionStats.totalWrongAttempts > 0 && (
        <div className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
          Tổng số lần nhập sai trong phiên: <span className="text-rose-500 font-bold">{sessionStats.totalWrongAttempts}</span> lần
        </div>
      )}

      {/* XP Earned Summary */}
      <div className="w-full p-4 rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/40 dark:to-yellow-950/40 text-left space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 font-mono text-amber-800 dark:text-amber-300">
            <Zap className="w-4 h-4" />
            XP Earned
          </span>
          <span className="text-lg font-extrabold font-mono text-amber-600 dark:text-amber-400">
            +{sessionStats.totalXPEarned} XP
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono text-amber-700 dark:text-amber-300">
            <span>{xpState.rankEmoji}</span>
            <span className="font-semibold">Level {xpState.level}</span>
            <span className="text-amber-500">({xpState.rank})</span>
          </div>
          <div className="flex-1 h-2 rounded-full bg-amber-200/50 dark:bg-amber-900/40 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full transition-all duration-500"
              style={{ width: `${xpState.progressPercent}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
            {xpState.currentLevelXP}/{xpState.nextLevelXP}
          </span>
        </div>
        {sessionStats.leechesSlain > 0 && (
          <div className="text-xs font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
            🗡️ Leech Slayer! Đã chinh phục <span className="font-bold">{sessionStats.leechesSlain}</span> từ khó
          </div>
        )}
      </div>

      {lastResult && (
        <div className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-300 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Độ bền (S)</div>
            <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400 font-mono">{lastResult.stability}d</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Độ khó (D)</div>
            <div className="text-sm font-bold text-amber-600 dark:text-amber-400 font-mono">{lastResult.difficulty}/10</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Chu kỳ tới</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white font-mono">{lastResult.interval}d</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Số lần ôn</div>
            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">{lastResult.repetitions}</div>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onFinish}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 !text-white text-xs font-semibold shadow-lg shadow-cyan-500/25 transition-all"
        >
          Quay lại Thư viện từ
        </button>
      </div>
    </div>
  );
}
