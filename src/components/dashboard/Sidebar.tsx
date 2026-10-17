import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  Sparkles,
  X,
  Flame,
  Code2,
  BarChart3,
  Terminal,
  Sun,
  Moon,
  Laptop,
  Check,
  RotateCw,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Download,
  GraduationCap,
  BookOpenText,
  NotebookPen,
  Sunrise,
  AudioLines,
  Layers,
  Dumbbell,
  Trophy,
  UserRound,
  Bug,
  BadgeCheck,
  Zap,
} from "lucide-react";
import type { PipelineItem } from "@/services/pipeline";
import type { calculateStreakAndGoal } from "@/services/streak";
import { getSavedTheme, setTheme, type ThemeMode } from "@/services/theme";
import { CURRENT_VERSION, useUpdateStore } from "@/services/updateService";
import { getXPState, isKnownOnly, type XPState } from "@/services/smartReview";
import { getDueGrammarLessons } from "@/services/grammarService";
import { useWordsStore } from "@/stores/wordsStore";
import { AI_VOCAB_ENABLED } from "@/services/features";
import { useAuthStore } from "@/stores/authStore";
import { RankLine } from "./RankWidgets";
import Avatar from "../Avatar";
import { SIMPLE_NAV_GROUPS, type DashboardTab, type LibraryStats, type NavGroupId } from "./shared";

interface SidebarProps {
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
  pipelineQueue: PipelineItem[];
  dueCount: number;
  streakStats: ReturnType<typeof calculateStreakAndGoal>;
  libraryStats: LibraryStats;
  /** Simple mode: five entries (Hôm nay · Từ vựng · Ngữ pháp · Luyện thêm · Cài đặt) instead of ten tabs */
  simpleMode?: boolean;
  /** Words often forgotten, and those of them due now (badge of "Từ hay quên") */
  forgottenCount?: number;
  forgottenDue?: number;
}

