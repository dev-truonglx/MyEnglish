import { useState, useEffect, useMemo, useRef } from "react";
import { CheckCircle2, RotateCcw, Link2, AlertCircle } from "lucide-react";
import { Rating } from "@/services/srs";
import type { WordDetail } from "@/types/database";
import { prepareContextMatch, type ContextMatchPair } from "@/services/smartReview";

interface ContextMatchExerciseProps {
  word: WordDetail;
  allWords: WordDetail[];
  onComplete: (isCorrect: boolean, attempts: number, rating: Rating) => void;
  onSpeak: (text: string) => void;
  onFallback: () => void;
}

const PAIR_COLORS = [
  {
    badge: "bg-cyan-500 text-white",
    border: "border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/40",
  },
  {
    badge: "bg-purple-500 text-white",
    border: "border-purple-500 bg-purple-50/50 dark:bg-purple-950/40",
  },
  {
    badge: "bg-amber-500 text-white",
    border: "border-amber-500 bg-amber-50/50 dark:bg-amber-950/40",
  },
];

export default function ContextMatchExercise({
  word,
  allWords,
  onComplete,
  onSpeak,
  onFallback,
}: ContextMatchExerciseProps) {
  const pairs: ContextMatchPair[] = useMemo(() => {
    return prepareContextMatch(word, allWords);
  }, [word, allWords]);

  const [shuffledSentences, setShuffledSentences] = useState<ContextMatchPair[]>([]);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  // Map wordId -> sentence wordId
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [wrongAttempts, setWrongAttempts] = useState(0);

  const onFallbackRef = useRef(onFallback);
  useEffect(() => {
    onFallbackRef.current = onFallback;
  });

  useEffect(() => {
    if (!pairs || pairs.length < 2) {
      onFallbackRef.current();
      return;
    }
    // Shuffle right-hand column sentences
    setShuffledSentences([...pairs].sort(() => 0.5 - Math.random()));
    setSelectedWordId(null);
    setMatches({});
    setIsAnswered(false);
    setIsCorrect(null);
    setWrongAttempts(0);
  }, [pairs]);

  if (!pairs || pairs.length < 2) return null;

  // Click on a word
  const handleWordClick = (wordId: string) => {
    if (isAnswered) return;
    if (selectedWordId === wordId) {
      setSelectedWordId(null);
    } else {
      setSelectedWordId(wordId);
    }
  };

  // Click on a sentence
  const handleSentenceClick = (sentencePair: ContextMatchPair) => {
    if (isAnswered) return;

    if (!selectedWordId) {
      // If this sentence was already matched, unmatch it
      const existingWord = Object.keys(matches).find((wId) => matches[wId] === sentencePair.wordId);
      if (existingWord) {
        setMatches((prev) => {
          const next = { ...prev };
          delete next[existingWord];
          return next;
        });
      }
      return;
    }

    // Match selected word to this sentence
    setMatches((prev) => ({
      ...prev,
      [selectedWordId]: sentencePair.wordId,
    }));
    setSelectedWordId(null);
  };

  // Check correctness
  const handleCheck = () => {
    if (isAnswered) return;
    const allPaired = pairs.every((p) => matches[p.wordId] !== undefined);
    if (!allPaired) return;

    // All correct if every matches[p.wordId] === p.wordId
    const allCorrect = pairs.every((p) => matches[p.wordId] === p.wordId);

    if (allCorrect) {
      setIsCorrect(true);
      setIsAnswered(true);
      onSpeak(word.word);

      let rating: Rating = Rating.Easy;
      if (wrongAttempts === 0) rating = Rating.Easy;
      else if (wrongAttempts === 1) rating = Rating.Good;
      else rating = Rating.Hard;

      setTimeout(() => {
        onComplete(true, wrongAttempts, rating);
      }, 1000);
    } else {
      setIsCorrect(false);
      setWrongAttempts((prev) => prev + 1);
    }
  };

  const handleReset = () => {
    if (isAnswered) return;
    setMatches({});
    setSelectedWordId(null);
    setIsCorrect(null);
  };

  const allMatched = pairs.length > 0 && pairs.every((p) => matches[p.wordId] !== undefined);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Exercise header */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 text-center space-y-2 shadow-sm">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 border border-purple-200/50 dark:border-purple-800/40">
          <Link2 className="w-3 h-3" />
          <span>Ghép từ vào ngữ cảnh câu thích hợp</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Chọn một từ ở cột trái rồi chọn câu có chỗ trống tương ứng ở cột phải.
        </p>
      </div>

      {/* Matching Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Left Column: Words */}
        <div className="md:col-span-5 space-y-2.5">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider px-1">
            Từ vựng
          </h4>
          {pairs.map((p, idx) => {
            const isSelected = selectedWordId === p.wordId;
            const matchedSentenceId = matches[p.wordId];
            const colorConfig = PAIR_COLORS[idx % PAIR_COLORS.length];

            return (
              <button
                key={p.wordId}
                onClick={() => handleWordClick(p.wordId)}
                disabled={isAnswered}
                className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between shadow-sm ${
                  isSelected
                    ? "border-cyan-500 ring-2 ring-cyan-500/30 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-900 dark:text-cyan-200"
                    : matchedSentenceId
                    ? `${colorConfig.border} text-slate-900 dark:text-white`
                    : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-slate-300 text-slate-800 dark:text-zinc-200"
                }`}
              >
                <div>
                  <p className="text-sm font-bold font-mono">{p.word}</p>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500 line-clamp-1">
                    {p.meaningVN}
                  </p>
                </div>
                {matchedSentenceId && (
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${colorConfig.badge}`}
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Column: Sentences */}
        <div className="md:col-span-7 space-y-2.5">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider px-1">
            Câu ngữ cảnh (Chỗ trống)
          </h4>
          {shuffledSentences.map((s) => {
            // Find which word is matched with this sentence
            const matchedWordId = Object.keys(matches).find((wId) => matches[wId] === s.wordId);
            const matchedWordPair = matchedWordId ? pairs.find((p) => p.wordId === matchedWordId) : null;
            const wordIdx = matchedWordPair ? pairs.findIndex((p) => p.wordId === matchedWordPair.wordId) : -1;
            const colorConfig = wordIdx >= 0 ? PAIR_COLORS[wordIdx % PAIR_COLORS.length] : null;

            return (
              <button
                key={s.wordId}
                onClick={() => handleSentenceClick(s)}
                disabled={isAnswered}
                className={`w-full p-3.5 rounded-xl border text-left transition-all space-y-1.5 shadow-sm ${
                  colorConfig
                    ? `${colorConfig.border} text-slate-900 dark:text-white`
                    : selectedWordId
                    ? "border-dashed border-cyan-300 dark:border-cyan-700 bg-cyan-50/20 dark:bg-cyan-950/20 hover:border-cyan-400"
                    : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 text-slate-800 dark:text-zinc-200 hover:border-slate-300"
                }`}
              >
                <p className="text-xs font-medium leading-relaxed">
                  {matchedWordPair ? (
                    <span>
                      {s.maskedSentence.split("______")[0]}
                      <span className="font-bold underline text-cyan-600 dark:text-cyan-400 mx-1">
                        {matchedWordPair.word}
                      </span>
                      {s.maskedSentence.split("______")[1]}
                    </span>
                  ) : (
                    <span>{s.maskedSentence}</span>
                  )}
                </p>
                {matchedWordPair && (
                  <span className="inline-block text-[10px] text-slate-400 dark:text-zinc-500 italic">
                    Ghép với: <strong>{matchedWordPair.word}</strong> (bấm để gỡ)
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={handleReset}
          disabled={Object.keys(matches).length === 0 || isAnswered}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 disabled:opacity-40 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Làm lại ghép cặp</span>
        </button>

        <button
          onClick={handleCheck}
          disabled={!allMatched || isAnswered}
          className="px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 shadow-sm transition-all"
        >
          Kiểm tra kết quả
        </button>
      </div>

      {/* Dedicated Stable Feedback Area - ALWAYS occupies 48px so layout NEVER jumps */}
      <div className="h-[48px] min-h-[48px] flex items-center justify-center w-full">
        {isAnswered && isCorrect ? (
          <div className="w-full h-full px-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2 shadow-xs animate-in fade-in duration-150">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="font-semibold">Tuyệt vời! Bạn đã ghép đúng toàn bộ ngữ cảnh. Đang chuyển tiếp...</span>
          </div>
        ) : isCorrect === false && !isAnswered ? (
          <div className="w-full h-full px-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between shadow-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>Một số cặp ghép chưa chính xác (Lần {wrongAttempts}). Hãy đổi lại vị trí!</span>
            </div>
            <button
              onClick={handleReset}
              className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-900/60 font-semibold hover:bg-rose-200 transition-colors text-rose-700 dark:text-rose-200 text-xs shrink-0 ml-2"
            >
              Ghép lại
            </button>
          </div>
        ) : (
          <div className="w-full h-full rounded-xl border border-dashed border-slate-200 dark:border-zinc-800/80 flex items-center justify-center text-[11px] text-slate-400 dark:text-zinc-500 font-medium select-none px-3">
            <span>Chọn 1 từ ở cột trái rồi chọn câu có chỗ trống tương ứng ở cột phải</span>
          </div>
        )}
      </div>
    </div>
  );
}
