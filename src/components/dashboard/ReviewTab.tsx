import { useMemo } from "react";
import { Play, CheckCircle, Sparkles, RotateCcw, AlertCircle, Crosshair, CalendarDays, Layers, ArrowRight, Dumbbell } from "lucide-react";
import { useWordsStore } from "@/stores/wordsStore";
import { PAGE_CONTAINER, type LibraryStats } from "./shared";
import WeeklyProgressCard from "../WeeklyProgressCard";
import ComebackCard from "./ComebackCard";
import type { ComebackStatus } from "@/services/comeback";
import { forecastSessionLoad, getUnmasteredWords, youngWordCap, type TodayWork } from "@/services/smartReview";
import { isSimpleMode } from "@/services/learnerProfile";
import { getStudyLimits } from "@/services/srs";
import { minutesFor } from "@/services/comeback";
import { getFocusSettings } from "@/services/focusSettings";
import { CEFR_LEVELS } from "@/services/knownWords";

interface ReviewTabProps {
  dueCount: number;
  todayWork?: TodayWork;
  /** Back after a break: today's share of the backlog replaces the queue overview */
  comeback?: ComebackStatus | null;
  libraryStats: LibraryStats;
  availableTopics: string[];
  handleStartReview: (onlyDue?: boolean, topicFilter?: string) => void;
  /** Timed focus session (minutes) */
  onStartFocus?: (minutes: number) => void;
  /** The word library showing the words due */
  onOpenDueWords?: () => void;
  /** Still passed by the parent; this tab no longer posts messages */
  setMessage: (msg: string | null) => void;
}

/** Due words shown as chips before "and N more" */
const DUE_CHIPS = 24;
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/**
 * The review landing, as one overview: today's work and every way to start it, the next 7 days of reviews and
 * this week's progress on the side, then the levels and the words waiting, compact enough to see at a glance.
 */