/** LEFT SIDEBAR: logo + update badge, navigation, learning stats, account & theme switcher */
export default function Sidebar({
  activeTab,
  setActiveTab,
  pipelineQueue,
  dueCount,
  streakStats,
  libraryStats,
  simpleMode = false,
  forgottenCount = 0,
  forgottenDue = 0,
}: SidebarProps) {
  const words = useWordsStore((s) => s.words);
  const knownWaitingCount = useMemo(() => words.filter((w) => isKnownOnly(w.srs)).length, [words]);
  const [grammarDueCount, setGrammarDueCount] = useState<number>(0);
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(getSavedTheme);
  const [xpState, setXpState] = useState<XPState>(getXPState);
  const accountUser = useAuthStore((s) => s.user);
  const accountName = useAuthStore((s) => s.profile?.displayName);
  const accountAvatar = useAuthStore((s) => s.profile?.avatar);
  const syncStatus = useAuthStore((s) => s.sync.status);

  // Only the fields shown here: the rest of the store (the update handle, release notes) changing re-renders nothing
  const updateStatus = useUpdateStore((s) => s.status);
  const newVersion = useUpdateStore((s) => s.newVersion);
  const downloadProgress = useUpdateStore((s) => s.downloadProgress);
  const updateDismissed = useUpdateStore((s) => s.dismissed);
  const downloadAndInstall = useUpdateStore((s) => s.downloadAndInstall);
  const restartApp = useUpdateStore((s) => s.restartApp);
  const dismissUpdate = useUpdateStore((s) => s.dismiss);
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates);
  const errorMessage = useUpdateStore((s) => s.errorMessage);

  // Words met so far, once per words change (not on every render of the sidebar)
  const libraryWordCount = useMemo(
    () =>
      words.filter(
        (w) =>
          !w.catalog_id ||
          (w.srs?.reps ?? 0) > 0 ||
          (w.srs?.state ?? 0) > 0 ||
          Boolean(w.srs?.last_review)
      ).length,
    [words]
  );

  const handleThemeChange = (mode: ThemeMode) => {
    setCurrentTheme(mode);
    setTheme(mode);
  };

  useEffect(() => {
    const onXPUpdate = () => setXpState(getXPState());
    window.addEventListener("myenglish-xp-updated", onXPUpdate);
    return () => window.removeEventListener("myenglish-xp-updated", onXPUpdate);
  }, []);

  useEffect(() => {
    const updateDue = () => {
      setGrammarDueCount(getDueGrammarLessons().length);
    };
    updateDue();
    window.addEventListener("myenglish-grammar-updated", updateDue);
    return () => window.removeEventListener("myenglish-grammar-updated", updateDue);
  }, []);

  useEffect(() => {
    const onThemeChanged = (e: Event) => {
      const custom = e as CustomEvent<{ mode: ThemeMode }>;
      if (custom.detail?.mode) {
        setCurrentTheme(custom.detail.mode);
      }
    };
    window.addEventListener("myenglish-theme-changed", onThemeChanged);
    return () => window.removeEventListener("myenglish-theme-changed", onThemeChanged);
  }, []);

  const countBadge = (n: number, highlight = false) =>
    n > 0 ? (
      <span
        className={`text-[11px] font-mono px-1.5 py-0.5 rounded-full font-semibold ${highlight
          ? "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800"
          : "bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300"
          }`}
      >
        {n}
      </span>
    ) : null;

  const navItems: Array<{ tab: DashboardTab; label: string; icon: typeof BookOpen; iconClass?: string; badge?: ReactNode }> = [
    { tab: "today", label: "Hôm nay", icon: Sunrise, iconClass: "text-amber-500" },
    { tab: "review", label: "Ôn tập", icon: Flame, iconClass: "text-orange-400", badge: countBadge(dueCount, true) },
    // Words met so far (the words waiting to be introduced are not the learner's yet)
    {
      tab: "library",
      label: "Từ đã học",
      icon: BookOpen,
      badge: countBadge(libraryWordCount),
    },
    // Words marked "Đã biết", still waiting for their one check
    { tab: "known", label: "Đã biết", icon: BadgeCheck, iconClass: "text-emerald-500", badge: countBadge(knownWaitingCount) },
    { tab: "grammar", label: "Ngữ pháp", icon: GraduationCap, iconClass: "text-cyan-500", badge: countBadge(grammarDueCount, true) },
    { tab: "pronunciation", label: "Phát âm", icon: AudioLines, iconClass: "text-violet-500" },
    { tab: "reading", label: "Đọc", icon: BookOpenText },
    { tab: "writing", label: "Viết & sổ lỗi", icon: NotebookPen },
    AI_VOCAB_ENABLED
      ? {
          tab: "capture",
          label: "Thêm từ bằng AI",
          icon: Sparkles,
          badge: pipelineQueue.some((i) => i.status === "analyzing") ? (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          ) : null,
        }
      : { tab: "capture", label: "Lộ trình từ vựng", icon: Layers, iconClass: "text-cyan-500" },
    { tab: "analytics", label: "Tiến độ", icon: BarChart3, iconClass: "text-emerald-400" },
    { tab: "guide", label: "Cài đặt", icon: Terminal, iconClass: "text-cyan-500" },
  ];

  // Simple mode: one entry per group of tabs; an entry opens its first tab
  const groupLook: Record<NavGroupId, { icon: typeof BookOpen; iconClass?: string; badge?: ReactNode }> = {
    today: { icon: Sunrise, iconClass: "text-amber-500" },
    vocab: { icon: BookOpen, iconClass: "text-orange-400", badge: countBadge(dueCount, true) },
    grammar: { icon: GraduationCap, iconClass: "text-cyan-500", badge: countBadge(grammarDueCount, true) },
    practice: { icon: Dumbbell, iconClass: "text-violet-500" },
    quick: { icon: Zap, iconClass: "text-amber-500" },
    settings: { icon: Terminal, iconClass: "text-cyan-500" },
    account: { icon: UserRound },
  };
  const visibleItems: Array<{ key: string; label: string; icon: typeof BookOpen; iconClass?: string; badge?: ReactNode; active: boolean; onClick: () => void }> =
    simpleMode
      ? SIMPLE_NAV_GROUPS.filter((g) => g.id !== "account" && g.id !== "quick").map((g) => {
          const active = g.tabs.some((t) => t.tab === activeTab);
          return {
            key: g.id,
            label: g.label,
            ...groupLook[g.id],
            active,
            onClick: () => setActiveTab(g.tabs[0].tab),
          };
        })
      : navItems.map((item) => ({ ...item, key: item.tab, active: activeTab === item.tab, onClick: () => setActiveTab(item.tab) }));

  // "Truy cập nhanh": two tiles under the list, in both modes
  const quickItems: Array<{ tab: DashboardTab; label: string; icon: typeof BookOpen; tone: string; activeTone: string; badge?: ReactNode; title: string }> = [
    {
      tab: "forgotten",
      label: "Từ hay quên",
      icon: Bug,
      tone: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 hover:bg-rose-100 dark:hover:bg-rose-950/60",
      activeTone: "ring-2 ring-rose-400 dark:ring-rose-500/60",
      title:
        forgottenCount > 0
          ? `${forgottenCount} từ hay quên${forgottenDue > 0 ? `, ${forgottenDue} từ đang đến hạn ôn` : ", chưa từ nào đến hạn"}`
          : "Những từ bạn hay trả lời sai",
      badge:
        forgottenCount > 0 ? (
          <span
            className={`text-[10px] font-mono px-1.5 rounded-full font-bold ${
              forgottenDue > 0 ? "bg-rose-500 text-white" : "bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300"
            }`}
          >
            {forgottenCount}
          </span>
        ) : null,
    },
    {
      tab: "leaderboard",
      label: "Xếp hạng",
      icon: Trophy,
      tone: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 hover:bg-amber-100 dark:hover:bg-amber-950/60",
      activeTone: "ring-2 ring-amber-400 dark:ring-amber-500/60",
      title: "Bảng xếp hạng XP tuần, tháng và chuỗi ngày học",
    },
  ];

  const goalText =
    streakStats.goalReached && streakStats.dueRemaining === 0 && streakStats.todayCount < streakStats.dailyGoal
      ? "Đã ôn hết ✓"
      : `${streakStats.todayCount}/${streakStats.dailyGoal} câu`;

  return (
    <aside className="w-64 min-h-0 border-r border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 flex flex-col shrink-0 select-none">
      {/* Logo & App title (always visible) */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold">
            <Code2 className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                MyEnglish
              </h1>

              {/* Interactive Version Badge / Check Update Button */}
              {updateStatus === "checking" ? (
                <span
                  title="Đang kiểm tra..."
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/80 border border-cyan-200 dark:border-cyan-800 text-cyan-600 dark:text-cyan-400 shrink-0"
                >
                  <RotateCw className="w-2.5 h-2.5 animate-spin" />
                  <span>Đang kiểm tra...</span>
                </span>
              ) : updateStatus === "up-to-date" ? (
                <span
                  title={`Bản mới nhất (v${CURRENT_VERSION})`}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300/80 dark:border-emerald-700/80 text-emerald-600 dark:text-emerald-400 shrink-0 animate-in fade-in zoom-in-95 duration-200"
                >
                  <Check className="w-2.5 h-2.5" />
                  <span>Bản mới nhất</span>
                </span>
              ) : updateStatus === "error" ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    checkForUpdates(true);
                  }}
                  title={errorMessage || "Lỗi kiểm tra"}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors shrink-0 cursor-pointer"
                >
                  <AlertCircle className="w-2.5 h-2.5" />
                  <span>Lỗi kiểm tra</span>
                </button>
              ) : updateStatus === "available" ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadAndInstall();
                  }}
                  title={`Đã có bản cập nhật mới: v${newVersion}`}
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-600 text-white shadow-sm shadow-cyan-600/30 hover:bg-cyan-700 transition-all shrink-0 cursor-pointer animate-pulse [animation-iteration-count:3]"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>v{newVersion}</span>
                </button>
              ) : updateStatus === "downloading" ? (
                <span
                  title={`Đang tải... ${downloadProgress}%`}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/80 border border-cyan-200 dark:border-cyan-800 text-cyan-600 dark:text-cyan-400 shrink-0"
                >
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  <span>{downloadProgress}%</span>
                </span>
              ) : updateStatus === "downloaded" ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    restartApp();
                  }}
                  title="Khởi động lại ngay để hoàn tất cập nhật"
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white shadow-sm shadow-emerald-600/30 hover:bg-emerald-700 transition-all shrink-0 cursor-pointer"
                >
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  <span>Khởi động lại</span>
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    checkForUpdates(true);
                  }}
                  title={`Kiểm tra bản cập nhật (v${CURRENT_VERSION})`}
                  className="group/badge inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/80 border border-cyan-200/60 dark:border-cyan-800/60 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-100/80 dark:hover:bg-cyan-900/60 hover:border-cyan-300/80 dark:hover:border-cyan-700/80 active:scale-95 transition-all shrink-0 cursor-pointer"
                >
                  <span>v{CURRENT_VERSION}</span>
                  <RotateCw className="w-2.5 h-2.5 opacity-50 group-hover/badge:opacity-100 group-hover/badge:rotate-180 transition-all duration-300" />
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">Tiếng Anh cho dân IT</p>
          </div>
        </div>
      </div>

      {/* Navigation + stats: scrolls when the window is short, so nothing below is ever cut off */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 space-y-3">
        {/* In-App Auto-Update Widget */}
        {!updateDismissed &&
          (updateStatus === "available" ||
            updateStatus === "downloading" ||
            updateStatus === "downloaded" ||
            updateStatus === "error") && (
            <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-indigo-500/5 dark:from-cyan-950/70 dark:via-blue-950/60 dark:to-zinc-900 border border-cyan-500/20 dark:border-cyan-500/30 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200 space-y-2">
              <div className="flex items-start justify-between gap-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-zinc-100 min-w-0">
                  {updateStatus === "downloaded" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : updateStatus === "downloading" ? (
                    <Loader2 className="w-4 h-4 text-cyan-500 animate-spin shrink-0" />
                  ) : updateStatus === "error" ? (
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-cyan-500 shrink-0" />
                  )}
                  <span className="truncate">
                    {updateStatus === "downloaded"
                      ? "Đã cập nhật xong!"
                      : updateStatus === "downloading"
                        ? `Đang tải... ${downloadProgress}%`
                        : updateStatus === "error"
                          ? (errorMessage || "Lỗi cập nhật")
                          : `Đã có bản cập nhật mới: v${newVersion}`}
                  </span>
                </div>
                <button
                  onClick={dismissUpdate}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-0.5 rounded transition-colors shrink-0 cursor-pointer"
                  title="Bỏ qua"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {updateStatus === "downloading" && (
                <div className="w-full bg-slate-200/80 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-cyan-600 dark:bg-cyan-500 h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              )}

              {updateStatus === "available" && (
                <button
                  onClick={downloadAndInstall}
                  className="w-full py-1.5 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 active:scale-[0.98] text-white text-xs font-semibold shadow-sm shadow-cyan-600/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Cập nhật ngay</span>
                </button>
              )}

              {updateStatus === "downloaded" && (
                <button
                  onClick={restartApp}
                  className="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-bold shadow-sm shadow-emerald-600/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Khởi động lại</span>
                </button>
              )}

              {updateStatus === "error" && (
                <button
                  onClick={downloadAndInstall}
                  className="w-full py-1 px-2 rounded-lg bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-xs text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer"
                >
                  Thử lại
                </button>
              )}
            </div>
          )}

        {/* Navigation Links: Vietnamese labels, today first */}
        <nav className="space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={item.onClick}
                aria-current={item.active ? "page" : undefined}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${item.active
                  ? "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 shadow-sm"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${item.iconClass ?? ""}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge}
              </button>
            );
          })}
        </nav>

        {/* Quick access: the words to fix and the race, one click from anywhere */}
        <div className="space-y-1.5">
          <div className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Truy cập nhanh</div>
          <div className="grid grid-cols-2 gap-2">
            {quickItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.tab;
              return (
                <button
                  key={item.tab}
                  onClick={() => setActiveTab(item.tab)}
                  aria-current={active ? "page" : undefined}
                  title={item.title}
                  className={`relative flex flex-col items-start gap-1 px-2.5 py-2 rounded-xl border text-left text-xs font-semibold transition-all active:scale-[0.97] ${item.tone} ${
                    active ? item.activeTone : ""
                  }`}
                >
                  <div className="w-full flex items-center justify-between">
                    <Icon className="w-4 h-4" />
                    {item.badge}
                  </div>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Compact stats: streak + today's goal, then the two word tiers (click: Tiến độ) */}
        <button
          type="button"
          onClick={() => setActiveTab("analytics")}
          title={`${streakStats.todayCount > 0 ? "Hôm nay đã giữ chuỗi ✓" : "Hôm nay chưa học: chỉ cần 1 câu là giữ được chuỗi"}${
            streakStats.freezesAvailable > 0
              ? ` • ${streakStats.freezesAvailable} lượt giữ chuỗi: nếu lỡ 1 ngày, chuỗi vẫn được giữ`
              : ""
          } • Bấm để xem tiến độ`}
          className="w-full text-left rounded-xl border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 hover:bg-slate-50 dark:hover:bg-zinc-800/50 px-3 py-2.5 space-y-1.5 shadow-sm transition-colors"
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-mono font-bold text-orange-600 dark:text-orange-400 whitespace-nowrap">
              🔥 {streakStats.currentStreak} ngày
              {streakStats.todayCount > 0 && <span className="ml-1 text-emerald-600 dark:text-emerald-400">✓</span>}
              {streakStats.freezesAvailable > 0 && (
                <span className="ml-1 text-sky-600 dark:text-sky-400">🧊{streakStats.freezesAvailable}</span>
              )}
            </span>
            <span
              className={`font-mono whitespace-nowrap ${streakStats.goalReached ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-slate-600 dark:text-zinc-300"}`}
            >
              {goalText}
            </span>
          </div>
          <div className="w-full h-1 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${streakStats.goalReached ? "bg-emerald-500" : "bg-cyan-500"}`}
              style={{ width: `${streakStats.goalPercentage}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-zinc-400">
            <span className="truncate">
              Đang học <span className="font-semibold text-slate-800 dark:text-zinc-200">{libraryStats.learningCount}</span>
              {" · "}
              Nhớ lâu <span className="font-semibold text-emerald-600 dark:text-emerald-400">{libraryStats.rememberedLongCount}</span>
            </span>
            {!simpleMode && (
              <span className="shrink-0 font-mono text-amber-700 dark:text-amber-300" title={`${xpState.rank} • ${xpState.totalXP} XP`}>
                {xpState.rankEmoji} Lv.{xpState.level}
              </span>
            )}
          </div>
        </button>

        {/* Weekly XP rank: one line under the streak (signed-in learners) */}
        <RankLine onOpen={() => setActiveTab("leaderboard")} />
      </div>

      {/* Account and theme on one row (always visible) */}
      <div className="p-3 border-t border-slate-200 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/30 flex items-center gap-2 shrink-0">
        {/* Account: sign-in, sync, leaderboard */}
        <button
          onClick={() => setActiveTab("account")}
          aria-current={activeTab === "account" ? "page" : undefined}
          title={accountUser ? `Đã đăng nhập: ${accountUser.email}` : "Đăng nhập để đồng bộ tiến trình và đua XP"}
          className={`min-w-0 flex-1 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border transition-colors text-left shadow-sm ${
            activeTab === "account"
              ? "bg-cyan-50 dark:bg-cyan-500/10 border-cyan-200 dark:border-cyan-500/20 text-cyan-700 dark:text-cyan-400"
              : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/80 hover:bg-slate-100 dark:hover:bg-zinc-800/60 text-slate-800 dark:text-zinc-200"
          }`}
        >
          <span className="flex items-center gap-2 min-w-0">
            {accountUser ? (
              <Avatar id={accountAvatar} name={accountName ?? accountUser.email} size="sm" />
            ) : (
              <UserRound className="w-4 h-4 shrink-0" />
            )}
            <span className="text-xs font-medium truncate">
              {accountUser ? (accountName ?? accountUser.email) : "Đăng nhập"}
            </span>
          </span>
          {accountUser && (
            <span
              className={`shrink-0 w-2 h-2 rounded-full ${
                syncStatus === "error" ? "bg-rose-500" : syncStatus === "syncing" ? "bg-amber-400 animate-pulse" : "bg-emerald-500"
              }`}
              title={syncStatus === "error" ? "Đồng bộ lỗi" : syncStatus === "syncing" ? "Đang đồng bộ" : "Đã đồng bộ"}
            />
          )}
        </button>

        {/* Theme: three icons (the names are in the tooltips) */}
        <div role="group" aria-label="Giao diện" className="shrink-0 flex items-center bg-slate-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-slate-200 dark:border-zinc-800/80">
          {(
            [
              { mode: "light", title: "Giao diện sáng", icon: Sun, on: "bg-white text-amber-600 border border-slate-200 shadow-sm" },
              { mode: "dark", title: "Giao diện tối", icon: Moon, on: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/40 shadow-sm" },
              {
                mode: "system",
                title: "Theo cài đặt của máy",
                icon: Laptop,
                on: "bg-white dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-slate-200 dark:border-indigo-500/40 shadow-sm",
              },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.mode}
                type="button"
                onClick={() => handleThemeChange(t.mode)}
                title={t.title}
                aria-label={t.title}
                aria-pressed={currentTheme === t.mode}
                className={`p-1.5 rounded-md transition-all ${currentTheme === t.mode
                  ? t.on
                  : "border border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
                  }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
