import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, ChevronDown, Clock, CircleAlert, Eye, GraduationCap, Layers, Loader2, RefreshCw, Sparkles, Trash2, Upload, Wrench } from "lucide-react";
import type { GrammarBookFile } from "@/types/grammarBook";
import {
  ensureGrammarBookSeeded,
  getAllBookChapters,
  getBookLoadError,
  getHiddenItemKeys,
  listUserAcceptedAnswers,
  removeUserAcceptedAnswer,
  unhideItem,
} from "@/services/grammarBook";
import { getTodayGrammarPlan, type TodayGrammarPlan } from "@/services/grammarPath";
import { getGrammarSummaryStats, initGrammarStorage } from "@/services/grammarService";
import { buildPracticeSession, buildReviewSession, type SessionEntry } from "@/services/grammarSession";
import PathPicker, { type PathPickerMode } from "./PathPicker";
import GrammarLessonView, { type GrammarLessonTab } from "./GrammarLessonView";
import GrammarImportDialog from "./GrammarImportDialog";
import GrammarExerciseImportModal from "./GrammarExerciseImportModal";
import GrammarPlayer from "./GrammarPlayer";
import { PAGE_CONTAINER } from "../dashboard/shared";

interface GrammarHubProps {
  initialLessonId?: string | null;
  resetKey?: number;
}

type Stats = ReturnType<typeof getGrammarSummaryStats>;

/** What the learner has hidden or marked as accepted, kept here so each can be undone */
interface ManagedItems {
  hidden: string[];
  accepted: Array<{ itemKey: string; blankIndex: number; answer: string }>;
}

function readManagedItems(): ManagedItems {
  return { hidden: getHiddenItemKeys(), accepted: listUserAcceptedAnswers() };
}

interface PlayerState {
  entries: SessionEntry[];
  mode: "review" | "practice";
  title: string;
  subtitle?: string;
}

