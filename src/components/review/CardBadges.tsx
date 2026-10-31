import { Tag, Bug, Zap } from "lucide-react";
import type { ReviewCard } from "@/types/database";
import { isLeech, type ExerciseType, type XPReward } from "@/services/smartReview";
import type { StudyMode } from "@/hooks/useReviewSession";

interface CardBadgesProps {
  currentWord: ReviewCard;
  showXPPopup: boolean;
  lastXPReward: XPReward | null;
  effectiveExerciseType: ExerciseType;
  mode: StudyMode;
}

/** Card top badges: part of speech, topic, leech/new status, XP popup */
export default function CardBadges({
  currentWord,
  showXPPopup,
  lastXPReward,
}: CardBadgesProps) {
  const isNew = (currentWord.srs.reps ?? 0) === 0;

  return (
    <div className="flex items-center justify-between flex-wrap md:flex-nowrap gap-1.5 md:gap-2 border-b border-slate-100 dark:border-zinc-800/80 pb-1.5 md:pb-2.5 shrink-0">
      <div className="flex items-center gap-1.5 md:gap-2 flex-wrap min-w-0">
        {currentWord.part_of_speech && (
          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 font-semibold">
            {currentWord.part_of_speech}
          </span>
        )}
        <span className="text-[10px] font-medium text-cyan-800 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/40 px-2 py-0.5 rounded-full flex items-center gap-1">
          <Tag className="w-2.5 h-2.5" />
          {currentWord.topic || "General Tech"}
        </span>
        {isNew && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300">
            Từ mới
          </span>
        )}
        {/* Often-forgotten word: a calm label, not an alarm */}
        {isLeech(currentWord.srs) && (
          <span
            title="Từ này đã quên nhiều lần: đọc kỹ ví dụ và mẹo nhớ"
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300/70 dark:border-amber-700/60 flex items-center gap-1"
          >
            <Bug className="w-2.5 h-2.5" />
            Từ hay quên
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 max-md:shrink-0 max-md:ml-auto">
        {/* XP Floating Popup */}
        {showXPPopup && lastXPReward && (
          <span className="text-xs font-bold text-amber-500 dark:text-amber-400 animate-bounce font-mono flex items-center gap-1">
            <Zap className="w-3 h-3" />
            +{lastXPReward.totalXP} XP
          </span>
        )}
      </div>
    </div>
  );
}
