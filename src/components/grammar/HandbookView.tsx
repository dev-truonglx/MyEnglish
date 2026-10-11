import { useCallback } from "react";
import { Volume2, BookOpen, Lightbulb } from "lucide-react";
import type { GrammarBlock } from "@/types/grammarBook";
import { handleSpeak } from "@/components/review/speech";

interface HandbookViewProps {
  blocks: GrammarBlock[];
  title?: string;
  titleVn?: string;
  chapterNotes?: GrammarBlock[];
}

/** Imported data is the learner's own: anything that is not text shows as nothing instead of crashing */
function txt(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export default function HandbookView({
  blocks,
  title,
  titleVn,
  chapterNotes = [],
}: HandbookViewProps) {
  const speakText = useCallback((text: string) => {
    handleSpeak(text, 0.95);
  }, []);

  const safeBlocks = list<GrammarBlock>(blocks);
  const safeNotes = list<GrammarBlock>(chapterNotes);

  const renderBlock = (block: GrammarBlock, index: number) => {
    if (!block || typeof block !== "object") return null;
    switch (block.type) {
      case "heading":
        return (
          <h3
            key={index}
            className="text-base sm:text-lg font-bold text-slate-800 dark:text-zinc-100 mt-6 mb-2 border-b border-slate-200/80 dark:border-zinc-800 pb-1"
          >
            {txt(block.text)}
          </h3>
        );

      case "text":
        return (
          <p key={index} className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed my-2 whitespace-pre-line">
            {txt(block.text)}
          </p>
        );

      case "bullet":
        return (
          <div key={index} className="flex items-start gap-2.5 my-1.5 ml-2 text-sm text-slate-700 dark:text-zinc-300">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-2 shrink-0" />
            <span className="leading-relaxed flex-1 whitespace-pre-line">{txt(block.text)}</span>
          </div>
        );

      case "formula":
        return (
          <div
            key={index}
            className="my-3 p-4 rounded-xl bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200/80 dark:border-violet-800/50 shadow-sm"
          >
            {txt(block.label) && (
              <span className="inline-block px-2 py-0.5 mb-2 text-[11px] font-bold uppercase tracking-wider rounded bg-violet-200/70 dark:bg-violet-900/60 text-violet-800 dark:text-violet-200">
                {txt(block.label)}
              </span>
            )}
            <div className="font-mono text-sm sm:text-base font-semibold text-violet-950 dark:text-violet-100 whitespace-pre-line leading-relaxed">
              {txt(block.text)}
            </div>
          </div>
        );

      case "example":
        return (
          <div
            key={index}
            className="my-2.5 p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/90 border border-slate-200/70 dark:border-zinc-800 flex items-start justify-between gap-3 group hover:border-cyan-300 dark:hover:border-cyan-800/80 transition"
          >
            <div className="space-y-1 flex-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{txt(block.en)}</span>
              </div>
              {txt(block.vi) && (
                <div className="text-xs text-slate-500 dark:text-zinc-400">
                  {txt(block.vi)}
                </div>
              )}
            </div>
            <button
              onClick={() => speakText(txt(block.en))}
              className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition shrink-0"
              title="Phát âm tiếng Anh"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
        );

      case "note":
        return (
          <div
            key={index}
            className="my-3 p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200"
          >
            <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed whitespace-pre-line flex-1">{txt(block.text)}</div>
          </div>
        );

      case "table": {
        const headers = list<unknown>(block.headers);
        const rows = list<unknown>(block.rows);
        if (headers.length === 0 && rows.length === 0) return null;
        return (
          <div key={index} className="my-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              {headers.length > 0 && (
                <thead>
                  <tr className="bg-slate-100 dark:bg-zinc-800/90 text-slate-700 dark:text-zinc-300 font-bold border-b border-slate-200 dark:border-zinc-700">
                    {headers.map((h, hIdx) => (
                      <th key={hIdx} className="p-3 border-r border-slate-200 dark:border-zinc-700 last:border-r-0">
                        {txt(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {rows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="border-b border-slate-100 dark:border-zinc-800/50 hover:bg-slate-50/50 dark:hover:bg-zinc-900/50 transition last:border-b-0"
                  >
                    {(Array.isArray(row) ? row : [row]).map((cell: unknown, cIdx) => (
                      <td
                        key={cIdx}
                        className="p-3 border-r border-slate-200/60 dark:border-zinc-800/60 last:border-r-0 align-top text-slate-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed"
                      >
                        {txt(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      case "wordlist": {
        const items = list<{ en?: unknown; vi?: unknown } | null>(block.items).filter((item) => !!item && typeof item === "object");
        if (items.length === 0) return null;
        return (
          <div key={index} className="my-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {items.map((item, wIdx) => (
              <div
                key={wIdx}
                className="p-2.5 rounded-lg bg-slate-50 dark:bg-zinc-900/80 border border-slate-200/70 dark:border-zinc-800 flex items-center justify-between gap-2"
              >
                <div>
                  <span className="font-semibold text-xs text-slate-900 dark:text-zinc-100">{txt(item!.en)}</span>
                  {txt(item!.vi) && <span className="ml-2 text-xs text-slate-500 dark:text-zinc-400">({txt(item!.vi)})</span>}
                </div>
                <button
                  onClick={() => speakText(txt(item!.en))}
                  className="p-1 text-slate-400 hover:text-cyan-600 transition"
                  title="Phát âm"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-8">
      {/* Title Header if present */}
      {title && (
        <div className="mb-6 pb-3 border-b border-slate-200 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            <span>{title}</span>
          </h2>
          {titleVn && <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">{titleVn}</p>}
        </div>
      )}

      {/* Main Blocks */}
      <div className="space-y-1">
        {safeBlocks.map((block, idx) => renderBlock(block, idx))}
      </div>

      {/* Chapter Notes if present */}
      {safeNotes.length > 0 && (
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-zinc-800">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-3">
            Ghi nhớ chung của chương
          </h4>
          <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 space-y-2">
            {safeNotes.map((noteBlock, nIdx) => renderBlock(noteBlock, nIdx))}
          </div>
        </div>
      )}
    </div>
  );
}
