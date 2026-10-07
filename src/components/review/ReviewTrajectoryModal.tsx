import { useMemo, useState, useEffect } from "react";
import {
  X,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Brain,
  Sparkles,
  History,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from "lucide-react";
import type { WordDetail } from "@/types/database";
import type { GrammarProgress } from "@/types/grammar";
import {
  predictFutureWordReviews,
  predictFutureGrammarReviews,
  formatNextReviewRelative,
  type ReviewStepProjection,
} from "@/utils/reviewSchedule";
import { getWordReviewLogs, type ReviewLogEntry } from "@/services/smartReview";

function formatPastTime(
  dateInput: string | Date | undefined | null,
  now: Date = new Date()
): { relative: string; exact: string; isPast: boolean } {
  if (!dateInput) {
    return { relative: "Chưa từng học", exact: "Chưa có dữ liệu", isPast: false };
  }
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) {
    return { relative: "Chưa từng học", exact: "Chưa có dữ liệu", isPast: false };
  }

  const exact = date.toLocaleDateString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) {
    return { relative: "Vừa xong", exact, isPast: true };
  }

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  let relative = "Vừa xong";
  if (days >= 30) {
    const months = Math.floor(days / 30);
    relative = `${months} tháng trước`;
  } else if (days >= 1) {
    relative = days === 1 ? "Hôm qua" : `${days} ngày trước`;
  } else if (hours >= 1) {
    relative = `${hours} giờ trước`;
  } else if (minutes >= 1) {
    relative = `${minutes} phút trước`;
  } else {
    relative = "Vừa xong";
  }

  return { relative, exact, isPast: true };
}

const EXERCISE_NAME_MAP: Record<string, string> = {
  multiple_choice: "Trắc nghiệm",
  flip: "Flashcard",
  cloze: "Điền từ",
  spelling: "Chính tả / Gõ từ",
  reverse_cloze: "Đoán nghĩa",
  sentence_builder: "Ghép câu",
  context_match: "Nối ngữ cảnh",
  listening: "Nghe chép",
};

const RATING_NAME_MAP: Record<number, { label: string; badgeClass: string }> = {
  1: {
    label: "Again",
    badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200 dark:border-rose-900",
  },
  2: {
    label: "Hard",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  },
  3: {
    label: "Good",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
  },
  4: {
    label: "Easy",
    badgeClass: "bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300 border-sky-200 dark:border-sky-900",
  },
};

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

  const [logs, setLogs] = useState<ReviewLogEntry[]>([]);
  const [showAllLogs, setShowAllLogs] = useState(false);

  useEffect(() => {
    if (!isOpen || !word?.id) {
      setLogs([]);
      setShowAllLogs(false);
      return;
    }
    let cancelled = false;
    getWordReviewLogs(word.id, 5)
      .then((loaded) => {
        if (!cancelled) setLogs(loaded);
      })
      .catch(() => {
        if (!cancelled) setLogs([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, word?.id]);

  const latestTimestamp = useMemo(() => {
    if (logs.length > 0 && logs[0].timestamp) return logs[0].timestamp;
    if (word?.srs?.last_review) return word.srs.last_review;
    if (word?.srsProduction?.last_review) return word.srsProduction.last_review;
    if (grammarLesson?.progress?.lastReview) return grammarLesson.progress.lastReview;
    if (grammarLesson?.progress?.lastAttemptDate) return grammarLesson.progress.lastAttemptDate;
    return null;
  }, [logs, word, grammarLesson]);

  const pastInfo = useMemo(() => formatPastTime(latestTimestamp), [latestTimestamp]);

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

          {/* Recent Learning History */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Lịch sử học gần nhất:
              </span>
              <span
                className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                  pastInfo.isPast
                    ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                    : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700"
                }`}
              >
                {pastInfo.relative}
              </span>
            </div>

            {pastInfo.isPast ? (
              <div className="p-3 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-zinc-300 font-medium">
                    <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span>Lần học gần nhất:</span>
                    <strong className="font-semibold text-slate-900 dark:text-white font-mono">
                      {pastInfo.exact}
                    </strong>
                  </div>
                  {logs[0] && (
                    <div className="flex items-center gap-1">
                      {logs[0].isCorrect ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3" />
                          Đúng
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          <XCircle className="w-3 h-3" />
                          Chưa đúng
                        </span>
                      )}
                      {RATING_NAME_MAP[logs[0].rating] && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            RATING_NAME_MAP[logs[0].rating].badgeClass
                          }`}
                        >
                          FSRS: {RATING_NAME_MAP[logs[0].rating].label}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {logs[0] && (
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-600 dark:text-zinc-400 pt-1.5 border-t border-indigo-100/70 dark:border-indigo-900/40">
                    <span className="px-1.5 py-0.5 rounded bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-[10.5px]">
                      Dạng bài: <strong>{EXERCISE_NAME_MAP[logs[0].exerciseType] || logs[0].exerciseType}</strong>
                    </span>
                    {logs[0].direction && (
                      <span className="px-1.5 py-0.5 rounded bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-[10.5px]">
                        Chiều:{" "}
                        <strong>
                          {logs[0].direction === "production" ? "Gợi nhớ (Vn → En)" : "Nhận diện (En → Vn)"}
                        </strong>
                      </span>
                    )}
                    {logs[0].responseTimeMs > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-[10.5px] font-mono">
                        ⚡ {(logs[0].responseTimeMs / 1000).toFixed(1)}s
                      </span>
                    )}
                    {logs[0].xpEarned > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 text-[10.5px] font-bold">
                        +{logs[0].xpEarned} XP
                      </span>
                    )}
                  </div>
                )}

                {/* Earlier logs toggle / list */}
                {logs.length > 1 && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAllLogs((prev) => !prev)}
                      className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      {showAllLogs ? (
                        <>
                          <ChevronUp className="w-3 h-3" /> Thu gọn lịch sử
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3 h-3" /> Xem thêm {logs.length - 1} lần học trước đó
                        </>
                      )}
                    </button>

                    {showAllLogs && (
                      <div className="mt-2 space-y-1.5 border-t border-indigo-100/60 dark:border-indigo-900/40 pt-2">
                        {logs.slice(1).map((log) => {
                          const logTime = formatPastTime(log.timestamp);
                          const ratingBadge = RATING_NAME_MAP[log.rating];
                          return (
                            <div
                              key={log.id}
                              className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-slate-200/60 dark:border-zinc-800 text-[10.5px]"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                {log.isCorrect ? (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                                ) : (
                                  <XCircle className="w-3 h-3 text-rose-500 shrink-0" />
                                )}
                                <span className="font-mono text-slate-700 dark:text-zinc-300 truncate">
                                  {logTime.exact}
                                </span>
                                <span className="text-slate-400 dark:text-zinc-500 text-[9.5px]">
                                  ({logTime.relative})
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-slate-600 dark:text-zinc-400">
                                  {EXERCISE_NAME_MAP[log.exerciseType] || log.exerciseType}
                                </span>
                                {ratingBadge && (
                                  <span className={`px-1 py-0.2 rounded text-[9px] font-bold border ${ratingBadge.badgeClass}`}>
                                    {ratingBadge.label}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950/40 border border-slate-200/60 dark:border-zinc-800 text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Từ này chưa có lịch sử ôn tập. FSRS sẽ ghi nhận sau lần làm bài đầu tiên.</span>
              </div>
            )}
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