export default function ReviewTab({
  dueCount,
  todayWork,
  comeback,
  libraryStats,
  availableTopics,
  handleStartReview,
  onStartFocus,
  onOpenDueWords,
}: ReviewTabProps) {
  const words = useWordsStore((s) => s.words);
  const setSelectedWord = useWordsStore((s) => s.setSelectedWord);
  const inComeback = !!comeback && !comeback.caughtUp;
  const unmasteredCount = useMemo(() => getUnmasteredWords(words).length, [words]);
  const isCapped = unmasteredCount >= youngWordCap();
  const simple = isSimpleMode();
  const dueWordCount = libraryStats.dueWords.length;
  const reviews = todayWork?.reviews ?? dueCount;
  const newToday = todayWork?.newToday ?? 0;
  const focusMinutes = getFocusSettings().minutes;

  // Reviews of the next 7 days, counted the way sessions pick cards (today = the "Thẻ ôn" of today's work).
  // One more day is read so the average covers the 7 days after today.
  const forecast = useMemo(() => {
    const f = forecastSessionLoad(words, 8);
    const upcoming = f.days.slice(1, 8);
    const upcomingPerDay = upcoming.reduce((sum, d) => sum + d.reviews, 0) / upcoming.length;
    return { days: f.days.slice(0, 7), laterToday: f.laterToday, upcomingPerDay, overloaded: upcomingPerDay > getStudyLimits().maxSessionSize };
  }, [words]);

  // Levels in CEFR order (other topics after them)
  const levels = useMemo(() => {
    const rank = (t: string) => {
      const i = (CEFR_LEVELS as readonly string[]).indexOf(t.toUpperCase());
      return i < 0 ? 99 : i;
    };
    return [...availableTopics].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }, [availableTopics]);

  const startLabel =
    dueCount > 0
      ? reviews > 0 && newToday > 0
        ? "Bắt đầu học"
        : reviews > 0
          ? "Bắt đầu ôn tập"
          : "Học từ mới"
      : isCapped
        ? `Ôn từ chưa thuộc (${unmasteredCount})`
        : "Học thêm từ mới";
  const tomorrow = forecast?.days[1]?.reviews ?? null;
  const maxDay = forecast ? Math.max(1, ...forecast.days.map((d) => d.reviews)) : 1;

  return (
    <div className={PAGE_CONTAINER}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        {/* ── Main column ── */}
        <div className="min-w-0 space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Ôn tập</h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">Lịch ôn tự điều chỉnh theo trí nhớ của bạn: từ được hỏi lại ngay khi sắp quên.</p>
          </div>

          {comeback && <ComebackCard comeback={comeback} onStart={() => handleStartReview(true)} />}

          {/* Today: how much, and every way to start */}
          {!inComeback && (
            <div className="rounded-2xl border border-orange-200 dark:border-orange-900/40 bg-gradient-to-br from-orange-50 via-white to-white dark:from-orange-950/20 dark:via-zinc-900 dark:to-zinc-900 p-5 sm:p-6 space-y-4 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-orange-700/80 dark:text-orange-300/80">Hôm nay</div>
                  {dueCount > 0 ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-slate-900 dark:text-white">{dueCount}</span>
                      <span className="text-sm text-slate-500 dark:text-zinc-400">thẻ · khoảng {minutesFor(reviews + newToday * 2)} phút</span>
                    </div>
                  ) : (
                    <div className="text-xl font-bold text-slate-900 dark:text-white">Đã xong phần hôm nay 🎉</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Pill tone="orange" label="Thẻ ôn" value={reviews} />
                  <Pill tone="cyan" label="Từ mới" value={newToday} />
                  <Pill tone="slate" label="Ngày mai" value={tomorrow} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleStartReview(true)}
                  disabled={words.length === 0}
                  autoFocus
                  className="flex-1 min-w-[200px] inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 !text-white text-sm font-bold shadow-lg shadow-orange-500/20 transition-all disabled:opacity-40"
                >
                  {dueCount > 0 ? <Play className="w-4 h-4 fill-white" /> : isCapped ? <RotateCcw className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                  {startLabel}
                  {dueCount > 0 && <span className="px-1.5 rounded-md bg-black/15 font-mono text-xs">{dueCount}</span>}
                </button>
                {onStartFocus && (
                  <button
                    onClick={() => onStartFocus(focusMinutes)}
                    disabled={words.length === 0}
                    title="Phiên tập trung: ẩn mọi thứ khác, tắt nhắc nhở"
                    className="inline-flex items-center gap-1.5 py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold shadow-sm shadow-violet-600/30 disabled:opacity-40"
                  >
                    <Crosshair className="w-4 h-4" /> Tập trung {focusMinutes}′
                  </button>
                )}
                <button
                  onClick={() => handleStartReview(false)}
                  disabled={words.length === 0}
                  title="Luyện thêm các từ đã học (từ vừa trả lời đúng liên tiếp được nghỉ), không ảnh hưởng lịch ôn"
                  className="inline-flex items-center gap-1.5 py-3 px-4 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white/70 dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-sm font-medium disabled:opacity-40"
                >
                  <Dumbbell className="w-4 h-4" /> Luyện tất cả
                </button>
              </div>

              {dueCount === 0 && isCapped && (
                <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Bạn có {unmasteredCount} từ đang học chưa vững (ổn định dưới 7 ngày). Củng cố các từ này trước khi học thêm từ mới.
                </p>
              )}
            </div>
          )}

          {/* Levels: one compact row each */}
          {levels.length > 0 && (
            <section className="space-y-2.5">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-zinc-200">
                <Layers className="w-4 h-4 text-cyan-500" /> Theo cấp độ
              </h3>
              <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 divide-y divide-slate-100 dark:divide-zinc-800">
                {levels.map((top) => {
                  const { total, due } = libraryStats.perTopic[top.trim().toLowerCase()] || { total: 0, due: 0 };
                  const share = total > 0 ? due / total : 0;
                  return (
                    <div key={top} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                      <span className="w-12 shrink-0 text-center text-xs font-bold px-2 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300">
                        {top}
                      </span>
                      <div className="flex-1 min-w-[140px] space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                          <span>{total} từ</span>
                          <span className={due > 0 ? "text-orange-600 dark:text-orange-400 font-semibold" : ""}>
                            {due > 0 ? `${due} đến hạn` : "không có từ đến hạn"}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                          <div className="h-full rounded-full bg-orange-400" style={{ width: `${Math.round(share * 100)}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {due > 0 && (
                          <button
                            onClick={() => handleStartReview(true, top)}
                            className="px-2.5 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 dark:bg-orange-500/15 dark:hover:bg-orange-500/25 text-orange-700 dark:text-orange-300 text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Play className="w-3 h-3 fill-current" /> Ôn {due}
                          </button>
                        )}
                        <button
                          onClick={() => handleStartReview(false, top)}
                          title={`Luyện thêm ${total} từ ${top}, không ảnh hưởng lịch ôn`}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-medium"
                        >
                          Luyện
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Words waiting: chips, the rest in the library */}
          {inComeback ? null : dueWordCount > 0 ? (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                  Từ đang chờ ôn <span className="font-normal text-slate-400 dark:text-zinc-500">({dueWordCount})</span>
                </h3>
                {onOpenDueWords && (
                  <button onClick={onOpenDueWords} className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline inline-flex items-center gap-1">
                    Xem tất cả <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
                {libraryStats.dueWords.slice(0, DUE_CHIPS).map((w) => {
                  const reviewed = !!w.srs.stability && w.srs.stability > 0;
                  return (
                    <button
                      key={w.id}
                      onClick={() => setSelectedWord(w)}
                      title={simple || !reviewed ? w.meaning_vn : `${w.meaning_vn} · độ bền ${Number(w.srs.stability).toFixed(1)} ngày`}
                      className="text-left px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-cyan-400 dark:hover:border-cyan-600 transition-colors min-w-0"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{w.word}</span>
                        {!reviewed && <span className="text-[9px] font-bold px-1 rounded bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 shrink-0">MỚI</span>}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">{w.meaning_vn}</div>
                    </button>
                  );
                })}
              </div>
              {dueWordCount > DUE_CHIPS && (
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  và {dueWordCount - DUE_CHIPS} từ khác{onOpenDueWords ? ", bấm \"Xem tất cả\" để xem trong Từ đã học" : ""}.
                </p>
              )}
            </section>
          ) : (
            <div className="flex items-center gap-3 px-4 py-4 rounded-2xl border border-slate-200 dark:border-zinc-800/60 bg-slate-50 dark:bg-zinc-900/30">
              <CheckCircle className="w-6 h-6 text-emerald-500 shrink-0" />
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">Không còn từ nào đang chờ ôn</div>
                <div className="text-xs text-slate-500 dark:text-zinc-400">Muốn ôn thêm thì bấm "Luyện tất cả", lịch ôn không bị ảnh hưởng.</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Side column: what is coming, how the week goes ── */}
        <aside className="min-w-0 grid gap-6 items-start md:grid-cols-2 lg:grid-cols-1 lg:sticky lg:top-0">
          <WeeklyProgressCard words={words} compact />

          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-3 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-cyan-500" /> 7 ngày tới
            </h3>
            <>
                <div className="flex items-end gap-1.5 h-24">
                  {forecast.days.map((d, i) => {
                    const [y, m, dd] = d.date.split("-").map(Number);
                    const day = i === 0 ? "Nay" : i === 1 ? "Mai" : WEEKDAY[new Date(y, m - 1, dd).getDay()];
                    return (
                      <div
                        key={d.date}
                        className="flex-1 h-full flex flex-col items-center justify-end gap-1"
                        title={
                          i === 0
                            ? `Hôm nay: ${d.reviews} thẻ ôn${forecast.laterToday > 0 ? `, thêm ${forecast.laterToday} thẻ đang học đến lượt muộn hơn trong ngày` : ""}`
                            : `${d.date}: ${d.reviews} thẻ ôn (đã có lịch, sẽ tăng thêm khi bạn học)`
                        }
                      >
                        <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">{d.reviews || ""}</span>
                        <div
                          className={`w-full rounded-t-md ${i === 0 ? "bg-orange-400" : "bg-cyan-400/70 dark:bg-cyan-500/60"}`}
                          style={{ height: `${d.reviews > 0 ? Math.max(6, (d.reviews / maxDay) * 64) : 2}px` }}
                        />
                        <span className={`text-[10px] ${i === 0 ? "font-bold text-slate-700 dark:text-zinc-200" : "text-slate-400 dark:text-zinc-500"}`}>{day}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Mỗi từ tối đa 1 thẻ ôn một ngày, như trong phiên ôn. Trung bình {Math.round(forecast.upcomingPerDay)} thẻ/ngày trong 7 ngày tới.
                  {forecast.overloaded ? " Lịch đang dày: nên giảm số từ mới mỗi ngày." : ""}
                </p>
              </>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Pill({ tone, label, value }: { tone: "orange" | "cyan" | "slate"; label: string; value: number | null }) {
  const cls = {
    orange: "bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 border-orange-200/80 dark:border-orange-800/50",
    cyan: "bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 border-cyan-200/80 dark:border-cyan-800/50",
    slate: "bg-slate-50 dark:bg-zinc-800/70 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-700",
  }[tone];
  return (
    <span className={`inline-flex flex-col items-center min-w-[64px] px-3 py-1.5 rounded-xl border ${cls}`}>
      <span className="text-base font-bold font-mono leading-tight">{value ?? "…"}</span>
      <span className="text-[10px]">{label}</span>
    </span>
  );
}
