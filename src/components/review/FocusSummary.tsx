import { Timer, Plus, BookOpen, NotebookPen } from "lucide-react";
import type { FocusResult } from "@/services/focusSession";
import type { DashboardTab } from "../dashboard/shared";

interface FocusSummaryProps {
  result: FocusResult;
  /** When the next card comes due, and how many around then */
  next: { at: Date; count: number } | null;
  onExtend: () => void;
  onNavigate: (tab: DashboardTab) => void;
}

const time = (d: Date) => d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

/** The focus session's part of the summary: minutes, first-try rate, XP, the next review, "5 more minutes" */
export default function FocusSummary({ result, next, onExtend, onNavigate }: FocusSummaryProps) {
  const minutes = Math.max(1, Math.round(result.activeSec / 60));
  const firstTry = result.cards > 0 ? Math.round((result.firstTry / result.cards) * 100) : null;
  const left = result.plannedMin - Math.floor(result.activeSec / 60);
  const sameDay = next && next.at.toDateString() === new Date().toDateString();

  return (
    <div className="w-full p-4 rounded-2xl border border-violet-200 dark:border-violet-800/60 bg-violet-50 dark:bg-violet-950/30 text-left space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-violet-800 dark:text-violet-200">
        <Timer className="w-4 h-4" />
        {result.outcome === "completed" ? `Xong phiên tập trung ${minutes} phút` : `Đã học ${minutes} phút`}
        {result.xp > 0 && <span className="ml-auto text-amber-600 dark:text-amber-400 font-mono">+{result.xp} XP</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-900/60">
          <div className="text-xl font-bold text-violet-700 dark:text-violet-300">{minutes}</div>
          <div className="text-xs text-slate-500 dark:text-zinc-400">phút học thật</div>
        </div>
        <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-900/60">
          <div className="text-xl font-bold text-violet-700 dark:text-violet-300">{result.cards}</div>
          <div className="text-xs text-slate-500 dark:text-zinc-400">thẻ</div>
        </div>
        <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-900/60">
          <div className="text-xl font-bold text-violet-700 dark:text-violet-300">{firstTry == null ? "—" : `${firstTry}%`}</div>
          <div className="text-xs text-slate-500 dark:text-zinc-400">đúng ngay lần đầu</div>
        </div>
      </div>
      {next && (
        <p className="text-sm text-slate-700 dark:text-zinc-300">
          Lượt ôn tới: <b>{sameDay ? time(next.at) : `${time(next.at)} ${next.at.toLocaleDateString("vi-VN", { weekday: "long" })}`}</b>, khoảng {next.count} thẻ.
        </p>
      )}
      {result.endedBy === "queue" && left >= 1 && (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-600 dark:text-zinc-400">Hết thẻ để ôn và luyện thêm, còn {left} phút. Muốn dùng nốt?</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onNavigate("writing")}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 text-xs font-medium hover:bg-violet-100 dark:hover:bg-violet-900/40"
            >
              <NotebookPen className="w-3.5 h-3.5" /> Ôn lỗi sai
            </button>
            <button
              onClick={() => onNavigate("grammar")}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 text-xs font-medium hover:bg-violet-100 dark:hover:bg-violet-900/40"
            >
              <BookOpen className="w-3.5 h-3.5" /> Ôn ngữ pháp
            </button>
          </div>
        </div>
      )}
      {result.endedBy !== "queue" && (
        <button
          onClick={onExtend}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5" /> Thêm 5 phút
        </button>
      )}
    </div>
  );
}
