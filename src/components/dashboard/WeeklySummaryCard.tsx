import { useEffect, useState } from "react";
import { CalendarDays, Lightbulb, X } from "lucide-react";
import { loadLastWeekSummary, type LastWeekSummary } from "@/services/progress";
import { readWeeklyCardMark, saveWeeklyCardMark, weeklyCardVisibility } from "./todayPlan";

/**
 * Last week in real numbers (words now remembered for the long run, days studied, true retention when there
 * are enough answers) and one piece of advice. Shown on the first day the app is opened in a new week; the
 * learner can hide it. Simple mode keeps one line.
 */
export default function WeeklySummaryCard({ simple, now }: { simple: boolean; now?: Date }) {
  const [visible, setVisible] = useState(false);
  const [summary, setSummary] = useState<LastWeekSummary | null>(null);
  const nowMs = now?.getTime();

  useEffect(() => {
    const at = nowMs !== undefined ? new Date(nowMs) : new Date();
    const { visible: show, next } = weeklyCardVisibility(readWeeklyCardMark(), at);
    if (next) saveWeeklyCardMark(next);
    setVisible(show);
    if (!show) return;
    let cancelled = false;
    loadLastWeekSummary(at)
      .then((s) => !cancelled && setSummary(s))
      .catch(() => !cancelled && setSummary(null));
    return () => {
      cancelled = true;
    };
  }, [nowMs]);

  if (!visible || !summary) return null;

  const hide = () => {
    const mark = readWeeklyCardMark();
    if (mark) saveWeeklyCardMark({ ...mark, dismissed: true });
    setVisible(false);
  };

  const parts = [
    `+${summary.rememberedLong} từ nhớ lâu${!simple && (summary.rememberedLongBefore > 0 || summary.rememberedLong > 0) ? ` (tuần trước nữa +${summary.rememberedLongBefore})` : ""}`,
    `${summary.activeDays}/7 ngày học`,
    !simple && summary.retention !== null ? `tỉ lệ nhớ ${Math.round(summary.retention * 100)}% (${summary.reviewAnswers} lượt)` : "",
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-violet-200 dark:border-violet-800/50 bg-violet-50/60 dark:bg-violet-950/20 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
            <CalendarDays className="w-4 h-4" /> Tuần trước của bạn
          </p>
          <p className="text-sm font-semibold text-slate-800 dark:text-zinc-100">{parts.join(" · ")}</p>
        </div>
        <button
          onClick={hide}
          title="Ẩn đến tuần sau"
          aria-label="Ẩn tóm tắt tuần"
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-white/70 dark:hover:bg-zinc-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-slate-600 dark:text-zinc-400 flex items-start gap-1.5">
        <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
        <span>{summary.suggestion}</span>
      </p>
    </div>
  );
}
