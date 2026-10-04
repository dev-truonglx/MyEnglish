import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Volume2, CheckCircle2, XCircle, Sparkles, HelpCircle } from "lucide-react";
import { Rating } from "@/services/srs";
import type { WordDetail } from "@/types/database";
import {
  generateMultipleChoiceQuestion,
  type MultipleChoiceQuestion,
  type MultipleChoiceOption,
} from "@/services/smartReview";

interface MultipleChoiceExerciseProps {
  word: WordDetail;
  allWords: WordDetail[];
  onComplete: (isCorrect: boolean, attempts: number, rating: Rating) => void;
  onSpeak: (text: string) => void;
}

export default function MultipleChoiceExercise({
  word,
  allWords,
  onComplete,
  onSpeak,
}: MultipleChoiceExerciseProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [shakeIdx, setShakeIdx] = useState<number | null>(null);

  // Pending completion timer, cleared on unmount so a stale card is never graded
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, []);

  // Generate question (prompt alternates between English -> Vietnamese or Vietnamese -> English)
  const questionData: MultipleChoiceQuestion = useMemo(() => {
    // 70% EN -> VN, 30% VN -> EN
    const type = Math.random() < 0.7 ? "en_to_vn" : "vn_to_en";
    return generateMultipleChoiceQuestion(word, allWords, type);
  }, [word, allWords]);

  // Reset state on word change
  useEffect(() => {
    setSelectedId(null);
    setIsAnswered(false);
    setWrongAttempts(0);
    setShakeIdx(null);
  }, [word]);

  const handleSelectOption = useCallback(
    (option: MultipleChoiceOption, index: number) => {
      if (isAnswered) return;

      setSelectedId(option.id);

      if (option.isCorrect) {
        setIsAnswered(true);
        onSpeak(word.word);

        // Grade rating
        let rating: Rating = Rating.Easy;
        if (wrongAttempts === 0) {
          rating = Rating.Easy;
        } else if (wrongAttempts === 1) {
          rating = Rating.Good;
        } else {
          rating = Rating.Hard;
        }

        if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
        completeTimerRef.current = setTimeout(() => {
          completeTimerRef.current = null;
          onComplete(true, wrongAttempts, rating);
        }, 900);
      } else {
        setWrongAttempts((prev) => prev + 1);
        setShakeIdx(index);
        setTimeout(() => setShakeIdx(null), 400);
      }
    },
    [isAnswered, onSpeak, word.word, wrongAttempts, onComplete]
  );

  // Keyboard shortcuts 1, 2, 3, 4
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAnswered) return;
      const key = e.key;
      if (["1", "2", "3", "4"].includes(key)) {
        const idx = parseInt(key, 10) - 1;
        if (questionData.options[idx]) {
          handleSelectOption(questionData.options[idx], idx);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAnswered, questionData.options, handleSelectOption]);

  return (
    <div className="w-full max-w-xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Question Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-6 md:p-8 text-center space-y-3 shadow-sm relative overflow-hidden">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-400 border border-cyan-200/50 dark:border-cyan-800/40">
          <Sparkles className="w-3 h-3" />
          <span>{questionData.subPrompt}</span>
        </div>

        <div className="flex items-center justify-center gap-3">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            {questionData.question}
          </h2>
          {questionData.promptType === "en_to_vn" && (
            <button
              onClick={() => onSpeak(word.word)}
              type="button"
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-cyan-500 transition-colors"
              title="Phát âm"
            >
              <Volume2 className="w-5 h-5" />
            </button>
          )}
        </div>

        {questionData.phonetic && (
          <p className="text-sm font-mono text-slate-400 dark:text-zinc-500">
            {questionData.phonetic}
          </p>
        )}

        {questionData.partOfSpeech && (
          <p className="text-xs italic text-slate-400 dark:text-zinc-500">
            {questionData.partOfSpeech}
          </p>
        )}
      </div>

      {/* 4 Choices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {questionData.options.map((opt, idx) => {
          const isSelected = selectedId === opt.id;
          const isShake = shakeIdx === idx;
          const showSuccess = isAnswered && opt.isCorrect;
          const showFail = isSelected && !opt.isCorrect;

          let btnClasses =
            "rounded-xl border p-4 text-left transition-all duration-150 flex items-start gap-3 relative ";
          if (showSuccess) {
            btnClasses +=
              "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 shadow-md ring-2 ring-emerald-500/30";
          } else if (showFail) {
            btnClasses +=
              "border-rose-400 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200";
          } else {
            btnClasses +=
              "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-cyan-400 dark:hover:border-cyan-600 text-slate-800 dark:text-zinc-200 hover:shadow-sm";
          }

          if (isShake) {
            btnClasses += " animate-shake";
          }

          return (
            <button
              key={opt.id}
              onClick={() => handleSelectOption(opt, idx)}
              disabled={isAnswered}
              className={btnClasses}
            >
              <span
                className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-xs font-mono font-bold transition-colors ${
                  showSuccess
                    ? "bg-emerald-500 text-white"
                    : showFail
                    ? "bg-rose-500 text-white"
                    : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400"
                }`}
              >
                {idx + 1}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug break-words">{opt.text}</p>
              </div>

              {/* Reserved icon slot so text width and button height never shift */}
              <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                {showSuccess && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 animate-in zoom-in duration-150" />
                )}
                {showFail && <XCircle className="w-5 h-5 text-rose-500 shrink-0 animate-in zoom-in duration-150" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Helpful Hint - fixed height h-7 so it NEVER jumps */}
      <div className="flex items-center justify-between text-xs text-slate-400 dark:text-zinc-500 px-2 h-7 min-h-[28px]">
        <span className="flex items-center gap-1">
          <HelpCircle className="w-3.5 h-3.5" />
          Phím tắt: bấm <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-[10px] font-mono">1</kbd> - <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-[10px] font-mono">4</kbd>
        </span>
        {wrongAttempts > 0 && !isAnswered ? (
          <span className="text-amber-500 dark:text-amber-400 font-semibold animate-in fade-in duration-150">
            Chưa đúng ({wrongAttempts} lần thử) — Hãy chọn lại!
          </span>
        ) : (
          <span className="text-[11px] text-slate-400 dark:text-zinc-500">
            Chọn 1 trong 4 đáp án
          </span>
        )}
      </div>
    </div>
  );
}
