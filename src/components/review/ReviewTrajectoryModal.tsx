import { useMemo } from "react";
import { X, Calendar, Clock, CheckCircle2, XCircle, Brain, Sparkles } from "lucide-react";
import type { WordDetail } from "@/types/database";
import type { GrammarProgress } from "@/types/grammar";
import {
  predictFutureWordReviews,
  predictFutureGrammarReviews,
  formatNextReviewRelative,
  type ReviewStepProjection,
} from "@/utils/reviewSchedule";

interface ReviewTrajectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  word?: WordDetail | null;
  grammarLesson?: {
    id: string;
    title: string;
    titleVn: string;
    level: string;
    progress?: GrammarProgress;
  } | null;
}

export default function ReviewTrajectoryModal({
  isOpen,
  onClose,
  word,
  grammarLesson,
}: ReviewTrajectoryModalProps) {
  if (!isOpen || (!word && !grammarLesson)) return null;

  const title = word ? word.word : grammarLesson?.title;
  const subtitle = word ? word.meaning_vn : grammarLesson?.titleVn;

  const projections: ReviewStepProjection[] = useMemo(() => {
    if (word) {
      return predictFutureWordReviews(word);
    }
    if (grammarLesson) {
      return predictFutureGrammarReviews(grammarLesson.progress);
    }
    return [];
  }, [word, grammarLesson]);

  const currentRelative = useMemo(() => {
    if (word) {
      const isNew = (!word.srs.reps && !word.srs.repetitions) || word.srs.repetitions === 0;
      return formatNextReviewRelative(word.srs.next_review_date, isNew);
    }
    if (grammarLesson) {
      const isUnattempted = !grammarLesson.progress || grammarLesson.progress.reps === 0;
      return formatNextReviewRelative(grammarLesson.progress?.nextReviewDate, isUnattempted);
    }
    return null;
  }, [word, grammarLesson]);

  // Statistics
  const stats = useMemo(() => {
    if (word) {
      const total = word.stats?.totalAttempts ?? (word.srs.repetitions || 0);
      const correct = word.stats?.correctCount ?? Math.max(0, total - (word.srs.lapses || 0));
      const wrong = word.stats?.wrongCount ?? (word.srs.lapses || 0);
      const acc = word.stats?.accuracy ?? (total > 0 ? Math.round((correct / total) * 100) : 0);
      return { total, correct, wrong, acc };
    }
    if (grammarLesson?.progress) {
      const p = grammarLesson.progress;
      const total = p.reps;
      const wrong = p.lapses;
      const correct = Math.max(0, total - wrong);
      const acc = total > 0 ? Math.round((correct / total) * 100) : p.score || 0;
      return { total, correct, wrong, acc };
    }
    return { total: 0, correct: 0, wrong: 0, acc: 0 };
  }, [word, grammarLesson]);

  // Stability & Difficulty
  const stability = word ? word.srs.stability : grammarLesson?.progress?.stability;
  const difficulty = word ? word.srs.difficulty : grammarLesson?.progress?.difficulty;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 pb-4 border-b border-slate-100 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-950/40 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-cyan-100 dark:bg-cyan-950/80 text-cyan-600 dark:text-cyan-400">
                <Brain className="w-4 h-4" />
              </span>
              <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 tracking-wide uppercase">
                Lộ Trình Nhắc Lại Theo Thuật Toán FSRS
              </span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white capitalize flex items-center gap-2">
              <span>{title}</span>
              {word?.phonetic && (
                <span className="text-xs font-mono font-normal text-slate-500 dark:text-zinc-400">
                  {word.phonetic}
                </span>
              )}
            </h3>
            {subtitle && (
              <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-1">
                {subtitle}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            aria-label="Đóng"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800/80 text-center">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-zinc-400">
                Số lần xuất hiện
              </span>
              <div className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                {stats.total}
              </div>
            </div>

            <div className="space-y-0.5 border-x border-slate-200 dark:border-zinc-800">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-zinc-400">
                Đúng / Sai
              </span>
              <div className="text-sm font-bold font-mono flex items-center justify-center gap-1.5 pt-0.5">
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {stats.correct}
                </span>
                <span className="text-slate-300 dark:text-zinc-700">/</span>
                <span className="text-rose-600 dark:text-rose-400 flex items-center gap-0.5">
                  <XCircle className="w-3.5 h-3.5" />
                  {stats.wrong}
                </span>
              </div>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-zinc-400">
                Tỷ lệ chính xác
              </span>
              <div className="text-base font-extrabold text-cyan-600 dark:text-cyan-400 font-mono">
                {stats.acc}%
              </div>
            </div>
          </div>

          {/* FSRS Memory State Tags */}
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            <span className="text-slate-500 dark:text-zinc-400 font-medium">Chỉ số trí nhớ:</span>
            <span className="px-2 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/60 font-mono">
              Độ bền (S): {stability ? `${Number(stability).toFixed(1)}d` : "0d"}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 font-mono">
              Độ khó (D): {difficulty ? `${Number(difficulty).toFixed(1)}/10` : "Mặc định"}
            </span>
          </div>

          {/* Timeline Projections */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                Dự báo 4 mốc nhắc lại tiếp theo:
              </span>
              <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                (Giả định hoàn thành đúng)
              </span>
            </div>

            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-cyan-500 before:via-teal-500 before:to-slate-300 dark:before:to-zinc-700">
              {projections.map((item, idx) => {
                const isFirst = idx === 0;
                return (
                  <div key={item.step} className="relative flex items-start justify-between gap-3 group">
                    {/* Circle Node */}
                    <div
                      className={`absolute -left-6 top-1 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shadow-sm ${
                        isFirst
                          ? "bg-cyan-600 border-white dark:border-zinc-900 text-white animate-pulse"
                          : "bg-white dark:bg-zinc-800 border-cyan-500 text-cyan-700 dark:text-cyan-300"
                      }`}
                    >
                      {item.step}
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                          {item.label}
                        </span>
                        {isFirst && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-300">
                            Hiện tại
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{item.dateFormatted}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold font-mono ${
                          isFirst
                            ? currentRelative?.badgeClass || "bg-cyan-100 text-cyan-800"
                            : "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700/60"
                        }`}
                      >
                        {item.relativeLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Explanation Footer Note */}
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950/70 border border-slate-200/70 dark:border-zinc-800/80 text-[11px] text-slate-600 dark:text-zinc-400 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Mốc thời gian thực tế sẽ tự động tính toán lại sau mỗi buổi ôn tập: nếu bạn trả lời nhanh và chính xác, khoảng cách sẽ giãn xa hơn; nếu trả lời sai hoặc quên, thuật toán sẽ rút ngắn lịch để bạn ôn tập kịp thời.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="p-4 bg-slate-50 dark:bg-zinc-950/80 border-t border-slate-100 dark:border-zinc-800/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-xs font-semibold shadow-sm transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
