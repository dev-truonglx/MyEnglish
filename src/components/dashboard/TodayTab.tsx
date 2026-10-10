import { useEffect, useMemo, useState } from "react";
import { AudioLines, BookOpenText, CheckCircle2, Flame, GraduationCap, Play, Sparkles, Target } from "lucide-react";
import type { WordDetail } from "@/types/database";
import type { TodayWork } from "@/services/smartReview";
import type { StreakStats } from "@/services/streak";
import { minutesFor, type ComebackStatus } from "@/services/comeback";
import { loadWorkloadForecast } from "@/services/progress";
import { loadCoverage, type Coverage } from "@/services/coverage";
import { loadPronunciationLessons, nextPronunciationLesson } from "@/services/pronunciation";
import { nextLessonToLearn } from "@/services/grammarService";
import { getReminderSettings } from "@/services/reminderSettings";
import { PAGE_CONTAINER, type DashboardTab } from "./shared";
import { TodayLevelCard } from "./VocabTab";

interface TodayTabProps {
  words: WordDetail[];
  todayWork: TodayWork;
  comeback: ComebackStatus | null;
  streakStats: StreakStats;
  onStart: () => void;
  setActiveTab: (tab: DashboardTab) => void;
}

function greeting(hour: number): string {
  if (hour < 11) return "Chào buổi sáng";
  if (hour < 14) return "Chào buổi trưa";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

/** Minutes for today's work: a new word costs an introduction and a quiz, about two reviews */
function todayMinutes(work: TodayWork): number {
  return minutesFor(work.reviews + work.newToday * 2);
}

/**
 * The opening screen: one thing to do now ("Học hôm nay"), three numbers that show progress
 * (streak, words remembered, how much of a real IT text the learner recognises) and a few small
 * next steps (a pronunciation lesson, the next grammar point, reading).
 */
export default function TodayTab({ words, todayWork, comeback, streakStats, onStart, setActiveTab }: TodayTabProps) {
  const [tomorrow, setTomorrow] = useState<number | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [nextPron, setNextPron] = useState<{ title: string } | null>(null);

  useEffect(() => {
    loadWorkloadForecast(2)
      .then((f) => setTomorrow(f.days[1]?.reviews ?? 0))
      .catch(() => setTomorrow(null));
  }, [words]);

  useEffect(() => {
    loadCoverage(words).then(setCoverage).catch(() => setCoverage(null));
  }, [words]);

  useEffect(() => {
    const load = () =>
      loadPronunciationLessons()
        .then((lessons) => setNextPron(nextPronunciationLesson(lessons)))
        .catch(() => setNextPron(null));
    load();
    window.addEventListener("myenglish-pronunciation-updated", load);
    return () => window.removeEventListener("myenglish-pronunciation-updated", load);
  }, []);

  const nextGrammar = useMemo(() => nextLessonToLearn(getReminderSettings().grammarLevels), [streakStats.todayCount]);
  // Words marked "already known" count once a real review has confirmed them
  const remembered = useMemo(
    () => words.filter((w) => (w.srs?.state ?? 0) === 2 && (w.stats?.totalAttempts ?? 0) > 0).length,
    [words]
  );
  const minutes = todayMinutes(todayWork);
  const done = todayWork.total === 0;
  const now = new Date();

  return (
    <div className={PAGE_CONTAINER}>
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{greeting(now.getHours())} 👋</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            {now.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        {/* The one thing to do now */}
        <div className="rounded-2xl border border-cyan-200 dark:border-cyan-800/50 bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-950/40 dark:to-zinc-900 p-6 shadow-sm space-y-4">
          {done ? (
            <>
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
                <span className="text-lg font-bold">Xong phần học hôm nay 🎉</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-zinc-300">
                {tomorrow !== null && tomorrow > 0
                  ? `Hẹn mai: ${tomorrow} thẻ, khoảng ${minutesFor(tomorrow)} phút.`
                  : "Mai quay lại nhé, app sẽ nhắc đúng lúc cần ôn."}{" "}
                Muốn học thêm thì luyện vài từ, không ảnh hưởng lịch ôn.
              </p>
              <button
                onClick={onStart}
                className="px-5 py-2.5 rounded-xl border border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-300 text-sm font-semibold hover:bg-cyan-50 dark:hover:bg-cyan-950/50"
              >
                Luyện thêm vài từ
              </button>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-cyan-800 dark:text-cyan-300">
                  {comeback && !comeback.caughtUp
                    ? `Kế hoạch quay lại · ngày ${comeback.dayNumber}: chỉ phần dễ quên nhất`
                    : "Phần học hôm nay"}
                </p>
                <p className="text-base text-slate-700 dark:text-zinc-200">
                  {todayWork.reviews > 0 && `${todayWork.reviews} thẻ ôn`}
                  {todayWork.reviews > 0 && todayWork.newToday > 0 && " · "}
                  {todayWork.newToday > 0 && `${todayWork.newToday} từ mới`}
                  {` · khoảng ${minutes} phút`}
                </p>
              </div>
              <button
                onClick={onStart}
                autoFocus
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 active:scale-[0.98] text-white text-base font-bold shadow-md shadow-cyan-600/30 inline-flex items-center justify-center gap-2 transition-all"
              >
                <Play className="w-5 h-5 fill-white" />
                Học hôm nay (~{minutes} phút)
              </button>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Bận quá? Chỉ cần 1 câu là giữ được chuỗi ngày học.
              </p>
            </>
          )}
        </div>

        {/* Three numbers */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
              <Flame className="w-4 h-4 text-orange-500" /> Chuỗi ngày học
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{streakStats.currentStreak} ngày</div>
            <div className={`text-xs ${streakStats.todayCount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-zinc-400"}`}>
              {streakStats.todayCount > 0 ? "Hôm nay đã học ✓" : "Hôm nay chưa học"}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
              <Target className="w-4 h-4 text-emerald-500" /> Từ đã nhớ
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{remembered}</div>
            <div className="text-xs text-slate-500 dark:text-zinc-400">đã qua ít nhất một lần ôn</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
              <BookOpenText className="w-4 h-4 text-violet-500" /> Đọc tài liệu IT
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{coverage ? `~${coverage.percent}%` : "…"}</div>
            <div className="text-xs text-slate-500 dark:text-zinc-400">số từ bạn đã nhận ra</div>
          </div>
        </div>

        <TodayLevelCard onOpen={() => setActiveTab("capture")} />

        {/* Small next steps */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Thêm một chút nếu muốn</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {nextPron && (
              <button
                onClick={() => setActiveTab("pronunciation")}
                className="text-left rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:border-violet-300 dark:hover:border-violet-700 space-y-1"
              >
                <AudioLines className="w-5 h-5 text-violet-500" />
                <div className="text-sm font-semibold text-slate-800 dark:text-zinc-200">Phát âm (~5 phút)</div>
                <div className="text-xs text-slate-500 dark:text-zinc-400">{nextPron.title}</div>
              </button>
            )}
            {nextGrammar && (
              <button
                onClick={() => setActiveTab("grammar")}
                className="text-left rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:border-cyan-300 dark:hover:border-cyan-700 space-y-1"
              >
                <GraduationCap className="w-5 h-5 text-cyan-500" />
                <div className="text-sm font-semibold text-slate-800 dark:text-zinc-200">Ngữ pháp kế tiếp</div>
                <div className="text-xs text-slate-500 dark:text-zinc-400">{nextGrammar.titleVn}</div>
              </button>
            )}
            <button
              onClick={() => setActiveTab("reading")}
              className="text-left rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:border-emerald-300 dark:hover:border-emerald-700 space-y-1"
            >
              <Sparkles className="w-5 h-5 text-emerald-500" />
              <div className="text-sm font-semibold text-slate-800 dark:text-zinc-200">Đọc một đoạn thật</div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">Dán email, ticket, tài liệu: app tô màu từ bạn biết</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
