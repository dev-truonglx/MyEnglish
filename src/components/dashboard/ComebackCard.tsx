import { Play, PartyPopper, Sunrise, CheckCircle } from "lucide-react";
import { minutesFor, type ComebackStatus } from "@/services/comeback";

interface ComebackCardProps {
  comeback: ComebackStatus;
  onStart: () => void;
}

/** Review tab after a break: today's share of the backlog instead of the whole pile */
export default function ComebackCard({ comeback, onStart }: ComebackCardProps) {
  const { plan, dayNumber, daysLeft, todayDone, todayRemaining, backlog, caughtUp } = comeback;

  if (caughtUp) {
    return (
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-6 space-y-2 shadow-sm">
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold">
          <PartyPopper className="w-5 h-5" />
          <span>Đã bắt kịp sau {dayNumber} ngày!</span>
        </div>
        <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80">
          Không còn thẻ tồn đọng sau {plan.missedDays} ngày nghỉ. Từ mới đã được mở lại như bình thường.
        </p>
      </div>
    );
  }

  const shareDone = Math.min(plan.dailyQuota, todayDone);
  const percent = Math.round((shareDone / plan.dailyQuota) * 100);
  const doneToday = todayRemaining === 0;

  return (
    <div className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-gradient-to-r dark:from-zinc-900 dark:via-zinc-900/90 dark:to-zinc-950 p-6 space-y-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <span className="text-[11px] font-mono text-amber-700 dark:text-amber-400 uppercase tracking-wider block">
            Kế hoạch quay lại · ngày {dayNumber}
          </span>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            {dayNumber === 1 && todayDone === 0 ? "Chào mừng bạn quay lại 👋" : doneToday ? "Xong phần hôm nay" : "Tiếp tục phần hôm nay"}
          </h3>
          <p className="text-xs text-slate-600 dark:text-zinc-400 max-w-md">
            Bạn đã nghỉ {plan.missedDays} ngày nên có {backlog} thẻ đang chờ. Không cần làm hết một lúc: FSRS đã xếp
            những thẻ dễ quên nhất lên trước, và mỗi ngày chỉ cần một phần.
          </p>
        </div>
        <div className="w-12 h-12 shrink-0 rounded-2xl bg-amber-100 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
          <Sunrise className="w-6 h-6" />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-zinc-400">
          <span>
            Hôm nay: {shareDone}/{plan.dailyQuota} thẻ
          </span>
          <span>{doneToday ? `Còn khoảng ${daysLeft} ngày nữa là bắt kịp` : `Khoảng ${daysLeft} ngày để bắt kịp`}</span>
        </div>
        <div className="h-2 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-[11px] text-slate-500 dark:text-zinc-500">Từ mới tạm dừng cho đến khi bắt kịp.</p>
      </div>

      {doneToday ? (
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
            <CheckCircle className="w-4 h-4" />
            <span>Phần còn lại để mai, khoảng {Math.min(plan.dailyQuota, backlog)} thẻ.</span>
          </div>
          <button
            onClick={onStart}
            className="py-2 px-3 rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-medium transition-colors"
          >
            Ôn thêm
          </button>
        </div>
      ) : (
        <button
          onClick={onStart}
          className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 !text-white text-xs font-semibold shadow-lg shadow-orange-500/20 transition-all"
        >
          <Play className="w-4 h-4 fill-white" />
          <span>
            Ôn {todayRemaining} thẻ hôm nay (~{minutesFor(todayRemaining)} phút)
          </span>
        </button>
      )}
    </div>
  );
}
