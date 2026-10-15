import { RankPanel, useRankPanelVisible } from "./RankWidgets";
import { useEffect, useMemo, useState } from "react";
import { BookOpenText, Flame, Layers, Target } from "lucide-react";
import type { WordDetail } from "@/types/database";
import type { TodayWork } from "@/services/smartReview";
import { getUnmasteredWords, youngWordCap } from "@/services/smartReview";
import { getLocalDateString, type StreakStats } from "@/services/streak";
import { minutesFor, type ComebackStatus } from "@/services/comeback";
import { loadCoverage, type Coverage } from "@/services/coverage";
import { loadPronunciationLessons, nextPronunciationLesson, pronunciationPracticedToday } from "@/services/pronunciation";
import { getAllGrammarProgress, getDueGrammarLessons, initGrammarStorage } from "@/services/grammarService";
import { getTodayGrammarPlan } from "@/services/grammarPath";
import { countWordStatus, WORD_STATUS_LABELS } from "@/services/wordStatus";
import { AI_VOCAB_ENABLED } from "@/services/features";
import { PAGE_CONTAINER, type DashboardTab } from "./shared";
import {
  TASK_TAB,
  buildTodayTasks,
  cardsLaterToday,
  chosenDailyMinutes,
  coverageGain,
  milestoneToCelebrate,
  pickNextStep,
  primaryTask,
  quickStartMode,
  readCoverageBaseline,
  readMilestoneMark,
  saveCoverageBaseline,
  saveMilestoneMark,
  type TodayTask,
  type TodayTaskInput,
} from "./todayPlan";
import TodayChecklist from "./TodayChecklist";
import DayCloseCard from "./DayCloseCard";
import TodayRoadmapCard from "./TodayRoadmapCard";
import WeeklySummaryCard from "./WeeklySummaryCard";

interface TodayTabProps {
  words: WordDetail[];
  todayWork: TodayWork;
  comeback: ComebackStatus | null;
  streakStats: StreakStats;
  onStart: () => void;
  /** The 3-card mini session ("Chỉ 1 phút") */
  onQuickStart: () => void;
  setActiveTab: (tab: DashboardTab) => void;
  /** Words still loading: no "done" state yet */
  loading?: boolean;
  simpleMode?: boolean;
  /** Fixed clock for previews */
  now?: Date;
}

