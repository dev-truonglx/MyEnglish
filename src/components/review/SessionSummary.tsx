import { useEffect, useState, type ReactNode } from "react";
import { AlarmClock, Award, CalendarCheck, Check, RotateCcw, Sparkles, Zap } from "lucide-react";
import type { FSRSResult } from "@/services/srs";
import type { WordDetail, ReviewCard } from "@/types/database";
import type { XPState } from "@/services/smartReview";
import type { SessionStats } from "@/hooks/useReviewSession";
import { loadWorkloadForecast } from "@/services/progress";
import { minutesFor } from "@/services/comeback";
import { isSimpleMode } from "@/services/learnerProfile";
import { dayCloseStatus, nextReviewText, type NextReview } from "@/services/dayClose";
import { RankDelta } from "../dashboard/RankWidgets";

interface SessionSummaryProps {
  wordsToReview: Array<WordDetail | ReviewCard>;
  sessionStats: SessionStats;
  reviewCount: number;
  xpState: XPState;
  lastResult: FSRSResult | null;
  onFinish: () => void;
  /** "Ôn lại N từ vừa sai": practise the words missed in this session right away (absent: no button) */
  onRetryMissed?: (wordIds: string[]) => void;
  /** Shown under the title (the focus session's own results) */
  header?: ReactNode;
  /** XP earned outside the answers (focus session bonus), added to the total shown */
  bonusXp?: number;
  /** When the next card comes due (undefined: the header already says it, e.g. a focus session) */
  nextReview?: NextReview | null;
}

const HEADLINES = {
  high: ["Rất tốt! Bạn nhớ được gần hết 🌟", "Phiên học rất chắc tay 🌟", "Gần như không sót từ nào 👏"],
  mid: ["Tốt lắm, bạn đang tiến bộ đều 🎯", "Hơn một nửa đã nhớ được, cứ thế mà tiến 🎯", "Đều tay lắm, trí nhớ đang chắc dần 💡"],
  low: ["Phiên này hơi khó, và như vậy là bình thường 💪", "Từ khó thì cần gặp thêm vài lần 💪", "Học từ khó là lúc não làm việc nhiều nhất 💪"],
};

/** Missed words listed by name on the summary (the count says the rest) */
const MISSED_SHOWN = 8;

/**
 * End of a session. Starts with what went well (remembered, new words met, words now in long-term
 * memory), presents the words to revisit as normal ("they come back soon"), and closes the day: a loud
 * "Hôm nay xong ✓" once the daily goal is reached (the learner knows they may stop), the next review and
 * tomorrow's workload. No red error counts.
 */
