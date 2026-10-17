import { Fragment, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Check, ChevronDown, Layers } from "lucide-react";
import type { GrammarBookFile, GrammarBookLesson } from "@/types/grammarBook";
import {
  getEffectiveLessonIds,
  isLessonStudied,
  selectChapterLessons,
  toggleLessonSelection,
} from "@/services/grammarPath";
import { getDueGrammarLessons, getLessonProgress } from "@/services/grammarService";
import { lessonStatus } from "@/services/grammarSession";
import { formatNextReviewRelative } from "@/utils/reviewSchedule";
import { buildTenseGrid, TENSE_COLUMNS, TENSE_ROWS } from "@/utils/tenseGrid";
import type { GrammarLessonTab } from "./GrammarLessonView";

export type PathPickerMode = "path" | "practice";
export type LessonStatus = ReturnType<typeof lessonStatus>;

interface PathPickerProps {
  chapters: GrammarBookFile[];
  onOpenLesson: (lessonId: string, tab?: GrammarLessonTab) => void;
  onPractice: (lessonIds: string[]) => void;
  /** Controlled mode; when omitted the picker keeps its own */
  mode?: PathPickerMode;
  onModeChange?: (mode: PathPickerMode) => void;
}

const STATUS_STYLE: Record<LessonStatus, { label: string; className: string }> = {
  new: { label: "Mới", className: "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400" },
  learning: { label: "Đang học", className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/70 dark:text-cyan-300" },
  due: { label: "Đến hạn", className: "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300" },
  mastered: { label: "Đã thuộc", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300" },
};

/** Lesson card colours by status: a thin accent on top, a soft tint behind, and the legend dot */
const CARD_STYLE: Record<LessonStatus, { accent: string; surface: string; dot: string }> = {
  new: {
    accent: "bg-slate-300 dark:bg-zinc-600",
    surface:
      "border-slate-200 bg-white hover:border-slate-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700",
    dot: "bg-slate-300 dark:bg-zinc-500",
  },
  learning: {
    accent: "bg-cyan-500",
    surface:
      "border-cyan-200 bg-cyan-50/70 hover:border-cyan-300 dark:border-cyan-900/60 dark:bg-cyan-950/25 dark:hover:border-cyan-800",
    dot: "bg-cyan-500",
  },
  due: {
    accent: "bg-amber-500",
    surface:
      "border-amber-200 bg-amber-50/80 hover:border-amber-300 dark:border-amber-900/60 dark:bg-amber-950/25 dark:hover:border-amber-800",
    dot: "bg-amber-500",
  },
  mastered: {
    accent: "bg-emerald-500",
    surface:
      "border-emerald-200 bg-emerald-50/70 hover:border-emerald-300 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:hover:border-emerald-800",
    dot: "bg-emerald-500",
  },
};

const LEGEND_ORDER: LessonStatus[] = ["new", "learning", "due", "mastered"];

export function LessonStatusChip({ status }: { status: LessonStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.className}`}>
      {s.label}
    </span>
  );
}

export function MasteryBar({ mastery, className = "w-16 sm:w-24" }: { mastery: number; className?: string }) {
  const value = Math.max(0, Math.min(100, mastery));
  return (
    <span className={`inline-block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800 ${className}`}>
      <span
        className={`block h-full rounded-full ${value >= 80 ? "bg-emerald-500" : "bg-cyan-500"}`}
        style={{ width: `${value}%` }}
      />
    </span>
  );
}

/** A small circular gauge (the mastery of one lesson) */
function ProgressRing({ value, size = 18, stroke = 3 }: { value: number; size?: number; stroke?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-200 dark:stroke-zinc-700" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        className={`transition-[stroke-dashoffset] duration-300 ${pct >= 80 ? "stroke-emerald-500" : "stroke-cyan-500"}`}
      />
    </svg>
  );
}

interface LessonRow {
  lesson: GrammarBookLesson;
  status: LessonStatus;
  mastery: number;
  /** "Ôn sau 3 ngày" and the like; null for a lesson not studied yet */
  reviewText: string | null;
}

/** "Sau 3 ngày" -> "Ôn sau 3 ngày"; overdue labels already read as a sentence */
function reviewText(label: string): string {
  const clean = label.replace(/\s*\(.*?\)\s*/g, " ").trim();
  if (/^(Đến hạn|Quá hạn)/.test(clean)) return clean;
  return `Ôn ${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
}

/** The book prints chapter titles in capitals ("CÁC THÌ"); only those are turned into sentence case */
function sentenceCase(text: string): string {
  const s = text.trim();
  if (!s || s !== s.toUpperCase() || s === s.toLowerCase()) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Width of an element, kept up to date; measured before the first paint so the layout does not jump */
function useMeasuredWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, width];
}

interface LessonCardProps {
  row: LessonRow;
  mode: PathPickerMode;
  /** Path mode: the lesson is on the learning path */
  onPath: boolean;
  /** Practice mode: the lesson is picked */
  picked: boolean;
  /** The next lesson of the path */
  isNext: boolean;
  onOpen: () => void;
  onToggle: () => void;
}

function LessonCard({ row, mode, onPath, picked, isNext, onOpen, onToggle }: LessonCardProps) {
  const { lesson, status, mastery } = row;
  const isPractice = mode === "practice";
  const style = CARD_STYLE[status];
  const name = lesson.titleVn || lesson.title;
  const showEn = !!lesson.titleVn && !!lesson.title && lesson.title !== lesson.titleVn;
  const dimmed = !isPractice && !onPath;

  return (
    <div role="group" aria-label={name} className="relative h-full min-w-0">
      <button
        type="button"
        onClick={isPractice ? onToggle : onOpen}
        aria-pressed={isPractice ? picked : undefined}
        title={showEn ? `${name} · ${lesson.title}` : name}
        className={`relative flex h-full min-h-[96px] w-full flex-col overflow-hidden rounded-xl border px-2.5 pb-2.5 pt-3.5 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${style.surface} ${
          picked ? "ring-2 ring-cyan-500 dark:ring-cyan-400" : ""
        } ${dimmed ? "opacity-60 hover:opacity-100" : ""}`}
      >
        <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[3px] ${style.accent}`} />

        {isPractice && (
          <span
            aria-hidden="true"
            className={`absolute right-2 top-2.5 flex h-5 w-5 items-center justify-center rounded-full border transition ${
              picked
                ? "border-cyan-600 bg-cyan-600 !text-white"
                : "border-slate-300 bg-white/70 dark:border-zinc-600 dark:bg-zinc-900/60"
            }`}
          >
            {picked && <Check className="h-3 w-3" strokeWidth={3} />}
          </span>
        )}

        {/* Room on the right for the switch / check in the corner */}
        <span className="line-clamp-2 break-words pr-7 text-[13px] font-semibold leading-snug text-slate-900 dark:text-white">
          {name}
        </span>
        {showEn && <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-zinc-400">{lesson.title}</span>}

        {/* Wraps when the card is narrow: the review date drops under the gauge */}
        <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <ProgressRing value={mastery} />
            <span className="font-mono text-slate-600 dark:text-zinc-300">{Math.round(mastery)}%</span>
          </span>
          <span
            className={`max-w-full truncate ${
              status === "due" ? "font-semibold text-amber-700 dark:text-amber-400" : "text-slate-500 dark:text-zinc-400"
            }`}
          >
            {status === "new" ? "Mới" : row.reviewText}
          </span>
        </span>
      </button>

      {/* A sibling of the card button (not inside it) so toggling never opens the lesson */}
      {!isPractice && (
        <button
          type="button"
          role="switch"
          aria-checked={onPath}
          aria-label="Trên lộ trình"
          title={onPath ? "Trên lộ trình" : "Không học: bài này không có trong lộ trình"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="absolute right-1 top-1.5 flex h-7 w-9 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        >
          <span className={`relative h-4 w-7 rounded-full transition-colors ${onPath ? "bg-cyan-600" : "bg-slate-300 dark:bg-zinc-600"}`}>
            <span
              className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
                onPath ? "translate-x-3" : ""
              }`}
            />
          </span>
        </button>
      )}

      {isNext && (
        <span className="pointer-events-none absolute -top-2 left-3 z-10 inline-flex items-center gap-1 rounded-full bg-cyan-600 px-2 py-0.5 text-[10px] font-bold !text-white shadow-sm">
          <ArrowRight className="h-2.5 w-2.5" strokeWidth={3} />
          Tiếp theo
        </span>
      )}
      {dimmed && (
        <span className="pointer-events-none absolute -top-2 left-3 z-10 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          Không học
        </span>
      )}
    </div>
  );
}

