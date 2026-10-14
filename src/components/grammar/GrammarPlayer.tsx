import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, ChevronDown, CircleHelp, Clock, Eraser, EyeOff, Flag, Lightbulb, RotateCcw, Undo2, Volume2, XCircle } from "lucide-react";
import {
  availableFormats,
  buildTask,
  checkTask,
  FORMAT_LABELS,
  wrongBlanks,
  type GrammarFormat,
  type GrammarTask,
  type TaskCheck,
  type TaskResponse,
} from "@/services/grammarItems";
import { lessonFormulaText, recordGrammarAnswer, type GrammarSessionMode, type SessionEntry } from "@/services/grammarSession";
import { getBookLesson, hideItem, unhideItem } from "@/services/grammarBook";
import { getLessonNextReview, GRAMMAR_PASS_SCORE } from "@/services/grammarService";
import type { GrammarBookLesson } from "@/types/grammarBook";
import { handleSpeak } from "@/components/review/speech";
import { setMainSessionActive } from "@/services/activeSession";

interface GrammarPlayerProps {
  entries: SessionEntry[];
  mode: GrammarSessionMode;
  title: string;
  /** e.g. the exercise-set instruction */
  subtitle?: string;
  /** Called once when the run ends: after the last question, or early (`early`) from "Kết thúc sớm". Answers the learner marked "tự công nhận" are left out. */
  onFinish: (results: Array<{ entry: SessionEntry; correct: boolean }>, info: { early: boolean }) => void | Promise<void>;
  onExit: () => void;
  /** Opens a lesson's handbook ("Xem lại bài"); without it the link is not shown */
  onOpenLesson?: (lessonId: string) => void;
}

interface RunResult {
  entry: SessionEntry;
  /** Correct and without a hint */
  correct: boolean;
  hinted: boolean;
  /** "Mình thấy đúng": shown as right, but not counted in the score nor sent to onFinish */
  selfAccepted?: boolean;
}

/** What a question reports when the learner moves on */
interface NextResult {
  correct: boolean;
  given: string;
  skipped?: boolean;
  selfAccepted?: boolean;
}

type Outcome = TaskCheck & { skipped?: boolean; selfAccepted?: boolean };
type Tone = "idle" | "ok" | "bad";

/** Formats that are easier than typing or spotting, in the order a hint prefers them */
const EASIER_FORMATS: GrammarFormat[] = ["choice", "pick_sentence", "order"];
const COMBO_SEPARATOR = " … ";
/** "Tính là đúng" is offered only when the typed answer is this close to an accepted one */
const NEAR_MISS_EDITS = 2;

// ---------------------------------------------------------------------------------------------------------
// Small helpers

const LINK_BTN =
  "text-xs font-semibold text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition flex items-center gap-1 disabled:opacity-50";
const PRIMARY_BTN =
  "w-full sm:w-auto px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold shadow-md shadow-cyan-600/20 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-1.5";
const SECONDARY_BTN =
  "px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200 text-sm font-semibold hover:border-slate-300 dark:hover:border-zinc-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5";
const CARD = "rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 sm:p-5 space-y-4";
const LABEL = "text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-zinc-500";

const TONE_BOX: Record<Tone, string> = {
  idle: "border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/60",
  ok: "border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30",
  bad: "border-rose-400 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30",
};

function startingText(given?: string): string {
  const base = (given ?? "").replace(/[\s.…]+$/, "");
  return base ? `${base} ` : "";
}

function initialValues(task: GrammarTask): string[] {
  if (task.format !== "type") return [];
  return task.blanks > 0 ? Array.from({ length: task.blanks }, () => "") : [startingText(task.given)];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The expected answer as one line, the way the feedback shows it (blanks joined, or the whole sentence) */
function expectedAnswerText(task: GrammarTask): string {
  return task.blanks > 0 ? task.answers.map((a) => a[0] ?? "").join(COMBO_SEPARATOR) : task.full;
}

/** Plain edit distance (insert, delete, replace); the inputs are single answers, so the table stays small */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Typed text within a few letters of an accepted answer (case and spaces at the ends ignored); empty never is */
function isNearMiss(typed: string, accepted: string[]): boolean {
  const text = typed.trim().toLowerCase();
  if (!text) return false;
  return accepted.some((a) => {
    const option = a.trim().toLowerCase();
    return option !== "" && editDistance(text, option) <= NEAR_MISS_EDITS;
  });
}

/** A piece of the prompt, with the book's underlined part marked */
function Seg({ text, underline }: { text: string; underline?: string }) {
  if (!underline?.trim()) return <>{text}</>;
  const m = new RegExp(`(^|[^\\w])(${escapeRegExp(underline)})(?![\\w])`).exec(text);
  if (!m) return <>{text}</>;
  const start = m.index + m[1].length;
  return (
    <>
      {text.slice(0, start)}
      <span className="underline decoration-2 underline-offset-4 decoration-cyan-500">{underline}</span>
      {text.slice(start + underline.length)}
    </>
  );
}

/** The prompt text with a custom element in place of each blank; cues after a blank stay as text */
function PromptText({ prompt, underline, renderBlank }: { prompt: string; underline?: string; renderBlank: (index: number) => ReactNode }) {
  const parts = prompt.split(/_{3,}/);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          <Seg text={part} underline={underline} />
          {i < parts.length - 1 && renderBlank(i)}
        </Fragment>
      ))}
    </>
  );
}

