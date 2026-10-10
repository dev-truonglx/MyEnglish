import { useState, useEffect, useMemo, useRef } from "react";
import { CheckCircle2, Link2 } from "lucide-react";
import { Rating } from "@/services/srs";
import type { WordDetail } from "@/types/database";
import { prepareMeaningMatch, type MeaningMatchPair } from "@/services/smartReview";

interface MeaningMatchExerciseProps {
  word: WordDetail;
  allWords: WordDetail[];
  /** Words still to come in this session: never shown here, it would reveal their answers */
  excludeIds?: ReadonlySet<string>;
  onComplete: (isCorrect: boolean, attempts: number, rating: Rating) => void;
  onSpeak: (text: string) => void;
  onFallback: () => void;
}

// Fewer pairs make the matching trivial; the parent falls back to another exercise
const MIN_PAIRS = 3;

/**
 * Word ↔ meaning matching game. Only the reviewed word is graded: a wrong pairing counts against it when
 * it involves the reviewed word or its meaning; mistakes between the other words are just corrected.
 * Each pair is checked as soon as it is made (correct pairs lock, wrong ones flash), so the learner always
 * knows which pairing was wrong.
 */
export default function MeaningMatchExercise({
  word,
  allWords,
  excludeIds,
  onComplete,
  onSpeak,
  onFallback,
}: MeaningMatchExerciseProps) {
  const pairs: MeaningMatchPair[] = useMemo(
    () => prepareMeaningMatch(word, allWords, excludeIds),
    // The pairs must not reshuffle while the learner is playing
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [word.id]
  );
  const meanings = useMemo(() => [...pairs].sort(() => 0.5 - Math.random()), [pairs]);

  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrongFlash, setWrongFlash] = useState<{ wordId: string; meaningId: string } | null>(null);
  const [targetMistakes, setTargetMistakes] = useState(0);
  const [done, setDone] = useState(false);

  const onFallbackRef = useRef(onFallback);
  useEffect(() => {
    onFallbackRef.current = onFallback;
  });

  // Pending completion timer, cleared on unmount so a stale card is never graded
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (pairs.length < MIN_PAIRS) onFallbackRef.current();
  }, [pairs]);

  if (pairs.length < MIN_PAIRS) return null;

  const tryPair = (wordId: string, meaningId: string) => {
    if (done) return;
    if (wordId === meaningId) {
      const next = new Set(matched).add(wordId);
      setMatched(next);
      setSelectedWordId(null);
      if (next.size === pairs.length) {
        setDone(true);
        onSpeak(word.word);
        // The exercise reports Good; the session derives the real grade from the mistakes on the target
        // Reported at once: the session keeps this card on screen until the learner continues
        if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
        onComplete(targetMistakes === 0, targetMistakes, Rating.Good);
      }
      return;
    }
    if (wordId === word.id || meaningId === word.id) setTargetMistakes((n) => n + 1);
    setWrongFlash({ wordId, meaningId });
    setSelectedWordId(null);
    setTimeout(() => setWrongFlash(null), 600);
  };

  const handleWordClick = (wordId: string) => {
    if (done || matched.has(wordId)) return;
    setSelectedWordId((prev) => (prev === wordId ? null : wordId));
  };

  const handleMeaningClick = (meaningId: string) => {
    if (done || matched.has(meaningId) || !selectedWordId) return;
    tryPair(selectedWordId, meaningId);
  };

  const cell = (state: "matched" | "selected" | "wrong" | "idle") =>
    state === "matched"
      ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 opacity-70"
      : state === "selected"
      ? "border-cyan-500 ring-2 ring-cyan-500/30 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-900 dark:text-cyan-200"
      : state === "wrong"
      ? "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 animate-shake"
      : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-slate-300 text-slate-800 dark:text-zinc-200";

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 animate-in fade-in duration-200">
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 text-center space-y-2 shadow-sm">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 border border-purple-200/50 dark:border-purple-800/40">
          <Link2 className="w-3 h-3" />
          <span>Nối từ với nghĩa</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Chọn một từ tiếng Anh ở cột trái rồi chọn nghĩa tiếng Việt tương ứng ở cột phải.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider px-1">Từ vựng</h4>
          {pairs.map((p) => {
            const state = matched.has(p.wordId)
              ? "matched"
              : wrongFlash?.wordId === p.wordId
              ? "wrong"
              : selectedWordId === p.wordId
              ? "selected"
              : "idle";
            return (
              <button
                key={p.wordId}
                onClick={() => handleWordClick(p.wordId)}
                disabled={done || matched.has(p.wordId)}
                className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between shadow-sm ${cell(state)}`}
              >
                <span className="text-sm font-bold font-mono">{p.word}</span>
                {matched.has(p.wordId) && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              </button>
            );
          })}
        </div>

        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider px-1">Nghĩa tiếng Việt</h4>
          {meanings.map((m) => {
            const state = matched.has(m.wordId) ? "matched" : wrongFlash?.meaningId === m.wordId ? "wrong" : "idle";
            return (
              <button
                key={m.wordId}
                onClick={() => handleMeaningClick(m.wordId)}
                disabled={done || matched.has(m.wordId)}
                className={`w-full p-3.5 rounded-xl border text-left transition-all shadow-sm text-xs font-medium leading-relaxed ${cell(state)} ${
                  selectedWordId && state === "idle" ? "border-dashed border-cyan-300 dark:border-cyan-700" : ""
                }`}
              >
                {m.meaningVN}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-[40px] flex items-center justify-center text-xs">
        {done ? (
          <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            {targetMistakes === 0 ? `Chính xác! "${word.word}" đã được nối đúng ngay.` : `Đã nối xong. "${word.word}" cần ôn lại sớm.`}
          </span>
        ) : (
          <span className="text-slate-400 dark:text-zinc-500">
            Chỉ cặp của từ <strong>{word.word}</strong> được tính điểm; nối nhầm các từ khác chỉ được sửa lại.
          </span>
        )}
      </div>
    </div>
  );
}
