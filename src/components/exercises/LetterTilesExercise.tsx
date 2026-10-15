import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Delete, HelpCircle, RotateCcw } from "lucide-react";
import { Rating } from "@/services/srs";
import type { WordDetail } from "@/types/database";
import { pickExample } from "@/services/smartReview";
import { getConciseMeaning } from "@/services/meaningText";
import { maskTargetInMeaning } from "@/utils/exerciseHints";

interface LetterTilesExerciseProps {
  word: WordDetail;
  /** Rating: Hard when the first-letter hint was used, else Good; attempts = wrong tries */
  onComplete: (isCorrect: boolean, attempts: number, rating: Rating) => void;
  onSpeak: (text: string) => void;
  hideHeader?: boolean;
  hideHints?: boolean;
}

/** Characters placed automatically (the learner only builds the letters) */
export const FIXED = /[\s\-'’.,/()]/;
/** Extra letters that are not in the word, so the user must identify the correct letters among distractors */
export const EXTRA_POOL = "etaoinsrhldcumfpgwybvkxjqz";

export interface Tile {
  id: number;
  ch: string;
}

export function buildTiles(
  target: string,
  random: () => number = Math.random,
  distractorCount?: number
): Tile[] {
  const letters = [...target.toLowerCase()].filter((c) => !FIXED.test(c));
  // 3-4 distractor letters unless explicitly specified
  const count = distractorCount !== undefined ? distractorCount : (Math.floor(random() * 2) + 3);

  const distinctExtras = [...EXTRA_POOL].filter((c) => !letters.includes(c));
  for (let i = distinctExtras.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [distinctExtras[i], distinctExtras[j]] = [distinctExtras[j], distinctExtras[i]];
  }
  const extras = distinctExtras.slice(0, count);

  // Fallback in case distinct characters are fewer than count
  if (extras.length < count) {
    const fallback = [...EXTRA_POOL];
    for (let i = fallback.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [fallback[i], fallback[j]] = [fallback[j], fallback[i]];
    }
    extras.push(...fallback.slice(0, count - extras.length));
  }

  const all = [...letters, ...extras].map((ch, id) => ({ id, ch }));
  // Fisher-Yates, then make sure the tiles do not already spell the word in order
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  if (all.slice(0, letters.length).map((t) => t.ch).join("") === letters.join("") && all.length > 1) {
    const diffIdx = all.findIndex((t, idx) => idx > 0 && t.ch !== all[0].ch);
    if (diffIdx > 0) {
      [all[0], all[diffIdx]] = [all[diffIdx], all[0]];
    }
  }
  return all;
}

export interface VietDecomposition {
  base: string;
  telexKeys: string[];
}

/**
 * Decomposes Vietnamese accented characters back into their base ASCII vowel/consonant
 * and corresponding Telex key strokes (e.g. 'ỉ' -> { base: 'i', telexKeys: ['r'] }).
 */
export function decomposeVietnameseChar(ch: string): VietDecomposition | null {
  if (ch === "đ" || ch === "Đ") {
    return { base: "d", telexKeys: ["d"] };
  }
  const nfd = ch.normalize("NFD");
  if (nfd.length === 1 && nfd === ch) return null;

  const base = nfd[0].toLowerCase();
  const telexKeys: string[] = [];

  for (let i = 1; i < nfd.length; i++) {
    const code = nfd.charCodeAt(i);
    switch (code) {
      case 0x0309: // hỏi (e.g. ỉ, ả, ẻ, ỏ, ủ, ỷ) -> 'r'
        telexKeys.push("r");
        break;
      case 0x0301: // sắc (e.g. í, á, é, ó, ú, ý) -> 's'
        telexKeys.push("s");
        break;
      case 0x0300: // huyền (e.g. ì, à, è, ò, ù, ỳ) -> 'f'
        telexKeys.push("f");
        break;
      case 0x0303: // ngã (e.g. ĩ, ã, ẽ, õ, ũ, ỹ) -> 'x'
        telexKeys.push("x");
        break;
      case 0x0323: // nặng (e.g. ị, ạ, ẹ, ọ, ụ, ỵ) -> 'j'
        telexKeys.push("j");
        break;
      case 0x0306: // ă (a + w) -> 'w'
        telexKeys.push("w");
        break;
      case 0x031B: // ơ, ư (o + w, u + w) -> 'w'
        telexKeys.push("w");
        break;
      case 0x0302: // â, ê, ô (a + a, e + e, o + o) -> repeat base
        telexKeys.push(base);
        break;
      default:
        break;
    }
  }

  if (telexKeys.length === 0) return null;
  return { base, telexKeys };
}

/**
 * First step of the recall ladder (see selectExerciseType): the Vietnamese meaning is shown, the learner
 * builds the English word from shuffled letters of that word (plus 3-4 distractor letters). Easier than typing from scratch,
 * so a beginner can start producing words without failing on every spelling detail.
 */
export default function LetterTilesExercise({
  word,
  onComplete,
  onSpeak,
  hideHeader = false,
  hideHints = hideHeader,
}: LetterTilesExerciseProps) {
  const target = word.word.trim();
  const slots = useMemo(() => [...target.toLowerCase()], [target]);
  const [tiles, setTiles] = useState<Tile[]>(() => buildTiles(target));
  const [picked, setPicked] = useState<number[]>([]); // tile ids, in slot order (letters only)
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [hint, setHint] = useState(false);
  const [state, setState] = useState<"building" | "wrong" | "correct">("building");
  const doneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recentUndosRef = useRef<Array<{ id: number; ch: string; time: number }>>([]);

  useEffect(() => {
    setTiles(buildTiles(target));
    setPicked([]);
    setWrongAttempts(0);
    setHint(false);
    setState("building");
    doneRef.current = false;
    recentUndosRef.current = [];
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [target]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const letterCount = slots.filter((c) => !FIXED.test(c)).length;
  const example = pickExample(word);

  const builtLetters = picked.map((id) => tiles.find((t) => t.id === id)?.ch ?? "");
  const slotIndices = useMemo(() => {
    let k = 0;
    return slots.map((c) => (FIXED.test(c) ? -1 : k++));
  }, [slots]);

  const check = useCallback(
    (ids: number[]) => {
      if (doneRef.current || state === "correct" || state === "wrong") return;
      if (ids.length !== letterCount) return;
      const built = ids.map((id) => tiles.find((t) => t.id === id)?.ch ?? "").join("");
      const expected = slots.filter((c) => !FIXED.test(c)).join("");
      if (built === expected) {
        doneRef.current = true;
        setState("correct");
        onSpeak(target);
        // Reported at once: the session keeps the built word on screen until the learner continues
        onComplete(true, wrongAttempts, hint ? Rating.Hard : Rating.Good);
      } else {
        setState("wrong");
        const tries = wrongAttempts + 1;
        setWrongAttempts(tries);
        if (tries >= 2) setHint(true);
        // Show the wrong word briefly, then give the tiles back
        timerRef.current = setTimeout(() => {
          setPicked([]);
          setState("building");
        }, 900);
      }
    },
    [tiles, slots, onSpeak, target, onComplete, wrongAttempts, hint, letterCount, state]
  );

  const pick = useCallback(
    (id: number) => {
      if (doneRef.current || state === "correct") return;
      if (state === "wrong") {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setPicked([]);
      }
      setState("building");
      setPicked((prev) => {
        if (prev.includes(id) || prev.length >= letterCount) return prev;
        return [...prev, id];
      });
    },
    [letterCount, state]
  );

  const unpickAt = useCallback(
    (index: number) => {
      if (doneRef.current || state === "correct") return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setState("building");
      setPicked((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        return prev.filter((_, i) => i !== index);
      });
    },
    [state]
  );

  const undo = useCallback(() => {
    if (doneRef.current || state === "correct") return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setState("building");
    setPicked((prev) => {
      if (prev.length === 0) return prev;
      const lastId = prev[prev.length - 1];
      const lastTile = tiles.find((t) => t.id === lastId);
      if (lastTile) {
        const now = Date.now();
        recentUndosRef.current = [
          ...recentUndosRef.current.filter((u) => now - u.time < 500).slice(-4),
          { id: lastId, ch: lastTile.ch, time: now },
        ];
      }
      return prev.slice(0, -1);
    });
  }, [state, tiles]);

  const clear = () => {
    if (doneRef.current || state === "correct") return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    recentUndosRef.current = [];
    setState("building");
    setPicked([]);
  };

  // Keyboard: type a letter to pick a matching tile, Backspace to undo, Enter to submit and check
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (doneRef.current || state === "correct") return;
      if (e.repeat) return;

      if (e.key === "Backspace") {
        e.preventDefault();
        undo();
        return;
      }

      if (e.key === "Enter") {
        if (picked.length === letterCount && state !== "wrong") {
          e.preventDefault();
          e.stopPropagation();
          check(picked);
        }
        return;
      }

      if (e.key.length !== 1) return;
      const ch = e.key.toLowerCase();

      // 1. Vietnamese Telex support: when typing with Vietnamese IME (EVKey, Unikey, macOS Telex),
      // typing 'r' after 'i' (like in "their") causes the IME to send Backspace (deleting 'i') followed by 'ỉ'.
      // We detect the accented character, restore the deleted vowel, and pick the intended letter ('r').
      const viet = decomposeVietnameseChar(ch);
      if (viet) {
        e.preventDefault();
        setPicked((prev) => {
          let nextPicked = [...prev];
          const now = Date.now();

          // Check if the base vowel was deleted by the IME's fake Backspace within the last 350ms
          const undoIdx = recentUndosRef.current.findIndex(
            (u) => u.ch === viet.base && now - u.time < 350 && !nextPicked.includes(u.id)
          );

          if (undoIdx !== -1) {
            const [restored] = recentUndosRef.current.splice(undoIdx, 1);
            if (nextPicked.length < letterCount) {
              nextPicked.push(restored.id);
            }
          } else {
            // If not undone, check if current end of picked has base
            const lastId = nextPicked[nextPicked.length - 1];
            const lastTile = tiles.find((t) => t.id === lastId);
            if (!lastTile || lastTile.ch !== viet.base) {
              const baseTile = tiles.find((t) => t.ch === viet.base && !nextPicked.includes(t.id));
              if (baseTile && nextPicked.length < letterCount) {
                nextPicked.push(baseTile.id);
              }
            }
          }

          // Pick the Telex modifier keys (e.g. 'r' for ỉ, 's' for í, 'w' for ơ/ư/ă, etc.)
          for (const key of viet.telexKeys) {
            if (nextPicked.length >= letterCount) break;
            const tile = tiles.find((t) => t.ch === key && !nextPicked.includes(t.id));
            if (tile) {
              nextPicked.push(tile.id);
            }
          }

          return nextPicked;
        });
        return;
      }

      // 2. Normal ASCII letter matching
      const tile = tiles.find((t) => t.ch === ch && !picked.includes(t.id));
      if (tile) {
        e.preventDefault();
        pick(tile.id);
        return;
      }

      // 3. Fallback to physical key from e.code if key character was modified by another IME layout
      if (e.code && e.code.startsWith("Key")) {
        const physicalChar = e.code.slice(3).toLowerCase();
        if (physicalChar.length === 1 && physicalChar !== ch) {
          const fallbackTile = tiles.find((t) => t.ch === physicalChar && !picked.includes(t.id));
          if (fallbackTile) {
            e.preventDefault();
            pick(fallbackTile.id);
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tiles, picked, pick, undo, check, letterCount, state]);

  return (
    <div className="w-full max-w-xl mx-auto space-y-4 animate-in fade-in duration-200">
      {!hideHeader ? (
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-6 text-center space-y-2 shadow-sm">
          <div className="text-[11px] font-medium text-cyan-700 dark:text-cyan-400">Xếp chữ cái thành từ tiếng Anh có nghĩa:</div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{maskTargetInMeaning(getConciseMeaning(word.meaning_vn, target, example), target)}</h2>
          {word.part_of_speech && <p className="text-xs italic text-slate-400">{word.part_of_speech}</p>}
          {example?.sentence_vn && <p className="text-sm text-slate-500 dark:text-zinc-400">Ví dụ: {example.sentence_vn}</p>}
        </div>
      ) : (
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-zinc-400 pt-1">
          <span>Xếp chữ cái thành từ tiếng Anh:</span>
          <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 font-bold">
            {letterCount} chữ cái
          </span>
        </div>
      )}

      {/* Slots */}
      <div className={`flex flex-wrap justify-center gap-1.5 ${state === "wrong" ? "animate-shake" : ""}`}>
        {slots.map((slotChar, i) => {
          const isFixed = FIXED.test(slotChar);
          if (isFixed) {
            return (
              <span key={i} className="w-4 flex items-center justify-center font-bold text-slate-400 dark:text-zinc-500">
                {slotChar === " " ? "" : slotChar}
              </span>
            );
          }

          const nonFixedIdx = slotIndices[i];
          const hasLetter = nonFixedIdx >= 0 && nonFixedIdx < picked.length;
          const letter = hasLetter ? builtLetters[nonFixedIdx] : "";
          const isFirstSlotHint = hint && i === 0 && !hasLetter;

          if (hasLetter && state !== "correct") {
            return (
              <button
                key={i}
                type="button"
                onClick={() => unpickAt(nonFixedIdx)}
                title="Bấm để xóa chữ này"
                className={`w-10 h-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold font-mono transition-all cursor-pointer select-none group shadow-xs ${
                  state === "wrong"
                    ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 hover:border-rose-400 hover:bg-rose-50"
                    : "border-cyan-400 bg-cyan-50 dark:bg-cyan-950/30 text-slate-900 dark:text-white hover:border-rose-400 hover:bg-rose-50/80 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 hover:scale-105 active:scale-95"
                }`}
              >
                {letter}
              </button>
            );
          }

          return (
            <span
              key={i}
              className={`w-10 h-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold font-mono select-none ${
                state === "correct"
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                  : state === "wrong"
                    ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200"
                    : "border-dashed border-slate-300 dark:border-zinc-700 text-slate-400"
              }`}
            >
              {letter || (isFirstSlotHint ? <span className="text-slate-300 dark:text-zinc-600">{slots[0]}</span> : "")}
            </span>
          );
        })}
      </div>

      {/* Tiles */}
      <div className="flex flex-wrap justify-center gap-2">
        {tiles.map((t) => {
          const used = picked.includes(t.id);
          const pickedIdx = picked.indexOf(t.id);
          return (
            <button
              key={t.id}
              onClick={() => {
                if (used) {
                  unpickAt(pickedIdx);
                } else {
                  pick(t.id);
                }
              }}
              disabled={state === "correct"}
              title={used ? "Bấm để xóa chữ này khỏi từ đã ghép" : undefined}
              className={`w-11 h-11 rounded-xl text-lg font-bold font-mono shadow-sm transition-all ${
                used
                  ? "bg-slate-100 dark:bg-zinc-800/60 text-slate-400 dark:text-zinc-500 border border-dashed border-slate-300/70 dark:border-zinc-700/70 hover:border-rose-400 hover:text-rose-500 hover:bg-rose-50/40 dark:hover:bg-rose-950/20 active:scale-95 cursor-pointer"
                  : "bg-white dark:bg-zinc-900 border-2 border-slate-300 dark:border-zinc-700 text-slate-800 dark:text-zinc-100 hover:border-cyan-400 active:scale-95 cursor-pointer"
              }`}
            >
              {t.ch}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs px-1 min-h-[28px]">
        <div className="flex gap-2">
          {!hideHints && (
            <button onClick={undo} disabled={picked.length === 0 || state === "correct"} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 disabled:opacity-40">
              <Delete className="w-3.5 h-3.5" /> Xóa chữ cuối
            </button>
          )}
          <button
            onClick={clear}
            disabled={picked.length === 0 || state === "correct"}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Làm lại
          </button>
          {!hideHints && !hint && state !== "correct" && (
            <button onClick={() => setHint(true)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200">
              <HelpCircle className="w-3.5 h-3.5" /> Gợi ý chữ đầu
            </button>
          )}
        </div>
        {state === "correct" ? (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" /> {target}
          </span>
        ) : state === "wrong" ? (
          <span className="font-semibold text-amber-700 dark:text-amber-300">Gần rồi, đổi vài chữ rồi thử lại nhé</span>
        ) : picked.length === letterCount ? (
          <button
            type="button"
            onClick={() => check(picked)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs shadow-xs transition-all active:scale-95 cursor-pointer animate-in fade-in"
          >
            <span>Kiểm tra</span>
            <kbd className="px-1.5 py-0.5 bg-white/20 rounded text-[10px] font-mono">Enter</kbd>
          </button>
        ) : !hideHints ? (
          <span className="text-slate-400">Bấm vào chữ đã ghép để xóa · Có thể gõ phím</span>
        ) : null}
      </div>
    </div>
  );
}
