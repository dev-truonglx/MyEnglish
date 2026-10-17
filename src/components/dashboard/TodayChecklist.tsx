import { AlarmClock, AudioLines, BookOpen, Check, CheckCircle2, ChevronRight, Circle, Crosshair, Flame, GraduationCap, Play, Timer } from "lucide-react";
import type { TodayTask, TodayTaskId } from "./todayPlan";

const TASK_ICON: Record<TodayTaskId, typeof BookOpen> = {
  vocab: BookOpen,
  grammar: GraduationCap,
  pronunciation: AudioLines,
};

/** What the main button says for the first thing not done yet */
function primaryLabel(task: TodayTask, first: boolean): string {
  if (task.id === "vocab") return `Học hôm nay (~${task.minutes} phút)`;
  const what = task.id === "grammar" ? "1 bài ngữ pháp" : "Phát âm";
  return `${first ? "" : "Tiếp: "}${what} (~${task.minutes} phút)`;
}

interface TodayChecklistProps {
  tasks: TodayTask[];
  primary: TodayTask;
  /** Line above the list (e.g. the comeback plan) */
  heading: string;
  onRun: (task: TodayTask) => void;
  quickMode: "hidden" | "normal" | "urgent";
  onQuickStart: () => void;
  streak: number;
  /** Same words as a timed focus session (shown when the first thing to do is the words) */
  onFocus?: () => void;
  focusMinutes?: number;
  /** The daily goal is reached: what is left on the list is extra, and the learner may stop */
  goalReached?: boolean;
  /** "Lượt ôn tới: 14:30, khoảng 6 thẻ" */
  nextReviewLine?: string;
}

/**
 * Today as a short list (at most 3 things), each with its status, its minutes and a way straight into it.
 * One main button: the first thing not done yet. "Chỉ 1 phút" (3 cards) keeps the streak on a busy day.
 * Once the daily goal is reached, a green strip on top says so: the rest is optional, the learner may stop.
 */
export default function TodayChecklist({
  tasks,
  primary,
  heading,
  onRun,
  quickMode,
  onQuickStart,
  streak,
  onFocus,
  focusMinutes,
  goalReached = false,
  nextReviewLine,
}: TodayChecklistProps) {
  const left = tasks.filter((t) => !t.done);
  const minutesLeft = left.reduce((sum, t) => sum + t.minutes, 0);
  const firstIndex = tasks.indexOf(primary);

  return (
    <div className="rounded-2xl border border-cyan-200 dark:border-cyan-800/50 bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-950/40 dark:to-zinc-900 p-4 shadow-sm space-y-3">
      {goalReached && (
        <div className="-mx-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-3 py-2.5 flex items-center gap-3" data-testid="goal-reached">
          <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <Check className="w-5 h-5" strokeWidth={3} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Đạt mục tiêu hôm nay ✓ Dừng ở đây cũng được.</span>
            <span className="block text-xs text-emerald-50">
              {left.length > 0 ? "Phần còn lại bên dưới là thêm nếu bạn muốn." : null}
              {nextReviewLine && (
                <span className="inline-flex items-center gap-1 ml-1">
                  <AlarmClock className="w-3 h-3" /> {nextReviewLine}
                </span>
              )}
            </span>
          </span>
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-cyan-800 dark:text-cyan-300">{heading}</p>
        <p className="text-xs text-slate-500 dark:text-zinc-400 shrink-0">
          {tasks.length - left.length}/{tasks.length} việc · còn ~{minutesLeft} phút
        </p>
      </div>

      <ol className="space-y-1.5">
        {tasks.map((task) => {
          const Icon = TASK_ICON[task.id];
          const isPrimary = task === primary;
          const body = (
            <>
              {task.done ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
              ) : (
                <Circle className={`w-5 h-5 shrink-0 ${isPrimary ? "text-cyan-500" : "text-slate-300 dark:text-zinc-600"}`} />
              )}
              <Icon className={`w-4 h-4 shrink-0 ${task.done ? "text-slate-400 dark:text-zinc-500" : "text-cyan-600 dark:text-cyan-400"}`} />
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-semibold ${
                    task.done ? "text-slate-500 dark:text-zinc-400 line-through decoration-slate-300 dark:decoration-zinc-600" : "text-slate-800 dark:text-zinc-100"
                  }`}
                >
                  {task.title}
                </span>
                {task.detail && <span className="block text-xs text-slate-500 dark:text-zinc-400 truncate">{task.detail}</span>}
              </span>
              <span className="text-xs text-slate-500 dark:text-zinc-400 shrink-0">{task.done ? "Xong" : `~${task.minutes} phút`}</span>
              {!task.done && <ChevronRight className="w-4 h-4 shrink-0 text-slate-400 dark:text-zinc-500" />}
            </>
          );
          return (
            <li key={task.id}>
              {task.done ? (
                <div className="flex items-center gap-3 rounded-xl px-3 py-2 bg-white/50 dark:bg-zinc-900/30">{body}</div>
              ) : (
                <button
                  onClick={() => onRun(task)}
                  className={`w-full text-left flex items-center gap-3 rounded-xl px-3 py-2 border transition ${
                    isPrimary
                      ? "bg-white dark:bg-zinc-900 border-cyan-300 dark:border-cyan-700/70"
                      : "bg-white/70 dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800 hover:border-cyan-300 dark:hover:border-cyan-700"
                  }`}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onRun(primary)}
          autoFocus
          className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 active:scale-[0.98] text-white text-sm font-bold shadow-md shadow-cyan-600/30 inline-flex items-center justify-center gap-2 transition-all"
        >
          <Play className="w-4 h-4 fill-white" />
          {primaryLabel(primary, firstIndex === 0)}
        </button>
        {onFocus && primary.id === "vocab" && (
          <button
            onClick={onFocus}
            title="Học các thẻ này trong một phiên có hẹn giờ: ẩn mọi thứ khác, tắt nhắc nhở"
            className="px-3.5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-600/30 transition active:scale-[0.98]"
          >
            <Crosshair className="w-4 h-4" /> Tập trung {focusMinutes ?? 10}′
          </button>
        )}
        {quickMode !== "hidden" && (
          <button
            onClick={onQuickStart}
            title="3 thẻ ôn nhanh, đủ để giữ chuỗi ngày học"
            className={`px-3.5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 border transition ${
              quickMode === "urgent"
                ? "border-amber-400 dark:border-amber-500/60 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-500/20"
                : "border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
            }`}
          >
            <Timer className="w-4 h-4" /> Chỉ 1 phút
          </button>
        )}
      </div>
      {quickMode === "urgent" ? (
        <p className="text-xs text-amber-800 dark:text-amber-200 inline-flex items-center gap-1.5">
          <Flame className="w-3.5 h-3.5 text-orange-500" />
          {streak > 0
            ? `Tối rồi mà hôm nay chưa học: 3 thẻ trong 1 phút là giữ được chuỗi ${streak} ngày.`
            : "Tối rồi: 3 thẻ trong 1 phút là đủ bắt đầu chuỗi ngày học."}
        </p>
      ) : null}
    </div>
  );
}
