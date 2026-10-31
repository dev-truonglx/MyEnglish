import { RankPanel, useRankPanelVisible } from "./RankWidgets";
import { useEffect, useMemo, useState } from "react";
import { BookOpenText, Bug, ChevronRight, Flame, Layers, Target, X, Zap } from "lucide-react";
import type { WordDetail } from "@/types/database";
import type { TodayWork } from "@/services/smartReview";
import { getUnmasteredWords, youngWordCap } from "@/services/smartReview";
import {
  FREEZE_EVERY_DAYS,
  freezeNoticeText,
  getLocalDateString,
  markFreezeNoticeSeen,
  unannouncedFrozenDays,
  type StreakStats,
} from "@/services/streak";
import { minutesFor, type ComebackStatus } from "@/services/comeback";
import { loadCoverage, type Coverage } from "@/services/coverage";
import { loadPronunciationLessons, nextPronunciationLesson, pronunciationPracticedToday } from "@/services/pronunciation";
import { REFLEX_DAILY_XP_MAX } from "@/services/reflexChallenge";
import { getAllGrammarProgress, getDueGrammarLessons, initGrammarStorage } from "@/services/grammarService";
import { getTodayGrammarPlan } from "@/services/grammarPath";
import { countWordStatus, WORD_STATUS_LABELS } from "@/services/wordStatus";
import { AI_VOCAB_ENABLED } from "@/services/features";
import { PAGE_CONTAINER, type DashboardTab } from "./shared";
import { useAuthStore } from "@/stores/authStore";
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
  onStartReflex?: () => void;
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

function greeting(hour: number, name?: string | null): string {
  const base = hour < 11 ? "Chào buổi sáng" : hour < 14 ? "Chào buổi trưa" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";
  const clean = name?.trim();
  return clean ? `${base}, ${clean}` : base;
}

/** Minutes for today's words: a new word costs an introduction and a quiz, about two reviews */
function todayMinutes(work: TodayWork): number {
  return minutesFor(work.reviews + work.newToday * 2);
}

/**
 * What happened to the streak, in one line each: a freeze used on a missed day (computeStreak uses it silently,
 * so it is told once per day frozen), a streak broken yesterday that today's answers can still repair, and the
 * confirmation on the day it is repaired.
 */
function StreakNotices({ stats, now }: { stats: StreakStats; now: Date }) {
  const today = getLocalDateString(now);
  const yesterday = getLocalDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const unannounced = useMemo(() => unannouncedFrozenDays(stats.frozenDates, now), [stats.frozenDates, today]);
  // Kept for this visit of the tab: the days are marked as told right away, so the next visit has no notice
  const [frozenShown, setFrozenShown] = useState<string[]>([]);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (unannounced.length === 0) return;
    setFrozenShown(unannounced);
    markFreezeNoticeSeen(unannounced[unannounced.length - 1]);
  }, [unannounced]);

  const repair = stats.streakRepair ?? null;
  const repaired = !!stats.repairedDates?.includes(yesterday);
  const close = (key: string) => setClosed((c) => ({ ...c, [key]: true }));
  const closeButton = (key: string) => (
    <button onClick={() => close(key)} className="shrink-0 p-3 -m-2.5 md:p-0.5 md:m-0 rounded opacity-60 hover:opacity-100" aria-label="Đóng">
      <X className="w-4 h-4" />
    </button>
  );
  const row = "w-full flex items-start gap-2 px-4 py-2.5 rounded-xl border text-sm";

  return (
    <>
      {frozenShown.length > 0 && !closed.freeze && (
        <div className={`${row} border-sky-200 dark:border-sky-900/50 bg-sky-50 dark:bg-sky-950/30 text-sky-900 dark:text-sky-100`} data-testid="freeze-notice">
          <span className="flex-1">
            <b>{freezeNoticeText(frozenShown, now)}</b>
            <span className="block text-xs text-sky-700 dark:text-sky-300">
              {stats.freezesAvailable > 0
                ? `Còn ${stats.freezesAvailable} lượt đóng băng.`
                : `Đã hết lượt đóng băng: cứ ${FREEZE_EVERY_DAYS} ngày học sẽ có thêm 1 lượt.`}
            </span>
          </span>
          {closeButton("freeze")}
        </div>
      )}
      {repair && !closed.repair && (
        <div className={`${row} border-orange-200 dark:border-orange-900/50 bg-orange-50 dark:bg-orange-950/30 text-orange-900 dark:text-orange-100`} data-testid="streak-repair-hint">
          <Flame className="w-4 h-4 mt-0.5 text-orange-500 shrink-0" />
          <span className="flex-1 space-y-1.5">
            <b className="block">
              Làm gấp đôi mục tiêu hôm nay ({repair.target} câu) để giữ lại chuỗi {repair.streak} ngày
            </b>
            <span className="block text-xs text-orange-800/80 dark:text-orange-200/80">
              Hôm qua bạn lỡ một ngày khi đã hết lượt đóng băng. Đã làm {Math.min(stats.todayCount, repair.target)}/{repair.target} câu.
            </span>
            <span className="block h-1.5 rounded-full bg-orange-100 dark:bg-orange-950 overflow-hidden">
              <span
                className="block h-full bg-orange-500 transition-all"
                style={{ width: `${Math.min(100, Math.round((stats.todayCount / repair.target) * 100))}%` }}
              />
            </span>
          </span>
          {closeButton("repair")}
        </div>
      )}
      {repaired && !closed.repaired && (
        <div className={`${row} border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100`} data-testid="streak-repaired">
          <Flame className="w-4 h-4 mt-0.5 text-orange-500 shrink-0" />
          <span className="flex-1">
            <b>Đã giữ lại chuỗi {stats.currentStreak} ngày!</b>
            <span className="block text-xs text-emerald-700 dark:text-emerald-300">
              Hôm nay bạn làm gấp đôi mục tiêu nên ngày hôm qua vẫn được tính.
            </span>
          </span>
          {closeButton("repaired")}
        </div>
      )}
    </>
  );
}