function greeting(hour: number): string {
  if (hour < 11) return "Chào buổi sáng";
  if (hour < 14) return "Chào buổi trưa";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

/** Minutes for today's words: a new word costs an introduction and a quiz, about two reviews */
function todayMinutes(work: TodayWork): number {
  return minutesFor(work.reviews + work.newToday * 2);
}

/**
 * The opening screen: today as a short list (words, one grammar lesson, one pronunciation lesson, sized by the
 * minutes chosen at onboarding) with one main button, then the day close once everything is done. Below: the
 * streak, words learnt (same two tiers as the sidebar), how much of a real IT text the learner recognises,
 * the Oxford path with an estimate, and last week's summary on the first day of a new week.
 */
export default function TodayTab({
  words,
  todayWork,
  comeback,
  streakStats,
  onStart,
  onQuickStart,
  setActiveTab,
  loading = false,
  simpleMode = false,
  now: fixedNow,
}: TodayTabProps) {
  const now = fixedNow ?? new Date();
  const today = getLocalDateString(now);
  const showRank = useRankPanelVisible();
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [pron, setPron] = useState<TodayTaskInput["pronunciation"]>(null);
  const [grammar, setGrammar] = useState<TodayTaskInput["grammar"]>(null);

  useEffect(() => {
    loadCoverage(words).then(setCoverage).catch(() => setCoverage(null));
  }, [words]);

  useEffect(() => {
    const load = () => {
      const at = fixedNow ?? new Date();
      loadPronunciationLessons()
        .then((lessons) => {
          const next = nextPronunciationLesson(lessons);
          const doneToday = pronunciationPracticedToday(at);
          setPron(next || doneToday ? { doneToday, lessonTitle: next?.title ?? null } : null);
        })
        .catch(() => setPron(null));
      initGrammarStorage()
        .then(() => getTodayGrammarPlan(at))
        .then((plan) => {
          if (plan.pathLength === 0) return setGrammar(null);
          const day = getLocalDateString(at);
          const studiedToday =
            plan.newLessonDoneToday ||
            Object.values(getAllGrammarProgress()).some((p) => !!p.lastAttemptDate && getLocalDateString(new Date(p.lastAttemptDate)) === day);
          setGrammar({
            due: getDueGrammarLessons(at).length,
            studiedToday,
            nextTitle: plan.nextLesson && !plan.newLessonDoneToday ? plan.nextLesson.titleVn || plan.nextLesson.title : null,
            relearnTitle: plan.relearn ? plan.relearn.titleVn || plan.relearn.title : null,
          });
        })
        .catch(() => setGrammar(null));
    };
    load();
    window.addEventListener("myenglish-pronunciation-updated", load);
    window.addEventListener("myenglish-grammar-updated", load);
    return () => {
      window.removeEventListener("myenglish-pronunciation-updated", load);
      window.removeEventListener("myenglish-grammar-updated", load);
    };
  }, [streakStats.todayCount, fixedNow]);

  // The same two tiers as the sidebar and the word library (U9)
  const status = useMemo(() => countWordStatus(words), [words]);
  const hasStudied = useMemo(() => words.some((w) => (w.srs?.reps ?? 0) > 0 || (w.srs?.state ?? 0) > 0), [words]);
  const unmasteredCount = useMemo(() => getUnmasteredWords(words).length, [words]);
  const laterToday = useMemo(() => cardsLaterToday(words, now), [words, todayWork.total]);

  // A "Nhớ lâu" milestone, celebrated once (the line stays for the day it is reached)
  const milestone = useMemo(() => milestoneToCelebrate(status.rememberedLong, readMilestoneMark(), today), [status.rememberedLong, today]);
  useEffect(() => {
    if (milestone.next) saveMilestoneMark(milestone.next);
  }, [milestone.next]);

  // Coverage: the first measure is kept to show the gain later ("46% → 52%")
  const [baseline, setBaseline] = useState(readCoverageBaseline);
  useEffect(() => {
    if (!coverage || loading || baseline) return;
    const first = { percent: coverage.percent, day: today };
    saveCoverageBaseline(first);
    setBaseline(first);
  }, [coverage, loading, baseline, today]);
  const gain = coverage ? coverageGain(coverage.percent, baseline) : null;

  const inComeback = !!comeback && !comeback.caughtUp;
  const tasks = buildTodayTasks({
    minutes: chosenDailyMinutes(streakStats.dailyGoal),
    vocab: {
      reviews: todayWork.reviews,
      newToday: todayWork.newToday,
      minutes: todayMinutes(todayWork),
      comebackDay: inComeback ? comeback.dayNumber : null,
    },
    grammar,
    pronunciation: pron,
  });
  const primary = primaryTask(tasks);
  // Nothing to do and nothing ever studied: no "done", but where words come from (U6)
  const empty = !loading && todayWork.total === 0 && !hasStudied;
  const quickMode = quickStartMode({
    goalReached: streakStats.goalReached,
    todayCount: streakStats.todayCount,
    hour: now.getHours(),
    canStudy: todayWork.total > 0 || hasStudied,
  });

  const run = (task: TodayTask) => {
    if (task.id === "vocab") onStart();
    else setActiveTab(TASK_TAB[task.id]);
  };
  const isCapped = unmasteredCount >= youngWordCap();
  const more = {
    // While a comeback plan runs, "more" is the backlog, not new words (P12)
    label: inComeback ? "Ôn thêm thẻ tồn" : isCapped ? `Ôn từ đang học (${unmasteredCount})` : "Học thêm từ mới",
    onClick: onStart,
  };
  const pathLabel = AI_VOCAB_ENABLED ? "Thêm từ bằng AI" : "Lộ trình từ vựng";

  return (
    <div className={PAGE_CONTAINER}>
      {/* Two columns when the weekly race is shown: today on the left, the ranking on the right */}
      <div className={showRank ? "mx-auto grid min-[1000px]:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start" : "max-w-3xl mx-auto"}>
      <div className={`min-w-0 max-w-3xl w-full space-y-5 ${showRank ? "" : "mx-auto"}`}>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{greeting(now.getHours())} 👋</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            {now.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        {/* The one thing to do now */}
        {loading ? (
          <div className="h-40 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 animate-pulse" />
        ) : empty ? (
          <div className="rounded-2xl border border-cyan-200 dark:border-cyan-800/50 bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-950/40 dark:to-zinc-900 p-6 shadow-sm space-y-3">
            <p className="text-lg font-bold text-slate-900 dark:text-white">Chưa có từ nào để học</p>
            <p className="text-sm text-slate-600 dark:text-zinc-300">
              {AI_VOCAB_ENABLED
                ? `Mở "${pathLabel}" để thêm vài từ đầu tiên.`
                : `Mở "${pathLabel}" và chọn cấp độ (ví dụ A1): mỗi ngày app lấy vài từ trong bộ Oxford cho bạn, từ IT trước.`}
            </p>
            <button
              onClick={() => setActiveTab("capture")}
              autoFocus
              className="px-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 active:scale-[0.98] text-white text-sm font-bold shadow-md shadow-cyan-600/30 inline-flex items-center gap-2 transition-all"
            >
              <Layers className="w-4 h-4" /> Mở {pathLabel}
            </button>
          </div>
        ) : primary ? (
          <TodayChecklist
            tasks={tasks}
            primary={primary}
            heading={inComeback ? `Kế hoạch quay lại · ngày ${comeback.dayNumber}: chỉ phần dễ quên nhất` : "Hôm nay của bạn"}
            onRun={run}
            quickMode={quickMode}
            onQuickStart={onQuickStart}
            streak={streakStats.currentStreak}
          />
        ) : (
          <DayCloseCard
            streakStats={streakStats}
            laterToday={laterToday}
            hour={now.getHours()}
            nextStep={pickNextStep({ pronunciationAvailable: !!pron, pronunciationDone: !!pron?.doneToday, simple: simpleMode })}
            onNextStep={(step) => setActiveTab(step.tab)}
            onQuickStart={onQuickStart}
            more={streakStats.todayCount > 0 ? more : null}
          />
        )}

        {/* Three numbers */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
              <Flame className="w-4 h-4 text-orange-500" /> Chuỗi ngày học
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{streakStats.currentStreak} ngày</div>
            <div className={`text-xs ${streakStats.goalReached ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-zinc-400"}`}>
              {streakStats.todayCount === 0
                ? "Hôm nay chưa học"
                : `Hôm nay ${streakStats.todayCount}/${streakStats.dailyGoal} câu${streakStats.goalReached ? " ✓" : ""}`}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
              <Target className="w-4 h-4 text-emerald-500" /> Từ của bạn
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {status.rememberedLong} <span className="text-sm font-semibold text-slate-500 dark:text-zinc-400">{WORD_STATUS_LABELS.remembered_long.toLowerCase()}</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-zinc-400">
              {status.learning} từ {WORD_STATUS_LABELS.learning.toLowerCase()}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
              <BookOpenText className="w-4 h-4 text-violet-500" /> Hiểu tài liệu IT
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {gain ? (
                <>
                  <span className="text-base font-semibold text-slate-400 dark:text-zinc-500">{gain.from}% → </span>
                  {gain.to}%
                </>
              ) : coverage ? (
                `~${coverage.percent}%`
              ) : (
                "…"
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-zinc-400">
              {gain && baseline ? `tăng từ ngày ${baseline.day.split("-").slice(1).reverse().map(Number).join("/")}` : "số từ bạn đã nhận ra"}
            </div>
          </div>
        </div>

        <TodayRoadmapCard simple={simpleMode} milestone={milestone.show} onOpenPath={() => setActiveTab("capture")} />

        <WeeklySummaryCard simple={simpleMode} now={fixedNow} />
      </div>

      {showRank && (
        <aside className="min-[1000px]:sticky min-[1000px]:top-0 min-w-0">
          <RankPanel onNavigate={setActiveTab} />
        </aside>
      )}
      </div>
    </div>
  );
}
