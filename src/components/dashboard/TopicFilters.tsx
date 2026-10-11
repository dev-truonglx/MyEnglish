import { Play, Tag, Folder } from "lucide-react";
import { AI_VOCAB_ENABLED } from "@/services/features";

/** Deck words keep their CEFR level in `topic`: the filter is by level while the Oxford deck is the only source */
const FILTER_LABEL = AI_VOCAB_ENABLED ? "Chủ đề" : "Cấp độ";

interface TopicFiltersProps {
  selectedTopic: string;
  setSelectedTopic: (topic: string) => void;
  availableTopics: string[];
  topicStats: Record<string, number>;
  handleStartReview: (onlyDue?: boolean, topicFilter?: string) => void;
}

/** Level (topic) filter bar of the word library */
export default function TopicFilters({
  selectedTopic,
  setSelectedTopic,
  availableTopics,
  topicStats,
  handleStartReview,
}: TopicFiltersProps) {
  // "Tất cả" counts the same words as the chips (the learner's words, not the deck words still waiting)
  const totalCount = Object.values(topicStats).reduce((sum, n) => sum + n, 0);

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none py-1">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 font-mono shrink-0 pr-1 select-none">
        <Folder className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
        <span>{FILTER_LABEL}:</span>
      </div>

      {/* All Topics */}
      <button
        onClick={() => setSelectedTopic("all")}
        className={`px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 transition-all flex items-center gap-1.5 ${selectedTopic === "all"
          ? "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/50 shadow-sm font-semibold"
          : "bg-white dark:bg-zinc-900/80 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 shadow-sm"
          }`}
      >
        <span>Tất cả</span>
        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700/50">
          {totalCount}
        </span>
      </button>

      {/* Each Topic */}
      {availableTopics.map((top) => {
        const isSelected = selectedTopic.toLowerCase() === top.toLowerCase();
        const count = topicStats[top] || 0;
        return (
          <button
            key={top}
            onClick={() => setSelectedTopic(isSelected ? "all" : top)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 transition-all flex items-center gap-1.5 ${isSelected
              ? "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/50 shadow-sm font-semibold"
              : "bg-white dark:bg-zinc-900/80 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 shadow-sm"
              }`}
          >
            <Tag className="w-3 h-3 opacity-70" />
            <span>{top}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700/50">
              {count}
            </span>
          </button>
        );
      })}

      {/* Quick Topic Review button */}
      {selectedTopic !== "all" && (
        <button
          onClick={() => handleStartReview(false, selectedTopic)}
          className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-300 dark:border-orange-500/40 hover:bg-orange-200 dark:hover:bg-orange-500/30 text-xs font-medium transition-all shadow-sm"
        >
          <Play className="w-3 h-3 fill-orange-500 text-orange-500 dark:fill-orange-400 dark:text-orange-400" />
          <span>
            {AI_VOCAB_ENABLED ? "Ôn tập chủ đề này" : `Ôn các từ ${selectedTopic}`} ({topicStats[selectedTopic] || 0})
          </span>
        </button>
      )}
    </div>
  );
}
