import { ChevronLeft, Layers, FileCode, Keyboard, Sparkles, Headphones } from "lucide-react";
import type { ReviewCard } from "@/types/database";
import type { StudyMode } from "@/hooks/useReviewSession";

interface ReviewTopBarProps {
  onExit: () => void;
  mode: StudyMode;
  handleModeChange: (newMode: StudyMode) => void;
  currentIndex: number;
  queue: ReviewCard[];
  currentWord: ReviewCard;
  practiceMode: boolean;
}

/** Top Bar with Mode Selector & Progress */
export default function ReviewTopBar({
  onExit,
  mode,
  handleModeChange,
  currentIndex,
  queue,
  currentWord,
  practiceMode,
}: ReviewTopBarProps) {
  return (
    <div className="w-full shrink-0 mb-3 flex items-center justify-between flex-wrap gap-3">
      <button
        onClick={onExit}
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>Thoát</span>
      </button>

      {/* Study Mode Selector */}
      <div className="flex items-center bg-slate-100 dark:bg-zinc-900/90 p-1 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm overflow-x-auto max-w-full gap-1">
        <button
          onClick={() => handleModeChange("mixed")}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all ${
            mode === "mixed"
              ? "bg-white dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-slate-200 dark:border-amber-500/40 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
          }`}
          title="Tự động chọn dạng bài tập tối ưu theo FSRS (Khuyên dùng)"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Thích ứng</span>
        </button>

        <button
          onClick={() => handleModeChange("flip")}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all ${
            mode === "flip"
              ? "bg-white dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-slate-200 dark:border-cyan-500/40 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Thẻ lật</span>
        </button>

        <button
          onClick={() => handleModeChange("multiple_choice")}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all ${
            mode === "multiple_choice"
              ? "bg-white dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-blue-500/40 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
          }`}
        >
          <span>🎯 Trắc nghiệm</span>
        </button>

        <button
          onClick={() => handleModeChange("meaning_match")}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all ${
            mode === "meaning_match"
              ? "bg-white dark:bg-pink-500/20 text-pink-700 dark:text-pink-300 border border-slate-200 dark:border-pink-500/40 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
          }`}
        >
          <span>🔗 Nối từ</span>
        </button>

        <button
          onClick={() => handleModeChange("cloze")}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all ${
            mode === "cloze"
              ? "bg-white dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-slate-200 dark:border-indigo-500/40 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>Điền từ</span>
        </button>

        <button
          onClick={() => handleModeChange("spelling")}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all ${
            mode === "spelling"
              ? "bg-white dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-slate-200 dark:border-emerald-500/40 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
          }`}
        >
          <Keyboard className="w-3.5 h-3.5" />
          <span>Luyện gõ</span>
        </button>

        <button
          onClick={() => handleModeChange("sentence_builder")}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all ${
            mode === "sentence_builder"
              ? "bg-white dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-slate-200 dark:border-purple-500/40 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
          }`}
        >
          <span>🧩 Ghép câu</span>
        </button>

        <button
          onClick={() => handleModeChange("listening")}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all ${
            mode === "listening"
              ? "bg-white dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-slate-200 dark:border-rose-500/40 shadow-sm"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
          }`}
        >
          <Headphones className="w-3.5 h-3.5" />
          <span>Luyện nghe</span>
        </button>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-3">
        <div className="text-xs font-mono text-slate-500 dark:text-zinc-400">
          Thẻ <span className="text-slate-900 dark:text-white font-bold">{currentIndex + 1}</span> / {queue.length}
          {currentWord && (
            <span
              className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300"
              title={
                currentWord.direction === "production"
                  ? "Thẻ nhớ lại: tự viết/nghe ra từ tiếng Anh (lịch ôn riêng)"
                  : "Thẻ nhận diện: hiểu nghĩa khi gặp từ (lịch ôn riêng)"
              }
            >
              {currentWord.direction === "production" ? "Nhớ lại" : "Nhận diện"}
            </span>
          )}
          {practiceMode && (
            <span
              className="ml-2 px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300"
              title="Không có từ đến hạn — phiên này không thay đổi lịch ôn FSRS"
            >
              Luyện thêm
            </span>
          )}
        </div>
        <div className="w-24 h-2 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / queue.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
