import { useEffect, useState } from "react";
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
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { PipelineItem } from "@/services/pipeline";
import type { calculateStreakAndGoal } from "@/services/streak";
import { getSavedTheme, setTheme, type ThemeMode } from "@/services/theme";
import { CURRENT_VERSION, useUpdateStore } from "@/services/updateService";
import { getXPState, type XPState } from "@/services/smartReview";
import { getDueGrammarLessons } from "@/services/grammarService";
import { useWordsStore } from "@/stores/wordsStore";
import type { DashboardTab, LibraryStats } from "./shared";

interface SidebarProps {
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
  pipelineQueue: PipelineItem[];
  dueCount: number;
  streakStats: ReturnType<typeof calculateStreakAndGoal>;
  libraryStats: LibraryStats;
  onOpenQuickInputPreview?: () => void;
}

/** LEFT SIDEBAR: logo + update badge, navigation, learning stats, Quick Input & theme switcher */
export default function Sidebar({
  activeTab,
  setActiveTab,
  pipelineQueue,
  dueCount,
  streakStats,
  libraryStats,
  onOpenQuickInputPreview,
}: SidebarProps) {
  const words = useWordsStore((s) => s.words);
  const [grammarDueCount, setGrammarDueCount] = useState<number>(0);
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(getSavedTheme);
  const [xpState, setXpState] = useState<XPState>(getXPState);

  const {
    status: updateStatus,
    newVersion,
    downloadProgress,
    dismissed: updateDismissed,
    downloadAndInstall,
    restartApp,
    dismiss: dismissUpdate,
    checkForUpdates,
    errorMessage,
  } = useUpdateStore();

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

  const handleToggleQuickInput = async () => {
    try {
      await invoke("toggle_quick_input");
    } catch {
      if (onOpenQuickInputPreview) {
        onOpenQuickInputPreview();
      }
    }
  };

  return (
    <aside className="w-64 border-r border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 flex flex-col justify-between shrink-0 select-none">
      {/* Top Header */}
      <div className="p-4 space-y-6">
        {/* Logo & App title */}
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
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-600 text-white shadow-sm shadow-cyan-600/30 hover:bg-cyan-700 transition-all shrink-0 cursor-pointer animate-pulse"
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
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">Contextual Tech Vocab</p>
          </div>
        </div>

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

        {/* Navigation Links */}
        <nav className="space-y-1">
          <button
            onClick={() => setActiveTab("library")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === "library"
              ? "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-4 h-4" />
              <span>Vocabulary Library</span>
            </div>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
              {words.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("capture")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === "capture"
              ? "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4" />
              <span>Quick Add (Gemini AI)</span>
            </div>
            {pipelineQueue.some((i) => i.status === "analyzing") && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("review")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === "review"
              ? "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <Flame className="w-4 h-4 text-orange-400" />
              <span>Daily Review (FSRS)</span>
            </div>
            {dueCount > 0 && (
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 font-semibold animate-pulse">
                {dueCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("grammar")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === "grammar"
              ? "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <GraduationCap className="w-4 h-4 text-cyan-500" />
              <span>Grammar (A1-C1)</span>
            </div>
            {grammarDueCount > 0 ? (
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 font-semibold animate-pulse">
                {grammarDueCount}
              </span>
            ) : (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                CEFR
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("analytics")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === "analytics"
              ? "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              <span>Streak & Heatmap</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab("guide")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === "guide"
              ? "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/50"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <Terminal className="w-4 h-4 text-cyan-500" />
              <span>Settings</span>
            </div>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300">
              Setup
            </span>
          </button>
        </nav>

        {/* Quick Learning Stats Widget */}
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-3.5 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-slate-800 dark:text-zinc-300">
            <span className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>Streak & Tiến độ</span>
            </span>
            <span className="font-mono text-orange-600 dark:text-orange-400 text-xs font-bold">
              🔥 {streakStats.currentStreak} ngày
            </span>
          </div>

          {/* Daily Goal Progress Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-zinc-400">
              <span>Mục tiêu hôm nay</span>
              <span>
                {streakStats.todayCount}/{streakStats.dailyGoal} từ
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${streakStats.goalReached ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-cyan-500"
                  }`}
                style={{ width: `${streakStats.goalPercentage}%` }}
              />
            </div>
          </div>

          {/* XP Level Progress */}
          <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-zinc-800/50">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-zinc-400">
              <span className="flex items-center gap-1">
                <span>{xpState.rankEmoji}</span>
                <span className="font-semibold text-amber-700 dark:text-amber-300">Lv.{xpState.level} {xpState.rank}</span>
              </span>
              <span className="text-amber-600 dark:text-amber-400 font-semibold">{xpState.totalXP} XP</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-amber-200/40 dark:bg-amber-900/30 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full transition-all duration-500"
                style={{ width: `${xpState.progressPercent}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center pt-1">
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800 shadow-sm">
              <div className="text-base font-bold text-slate-900 dark:text-white font-mono">{dueCount}</div>
              <div className="text-[10px] text-slate-500 dark:text-zinc-400">Cần ôn</div>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800 shadow-sm">
              <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {libraryStats.learnedCount}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-zinc-400">Đã thuộc</div>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800 shadow-sm">
              <div className={`text-base font-bold font-mono ${libraryStats.leechCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400 dark:text-zinc-500"}`}>
                {libraryStats.leechCount}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-zinc-400">Leech</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom OS Shortcut Tip & Theme Switcher */}
      <div className="p-3 border-t border-slate-200 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/30 space-y-2.5">
        <button
          onClick={handleToggleQuickInput}
          className="w-full flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/80 hover:bg-slate-100 dark:hover:bg-zinc-800/60 transition-colors text-left shadow-sm"
        >
          <div>
            <div className="text-xs font-medium text-slate-800 dark:text-zinc-200">Quick Input</div>
            <div className="text-[11px] text-slate-500 dark:text-zinc-400">Phím tắt toàn cục</div>
          </div>
          <kbd className="px-2 py-1 rounded bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 font-mono text-[11px] text-cyan-700 dark:text-cyan-300">
            ⌘⇧E
          </kbd>
        </button>

        {/* Theme Selector */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800 shadow-sm">
          {/* Segmented Control */}
          <div className="flex items-center bg-slate-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-slate-200 dark:border-zinc-800/80">
            <button
              type="button"
              onClick={() => handleThemeChange("light")}
              title="Giao diện sáng (Light)"
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${currentTheme === "light"
                ? "bg-white text-amber-700 border border-slate-200 shadow-sm"
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
                }`}
            >
              <Sun className="w-3 h-3" />
              <span>Sáng</span>
            </button>

            <button
              type="button"
              onClick={() => handleThemeChange("dark")}
              title="Giao diện tối (Dark)"
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${currentTheme === "dark"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
                }`}
            >
              <Moon className="w-3 h-3" />
              <span>Tối</span>
            </button>

            <button
              type="button"
              onClick={() => handleThemeChange("system")}
              title="Theo hệ thống (System)"
              className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-medium transition-all ${currentTheme === "system"
                ? "bg-white dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-slate-200 dark:border-indigo-500/40 shadow-sm"
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
                }`}
            >
              <Laptop className="w-3 h-3" />
              <span>Hệ thống</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
