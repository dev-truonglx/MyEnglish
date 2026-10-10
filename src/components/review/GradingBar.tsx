import { SkipForward } from "lucide-react";
import { Rating, type IntervalPreviews } from "@/services/srs";
import type { ExerciseType } from "@/services/smartReview";
import { isSimpleMode } from "@/services/learnerProfile";
import { EXERCISE_LABEL_VN } from "./exerciseLabels";

interface GradingBarProps {
  effectiveExerciseType: ExerciseType;
  handleGrade: (rating: Rating, overrideExerciseType?: ExerciseType, attempts?: number) => void;
  isAdvancing: boolean;
  isFlipped: boolean;
  setIsFlipped: (value: boolean) => void;
  hasCheckedAnswer: boolean;
  isCorrect: boolean | null;
  intervalPreviews: IntervalPreviews;
  handleCheckAnswer: () => void;
  userInput: string;
  /** After "Xem đáp án" the word was not recalled: only Again is a truthful grade */
  onlyAgain: boolean;
  /** Easy is offered only for production (recall) cards; recognition is capped at Good */
  allowEasy: boolean;
  /** Grade of a correct typed answer waiting for the user to continue */
  pendingRating: Rating | null;
  onContinue: () => void;
  /** A new word's introduction card: one "continue" button, nothing is graded */
  introMode?: boolean;
  onIntroDone?: () => void;
}

