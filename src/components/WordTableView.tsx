import { useState, useMemo, useEffect } from "react";
import { getNextReviewDate, isWordDue } from "@/services/cards";
import { handleSpeak } from "./review/speech";
import { Volume2, Trash2, ArrowUpDown, ChevronRight, Tag, Sparkles, Clock } from "lucide-react";
import type { WordDetail } from "@/types/database";
import { formatNextReviewRelative, compareNextReview, type ReviewTimeRelativeInfo } from "@/utils/reviewSchedule";
import ReviewTrajectoryModal from "./review/ReviewTrajectoryModal";

interface WordTableViewProps {
  words: WordDetail[];
  onSelectWord: (word: WordDetail) => void;
  onDeleteWord: (id: string, word: string, e: React.MouseEvent) => void;
  // Changing this resets pagination (e.g. search/filter changed)
  resetKey?: string;
}

const PAGE_SIZE = 60;

type SortField =
  | "word"
  | "topic"
  | "created_at"
  | "next_review"
  | "ease_factor"
  | "repetitions"
  | "accuracy";

type SortOrder = "asc" | "desc";

export default function WordTableView({
  words,
  onSelectWord,
  onDeleteWord,
  resetKey,
}: WordTableViewProps) {
  const [sortField, setSortField] = useState<SortField>("next_review");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [trajectoryWord, setTrajectoryWord] = useState<WordDetail | null>(null);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [resetKey, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder(field === "next_review" || field === "word" ? "asc" : "desc");
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
        cmp = compareNextReview(a, b);
      } else if (sortField === "ease_factor") {
        cmp = (a.srs.stability || a.srs.interval) - (b.srs.stability || b.srs.interval);
      } else if (sortField === "repetitions") {
        const totalA = a.stats?.totalAttempts ?? (a.srs.repetitions || 0);
        const totalB = b.stats?.totalAttempts ?? (b.srs.repetitions || 0);
        cmp = totalA - totalB;
      } else if (sortField === "accuracy") {
        const accA = a.stats?.accuracy ?? 0;
        const accB = b.stats?.accuracy ?? 0;
        cmp = accA - accB;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [words, sortField, sortOrder]);

  // Per-row derived data (due flag + relative review schedule info)
  const rowMeta = useMemo(() => {
    const now = new Date();
    const meta = new Map<string, { isDue: boolean; relative: ReviewTimeRelativeInfo }>();
    for (const item of sortedWords) {
      const isNew = (!item.srs.reps && !item.srs.repetitions) || item.srs.repetitions === 0;
      const next = getNextReviewDate(item);
      meta.set(item.id, {
        isDue: isWordDue(item, now),
        relative: formatNextReviewRelative(next, isNew, now),
      });
    }
    return meta;
  }, [sortedWords]);

  const visibleWords = useMemo(() => sortedWords.slice(0, visibleCount), [sortedWords, visibleCount]);
  const remaining = sortedWords.length - visibleWords.length;

  if (words.length === 0) {
    return null;
  }

  return (
    <>
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
                    <span>Lịch Sử (Đúng/Sai)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("ease_factor")}
                  className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors text-center"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Độ bền (S)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 text-center">Interval</th>
                <th
                  onClick={() => handleSort("next_review")}
                  className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Lịch Nhắc Lại</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
              {visibleWords.map((item) => {
                const meta = rowMeta.get(item.id);
                const relative = meta?.relative;

                // Attempt stats
                const total = item.stats?.totalAttempts ?? (item.srs.repetitions || 0);
                const wrong = item.stats?.wrongCount ?? (item.srs.lapses || 0);
                const correct = item.stats?.correctCount ?? Math.max(0, total - wrong);
                const accuracy = item.stats?.accuracy ?? (total > 0 ? Math.round((correct / total) * 100) : 0);

                return (
                  <tr
                    key={item.id}
                    onClick={() => onSelectWord(item)}
                    className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors group"
                  >
                    {/* Word Column */}
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
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

                    {/* Appearances / Correct vs Wrong */}
                    <td className="py-3 px-4 text-center font-mono">
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            total > 0
                              ? "bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700/60"
                              : "text-slate-400 dark:text-zinc-600 text-[10px]"
                          }`}
                        >
                          {total > 0 ? `${total} lần` : "Chưa ôn"}
                        </span>
                        {total > 0 && (
                          <div className="space-y-0.5">
                            <div className="flex items-center justify-center gap-1 text-[10px]">
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                {correct}✓
                              </span>
                              <span className="text-slate-300 dark:text-zinc-700">/</span>
                              <span className="text-rose-600 dark:text-rose-400 font-bold">
                                {wrong}✗
                              </span>
                              <span className="text-slate-500 dark:text-zinc-400 font-semibold">
                                ({accuracy}%)
                              </span>
                            </div>
                            <div className="w-16 h-1 bg-rose-200 dark:bg-rose-950/80 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full transition-all"
                                style={{ width: `${accuracy}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Stability / Ease Factor */}
                    <td className="py-3 px-4 text-center font-mono text-slate-700 dark:text-zinc-300">
                      {item.srs.stability && item.srs.stability > 0
                        ? `${Number(item.srs.stability).toFixed(1)}d`
                        : `${item.srs.interval}d`}
                    </td>

                    {/* Interval */}
                    <td className="py-3 px-4 text-center font-mono text-slate-500 dark:text-zinc-400">
                      {item.srs.interval}d
                    </td>

                    {/* Next Review Status & Countdown */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span
                          title={relative?.exactDateStr}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium border ${
                            relative?.badgeClass || "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {relative?.urgency === "overdue" && (
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                          )}
                          <Clock className="w-3 h-3 opacity-70" />
                          <span>{relative?.label}</span>
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTrajectoryWord(item);
                          }}
                          title="Xem lộ trình các lần nhắc lại tiếp theo (FSRS)"
                          className="p-1 rounded-lg text-slate-400 hover:text-cyan-600 dark:text-zinc-500 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
                        </button>
                      </div>
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
        {remaining > 0 && (
          <div className="p-3 border-t border-slate-200 dark:border-zinc-800 flex justify-center">
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-medium transition-colors"
            >
              Xem thêm ({remaining} từ còn lại)
            </button>
          </div>
        )}
      </div>

      {/* Trajectory Modal */}
      {trajectoryWord && (
        <ReviewTrajectoryModal
          isOpen={!!trajectoryWord}
          onClose={() => setTrajectoryWord(null)}
          word={trajectoryWord}
        />
      )}
    </>
  );
}
