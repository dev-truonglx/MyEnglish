import { useState, useEffect, useRef } from "react";
import { Volume2, CheckCircle2, HelpCircle, Snail, Music } from "lucide-react";
import { Rating } from "@/services/srs";
import type { WordDetail } from "@/types/database";

interface ListeningDictationExerciseProps {
  word: WordDetail;
  onComplete: (isCorrect: boolean, attempts: number, rating: Rating) => void;
  onSpeak: (text: string, rate?: number) => void;
}

export default function ListeningDictationExercise({
  word,
  onComplete,
  onSpeak,
}: ListeningDictationExerciseProps) {
  const [inputVal, setInputVal] = useState("");
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shake, setShake] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const playAudio = (rate: number = 0.9) => {
    setIsPlaying(true);
    onSpeak(word.word, rate);
    setTimeout(() => setIsPlaying(false), 900);
  };

  // Auto-play audio when word loads
  useEffect(() => {
    setInputVal("");
    setIsAnswered(false);
    setIsCorrect(null);
    setWrongAttempts(0);
    setShowHint(false);
    setShake(false);

    const timer = setTimeout(() => {
      playAudio(0.9);
      inputRef.current?.focus();
    }, 300);

    return () => clearTimeout(timer);
  }, [word]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isAnswered) return;

    const cleanInput = inputVal.trim().toLowerCase();
    const target = word.word.trim().toLowerCase();

    if (!cleanInput) {
      setShake(true);
      setTimeout(() => setShake(false), 350);
      return;
    }

    if (cleanInput === target) {
      setIsCorrect(true);
      setIsAnswered(true);
      playAudio(0.9);

      let rating: Rating = Rating.Easy;
      if (wrongAttempts === 0 && !showHint) rating = Rating.Easy;
      else if (wrongAttempts === 1) rating = Rating.Good;
      else rating = Rating.Hard;

      setTimeout(() => {
        onComplete(true, wrongAttempts, rating);
      }, 1000);
    } else {
      setIsCorrect(false);
      setWrongAttempts((prev) => prev + 1);
      setShake(true);
      setTimeout(() => setShake(false), 350);

      if (wrongAttempts >= 1) {
        setShowHint(true);
      }
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Listening Hero Box */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-8 text-center space-y-5 shadow-sm">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40">
          <Music className="w-3 h-3" />
          <span>Nghe phát âm và gõ lại chính xác</span>
        </div>

        {/* Big Audio Wave Play Button */}
        <div className="flex justify-center">
          <button
            onClick={() => playAudio(0.9)}
            type="button"
            className={`w-24 h-24 rounded-full flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-md ${
              isPlaying
                ? "bg-gradient-to-tr from-cyan-500 to-blue-500 text-white scale-105 ring-4 ring-cyan-500/30 animate-pulse"
                : "bg-slate-100 dark:bg-zinc-800 hover:bg-cyan-50 dark:hover:bg-zinc-700 text-cyan-600 dark:text-cyan-400 border border-slate-200 dark:border-zinc-700"
            }`}
          >
            <Volume2 className="w-9 h-9 mb-1" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Nghe</span>
          </button>
        </div>

        {/* Speed Controls */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => playAudio(0.9)}
            type="button"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5"
          >
            <Volume2 className="w-3.5 h-3.5 text-cyan-500" />
            <span>Tốc độ thường (1.0x)</span>
          </button>
          <button
            onClick={() => playAudio(0.6)}
            type="button"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5"
          >
            <Snail className="w-3.5 h-3.5 text-amber-500" />
            <span>Chậm (0.6x)</span>
          </button>
        </div>

        {/* Hint Box (if triggered) */}
        {showHint && !isAnswered && (
          <div className="pt-2 text-xs text-slate-500 dark:text-zinc-400 border-t border-slate-100 dark:border-zinc-800/80 animate-in fade-in">
            <span>Gợi ý: </span>
            {word.phonetic && (
              <span className="font-mono text-cyan-600 dark:text-cyan-400 mr-2">
                {word.phonetic}
              </span>
            )}
            <span>
              Ký tự đầu: <strong>{word.word.charAt(0).toUpperCase()}</strong>, gồm{" "}
              <strong>{word.word.length}</strong> chữ cái.
            </span>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className={`relative ${shake ? "animate-shake" : ""}`}>
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            disabled={isAnswered}
            placeholder="Gõ từ bạn nghe được và nhấn Enter..."
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            className={`w-full px-5 py-4 rounded-xl text-center text-lg md:text-xl font-mono font-bold tracking-wider outline-none transition-all ${
              isCorrect === true
                ? "border-2 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200"
                : isCorrect === false
                ? "border-2 border-rose-400 bg-rose-50/50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200"
                : "border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 text-slate-900 dark:text-white shadow-sm"
            }`}
          />
        </div>

        <div className="flex items-center justify-between text-xs px-1">
          <button
            type="button"
            onClick={() => setShowHint(true)}
            className="text-slate-400 hover:text-cyan-500 flex items-center gap-1 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Xem gợi ý phát âm</span>
          </button>

          <button
            type="submit"
            disabled={!inputVal.trim() || isAnswered}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 transition-all shadow-sm"
          >
            Kiểm tra
          </button>
        </div>
      </form>

      {/* Result Card */}
      {isAnswered && isCorrect && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-sm flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <div>
              <p className="font-bold font-mono text-base">{word.word}</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                {word.phonetic && `${word.phonetic} — `}
                {word.meaning_vn}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
