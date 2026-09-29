import { useMemo, useState, useEffect } from "react";
import { Flame, Trophy, Calendar, Zap, Target, Settings2 } from "lucide-react";
import type { WordDetail } from "@/types/database";
import {
  calculateStreakAndGoal,
  getActivityLogs,
  getLocalDateString,
  setDailyGoal,
} from "@/services/streak";

interface HeatmapProps {
  words: WordDetail[];
}

interface DayData {
  dateStr: string; // YYYY-MM-DD
  count: number;
  dayOfWeek: number; // 0 = Sun, 1 = Mon ...
  formattedDate: string;
}

export default function Heatmap({ words }: HeatmapProps) {
  const [logsVersion, setLogsVersion] = useState(0);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("10");

  useEffect(() => {
    const handleUpdate = () => setLogsVersion((v) => v + 1);
    window.addEventListener("myenglish-activity-updated", handleUpdate);
    return () => window.removeEventListener("myenglish-activity-updated", handleUpdate);
  }, []);

  const streakStats = useMemo(() => {
    return calculateStreakAndGoal(words);
  }, [words, logsVersion]);

  // Compute activity per day (words created + study sessions)
  const { weeks, totalActivity, activeDays } = useMemo(() => {
    const activityMap = new Map<string, number>();

    // 1. Study logs from localStorage
    const logs = getActivityLogs();
    for (const [dateStr, count] of Object.entries(logs)) {
      activityMap.set(dateStr, (activityMap.get(dateStr) || 0) + count);
    }

    // 2. Words created in SQLite
    words.forEach((w) => {
      if (w.created_at) {
        try {
          const d = new Date(w.created_at);
          const dateStr = getLocalDateString(d);
          activityMap.set(dateStr, (activityMap.get(dateStr) || 0) + 1);
        } catch {}
      }
    });

    // Generate past 20 weeks (140 days) ending today
    const days: DayData[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalDaysToShow = 20 * 7;
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - totalDaysToShow + 1);

    let uniqueActive = 0;
    let sumTotal = 0;

    for (let i = 0; i < totalDaysToShow; i++) {
      const cur = new Date(startDate);
      cur.setDate(startDate.getDate() + i);
      const dateStr = getLocalDateString(cur);
      const count = activityMap.get(dateStr) || 0;
      sumTotal += count;
      if (count > 0) uniqueActive++;

      days.push({
        dateStr,
        count,
        dayOfWeek: cur.getDay(),
        formattedDate: cur.toLocaleDateString("vi-VN", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      });
    }

    // Group into 7-day columns (weeks)
    const weekCols: DayData[][] = [];
    let currentWeek: DayData[] = [];

    days.forEach((day, idx) => {
      currentWeek.push(day);
      if (currentWeek.length === 7 || idx === days.length - 1) {
        weekCols.push(currentWeek);
        currentWeek = [];
      }
    });

    return {
      weeks: weekCols,
      totalActivity: sumTotal,
      activeDays: uniqueActive,
    };
  }, [words, logsVersion]);

  // Color intensity helper (clean contrast in both light and dark modes)
  const getColorClass = (count: number) => {
    if (count === 0) return "bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800/80";
    if (count === 1) return "bg-emerald-100 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300";
    if (count === 2) return "bg-emerald-300 dark:bg-emerald-800 border-emerald-400 dark:border-emerald-700 text-emerald-950 dark:text-emerald-200";
    if (count <= 4) return "bg-emerald-500 dark:bg-emerald-600 border-emerald-600 dark:border-emerald-500 text-white";
    return "bg-emerald-600 dark:bg-emerald-400 border-emerald-700 dark:border-emerald-300 text-white dark:text-zinc-950 font-bold";
  };

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(goalInput, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setDailyGoal(parsed);
      setIsEditingGoal(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800/90 bg-white dark:bg-zinc-900/60 p-6 space-y-6 shadow-sm">
      {/* Streaks Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Metric 1: Current Streak */}
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 p-3.5 space-y-1 relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 text-xs">
            <span>Chuỗi liên tiếp</span>
            <Flame className="w-4 h-4 text-orange-400 animate-bounce" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono flex items-baseline gap-1">
            <span>{streakStats.currentStreak}</span>
            <span className="text-xs text-orange-600 dark:text-orange-400 font-normal">ngày 🔥</span>
          </div>
        </div>

        {/* Metric 2: Longest Streak */}
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 p-3.5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 text-xs">
            <span>Kỷ lục dài nhất</span>
            <Trophy className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono flex items-baseline gap-1">
            <span>{streakStats.longestStreak}</span>
            <span className="text-xs text-slate-500 dark:text-zinc-400 font-normal">ngày</span>
          </div>
        </div>

        {/* Metric 3: Active Days */}
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 p-3.5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 text-xs">
            <span>Ngày học tích cực</span>
            <Calendar className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono flex items-baseline gap-1">
            <span>{activeDays}</span>
            <span className="text-xs text-slate-500 dark:text-zinc-400 font-normal">ngày</span>
          </div>
        </div>

        {/* Metric 4: Total Captured */}
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 p-3.5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 text-xs">
            <span>Tổng lượt tương tác</span>
            <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono flex items-baseline gap-1">
            <span>{totalActivity}</span>
            <span className="text-xs text-slate-500 dark:text-zinc-400 font-normal">lượt</span>
          </div>
        </div>
      </div>

      {/* DAILY GOAL PROGRESS CARD */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">Mục tiêu hằng ngày (Daily Goal)</span>
            {streakStats.goalReached && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Đã đạt mục tiêu hôm nay! 🎉
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-500 dark:text-zinc-400">
              <span className="text-slate-900 dark:text-white font-bold">{streakStats.todayCount}</span> / {streakStats.dailyGoal} từ
            </span>
            <button
              onClick={() => {
                setGoalInput(String(streakStats.dailyGoal));
                setIsEditingGoal(!isEditingGoal);
              }}
              title="Cài đặt mục tiêu"
              className="p-1 rounded text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden relative">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              streakStats.goalReached
                ? "bg-gradient-to-r from-emerald-500 to-cyan-400 shadow-md shadow-emerald-500/50"
                : "bg-gradient-to-r from-cyan-500 to-blue-500"
            }`}
            style={{ width: `${streakStats.goalPercentage}%` }}
          />
        </div>

        {/* Goal Edit Inline Form */}
        {isEditingGoal && (
          <form onSubmit={handleSaveGoal} className="pt-2 flex items-center gap-2 text-xs">
            <span className="text-slate-600 dark:text-zinc-400">Đặt mục tiêu số từ/ngày:</span>
            <input
              type="number"
              min="1"
              max="100"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              className="w-16 px-2 py-1 rounded bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition-colors"
            >
              Lưu
            </button>
            <button
              type="button"
              onClick={() => setIsEditingGoal(false)}
              className="px-2 py-1 text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300"
            >
              Huỷ
            </button>
          </form>
        )}
      </div>

      {/* HEATMAP GRID */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
          <span className="font-medium text-slate-800 dark:text-zinc-300">Biểu đồ đóng góp & Hoạt động (20 tuần gần nhất)</span>
          <div className="flex items-center gap-1.5 text-[11px] font-mono">
            <span>Ít</span>
            <div className="flex gap-1 items-center">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800" />
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-100 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800" />
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-300 dark:bg-emerald-800 border border-emerald-400 dark:border-emerald-700" />
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 dark:bg-emerald-600 border border-emerald-600 dark:border-emerald-500" />
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 dark:bg-emerald-400 border border-emerald-700 dark:border-emerald-300" />
            </div>
            <span>Nhiều</span>
          </div>
        </div>

        {/* Heatmap Matrix */}
        <div className="overflow-x-auto pb-2">
          <div className="inline-flex gap-1.5 p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/90 border border-slate-200 dark:border-zinc-800/80">
            {/* Day of week labels */}
            <div className="flex flex-col justify-between pr-2 text-[9px] font-mono text-slate-400 dark:text-zinc-500 h-[106px] select-none">
              <span>CN</span>
              <span>T3</span>
              <span>T5</span>
              <span>T7</span>
            </div>

            {/* Weeks columns */}
            {weeks.map((week, wIdx) => (
              <div key={wIdx} className="flex flex-col gap-1.5">
                {week.map((day, dIdx) => (
                  <div
                    key={dIdx}
                    title={`${day.count} hoạt động vào ngày ${day.formattedDate}`}
                    className={`w-3 h-3 rounded-sm border transition-transform hover:scale-125 cursor-pointer ${getColorClass(
                      day.count
                    )}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
