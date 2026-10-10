import { Tag, Bug, Zap } from "lucide-react";
import type { ReviewCard } from "@/types/database";
import { getRetrievabilityInfo, isLeech, type ExerciseType, type XPReward } from "@/services/smartReview";
import type { StudyMode } from "@/hooks/useReviewSession";
import { isSimpleMode } from "@/services/learnerProfile";
import { EXERCISE_LABEL_VN } from "./exerciseLabels";

interface CardBadgesProps {
  currentWord: ReviewCard;
  showXPPopup: boolean;
  lastXPReward: XPReward | null;
  effectiveExerciseType: ExerciseType;
  mode: StudyMode;
}

/** Card top badges: part of speech, topic, FSRS state, leech, retrievability, XP popup, exercise type */
export default function CardBadges({
  currentWord,
  showXPPopup,
  lastXPReward,
  effectiveExerciseType,
  mode,
}: CardBadgesProps) {
  // Simple mode: no scheduler numbers (S, D, recall %), the word "Leech" becomes "Từ hay quên"
  const simple = isSimpleMode();
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800/80 pb-3 shrink-0">
      <div className="flex items-center gap-2 flex-wrap">
        {currentWord.part_of_speech && (
          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 font-semibold">
            {currentWord.part_of_speech}
          </span>
        )}
        <span className="text-[10px] font-medium text-cyan-800 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/40 px-2 py-0.5 rounded-full flex items-center gap-1">
          <Tag className="w-2.5 h-2.5" />
          {currentWord.topic || "General Tech"}
        </span>
        {!simple && (
          <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded border border-slate-200 dark:border-zinc-700/50">
            {currentWord.srs.stability && currentWord.srs.stability > 0
              ? `FSRS: S=${currentWord.srs.stability}d • D=${currentWord.srs.difficulty || 5}`
              : `FSRS: Mới (New)`}
          </span>
        )}
        {simple && (currentWord.srs.reps ?? 0) === 0 && (
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
            {simple ? "Từ hay quên" : "Leech"}
          </span>
        )}
        {/* Retrievability Mini Bar */}
        {!simple && (() => {
          const rInfo = getRetrievabilityInfo(currentWord.srs);
          if (rInfo.level === "new") return null;
          return (
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${rInfo.bgColorClass} ${rInfo.textColorClass} border-current/20`}>
              <span className="font-semibold">{rInfo.percent}%</span>
              <span className={`w-8 h-1.5 rounded-full bg-slate-200 dark:bg-zinc-700 overflow-hidden inline-block`}>
                <span className={`block h-full ${rInfo.colorClass} rounded-full transition-all`} style={{ width: `${rInfo.percent}%` }} />
              </span>
              <span className="text-[9px]">{rInfo.label}</span>
            </span>
          );
        })()}
      </div>

      <div className="flex items-center gap-2">
        {/* XP Floating Popup */}
        {showXPPopup && lastXPReward && (
          <span className="text-xs font-bold text-amber-500 dark:text-amber-400 animate-bounce font-mono flex items-center gap-1">
            <Zap className="w-3 h-3" />
            +{lastXPReward.totalXP} XP
          </span>
        )}
        <span className="text-[11px] text-slate-400 dark:text-zinc-500 shrink-0">
          {EXERCISE_LABEL_VN[effectiveExerciseType]}
          {mode === "mixed" && !simple && " • FSRS"}
        </span>
      </div>
    </div>
  );
}