type TenseItem = { id: string; title: string; row: LessonRow };

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-0.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">{children}</span>
      <span className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
    </div>
  );
}

/** Content width (px) from which a tense chapter is drawn as a table */
const TABLE_MIN_WIDTH = 680;

const COLUMN_HEAD =
  "flex items-end justify-center px-1 pb-0.5 text-center text-[11px] font-semibold leading-tight text-slate-500 dark:text-zinc-400";
const ROW_HEAD =
  "flex items-center justify-center rounded-xl bg-slate-100 px-1 text-center text-[11px] font-bold leading-tight text-slate-600 dark:bg-zinc-800/70 dark:text-zinc-300";

/** The lessons of one chapter: the tense table for a tense chapter, a grid of cards otherwise */
function ChapterBody({ rows, renderCard }: { rows: LessonRow[]; renderCard: (row: LessonRow) => ReactNode }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();

  const tense = useMemo(
    () => buildTenseGrid<TenseItem>(rows.map((row) => ({ id: row.lesson.id, title: row.lesson.title, row }))),
    [rows]
  );

  // Layout follows the room the chapter really has (the app sidebar takes some), not the window width
  const plainColumns = width < 440 ? 1 : width < 720 ? 2 : 3;
  const cardGrid = (items: LessonRow[]) => (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${plainColumns}, minmax(0, 1fr))` }}>
      {items.map(renderCard)}
    </div>
  );

  if (rows.length === 0) {
    return <p className="px-1 py-2 text-xs text-slate-500 dark:text-zinc-400">Chương này chưa có bài học.</p>;
  }

  if (!tense) {
    return <div ref={ref}>{cardGrid(rows)}</div>;
  }

  const { cells, near, others } = tense;
  // Four columns of cards need room: below it each row of the table becomes a group of its own
  const asTable = width >= TABLE_MIN_WIDTH;

  return (
    <div ref={ref} className="space-y-4">
      {asTable ? (
        <div className="grid gap-2" style={{ gridTemplateColumns: "3.75rem repeat(4, minmax(0, 1fr))" }}>
          <div aria-hidden="true" />
          {TENSE_COLUMNS.map((col) => (
            <div key={col.aspect} className={COLUMN_HEAD}>
              {col.label}
            </div>
          ))}

          {TENSE_ROWS.map((r) => (
            <Fragment key={r.time}>
              <div className={ROW_HEAD}>{r.label}</div>
              {TENSE_COLUMNS.map((col) => {
                const item = cells.get(`${r.time}:${col.aspect}`);
                return item ? (
                  renderCard(item.row)
                ) : (
                  <div
                    key={col.aspect}
                    aria-hidden="true"
                    className="min-h-[96px] rounded-xl border border-dashed border-slate-200 dark:border-zinc-800"
                  />
                );
              })}
            </Fragment>
          ))}

          {/* "Near future" (be going to) has no cell of its own: it sits right under the future row */}
          {near && (
            <>
              <div className={ROW_HEAD}>Tương lai gần</div>
              {renderCard(near.row)}
            </>
          )}
        </div>
      ) : (
        // Narrow: one group per row of the table, two cards across
        <div className="space-y-3.5">
          {TENSE_ROWS.map((r) => {
            const items = TENSE_COLUMNS.map((col) => cells.get(`${r.time}:${col.aspect}`)).filter(
              (item): item is TenseItem => !!item
            );
            if (r.time === "future" && near) items.push(near);
            if (items.length === 0) return null;
            return (
              <div key={r.time} className="space-y-2">
                <SubHeading>{r.label}</SubHeading>
                <div className="grid grid-cols-2 gap-2">{items.map((item) => renderCard(item.row))}</div>
              </div>
            );
          })}
        </div>
      )}

      {others.length > 0 && (
        <div className="space-y-2">
          <SubHeading>Bài khác</SubHeading>
          {cardGrid(others.map((item) => item.row))}
        </div>
      )}
    </div>
  );
}

/** The chapter that opens by default: the first with lessons still to learn (or the first one) */
function pickDefaultChapter(chapters: GrammarBookFile[]): string | null {
  const first = chapters.find((ch) => (ch.lessons ?? []).some((l) => !isLessonStudied(l.id))) ?? chapters[0];
  return first ? first.chapterId : null;
}

export default function PathPicker({ chapters, onOpenLesson, onPractice, mode: modeProp, onModeChange }: PathPickerProps) {
  const [innerMode, setInnerMode] = useState<PathPickerMode>(modeProp ?? "path");
  const mode = modeProp ?? innerMode;
  const changeMode = (next: PathPickerMode) => {
    setInnerMode(next);
    onModeChange?.(next);
  };

  const [tick, setTick] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  // Chapters the learner opened or closed by hand; the others follow the default
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});
  const [defaultOpen, setDefaultOpen] = useState<string | null>(() => pickDefaultChapter(chapters));

  // The book may arrive after the first render
  useEffect(() => {
    if (defaultOpen === null && chapters.length > 0) setDefaultOpen(pickDefaultChapter(chapters));
  }, [chapters, defaultOpen]);

  // Progress and path changes come through these events
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("myenglish-grammar-updated", bump);
    return () => window.removeEventListener("myenglish-grammar-updated", bump);
  }, []);

  // A practice selection does not outlive practice mode
  useEffect(() => {
    if (mode !== "practice") setPicked(new Set());
  }, [mode]);

  const pathSet = useMemo(() => new Set(getEffectiveLessonIds()), [chapters, tick]);

  const summaries = useMemo(() => {
    // The lessons due now, worked out once for the whole list instead of once per lesson
    const now = new Date();
    const due = new Set(getDueGrammarLessons(now));
    return chapters.map((chapter) => {
      const rows: LessonRow[] = (chapter.lessons ?? []).map((lesson) => {
        const status = lessonStatus(lesson.id, now, due);
        const progress = getLessonProgress(lesson.id);
        return {
          lesson,
          status,
          mastery: progress.mastery,
          reviewText: status === "new" ? null : reviewText(formatNextReviewRelative(progress.nextReviewDate).label),
        };
      });
      return { chapter, rows, studied: rows.filter((r) => r.status !== "new").length };
    });
  }, [chapters, tick]);

  // The first lesson of the path, in book order, that the learner has not met yet
  const nextLessonId = useMemo(() => {
    for (const { rows } of summaries) {
      for (const r of rows) if (r.status === "new" && pathSet.has(r.lesson.id)) return r.lesson.id;
    }
    return null;
  }, [summaries, pathSet]);

  const [pathNote, setPathNote] = useState<string | null>(null);
  const isPractice = mode === "practice";
  const isChecked = (id: string) => (isPractice ? picked.has(id) : pathSet.has(id));

  const toggleLesson = (id: string) => {
    if (!isPractice) {
      setPathNote(toggleLessonSelection(id) ? null : "Lộ trình cần ít nhất một bài.");
      return;
    }
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleChapter = (ids: string[]) => {
    const all = ids.length > 0 && ids.every(isChecked);
    if (!isPractice) {
      void selectChapterLessons(ids, !all).then((ok) => setPathNote(ok ? null : "Lộ trình cần ít nhất một bài."));
      return;
    }
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const pickedInBookOrder = summaries.flatMap((s) => s.rows.map((r) => r.lesson.id)).filter((id) => picked.has(id));

  const renderCard = (row: LessonRow) => (
    <LessonCard
      key={row.lesson.id}
      row={row}
      mode={mode}
      onPath={pathSet.has(row.lesson.id)}
      picked={picked.has(row.lesson.id)}
      isNext={row.lesson.id === nextLessonId}
      onOpen={() => onOpenLesson(row.lesson.id)}
      onToggle={() => toggleLesson(row.lesson.id)}
    />
  );

  return (
    <section className="space-y-4">
      <div className="space-y-1 px-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            {isPractice ? "Luyện theo thì" : "Lộ trình theo sách"}
          </h2>
          {/* Same lessons, two uses: the daily path, or picking tenses to practise */}
          <div role="tablist" aria-label="Chế độ" className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
            {(
              [
                ["path", "Lộ trình"],
                ["practice", "Luyện theo thì"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => changeMode(m)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  mode === m
                    ? "bg-white text-cyan-700 shadow-sm dark:bg-zinc-800 dark:text-cyan-300"
                    : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs leading-relaxed text-slate-500 dark:text-zinc-400">
          {isPractice
            ? "Chọn 1 thì, 2 thì hoặc nhiều thì: app lấy các câu chỉ dùng những thì này."
            : "Bật hoặc tắt bài và chương bạn muốn học trên lộ trình; bài mới đến theo thứ tự sách, mỗi ngày một bài."}
        </p>
        {!isPractice && pathNote && <p className="text-xs text-amber-600 dark:text-amber-400">{pathNote}</p>}
        <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1 pt-1 text-[11px] text-slate-500 dark:text-zinc-400">
          {LEGEND_ORDER.map((s) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${CARD_STYLE[s].dot}`} />
              {STATUS_STYLE[s].label}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        {summaries.map(({ chapter, rows, studied }) => {
          const ids = rows.map((r) => r.lesson.id);
          const isOpen = openOverride[chapter.chapterId] ?? chapter.chapterId === defaultOpen;
          const allChecked = ids.length > 0 && ids.every(isChecked);
          const order = chapter.chapter?.order ?? (parseInt(chapter.chapterId.replace(/\D/g, ""), 10) || 0);
          const titleVn = sentenceCase(chapter.chapter?.titleVn || chapter.chapter?.title || chapter.chapterId);
          const percent = rows.length > 0 ? Math.round((studied / rows.length) * 100) : 0;

          return (
            <div key={chapter.chapterId}>
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenOverride((prev) => ({ ...prev, [chapter.chapterId]: !isOpen }))}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                  >
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`}
                    />
                    <span className="inline-flex h-6 shrink-0 items-center rounded-md bg-cyan-50 px-2 text-xs font-bold text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">
                      Ch.{order}
                    </span>
                    <span className="min-w-0 flex-1 break-words text-sm font-bold leading-snug text-slate-900 dark:text-white">
                      {titleVn}
                    </span>
                  </button>
                  {ids.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleChapter(ids)}
                      className="shrink-0 rounded-lg border border-cyan-200 px-2.5 py-1 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50 dark:border-cyan-900 dark:text-cyan-400 dark:hover:bg-cyan-950/40"
                    >
                      {allChecked ? "Bỏ cả chương" : "Chọn cả chương"}
                    </button>
                  )}
                </div>
                {/* Progress on its own line, so it never competes with the title and the action for width */}
                <div className="flex items-center gap-2 pl-[1.625rem] text-xs text-slate-500 dark:text-zinc-400">
                  <span className="h-1.5 w-full max-w-[14rem] overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800">
                    <span
                      className={`block h-full rounded-full transition-[width] duration-300 ${
                        percent >= 100 ? "bg-emerald-500" : "bg-cyan-500"
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </span>
                  <span className="shrink-0 whitespace-nowrap">
                    {studied}/{rows.length} đã học
                  </span>
                </div>
              </div>

              {isOpen && (
                <div className="mt-2.5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/40 sm:p-3">
                  <ChapterBody rows={rows} renderCard={renderCard} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isPractice && (
        <div className="sticky bottom-2 z-20 flex items-center gap-2 rounded-xl border border-cyan-200 bg-white/95 p-2.5 shadow-lg backdrop-blur dark:border-cyan-900 dark:bg-zinc-900/95">
          <button
            type="button"
            disabled={pickedInBookOrder.length === 0}
            onClick={() => onPractice(pickedInBookOrder)}
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold !text-white transition hover:bg-cyan-500 disabled:opacity-40"
          >
            <Layers className="h-4 w-4 shrink-0" />
            <span className="truncate">Luyện {pickedInBookOrder.length} bài đã chọn</span>
          </button>
          <button
            type="button"
            onClick={() => changeMode("path")}
            className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Huỷ
          </button>
        </div>
      )}
    </section>
  );
}
