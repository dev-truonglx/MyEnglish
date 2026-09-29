import { useState, useMemo } from "react";
import { Volume2, Trash2, ArrowUpDown, ChevronRight, Tag } from "lucide-react";
import type { WordDetail } from "@/types/database";

interface WordTableViewProps {
  words: WordDetail[];
  onSelectWord: (word: WordDetail) => void;
  onDeleteWord: (id: string, word: string, e: React.MouseEvent) => void;
}

type SortField = "word" | "topic" | "created_at" | "next_review" | "ease_factor" | "repetitions";
type SortOrder = "asc" | "desc";

export default function WordTableView({
  words,
  onSelectWord,
  onDeleteWord,
}: WordTableViewProps) {
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const sortedWords = useMemo(() => {
    return [...words].sort((a, b) => {
      let cmp = 0;
      if (sortField === "word") {
        cmp = a.word.localeCompare(b.word);
      } else if (sortField === "topic") {
        cmp = (a.topic || "General Tech").localeCompare(b.topic || "General Tech");
      } else if (sortField === "created_at") {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortField === "next_review") {
        cmp =
          new Date(a.srs.next_review_date).getTime() -
          new Date(b.srs.next_review_date).getTime();
      } else if (sortField === "ease_factor") {
        cmp = a.srs.ease_factor - b.srs.ease_factor;
      } else if (sortField === "repetitions") {
        cmp = a.srs.repetitions - b.srs.repetitions;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [words, sortField, sortOrder]);

  const handleSpeak = (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  if (words.length === 0) {
    return null;
  }

  const now = new Date();

  return (
    <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/70 text-slate-600 dark:text-zinc-400 font-mono text-[11px] select-none">
              <th
                onClick={() => handleSort("word")}
                className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Vocabulary Word</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                onClick={() => handleSort("topic")}
                className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Topic</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-4">Vietnamese Meaning</th>
              <th
                onClick={() => handleSort("repetitions")}
                className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors text-center"
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span>Reps</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                onClick={() => handleSort("ease_factor")}
                className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors text-center"
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span>Ease Factor</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-4 text-center">Interval</th>
              <th
                onClick={() => handleSort("next_review")}
                className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Next Review</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
            {sortedWords.map((item) => {
              const isDue = new Date(item.srs.next_review_date) <= now;

              return (
                <tr
                  key={item.id}
                  onClick={() => onSelectWord(item)}
                  className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors group"
                >
                  {/* Word Column */}
                  <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white capitalize">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors text-sm">
                        {item.word}
                      </span>
                      {item.phonetic && (
                        <span className="text-[10px] font-mono text-cyan-700 dark:text-cyan-400/80 bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800/40 px-1.5 py-0.5 rounded">
                          {item.phonetic}
                        </span>
                      )}
                      <button
                        onClick={(e) => handleSpeak(item.word, e)}
                        title="Listen"
                        className="text-slate-400 hover:text-cyan-600 dark:text-zinc-500 dark:hover:text-cyan-400 p-0.5 rounded transition-colors"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>

                  {/* Topic Column */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/50">
                      <Tag className="w-2.5 h-2.5 opacity-70" />
                      {item.topic || "General Tech"}
                    </span>
                  </td>

                  {/* Meaning Column */}
                  <td className="py-3 px-4 text-slate-700 dark:text-zinc-300 font-normal text-xs max-w-md line-clamp-2 leading-relaxed">
                    {item.meaning_vn}
                  </td>

                  {/* Repetitions */}
                  <td className="py-3 px-4 text-center font-mono">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] ${
                        item.srs.repetitions > 0
                          ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                          : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700/50"
                      }`}
                    >
                      {item.srs.repetitions}
                    </span>
                  </td>

                  {/* Ease Factor */}
                  <td className="py-3 px-4 text-center font-mono text-slate-700 dark:text-zinc-300">
                    {item.srs.ease_factor}
                  </td>

                  {/* Interval */}
                  <td className="py-3 px-4 text-center font-mono text-slate-500 dark:text-zinc-400">
                    {item.srs.interval}d
                  </td>

                  {/* Next Review Status */}
                  <td className="py-3 px-4">
                    {isDue ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 text-[10px] font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                        Due for review
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                        {new Date(item.srs.next_review_date).toLocaleDateString()}
                      </span>
                    )}
                  </td>

                  {/* Actions Column */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => onDeleteWord(item.id, item.word, e)}
                        title="Delete word"
                        className="text-slate-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 p-1 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors" />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
