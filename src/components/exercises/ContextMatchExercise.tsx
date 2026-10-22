import { Fragment, useState, useEffect, useMemo, useRef } from "react";
import { CheckCircle2, RotateCcw, Link2, AlertCircle, Eye } from "lucide-react";
import { Rating } from "@/services/srs";
import { shuffle } from "@/lib/utils";
import type { WordDetail } from "@/types/database";
import { prepareContextMatch, type ContextMatchPair } from "@/services/smartReview";
import { playWrongTry } from "@/services/sound";

interface ContextMatchExerciseProps {
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
const BLANK = "______";

// One color per pair (by word); cyan is kept for the item picked and waiting for its other half
const PAIR_COLORS = [
  {
    badge: "bg-purple-500 text-white",
    border: "border-purple-500 bg-purple-50/50 dark:bg-purple-950/40",
  },
  {
    badge: "bg-amber-500 text-white",
    border: "border-amber-500 bg-amber-50/50 dark:bg-amber-950/40",
  },
  {
    badge: "bg-emerald-500 text-white",
    border: "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40",
  },
];

export default function ContextMatchExercise({
  word,
  allWords,
  excludeIds,
  onComplete,
  onSpeak,
  onFallback,
}: ContextMatchExerciseProps) {
  const pairs: ContextMatchPair[] = useMemo(() => {
    return prepareContextMatch(word, allWords, excludeIds);
    // The pairs must not reshuffle while the learner is playing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id]);

  const [shuffledSentences, setShuffledSentences] = useState<ContextMatchPair[]>([]);
  // One side picked, waiting for the other: words are numbered 1..n, sentences n+1..2n (keyboard or click)
  const [selected, setSelected] = useState<{ side: "word" | "sentence"; id: string } | null>(null);
  // Map wordId -> sentence wordId
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [, setWrongAttempts] = useState(0);
  const targetMistakesRef = useRef(0);
  // Word of the latest pairing: when it is the target, its sentence was the one left over (found by elimination)
  const lastPairedRef = useRef<string | null>(null);
  const [byElimination, setByElimination] = useState(false);

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
    if (!pairs || pairs.length < MIN_PAIRS) {
      onFallbackRef.current();
      return;
    }
    // Shuffle right-hand column sentences
    setShuffledSentences(shuffle(pairs));
    setSelected(null);
    setMatches({});
    setIsAnswered(false);
    setIsCorrect(null);
    setWrongAttempts(0);
  }, [pairs]);

  // Number keys pick (words 1..n, sentences n+1..2n), Enter checks. Set below on every render, so the listener
  // registered once always sees the current state.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!pairs || pairs.length < MIN_PAIRS) return null;

  // Pair a word with a sentence; whatever either was paired with before is released
  const pair = (wordId: string, sentenceId: string) => {
    lastPairedRef.current = wordId;
    setMatches((prev) => {
      const next: Record<string, string> = {};
      for (const [w, sId] of Object.entries(prev)) if (w !== wordId && sId !== sentenceId) next[w] = sId;
      next[wordId] = sentenceId;
      return next;
    });
    setSelected(null);
  };

  // Pick one side (number key or click): the same item again drops the pick, the other side completes a pair.
  // A paired sentence picked with nothing waiting is unpaired, as before.
  const pick = (side: "word" | "sentence", id: string) => {
    if (isAnswered) return;
    if (selected?.side === side && selected.id === id) {
      setSelected(null);
      return;
    }
    if (selected && selected.side !== side) {
      if (side === "word") pair(id, selected.id);
      else pair(selected.id, id);
      return;
    }
    if (!selected && side === "sentence") {
      const existingWord = Object.keys(matches).find((wId) => matches[wId] === id);
      if (existingWord) {
        setMatches((prev) => {
          const next = { ...prev };
          delete next[existingWord];
          return next;
        });
        return;
      }
    }
    setSelected({ side, id });
  };

  // Check correctness
  const handleCheck = () => {
    if (isAnswered) return;
    const allPaired = pairs.every((p) => matches[p.wordId] !== undefined);
    if (!allPaired) return;

    // All correct if every matches[p.wordId] === p.wordId
    const allCorrect = pairs.every((p) => matches[p.wordId] === p.wordId);

    // Only the reviewed word is graded: a mistake counts against it when its own pairing is wrong
    // (its word on another sentence, or another word on its sentence)
    const targetWrong =
      matches[word.id] !== word.id || pairs.some((p) => p.wordId !== word.id && matches[p.wordId] === word.id);

    if (allCorrect) {
      // The target was paired last, so every other pair was already there: its sentence was forced
      const eliminated = lastPairedRef.current === word.id;
      setByElimination(eliminated);
      setIsCorrect(true);
      setIsAnswered(true);
      onSpeak(word.word);

      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
      const mistakes = targetMistakesRef.current;
      // Hard with 0 wrong attempts is read by the session as a hint, so an eliminated target grades Hard
      // Reported at once: the session keeps this card on screen until the learner continues
      onComplete(mistakes === 0 && !eliminated, mistakes, eliminated ? Rating.Hard : Rating.Good);
    } else {
      if (targetWrong) targetMistakesRef.current += 1;
      setIsCorrect(false);
      setWrongAttempts((prev) => prev + 1);
      playWrongTry();
      // Keep the correct pairs, clear the wrong ones so the learner sees exactly what to fix
      setMatches((prev) => {
        const next: Record<string, string> = {};
        for (const [w, sId] of Object.entries(prev)) if (w === sId) next[w] = sId;
        return next;
      });
    }
  };

  const handleReset = () => {
    if (isAnswered) return;
    setMatches({});
    setSelected(null);
    setIsCorrect(null);
  };

  const handleGiveUp = () => {
    if (isAnswered) return;
    setIsAnswered(true);
    setIsCorrect(false);
    // Fill all matches with the correct pairs
    const solved: Record<string, string> = {};
    for (const p of pairs) {
      solved[p.wordId] = p.wordId;
    }
    setMatches(solved);
    onSpeak(word.word);
    if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    onComplete(false, Math.max(targetMistakesRef.current, 1), Rating.Again);
  };

  const allMatched = pairs.length > 0 && pairs.every((p) => matches[p.wordId] !== undefined);
  const wordNumber = (wordId: string) => pairs.findIndex((p) => p.wordId === wordId) + 1;
  const sentenceNumber = (sentenceId: string) => pairs.length + shuffledSentences.findIndex((x) => x.wordId === sentenceId) + 1;

  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (isAnswered || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "Enter") {
      if (!allMatched) return;
      e.preventDefault();
      handleCheck();
      return;
    }
    if (!/^[1-9]$/.test(e.key)) return;
    const n = Number(e.key);
    if (n <= pairs.length) {
      e.preventDefault();
      pick("word", pairs[n - 1].wordId);
    } else if (n <= pairs.length + shuffledSentences.length) {
      e.preventDefault();
      pick("sentence", shuffledSentences[n - pairs.length - 1].wordId);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Exercise header */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 text-center space-y-2 shadow-sm">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 border border-purple-200/50 dark:border-purple-800/40">
          <Link2 className="w-3 h-3" />
          <span>Ghép từ vào ngữ cảnh câu thích hợp</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Nhấn số của một từ rồi số của câu tương ứng (hoặc bấm chuột) để ghép thành cặp.
        </p>
      </div>

      {/* Matching grid: row i holds word i and sentence i, so both columns line up */}
      <div className="grid grid-cols-[minmax(max-content,2fr)_minmax(0,5fr)] gap-x-3 gap-y-2.5">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider px-1">Từ vựng</h4>
        <h4 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider px-1">Câu có chỗ trống</h4>
        {pairs.map((p, idx) => {
          const s = shuffledSentences[idx];
          const pairedWordId = s ? Object.keys(matches).find((w) => matches[w] === s.wordId) : undefined;
          const pairedIdx = pairedWordId ? wordNumber(pairedWordId) - 1 : -1;
          return (
            <Fragment key={p.wordId}>
              <WordCell
                number={idx + 1}
                word={p.word}
                color={PAIR_COLORS[idx % PAIR_COLORS.length]}
                isSelected={selected?.side === "word" && selected.id === p.wordId}
                pairedWith={matches[p.wordId] ? sentenceNumber(matches[p.wordId]) : null}
                disabled={isAnswered}
                onClick={() => pick("word", p.wordId)}
              />
              {s ? (
                <SentenceCell
                  number={pairs.length + idx + 1}
                  sentence={s.maskedSentence}
                  paired={pairedIdx >= 0 ? { word: pairs[pairedIdx].word, number: pairedIdx + 1, color: PAIR_COLORS[pairedIdx % PAIR_COLORS.length] } : null}
                  isSelected={selected?.side === "sentence" && selected.id === s.wordId}
                  awaitingSentence={selected?.side === "word"}
                  disabled={isAnswered}
                  onClick={() => pick("sentence", s.wordId)}
                />
              ) : (
                <div />
              )}
            </Fragment>
          );
        })}
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            disabled={Object.keys(matches).length === 0 || isAnswered}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 disabled:opacity-40 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Làm lại ghép cặp</span>
          </button>
          {!isAnswered && (
            <button
              type="button"
              onClick={handleGiveUp}
              className="inline-flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 transition-colors font-semibold"
              title="Xem đáp án ghép cặp"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Không nhớ</span>
            </button>
          )}
        </div>

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
            <span className="font-semibold">
              {byElimination
                ? `Đúng hết, nhưng "${word.word}" là cặp cuối còn lại nên chưa tính là nhớ chắc. Nhấn Enter hoặc Tiếp tục.`
                : "Tuyệt vời! Bạn đã ghép đúng toàn bộ ngữ cảnh. Nhấn Enter hoặc Tiếp tục."}
            </span>
          </div>
        ) : isAnswered && isCorrect === false ? (
          <div className="w-full h-full px-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2 shadow-xs animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="font-semibold">
              Đã hiển thị các cặp ghép đúng. Từ "{word.word}" sẽ được ôn lại sớm. Nhấn Enter hoặc Tiếp tục.
            </span>
          </div>
        ) : isCorrect === false && !isAnswered ? (
          <div className="w-full h-full px-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between shadow-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>Có cặp chưa khớp, đổi lại vị trí rồi thử tiếp nhé!</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-900/60 font-semibold hover:bg-rose-200 transition-colors text-rose-700 dark:text-rose-200 text-xs"
              >
                Ghép lại
              </button>
              <button
                type="button"
                onClick={handleGiveUp}
                className="px-2.5 py-1 rounded-lg bg-rose-200/70 hover:bg-rose-300/80 dark:bg-rose-900/90 text-rose-800 dark:text-rose-100 font-semibold transition-colors flex items-center gap-1 text-xs"
                title="Xem đáp án ghép cặp"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Không nhớ</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full h-full rounded-xl border border-dashed border-slate-200 dark:border-zinc-800/80 flex items-center justify-center text-[11px] text-slate-400 dark:text-zinc-500 font-medium select-none px-3">
            <span>
              Gõ số của từ ({1}–{pairs.length}) rồi số của câu ({pairs.length + 1}–{pairs.length * 2}) để ghép cặp, Enter để kiểm tra
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

type PairColor = (typeof PAIR_COLORS)[number];

/** Number badge: the key that picks this item */
function KeyBadge({ number, className }: { number: number; className: string }) {
  return (
    <kbd className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-sm font-bold font-mono border ${className}`}>
      {number}
    </kbd>
  );
}

function WordCell({
  number,
  word,
  color,
  isSelected,
  pairedWith,
  disabled,
  onClick,
}: {
  number: number;
  word: string;
  color: PairColor;
  isSelected: boolean;
  /** Number of the sentence it is paired with */
  pairedWith: number | null;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-full min-h-[3.5rem] w-full px-3 py-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 shadow-sm ${
        isSelected
          ? "border-cyan-500 ring-2 ring-cyan-500/30 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-900 dark:text-cyan-200"
          : pairedWith
          ? `${color.border} text-slate-900 dark:text-white`
          : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-slate-300 text-slate-800 dark:text-zinc-200"
      }`}
    >
      <KeyBadge
        number={number}
        className={
          isSelected
            ? "bg-cyan-500 text-white border-transparent"
            : pairedWith
            ? `${color.badge} border-transparent`
            : "bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300"
        }
      />
      <span className="flex-1 text-sm font-bold whitespace-nowrap">{word}</span>
      {pairedWith && <span className="shrink-0 text-[11px] font-mono font-semibold text-slate-500 dark:text-zinc-400">→ {pairedWith}</span>}
    </button>
  );
}

function SentenceCell({
  number,
  sentence,
  paired,
  isSelected,
  awaitingSentence,
  disabled,
  onClick,
}: {
  number: number;
  sentence: string;
  /** The word put in its blank: its text, number and pair color */
  paired: { word: string; number: number; color: PairColor } | null;
  isSelected: boolean;
  /** A word is picked: this sentence can complete the pair */
  awaitingSentence: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const blankAt = sentence.indexOf(BLANK);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-full min-h-[3.5rem] w-full px-3 py-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 shadow-sm ${
        isSelected
          ? "border-cyan-500 ring-2 ring-cyan-500/30 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-900 dark:text-cyan-200"
          : paired
          ? `${paired.color.border} text-slate-900 dark:text-white`
          : awaitingSentence
          ? "border-dashed border-cyan-300 dark:border-cyan-700 bg-cyan-50/20 dark:bg-cyan-950/20 hover:border-cyan-400 text-slate-800 dark:text-zinc-200"
          : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 text-slate-800 dark:text-zinc-200 hover:border-slate-300"
      }`}
    >
      <KeyBadge
        number={number}
        className={
          isSelected
            ? "bg-cyan-500 text-white border-transparent"
            : paired
            ? `${paired.color.badge} border-transparent`
            : "bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300"
        }
      />
      <span className="flex-1 min-w-0 text-[13px] font-medium leading-relaxed">
        {paired && blankAt >= 0 ? (
          <>
            {sentence.slice(0, blankAt)}
            <span className="font-bold underline text-cyan-600 dark:text-cyan-400 mx-0.5">{paired.word}</span>
            {sentence.slice(blankAt + BLANK.length)}
          </>
        ) : (
          sentence
        )}
      </span>
      {paired && <span className="shrink-0 text-[11px] font-mono font-semibold text-slate-500 dark:text-zinc-400">← {paired.number}</span>}
    </button>
  );
}
