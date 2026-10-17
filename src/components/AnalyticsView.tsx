import BeginnerProgressCard from "./BeginnerProgressCard";
import { isBeginner, isSimpleMode } from "@/services/learnerProfile";
import { useState, useEffect, useMemo } from "react";
import {
  Trophy,
  Brain,
  Bug,
  CheckCircle2,
  Calendar,
  Flame,
  BookOpen,
  PieChart as PieIcon,
  Activity,
  LayoutDashboard,
  Repeat,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import type { WordDetail } from "@/types/database";
import {
  getWordStatsSummary,
  getXPState,
  getReviewAnalytics,
  isKnownOnly,
  type WordStatsSummary,
  type XPState,
  type ReviewAnalyticsData,
} from "@/services/smartReview";
import { countBadgeWords, getAchievements } from "@/services/achievements";
import { loadWorkloadForecast, type WorkloadForecast } from "@/services/progress";
import { calculateStreakAndGoal } from "@/services/streak";
import Heatmap from "./Heatmap";
import { PAGE_CONTAINER } from "./dashboard/shared";
import ProficiencyAssessmentCard from "./ProficiencyAssessmentCard";
import WeeklyProgressCard from "./WeeklyProgressCard";
import WeeklyRankBadge from "./dashboard/WeeklyRankBadge";
import { loadForgottenWords } from "@/services/forgottenWords";
import LearningInsightsCard from "./LearningInsightsCard";
import HabitInsightsCard from "./HabitInsightsCard";
import RetentionCard from "./RetentionCard";

interface AnalyticsViewProps {
  words: WordDetail[];
  /** The "Từ hay quên" section (its list, review and leech settings) */
  onOpenForgotten?: () => void;
  onRefreshWords?: () => void;
  /** Open a lesson of the grammar book (from the tenses of a CEFR level) */
  onOpenGrammarLesson?: (lessonId: string) => void;
  /** Words still due today, as the dashboard counts them (keeps the goal and streak in step with its header) */
  dueRemaining?: number | null;
}

/** The sub-tabs of the progress screen; the last one opened comes back next time */
type ProgressTab = "overview" | "vocab" | "habits" | "schedule" | "badges";
const PROGRESS_TABS: Array<{ id: ProgressTab; label: string; icon: LucideIcon; hint: string }> = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard, hint: "Các con số chính, tuần này và lịch học mỗi ngày" },
  { id: "vocab", label: "Từ vựng", icon: BookOpen, hint: "Trình độ, các từ đang ở giai đoạn nào, độ chính xác khi ôn" },
  { id: "habits", label: "Thói quen", icon: Repeat, hint: "Giờ học hiệu quả, phiên tập trung và tỉ lệ quay lại học" },
  { id: "schedule", label: "Lịch ôn", icon: CalendarClock, hint: "Số thẻ sắp phải ôn và số liệu của thuật toán ôn tập" },
  { id: "badges", label: "Thành tựu", icon: Trophy, hint: "Cấp độ, XP và các danh hiệu" },
];
const PROGRESS_TAB_KEY = "myenglish_progress_tab_v1";

function readProgressTab(): ProgressTab {
  try {
    const v = localStorage.getItem(PROGRESS_TAB_KEY);
    return PROGRESS_TABS.some((t) => t.id === v) ? (v as ProgressTab) : "overview";
  } catch {
    return "overview";
  }
}

