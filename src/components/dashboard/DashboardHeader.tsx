import { useState, type RefObject } from "react";
import { Sparkles, Search, RefreshCw, Plus, X, Flame, LayoutGrid, List, Target, Loader2 } from "lucide-react";
import type { calculateStreakAndGoal } from "@/services/streak";
import { triggerAutoReplenish } from "@/services/autoReplenish";
import { useWordsStore } from "@/stores/wordsStore";
import type { GlobalToastData } from "./DashboardBanners";
import type { DashboardTab, FilterMode, LibraryStats, ViewMode } from "./shared";

interface DashboardHeaderProps {
  searchInputRef: RefObject<HTMLInputElement>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  filterMode: FilterMode;
  setFilterMode: (mode: FilterMode) => void;
  streakStats: ReturnType<typeof calculateStreakAndGoal>;
  dueCount: number;
  libraryStats: LibraryStats;
  effectiveLevel: string;
  setGlobalToast: (toast: GlobalToastData | null) => void;
}

/** Top App Bar: search, streak indicator, view/filter toggles, refresh, auto-replenish, add word */
export default function DashboardHeader({
  searchInputRef,
  searchQuery,
  setSearchQuery,
  activeTab,
  setActiveTab,
  viewMode,
  setViewMode,
  filterMode,
  setFilterMode,
  streakStats,
  dueCount,
  libraryStats,
  effectiveLevel,
  setGlobalToast,
}: DashboardHeaderProps) {
  const loading = useWordsStore((s) => s.loading);
  const refreshWords = useWordsStore((s) => s.refreshWords);
  const [isQuickReplenishing, setIsQuickReplenishing] = useState(false);

  const handleQuickReplenish = async () => {
    if (isQuickReplenishing) return;
    setIsQuickReplenishing(true);
    try {
      const res = await triggerAutoReplenish(useWordsStore.getState().words, true);
      if (res.success) {
        refreshWords();
      } else {
        setGlobalToast({
          title: "Thông báo sinh bài học AI",
          body: res.message,
        });
      }
    } catch (err) {
      setGlobalToast({
        title: "Lỗi kết nối Gemini CLI",
        body: "Không thể gọi Gemini CLI để sinh bài học mới. Vui lòng kiểm tra lại CLI binary.",
      });
    } finally {
      setIsQuickReplenishing(false);
    }
  };

  return (
    <header className="h-14 border-b border-slate-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/40 px-6 flex items-center justify-between shrink-0 backdrop-blur-md">
      {/* Search Bar */}
      <div className="flex-1 max-w-md relative">
        <Search className="w-4 h-4 text-slate-400 dark:text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm kiếm từ, nghĩa, hoặc từ đồng nghĩa... (nhấn / để tìm)"
          className="w-full bg-slate-100/80 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 rounded-lg pl-9 pr-14 py-1.5 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
        />
        {searchQuery ? (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-mono text-slate-400 dark:text-zinc-500 pointer-events-none">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 text-slate-600 dark:text-zinc-400">/</kbd>
          </div>
        )}
      </div>

      {/* Right Header Controls */}
      <div className="flex items-center gap-3">
        {/* Streak & Daily Goal Quick Indicator */}
        <button
          onClick={() => setActiveTab("analytics")}
          title={`Chuỗi: ${streakStats.currentStreak} ngày • Hôm nay: ${streakStats.todayCount}/${streakStats.dailyGoal} từ (Click để xem chi tiết)`}
          className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 text-xs transition-colors shadow-sm"
        >
          <div className="flex items-center gap-1 font-mono font-bold text-orange-600 dark:text-orange-400">
            <Flame className="w-3.5 h-3.5" />
            <span>{streakStats.currentStreak}</span>
          </div>
          <div className="w-[1px] h-3 bg-slate-200 dark:bg-zinc-800" />
          <div className="flex items-center gap-1.5 font-mono text-slate-700 dark:text-zinc-300">
            <Target className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
            <span>
              {streakStats.todayCount}/{streakStats.dailyGoal}
            </span>
            {streakStats.goalReached && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </div>
        </button>
        {/* View Mode Toggle (Gallery vs Data Grid Table) */}
        {activeTab === "library" && (
          <div className="flex items-center bg-slate-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-slate-200 dark:border-zinc-800">
            <button
              onClick={() => setViewMode("gallery")}
              title="Card Gallery View"
              className={`p-1.5 rounded-md transition-colors ${viewMode === "gallery"
                ? "bg-white dark:bg-zinc-800 text-cyan-700 dark:text-cyan-400 shadow-sm border border-slate-200 dark:border-transparent"
                : "text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200"
                }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              title="Data Grid Table View"
              className={`p-1.5 rounded-md transition-colors ${viewMode === "table"
                ? "bg-white dark:bg-zinc-800 text-cyan-700 dark:text-cyan-400 shadow-sm border border-slate-200 dark:border-transparent"
                : "text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200"
                }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-slate-300 dark:border-zinc-800">
          <button
            onClick={() => setFilterMode("all")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${filterMode === "all"
              ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-transparent font-medium"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterMode("due")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${filterMode === "due"
              ? "bg-white dark:bg-zinc-800 text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200 dark:border-transparent font-medium"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              }`}
          >
            Due
            {dueCount > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            )}
          </button>
          <button
            onClick={() => setFilterMode("mastered")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${filterMode === "mastered"
              ? "bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-transparent font-medium"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              }`}
          >
            Mastered
          </button>
          <button
            onClick={() => setFilterMode("leech")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${filterMode === "leech"
              ? "bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 shadow-sm border border-slate-200 dark:border-transparent font-medium"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
              }`}
          >
            🐛 Leech
            {libraryStats.leechCount > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>
        </div>

        {/* Refresh */}
        <button
          onClick={() => refreshWords({ showLoading: true })}
          disabled={loading}
          title="Refresh vocabulary"
          className="p-1.5 rounded-lg border border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-cyan-600 dark:text-cyan-400" : ""}`} />
        </button>

        {/* Quick Auto-Replenish Button */}
        <button
          onClick={handleQuickReplenish}
          disabled={isQuickReplenishing}
          title={`Tự động sinh 3 từ vựng & bài tập ngữ pháp chuẩn cấp độ ${effectiveLevel}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isQuickReplenishing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Đang sinh...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-yellow-200" />
              <span>Bổ sung ngay</span>
              <span className="text-[10px] bg-black/25 text-white px-1.5 py-0.5 rounded font-mono font-bold">
                {effectiveLevel}
              </span>
            </>
          )}
        </button>

        {/* Add Word Button */}
        <button
          onClick={() => setActiveTab("capture")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold shadow-sm transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Word</span>
        </button>
      </div>
    </header>
  );
}