export default function GrammarHub({ initialLessonId = null, resetKey }: GrammarHubProps) {
  const [chapters, setChapters] = useState<GrammarBookFile[]>([]);
  const [plan, setPlan] = useState<TodayGrammarPlan | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  // The data could not be read (as opposed to: the book is simply not imported yet)
  const [loadError, setLoadError] = useState(false);
  const [managed, setManaged] = useState<ManagedItems>(() => readManagedItems());
  const [activeLesson, setActiveLesson] = useState<{ chapterId: string; lessonId: string; tab: GrammarLessonTab } | null>(null);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exerciseImportOpen, setExerciseImportOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<PathPickerMode>("path");
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSeq = useRef(0);
  const initialHandled = useRef(false);
  const prevResetKey = useRef(resetKey);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<number[]>([]);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    const list = timers.current;
    return () => {
      list.forEach((t) => window.clearTimeout(t));
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const showNotice = (text: string) => {
    setNotice(text);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  };

  const loadData = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      await initGrammarStorage();
      let chs = await getAllBookChapters();
      // Only an empty book is worth asking the seeding about (it counts rows in SQL)
      if (chs.length === 0) {
        await ensureGrammarBookSeeded().catch(() => {});
        chs = await getAllBookChapters();
      }
      const nextPlan = await getTodayGrammarPlan();
      if (seq !== loadSeq.current) return;
      setChapters(chs);
      setPlan(nextPlan);
      setStats(getGrammarSummaryStats());
      setManaged(readManagedItems());
      // The book loader reports a failed read as an empty book: ask it why
      setLoadError(getBookLoadError() !== null);

      // Open the requested lesson once (e.g. from the mistake notebook), not on every refresh
      if (initialLessonId && !initialHandled.current) {
        initialHandled.current = true;
        const ch = chs.find((c) => (c.lessons ?? []).some((l) => l.id === initialLessonId));
        if (ch) setActiveLesson({ chapterId: ch.chapterId, lessonId: initialLessonId, tab: "handbook" });
      }
    } catch (err) {
      console.warn("Failed to load the grammar hub:", err);
      if (seq === loadSeq.current) setLoadError(true);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [initialLessonId]);

  // Every graded answer fires "myenglish-grammar-updated"; closing the player reloads the hub already
  const playerOpen = useRef(false);
  playerOpen.current = player !== null;

  useEffect(() => {
    void loadData();
    const onUpdate = (e: Event) => {
      // The book itself changed (import, undo, other window): the hub must reload even behind the player
      const bookChanged = !!(e as CustomEvent<{ book?: boolean } | undefined>).detail?.book;
      if (playerOpen.current && !bookChanged) return;
      void loadData();
    };
    window.addEventListener("myenglish-grammar-updated", onUpdate);
    return () => window.removeEventListener("myenglish-grammar-updated", onUpdate);
  }, [loadData]);

  useEffect(() => {
    if (prevResetKey.current === resetKey) return;
    prevResetKey.current = resetKey;
    setActiveLesson(null);
    setPlayer(null);
    setImportOpen(false);
    setExerciseImportOpen(false);
    setPickerMode("path");
    void loadData();
  }, [resetKey, loadData]);

  const retryLoad = () => {
    setLoading(true);
    setLoadError(false);
    void loadData();
  };

  const restoreHidden = (itemKey: string) => {
    unhideItem(itemKey);
    setManaged(readManagedItems());
  };

  const removeAccepted = (item: ManagedItems["accepted"][number]) => {
    removeUserAcceptedAnswer(item.itemKey, item.answer, item.blankIndex);
    setManaged(readManagedItems());
  };

  const openLesson = (lessonId: string, tab: GrammarLessonTab = "handbook") => {
    const ch = chapters.find((c) => (c.lessons ?? []).some((l) => l.id === lessonId));
    if (ch) setActiveLesson({ chapterId: ch.chapterId, lessonId, tab });
  };

  const startReview = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const entries = await buildReviewSession();
      if (entries.length === 0) {
        showNotice("Chưa có câu ôn tập phù hợp cho các bài đến hạn");
        return;
      }
      setPlayer({ entries, mode: "review", title: "Ôn tập ngữ pháp", subtitle: `${stats?.dueCount ?? 0} bài đến hạn` });
    } catch (err) {
      console.warn("Failed to build the review:", err);
      showNotice("Không tạo được bài ôn tập");
    } finally {
      setStarting(false);
    }
  };

  const startPractice = async (lessonIds: string[]) => {
    if (starting) return;
    setStarting(true);
    try {
      const entries = await buildPracticeSession(lessonIds);
      if (entries.length === 0) {
        showNotice("Chưa có câu nào chỉ dùng các bài này");
        return;
      }
      setPickerMode("path");
      const names = chapters
        .flatMap((c) => c.lessons ?? [])
        .filter((l) => lessonIds.includes(l.id))
        .map((l) => l.titleVn || l.title);
      setPlayer({
        entries,
        mode: "practice",
        title: "Luyện theo thì",
        subtitle: names.length <= 3 ? names.join(" + ") : `${names.slice(0, 3).join(" + ")} và ${names.length - 3} bài khác`,
      });
    } catch (err) {
      console.warn("Failed to build the practice:", err);
      showNotice("Không tạo được bài luyện");
    } finally {
      setStarting(false);
    }
  };

  const openPractice = () => {
    setPickerMode("practice");
    later(() => pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  if (player) {
    return (
      <div className={PAGE_CONTAINER}>
        <GrammarPlayer
          entries={player.entries}
          mode={player.mode}
          title={player.title}
          subtitle={player.subtitle}
          onFinish={() => {}}
          onExit={() => {
            setPlayer(null);
            void loadData();
          }}
          onOpenLesson={(lessonId) => {
            setPlayer(null);
            openLesson(lessonId);
          }}
        />
      </div>
    );
  }

  if (activeLesson) {
    const lesson = chapters.flatMap((c) => c.lessons ?? []).find((l) => l.id === activeLesson.lessonId);
    if (lesson) {
      return (
        <div className={PAGE_CONTAINER}>
          <GrammarLessonView
            key={activeLesson.lessonId}
            lesson={lesson}
            chapterId={activeLesson.chapterId}
            initialTab={activeLesson.tab}
            onBack={() => {
              setActiveLesson(null);
              void loadData();
            }}
            onOpenLesson={(lessonId) => openLesson(lessonId)}
          />
        </div>
      );
    }
  }

  const hasBook = chapters.length > 0;
  const total = stats?.totalLessons ?? 0;
  const studiedPercent = total > 0 ? Math.round(((stats?.studiedCount ?? 0) / total) * 100) : 0;

  return (
    <div className={PAGE_CONTAINER}>
      <div className="mx-auto max-w-4xl space-y-5 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="flex items-center gap-2.5 text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
              <GraduationCap className="h-6 w-6 shrink-0 text-cyan-600 dark:text-cyan-400" />
              <span>Ngữ pháp</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400 sm:text-sm">
              Học theo sách của bạn: mỗi ngày một bài mới, ôn lại đúng lúc sắp quên.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setExerciseImportOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 px-3.5 py-2 text-xs font-bold !text-white shadow-sm transition-all shrink-0 cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            <span>Nhập bài tập AI & Lịch sử</span>
          </button>
        </div>

        {loading && !hasBook ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500 dark:text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang tải...
          </div>
        ) : loadError && !hasBook ? (
          <div className="space-y-4 rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm dark:border-rose-900/60 dark:bg-zinc-900 sm:p-10">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
              <CircleAlert className="h-7 w-7" />
            </span>
            <div className="mx-auto max-w-md space-y-1.5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Không tải được dữ liệu ngữ pháp</h2>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                Có lỗi khi đọc dữ liệu trên máy này. Hãy thử lại. Nếu vẫn lỗi, hãy khởi động lại ứng dụng.
              </p>
            </div>
            <button
              type="button"
              onClick={retryLoad}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-semibold !text-white shadow-sm transition hover:bg-cyan-500"
            >
              <RefreshCw className="h-4 w-4" />
              Thử lại
            </button>
          </div>
        ) : !hasBook ? (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-10">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 text-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-400">
              <BookOpen className="h-7 w-7" />
            </span>
            <div className="mx-auto max-w-md space-y-1.5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Chưa có dữ liệu sách ngữ pháp</h2>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                Dữ liệu lấy từ chính cuốn sách của bạn: nhờ AI chuyển từng chương sang file JSON bằng prompt có sẵn, rồi nhập các file vào đây.
              </p>
            </div>
            <div className="flex flex-col items-stretch justify-center gap-2.5 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setExerciseImportOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-semibold !text-white shadow-sm transition hover:bg-cyan-500"
              >
                <Sparkles className="h-4 w-4" />
                Nhập bài tập AI / Lịch sử
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-500">Các file chỉ được lưu trên máy này, không gửi đi đâu.</p>
          </div>
        ) : (
          <>
            <section className="space-y-3" aria-label="Hôm nay">
              <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Hôm nay</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <TodayCard icon={<Clock className="h-3.5 w-3.5" />} label="Ôn lại" highlight={(stats?.dueCount ?? 0) > 0}>
                  {stats && stats.dueCount > 0 ? (
                    <button
                      type="button"
                      onClick={startReview}
                      disabled={starting}
                      className="w-full rounded-lg bg-cyan-600 px-3 py-2 text-left text-sm font-semibold !text-white transition hover:bg-cyan-500 disabled:opacity-50"
                    >
                      Ôn tập ({stats.dueCount} bài đến hạn)
                    </button>
                  ) : (
                    <p className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Không có bài đến hạn ✓</p>
                  )}
                </TodayCard>

                <TodayCard icon={<Sparkles className="h-3.5 w-3.5" />} label="Bài mới">
                  {plan?.relearn ? (
                    <LessonButton
                      primary
                      text={`Học lại: ${plan.relearn.titleVn || plan.relearn.title}`}
                      hint="Lần kiểm tra nhanh trước chưa đạt"
                      onClick={() => openLesson(plan.relearn!.id)}
                    />
                  ) : plan?.nextLesson && !plan.newLessonDoneToday ? (
                    <LessonButton
                      primary
                      text={`Bài mới: ${plan.nextLesson.titleVn || plan.nextLesson.title}`}
                      onClick={() => openLesson(plan.nextLesson!.id)}
                    />
                  ) : plan?.nextLesson ? (
                    <div className="space-y-1.5">
                      <p className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Đã học bài mới hôm nay ✓</p>
                      <button
                        type="button"
                        onClick={() => openLesson(plan.nextLesson!.id)}
                        className="text-xs font-semibold text-cyan-700 hover:underline dark:text-cyan-400"
                      >
                        Học tiếp bài sau
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Đã đi hết lộ trình ✓</p>
                  )}
                </TodayCard>

                <TodayCard icon={<Layers className="h-3.5 w-3.5" />} label="Luyện tập">
                  <LessonButton text="Luyện theo thì" hint="Chọn thì muốn luyện, làm các câu chỉ dùng thì đó" onClick={openPractice} />
                </TodayCard>
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-zinc-400">
                  <span>
                    <strong className="font-mono text-sm text-slate-900 dark:text-white">
                      {stats?.studiedCount ?? 0}/{total}
                    </strong>{" "}
                    bài đã học
                  </span>
                  <span>{stats?.masteredCount ?? 0} bài thuộc</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800">
                  <div className="h-full rounded-full bg-cyan-500 transition-all duration-300" style={{ width: `${studiedPercent}%` }} />
                </div>
              </div>
            </section>

            <div ref={pickerRef} className="scroll-mt-2">
              <PathPicker
                chapters={chapters}
                onOpenLesson={openLesson}
                onPractice={startPractice}
                mode={pickerMode}
                onModeChange={setPickerMode}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200 pt-4 text-xs dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setExerciseImportOpen(true)}
                className="inline-flex items-center gap-1.5 font-bold text-cyan-600 transition hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Nhập bài tập AI & Lịch sử
              </button>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex items-center gap-1.5 text-slate-400 transition hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-400 ml-auto"
                title="Nhập dữ liệu gốc từ sách PDF"
              >
                <Upload className="h-3 w-3" />
                <span>Nhập dữ liệu sách</span>
              </button>
            </div>

            <ManagedItemsPanel managed={managed} onRestoreHidden={restoreHidden} onRemoveAccepted={removeAccepted} />
          </>
        )}
      </div>

      <GrammarImportDialog isOpen={importOpen} onClose={() => setImportOpen(false)} onImportComplete={() => void loadData()} />
      <GrammarExerciseImportModal isOpen={exerciseImportOpen} onClose={() => setExerciseImportOpen(false)} onImportComplete={() => void loadData()} />

      {notice && (
        <div
          role="status"
          className="fixed bottom-16 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-center text-xs font-medium text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
        >
          {notice}
        </div>
      )}
    </div>
  );
}

