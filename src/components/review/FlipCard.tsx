import { Volume2, Eye } from "lucide-react";
import type { ReviewCard, TermWithMeaning } from "@/types/database";
import RevealedWordContent from "./RevealedWordContent";
import { handleSpeak } from "./speech";

interface FlipCardProps {
  currentWord: ReviewCard;
  synonyms: TermWithMeaning[];
  isFlipped: boolean;
  setIsFlipped: (value: boolean) => void;
}

/** MODE 1: STANDARD FLIP */
export default function FlipCard({ currentWord, synonyms, isFlipped, setIsFlipped }: FlipCardProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col justify-between">
      {!isFlipped ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center space-y-4 py-8">
          <span className="text-[11px] font-mono uppercase tracking-widest text-cyan-600 dark:text-cyan-400 font-semibold">
            Từ vựng
          </span>

          <div className="flex items-center gap-3 flex-wrap justify-center">
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight font-mono">
              {currentWord.word}
            </h2>
            <button
              onClick={(e) => handleSpeak(currentWord.word, e)}
              title="Phát âm"
              className="p-2.5 rounded-full bg-cyan-50 dark:bg-cyan-500/10 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/30 transition-colors shadow-sm"
            >
              <Volume2 className="w-5 h-5" />
            </button>
          </div>

          {currentWord.phonetic && (
            <span className="text-sm font-mono text-cyan-700 dark:text-cyan-300/80 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 py-1 rounded-full">
              {currentWord.phonetic}
            </span>
          )}

          {synonyms.length > 0 && (
            <div className="flex gap-1.5 justify-center flex-wrap pt-2">
              {synonyms.slice(0, 3).map((s, i) => (
                <span
                  key={i}
                  className="text-[11px] font-mono text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800/60 px-2.5 py-0.5 rounded border border-slate-200 dark:border-zinc-700/40"
                >
                  {s.word}
                </span>
              ))}
            </div>
          )}

          <div className="pt-8 text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 animate-pulse">
            <Eye className="w-4 h-4" />
            <span>Nhấn Space hoặc click vào thẻ để xem định nghĩa</span>
          </div>
        </div>
      ) : (
        <RevealedWordContent
          currentWord={currentWord}
          handleSpeak={handleSpeak}
          onFlipBack={() => setIsFlipped(false)}
        />
      )}
    </div>
  );
}
