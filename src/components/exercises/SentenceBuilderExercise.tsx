import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Volume2, CheckCircle2, RotateCcw, AlertCircle, Eye } from "lucide-react";
import { Rating } from "@/services/srs";
import type { WordDetail } from "@/types/database";
import { normalizeTypedText, prepareSentenceBuilder, type SentenceBuilderData } from "@/services/smartReview";
import { playWrongTry } from "@/services/sound";

interface SentenceBuilderExerciseProps {
  word: WordDetail;
  onComplete: (isCorrect: boolean, attempts: number, rating: Rating) => void;
  onSpeak: (text: string) => void;
  onFallback: () => void;
}

export default function SentenceBuilderExercise({
  word,
  onComplete,
  onSpeak,
  onFallback,
}: SentenceBuilderExerciseProps) {
  const data: SentenceBuilderData | null = useMemo(() => {
    return prepareSentenceBuilder(word);
  }, [word]);

  const [availableTokens, setAvailableTokens] = useState<Array<{ id: string; text: string }>>([]);
  const [placedTokens, setPlacedTokens] = useState<Array<{ id: string; text: string }>>([]);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [shake, setShake] = useState(false);

  // Stable references to callbacks and state to prevent infinite auto-check loops
  const onFallbackRef = useRef(onFallback);
  const onCompleteRef = useRef(onComplete);
  const onSpeakRef = useRef(onSpeak);
  const wrongAttemptsRef = useRef(0);
  const lastCheckedKeyRef = useRef<string>("");

  useEffect(() => {
    onFallbackRef.current = onFallback;
    onCompleteRef.current = onComplete;
    onSpeakRef.current = onSpeak;
  });

  // Initialize state when target sentence data changes
  useEffect(() => {
    if (!data) {
      onFallbackRef.current();
      return;
    }
    setAvailableTokens(data.tokens);
    setPlacedTokens([]);
    setIsAnswered(false);
    setIsCorrect(null);
    setWrongAttempts(0);
    wrongAttemptsRef.current = 0;
    lastCheckedKeyRef.current = "";
    setShake(false);
  }, [data]);

  // Pending completion timer, cleared on unmount so a stale card is never graded
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, []);

  const handlePlaceToken = (token: { id: string; text: string }) => {
    if (isAnswered) return;
    setIsCorrect(null);
    lastCheckedKeyRef.current = "";
    setAvailableTokens((prev) => prev.filter((t) => t.id !== token.id));
    setPlacedTokens((prev) => [...prev, token]);
  };

  const handleRemoveToken = (token: { id: string; text: string }) => {
    if (isAnswered) return;
    setIsCorrect(null);
    lastCheckedKeyRef.current = "";
    setPlacedTokens((prev) => prev.filter((t) => t.id !== token.id));
    setAvailableTokens((prev) => [...prev, token]);
  };

  const handleReset = () => {
    if (isAnswered || !data) return;
    setAvailableTokens(data.tokens);
    setPlacedTokens([]);
    setIsCorrect(null);
    lastCheckedKeyRef.current = "";
  };

  const handleGiveUp = useCallback(() => {
    if (isAnswered || !data) return;
    setIsAnswered(true);
    setIsCorrect(false);

    // Reconstruct tokens in correct sentence order
    const words = data.fullSentence.trim().split(/\s+/).filter(Boolean);
    const correctTokens = words.map((text, idx) => ({
      id: `token-${idx}-${text}`,
      text,
    }));
    setPlacedTokens(correctTokens);
    setAvailableTokens([]);

    onSpeakRef.current(data.fullSentence);
    if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    onCompleteRef.current(false, Math.max(wrongAttemptsRef.current, 1), Rating.Again);
  }, [data, isAnswered]);

  const handleCheck = useCallback(() => {
    if (!data || isAnswered || placedTokens.length === 0) return;

    const currentKey = placedTokens.map((t) => t.id).join("|");
    // Prevent duplicate evaluation of the exact same placement sequence
    if (lastCheckedKeyRef.current === currentKey) return;
    lastCheckedKeyRef.current = currentKey;

    // Case, punctuation, spacing and contractions ("doesn't" = "does not") are ignored
    const constructed = placedTokens.map((t) => t.text).join(" ");
    const matched = normalizeTypedText(constructed) === normalizeTypedText(data.fullSentence);

    if (matched) {
      setIsCorrect(true);
      setIsAnswered(true);
      onSpeakRef.current(data.fullSentence);

      const attempts = wrongAttemptsRef.current;
      let rating: Rating = Rating.Easy;
      if (attempts === 0) {
        rating = Rating.Easy;
      } else if (attempts === 1) {
        rating = Rating.Good;
      } else {
        rating = Rating.Hard;
      }

      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
      // Reported at once: the session keeps this card on screen until the learner continues
      onCompleteRef.current(true, attempts, rating);
    } else {
      setIsCorrect(false);
      playWrongTry();
      setWrongAttempts((prev) => {
        const next = prev + 1;
        wrongAttemptsRef.current = next;
        return next;
      });
      setShake(true);
      setTimeout(() => setShake(false), 400);
    }
  }, [data, isAnswered, placedTokens]);

  // Auto-check when all tokens have been placed and haven't been evaluated yet
  useEffect(() => {
    if (
      availableTokens.length === 0 &&
      placedTokens.length > 0 &&
      !isAnswered &&
      isCorrect === null
    ) {
      handleCheck();
    }
  }, [availableTokens.length, placedTokens.length, isAnswered, isCorrect, handleCheck]);

  // Early return only after every hook so the hook count stays stable
  if (!data) return null;

  const firstWordHint = data.fullSentence.trim().split(/\s+/)[0];

  return (
    <div className="w-full max-w-xl mx-auto space-y-3 md:space-y-4 animate-in fade-in duration-200">
      {/* Target meaning prompt - fixed height block */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-4 md:p-5 text-center space-y-2 shadow-sm shrink-0">
        <p className="text-base md:text-lg font-semibold text-slate-900 dark:text-white leading-relaxed line-clamp-2">
          "{data.meaningVN}"
        </p>

        <div className="flex items-center justify-center gap-2 pt-0.5">
          <span className="text-xs text-slate-500 dark:text-zinc-400">Từ mục tiêu:</span>
          <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 px-2 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800">
            {word.word}
          </span>
          <button
            onClick={() => onSpeakRef.current(word.word)}
            type="button"
            className="p-2 md:p-1 max-md:min-h-10 max-md:min-w-10 rounded-full text-slate-400 hover:text-cyan-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors max-md:flex max-md:items-center max-md:justify-center"
            title="Phát âm từ"
          >
            <Volume2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sentence Construction Zone - constant height so it doesn't jump */}
      <div
        className={`rounded-2xl border-2 min-h-[80px] md:min-h-[92px] p-2.5 md:p-3.5 flex flex-wrap items-center gap-1.5 md:gap-2 transition-all content-center ${
          isCorrect === true
            ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30"
            : isCorrect === false
            ? "border-rose-400 bg-rose-50/50 dark:bg-rose-950/30"
            : placedTokens.length > 0
            ? "border-cyan-400 dark:border-cyan-700 bg-cyan-50/20 dark:bg-cyan-950/10"
            : "border-dashed border-slate-300 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-900/40"
        } ${shake ? "animate-shake" : ""}`}
      >
        {placedTokens.length === 0 ? null : (
          placedTokens.map((token) => (
            <button
              key={token.id}
              onClick={() => handleRemoveToken(token)}
              disabled={isAnswered}
              className={`px-3 py-2 md:py-1.5 max-md:min-h-10 rounded-lg text-sm font-medium shadow-sm transition-all transform active:scale-95 max-md:flex max-md:items-center max-md:justify-center ${
                isCorrect === true
                  ? "bg-emerald-500 text-white"
                  : isAnswered && isCorrect === false
                  ? "bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700 cursor-default"
                  : isCorrect === false
                  ? "bg-rose-500 text-white"
                  : "bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 hover:border-rose-400 hover:text-rose-600"
              }`}
            >
              {token.text}
            </button>
          ))
        )}
      </div>

      {/* Available Word Bank - constant min-height matching placed zone */}
      <div className="space-y-2">
        <div className="flex items-center justify-end text-xs text-slate-500 dark:text-zinc-400 px-1">
          {!isAnswered && (
            <div className="flex items-center gap-2">
              {placedTokens.length > 0 && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors py-1.5 md:py-0 max-md:min-h-10"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Làm lại</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleGiveUp}
                className="inline-flex items-center gap-1 text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 transition-colors font-semibold py-1.5 md:py-0 max-md:min-h-10"
                title="Bỏ qua và xem đáp án câu này"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Không nhớ</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 md:gap-2 min-h-[80px] md:min-h-[92px] p-2.5 md:p-3 rounded-xl bg-slate-100 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 content-start">
          {availableTokens.map((token) => (
            <button
              key={token.id}
              onClick={() => handlePlaceToken(token)}
              disabled={isAnswered}
              className="px-3 py-2 md:py-1.5 max-md:min-h-10 rounded-lg text-sm font-medium bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 hover:border-cyan-400 dark:hover:border-cyan-600 hover:shadow-sm transition-all transform active:scale-95 max-md:flex max-md:items-center max-md:justify-center"
            >
              {token.text}
            </button>
          ))}
          {availableTokens.length === 0 && placedTokens.length > 0 && (
            <span className="text-xs text-slate-400 dark:text-zinc-500 italic my-auto mx-auto select-none">
              {isAnswered && isCorrect
                ? "Hoàn thành chính xác!"
                : isAnswered && !isCorrect
                ? "Đã hiển thị đáp án đúng"
                : isCorrect === null
                ? "Đã dùng hết từ. Đang kiểm tra..."
                : "Đã chọn toàn bộ từ"}
            </span>
          )}
        </div>
      </div>

      {/* Dedicated Stable Feedback Area - ALWAYS occupies 52px so layout NEVER jumps */}
      <div className="min-h-[52px] md:h-[52px] flex items-center justify-center w-full">
        {isAnswered && isCorrect ? (
          <div className="w-full h-full max-md:p-2.5 md:px-4 md:py-0 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between shadow-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <div className="truncate">
                <span className="font-bold mr-1.5">Chính xác!</span>
                <span className="text-emerald-700 dark:text-emerald-300 font-mono">
                  {data.fullSentence}
                </span>
              </div>
            </div>
            <button
              onClick={() => onSpeakRef.current(data.fullSentence)}
              className="p-2 md:p-1.5 max-md:min-h-10 max-md:min-w-10 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-600 shrink-0 ml-2 max-md:flex max-md:items-center max-md:justify-center"
              title="Nghe câu"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
        ) : isAnswered && isCorrect === false ? (
          <div className="w-full h-full max-md:p-2.5 md:px-4 md:py-0 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between shadow-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <div className="truncate">
                <span className="font-bold mr-1.5">Đáp án đúng:</span>
                <span className="text-rose-700 dark:text-rose-300 font-mono">
                  {data.fullSentence}
                </span>
              </div>
            </div>
            <button
              onClick={() => onSpeakRef.current(data.fullSentence)}
              className="p-2 md:p-1.5 max-md:min-h-10 max-md:min-w-10 rounded-full hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 shrink-0 ml-2 max-md:flex max-md:items-center max-md:justify-center"
              title="Nghe câu"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
        ) : isCorrect === false && !isAnswered ? (
          <div className="w-full h-full max-md:p-2.5 md:px-3.5 md:py-0 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex flex-col md:flex-row items-center justify-between gap-2 md:gap-0 shadow-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <div className="truncate">
                <span className="font-semibold">Thứ tự từ chưa đúng (Lần {wrongAttempts}).</span>
                {wrongAttempts >= 2 && firstWordHint && (
                  <span className="ml-1.5 text-amber-700 dark:text-amber-300 font-medium">
                    Gợi ý: Bắt đầu bằng "<strong>{firstWordHint}</strong>"
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-2.5 py-1.5 md:py-1 max-md:min-h-10 rounded-lg bg-rose-100 dark:bg-rose-900/60 font-semibold hover:bg-rose-200 dark:hover:bg-rose-800 text-rose-700 dark:text-rose-200 transition-colors"
              >
                Xếp lại
              </button>
              <button
                type="button"
                onClick={handleGiveUp}
                className="px-2.5 py-1.5 md:py-1 max-md:min-h-10 rounded-lg bg-rose-200/70 hover:bg-rose-300/80 dark:bg-rose-900/90 text-rose-800 dark:text-rose-100 font-semibold transition-colors flex items-center gap-1"
                title="Bỏ qua và xem đáp án câu này"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Không nhớ</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full h-full max-md:p-2 md:py-0 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800/80 flex items-center justify-center text-[11px] text-slate-400 dark:text-zinc-500 font-medium select-none px-2 md:px-3 max-md:text-center">
            <span>Chạm các từ để ghép • Chạm từ đã ghép để gỡ • Ghép xong sẽ tự động kiểm tra</span>
          </div>
        )}
      </div>
    </div>
  );
}