/** Hidden questions and self-accepted answers: folded away by default, only keys and answers are listed */
function ManagedItemsPanel({
  managed,
  onRestoreHidden,
  onRemoveAccepted,
}: {
  managed: ManagedItems;
  onRestoreHidden: (itemKey: string) => void;
  onRemoveAccepted: (item: ManagedItems["accepted"][number]) => void;
}) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-slate-600 dark:text-zinc-300">
        <span className="flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5" />
          Công cụ: câu đã ẩn và đáp án tự công nhận
        </span>
        <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
      </summary>

      <div className="mt-3 space-y-4">
        <section className="space-y-1.5">
          <h3 className="font-bold text-slate-700 dark:text-zinc-200">Câu đã ẩn ({managed.hidden.length})</h3>
          {managed.hidden.length === 0 ? (
            <p className="text-slate-500 dark:text-zinc-400">Chưa ẩn câu nào.</p>
          ) : (
            <ul className="space-y-1">
              {managed.hidden.map((itemKey) => (
                <li key={itemKey} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-zinc-800/60">
                  <span className="min-w-0 truncate font-mono text-slate-700 dark:text-zinc-300">{itemKey}</span>
                  <button
                    type="button"
                    onClick={() => onRestoreHidden(itemKey)}
                    className="inline-flex shrink-0 items-center gap-1 font-semibold text-cyan-700 hover:underline dark:text-cyan-400"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Hiện lại
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-1.5">
          <h3 className="font-bold text-slate-700 dark:text-zinc-200">Đáp án mình tự công nhận ({managed.accepted.length})</h3>
          {managed.accepted.length === 0 ? (
            <p className="text-slate-500 dark:text-zinc-400">Chưa có đáp án nào.</p>
          ) : (
            <ul className="space-y-1">
              {managed.accepted.map((item) => (
                <li
                  key={`${item.itemKey}-${item.blankIndex}-${item.answer}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-zinc-800/60"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-slate-500 dark:text-zinc-400">{item.itemKey}</span>
                    {item.blankIndex > 0 && <span className="text-slate-500 dark:text-zinc-400"> · ô {item.blankIndex + 1}</span>}
                    <span className="text-slate-700 dark:text-zinc-200">: {item.answer}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveAccepted(item)}
                    className="inline-flex shrink-0 items-center gap-1 font-semibold text-rose-600 hover:underline dark:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Xoá
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </details>
  );
}

function TodayCard({ icon, label, highlight = false, children }: { icon: ReactNode; label: string; highlight?: boolean; children: ReactNode }) {
  return (
    <div
      className={`space-y-2 rounded-xl border p-3.5 shadow-sm ${
        highlight
          ? "border-cyan-200 bg-cyan-50/50 dark:border-cyan-900/60 dark:bg-cyan-950/20"
          : "border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-700 dark:text-cyan-300">
        {icon}
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}

function LessonButton({ text, hint, primary = false, onClick }: { text: string; hint?: string; primary?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full space-y-0.5 rounded-lg border px-3 py-2 text-left transition ${
        primary
          ? "border-cyan-600 bg-cyan-600 hover:bg-cyan-500"
          : "border-slate-200 hover:border-cyan-400 hover:bg-cyan-50/40 dark:border-zinc-700 dark:hover:border-cyan-700 dark:hover:bg-cyan-950/20"
      }`}
    >
      <span className={`block break-words text-sm font-semibold ${primary ? "!text-white" : "text-slate-900 dark:text-white"}`}>{text}</span>
      {hint && (
        <span className={`block text-xs ${primary ? "text-cyan-100" : "text-slate-500 dark:text-zinc-400"}`}>{hint}</span>
      )}
    </button>
  );
}
