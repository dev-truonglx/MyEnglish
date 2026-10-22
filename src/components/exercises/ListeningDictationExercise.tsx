import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Volume2, CheckCircle2, Snail, Music, XCircle } from "lucide-react";
import { Rating } from "@/services/srs";
import type { WordDetail } from "@/types/database";
import { generateListeningQuestion, type MultipleChoiceOption, type MultipleChoiceQuestion } from "@/services/smartReview";
import { catalogSoundPoolIfLoaded, loadCatalogSoundPool } from "@/services/vocabCatalog";
import { samePronunciation } from "@/utils/exerciseHints";
import { playWrongTry } from "@/services/sound";
import { AUTO_SPEAK_DELAY_MS, SLOW_RATE } from "@/components/review/speech";

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
 * The wrong options are the deck words that sound most like it (generateListeningQuestion), so they can only
 * be told apart by ear; once answered, every option shows its English word and IPA and can be played.
 */
export default function ListeningDictationExercise({
  word,
  allWords,
  onComplete,
  onSpeak,
}: ListeningDictationExerciseProps) {
  // The whole deck's sounds, loaded once per window; options wait for it (a failed load falls back to meanings)
  const [deckSounds, setDeckSounds] = useState(catalogSoundPoolIfLoaded);
  const [deckFailed, setDeckFailed] = useState(false);
  useEffect(() => {
    if (deckSounds) return;
    let live = true;
    loadCatalogSoundPool()
      .then((pool) => live && setDeckSounds(pool))
      .catch(() => live && setDeckFailed(true));
    return () => {
      live = false;
    };
  }, [deckSounds]);
  const ready = deckSounds !== null || deckFailed;

  const question = useMemo<MultipleChoiceQuestion | null>(
    () => {
      if (!ready) return null;
      // The learner's own words outside the deck can sound alike too; deck words are in deckSounds already
      const ownWords = allWords.filter((w) => !w.catalog_id && w.phonetic);
      // A word that sounds the same as the target (right / write) would be a right answer by ear: never a distractor
      const fallback = allWords.filter((w) => !samePronunciation(w.phonetic, word.phonetic));
      return generateListeningQuestion(word, [...(deckSounds ?? []), ...ownWords], fallback);
    },
    // Options must not reshuffle while answering
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [word.id, ready]
  );
  const [wrongIds, setWrongIds] = useState<Set<string>>(new Set());
  const [isAnswered, setIsAnswered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
      if (playingTimerRef.current) clearTimeout(playingTimerRef.current);
    };
  }, []);

  const playAudio = useCallback(
    (rate?: number) => {
      setIsPlaying(true);
      onSpeak(word.word, rate);
      if (playingTimerRef.current) clearTimeout(playingTimerRef.current);
      const duration = rate && rate < 0.7 ? 1600 : 900;
      playingTimerRef.current = setTimeout(() => {
        playingTimerRef.current = null;
        setIsPlaying(false);
      }, duration);
    },
    [onSpeak, word.word]
  );

  useEffect(() => {
    setWrongIds(new Set());
    setIsAnswered(false);
    const timer = setTimeout(() => playAudio(), AUTO_SPEAK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [word.id]);

  const handleSelect = useCallback(
    (option: MultipleChoiceOption) => {
      if (isAnswered || wrongIds.has(option.id)) return;
      if (option.isCorrect) {
        setIsAnswered(true);
        const attempts = wrongIds.size;
        // Reported at once: the session keeps this card on screen until the learner continues
        if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
        onComplete(attempts === 0, attempts, Rating.Good);
      } else {
        playWrongTry();
        setWrongIds((prev) => new Set(prev).add(option.id));
      }
    },
    [isAnswered, wrongIds, onComplete]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAnswered || e.metaKey || e.ctrlKey || e.altKey) return;
      const idx = ["1", "2", "3", "4"].indexOf(e.key);
      const option = question?.options[idx];
      if (option) handleSelect(option);
      if (e.key === "r" || e.key === "R") playAudio();
      if (e.key === "s" || e.key === "S") playAudio(SLOW_RATE);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAnswered, question, handleSelect, playAudio]);

  return (
    <div className="w-full max-w-xl mx-auto space-y-5 animate-in fade-in duration-200">
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-6 text-center space-y-4 shadow-sm">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40">
          <Music className="w-3 h-3" />
          <span>Nghe từ và chọn nghĩa đúng</span>
        </div>

        <div className="flex justify-center">
          <button
            onClick={() => playAudio()}
            type="button"
            className={`w-20 h-20 rounded-full flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-md cursor-pointer ${
              isPlaying
                ? "bg-gradient-to-tr from-cyan-500 to-blue-500 text-white scale-105 ring-4 ring-cyan-500/30 animate-pulse"
                : "bg-slate-100 dark:bg-zinc-800 hover:bg-cyan-50 dark:hover:bg-zinc-700 text-cyan-600 dark:text-cyan-400 border border-slate-200 dark:border-zinc-700"
            }`}
            title="Nghe tốc độ thường (Phím R)"
          >
            <Volume2 className="w-8 h-8 mb-0.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Nghe</span>
          </button>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => playAudio(SLOW_RATE)}
            type="button"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Nghe chậm (Phím S)"
          >
            <Snail className="w-3.5 h-3.5 text-amber-500" />
            <span>Nghe chậm</span>
          </button>
          <span className="text-[11px] text-slate-400 dark:text-zinc-500">Phím R: nghe lại · S: nghe chậm · 1–4: chọn</span>
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
        {!question &&
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[50px] rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 animate-pulse" />
          ))}
        {question?.options.map((o, idx) => {
          const wrong = wrongIds.has(o.id);
          const right = isAnswered && o.isCorrect;
          // A wrong pick shows its word at once (it gives nothing away); every option once answered
          const revealed = (isAnswered || wrong) && Boolean(o.word);
          // Once answered, an option plays its word: hear the right word and the sound-alikes side by side
          const playable = isAnswered && Boolean(o.word);
          return (
            <button
              key={o.id}
              onClick={() => (playable ? onSpeak(o.word!) : handleSelect(o))}
              disabled={playable ? false : isAnswered || wrong}
              title={playable ? `Nghe "${o.word}"` : undefined}
              className={`w-full p-3.5 rounded-xl border text-left text-sm transition-all flex items-center gap-3 ${
                right
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100"
                  : wrong
                  ? "border-rose-300 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 opacity-70"
                  : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-cyan-400 text-slate-800 dark:text-zinc-200"
              } ${playable ? "cursor-pointer" : ""}`}
            >
              <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-zinc-800 text-[11px] font-mono flex items-center justify-center shrink-0">
                {idx + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block">{o.text}</span>
                {revealed && (
                  <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="font-semibold">{o.word}</span>
                    {o.phonetic && <span className="font-mono text-cyan-600 dark:text-cyan-400">{o.phonetic}</span>}
                  </span>
                )}
              </span>
              {playable && <Volume2 className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />}
              {right && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
              {wrong && <XCircle className="w-4 h-4 text-rose-500 shrink-0" />}
            </button>
          );
        })}
        {isAnswered && question?.options.some((o) => o.word) && (
          <p className="text-[11px] text-center text-slate-400 dark:text-zinc-500">Bấm vào từng đáp án để nghe và so sánh cách phát âm</p>
        )}
      </div>
    </div>
  );
}