const SLOT_TONE: Record<Tone, string> = {
  idle: "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300",
  ok: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
  bad: "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300",
};

function Slot({ tone = "idle", children }: { tone?: Tone; children?: ReactNode }) {
  return (
    <span className={`inline-flex flex-wrap items-center justify-center gap-1 align-middle min-w-[3.5rem] mx-0.5 px-2 py-0.5 rounded-md border-b-2 text-center ${SLOT_TONE[tone]}`}>
      {children ?? "____"}
    </span>
  );
}

function PlayerHeader({
  title,
  subtitle,
  onExit,
  progress,
  badge,
}: {
  title: string;
  subtitle?: string;
  onExit: () => void;
  progress?: { index: number; total: number };
  badge?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <button
          type="button"
          data-own-enter
          onClick={onExit}
          title="Quay lại"
          className="p-1.5 -ml-1.5 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-white truncate" title={title}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 line-clamp-3 break-words" title={subtitle}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {progress && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300">
              Câu {progress.index + 1}/{progress.total}
            </span>
            {badge && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 truncate">
                {badge}
              </span>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-cyan-500 transition-all duration-300"
              style={{ width: `${Math.round(((progress.index + 1) / Math.max(1, progress.total)) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Feedback

function FeedbackRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] font-bold uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-sm leading-relaxed whitespace-pre-line break-words">{children}</div>
    </div>
  );
}

const GIVEN_LABELS: Partial<Record<GrammarFormat, string>> = {
  type: "Bạn viết",
  choice: "Bạn chọn",
  pick_sentence: "Bạn chọn",
  order: "Bạn ghép",
  translate: "Bạn ghép",
  error: "Bạn chạm",
};

function Feedback({
  task,
  outcome,
  hinted,
  canAccept,
  onAccept,
  innerRef,
  lesson,
  onOpenLesson,
}: {
  task: GrammarTask;
  outcome: Outcome;
  hinted: boolean;
  canAccept: boolean;
  onAccept: () => void;
  innerRef: RefObject<HTMLDivElement>;
  /** The lesson of the question: its formulas are shown on a wrong answer */
  lesson: GrammarBookLesson | null;
  onOpenLesson?: (lessonId: string) => void;
}) {
  const ok = outcome.correct;
  const givenLabel = GIVEN_LABELS[task.format];
  const formula = lesson ? lessonFormulaText(lesson) : "";
  const lessonName = lesson ? lesson.titleVn || lesson.title : "";
  return (
    <div
      ref={innerRef}
      className={`rounded-2xl border p-4 space-y-3 animate-in fade-in duration-200 ${
        ok
          ? "bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100"
          : "bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-100"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-base font-bold">
          {ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> : <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />}
          {outcome.selfAccepted
            ? "Mình thấy đúng (không tính điểm)"
            : ok
              ? "Chính xác!"
              : outcome.skipped
                ? "Bạn chưa biết câu này"
                : "Chưa đúng"}
        </span>
        {canAccept && (
          <button
            type="button"
            data-own-enter
            onClick={onAccept}
            className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 hover:underline flex items-center gap-1"
            title="Câu trả lời của bạn gần đúng. Ghi nhận là tự công nhận: không tính điểm và không ảnh hưởng lịch ôn. Xem hoặc xoá ở phần Ngữ pháp, mục công cụ."
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Mình thấy đúng (không tính điểm)
          </button>
        )}
      </div>

      {hinted && <p className="text-xs opacity-80">Bạn đã dùng gợi ý nên câu này sẽ được ôn lại.</p>}

      {!ok && task.format !== "self" && (
        <div className="space-y-1 text-sm break-words">
          {outcome.expected && (
            <p>
              <span className="font-semibold">{task.format === "error" ? "Phần sai" : "Đáp án"}:</span> {outcome.expected}
            </p>
          )}
          {givenLabel && outcome.given.trim() && (
            <p className="opacity-80">
              {givenLabel}: {outcome.given}
            </p>
          )}
        </div>
      )}

      {!ok && (formula || (lesson && onOpenLesson)) && (
        <div className="space-y-2 rounded-xl bg-white/70 dark:bg-black/25 px-3 py-2.5">
          {formula && (
            <div className="space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wide opacity-70">Công thức{lessonName ? ` · ${lessonName}` : ""}</div>
              <p className="text-sm leading-relaxed whitespace-pre-line break-words">{formula}</p>
            </div>
          )}
          {lesson && onOpenLesson && (
            <button
              type="button"
              data-own-enter
              onClick={() => onOpenLesson(lesson.id)}
              className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 hover:underline flex items-center gap-1"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Xem lại bài
            </button>
          )}
        </div>
      )}

      {task.full && (
        <div className="flex items-start justify-between gap-2 rounded-xl bg-white/70 dark:bg-black/25 px-3 py-2">
          <p className="text-sm font-semibold leading-relaxed break-words min-w-0">{task.full}</p>
          <button
            type="button"
            data-own-enter
            onClick={() => handleSpeak(task.full, 0.95)}
            className="p-1 rounded-lg opacity-70 hover:opacity-100 transition shrink-0"
            title="Nghe câu"
          >
            <Volume2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {task.format === "self" && task.item.keyRaw && <FeedbackRow label="Đáp án sách">{task.item.keyRaw}</FeedbackRow>}
      {task.vi && <FeedbackRow label="Dịch (AI)">{task.vi}</FeedbackRow>}
      {task.explain && <FeedbackRow label="Giải thích (AI)">{task.explain}</FeedbackRow>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// One question

/** The set's instruction, word bank and passage above the question (read from the entry: a hint rebuilds the task) */
function QuestionContext({ entry }: { entry: SessionEntry }) {
  const words = entry.wordBank ?? [];
  if (!entry.instruction && words.length === 0 && !entry.passage) return null;
  return (
    <div className="space-y-3">
      {entry.instruction && (
        <p className="rounded-xl bg-cyan-50 dark:bg-cyan-950/40 px-3 py-2 text-sm font-semibold text-cyan-800 dark:text-cyan-200 break-words">{entry.instruction}</p>
      )}
      {entry.passage && <Passage text={entry.passage} />}
      {words.length > 0 && (
        <div className="space-y-1.5">
          <div className={LABEL}>Từ cho sẵn</div>
          <div className="flex flex-wrap gap-1.5">
            {words.map((word, i) => (
              <span
                key={`${word}-${i}`}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-slate-800 dark:text-zinc-100 break-words"
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** The passage the questions are about; it can be folded away while the learner answers */
function Passage({ text }: { text: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 overflow-hidden">
      <button
        type="button"
        data-own-enter
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-slate-600 dark:text-zinc-300"
      >
        <span>Đoạn văn</span>
        <ChevronDown className={`w-4 h-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="px-3 pb-3 text-sm leading-relaxed whitespace-pre-line break-words text-slate-800 dark:text-zinc-100">{text}</p>}
    </div>
  );
}

interface QuestionProps {
  entry: SessionEntry;
  task: GrammarTask;
  hinted: boolean;
  busy: boolean;
  onHint: (task: GrammarTask) => void;
  onNext: (result: NextResult) => void;
  onHide: () => void;
  onFinishEarly: () => void;
  onOpenLesson?: (lessonId: string) => void;
}

function Question({ entry, task, hinted, busy, onHint, onNext, onHide, onFinishEarly, onOpenLesson }: QuestionProps) {
  const [values, setValues] = useState<string[]>(() => initialValues(task));
  const [placed, setPlaced] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confirmHide, setConfirmHide] = useState(false);
  const [lesson, setLesson] = useState<GrammarBookLesson | null>(null);
  const firstField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});

  const answered = outcome !== null;
  const tiles = task.tiles ?? [];
  const isTiles = task.format === "order" || task.format === "translate";
  const isOptions = task.format === "choice" || task.format === "pick_sentence";
  const tone: Tone = !outcome ? "idle" : outcome.correct ? "ok" : "bad";

  // The lesson's formulas and link, only when there is something to review (a wrong answer)
  const lessonId = entry.lessonIds[0] ?? "";
  const reviewing = !!outcome && !outcome.correct;
  useEffect(() => {
    if (!reviewing || !lessonId) return;
    let cancelled = false;
    getBookLesson(lessonId)
      .then((found) => {
        if (!cancelled) setLesson(found);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reviewing, lessonId]);

  useEffect(() => {
    const el = firstField.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    try {
      el.setSelectionRange(end, end);
    } catch {
      // some input types do not support selection
    }
  }, []);

  useEffect(() => {
    if (outcome) feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [outcome !== null]);

  const easierFormat = useMemo(() => {
    if (task.format !== "type" && task.format !== "error") return null;
    const available = availableFormats(task.item, task.setType);
    return EASIER_FORMATS.find((f) => available.includes(f)) ?? null;
  }, [task]);
  const canHint = !answered && !hinted && easierFormat !== null;

  const startText = task.blanks === 0 ? startingText(task.given) : "";
  const emptyAccepted = task.blanks > 0 && task.answers.some((a) => a.some((x) => !x.trim()));
  const typedSomething =
    task.blanks > 0 ? values.some((v) => v.trim()) : !!values[0]?.trim() && values[0].trim() !== startText.trim();
  const canCheck = task.format === "type" ? typedSomething || emptyAccepted : isTiles ? placed.length > 0 : false;

  // Typed blanks that are wrong; after "Mình chưa biết" every blank counts as wrong
  const wrongTyped =
    task.format === "type" && outcome ? (outcome.skipped ? task.answers.map((_, i) => i) : wrongBlanks(task, values)) : [];
  // Offered only for a wrong typed answer that is close to an accepted one, every wrong blank filled in
  const canAccept =
    !!outcome &&
    !outcome.correct &&
    !outcome.skipped &&
    task.format === "type" &&
    wrongTyped.length > 0 &&
    wrongTyped.every((i) => isNearMiss(values[i] ?? "", task.answers[i] ?? []));
  const canGiveUp = !answered && task.format === "type";

  const answerWith = (response: TaskResponse) => {
    if (outcome) return;
    setOutcome(checkTask(task, response));
  };

  const check = () => {
    if (outcome || !canCheck) return;
    if (task.format === "type") answerWith({ kind: "typed", values });
    else if (isTiles) answerWith({ kind: "tiles", tiles: placed.map((i) => tiles[i] ?? "") });
  };

  /** "Mình chưa biết": a miss with the answer shown, whatever is typed */
  const giveUp = () => {
    if (outcome || task.format !== "type") return;
    setConfirmHide(false);
    setOutcome({ correct: false, given: "", expected: expectedAnswerText(task), skipped: true });
  };

  /**
   * "Mình thấy đúng": shown as right for this answer only, not counted (see Run) and not saved as an accepted
   * answer, so the same slip is not graded right next time
   */
  const acceptAsCorrect = () => {
    if (!outcome || !canAccept) return;
    setOutcome({ ...outcome, correct: true, selfAccepted: true });
  };

  const useHint = () => {
    if (!easierFormat) return;
    onHint(buildTask(task.item, task.setType, easierFormat));
  };

  const next = () => {
    if (!outcome || busy) return;
    onNext({ correct: outcome.correct, given: outcome.given, skipped: outcome.skipped, selfAccepted: outcome.selfAccepted });
  };

  const pickOption = (index: number) => {
    if (outcome) return;
    setPicked(index);
    answerWith({ kind: "option", index });
  };

  const pickToken = (index: number) => {
    if (outcome) return;
    setPicked(index);
    answerWith({ kind: "token", index });
  };

  // Always the latest closure, so the window listener is registered once
  keyHandler.current = (e: KeyboardEvent) => {
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target instanceof HTMLElement ? e.target : null;
    const inText = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");

    if (e.key === "Enter") {
      if (e.repeat || el?.closest("[data-own-enter]")) return;
      if (e.shiftKey && inText) return;
      if (answered) {
        e.preventDefault();
        next();
      } else if (task.format === "self" && !revealed) {
        e.preventDefault();
        setRevealed(true);
      } else if (canCheck) {
        e.preventDefault();
        check();
      }
      return;
    }

    if (!answered && isOptions && !inText && /^[1-9]$/.test(e.key)) {
      const index = Number(e.key) - 1;
      if (index < (task.options?.length ?? 0)) {
        e.preventDefault();
        pickOption(index);
      }
    }
  };

  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // --- Pieces -----------------------------------------------------------------------------------------

  const promptClass = "text-base sm:text-lg font-semibold leading-9 text-slate-900 dark:text-white whitespace-pre-line break-words";

  const givenLine = task.given && !(task.format === "type" && task.blanks === 0) && task.format !== "translate" && task.format !== "error" && (
    <p className="text-sm text-slate-600 dark:text-zinc-300">
      Bắt đầu bằng: <span className="font-semibold">{task.given}</span>
    </p>
  );

  const chip = (tile: string, key: string | number, onClick: () => void) => (
    <button
      key={key}
      type="button"
      disabled={answered}
      onClick={onClick}
      className="px-2.5 py-1 rounded-lg bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-200 text-sm font-semibold hover:bg-rose-100 dark:hover:bg-rose-950 disabled:hover:bg-cyan-100 dark:disabled:hover:bg-cyan-950/80 transition break-words"
      title={answered ? undefined : "Bấm để bỏ từ này"}
    >
      {tile}
    </button>
  );

  const placedChips = placed.map((ti, pos) => chip(tiles[ti] ?? "", `${pos}-${ti}`, () => setPlaced((prev) => prev.filter((_, p) => p !== pos))));

  const renderOptionsBody = () => {
    const options = task.options ?? [];
    const short = task.format === "choice" && options.every((o) => o.length <= 24);
    const optionSlot = (i: number) => {
      if (!outcome) return <Slot>____</Slot>;
      const parts = task.blanks === 1 ? [outcome.given] : outcome.given.split(COMBO_SEPARATOR);
      return <Slot tone={tone}>{parts.length === task.blanks && parts[i] ? parts[i] : "____"}</Slot>;
    };
    return (
      <>
        <p className={promptClass}>
          <PromptText prompt={task.prompt} underline={task.underline} renderBlank={optionSlot} />
        </p>
        {givenLine}
        <div className={`grid gap-2.5 ${short ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
          {options.map((option, i) => {
            const isCorrect = i === task.correctOption;
            const isPicked = i === picked;
            let style = "border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 hover:border-cyan-400 dark:hover:border-cyan-700 hover:bg-cyan-50/40 dark:hover:bg-cyan-950/20";
            if (answered) {
              if (isCorrect) style = "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100";
              else if (isPicked) style = "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100";
              else style = "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-400 dark:text-zinc-500";
            }
            return (
              <button
                key={i}
                type="button"
                disabled={answered}
                onClick={() => pickOption(i)}
                className={`p-3 rounded-xl border-2 text-sm font-semibold text-left flex items-start gap-2.5 transition active:scale-[0.99] ${style}`}
              >
                <span className="shrink-0 w-6 h-6 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 text-[11px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="min-w-0 break-words leading-6">{option}</span>
              </button>
            );
          })}
        </div>
      </>
    );
  };

  const renderTypeBody = () => {
    if (task.blanks > 0) {
      return (
        <>
          <p className={promptClass}>
            <PromptText
              prompt={task.prompt}
              underline={task.underline}
              renderBlank={(i) => {
                const state: Tone = !outcome ? "idle" : outcome.selfAccepted || !wrongTyped.includes(i) ? "ok" : "bad";
                const value = values[i] ?? "";
                return (
                  <input
                    type="text"
                    ref={i === 0 ? (firstField as RefObject<HTMLInputElement>) : undefined}
                    readOnly={answered}
                    value={value}
                    onChange={(e) => setValues((prev) => prev.map((v, k) => (k === i ? e.target.value : v)))}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-gramm="false"
                    data-enable-grammarly="false"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    aria-label={`Ô trống ${i + 1}`}
                    style={{ width: `${Math.min(40, Math.max(10, value.length + 3))}ch`, maxWidth: "100%" }}
                    className={`inline-block align-middle h-9 mx-1 px-2 rounded-lg border-2 text-sm font-semibold text-center text-slate-900 dark:text-white bg-white dark:bg-zinc-950 focus:outline-none ${
                      state === "idle"
                        ? "border-slate-300 dark:border-zinc-700 focus:border-cyan-500"
                        : state === "ok"
                          ? "border-emerald-500"
                          : "border-rose-500"
                    }`}
                  />
                );
              }}
            />
          </p>
          {givenLine}
        </>
      );
    }
    return (
      <>
        <p className={promptClass}>
          <Seg text={task.prompt} underline={task.underline} />
        </p>
        <textarea
          ref={firstField as RefObject<HTMLTextAreaElement>}
          readOnly={answered}
          rows={3}
          value={values[0] ?? ""}
          onChange={(e) => setValues([e.target.value])}
          placeholder="Gõ cả câu vào đây..."
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-gramm="false"
          data-enable-grammarly="false"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          aria-label="Câu trả lời"
          className={`w-full px-3 py-2.5 rounded-xl border-2 text-sm font-semibold leading-relaxed text-slate-900 dark:text-white bg-white dark:bg-zinc-950 focus:outline-none resize-none ${
            tone === "idle" ? "border-slate-300 dark:border-zinc-700 focus:border-cyan-500" : tone === "ok" ? "border-emerald-500" : "border-rose-500"
          }`}
        />
        <p className="text-[11px] text-slate-400 dark:text-zinc-500">Enter để kiểm tra · Shift+Enter để xuống dòng</p>
      </>
    );
  };

  const renderTilesBody = () => {
    const intoBlank = !!task.tilesIntoBlank;
    const placedSet = new Set(placed);
    return (
      <>
        {task.format === "translate" && <div className={LABEL}>Dịch sang tiếng Anh</div>}
        {task.format === "order" && <div className={LABEL}>{intoBlank ? "Ghép các từ vào chỗ trống" : "Sắp xếp các từ thành câu đúng"}</div>}
        <p className={promptClass}>
          <PromptText
            prompt={task.prompt}
            underline={task.underline}
            renderBlank={() => (intoBlank ? <Slot tone={tone}>{placed.length > 0 ? placedChips : "____"}</Slot> : <Slot>____</Slot>)}
          />
        </p>
        {givenLine}
        {!intoBlank && (
          <div className={`min-h-[3.25rem] p-2.5 rounded-xl border-2 border-dashed flex flex-wrap items-center gap-1.5 ${TONE_BOX[tone]}`}>
            {placed.length === 0 ? (
              <span className="text-xs italic text-slate-400 dark:text-zinc-500">Chạm vào các từ bên dưới để ghép câu...</span>
            ) : (
              placedChips
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2 justify-center p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800">
          {tiles.map((tile, i) => (
            <button
              key={i}
              type="button"
              disabled={answered || placedSet.has(i)}
              onClick={() => setPlaced((prev) => (prev.includes(i) ? prev : [...prev, i]))}
              className={`px-3 py-1.5 rounded-xl border text-sm font-semibold shadow-sm transition active:scale-95 break-words ${
                placedSet.has(i)
                  ? "border-dashed border-slate-200 dark:border-zinc-800 bg-transparent text-transparent select-none shadow-none"
                  : "border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 hover:border-cyan-400 hover:bg-cyan-50/50 dark:hover:bg-cyan-950/30"
              }`}
            >
              {tile}
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <button type="button" disabled={answered || placed.length === 0} onClick={() => setPlaced([])} className={LINK_BTN}>
            <Eraser className="w-3.5 h-3.5" />
            Xoá
          </button>
        </div>
      </>
    );
  };

  const renderErrorBody = () => {
    const [from, to] = task.errorSpan ?? [-1, -1];
    return (
      <>
        <div className={LABEL}>Chạm vào phần sai trong câu</div>
        <div className="flex flex-wrap gap-1.5">
          {(task.errorTokens ?? []).map((token, i) => {
            const inSpan = i >= from && i <= to;
            let style = "border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 hover:border-cyan-400 hover:bg-cyan-50/50 dark:hover:bg-cyan-950/30";
            if (answered) {
              style = inSpan
                ? "border-rose-500 bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200"
                : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-500 dark:text-zinc-400";
              if (picked === i && !inSpan) style += " ring-2 ring-amber-400";
            }
            return (
              <button
                key={i}
                type="button"
                disabled={answered}
                onClick={() => pickToken(i)}
                className={`px-2.5 py-1.5 rounded-lg border text-base font-semibold transition active:scale-95 break-words ${style}`}
              >
                {token}
              </button>
            );
          })}
        </div>
        {answered && task.errorFix && (
          <p className="text-sm text-slate-700 dark:text-zinc-200">
            Sửa thành: <span className="font-bold text-emerald-600 dark:text-emerald-400">{task.errorFix}</span>
          </p>
        )}
      </>
    );
  };

  const renderSelfBody = () => (
    <>
      <p className={promptClass}>
        <PromptText prompt={task.prompt} underline={task.underline} renderBlank={() => <Slot>____</Slot>} />
      </p>
      {givenLine}
      {!answered && (
        <>
          <p className="text-xs text-slate-500 dark:text-zinc-400">Tự làm câu này, rồi xem đáp án và tự chấm.</p>
          {!revealed ? (
            <button type="button" onClick={() => setRevealed(true)} className={SECONDARY_BTN}>
              Xem đáp án
            </button>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-cyan-200 dark:border-cyan-900/60 bg-cyan-50/70 dark:bg-cyan-950/30 p-3 space-y-1.5">
                {task.full ? (
                  <p className="text-sm font-semibold text-slate-900 dark:text-white break-words">{task.full}</p>
                ) : (
                  !task.item.keyRaw && <p className="text-sm italic text-slate-500 dark:text-zinc-400">Sách không có đáp án mẫu cho câu này.</p>
                )}
                {task.item.keyRaw && (
                  <p className="text-sm text-slate-700 dark:text-zinc-300 break-words whitespace-pre-line">
                    <span className="font-semibold">Đáp án sách:</span> {task.item.keyRaw}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => answerWith({ kind: "self", correct: true })}
                  className="px-4 py-2.5 rounded-xl border-2 border-emerald-500 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-sm font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition"
                >
                  Mình làm đúng
                </button>
                <button
                  type="button"
                  onClick={() => answerWith({ kind: "self", correct: false })}
                  className="px-4 py-2.5 rounded-xl border-2 border-rose-500 text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 text-sm font-bold hover:bg-rose-100 dark:hover:bg-rose-950/50 transition"
                >
                  Mình làm sai
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );

  let body: ReactNode;
  if (isOptions) body = renderOptionsBody();
  else if (task.format === "type") body = renderTypeBody();
  else if (isTiles) body = renderTilesBody();
  else if (task.format === "error") body = renderErrorBody();
  else body = renderSelfBody();

  const showCheck = !answered && (task.format === "type" || isTiles);

  return (
    <div className="space-y-4">
      <QuestionContext entry={entry} />
      <div className={CARD}>{body}</div>

      {outcome && (
        <Feedback
          task={task}
          outcome={outcome}
          hinted={hinted}
          canAccept={canAccept}
          onAccept={acceptAsCorrect}
          innerRef={feedbackRef}
          lesson={lesson}
          onOpenLesson={onOpenLesson}
        />
      )}

      {confirmHide && !answered && (
        <div role="group" aria-label="Xác nhận ẩn câu" className="flex flex-col gap-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-rose-900 dark:text-rose-200">Ẩn câu này khỏi bài tập và ôn tập? Bạn có thể hoàn tác ngay sau đó.</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" data-own-enter disabled={busy} onClick={onHide} className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition disabled:opacity-50">
              Ẩn câu này
            </button>
            <button type="button" data-own-enter onClick={() => setConfirmHide(false)} className={SECONDARY_BTN + " !py-1.5 !text-xs"}>
              Thôi
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {canHint && (
            <button
              type="button"
              data-own-enter
              onClick={useHint}
              className="px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-50 dark:hover:bg-amber-950/30 transition flex items-center gap-1"
              title="Chuyển sang dạng dễ hơn (câu này sẽ được ôn lại)"
            >
              <Lightbulb className="w-3.5 h-3.5" />
              Gợi ý
            </button>
          )}
          {canGiveUp && (
            <button
              type="button"
              data-own-enter
              disabled={busy}
              onClick={giveUp}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 transition flex items-center gap-1 disabled:opacity-50"
              title="Xem đáp án của câu này (tính là sai)"
            >
              <CircleHelp className="w-3.5 h-3.5" />
              Mình chưa biết — xem đáp án
            </button>
          )}
          {!confirmHide && (
            <button
              type="button"
              data-own-enter
              disabled={busy}
              onClick={() => setConfirmHide(true)}
              className={LINK_BTN}
              title="Ẩn câu này khỏi bài tập và ôn tập"
            >
              <EyeOff className="w-3 h-3" />
              Ẩn câu này (dữ liệu lỗi)
            </button>
          )}
          <button type="button" data-own-enter disabled={busy} onClick={onFinishEarly} className={LINK_BTN} title="Dừng ở đây và xem kết quả các câu đã làm">
            <Flag className="w-3 h-3" />
            Kết thúc sớm
          </button>
        </div>
        {answered ? (
          <button type="button" disabled={busy} onClick={next} className={PRIMARY_BTN}>
            Tiếp tục ↵
          </button>
        ) : showCheck ? (
          <button type="button" disabled={!canCheck} onClick={check} className={PRIMARY_BTN}>
            Kiểm tra
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// A run through a list of entries

interface RunProps {
  entries: SessionEntry[];
  mode: GrammarSessionMode;
  title: string;
  subtitle?: string;
  onExit: () => void;
  onComplete: (results: RunResult[], early: boolean) => void | Promise<void>;
  onOpenLesson?: (lessonId: string) => void;
}

function Run({ entries, mode, title, subtitle, onExit, onComplete, onOpenLesson }: RunProps) {
  // Hidden questions leave the queue at once; "Hoàn tác" puts the last one back right after the current question
  const [queue, setQueue] = useState<SessionEntry[]>(entries);
  const [index, setIndex] = useState(0);
  // Bumped whenever the question changes, so the question's own state (typed text, feedback) starts fresh
  const [step, setStep] = useState(0);
  const [hintTask, setHintTask] = useState<GrammarTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<SessionEntry | null>(null);
  const busyRef = useRef(false);
  const resultsRef = useRef<RunResult[]>([]);
  // The reminder popup must not open over this run and ask the same lessons (the flashcard sessions' flag;
  // refreshed on each answer, it goes stale by itself if the window is left)
  useEffect(() => {
    setMainSessionActive(true);
    return () => setMainSessionActive(false);
  }, []);

  const entry = queue[index];
  // Never reached in practice (the run ends before the index passes the queue); kept so a render cannot crash
  if (!entry) return null;
  const task = hintTask ?? entry.task;

  const guarded = async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const finish = async (early: boolean) => {
    await onComplete([...resultsRef.current], early);
  };

  const advance = async () => {
    if (index + 1 >= queue.length) {
      await finish(false);
      return;
    }
    setHintTask(null);
    setUndo(null);
    setStep((s) => s + 1);
    setIndex(index + 1);
  };

  const handleNext = ({ correct, given, skipped, selfAccepted }: NextResult) =>
    guarded(async () => {
      const hinted = hintTask !== null;
      setMainSessionActive(true);
      try {
        await recordGrammarAnswer({ ...entry, task }, correct, { mode, hinted, given, skipped, selfAccepted });
      } catch (err) {
        console.warn("[GrammarPlayer] could not record the answer", err);
      }
      resultsRef.current.push({ entry, correct: correct && !hinted, hinted, selfAccepted });
      await advance();
    });

  const handleHide = () =>
    guarded(async () => {
      const hidden = entry;
      hideItem(hidden.task.itemKey);
      const rest = queue.filter((_, k) => k !== index);
      // Hiding the last question ends the run: the queue stays as it is until the summary replaces this screen
      if (index >= rest.length) {
        await finish(false);
        return;
      }
      setQueue(rest);
      setHintTask(null);
      setUndo(hidden);
      setStep((s) => s + 1);
    });

  const undoHide = () => {
    if (!undo) return;
    unhideItem(undo.task.itemKey);
    setQueue((q) => [...q.slice(0, index + 1), undo, ...q.slice(index + 1)]);
    setUndo(null);
  };

  const finishEarly = () => {
    if (busyRef.current) return;
    // Nothing answered yet: there is no result to show, just leave
    if (resultsRef.current.length === 0) {
      onExit();
      return;
    }
    void guarded(async () => {
      await finish(true);
    });
  };

  return (
    <div className="max-w-2xl mx-auto w-full space-y-4 pb-6">
      <PlayerHeader
        title={title}
        subtitle={subtitle}
        onExit={onExit}
        progress={{ index, total: queue.length }}
        badge={FORMAT_LABELS[task.format]}
      />
      {undo && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900/60 px-3 py-2">
          <span className="text-xs text-slate-600 dark:text-zinc-300">Đã ẩn câu trước. Hoàn tác nếu bạn ẩn nhầm.</span>
          <button
            type="button"
            data-own-enter
            onClick={undoHide}
            className="flex items-center gap-1 text-xs font-bold text-cyan-700 dark:text-cyan-300 hover:underline"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Hoàn tác
          </button>
        </div>
      )}
      <Question
        key={`${step}:${hintTask ? "hint" : "plain"}`}
        entry={entry}
        task={task}
        hinted={hintTask !== null}
        busy={busy}
        onHint={setHintTask}
        onNext={handleNext}
        onHide={handleHide}
        onFinishEarly={finishEarly}
        onOpenLesson={onOpenLesson}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Summary and empty state

function EmptyState({ title, subtitle, onExit }: { title: string; subtitle?: string; onExit: () => void }) {
  return (
    <div className="max-w-2xl mx-auto w-full space-y-4">
      <PlayerHeader title={title} subtitle={subtitle} onExit={onExit} />
      <div className={`${CARD} text-center`}>
        <p className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Chưa có câu nào phù hợp</p>
        <button type="button" onClick={onExit} className={`${PRIMARY_BTN} sm:w-auto mx-auto`}>
          Đóng
        </button>
      </div>
    </div>
  );
}

function Summary({
  results,
  title,
  retry,
  early,
  onRetry,
  onExit,
  onOpenLesson,
}: {
  results: RunResult[];
  title: string;
  retry: boolean;
  early: boolean;
  onRetry: () => void;
  onExit: () => void;
  onOpenLesson?: (lessonId: string) => void;
}) {
  // Answers the learner marked "tự công nhận" are noted but never counted
  const scored = results.filter((r) => !r.selfAccepted);
  const selfCount = results.length - scored.length;
  const correctCount = scored.filter((r) => r.correct).length;
  const percent = scored.length > 0 ? Math.round((correctCount / scored.length) * 100) : null;
  const missed = scored.filter((r) => !r.correct);
  const scoreColor =
    percent === null
      ? "text-slate-400 dark:text-zinc-500"
      : percent >= 80
        ? "text-emerald-600 dark:text-emerald-400"
        : percent >= 50
          ? "text-amber-600 dark:text-amber-400"
          : "text-rose-600 dark:text-rose-400";

  // The soonest review among the lessons this run used ("Ôn lại sau X ngày")
  const lessonIds = [...new Set(results.flatMap((r) => r.entry.lessonIds))];
  const reviews = lessonIds.map((id) => getLessonNextReview(id)).filter((r): r is { date: Date; days: number } => r !== null);
  const soonestDays = reviews.length > 0 ? Math.min(...reviews.map((r) => r.days)) : null;
  // The lesson to read again: the first one with a missed answer
  const focusLesson = missed[0]?.entry.lessonIds[0] ?? lessonIds[0];

  return (
    <div className="max-w-2xl mx-auto w-full space-y-4 pb-6">
      <PlayerHeader title={retry ? `${title} · Làm lại câu sai` : title} onExit={onExit} />
      <div className={`${CARD} text-center`}>
        <div className={`text-5xl font-extrabold tabular-nums ${scoreColor}`}>{percent === null ? "—" : `${percent}%`}</div>
        <p className="text-sm text-slate-600 dark:text-zinc-300">
          {percent === null ? "Chưa có câu nào được tính điểm" : `${correctCount}/${scored.length} câu đúng`}
        </p>
        {early && <p className="text-xs text-slate-500 dark:text-zinc-400">Bạn đã kết thúc sớm, nên chưa làm hết các câu.</p>}
        {selfCount > 0 && <p className="text-xs text-slate-500 dark:text-zinc-400">{selfCount} câu bạn tự công nhận, không tính điểm.</p>}
        {soonestDays !== null && (
          <p className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
            <Clock className="w-3.5 h-3.5" />
            {soonestDays <= 0 ? "Ôn lại hôm nay" : `Ôn lại sau ${soonestDays} ngày`}
          </p>
        )}
      </div>

      {percent !== null && percent < GRAMMAR_PASS_SCORE && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-amber-900 dark:text-amber-200">Nên đọc lại phần lý thuyết trước khi làm tiếp.</p>
          {onOpenLesson && focusLesson && (
            <button type="button" onClick={() => onOpenLesson(focusLesson)} className={`${SECONDARY_BTN} sm:w-auto shrink-0`}>
              <BookOpen className="w-4 h-4" />
              Đọc lại bài
            </button>
          )}
        </div>
      )}

      {missed.length > 0 && (
        <div className={CARD}>
          <div className={LABEL}>Câu cần xem lại ({missed.length})</div>
          <ul className="space-y-2">
            {missed.map((r, i) => (
              <li
                key={`${r.entry.task.itemKey}-${i}`}
                className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 px-3 py-2 text-sm text-slate-800 dark:text-zinc-100 break-words"
              >
                {r.entry.task.full || r.entry.task.prompt}
                {r.hinted && <span className="ml-2 text-[11px] text-amber-600 dark:text-amber-400">(dùng gợi ý)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end">
        {missed.length > 0 && (
          <button type="button" onClick={onRetry} className={`${SECONDARY_BTN} sm:w-auto`}>
            <RotateCcw className="w-4 h-4" />
            Làm lại câu sai
          </button>
        )}
        <button type="button" onClick={onExit} className={PRIMARY_BTN}>
          Đóng
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------

export default function GrammarPlayer({ entries, mode, title, subtitle, onFinish, onExit, onOpenLesson }: GrammarPlayerProps) {
  const [run, setRun] = useState<{ id: number; entries: SessionEntry[]; retry: boolean }>({ id: 0, entries, retry: false });
  const [summary, setSummary] = useState<{ results: RunResult[]; early: boolean } | null>(null);
  const finishedRef = useRef(false);

  // Start over only when the parent really hands over different questions, not on a new array identity
  const signature = useMemo(() => entries.map((e) => `${e.task.itemKey}:${e.task.format}`).join("|"), [entries]);
  const lastSignature = useRef(signature);
  useEffect(() => {
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    finishedRef.current = false;
    setSummary(null);
    setRun((prev) => ({ id: prev.id + 1, entries, retry: false }));
  }, [signature, entries]);

  const handleComplete = async (results: RunResult[], early: boolean) => {
    if (!run.retry && !finishedRef.current) {
      finishedRef.current = true;
      try {
        // Answers the learner marked "tự công nhận" never reach the caller
        await onFinish(
          results.filter((r) => !r.selfAccepted).map(({ entry, correct }) => ({ entry, correct })),
          { early }
        );
      } catch (err) {
        console.warn("[GrammarPlayer] onFinish failed", err);
      }
    }
    setSummary({ results, early });
  };

  const retryMissed = () => {
    if (!summary) return;
    const missed = summary.results
      .filter((r) => !r.correct)
      .map(({ entry }) => ({ ...entry, task: buildTask(entry.task.item, entry.task.setType, entry.task.format) }));
    if (missed.length === 0) return;
    setSummary(null);
    setRun((prev) => ({ id: prev.id + 1, entries: missed, retry: true }));
  };

  if (run.entries.length === 0 || (summary && summary.results.length === 0)) {
    return <EmptyState title={title} subtitle={subtitle} onExit={onExit} />;
  }

  if (summary) {
    return (
      <Summary
        results={summary.results}
        early={summary.early}
        title={title}
        retry={run.retry}
        onRetry={retryMissed}
        onExit={onExit}
        onOpenLesson={onOpenLesson}
      />
    );
  }

  return (
    <Run
      key={run.id}
      entries={run.entries}
      mode={run.retry ? "retry" : mode}
      title={run.retry ? `${title} · Làm lại câu sai` : title}
      subtitle={subtitle}
      onExit={onExit}
      onComplete={handleComplete}
      onOpenLesson={onOpenLesson}
    />
  );
}