/** BOTTOM ACTION BAR - Always present with fixed height (h-14) so card NEVER jumps */
export default function GradingBar({
  effectiveExerciseType,
  handleGrade,
  isAdvancing,
  isFlipped,
  setIsFlipped,
  hasCheckedAnswer,
  isCorrect,
  intervalPreviews,
  handleCheckAnswer,
  userInput,
  onlyAgain,
  allowEasy,
  pendingRating,
  onContinue,
  introMode = false,
  onIntroDone,
}: GradingBarProps) {
  // Simple mode: Vietnamese labels only (no Again/Hard/Good/Easy, no exercise code names)
  const simple = isSimpleMode();
  return (
    <div className="w-full mt-3 h-14 shrink-0 flex items-center justify-center">
      {introMode ? (
        <button
          onClick={onIntroDone}
          disabled={isAdvancing}
          autoFocus
          className="w-full h-full rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-md"
        >
          <span>Đã đọc kỹ từ mới — học tiếp (sẽ hỏi lại sau vài thẻ)</span>
          <kbd className="px-2 py-0.5 rounded bg-white/20 text-[11px] font-mono">Enter ↵</kbd>
        </button>
      ) : pendingRating !== null ? (
        <button
          onClick={onContinue}
          disabled={isAdvancing}
          autoFocus
          className="w-full h-full rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-slate-900 disabled:opacity-40 text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-md"
        >
          <span>Tiếp tục</span>
          <span className="text-[11px] opacity-70">
            (gặp lại sau {intervalPreviews[pendingRating as keyof IntervalPreviews]})
          </span>
          <kbd className="px-2 py-0.5 rounded bg-white/20 dark:bg-black/10 text-[11px] font-mono">Enter ↵</kbd>
        </button>
      ) : ["multiple_choice", "sentence_builder", "context_match", "meaning_match", "listening", "reverse_cloze", "free_writing", "letter_tiles"].includes(
        effectiveExerciseType
      ) ? (
        <div className="w-full flex items-center justify-between px-3">
          <button
            onClick={() => handleGrade(Rating.Again, effectiveExerciseType)}
            disabled={isAdvancing}
            className="text-xs text-slate-400 hover:text-rose-500 font-medium flex items-center gap-1.5 transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5" />
            <span>Chưa nhớ từ này, bỏ qua</span>
          </button>
          <div className="text-[11px] text-slate-400 dark:text-zinc-500">
            {EXERCISE_LABEL_VN[effectiveExerciseType]}
          </div>
        </div>
      ) : (effectiveExerciseType === "flip" ? isFlipped : hasCheckedAnswer) ? (
        <div className="w-full grid grid-cols-4 gap-3 h-full animate-in slide-in-from-bottom-2 duration-150 [&>button:disabled]:opacity-40 [&>button:disabled]:cursor-not-allowed">
          {/* Again: Rating.Again (1) */}
          <button
            onClick={() => handleGrade(Rating.Again)}
            disabled={isAdvancing}
            className={`p-2 md:p-3 rounded-2xl border text-xs flex flex-col items-center justify-center gap-0.5 transition-colors shadow-sm ${
              !isCorrect && effectiveExerciseType !== "flip"
                ? "border-rose-400 dark:border-rose-500 bg-rose-100 dark:bg-rose-900/60 text-rose-900 dark:text-rose-200 ring-2 ring-rose-500/30 font-bold"
                : "border-rose-200 dark:border-rose-800/80 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-medium"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-bold">Quên</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-rose-200/70 dark:bg-rose-800/60 text-rose-900 dark:text-rose-100 font-mono font-bold">
                {intervalPreviews[Rating.Again]}
              </span>
            </div>
            <span className="text-[10px] text-rose-600 dark:text-rose-400/80 font-mono">{simple ? "phím 1" : "Again (1)"}</span>
          </button>

          {/* Hard: Rating.Hard (2) */}
          <button
            onClick={() => handleGrade(Rating.Hard)}
            disabled={isAdvancing || onlyAgain}
            title={onlyAgain ? "Đã xem đáp án: chỉ chấm Quên" : undefined}
            className="p-2 md:p-3 rounded-2xl border border-amber-200 dark:border-amber-800/80 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-medium text-xs flex flex-col items-center justify-center gap-0.5 transition-colors shadow-sm"
          >
            <div className="flex items-center gap-1.5">
              <span className="font-bold">Khó</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-amber-200/70 dark:bg-amber-800/60 text-amber-900 dark:text-amber-100 font-mono font-bold">
                {intervalPreviews[Rating.Hard]}
              </span>
            </div>
            <span className="text-[10px] text-amber-700 dark:text-amber-400/80 font-mono">{simple ? "phím 2" : "Hard (2)"}</span>
          </button>

          {/* Good: Rating.Good (3) */}
          <button
            onClick={() => handleGrade(Rating.Good)}
            disabled={isAdvancing || onlyAgain}
            title={onlyAgain ? "Đã xem đáp án: chỉ chấm Quên" : undefined}
            className={`p-2 md:p-3 rounded-2xl border text-xs flex flex-col items-center justify-center gap-0.5 transition-colors shadow-sm ${
              isCorrect
                ? "border-blue-400 dark:border-blue-500 bg-blue-100 dark:bg-blue-900/60 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/30 font-bold"
                : "border-blue-200 dark:border-blue-800/80 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-800 dark:text-blue-300 font-medium"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-bold">Nhớ</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-blue-200/70 dark:bg-blue-800/60 text-blue-900 dark:text-blue-100 font-mono font-bold">
                {intervalPreviews[Rating.Good]}
              </span>
            </div>
            <span className="text-[10px] text-blue-700 dark:text-blue-400/80 font-mono">{simple ? "phím 3" : "Good (3)"}</span>
          </button>

          {/* Easy: Rating.Easy (4) */}
          <button
            onClick={() => handleGrade(Rating.Easy)}
            disabled={isAdvancing || onlyAgain || !allowEasy}
            title={
              onlyAgain ? "Đã xem đáp án: chỉ chấm Quên" : !allowEasy ? "Bài hiểu nghĩa chấm tối đa là Nhớ" : undefined
            }
            className="p-2 md:p-3 rounded-2xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-medium text-xs flex flex-col items-center justify-center gap-0.5 transition-colors shadow-sm"
          >
            <div className="flex items-center gap-1.5">
              <span className="font-bold">Dễ</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-emerald-200/70 dark:bg-emerald-800/60 text-emerald-900 dark:text-emerald-100 font-mono font-bold">
                {intervalPreviews[Rating.Easy]}
              </span>
            </div>
            <span className="text-[10px] text-emerald-700 dark:text-emerald-400/80 font-mono">{simple ? "phím 4" : "Easy (4)"}</span>
          </button>
        </div>
      ) : effectiveExerciseType === "flip" ? (
        <button
          onClick={() => setIsFlipped(true)}
          className="w-full h-full rounded-2xl bg-white hover:bg-slate-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-slate-300 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
        >
          <span>Lật thẻ xem đáp án</span>
          <kbd className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-[11px] font-mono text-slate-700 dark:text-zinc-300">
            Space
          </kbd>
        </button>
      ) : effectiveExerciseType === "cloze" ? (
        <button
          onClick={handleCheckAnswer}
          disabled={!userInput.trim() || isAdvancing}
          className="w-full h-full rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-600/20"
        >
          <span>Kiểm tra đáp án</span>
          <kbd className="px-2 py-0.5 rounded bg-indigo-700/60 border border-indigo-400/40 text-[11px] font-mono text-indigo-100">
            Enter ↵
          </kbd>
        </button>
      ) : (
        <button
          onClick={handleCheckAnswer}
          disabled={!userInput.trim() || isAdvancing}
          className="w-full h-full rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/20"
        >
          <span>Kiểm tra chính tả</span>
          <kbd className="px-2 py-0.5 rounded bg-emerald-700/60 border border-emerald-400/40 text-[11px] font-mono text-emerald-100">
            Enter ↵
          </kbd>
        </button>
      )}
    </div>
  );
}
