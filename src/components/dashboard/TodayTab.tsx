import { RankPanel, useRankPanelVisible } from "./RankWidgets";
import { useEffect, useMemo, useState } from "react";
import { BookOpenText, Bug, ChevronRight, Flame, Layers, Target } from "lucide-react";
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
import FocusStartCard from "./FocusStartCard";
import DailyQuestsCard from "./DailyQuestsCard";
import { FOCUS_SETTINGS_EVENT, getFocusSettings, nextReviewPeek } from "@/services/focusSession";
import { nextReviewText } from "@/services/dayClose";
import WeeklySummaryCard from "./WeeklySummaryCard";

interface TodayTabProps {
  words: WordDetail[];
  todayWork: TodayWork;
  comeback: ComebackStatus | null;
  streakStats: StreakStats;
  onStart: () => void;
  /** The 3-card mini session ("Chỉ 1 phút") */
  onQuickStart: () => void;
  /** Timed focus session (minutes) */
  onStartFocus?: (minutes: number) => void;
  /** Words often forgotten that are due now: a hint to review them apart from 3 on */
  forgottenDue?: number;
  setActiveTab: (tab: DashboardTab) => void;
  /** Words still loading: no "done" state yet */
  loading?: boolean;
  simpleMode?: boolean;
  /** Fixed clock for previews */
  now?: Date;
}

/** From this many words often forgotten due now, Today points to their own section */
const FORGOTTEN_HINT_MIN = 3;

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
 * The opening screen, built to show as much as fits without scrolling. Top: the greeting and three compact numbers
 * (streak, words learnt in the sidebar's two tiers, how much of a real IT text the learner recognises). Then, on
 * wide windows, two columns: today as a short list (words, one grammar lesson, one pronunciation lesson, sized by
 * the minutes chosen at onboarding) with one main button, or the day close once everything is done, plus the
 * focus card; on the right the daily quests and the weekly race. Below the list: the Oxford path and last week's
 * summary on the first day of a new week.
 */
export default function TodayTab({
  words,
  todayWork,
  comeback,
  streakStats,
  onStart,
  onQuickStart,
  onStartFocus,
  forgottenDue = 0,
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
  // Length of a focus session, as last chosen on the focus card
  const [focusMinutes, setFocusMinutes] = useState(() => getFocusSettings().minutes);
  useEffect(() => {
    const onChange = () => setFocusMinutes(getFocusSettings().minutes);
    window.addEventListener(FOCUS_SETTINGS_EVENT, onChange);
    return () => window.removeEventListener(FOCUS_SETTINGS_EVENT, onChange);
  }, []);

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
  const nextReview = useMemo(() => nextReviewPeek(words, now), [words, todayWork.total]);

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

  const showQuests = !loading && !empty;
  const twoColumns = showQuests || showRank;
  const statCard = "flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 min-w-0";

  return (
    <div className={PAGE_CONTAINER}>
      <div className="space-y-4">
        {/* Greeting on the left, the three numbers as compact cards on the right (they wrap below on narrow windows) */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{greeting(now.getHours())} 👋</h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {now.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
            <div className={statCard} title="Chuỗi ngày học">
              <Flame className="w-5 h-5 text-orange-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">{streakStats.currentStreak} ngày</div>
                <div className={`text-[11px] truncate ${streakStats.goalReached ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-zinc-400"}`}>
                  {streakStats.todayCount === 0
                    ? "Hôm nay chưa học"
                    : `Hôm nay ${streakStats.todayCount}/${streakStats.dailyGoal} câu${streakStats.goalReached ? " ✓" : ""}`}
                </div>
              </div>
            </div>
            <div className={statCard} title="Từ của bạn">
              <Target className="w-5 h-5 text-emerald-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">
                  {status.rememberedLong} <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400">{WORD_STATUS_LABELS.remembered_long.toLowerCase()}</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                  {status.learning} từ {WORD_STATUS_LABELS.learning.toLowerCase()}
                </div>
              </div>
            </div>
            <div
              className={statCard}
              title={gain && baseline ? `Hiểu tài liệu IT: tăng từ ngày ${baseline.day.split("-").slice(1).reverse().map(Number).join("/")}` : "Hiểu tài liệu IT: số từ bạn đã nhận ra"}
            >
              <BookOpenText className="w-5 h-5 text-violet-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">
                  {gain ? (
                    <>
                      <span className="text-xs font-semibold text-slate-400 dark:text-zinc-500">{gain.from}% → </span>
                      {gain.to}%
                    </>
                  ) : coverage ? (
                    `~${coverage.percent}%`
                  ) : (
                    "…"
                  )}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">hiểu tài liệu IT</div>
              </div>
            </div>
          </div>
        </div>

        {/*
          Wide windows: today's plan on the left, quests (and the weekly race) on the right, both in view without
          scrolling. Narrow: one column, quests right after the plan and the focus card, then the path and the week.
        */}
        <div className={twoColumns ? "grid gap-4 items-start min-[1000px]:grid-cols-[minmax(0,1fr)_320px] min-[1000px]:grid-rows-[auto_1fr]" : "max-w-3xl mx-auto space-y-4"}>
          <div className="min-w-0 space-y-4">
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
                onFocus={onStartFocus ? () => onStartFocus(focusMinutes) : undefined}
                focusMinutes={focusMinutes}
                goalReached={streakStats.goalReached}
                nextReviewLine={nextReviewText(nextReview, now)}
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
                nextReview={nextReview}
                dueNow={todayWork.reviews}
                now={fixedNow}
              />
            )}

            {!loading && forgottenDue >= FORGOTTEN_HINT_MIN && (
              <button
                onClick={() => setActiveTab("forgotten")}
                className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-left text-sm text-rose-800 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition-colors"
              >
                <Bug className="w-4 h-4 text-rose-500 shrink-0" />
                <span className="flex-1">
                  <b>{forgottenDue} từ hay quên</b> đang chờ. Ôn riêng nhóm này để hết quên?
                </span>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>
            )}

            {!loading && !empty && onStartFocus && (todayWork.total > 0 || hasStudied) && (
              <FocusStartCard
                onStart={onStartFocus}
                due={todayWork.total}
                shortcut
                // The list's "Tập trung" button already stands out: no second loud card under it
                quiet={primary?.id === "vocab"}
              />
            )}
          </div>

          {twoColumns && (
            <aside className="min-w-0 space-y-4 min-[1000px]:col-start-2 min-[1000px]:row-start-1 min-[1000px]:row-span-2">
              {showQuests && (
                <DailyQuestsCard
                  words={words}
                  newToday={todayWork.newToday}
                  dailyGoal={streakStats.dailyGoal}
                  hasStudied={hasStudied}
                  freezesAvailable={streakStats.freezesAvailable}
                  refreshKey={streakStats.todayCount}
                  onStartReview={onStart}
                  onStartFocus={onStartFocus ? () => onStartFocus(focusMinutes) : undefined}
                  setActiveTab={setActiveTab}
                  now={fixedNow}
                />
              )}
              {showRank && <RankPanel onNavigate={setActiveTab} />}
            </aside>
          )}

          <div className={`min-w-0 space-y-4 ${twoColumns ? "min-[1000px]:col-start-1 min-[1000px]:row-start-2" : ""}`}>
            <TodayRoadmapCard simple={simpleMode} milestone={milestone.show} onOpenPath={() => setActiveTab("capture")} />
            <WeeklySummaryCard simple={simpleMode} now={fixedNow} />
          </div>
        </div>
      </div>
    </div>
  );
}