export default function SessionSummary({
  wordsToReview,
  sessionStats,
  reviewCount,
  xpState,
  lastResult,
  onFinish,
  onRetryMissed,
  header,
  bonusXp = 0,
  nextReview,
}: SessionSummaryProps) {
  const simple = isSimpleMode();
  const [tomorrow, setTomorrow] = useState<number | null>(null);
  useEffect(() => {
    loadWorkloadForecast(2)
      .then((f) => setTomorrow(f.days[1]?.reviews ?? 0))
      .catch(() => setTomorrow(null));
  }, []);

  const day = sessionStats.day;
  const close = day ? dayCloseStatus({ goalReached: day.goalReached, todayCount: day.todayCount, dailyGoal: day.dailyGoal, dueNow: day.dueLeft }) : null;
  const remembered = sessionStats.firstTryCorrect + sessionStats.retryCorrect;
  const newWords = wordsToReview.filter((w) => (w.srs?.reps ?? 0) === 0).length;
  const comingBack = sessionStats.revealedCount + sessionStats.skippedCount;
  const missed = sessionStats.missedWords ?? [];
  const totalWords = wordsToReview.length || 1;
  const rememberedShare = remembered / totalWords;

  // A few wordings per tier, picked by the session's size: the same three lines every time read like a template
  const tier = rememberedShare >= 0.8 ? HEADLINES.high : rememberedShare >= 0.5 ? HEADLINES.mid : HEADLINES.low;
  const headline = tier[reviewCount % tier.length];
  const headlineNote =
    rememberedShare >= 0.5
      ? "Mỗi lần nhớ lại được là trí nhớ chắc thêm một chút."
      : "Những từ chưa nhớ sẽ quay lại sớm. Gặp lại vài lần là não tự ghi nhớ, đó chính là cách học này hoạt động.";

  return (
    <div className="w-full flex-1 min-h-0 overflow-y-auto flex flex-col">
      <div className="flex flex-col items-center p-6 md:p-8 max-w-xl mx-auto text-center space-y-5 my-auto animate-in zoom-in-95 duration-200 w-full py-8">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center text-white shadow-xl shadow-emerald-500/20">
          <Award className="w-8 h-8" />
        </div>

      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          {sessionStats.endedEarly ? "Tạm dừng phiên học" : "Xong phiên học! 🎉"}
        </h2>
        <p className="text-sm text-slate-600 dark:text-zinc-400">
          Bạn vừa học <span className="text-emerald-600 dark:text-emerald-400 font-bold">{reviewCount}</span> câu.
          {sessionStats.endedEarly && sessionStats.endedEarly.cardsLeft > 0 && (
            <span className="block text-xs mt-0.5">
              Các câu đã trả lời đều được lưu. {sessionStats.endedEarly.cardsLeft} thẻ còn lại vẫn chờ ở lần ôn tới.
            </span>
          )}
        </p>
        {sessionStats.day && (
          <p className="text-sm font-semibold text-orange-700 dark:text-orange-300">
            🔥 Chuỗi {sessionStats.day.streak} ngày · {sessionStats.day.todayCount}/{sessionStats.day.dailyGoal} câu hôm nay
            {sessionStats.day.goalReachedNow && (
              <span className="block text-xs font-medium text-emerald-700 dark:text-emerald-400">Bạn vừa đạt mục tiêu hôm nay!</span>
            )}
          </p>
        )}
      </div>

      {close?.done && (
        // Loud on purpose: the learner must know for sure they can stop for today
        <div className="w-full rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-4 text-left space-y-2.5 shadow-lg shadow-emerald-600/20" data-testid="day-done">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-white/20 ring-4 ring-white/30 flex items-center justify-center shrink-0">
              <Check className="w-6 h-6" strokeWidth={3} />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-extrabold tracking-tight">{close.title}</p>
              <p className="text-sm text-emerald-50">{close.note}</p>
            </div>
          </div>
          {nextReview !== undefined && (
            <p className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold">
              <AlarmClock className="w-4 h-4 shrink-0" />
              {nextReviewText(nextReview)}
            </p>
          )}
        </div>
      )}

      {header}

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

      {/* The words missed: read them once more now, or practise them right away */}
      {missed.length > 0 && (
        <div className="w-full p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-left space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-900 dark:text-white">Từ cần xem lại</span>
            <span className="text-xs text-slate-500 dark:text-zinc-400">sẽ quay lại sớm</span>
          </div>
          <ul className="space-y-1.5">
            {missed.slice(0, MISSED_SHOWN).map((m) => (
              <li key={m.id} className="flex items-baseline gap-2 text-sm min-w-0">
                <span className="font-semibold text-slate-900 dark:text-white shrink-0">{m.word}</span>
                <span className="text-slate-500 dark:text-zinc-400 truncate">{m.meaning}</span>
              </li>
            ))}
          </ul>
          {missed.length > MISSED_SHOWN && (
            <p className="text-xs text-slate-500 dark:text-zinc-400">và {missed.length - MISSED_SHOWN} từ khác</p>
          )}
          {onRetryMissed && (
            <button
              onClick={() => onRetryMissed(missed.map((m) => m.id))}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-500/10 text-cyan-800 dark:text-cyan-200 text-sm font-semibold hover:bg-cyan-100 dark:hover:bg-cyan-500/20"
            >
              <RotateCcw className="w-4 h-4" /> Ôn lại {missed.length} từ này ngay (luyện thêm)
            </button>
          )}
        </div>
      )}

      {/* Close the day */}
      <div className="w-full p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-left flex items-start gap-3">
        <CalendarCheck className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
        <div className="text-sm text-slate-700 dark:text-zinc-300 space-y-1">
          {close && !close.done && <p className="font-semibold text-slate-900 dark:text-white">{close.note}</p>}
          {!close?.done && nextReview !== undefined && <p className="font-semibold">{nextReviewText(nextReview)}</p>}
          <p>
          {tomorrow === null
            ? "Hẹn gặp lại lần ôn tới."
            : tomorrow > 0
              ? `Hẹn mai: ${tomorrow} thẻ, khoảng ${minutesFor(tomorrow)} phút. App sẽ nhắc đúng lúc.`
              : "Mai chưa có thẻ nào đến hạn. Học thêm từ mới nếu bạn muốn."}
          </p>
        </div>
      </div>

      {/* XP */}
      <div className="w-full p-3.5 rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/40 dark:to-yellow-950/40 text-left space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
            <Zap className="w-4 h-4" /> Điểm kinh nghiệm
          </span>
          <span className="text-lg font-extrabold font-mono text-amber-600 dark:text-amber-400">+{sessionStats.totalXPEarned + bonusXp} XP</span>
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

      <RankDelta />

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
  </div>
  );
}
