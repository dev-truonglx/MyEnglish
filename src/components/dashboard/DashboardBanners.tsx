import { Sparkles, BookOpen, X, Flame } from "lucide-react";
import type { AutoReplenishSummary } from "@/services/autoReplenish";
import type { DashboardTab } from "./shared";

export interface GlobalToastData {
  title: string;
  body: string;
  target?: string;
}

interface GlobalToastProps {
  globalToast: GlobalToastData;
  handleOpenReview: (autoStartFlashcard?: boolean) => void;
  setGlobalToast: (toast: GlobalToastData | null) => void;
}

/** GLOBAL NOTIFICATION INTERACTIVE TOAST */
export function GlobalToast({ globalToast, handleOpenReview, setGlobalToast }: GlobalToastProps) {
  return (
    <div
      onClick={() => handleOpenReview(false)}
      className="fixed top-5 right-5 z-50 max-w-sm w-full bg-white dark:bg-zinc-900 border-2 border-orange-500/80 rounded-2xl shadow-2xl p-4 flex items-start gap-3 cursor-pointer hover:scale-[1.02] hover:shadow-orange-500/20 transition-all animate-in slide-in-from-top-4 duration-300 backdrop-blur-xl"
    >
      <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
        <Flame className="w-5 h-5 animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">{globalToast.title}</h4>
          <span className="text-[10px] text-orange-500 font-mono font-semibold">Ôn tập ngay →</span>
        </div>
        <p className="text-xs text-slate-600 dark:text-zinc-300 mt-1 leading-snug">{globalToast.body}</p>
        <div className="mt-2.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenReview(true);
            }}
            className="w-full py-1.5 px-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Mở Flashcard ôn tập ngay</span>
          </button>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setGlobalToast(null);
        }}
        className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

interface AutoReplenishBannerProps {
  autoReplenishBanner: AutoReplenishSummary;
  setActiveTab: (tab: DashboardTab) => void;
  setAutoReplenishBanner: (banner: AutoReplenishSummary | null) => void;
}

/** SMART AUTO-REPLENISH BANNER NOTIFICATION */
export function AutoReplenishBanner({
  autoReplenishBanner,
  setActiveTab,
  setAutoReplenishBanner,
}: AutoReplenishBannerProps) {
  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 max-w-lg w-[92%] bg-white dark:bg-zinc-900 border-2 border-cyan-500/90 rounded-2xl shadow-2xl p-4 flex items-start gap-3.5 animate-in slide-in-from-top-4 duration-300 backdrop-blur-xl">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-cyan-500/30">
        <Sparkles className="w-5 h-5 animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <h4 className="text-xs font-black text-slate-900 dark:text-white truncate">
            🎉 Đã Tự Động Bổ Sung Bài Học Cấp Độ [{autoReplenishBanner.level}]
          </h4>
          <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-300 dark:border-cyan-800">
            AI Adaptive
          </span>
        </div>
        <p className="text-xs text-slate-600 dark:text-zinc-300 mt-1 leading-snug">
          Bạn đang học rất chăm chỉ! Hệ thống vừa tự động bổ sung <strong>{autoReplenishBanner.words.length} từ vựng mới</strong> ({autoReplenishBanner.words.join(", ")})
          {autoReplenishBanner.grammarTopic ? ` & bài tập ngữ pháp "${autoReplenishBanner.grammarTopic}"` : ""}.
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <button
            onClick={() => {
              setActiveTab("library");
              setAutoReplenishBanner(null);
            }}
            className="flex-1 py-1.5 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Xem kho từ vựng</span>
          </button>
          <button
            onClick={() => {
              setActiveTab("analytics");
              setAutoReplenishBanner(null);
            }}
            className="py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 font-semibold text-xs transition-colors"
          >
            Xem đánh giá CEFR
          </button>
        </div>
      </div>
      <button
        onClick={() => setAutoReplenishBanner(null)}
        className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