export default function AnalyticsView({
  words,
  onOpenForgotten,
  onRefreshWords,
  onOpenGrammarLesson,
  dueRemaining = null,
}: AnalyticsViewProps) {
  const simple = isSimpleMode();
  const beginner = isBeginner();
  const [tab, setTabState] = useState<ProgressTab>(readProgressTab);
  const setTab = (next: ProgressTab) => {
    setTabState(next);
    try {
      localStorage.setItem(PROGRESS_TAB_KEY, next);
    } catch {}
  };
  const [xpState, setXpState] = useState<XPState>(getXPState);
  const [reviewAnalytics, setReviewAnalytics] = useState<ReviewAnalyticsData | null>(null);

  useEffect(() => {
    const onXPUpdate = () => setXpState(getXPState());
    window.addEventListener("myenglish-xp-updated", onXPUpdate);
    return () => window.removeEventListener("myenglish-xp-updated", onXPUpdate);
  }, []);

  const stats: WordStatsSummary = useMemo(() => getWordStatsSummary(words), [words]);
  // Same count as the "Từ hay quên" section
  const [forgottenCount, setForgottenCount] = useState<number | null>(null);
  useEffect(() => {
    let stale = false;
    loadForgottenWords(words)
      .then((d) => !stale && setForgottenCount(d.active.length))
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [words]);
  const streakStats = useMemo(() => calculateStreakAndGoal(words, dueRemaining), [words, dueRemaining]);

  // Reviews coming up: the next days in one line (simple mode), the full calibration card otherwise
  const [forecast, setForecast] = useState<WorkloadForecast | null>(null);
  useEffect(() => {
    // Words change often: only the latest forecast request may set the state
    let stale = false;
    loadWorkloadForecast(8)
      .then((f) => {
        if (!stale) setForecast(f);
      })
      .catch(() => {
        if (!stale) setForecast(null);
      });
    return () => {
      stale = true;
    };
  }, [words]);

  // Compute Level Mastery (the "topic" field holds the CEFR level)
  const topicMastery = useMemo(() => {
    const map: Record<string, { total: number; mastered: number; learning: number }> = {};
    for (const w of words) {
      const topic = w.topic || "General Tech";
      if (!map[topic]) map[topic] = { total: 0, mastered: 0, learning: 0 };
      map[topic].total++;
      // A word only marked "Đã biết" is not mastered until a real review confirms it
      if ((w.srs.stability || 0) >= 21 && !isKnownOnly(w.srs)) {
        map[topic].mastered++;
      } else if ((w.srs.state || 0) > 0) {
        map[topic].learning++;
      }
    }
    return Object.entries(map).map(([topic, data]) => ({
      topic,
      total: data.total,
      mastered: data.mastered,
      percent: Math.round((data.mastered / data.total) * 100),
    }));
  }, [words]);

  // Load Review Logs from SQLite
  useEffect(() => {
    let stale = false;
    getReviewAnalytics(14)
      .then((data) => {
        if (!stale) setReviewAnalytics(data);
      })
      .catch((err) => console.warn("Failed to load review analytics:", err));
    return () => {
      stale = true;
    };
  }, []);

  // Badge counts leave out "Đã biết" words no review has confirmed (the session counts the same way).
  // Leech badge: no cumulative count is stored outside the session, so only the saved unlock is shown.
  const badgeCounts = useMemo(() => countBadgeWords(words), [words]);
  const achievements = useMemo(() => {
    return getAchievements({
      totalWords: words.length,
      rememberedWords: badgeCounts.rememberedWords,
      masteredWords: badgeCounts.masteredWords,
      currentStreak: streakStats.currentStreak,
      topicMasterCount: badgeCounts.topicMasterCount,
    });
  }, [words.length, badgeCounts, streakStats.currentStreak]);


  const unlockedCount = achievements.filter((a) => a.isUnlocked).length;

  const card = "rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm";
  const nextWeekReviews = forecast ? forecast.days.slice(1, 8).reduce((sum, d) => sum + d.reviews, 0) : null;

  return (
    <div className={`${PAGE_CONTAINER} space-y-5 animate-in fade-in duration-200`}>
      {/* Title, level and the sub-tabs */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-500" />
              <span>Tiến độ</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{PROGRESS_TABS.find((t) => t.id === tab)?.hint}</p>
          </div>
          <button
            type="button"
            onClick={() => setTab("badges")}
            title="Xem cấp độ và danh hiệu"
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/30 hover:border-amber-500/60 transition-colors text-left"
          >
            <span className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-lg shrink-0">{xpState.rankEmoji}</span>
            <span>
              <span className="block text-xs font-bold text-amber-600 dark:text-amber-400">
                Cấp {xpState.level} · {xpState.rank}
              </span>
              <span className="block text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                {xpState.totalXP.toLocaleString()} XP · +{xpState.todayXP} hôm nay
              </span>
            </span>
          </button>
        </div>

        <div role="tablist" aria-label="Mục tiến độ" className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-zinc-800 -mx-1 px-1">
          {PROGRESS_TABS.map((t) => {
            const Icon = t.icon;
            const selected = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(t.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 -mb-px border-b-2 text-sm font-medium transition-colors ${
                  selected
                    ? "border-cyan-500 text-cyan-700 dark:text-cyan-300"
                    : "border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                {t.id === "badges" && (
                  <span className="text-[10px] font-mono px-1.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                    {unlockedCount}/{achievements.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "overview" && (
        <>
      {/* Top 4 Key Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Retention Health */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              Khả năng ghi nhớ
            </span>
            <Brain className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {Math.round(stats.avgRetrievability * 100)}%
            </span>
            <span className="text-[11px] text-slate-400 dark:text-zinc-500">trung bình</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.round(stats.avgRetrievability * 100)}%` }}
            />
          </div>
        </div>

        {/* Mastered Words */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              Nhớ lâu (21 ngày+)
            </span>
            <CheckCircle2 className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-cyan-600 dark:text-cyan-400 font-mono">
              {stats.masteredCount}
            </span>
            <span className="text-[11px] text-slate-400 dark:text-zinc-500">
              / {stats.totalWords} từ
            </span>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500">
            {stats.totalWords > 0
              ? `${Math.round((stats.masteredCount / stats.totalWords) * 100)}% tổng kho từ`
              : "Chưa có từ"}
          </p>
        </div>

        {/* Streak */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Chuỗi ngày học</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-500 font-mono">
              {streakStats.currentStreak}
            </span>
            <span className="text-[11px] text-slate-400 dark:text-zinc-500">ngày liên tục</span>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500">
            Kỷ lục cao nhất: {streakStats.longestStreak} ngày
          </p>
        </div>

        {/* Words often forgotten: the count here, the list and the leech settings in their own section */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Từ hay quên</span>
            <Bug className="w-4 h-4 text-rose-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-500 font-mono">{forgottenCount ?? "…"}</span>
            <span className="text-[11px] text-slate-400 dark:text-zinc-500">từ</span>
          </div>
          {onOpenForgotten ? (
            <button onClick={onOpenForgotten} className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline">
              {forgottenCount ? "Mở mục Từ hay quên →" : "Chưa có từ nào hay quên →"}
            </button>
          ) : (
            <p className="text-[11px] text-slate-400 dark:text-zinc-500">
              {forgottenCount ? "Sẽ được ôn kèm mẹo nhớ" : "Tuyệt vời, chưa có từ nào hay quên!"}
            </p>
          )}
        </div>
      </div>

      {beginner && <BeginnerProgressCard />}

      <WeeklyProgressCard words={words} />

      {/* Heatmap Widget */}
      <div className={`${card} p-5 space-y-3`}>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Calendar className="w-4 h-4 text-cyan-500" />
          <span>Lịch sử học mỗi ngày</span>
        </h3>
        <Heatmap words={words} dueRemaining={dueRemaining} />
      </div>
        </>
      )}

      {tab === "habits" && (
        <>
          <HabitInsightsCard words={words} />
          <RetentionCard />
        </>
      )}

      {tab === "schedule" && (
        <>
          {/* The days ahead in one line, then the calibration of the scheduler */}
          <div className={`${card} p-4 grid grid-cols-1 sm:grid-cols-3 gap-3`}>
            <div className="space-y-0.5">
              <span className="text-xs text-slate-500 dark:text-zinc-400">Mai phải ôn</span>
              <p className="text-2xl font-black font-mono text-slate-900 dark:text-white">{forecast ? `~${forecast.days[1]?.reviews ?? 0}` : "…"}</p>
              <span className="text-[11px] text-slate-400 dark:text-zinc-500">thẻ</span>
            </div>
            <div className="space-y-0.5">
              <span className="text-xs text-slate-500 dark:text-zinc-400">7 ngày tới</span>
              <p className="text-2xl font-black font-mono text-slate-900 dark:text-white">{nextWeekReviews === null ? "…" : `~${nextWeekReviews}`}</p>
              <span className="text-[11px] text-slate-400 dark:text-zinc-500">thẻ, chưa tính từ mới</span>
            </div>
            <div className="space-y-0.5">
              <span className="text-xs text-slate-500 dark:text-zinc-400">Trung bình mỗi ngày</span>
              <p className="text-2xl font-black font-mono text-cyan-600 dark:text-cyan-400">
                {nextWeekReviews === null ? "…" : `~${Math.round(nextWeekReviews / 7)}`}
              </p>
              <span className="text-[11px] text-slate-400 dark:text-zinc-500">thẻ ôn trong tuần tới</span>
            </div>
          </div>
          {simple && (
            <p className="text-xs text-slate-500 dark:text-zinc-400 px-1">
              Phần dưới là số liệu kỹ thuật của thuật toán ôn tập, không cần đọc để học tốt.
            </p>
          )}
          <LearningInsightsCard />
        </>
      )}

      {tab === "vocab" && (
        <>
      <ProficiencyAssessmentCard words={words} onRefreshWords={onRefreshWords} onOpenGrammarLesson={onOpenGrammarLesson} />

      {/* Accuracy & Review Logs Summary (if logs exist) */}
      {reviewAnalytics && reviewAnalytics.totalReviews > 0 && (
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              <span>Độ chính xác khi ôn, 14 ngày qua</span>
            </h3>
            <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
              Độ chính xác: {reviewAnalytics.accuracyRate}%
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800">
              <span className="text-[11px] text-slate-500 dark:text-zinc-400">Tổng lượt ôn tập</span>
              <p className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                {reviewAnalytics.totalReviews}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800">
              <span className="text-[11px] text-slate-500 dark:text-zinc-400">Trả lời đúng</span>
              <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                {reviewAnalytics.correctReviews} ({reviewAnalytics.accuracyRate}%)
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800">
              <span className="text-[11px] text-slate-500 dark:text-zinc-400">Tốc độ phản xạ trung bình</span>
              <p className="text-xl font-bold font-mono text-cyan-600 dark:text-cyan-400 mt-1">
                {(reviewAnalytics.averageResponseTimeMs / 1000).toFixed(1)}s
              </p>
            </div>
          </div>
        </div>
      )}

      {/* FSRS Word State Distribution & Retention Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Word State Distribution */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm space-y-5">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <PieIcon className="w-4 h-4 text-purple-500" />
            <span>Các từ đang ở giai đoạn nào</span>
          </h3>

          <div className="space-y-3">
            {/* New Words */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" />
                  Mới thêm (New)
                </span>
                <span className="font-mono font-bold text-slate-700 dark:text-zinc-300">
                  {stats.newCount} ({stats.totalWords ? Math.round((stats.newCount / stats.totalWords) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-slate-400 rounded-full"
                  style={{ width: `${stats.totalWords ? (stats.newCount / stats.totalWords) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Learning Words */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  Đang học (Learning)
                </span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  {stats.learningCount} ({stats.totalWords ? Math.round((stats.learningCount / stats.totalWords) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${stats.totalWords ? (stats.learningCount / stats.totalWords) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* In Review */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                  Ôn định kỳ (Review)
                </span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  {stats.reviewCount - stats.masteredCount} ({stats.totalWords ? Math.round(((stats.reviewCount - stats.masteredCount) / stats.totalWords) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${stats.totalWords ? ((stats.reviewCount - stats.masteredCount) / stats.totalWords) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Mastered */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  Khắc sâu (Mastered 21d+)
                </span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {stats.masteredCount} ({stats.totalWords ? Math.round((stats.masteredCount / stats.totalWords) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${stats.totalWords ? (stats.masteredCount / stats.totalWords) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 dark:text-zinc-500 pt-2 border-t border-slate-100 dark:border-zinc-800">
            App tự tính thời điểm ôn lại từng từ, dựa trên việc bạn nhớ từ đó chắc đến đâu và nó khó với bạn thế nào.
          </p>
        </div>

        {/* Topic Mastery Grid */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-cyan-500" />
            <span>Nhớ lâu theo cấp độ</span>
          </h3>

          <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
            {topicMastery.length === 0 ? (
              <p className="text-xs text-slate-400">Chưa có cấp độ nào.</p>
            ) : (
              topicMastery.map((item) => (
                <div key={item.topic} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-700 dark:text-zinc-300 font-medium truncate max-w-[200px]">
                      {item.topic}
                    </span>
                    <span className="font-mono text-slate-500 dark:text-zinc-400">
                      {item.mastered}/{item.total} ({item.percent}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

        </>
      )}

      {tab === "badges" && (
      <div className="space-y-4">
        {/* Level and weekly rank */}
        <div className={`${card} p-4 flex flex-wrap items-center gap-4`}>
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-3xl shrink-0">
            {xpState.rankEmoji}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-base font-bold text-slate-900 dark:text-white">
              Cấp {xpState.level} · <span className="text-amber-600 dark:text-amber-400">{xpState.rank}</span>
            </p>
            <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">
              {xpState.totalXP.toLocaleString()} XP tổng · {xpState.todayXP} XP hôm nay
            </p>
            <WeeklyRankBadge />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Danh hiệu
            </h3>
          </div>
          <span className="text-xs font-mono font-semibold text-slate-500 dark:text-zinc-400">
            Đã mở {unlockedCount}/{achievements.length} danh hiệu
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {achievements.map((badge) => (
            <div
              key={badge.id}
              className={`p-3.5 rounded-2xl border transition-all ${
                badge.isUnlocked
                  ? "border-amber-500/40 bg-gradient-to-b from-amber-500/5 to-transparent dark:bg-zinc-900/80 shadow-sm"
                  : "border-slate-200 dark:border-zinc-800/60 bg-slate-50/50 dark:bg-zinc-900/30 opacity-70"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0 ${
                    badge.isUnlocked
                      ? "bg-amber-500/20 border border-amber-500/30 shadow-sm"
                      : "bg-slate-200 dark:bg-zinc-800 grayscale"
                  }`}
                >
                  {badge.emoji}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {badge.title}
                    </h4>
                    {badge.isUnlocked && (
                      <span className="text-[10px] text-amber-500 font-bold">✓</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-2 mt-0.5 leading-snug">
                    {badge.description}
                  </p>

                  <div className="mt-2 flex items-center justify-between text-[10px]">
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      +{badge.xpBonus} XP
                    </span>
                    {!badge.isUnlocked && (
                      <span className="text-slate-400 dark:text-zinc-500 font-mono">
                        {badge.currentValue}/{badge.targetValue}
                      </span>
                    )}
                  </div>

                  {!badge.isUnlocked && (
                    <div className="w-full h-1 rounded-full bg-slate-200 dark:bg-zinc-800 mt-1.5 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${badge.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
