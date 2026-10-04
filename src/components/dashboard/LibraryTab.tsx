import type { Dispatch, SetStateAction } from "react";
import { BookOpen, Sparkles, Plus, X } from "lucide-react";
import type { WordDetail } from "@/types/database";
import { useWordsStore } from "@/stores/wordsStore";
import WordTableView from "../WordTableView";
import WordCard, { type WordCardMeta } from "./WordCard";
import TopicFilters from "./TopicFilters";
import { GALLERY_PAGE_SIZE, handleSpeak, type DashboardTab, type FilterMode, type ViewMode } from "./shared";

interface LibraryTabProps {
  message: string | null;
  setMessage: (msg: string | null) => void;
  filteredWords: WordDetail[];
  visibleWords: WordDetail[];
  setVisibleCount: Dispatch<SetStateAction<number>>;
  cardMeta: Map<string, WordCardMeta>;
  viewMode: ViewMode;
  searchQuery: string;
  filterMode: FilterMode;
  selectedTopic: string;
  setSelectedTopic: (topic: string) => void;
  availableTopics: string[];
  topicStats: Record<string, number>;
  handleStartReview: (onlyDue?: boolean, topicFilter?: string) => void;
  requestDeleteWord: (wordId: string, wordText: string, e?: React.MouseEvent) => void;
  setActiveTab: (tab: DashboardTab) => void;
}

/** TAB 1: VOCABULARY LIBRARY (topic filters + gallery / table view) */
export default function LibraryTab({
  message,
  setMessage,
  filteredWords,
  visibleWords,
  setVisibleCount,
  cardMeta,
  viewMode,
  searchQuery,
  filterMode,
  selectedTopic,
  setSelectedTopic,
  availableTopics,
  topicStats,
  handleStartReview,
  requestDeleteWord,
  setActiveTab,
}: LibraryTabProps) {
  const selectedWord = useWordsStore((s) => s.selectedWord);
  const setSelectedWord = useWordsStore((s) => s.setSelectedWord);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Notification alert if any */}
      {message && (
        <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800 text-cyan-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{message}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-cyan-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Topic Filter & Organization Bar */}
      <TopicFilters
          selectedTopic={selectedTopic}
          setSelectedTopic={setSelectedTopic}
          availableTopics={availableTopics}
          topicStats={topicStats}
          handleStartReview={handleStartReview}
        />

      {/* Words Grid or Table View */}
      {filteredWords.length > 0 ? (
        viewMode === "table" ? (
          <WordTableView
            words={filteredWords}
            onSelectWord={setSelectedWord}
            onDeleteWord={requestDeleteWord}
            resetKey={`${searchQuery}|${filterMode}|${selectedTopic}`}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleWords.map((item) => (
              <WordCard
                key={item.id}
                item={item}
                meta={cardMeta.get(item.id)}
                isSelected={selectedWord?.id === item.id}
                onSelect={setSelectedWord}
                onSpeak={handleSpeak}
                onDelete={requestDeleteWord}
              />
            ))}
            {filteredWords.length > visibleWords.length && (
              <div className="col-span-full flex justify-center pt-2">
                <button
                  onClick={() => setVisibleCount((c) => c + GALLERY_PAGE_SIZE)}
                  className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-medium transition-colors shadow-sm"
                >
                  Xem thêm ({filteredWords.length - visibleWords.length} từ còn lại)
                </button>
              </div>
            )}
          </div>
        )
      ) : (
        /* EMPTY STATE */
        <div className="text-center py-20 max-w-md mx-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-center mx-auto text-slate-400 dark:text-zinc-500 shadow-inner">
            <BookOpen className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">No vocabulary words found</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              {searchQuery
                ? "No words match your search filter. Try clearing the search box."
                : "Start capturing developer terms while coding with the global shortcut or Quick Add."}
            </p>
          </div>

          {!searchQuery && (
            <div className="space-y-3 pt-2">
              <button
                onClick={() => setActiveTab("capture")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Your First Word
              </button>
              <div className="text-xs text-slate-500 dark:text-zinc-500">
                Or press <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-mono text-slate-700 dark:text-zinc-300">⌘⇧E</kbd> anywhere on macOS
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
