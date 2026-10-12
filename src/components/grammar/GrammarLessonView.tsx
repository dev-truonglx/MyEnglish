import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, Clock, Layers, Loader2, Play, Zap } from "lucide-react";
import type { GrammarBookFile, GrammarBookLesson } from "@/types/grammarBook";
import { getEffectiveLessonIds, toggleLessonSelection } from "@/services/grammarPath";
import { getLessonProgress } from "@/services/grammarService";
import {
  buildLearnSession,
  buildLessonExerciseSession,
  finishLearnSession,
  lessonExerciseMode,
  lessonHasExercises,
  lessonStatus,
  markLessonRead,
  type GrammarSessionMode,
  type SessionEntry,
} from "@/services/grammarSession";
import { getBookChapter } from "@/services/grammarBook";
import { formatNextReviewRelative } from "@/utils/reviewSchedule";
import HandbookView from "./HandbookView";
import GrammarPlayer from "./GrammarPlayer";
import { LessonStatusChip, MasteryBar } from "./PathPicker";

export type GrammarLessonTab = "handbook" | "practice" | "diagnostic";

interface GrammarLessonViewProps {
  lesson: GrammarBookLesson;
  chapterId: string;
  initialTab?: GrammarLessonTab;
  onBack: () => void;
  /** Opens another lesson (from a question that uses it) */
  onOpenLesson?: (lessonId: string) => void;
}

interface PlayerState {
  entries: SessionEntry[];
  mode: GrammarSessionMode;
  title: string;
  subtitle?: string;
  onFinish: (results: Array<{ entry: SessionEntry; correct: boolean }>, info: { early: boolean }) => void | Promise<void>;
}

const TABS: Array<{ id: GrammarLessonTab; label: string; icon: typeof BookOpen }> = [
  { id: "handbook", label: "Sổ tay", icon: BookOpen },
  { id: "practice", label: "Bài tập", icon: Layers },
  { id: "diagnostic", label: "Kiểm tra nhanh", icon: Zap },
];

