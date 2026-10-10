import { Play, Bell, CheckCircle, Flame, Folder, Tag } from "lucide-react";
import { checkAndNotifyDueReviews } from "@/services/srs";
import { useWordsStore } from "@/stores/wordsStore";
import { DUE_LIST_LIMIT, PAGE_CONTAINER, type LibraryStats } from "./shared";
import WeeklyProgressCard from "../WeeklyProgressCard";
import ComebackCard from "./ComebackCard";
import type { ComebackStatus } from "@/services/comeback";

interface ReviewTabProps {
  dueCount: number;
  /** Back after a break: today's share of the backlog replaces the queue overview */
  comeback?: ComebackStatus | null;
  libraryStats: LibraryStats;
  availableTopics: string[];
  handleStartReview: (onlyDue?: boolean, topicFilter?: string) => void;
  setMessage: (msg: string | null) => void;
}

/** TAB 3 landing: queue overview, start/practice buttons, per-topic review and due list */
export default function ReviewTab({
  dueCount,
  comeback,
  libraryStats,
  availableTopics,
  handleStartReview,
  setMessage,
}: ReviewTabProps) {
  const words = useWordsStore((s) => s.words);
  const setSelectedWord = useWordsStore((s) => s.setSelectedWord);
  const inComeback = !!comeback && !comeback.caughtUp;

  const handleTestNotification = async () => {
    try {
      const count = await checkAndNotifyDueReviews(true);
      setMessage(
        count > 0
          ? `Đã gửi thông báo nhắc ôn tập ${count} từ vựng!`
          : "Đã gửi thông báo nhắc ôn tập! Hãy nhấp vào thông báo để mở màn hình ôn tập."
      );
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      setMessage(`Lỗi gửi thông báo: ${err}`);
    }
  };

  return (
    <div className={`${PAGE_CONTAINER} space-y-6`}>
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Spaced Repetition Review</h2>
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Powered by FSRS. Optimal recall timing tailored to your memory strength.
        </p>
      </div>

      <WeeklyProgressCard words={words} />

      {comeback && <ComebackCard comeback={comeback} onStart={() => handleStartReview(true)} />}

      {/* Status Banner */}
      {!inComeback && (
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-gradient-to-r dark:from-zinc-900 dark:via-zinc-900/90 dark:to-zinc-950 p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 uppercase tracking-wider block">
              Queue Overview
            </span>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <span>{dueCount}</span>
              <span className="text-sm font-normal text-slate-500 dark:text-zinc-400">cards due for review</span>
            </div>
          </div>

          <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
            <Flame className="w-6 h-6" />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => handleStartReview(true)}
            disabled={dueCount === 0}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 !text-white text-xs font-semibold shadow-lg shadow-orange-500/20 transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Start Review ({dueCount})</span>
          </button>

          <button
            onClick={() => handleStartReview(false)}
            disabled={words.length === 0}
            className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-medium transition-colors disabled:opacity-40"
          >
            <span>Practice All ({words.length})</span>
          </button>

          <button
            onClick={handleTestNotification}
            title="Send test macOS notification"
            className="p-3 rounded-xl border border-slate-300 dark:border-zinc-800 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-500 hover:text-cyan-600 dark:text-zinc-400 dark:hover:text-cyan-400 transition-colors"
          >
            <Bell className="w-4 h-4" />
          </button>
        </div>
      </div>
      )}

      {/* Study & Review by Topic */}
      {availableTopics.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400 font-medium">
            <span className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-zinc-300">
              <Folder className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              Ôn tập theo Chủ đề ({availableTopics.length} chủ đề)
            </span>
            <span className="text-[11px] text-slate-500 dark:text-zinc-500 font-mono">Chọn chủ đề muốn học</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {availableTopics.map((top) => {
              const topicEntry = libraryStats.perTopic[top.toLowerCase()] || { total: 0, due: 0 };
              const topicTotal = topicEntry.total;
              const dueInTopic = topicEntry.due;

              return (
                <div
                  key={top}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-slate-300 dark:hover:border-zinc-700/80 transition-all flex flex-col justify-between space-y-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                        <span className="font-semibold text-slate-900 dark:text-white text-xs">{top}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 block">
                        {topicTotal} từ vựng
                        {dueInTopic > 0 && (
                          <span className="text-orange-600 dark:text-orange-400 ml-1.5 font-medium">
                            • {dueInTopic} đến hạn
                          </span>
                        )}
                      </span>
                    </div>

                    {dueInTopic > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/60">
                        {dueInTopic} Due
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-slate-200 dark:border-zinc-800/60">
                    {dueInTopic > 0 ? (
                      <button
                        onClick={() => handleStartReview(true, top)}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-orange-50 hover:bg-orange-100 dark:bg-orange-500/20 dark:hover:bg-orange-500/30 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-500/40 text-xs font-medium transition-colors flex items-center justify-center gap-1 shadow-sm"
                      >
                        <Play className="w-3 h-3 fill-orange-500" />
                        <span>Ôn đến hạn ({dueInTopic})</span>
                      </button>
                    ) : null}
                    <button
                      onClick={() => handleStartReview(false, top)}
                      className={`${dueInTopic > 0 ? "" : "flex-1"
                        } py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700/60 text-xs font-medium transition-colors flex items-center justify-center gap-1 shadow-sm`}
                    >
                      <span>Luyện tất cả ({topicTotal})</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List of due words (hidden during a comeback plan: the whole pile is what it avoids showing) */}
      {inComeback ? null : dueCount > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400 font-medium">
            <span>Due Words Waiting in Queue</span>
            <span className="font-mono text-[11px]">Interval & Ease Factor</span>
          </div>
          {libraryStats.dueWords
            .slice(0, DUE_LIST_LIMIT)
            .map((w) => (
              <div
                key={w.id}
                onClick={() => setSelectedWord(w)}
                className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-cyan-500/50 cursor-pointer flex items-center justify-between transition-colors shadow-sm"
              >
                <div className="space-y-0.5">
                  <div className="text-base font-bold text-slate-900 dark:text-white font-mono">
                    {w.word}
                  </div>
                  <div className="text-sm font-medium text-slate-700 dark:text-cyan-200">{w.meaning_vn}</div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-mono text-cyan-700 dark:text-cyan-400 block font-semibold">
                    {w.srs.stability && w.srs.stability > 0 ? `S: ${w.srs.stability}d` : `Mới`}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
                    {w.srs.interval === 0 ? "Initial review" : `${w.srs.interval}d interval`}
                  </span>
                </div>
              </div>
            ))}
          {dueCount > DUE_LIST_LIMIT && (
            <div className="text-center text-xs text-slate-500 dark:text-zinc-400 py-2">
              và {dueCount - DUE_LIST_LIMIT} từ khác
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 space-y-3 rounded-2xl border border-slate-200 dark:border-zinc-800/60 bg-slate-50 dark:bg-zinc-900/30">
          <CheckCircle className="w-10 h-10 text-emerald-500 dark:text-emerald-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">All caught up!</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
            You have reviewed all pending cards. Click "Practice All" to rehearse anytime or add new terms via ⌘⇧E.
          </p>
        </div>
      )}
    </div>
  );
}
