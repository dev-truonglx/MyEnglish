import { useState, type Dispatch, type SetStateAction } from "react";
import { BookOpen, Sparkles, Plus, X } from "lucide-react";
import type { WordDetail } from "@/types/database";
import { useWordsStore } from "@/stores/wordsStore";
import WordTableView from "../WordTableView";
import WordCard, { type WordCardMeta } from "./WordCard";
import TopicFilters from "./TopicFilters";
import ReviewTimeFilterBar from "./ReviewTimeFilterBar";
import ReviewTrajectoryModal from "../review/ReviewTrajectoryModal";
import type { ReviewTimeBucket } from "@/utils/reviewSchedule";
import {
  GALLERY_PAGE_SIZE,
  PAGE_CONTAINER,
  handleSpeak,
  type DashboardTab,
  type FilterMode,
  type ViewMode,
} from "./shared";
import { AI_VOCAB_ENABLED } from "@/services/features";

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
  reviewTimeFilter: ReviewTimeBucket;
  setReviewTimeFilter: (bucket: ReviewTimeBucket) => void;
  reviewBucketCounts: Record<ReviewTimeBucket, number>;
  handleStartReview: (onlyDue?: boolean, topicFilter?: string) => void;
  requestDeleteWord: (wordId: string, wordText: string, e?: React.MouseEvent) => void;
  setActiveTab: (tab: DashboardTab) => void;
}

/** TAB 1: VOCABULARY LIBRARY (topic filters + review time filter + gallery / table view) */
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
  reviewTimeFilter,
  setReviewTimeFilter,
  reviewBucketCounts,
  handleStartReview,
  requestDeleteWord,
  setActiveTab,
}: LibraryTabProps) {
  const selectedWord = useWordsStore((s) => s.selectedWord);
  const setSelectedWord = useWordsStore((s) => s.setSelectedWord);
  const [trajectoryWord, setTrajectoryWord] = useState<WordDetail | null>(null);

  return (
    <div className={`${PAGE_CONTAINER} space-y-5`}>
      {/* Notification alert if any */}
      {message && (
        <div className="p-3 rounded-lg bg-cyan-50 border border-cyan-200 text-cyan-800 dark:bg-cyan-950/40 dark:border-cyan-800 dark:text-cyan-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
            <span>{message}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            aria-label="Đóng thông báo"
            className="text-cyan-600 hover:text-cyan-900 dark:text-cyan-400 dark:hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter Bars Section */}
      <div className="space-y-2 p-3 rounded-2xl bg-slate-50/60 dark:bg-zinc-900/40 border border-slate-200/80 dark:border-zinc-800/80">
        {/* Topic Filter & Organization Bar */}
        <TopicFilters
          selectedTopic={selectedTopic}
          setSelectedTopic={setSelectedTopic}
          availableTopics={availableTopics}
          topicStats={topicStats}
          handleStartReview={handleStartReview}
        />

        {/* Review Time Schedule Filter Bar */}
        <div className="pt-1 border-t border-slate-200/60 dark:border-zinc-800/60">
          <ReviewTimeFilterBar
            selectedBucket={reviewTimeFilter}
            onSelectBucket={setReviewTimeFilter}
            bucketCounts={reviewBucketCounts}
          />
        </div>
      </div>

      {/* Words Grid or Table View */}
      {filteredWords.length > 0 ? (
        viewMode === "table" ? (
          <WordTableView
            words={filteredWords}
            onSelectWord={setSelectedWord}
            onDeleteWord={requestDeleteWord}
            resetKey={`${searchQuery}|${filterMode}|${selectedTopic}|${reviewTimeFilter}`}
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
                onOpenTrajectory={setTrajectoryWord}
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
        <div className="p-12 text-center rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-3">
          <BookOpen className="w-10 h-10 text-slate-300 dark:text-zinc-600 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
            Không có từ vựng nào phù hợp
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
            Thử thay đổi từ khóa tìm kiếm, chọn chủ đề khác hoặc đặt lại bộ lọc lịch nhắc lại.
          </p>
          <div className="pt-2 flex justify-center gap-2">
            {reviewTimeFilter !== "all" && (
              <button
                onClick={() => setReviewTimeFilter("all")}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700"
              >
                Xóa bộ lọc lịch nhắc
              </button>
            )}
            <button
              onClick={() => setActiveTab("capture")}
              className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{AI_VOCAB_ENABLED ? "Thêm từ vựng mới" : "Mở lộ trình từ vựng"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Trajectory Modal for Gallery Cards */}
      {trajectoryWord && (
        <ReviewTrajectoryModal
          isOpen={!!trajectoryWord}
          onClose={() => setTrajectoryWord(null)}
          word={trajectoryWord}
        />
      )}
    </div>
  );
}
