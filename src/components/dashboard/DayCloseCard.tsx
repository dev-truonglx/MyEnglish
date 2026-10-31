import { useEffect, useState } from "react";
import { AlarmClock, ArrowRight, Check, Flame, Timer } from "lucide-react";
import type { StreakStats } from "@/services/streak";
import { loadWorkloadForecast } from "@/services/progress";
import { minutesFor } from "@/services/comeback";
import { dayCloseStatus, nextReviewText, type NextReview } from "@/services/dayClose";
import type { NextStep } from "./todayPlan";

/** The daily goal as a ring that fills up */
function GoalRing({ percent, reached }: { percent: number; reached: boolean }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-emerald-100 dark:stroke-emerald-950" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p / 100)}
          className="stroke-emerald-500 transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {reached ? (
          <Check className="w-6 h-6 text-emerald-600 dark:text-emerald-400" strokeWidth={3} />
        ) : (
          <span className="text-xs font-bold text-slate-700 dark:text-zinc-200">{p}%</span>
        )}
      </div>
    </div>
  );
}

interface DayCloseCardProps {
  streakStats: StreakStats;
  /** Learning cards that come due later today */
  laterToday: number;
  /** Hour of the day ("Tối nay" in the evening, "Lát nữa" before) */
  hour: number;
  nextStep: NextStep;
  onNextStep: (step: NextStep) => void;
  /** Nothing studied today yet: the one button is the 3-card session instead */
  onQuickStart: () => void;
  /** A quiet link for more ("Học thêm từ mới", "Ôn thêm thẻ tồn"...) */
  more: { label: string; onClick: () => void } | null;
  /** When the next card comes due, and about how many */
  nextReview: NextReview | null;
  /** Cards due right now (new ones included) */
  dueNow: number;
  /** Fixed clock for previews */
  now?: Date;
}

/**
 * Everything on today's list is done: close the day. Once the goal is reached, a loud "Hôm nay xong ✓" says the
 * learner may stop, with the exact next review ("Lượt ôn tới: 14:30, khoảng 6 thẻ"). Then the streak, what
 * tomorrow holds, and exactly one light next step.
 */
export default function DayCloseCard({
  streakStats,
  laterToday,
  hour,
  nextStep,
  onNextStep,
  onQuickStart,
  more,
  nextReview,
  dueNow,
  now,
}: DayCloseCardProps) {
  const [tomorrow, setTomorrow] = useState<number | null>(null);
  useEffect(() => {
    loadWorkloadForecast(2)
      .then((f) => setTomorrow(f.days[1]?.reviews ?? 0))
      .catch(() => setTomorrow(null));
  }, [streakStats.todayCount]);

  const studied = streakStats.todayCount > 0;
  const reached = streakStats.goalReached;
  const status = dayCloseStatus({ goalReached: reached, todayCount: streakStats.todayCount, dailyGoal: streakStats.dailyGoal, dueNow });
  const tomorrowLine =
    tomorrow === null
      ? null
      : tomorrow > 0
        ? `Mai ~${tomorrow} thẻ, ~${minutesFor(tomorrow)} phút.`
        : "Mai chưa có thẻ nào đến hạn.";
  const streakLine = (
    <>
      <Flame className="w-4 h-4 text-orange-500" />
      <span className="font-semibold">Chuỗi {streakStats.currentStreak} ngày</span>
      <span className="opacity-50">·</span>
      <span>
        {streakStats.todayCount}/{streakStats.dailyGoal} câu {reached ? "(đạt mục tiêu)" : "hôm nay"}
      </span>
    </>
  );

  return (
    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-zinc-900 shadow-sm overflow-hidden">
      {status.done ? (
        // The loud part: the learner must know for sure they can stop
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-4 md:p-5 space-y-3" data-testid="day-done">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/20 ring-4 ring-white/30 flex items-center justify-center shrink-0">
              <Check className="w-8 h-8" strokeWidth={3} />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-extrabold tracking-tight">{status.title}</p>
              <p className="text-sm text-emerald-50">{status.note}</p>
            </div>
          </div>
          <p className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold">
            <AlarmClock className="w-4 h-4 shrink-0" />
            {nextReviewText(nextReview, now)}
          </p>
        </div>
      ) : (
        <div className="p-4 pb-0 md:p-5 md:pb-0 flex items-center gap-4">
          <GoalRing percent={streakStats.goalPercentage} reached={reached} />
          <div className="min-w-0 space-y-1">
            <p className="text-lg font-bold text-slate-900 dark:text-white">{status.title}</p>
            <p className="text-sm text-slate-700 dark:text-zinc-300">{status.note}</p>
          </div>
        </div>
      )}

      <div className="p-4 md:p-5 space-y-3">
        <p className="text-sm text-slate-700 dark:text-zinc-300 inline-flex items-center gap-1.5 flex-wrap">{streakLine}</p>
        {!status.done && (
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-zinc-100">
            <AlarmClock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            {nextReviewText(nextReview, now)}
          </p>
        )}
        <p className="text-sm text-slate-600 dark:text-zinc-300">
          {tomorrowLine ?? "Mai quay lại nhé, app sẽ nhắc đúng lúc cần ôn."}
          {laterToday > 0 && ` ${hour >= 17 ? "Tối nay" : "Lát nữa"} còn ~${laterToday} thẻ ôn lại cho chắc.`}
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {studied ? (
            <button
              onClick={() => onNextStep(nextStep)}
              className="max-md:min-h-10 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm font-semibold shadow-md shadow-emerald-600/20 inline-flex items-center gap-2 transition"
            >
              {nextStep.label} <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onQuickStart}
              className="max-md:min-h-10 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm font-semibold shadow-md shadow-emerald-600/20 inline-flex items-center gap-2 transition"
            >
              <Timer className="w-4 h-4" /> Chỉ 1 phút: ôn nhanh 3 thẻ
            </button>
          )}
          {more && (
            <button onClick={more.onClick} className="max-md:inline-flex max-md:items-center max-md:min-h-10 max-md:text-left text-xs font-medium text-slate-500 dark:text-zinc-400 hover:text-cyan-700 dark:hover:text-cyan-300 underline-offset-2 hover:underline">
              Muốn học thêm? {more.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
