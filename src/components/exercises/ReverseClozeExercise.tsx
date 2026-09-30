import { useState, useEffect, useMemo } from "react";
import { Volume2, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { Rating } from "@/services/srs";
import type { WordDetail } from "@/types/database";
import { cleanMeaningForOption } from "@/services/smartReview";

interface ReverseClozeExerciseProps {
  word: WordDetail;
  allWords: WordDetail[];
  onComplete: (isCorrect: boolean, attempts: number, rating: Rating) => void;
  onSpeak: (text: string) => void;
  onFallback: () => void;
}

export default function ReverseClozeExercise({
  word,
  allWords,
  onComplete,
  onSpeak,
  onFallback,
}: ReverseClozeExerciseProps) {
  const example = word.examples?.[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [shakeIdx, setShakeIdx] = useState<number | null>(null);

  // Fallback if no example sentence
  useEffect(() => {
    if (!example || !example.sentence_en || example.sentence_en.trim().length === 0) {
      onFallback();
    }
  }, [example, onFallback]);

  // Options generation
  const options = useMemo(() => {
    const correctOption = {
      id: word.id,
      text: cleanMeaningForOption(word.meaning_vn),
      isCorrect: true,
    };

    const otherWords = allWords.filter(
      (w) => w.id !== word.id && w.meaning_vn.trim().length > 0
    );
    const shuffledOthers = [...otherWords].sort(() => 0.5 - Math.random());

    const distractorOptions = shuffledOthers.slice(0, 3).map((w) => ({
      id: w.id,
      text: cleanMeaningForOption(w.meaning_vn),
      isCorrect: false,
    }));

    // Fallbacks
    const generic = ["Khả năng xử lý song song", "Bộ đệm lưu trữ tạm", "Độ trễ truyền tải mạng", "Kế thừa đa hình"];
    let fIdx = 0;
    while (distractorOptions.length < 3) {
      distractorOptions.push({
        id: `fb-${fIdx}`,
        text: generic[fIdx % generic.length],
        isCorrect: false,
      });
      fIdx++;
    }

    return [correctOption, ...distractorOptions].sort(() => 0.5 - Math.random());
  }, [word, allWords]);

  useEffect(() => {
    setSelectedId(null);
    setIsAnswered(false);
    setWrongAttempts(0);
    setShakeIdx(null);
  }, [word]);

  if (!example || !example.sentence_en) return null;

  const handleSelect = (opt: { id: string; text: string; isCorrect: boolean }, idx: number) => {
    if (isAnswered) return;
    setSelectedId(opt.id);

    if (opt.isCorrect) {
      setIsAnswered(true);
      onSpeak(word.word);

      let rating: Rating = Rating.Easy;
      if (wrongAttempts === 0) rating = Rating.Easy;
      else if (wrongAttempts === 1) rating = Rating.Good;
      else rating = Rating.Hard;

      setTimeout(() => {
        onComplete(true, wrongAttempts, rating);
      }, 900);
    } else {
      setWrongAttempts((prev) => prev + 1);
      setShakeIdx(idx);
      setTimeout(() => setShakeIdx(null), 400);
    }
  };

  // Highlight target word in sentence
  const renderSentenceWithHighlight = () => {
    const rawSentence = example.sentence_en;
    const regex = new RegExp(`(\\b${word.word}(?:s|es|ed|ing|d)?\\b)`, "gi");
    const parts = rawSentence.split(regex);

    return parts.map((part, i) => {
      if (part.toLowerCase().startsWith(word.word.toLowerCase().slice(0, Math.min(word.word.length, 4)))) {
        return (
          <span
            key={i}
            className="font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-200 dark:border-cyan-800 underline decoration-cyan-400 decoration-2"
          >
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="w-full max-w-xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Context Sentence Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-6 md:p-8 space-y-4 shadow-sm text-center">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-400 border border-cyan-200/50 dark:border-cyan-800/40">
          <Sparkles className="w-3 h-3" />
          <span>Ngữ cảnh câu thực tế (Reverse Cloze)</span>
        </div>

        <div className="text-base md:text-lg font-medium text-slate-800 dark:text-zinc-200 leading-relaxed">
          "{renderSentenceWithHighlight()}"
        </div>

        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            onClick={() => onSpeak(example.sentence_en)}
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-slate-600 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 transition-colors"
          >
            <Volume2 className="w-3.5 h-3.5 text-cyan-500" />
            <span>Nghe câu ví dụ</span>
          </button>
        </div>

        <p className="text-xs text-slate-400 dark:text-zinc-500 border-t border-slate-100 dark:border-zinc-800 pt-3">
          Từ được gạch chân mang nghĩa là gì trong câu trên?
        </p>
      </div>

      {/* 4 Choices */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {options.map((opt, idx) => {
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
              "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-cyan-400 text-slate-800 dark:text-zinc-200 hover:shadow-sm";
          }

          if (isShake) btnClasses += " animate-shake";

          return (
            <button
              key={opt.id}
              onClick={() => handleSelect(opt, idx)}
              disabled={isAnswered}
              className={btnClasses}
            >
              <span
                className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-xs font-mono font-bold ${
                  showSuccess
                    ? "bg-emerald-500 text-white"
                    : showFail
                    ? "bg-rose-500 text-white"
                    : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400"
                }`}
              >
                {idx + 1}
              </span>
              <p className="text-sm font-medium leading-snug flex-1">{opt.text}</p>
              {showSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
              {showFail && <XCircle className="w-5 h-5 text-rose-500 shrink-0" />}
            </button>
          );
        })}
      </div>

      {wrongAttempts > 0 && !isAnswered && (
        <p className="text-center text-xs text-amber-500 font-medium">
          Chưa đúng, hãy thử lại phương án khác!
        </p>
      )}
    </div>
  );
}
