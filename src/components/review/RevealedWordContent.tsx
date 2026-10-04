import { Volume2, RotateCcw, Code2, BookOpen } from "lucide-react";
import type { WordDetail } from "@/types/database";
import { isLeech } from "@/services/smartReview";
import { highlightWord } from "./highlightWord";
import MnemonicPanel from "./MnemonicPanel";

/**
 * Subcomponent to render revealed word details (Vietnamese meaning, code examples & grammar analysis)
 */
export default function RevealedWordContent({
  currentWord,
  handleSpeak,
  onFlipBack,
  compact = false,
}: {
  currentWord: WordDetail;
  handleSpeak: (text: string, e?: React.MouseEvent) => void;
  onFlipBack?: () => void;
  compact?: boolean;
}) {
  const hasExamples = Boolean(currentWord.examples && currentWord.examples.length > 0);
  const wordIsLeech = isLeech(currentWord.srs);

  return (
    <div
      className={`flex flex-col ${
        compact ? "space-y-3" : "flex-1 min-h-0 justify-between h-full"
      } animate-in fade-in duration-200`}
    >
      {/* Top Header Section */}
      <div className="space-y-2 shrink-0 pb-2 border-b border-slate-200 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white capitalize font-mono">
              {currentWord.word}
            </h3>
            {currentWord.phonetic && (
              <span className="text-xs font-mono text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-200/60 dark:border-cyan-800/40">
                {currentWord.phonetic}
              </span>
            )}
            <button
              onClick={(e) => handleSpeak(currentWord.word, e)}
              className="text-slate-400 hover:text-cyan-600 dark:text-zinc-500 dark:hover:text-cyan-400 transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800"
              title="Phát âm từ vựng"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!compact && (
              <button
                onClick={(e) => {
                  if (onFlipBack) {
                    e.stopPropagation();
                    onFlipBack();
                  }
                }}
                className="text-[11px] font-mono text-cyan-700 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 flex items-center gap-1.5 bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/60 dark:hover:bg-cyan-900/60 px-2.5 py-1 rounded-lg border border-cyan-200/60 dark:border-cyan-800/40 transition-colors"
                title="Lật thẻ về mặt trước"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Click thẻ để lật lại</span>
              </button>
            )}
          </div>
        </div>

        {/* Primary Vietnamese Meaning Header Pill */}
        <div className="px-3.5 py-2 rounded-xl bg-cyan-50/90 dark:bg-cyan-950/50 border border-cyan-200/80 dark:border-cyan-800/60 flex items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-cyan-800 dark:text-cyan-400 font-bold uppercase tracking-wider">
              Nghĩa tiếng Việt:
            </span>
            <span className="text-sm md:text-base font-semibold text-cyan-950 dark:text-cyan-100">
              {currentWord.meaning_vn}
            </span>
          </div>
        </div>

        {/* AI Mnemonic Memory Hook for Leech / Challenging Words */}
        <MnemonicPanel currentWord={currentWord} wordIsLeech={wordIsLeech} />
      </div>

      {/* Main Content Area: Examples & Grammar Analysis taking full card height */}
      <div
        className={
          compact
            ? "space-y-3 py-1"
            : "flex-1 min-h-0 h-full overflow-y-auto pr-1 py-2 space-y-3 scrollbar-thin"
        }
      >
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-cyan-700 dark:text-cyan-400 font-bold uppercase tracking-wider pt-0.5">
          <Code2 className="w-3.5 h-3.5" />
          <span>Ví dụ & Phân tích ngữ pháp ({currentWord.examples?.length || 0}):</span>
        </div>

        {hasExamples ? (
          <div className="space-y-3">
            {currentWord.examples.map((ex, idx) => (
              <div
                key={idx}
                className="rounded-2xl bg-slate-50 dark:bg-zinc-900/90 p-4 border border-slate-200 dark:border-zinc-800/80 space-y-2.5 shadow-2xs hover:border-cyan-500/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm md:text-base font-semibold text-slate-900 dark:text-zinc-100 font-mono leading-relaxed">
                    "{highlightWord(ex.sentence_en, currentWord.word)}"
                  </p>
                  <button
                    onClick={(e) => handleSpeak(ex.sentence_en, e)}
                    title="Nghe câu ví dụ"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-600 dark:text-zinc-500 dark:hover:text-cyan-400 hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition-colors shrink-0"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                {ex.sentence_vn && (
                  <p className="text-xs md:text-sm text-cyan-800 dark:text-cyan-300 italic leading-relaxed bg-cyan-50/60 dark:bg-cyan-950/30 px-3 py-2 rounded-xl border border-cyan-100 dark:border-cyan-900/40">
                    {ex.sentence_vn}
                  </p>
                )}

                {ex.grammar_analysis && (
                  <div className="pt-2 border-t border-slate-200/80 dark:border-zinc-800/80 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Cú pháp & Phân tích ngữ pháp:</span>
                    </div>
                    <div className="text-xs md:text-[13px] text-slate-800 dark:text-zinc-200 font-mono leading-relaxed bg-amber-50/70 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40">
                      {ex.grammar_analysis}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400 dark:text-zinc-500 space-y-2">
            <Code2 className="w-10 h-10 mx-auto opacity-40 text-cyan-500" />
            <p className="text-sm">Chưa có câu ví dụ và phân tích ngữ pháp cho từ này.</p>
          </div>
        )}
      </div>
    </div>
  );
}