export default function GrammarLessonView({ lesson, chapterId, initialTab = "handbook", onBack, onOpenLesson }: GrammarLessonViewProps) {
  const [tab, setTab] = useState<GrammarLessonTab>(initialTab === "practice" ? "handbook" : initialTab);
  const [chapter, setChapter] = useState<GrammarBookFile | null>(null);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Null while the lesson's questions are being looked up
  const [hasExercises, setHasExercises] = useState<boolean | null>(null);
  // The quick check found no question usable now (e.g. all of them use a lesson not learnt yet)
  const [quickEmpty, setQuickEmpty] = useState(false);
  // Re-render when progress or the path changes (values below are read on each render)
  const [, setTick] = useState(0);
  const topRef = useRef<HTMLDivElement | null>(null);

  // Progress and path changes come through this event
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("myenglish-grammar-updated", bump);
    return () => window.removeEventListener("myenglish-grammar-updated", bump);
  }, []);

  // A lesson with no auto-checked question (theory only, or only self-graded ones) can be read and marked as learnt
  useEffect(() => {
    let cancelled = false;
    setHasExercises(null);
    setQuickEmpty(false);
    lessonHasExercises(lesson.id)
      .then((found) => {
        if (!cancelled) setHasExercises(found);
      })
      .catch(() => {
        if (!cancelled) setHasExercises(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lesson.id]);

  // The chapter (notes, number)
  useEffect(() => {
    let cancelled = false;
    getBookChapter(chapterId)
      .then((ch) => {
        if (!cancelled) setChapter(ch);
      })
      .catch((err) => console.warn("Failed to load the chapter:", err));
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  const progress = getLessonProgress(lesson.id);
  const status = lessonStatus(lesson.id);
  const studied = status !== "new";
  // No question to practise with: reading the handbook is all there is to do
  const noQuestions = hasExercises === false || quickEmpty;
  const onPath = getEffectiveLessonIds().includes(lesson.id);
  const name = lesson.titleVn || lesson.title;
  const chapterNo = chapter?.chapter?.order ?? (parseInt(chapterId.replace(/\D/g, ""), 10) || 0);
  const nextReview = studied ? formatNextReviewRelative(progress.nextReviewDate) : null;

  const goTab = (next: GrammarLessonTab, scrollTop = false) => {
    // "Bài tập" is not a page: it starts the lesson's exercises at once
    if (next === "practice") {
      void startExercises();
      return;
    }
    setTab(next);
    setMessage(null);
    if (scrollTop) requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: "start" }));
  };

  const closePlayer = () => {
    setPlayer(null);
    setTick((t) => t + 1);
  };

  /** A question that uses another lesson opens that lesson; this lesson's own handbook is shown here */
  const openFromPlayer = (lessonId: string) => {
    if (lessonId === lesson.id) {
      setTab("handbook");
      setMessage(null);
      closePlayer();
      requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: "start" }));
      return;
    }
    onOpenLesson?.(lessonId);
  };

  /** Reading is the whole lesson when it has no questions: it is studied from now on (no FSRS card needed) */
  const markRead = () => {
    markLessonRead(lesson.id);
    setMessage("Đã ghi nhận: bài này tính là đã học.");
    setTick((t) => t + 1);
  };

  const startQuickCheck = async () => {
    setStarting("learn");
    setMessage(null);
    try {
      const entries = await buildLearnSession(lesson.id);
      if (entries.length === 0) {
        setQuickEmpty(true);
        setMessage("Chưa có câu hỏi nào dùng riêng bài này để kiểm tra. Đọc xong, bạn có thể đánh dấu bài là đã học.");
        return;
      }
      setPlayer({
        entries,
        mode: "learn",
        title: `Kiểm tra nhanh: ${name}`,
        subtitle: lesson.titleVn ? lesson.title : undefined,
        onFinish: async (results, info) => {
          // Ending early does not grade the lesson: its first schedule needs the whole quick check
          if (info.early || results.length === 0) return;
          try {
            await finishLearnSession(lesson.id, results.map((r) => r.correct));
          } catch (err) {
            console.warn("Failed to record the quick check:", err);
          }
        },
      });
    } catch (err) {
      console.warn("Failed to build the quick check:", err);
      setMessage("Không tạo được bài kiểm tra. Hãy thử lại.");
    } finally {
      setStarting(null);
    }
  };

  /** Every question of this lesson alone (no other tense), never seen or missed first */
  const startExercises = async () => {
    if (starting) return;
    setStarting("practice");
    setMessage(null);
    try {
      const entries = await buildLessonExerciseSession(lesson.id);
      if (entries.length === 0) {
        setMessage("Dữ liệu sách chưa có câu nào chỉ dùng riêng bài này.");
        return;
      }
      setPlayer({
        entries,
        mode: lessonExerciseMode(lesson.id),
        title: `Bài tập: ${name}`,
        subtitle: !studied
          ? `${entries.length} câu luyện tập tự do · Làm "Kiểm tra ngay" để tính % tiến độ`
          : `${entries.length} câu chỉ dùng ${name}`,
        onFinish: () => {},
      });
    } catch (err) {
      console.warn("Failed to build the lesson's exercises:", err);
      setMessage("Không tạo được bài tập. Hãy thử lại.");
    } finally {
      setStarting(null);
    }
  };

  // Opened straight on "Bài tập" (e.g. from the path): start at once, the handbook stays underneath
  const autoStarted = useRef(false);
  useEffect(() => {
    if (initialTab !== "practice" || autoStarted.current) return;
    autoStarted.current = true;
    setTab("handbook");
    void startExercises();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (player) {
    return (
      <div className="mx-auto max-w-4xl pb-12">
        <GrammarPlayer
          entries={player.entries}
          mode={player.mode}
          title={player.title}
          subtitle={player.subtitle}
          onFinish={player.onFinish}
          onExit={closePlayer}
          onOpenLesson={openFromPlayer}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-12 animate-in fade-in duration-200">
      <div ref={topRef} />

      <header className="space-y-3 border-b border-slate-200 pb-4 dark:border-zinc-800">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            title="Quay lại danh sách"
            aria-label="Quay lại danh sách"
            className="shrink-0 rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-zinc-400">
              <span className="rounded-full bg-cyan-100 px-2 py-0.5 font-mono font-bold text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                Ch.{chapterNo} · Bài {lesson.order}
              </span>
              {lesson.page ? <span>tr. {lesson.page}</span> : null}
            </div>
            <h1 className="mt-1 break-words text-lg font-bold text-slate-900 dark:text-white sm:text-xl">{name}</h1>
            {lesson.titleVn && lesson.title && lesson.title !== lesson.titleVn && (
              <p className="break-words text-xs text-slate-500 dark:text-zinc-400">{lesson.title}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <LessonStatusChip status={status} />
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-zinc-300">
            Thuộc
            <MasteryBar mastery={progress.mastery} className="w-16" />
            <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">{progress.mastery}%</span>
          </span>
          {nextReview && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-zinc-400">
              <Clock className="h-3.5 w-3.5" />
              Ôn lại: {nextReview.label}
            </span>
          )}
          <label className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:border-zinc-800 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={onPath}
              onChange={() => toggleLessonSelection(lesson.id)}
              className="h-4 w-4 accent-cyan-600"
            />
            Trên lộ trình
          </label>
        </div>
      </header>

      {/* Nút to / Banner nổi bật: Kiểm tra ngay */}
      {!noQuestions && (
        <div
          className={`rounded-2xl border p-4 sm:p-5 transition-all shadow-sm ${
            !studied
              ? "border-cyan-300 bg-gradient-to-r from-cyan-50/90 via-sky-50/80 to-blue-50/70 dark:border-cyan-800 dark:from-cyan-950/40 dark:via-sky-950/30 dark:to-blue-950/30 ring-1 ring-cyan-200/50 dark:ring-cyan-900/40"
              : "border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/80"
          }`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-600 text-white shadow-sm">
                  <Zap className="h-4 w-4 fill-current" />
                </span>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white sm:text-base">
                  {!studied ? "Kiểm tra nhanh để kích hoạt & tính % tiến độ" : "Kiểm tra & Cập nhật độ thuộc"}
                </h2>
                {!studied ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    Chưa kích hoạt · 0%
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Đã học · {progress.mastery}%
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
                {!studied
                  ? "Làm bài kiểm tra ngắn (tối đa 8 câu) để hệ thống đánh giá trình độ ban đầu, tính % độ thuộc và đưa thì này vào lịch ôn tập giãn cách FSRS."
                  : `Điểm kiểm tra gần nhất: ${progress.score}% · Độ thuộc: ${progress.mastery}%. Làm lại bài kiểm tra để cập nhật điểm số và lịch ôn tập.`}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={startQuickCheck}
                disabled={starting !== null}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl bg-cyan-600 px-6 py-3 text-sm font-bold !text-white shadow-md shadow-cyan-600/25 transition hover:bg-cyan-500 hover:shadow-lg hover:shadow-cyan-600/30 active:scale-[0.98] disabled:opacity-50"
              >
                {starting === "learn" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 fill-current" />
                )}
                <span>Kiểm tra ngay (tối đa 8 câu)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200/80 bg-slate-100 p-1 dark:border-zinc-700 dark:bg-zinc-800">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => goTab(id)}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-1.5 py-2 text-center text-xs font-semibold leading-tight transition ${
              tab === id
                ? "bg-white text-cyan-700 shadow-sm dark:bg-zinc-900 dark:text-cyan-400"
                : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <Icon className="hidden h-3.5 w-3.5 shrink-0 sm:block" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {message && tab !== "diagnostic" && <Notice text={message} tone={message.startsWith("Đã ghi nhận") ? "ok" : "warn"} />}

      {tab === "handbook" && (
        <div>
          <HandbookView blocks={lesson.blocks} title={lesson.title} titleVn={lesson.titleVn} chapterNotes={chapter?.chapterNotes ?? []} />
          {noQuestions ? (
            <ReadOnlyPanel studied={studied} quickEmpty={quickEmpty} onMark={markRead} onBack={onBack} />
          ) : (
            <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/20 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-slate-700 dark:text-zinc-300">
                {studied
                  ? "Đọc xong rồi? Làm bài tập của riêng thì này để nhớ lâu hơn."
                  : "Đọc xong sổ tay rồi? Làm vài câu kiểm tra nhanh để bắt đầu học bài này."}
              </p>
              <button
                type="button"
                onClick={() => (studied ? void startExercises() : void startQuickCheck())}
                disabled={starting !== null}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold !text-white shadow-sm transition hover:bg-cyan-500"
              >
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : studied ? <Layers className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                {studied ? "Làm bài tập" : "Làm kiểm tra nhanh"}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "diagnostic" && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-400">
              <Zap className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Kiểm tra nhanh (tối đa 8 câu)</h2>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                {studied
                  ? "Làm lại để xem bạn còn nhớ bài này đến đâu. Kết quả cập nhật độ thuộc và lịch ôn."
                  : "Lần đầu, bài kiểm tra này sẽ đưa bài vào lịch ôn giãn cách (FSRS): kết quả quyết định khi nào bạn gặp lại bài. Nên đọc Sổ tay trước."}
              </p>
            </div>
          </div>
          {studied && progress.lastAttemptDate && (
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Điểm gần nhất: <strong className="font-mono text-slate-800 dark:text-zinc-200">{progress.score}%</strong>
            </p>
          )}
          {message && <Notice text={message} tone={message.startsWith("Đã ghi nhận") ? "ok" : "warn"} />}
          {noQuestions ? (
            <ReadOnlyPanel studied={studied} quickEmpty={quickEmpty} onMark={markRead} onBack={onBack} />
          ) : (
            <button
              type="button"
              onClick={startQuickCheck}
              disabled={starting !== null}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-6 py-2.5 text-sm font-semibold !text-white shadow-sm transition hover:bg-cyan-500 disabled:opacity-50 sm:w-auto"
            >
              {starting === "learn" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
              Bắt đầu
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Notice({ text, tone = "warn" }: { text: string; tone?: "warn" | "ok" }) {
  return (
    <p
      className={`rounded-lg border px-3 py-2 text-xs ${
        tone === "ok"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
          : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
      }`}
    >
      {text}
    </p>
  );
}

/** A lesson with no questions (or none usable yet): read it, mark it, then go back to the list */
function ReadOnlyPanel({ studied, quickEmpty, onMark, onBack }: { studied: boolean; quickEmpty: boolean; onMark: () => void; onBack: () => void }) {
  const hint = quickEmpty
    ? "Chưa có câu hỏi nào dùng riêng bài này để kiểm tra. Đọc xong thì đánh dấu để tính là đã học."
    : "Bài này chưa có câu hỏi có đáp án để kiểm tra. Đọc xong thì đánh dấu để tính là đã học.";
  return (
    <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/20 sm:flex-row sm:items-center">
      <p className="flex-1 text-sm text-slate-700 dark:text-zinc-300">{studied ? "Bạn đã học xong bài này." : hint}</p>
      {studied ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Về danh sách bài
        </button>
      ) : (
        <button
          type="button"
          onClick={onMark}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold !text-white shadow-sm transition hover:bg-cyan-500"
        >
          <CheckCircle2 className="h-4 w-4" />
          Đã đọc xong, tính là đã học
        </button>
      )}
    </div>
  );
}
