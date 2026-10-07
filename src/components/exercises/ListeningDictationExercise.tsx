import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Volume2, CheckCircle2, Snail, Music, XCircle } from "lucide-react";
import { Rating } from "@/services/srs";
import type { WordDetail } from "@/types/database";
import { generateMultipleChoiceQuestion, type MultipleChoiceOption } from "@/services/smartReview";

interface ListeningDictationExerciseProps {
  word: WordDetail;
  allWords: WordDetail[];
  onComplete: (isCorrect: boolean, attempts: number, rating: Rating) => void;
  onSpeak: (text: string, rate?: number) => void;
}

/**
 * Listening recognition: hear the word (not shown) and pick its meaning. This tests understanding the
 * word by ear, which is valid evidence for the recognition card. (Typing a heard word was dictation: it
 * tested spelling, not the meaning, and was wrongly graded as recall.)
 */
export default function ListeningDictationExercise({
  word,
  allWords,
  onComplete,
  onSpeak,
}: ListeningDictationExerciseProps) {
  const question = useMemo(
    () => generateMultipleChoiceQuestion(word, allWords, "en_to_vn"),
    // Options must not reshuffle while answering
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [word.id]
  );
  const [wrongIds, setWrongIds] = useState<Set<string>>(new Set());
  const [isAnswered, setIsAnswered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, []);

  const playAudio = useCallback(
    (rate: number = 0.9) => {
      setIsPlaying(true);
      onSpeak(word.word, rate);
      setTimeout(() => setIsPlaying(false), 900);
    },
    [onSpeak, word.word]
  );

  useEffect(() => {
    setWrongIds(new Set());
    setIsAnswered(false);
    const timer = setTimeout(() => playAudio(0.9), 300);
    return () => clearTimeout(timer);
  }, [word.id]);

  const handleSelect = useCallback(
    (option: MultipleChoiceOption) => {
      if (isAnswered || wrongIds.has(option.id)) return;
      if (option.isCorrect) {
        setIsAnswered(true);
        const attempts = wrongIds.size;
        completeTimerRef.current = setTimeout(() => {
          completeTimerRef.current = null;
          onComplete(attempts === 0, attempts, Rating.Good);
        }, 1400);
      } else {
        setWrongIds((prev) => new Set(prev).add(option.id));
      }
    },
    [isAnswered, wrongIds, onComplete]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAnswered) return;
      const idx = ["1", "2", "3", "4"].indexOf(e.key);
      if (idx >= 0 && question.options[idx]) handleSelect(question.options[idx]);
      if (e.key === "r" || e.key === "R") playAudio(0.9);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAnswered, question.options, handleSelect, playAudio]);

  return (
    <div className="w-full max-w-xl mx-auto space-y-5 animate-in fade-in duration-200">
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-6 text-center space-y-4 shadow-sm">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40">
          <Music className="w-3 h-3" />
          <span>Nghe từ và chọn nghĩa đúng</span>
        </div>

        <div className="flex justify-center">
          <button
            onClick={() => playAudio(0.9)}
            type="button"
            className={`w-20 h-20 rounded-full flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-md ${
              isPlaying
                ? "bg-gradient-to-tr from-cyan-500 to-blue-500 text-white scale-105 ring-4 ring-cyan-500/30 animate-pulse"
                : "bg-slate-100 dark:bg-zinc-800 hover:bg-cyan-50 dark:hover:bg-zinc-700 text-cyan-600 dark:text-cyan-400 border border-slate-200 dark:border-zinc-700"
            }`}
          >
            <Volume2 className="w-8 h-8 mb-0.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Nghe</span>
          </button>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => playAudio(0.6)}
            type="button"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5"
          >
            <Snail className="w-3.5 h-3.5 text-amber-500" />
            <span>Nghe chậm</span>
          </button>
          <span className="text-[11px] text-slate-400 dark:text-zinc-500">Phím R: nghe lại · 1–4: chọn</span>
        </div>

        <div className="min-h-[28px] text-sm">
          {isAnswered ? (
            <span className="font-bold text-slate-900 dark:text-white">
              {word.word} {word.phonetic ? <span className="font-mono text-cyan-600 dark:text-cyan-400 text-xs">{word.phonetic}</span> : null}
            </span>
          ) : (
            <span className="text-[11px] text-slate-400 dark:text-zinc-500">Từ sẽ hiện sau khi bạn trả lời</span>
          )}
        </div>
      </div>

      <div className="grid gap-2.5">
        {question.options.map((o, idx) => {
          const wrong = wrongIds.has(o.id);
          const right = isAnswered && o.isCorrect;
          return (
            <button
              key={o.id}
              onClick={() => handleSelect(o)}
              disabled={isAnswered || wrong}
              className={`w-full p-3.5 rounded-xl border text-left text-sm transition-all flex items-center gap-3 ${
                right
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100"
                  : wrong
                  ? "border-rose-300 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 opacity-70"
                  : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-cyan-400 text-slate-800 dark:text-zinc-200"
              }`}
            >
              <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-zinc-800 text-[11px] font-mono flex items-center justify-center shrink-0">
                {idx + 1}
              </span>
              <span className="flex-1">{o.text}</span>
              {right && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              {wrong && <XCircle className="w-4 h-4 text-rose-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