/**
 * The opening screen, built to show as much as fits without scrolling. Top: the greeting and three compact numbers
 * (streak, words learnt in the sidebar's two tiers, how much of a real IT text the learner recognises). Then, on
 * wide windows, two columns: today as a short list (words, one grammar lesson, one pronunciation lesson, sized by
 * the minutes chosen at onboarding) with one main button, or the day close once everything is done, plus the
 * focus card; on the right the daily quests and the weekly race. Below the list: the Ramp Up reflex drill and last week's
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
  onStartReflex,
  forgottenDue = 0,
  setActiveTab,
  loading = false,
  simpleMode = false,
  now: fixedNow,
}: TodayTabProps) {
  const now = fixedNow ?? new Date();
  const today = getLocalDateString(now);
  // Signed in: the account's display name in the greeting (none while signed out, or before the profile loads)
  const signedIn = useAuthStore((s) => s.user != null);
  const displayName = useAuthStore((s) => s.profile?.displayName);
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
  // Words only marked "Đã biết" are no milestone: the learner has not remembered them through study
  const studiedRemembered = status.rememberedLong - status.rememberedKnown;
  const milestone = useMemo(() => milestoneToCelebrate(studiedRemembered, readMilestoneMark(), today), [studiedRemembered, today]);
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
  const statCard = "flex items-center gap-1.5 sm:gap-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1.5 sm:px-3 sm:py-2 min-w-0 overflow-hidden";

  return (
    <div className={`${PAGE_CONTAINER} max-md:p-3`}>
      <div className="space-y-4">
        {/* Greeting on the left, the three numbers as compact cards on the right (they wrap below on narrow windows) */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-tight truncate">
              {greeting(now.getHours(), signedIn ? displayName : null)} 👋
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {now.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 w-full sm:w-auto">
            <div className={statCard} title="Chuỗi ngày học">
              <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">{streakStats.currentStreak} ngày</div>
                <div className={`text-[10px] sm:text-[11px] truncate ${streakStats.goalReached ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-zinc-400"}`}>
                  {streakStats.todayCount === 0
                    ? "Chưa học"
                    : `${streakStats.todayCount}/${streakStats.dailyGoal} câu${streakStats.goalReached ? " ✓" : ""}`}
                </div>
              </div>
            </div>
            <div className={statCard} title="Từ của bạn">
              <Target className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  {status.rememberedLong} <span className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-zinc-400">{WORD_STATUS_LABELS.remembered_long.toLowerCase()}</span>
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                  {status.learning} {WORD_STATUS_LABELS.learning.toLowerCase()}
                </div>
              </div>
            </div>
            <div
              className={statCard}
              title={gain && baseline ? `Hiểu tài liệu IT: tăng từ ngày ${baseline.day.split("-").slice(1).reverse().map(Number).join("/")}` : "Hiểu tài liệu IT: số từ bạn đã nhận ra"}
            >
              <BookOpenText className="w-4 h-4 sm:w-5 sm:h-5 text-violet-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  {gain ? (
                    <>
                      <span className="text-[10px] sm:text-xs font-semibold text-slate-400 dark:text-zinc-500">{gain.from}% → </span>
                      {gain.to}%
                    </>
                  ) : coverage ? (
                    `~${coverage.percent}%`
                  ) : (
                    "…"
                  )}
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400 truncate">tài liệu IT</div>
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
            {!loading && !empty && <StreakNotices stats={streakStats} now={now} />}

            {/* The one thing to do now */}
            {loading ? (
              <div className="h-40 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 animate-pulse" />
            ) : empty ? (
              <div className="rounded-2xl border border-cyan-200 dark:border-cyan-800/50 bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-950/40 dark:to-zinc-900 p-4 md:p-6 shadow-sm space-y-3">
                <p className="text-lg font-bold text-slate-900 dark:text-white">Chưa có từ nào để học</p>
                <p className="text-sm text-slate-600 dark:text-zinc-300">
                  {AI_VOCAB_ENABLED
                    ? `Mở "${pathLabel}" để thêm vài từ đầu tiên.`
                    : `Mở "${pathLabel}" và chọn cấp độ (ví dụ A1): mỗi ngày app lấy vài từ trong bộ Oxford cho bạn, từ IT trước.`}
                </p>
                <button
                  onClick={() => setActiveTab("capture")}
                  autoFocus
                  className="max-md:min-h-10 px-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 active:scale-[0.98] text-white text-sm font-bold shadow-md shadow-cyan-600/30 inline-flex items-center gap-2 transition-all"
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
                className="w-full max-md:min-h-10 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-left text-sm text-rose-800 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition-colors"
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
                work={todayWork}
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
                  reviewsToday={todayWork.reviews}
                  dailyGoal={streakStats.dailyGoal}
                  hasStudied={hasStudied}
                  freezesAvailable={streakStats.freezesAvailable}
                  refreshKey={streakStats.todayCount}
                  onStartReview={onStart}
                  onStartFocus={onStartFocus ? () => onStartFocus(focusMinutes) : undefined}
                  onStartReflex={onStartReflex}
                  setActiveTab={setActiveTab}
                  now={fixedNow}
                />
              )}
              {showRank && <RankPanel onNavigate={setActiveTab} />}
            </aside>
          )}

          <div className={`min-w-0 space-y-4 ${twoColumns ? "min-[1000px]:col-start-1 min-[1000px]:row-start-2" : ""}`}>
            {/* Ramp Up: the timed reflex drill, where the Oxford path card used to be */}
            {onStartReflex && (
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-4 text-white shadow-md shadow-orange-500/10 transition-all hover:shadow-lg hover:shadow-orange-500/15">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm shadow-inner">
                      <Zap className="h-5 w-5 fill-white text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black uppercase tracking-wider bg-white/20 px-1.5 py-0.5 rounded-full text-white">Ramp Up</span>
                        <h4 className="font-extrabold text-sm text-white truncate">Luyện Phản Xạ</h4>
                      </div>
                      <p className="text-[11px] text-amber-100 mt-0.5 line-clamp-2">
                        Ôn nhanh nghĩa các từ đã học, tính giờ. Nhận tới <strong className="text-white font-bold">+{REFLEX_DAILY_XP_MAX} XP</strong> mỗi ngày.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onStartReflex}
                    className="w-full sm:w-auto shrink-0 inline-flex items-center justify-center gap-1.5 max-md:min-h-10 px-5 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 text-amber-400 font-bold text-xs shadow-md transition-all transform active:scale-95"
                  >
                    <Zap className="w-3.5 h-3.5 fill-amber-400" />
                    <span>Bắt đầu luyện phản xạ</span>
                  </button>
                </div>
              </div>
            )}
            <WeeklySummaryCard simple={simpleMode} now={fixedNow} />
          </div>
        </div>
      </div>
    </div>
  );
}
