import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Delete, HelpCircle, Shuffle } from "lucide-react";
import { Rating } from "@/services/srs";
import type { WordDetail } from "@/types/database";
import { pickExample } from "@/services/smartReview";
import { getConciseMeaning } from "@/services/meaningText";

interface LetterTilesExerciseProps {
  word: WordDetail;
  /** Rating: Hard when the first-letter hint was used, else Good; attempts = wrong tries */
  onComplete: (isCorrect: boolean, attempts: number, rating: Rating) => void;
  onSpeak: (text: string) => void;
}

/** Characters placed automatically (the learner only builds the letters) */
const FIXED = /[\s\-'’.]/;
/** Extra letters that are not in the word, so the last tile is never a give-away */
const EXTRA_POOL = "etaoinsrhldcumpbgk";

interface Tile {
  id: number;
  ch: string;
}

function buildTiles(target: string, random: () => number = Math.random): Tile[] {
  const letters = [...target.toLowerCase()].filter((c) => !FIXED.test(c));
  const extras = [...EXTRA_POOL].filter((c) => !letters.includes(c)).sort(() => random() - 0.5).slice(0, 2);
  const all = [...letters, ...extras].map((ch, id) => ({ id, ch }));
  // Fisher-Yates, then make sure the tiles do not already spell the word in order
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  if (all.slice(0, letters.length).map((t) => t.ch).join("") === letters.join("") && all.length > 1) {
    [all[0], all[all.length - 1]] = [all[all.length - 1], all[0]];
  }
  return all;
}

/**
 * First step of the recall ladder (see selectExerciseType): the Vietnamese meaning is shown, the learner
 * builds the English word from shuffled letters (plus two extra ones). Easier than typing from scratch,
 * so a beginner can start producing words without failing on every spelling detail.
 */
export default function LetterTilesExercise({ word, onComplete, onSpeak }: LetterTilesExerciseProps) {
  const target = word.word.trim();
  const slots = useMemo(() => [...target.toLowerCase()], [target]);
  const [tiles, setTiles] = useState<Tile[]>(() => buildTiles(target));
  const [picked, setPicked] = useState<number[]>([]); // tile ids, in slot order (letters only)
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [hint, setHint] = useState(false);
  const [state, setState] = useState<"building" | "wrong" | "correct">("building");
  const doneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const letterCount = slots.filter((c) => !FIXED.test(c)).length;
  const example = pickExample(word);

  const builtLetters = picked.map((id) => tiles.find((t) => t.id === id)?.ch ?? "");
  // Fill the slots: fixed characters in place, built letters in the others
  const display = (() => {
    let k = 0;
    return slots.map((c) => (FIXED.test(c) ? c : builtLetters[k++] ?? ""));
  })();

  const check = useCallback(
    (ids: number[]) => {
      const built = ids.map((id) => tiles.find((t) => t.id === id)?.ch ?? "").join("");
      const expected = slots.filter((c) => !FIXED.test(c)).join("");
      if (built === expected) {
        setState("correct");
        doneRef.current = true;
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
    [tiles, slots, onSpeak, target, onComplete, wrongAttempts, hint]
  );

  const pick = useCallback(
    (id: number) => {
      if (doneRef.current) return;
      setState("building");
      setPicked((prev) => {
        if (prev.includes(id) || prev.length >= letterCount) return prev;
        const next = [...prev, id];
        if (next.length === letterCount) setTimeout(() => check(next), 0);
        return next;
      });
    },
    [letterCount, check]
  );

  const undo = useCallback(() => {
    if (doneRef.current) return;
    setState("building");
    setPicked((prev) => prev.slice(0, -1));
  }, []);

  const clear = () => {
    if (doneRef.current) return;
    setState("building");
    setPicked([]);
    setTiles((prev) => [...prev].sort(() => Math.random() - 0.5));
  };

  // Keyboard: type a letter to pick a matching tile, Backspace to undo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (doneRef.current) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        undo();
        return;
      }
      if (e.key.length !== 1) return;
      const ch = e.key.toLowerCase();
      const tile = tiles.find((t) => t.ch === ch && !picked.includes(t.id));
      if (tile) {
        e.preventDefault();
        pick(tile.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tiles, picked, pick, undo]);

  return (
    <div className="w-full max-w-xl mx-auto space-y-5 animate-in fade-in duration-200">
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-6 text-center space-y-2 shadow-sm">
        <div className="text-[11px] font-medium text-cyan-700 dark:text-cyan-400">Xếp chữ cái thành từ tiếng Anh có nghĩa:</div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{getConciseMeaning(word.meaning_vn)}</h2>
        {word.part_of_speech && <p className="text-xs italic text-slate-400">{word.part_of_speech}</p>}
        {example?.sentence_vn && <p className="text-sm text-slate-500 dark:text-zinc-400">Ví dụ: {example.sentence_vn}</p>}
      </div>

      {/* Slots */}
      <div className={`flex flex-wrap justify-center gap-1.5 ${state === "wrong" ? "animate-shake" : ""}`}>
        {display.map((c, i) =>
          FIXED.test(slots[i]) ? (
            <span key={i} className="w-4" />
          ) : (
            <span
              key={i}
              className={`w-10 h-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold font-mono ${state === "correct"
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                : state === "wrong"
                  ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200"
                  : c
                    ? "border-cyan-400 bg-cyan-50 dark:bg-cyan-950/30 text-slate-900 dark:text-white"
                    : "border-dashed border-slate-300 dark:border-zinc-700"
                }`}
            >
              {c || (hint && i === 0 ? <span className="text-slate-300 dark:text-zinc-600">{slots[0]}</span> : "")}
            </span>
          )
        )}
      </div>

      {/* Tiles */}
      <div className="flex flex-wrap justify-center gap-2">
        {tiles.map((t) => {
          const used = picked.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              disabled={used || state === "correct"}
              className={`w-11 h-11 rounded-xl text-lg font-bold font-mono shadow-sm transition-all ${used
                ? "bg-slate-100 dark:bg-zinc-800 text-transparent border border-slate-200 dark:border-zinc-800"
                : "bg-white dark:bg-zinc-900 border-2 border-slate-300 dark:border-zinc-700 text-slate-800 dark:text-zinc-100 hover:border-cyan-400 active:scale-95"
                }`}
            >
              {t.ch}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs px-1 min-h-[28px]">
        <div className="flex gap-2">
          <button onClick={undo} disabled={picked.length === 0 || state === "correct"} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 disabled:opacity-40">
            <Delete className="w-3.5 h-3.5" /> Xóa chữ cuối
          </button>
          <button onClick={clear} disabled={state === "correct"} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 disabled:opacity-40">
            <Shuffle className="w-3.5 h-3.5" /> Làm lại
          </button>
          {!hint && state !== "correct" && (
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
        ) : (
          <span className="text-slate-400">Có thể gõ phím chữ cái để chọn</span>
        )}
      </div>
    </div>
  );
}
