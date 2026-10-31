import { Fragment, useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { CheckCircle2, Eye, AlertCircle } from "lucide-react";
import { Rating } from "@/services/srs";
import { shuffle } from "@/lib/utils";
import type { WordDetail } from "@/types/database";
import { prepareMeaningMatch, type MeaningMatchPair } from "@/services/smartReview";
import { playWrongTry } from "@/services/sound";
import KeyBadge from "./KeyBadge";

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
 * knows which pairing was wrong. Same layout and number keys as ContextMatchExercise.
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
  const meanings = useMemo(() => shuffle(pairs), [pairs]);

  // One side picked, waiting for the other: words are numbered 1..n, meanings n+1..2n (keyboard or click)
  const [selected, setSelected] = useState<{ side: "word" | "meaning"; id: string } | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrongFlash, setWrongFlash] = useState<{ wordId: string; meaningId: string } | null>(null);
  // What the last wrong pairing really was: kept until the next pair is made
  const [wrongNote, setWrongNote] = useState<string | null>(null);
  const [targetMistakes, setTargetMistakes] = useState(0);
  const [done, setDone] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  // The target's pair was the last one left: found by elimination, so not a clean recall
  const [byElimination, setByElimination] = useState(false);

  const onFallbackRef = useRef(onFallback);
  useEffect(() => {
    onFallbackRef.current = onFallback;
  });

  // Pending completion timer, cleared on unmount so a stale card is never graded
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrongFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
      if (wrongFlashTimerRef.current) clearTimeout(wrongFlashTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (pairs.length < MIN_PAIRS) onFallbackRef.current();
  }, [pairs]);

  // Number keys pick (words 1..n, meanings n+1..2n). Set below on every render, so the listener
  // registered once always sees the current state.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (pairs.length < MIN_PAIRS) return null;

  const tryPair = (wordId: string, meaningId: string) => {
    if (done) return;
    setSelected(null);
    if (wordId === meaningId) {
      const next = new Set(matched).add(wordId);
      setMatched(next);
      setWrongNote(null);
      if (next.size === pairs.length) {
        setDone(true);
        // If the target's pair is the one made last, every other pair was already made: found by elimination
        const eliminated = wordId === word.id;
        setByElimination(eliminated);
        onSpeak(word.word);
        // Hard with 0 wrong attempts is read by the session as a hint, so an eliminated target grades Hard.
        // The session derives the real grade from the mistakes on the target
        // Reported at once: the session keeps this card on screen until the learner continues
        if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
        onComplete(targetMistakes === 0 && !eliminated, targetMistakes, eliminated ? Rating.Hard : Rating.Good);
      }
      return;
    }
    if (wordId === word.id || meaningId === word.id) setTargetMistakes((n) => n + 1);
    playWrongTry();
    // Say what the picked word really means: a wrong pairing still teaches something
    const picked = pairs.find((p) => p.wordId === wordId);
    setWrongNote(picked ? `"${picked.word}" nghĩa là "${picked.meaningVN}". Thử lại nhé!` : "Chưa khớp, thử lại nhé!");
    setWrongFlash({ wordId, meaningId });
    if (wrongFlashTimerRef.current) clearTimeout(wrongFlashTimerRef.current);
    wrongFlashTimerRef.current = setTimeout(() => {
      wrongFlashTimerRef.current = null;
      setWrongFlash(null);
    }, 600);
  };

  // Pick one side (number key or click): the same item again drops the pick, the other side completes a pair
  const pick = (side: "word" | "meaning", id: string) => {
    if (done || matched.has(id)) return;
    if (selected?.side === side && selected.id === id) {
      setSelected(null);
      return;
    }
    if (selected && selected.side !== side) {
      if (side === "word") tryPair(id, selected.id);
      else tryPair(selected.id, id);
      return;
    }
    setSelected({ side, id });
  };

  const handleGiveUp = () => {
    if (done) return;
    setDone(true);
    setGaveUp(true);
    setSelected(null);
    setWrongNote(null);
    setMatched(new Set(pairs.map((p) => p.wordId)));
    onSpeak(word.word);
    if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    onComplete(false, Math.max(targetMistakes, 1), Rating.Again);
  };

  const meaningNumber = (meaningId: string) => pairs.length + meanings.findIndex((m) => m.wordId === meaningId) + 1;

  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (done || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (!/^[1-9]$/.test(e.key)) return;
    const n = Number(e.key);
    if (n <= pairs.length) {
      e.preventDefault();
      pick("word", pairs[n - 1].wordId);
    } else if (n <= pairs.length + meanings.length) {
      e.preventDefault();
      pick("meaning", meanings[n - pairs.length - 1].wordId);
    }
  };

  const cellState = (side: "word" | "meaning", id: string): CellState =>
    matched.has(id)
      ? "matched"
      : (side === "word" ? wrongFlash?.wordId : wrongFlash?.meaningId) === id
      ? "wrong"
      : selected?.side === side && selected.id === id
      ? "selected"
      : selected && selected.side !== side
      ? "awaiting"
      : "idle";

  return (
    <div className="w-full max-w-2xl mx-auto space-y-3 md:space-y-4 animate-in fade-in duration-200">
      {/* Matching grid: row i holds word i and meaning i, so both columns line up */}
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-[minmax(max-content,2fr)_minmax(0,3fr)] gap-x-2 md:gap-x-3 gap-y-2 md:gap-y-2.5">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider px-1">Từ vựng</h4>
        <h4 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider px-1">Nghĩa tiếng Việt</h4>
        {pairs.map((p, idx) => {
          const m = meanings[idx];
          return (
            <Fragment key={p.wordId}>
              <MatchCell
                number={idx + 1}
                state={cellState("word", p.wordId)}
                pairedWith={matched.has(p.wordId) ? `→ ${meaningNumber(p.wordId)}` : null}
                disabled={done}
                onClick={() => pick("word", p.wordId)}
              >
                <span className="flex-1 min-w-0 text-xs md:text-sm font-bold break-words md:whitespace-nowrap">{p.word}</span>
              </MatchCell>
              <MatchCell
                number={pairs.length + idx + 1}
                state={cellState("meaning", m.wordId)}
                pairedWith={matched.has(m.wordId) ? `← ${pairs.findIndex((x) => x.wordId === m.wordId) + 1}` : null}
                disabled={done}
                onClick={() => pick("meaning", m.wordId)}
              >
                <span className="flex-1 min-w-0 text-xs md:text-[13px] font-medium leading-relaxed">{m.meaningVN}</span>
              </MatchCell>
            </Fragment>
          );
        })}
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-2 md:gap-3 pt-2 text-xs">
        {!done ? (
          <button
            type="button"
            onClick={handleGiveUp}
            className="inline-flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 transition-colors font-semibold max-md:min-h-10"
            title="Xem đáp án các cặp nối"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Không nhớ</span>
          </button>
        ) : (
          <span />
        )}
        <span className="text-slate-400 dark:text-zinc-500 text-right">
          Chỉ cặp của từ <strong>{word.word}</strong> được tính điểm.
        </span>
      </div>

      {/* Dedicated Stable Feedback Area - ALWAYS occupies 48px so layout NEVER jumps */}
      <div className="min-h-[48px] md:h-[48px] flex items-center justify-center w-full">
        {done && !gaveUp ? (
          <div className="w-full h-full max-md:p-2.5 md:px-3.5 md:py-0 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2 shadow-xs animate-in fade-in duration-150">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="font-semibold">
              {targetMistakes === 0 && !byElimination
                ? `Chính xác! "${word.word}" đã được nối đúng ngay. Nhấn Enter hoặc Tiếp tục.`
                : targetMistakes === 0
                ? `Đã nối xong. "${word.word}" là cặp cuối còn lại nên nối theo loại trừ, chưa tính là nhớ chắc. Nhấn Enter hoặc Tiếp tục.`
                : `Đã nối xong. "${word.word}" cần ôn lại sớm. Nhấn Enter hoặc Tiếp tục.`}
            </span>
          </div>
        ) : done ? (
          <div className="w-full h-full max-md:p-2.5 md:px-3.5 md:py-0 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2 shadow-xs animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="font-semibold">
              Đã hiển thị các cặp nối đúng. Từ "{word.word}" sẽ được ôn lại sớm. Nhấn Enter hoặc Tiếp tục.
            </span>
          </div>
        ) : wrongNote ? (
          <div className="w-full h-full max-md:p-2.5 md:px-3.5 md:py-0 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2 shadow-xs animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{wrongNote}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type CellState = "matched" | "selected" | "wrong" | "awaiting" | "idle";

function MatchCell({
  number,
  state,
  pairedWith,
  disabled,
  onClick,
  children,
}: {
  number: number;
  state: CellState;
  /** Arrow and number of the other half once the pair is made */
  pairedWith: string | null;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || state === "matched"}
      className={`h-full min-h-[3.5rem] w-full px-2 md:px-3 py-2 md:py-2.5 rounded-xl border text-left transition-all flex items-center gap-1.5 md:gap-2.5 shadow-sm ${
        state === "matched"
          ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200"
          : state === "selected"
          ? "border-cyan-500 ring-2 ring-cyan-500/30 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-900 dark:text-cyan-200"
          : state === "wrong"
          ? "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 animate-shake"
          : state === "awaiting"
          ? "border-dashed border-cyan-300 dark:border-cyan-700 bg-cyan-50/20 dark:bg-cyan-950/20 hover:border-cyan-400 text-slate-800 dark:text-zinc-200"
          : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-slate-300 text-slate-800 dark:text-zinc-200"
      }`}
    >
      <KeyBadge
        number={number}
        className={
          state === "matched"
            ? "bg-emerald-500 text-white border-transparent"
            : state === "selected"
            ? "bg-cyan-500 text-white border-transparent"
            : state === "wrong"
            ? "bg-rose-500 text-white border-transparent"
            : "bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300"
        }
      />
      {children}
      {pairedWith && <span className="shrink-0 text-[10px] md:text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">{pairedWith}</span>}
    </button>
  );
}
