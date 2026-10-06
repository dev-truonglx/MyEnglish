import { memo } from "react";
import { Volume2, Trash2, ChevronRight, Tag, Clock, Sparkles } from "lucide-react";
import { parseTerms, type WordDetail } from "@/types/database";
import { getRetrievabilityInfo } from "@/services/smartReview";
import { getNextReviewDate } from "@/services/cards";
import { formatNextReviewRelative } from "@/utils/reviewSchedule";

const EMPTY_TERMS: ReturnType<typeof parseTerms> = [];

export interface WordCardMeta {
  synonyms: ReturnType<typeof parseTerms>;
  rInfo: ReturnType<typeof getRetrievabilityInfo>;
  leech: boolean;
}

interface WordCardProps {
  item: WordDetail;
  meta: WordCardMeta | undefined;
  isSelected: boolean;
  onSelect: (word: WordDetail) => void;
  onSpeak: (text: string, e?: React.MouseEvent) => void;
  onDelete: (wordId: string, wordText: string, e?: React.MouseEvent) => void;
  onOpenTrajectory?: (word: WordDetail) => void;
}

// Memoized gallery card; derived data is precomputed by the parent
const WordCard = memo(function WordCard({
  item,
  meta,
  isSelected,
  onSelect,
  onSpeak,
  onDelete,
  onOpenTrajectory,
}: WordCardProps) {
  const synonyms = meta?.synonyms ?? EMPTY_TERMS;
  const rInfo = meta?.rInfo ?? getRetrievabilityInfo(item.srs);
  const leech = meta?.leech ?? false;

  const isNew = (!item.srs.reps && !item.srs.repetitions) || item.srs.repetitions === 0;
  const nextDate = getNextReviewDate(item);
  const relativeInfo = formatNextReviewRelative(nextDate, isNew);

  const total = item.stats?.totalAttempts ?? (item.srs.repetitions || 0);
  const wrong = item.stats?.wrongCount ?? (item.srs.lapses || 0);
  const correct = item.stats?.correctCount ?? Math.max(0, total - wrong);
  const accuracy = item.stats?.accuracy ?? (total > 0 ? Math.round((correct / total) * 100) : 0);

  return (
    <div
      onClick={() => onSelect(item)}
      className={`group relative rounded-2xl border p-4 cursor-pointer transition-all flex flex-col justify-between ${
        isSelected
          ? "bg-cyan-50/60 dark:bg-zinc-900 border-cyan-500 dark:border-cyan-500/80 shadow-lg shadow-cyan-500/10 dark:shadow-cyan-950/50 ring-1 ring-cyan-500/50"
          : "bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 hover:bg-slate-50/80 dark:hover:bg-zinc-900/90 shadow-sm"
      }`}
    >
      <div className="space-y-3">
        {/* Word header & actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white capitalize font-mono group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors">
                {item.word}
              </h3>
              {item.part_of_speech && (
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 font-semibold">
                  {item.part_of_speech}
                </span>
              )}
              <span className="text-[10px] font-medium text-cyan-800 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Tag className="w-2.5 h-2.5" />
                {item.topic || "General Tech"}
              </span>
              {item.phonetic && (
                <span className="text-[11px] font-mono text-cyan-700 dark:text-cyan-400/90 bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/60 px-2 py-0.5 rounded-md">
                  {item.phonetic}
                </span>
              )}
              <button
                onClick={(e) => onSpeak(item.word, e)}
                title="Listen pronunciation"
                className="text-slate-400 hover:text-cyan-600 dark:text-zinc-500 dark:hover:text-cyan-400 transition-colors p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800/80"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Meaning Box */}
            <div className="mt-2 p-2 rounded-xl bg-slate-50 dark:bg-zinc-950/70 border border-slate-200 dark:border-zinc-800/80">
              <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-700 dark:text-cyan-400 font-semibold block mb-0.5">
                Nghĩa:
              </span>
              <p className="text-xs text-slate-800 dark:text-zinc-200 font-normal line-clamp-2 leading-relaxed">
                {item.meaning_vn}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            {/* Leech Badge */}
            {leech && (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-700/60 animate-pulse"
                title={`Leech: ${item.srs.lapses ?? 0} lần quên`}
              >
                🐛
              </span>
            )}
            {/* Retrievability Mini Indicator */}
            {rInfo.level !== "new" && (
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${rInfo.bgColorClass} ${rInfo.textColorClass}`}
                title={`Retrievability: ${rInfo.percent}% — ${rInfo.label}`}
              >
                <span className="w-5 h-1 rounded-full bg-slate-200 dark:bg-zinc-700 overflow-hidden inline-block">
                  <span
                    className={`block h-full ${rInfo.colorClass} rounded-full`}
                    style={{ width: `${rInfo.percent}%` }}
                  />
                </span>
                {rInfo.percent}%
              </span>
            )}
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700/60">
              {item.srs.interval === 0 ? "New" : `${item.srs.interval}d`}
            </span>
            <button
              onClick={(e) => onDelete(item.id, item.word, e)}
              title="Xoá từ này"
              className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Schedule & History Banner */}
        <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
          {/* Relative Next Review Badge (clickable for trajectory) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenTrajectory?.(item);
            }}
            title={`Lịch nhắc lại: ${relativeInfo.label} (${relativeInfo.exactDateStr}). Bấm để xem lộ trình nhắc lại.`}
            className={`text-[10px] font-mono px-2.5 py-1 rounded-full border flex items-center gap-1.5 transition-all hover:scale-105 ${relativeInfo.badgeClass}`}
          >
            <Clock className="w-3 h-3 opacity-80" />
            <span>{relativeInfo.label}</span>
            <Sparkles className="w-3 h-3 text-cyan-500" />
          </button>

          {/* Attempts & Accuracy Stat Badge */}
          {total > 0 ? (
            <div
              className="flex items-center gap-1.5 text-[10px] font-mono bg-slate-50 dark:bg-zinc-950/70 px-2 py-1 rounded-md border border-slate-200/80 dark:border-zinc-800/80"
              title={`Lịch sử: ${total} lần ôn (${correct} đúng · ${wrong} sai - ${accuracy}% chính xác)`}
            >
              <span className="text-slate-500 dark:text-zinc-400 font-semibold">{total} lần:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{correct}✓</span>
              <span className="text-slate-300 dark:text-zinc-700">/</span>
              <span className="text-rose-600 dark:text-rose-400 font-bold">{wrong}✗</span>
              <span className="text-cyan-600 dark:text-cyan-400 font-semibold">({accuracy}%)</span>
            </div>
          ) : (
            <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-600">
              Chưa làm bài tập
            </span>
          )}
        </div>

        {/* First Example preview */}
        {item.examples.length > 0 && (
          <div className="rounded-xl bg-slate-50 dark:bg-zinc-950/90 p-2.5 border border-slate-200 dark:border-zinc-800/80 space-y-1">
            <p className="text-xs font-medium text-slate-800 dark:text-zinc-200 leading-relaxed line-clamp-2">
              "{item.examples[0].sentence_en}"
            </p>
            {item.examples[0].sentence_vn && (
              <p className="text-[11px] text-cyan-800 dark:text-cyan-300/80 italic line-clamp-1">
                {item.examples[0].sentence_vn}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer tags */}
      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-500">
        <div className="flex gap-1.5 flex-wrap max-w-[75%] overflow-hidden">
          {synonyms.slice(0, 2).map((s, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800/90 text-slate-700 dark:text-zinc-300 text-[11px] font-mono border border-slate-200 dark:border-zinc-700/50"
            >
              {s.word}
            </span>
          ))}
          {synonyms.length > 2 && (
            <span className="text-[11px] text-slate-400 dark:text-zinc-500 self-center">
              +{synonyms.length - 2}
            </span>
          )}
        </div>

        <span className="flex items-center gap-0.5 text-slate-500 dark:text-zinc-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors font-medium">
          Chi tiết <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </div>
  );
});

export default WordCard;
