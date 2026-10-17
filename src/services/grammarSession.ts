import type { GrammarBookExerciseSet, GrammarBookFile, GrammarBookItem, GrammarBookLesson, GrammarExerciseSetType } from "@/types/grammarBook";
import type { GrammarExercise, GrammarLesson } from "@/types/grammar";
import { bookItemKey, getAcceptedAnswersRevision, getAllBookChapters, getHiddenItemsRevision, getHiddenItemsSet } from "./grammarBook";
import {
  availableFormats,
  buildTask,
  formatForLevel,
  getItemReviewLevel,
  isSelfGraded,
  ladderTask,
  nativeFormat,
  readItemLevels,
  updateItemReviewLevel,
  type GrammarFormat,
  type GrammarTask,
} from "./grammarItems";
import {
  getDueGrammarLessons,
  getGrammarExerciseCooldownHours,
  getGrammarExerciseHistoryMap,
  getLessonProgress,
  isLessonMastered,
  markLessonIntroduced,
  MIN_LESSON_ANSWERS,
  poolLessonAnswer,
  recordDiagnosticResult,
  recordGrammarExerciseAttempt,
  recordPracticeResult,
  setLessonsWithoutExercises,
  type GrammarExerciseHistory,
} from "./grammarService";
import { getEffectiveLessonIds, isLessonStudied, recordLessonIntroDay } from "./grammarPath";
import { logLearningEvent } from "./learningEvents";
import { saveMistakes } from "./mistakes";
import type { MistakeCategory } from "./ai";
import { persistKeyNow } from "./storageBackup";
import { recordDailyActivity } from "./streak";
import { translateInstructionToVn } from "@/utils/grammarTranslations";

/**
 * Grammar sessions built from the imported book:
 *  - learn:    a new lesson's quick check right after reading its handbook (graded once, schedules the lesson)
 *  - book:     one of the book's exercise sets (I, II…) in its own format, as in the book
 *  - review:   the lessons due today (FSRS), questions chosen by their own history, format by ladder
 *  - practice: "luyện theo thì": the questions that use only the lessons the learner picked; not graded
 *  - popup:    a few review questions of studied lessons mixed with vocabulary (new lessons are learnt in the hub)
 *  - retry:    missed questions again right after a session (answer just seen): nothing is recorded
 * A question is usable once every lesson it uses has been studied (or is the lesson being learnt). A lesson
 * with no question at all is read, then marked as studied (markLessonRead).
 */

export type GrammarSessionMode = "learn" | "book" | "review" | "practice" | "popup" | "retry";

export interface SessionEntry {
  task: GrammarTask;
  /** Lessons the question uses (its practice group) */
  lessonIds: string[];
  setId?: string;
  /** No longer set: the popup does not introduce lessons any more (kept for the popup's types) */
  intro?: boolean;
  /** The exercise set's instruction, in Vietnamese where it is known */
  instruction?: string;
  /** The set's words to choose from ("điền từ trong khung") */
  wordBank?: string[];
  /** The set's text the questions are about ("dựa vào đoạn văn") */
  passage?: string;
  /** Popup: shown in an easier format than the item's ladder level (choice for an error/translate item), so a
   *  right answer does not lift the item past that format */
  belowLevel?: boolean;
}

interface IndexedItem {
  item: GrammarBookItem;
  key: string;
  setType: GrammarExerciseSetType;
  set?: GrammarBookExerciseSet;
  lessonIds: string[];
  /** No reliable key: only the learner can mark it (never in quick checks or reviews) */
  selfGraded: boolean;
  /** Position in the book: chapter, set, number */
  order: number;
}

interface BookIndex {
  lessons: GrammarBookLesson[];
  lessonById: Map<string, GrammarBookLesson>;
  chapterOfLesson: Map<string, string>;
  setById: Map<string, GrammarBookExerciseSet>;
  items: IndexedItem[];
}

/**
 * The index of the book, kept until something it was built from changes: the loaded book (a new array each
 * time it is reloaded), the hidden items, or the answers the learner accepted (they decide what is self-graded).
 */
let indexCache: { chapters: GrammarBookFile[]; hidden: string; accepted: string; index: BookIndex } | null = null;

export async function loadBookIndex(): Promise<BookIndex> {
  const chapters = await getAllBookChapters();
  const hiddenRevision = getHiddenItemsRevision();
  const acceptedRevision = getAcceptedAnswersRevision();
  if (indexCache && indexCache.chapters === chapters && indexCache.hidden === hiddenRevision && indexCache.accepted === acceptedRevision) {
    return indexCache.index;
  }
  const index = buildBookIndex(chapters);
  // A book that could not be read comes back empty each time and is never kept
  if (chapters.length > 0) indexCache = { chapters, hidden: hiddenRevision, accepted: acceptedRevision, index };
  return index;
}

function buildBookIndex(chapters: GrammarBookFile[]): BookIndex {
  const hidden = getHiddenItemsSet();
  const lessons: GrammarBookLesson[] = [];
  const chapterOfLesson = new Map<string, string>();
  const setById = new Map<string, GrammarBookExerciseSet>();
  const items: IndexedItem[] = [];
  chapters.forEach((ch, ci) => {
    for (const l of ch.lessons || []) {
      lessons.push(l);
      chapterOfLesson.set(l.id, ch.chapterId);
    }
    const setOrder = new Map<string, number>();
    (ch.exerciseSets || []).forEach((s, si) => {
      setById.set(s.id, s);
      setOrder.set(s.id, si);
    });
    for (const g of ch.practiceGroups || []) {
      for (const item of g.items) {
        const key = bookItemKey(item);
        if (hidden.has(key)) continue;
        const set = item.setId ? setById.get(item.setId) : undefined;
        const setType = set?.type ?? "fill_blank";
        items.push({
          item,
          key,
          setType,
          set,
          lessonIds: item.lessonIds?.length ? item.lessonIds : g.lessonIds,
          selfGraded: isSelfGraded(item, setType),
          order: ci * 1_000_000 + (setOrder.get(item.setId ?? "") ?? 999) * 1000 + item.n,
        });
      }
    }
  });
  items.sort((a, b) => a.order - b.order);
  // Lessons with no question to learn or review them with are never due
  const learnable = new Set(items.filter((it) => !it.selfGraded).flatMap((it) => it.lessonIds));
  setLessonsWithoutExercises(lessons.map((l) => l.id).filter((id) => !learnable.has(id)));
  return { lessons, lessonById: new Map(lessons.map((l) => [l.id, l])), chapterOfLesson, setById, items };
}

/** Priority of a question for review: never seen, or missed and out of its cooldown, comes first */
export function itemPriority(history: GrammarExerciseHistory | undefined, now: number): number {
  if (!history || history.attempts === 0) return 20;
  const streak = history.consecutiveCorrect ?? 0;
  const hours = (now - new Date(history.lastAttempt).getTime()) / 3_600_000;
  const cooldown = getGrammarExerciseCooldownHours(streak);
  if (hours < cooldown) return -100;
  let score = (history.incorrect / Math.max(1, history.attempts * (streak + 1))) * 35;
  if (history.incorrect > 0 && streak === 0) score += 10;
  if (streak > 0) score += Math.min(2, hours / cooldown) * 5;
  return score;
}

/** What the question's exercise set gives it: the instruction (in Vietnamese), the word box, the passage */
function setInfo(it: IndexedItem): Pick<SessionEntry, "instruction" | "wordBank" | "passage"> {
  const out: Pick<SessionEntry, "instruction" | "wordBank" | "passage"> = {};
  const set = it.set;
  if (!set) return out;
  const instruction = set.instruction?.trim() ? translateInstructionToVn(set.instruction) : "";
  if (instruction) out.instruction = instruction;
  const words = (set.wordBank ?? []).map((w) => String(w ?? "").trim()).filter(Boolean);
  if (words.length > 0) out.wordBank = words;
  if (set.passage?.trim()) out.passage = set.passage.trim();
  return out;
}

function entry(it: IndexedItem, task: GrammarTask, extra: Partial<SessionEntry> = {}): SessionEntry {
  const info = setInfo(it);
  return { task: { ...task, ...info }, lessonIds: it.lessonIds, setId: it.item.setId, ...info, ...extra };
}

/** Spread picks over the whole list (different sets and situations instead of the first N) */
function spread<T>(list: T[], count: number): T[] {
  if (list.length <= count) return [...list];
  const step = list.length / count;
  return Array.from({ length: count }, (_, i) => list[Math.floor(i * step + step / 2)]);
}

/**
 * Quick check of a new lesson: questions that use this lesson and only lessons already studied, single-lesson
 * ones first. The first ones are recognition (choose / arrange), the last ones production (type).
 * A lesson with no question of its own may use mixed ones even when the other lesson is not studied yet
 * (two lessons that only share mixed questions would otherwise wait for each other forever).
 */
export async function buildLearnSession(lessonId: string, size = 8, random: () => number = Math.random): Promise<SessionEntry[]> {
  const index = await loadBookIndex();
  const learnable = (it: IndexedItem) => it.lessonIds.includes(lessonId) && !it.selfGraded;
  const solo = index.items.filter((it) => learnable(it) && it.lessonIds.length === 1);
  const studiedMemo = new Map<string, boolean>();
  const studiedOnce = (id: string) => {
    let v = studiedMemo.get(id);
    if (v === undefined) studiedMemo.set(id, (v = isLessonStudied(id)));
    return v;
  };
  const othersStudied = (it: IndexedItem) => it.lessonIds.every((id) => id === lessonId || studiedOnce(id));
  const mixed = index.items.filter((it) => learnable(it) && it.lessonIds.length > 1 && (solo.length === 0 || othersStudied(it)));
  const picked = [...spread(solo, size), ...spread(mixed, Math.max(0, size - solo.length))].slice(0, size);
  const production = Math.min(3, Math.floor(picked.length / 3));
  return picked.map((it, i) => {
    const level = i >= picked.length - production ? 2 : 0;
    return entry(it, buildTask(it.item, it.setType, formatForLevel(it.item, it.setType, level), random));
  });
}

/** A lesson that has at least one question to learn it with (otherwise it is read and marked with markLessonRead) */
export async function lessonHasExercises(lessonId: string): Promise<boolean> {
  const index = await loadBookIndex();
  return index.items.some((it) => !it.selfGraded && it.lessonIds.includes(lessonId));
}

/**
 * A lesson with no question (theory only): reading it counts as learning it. It is studied from now on and
 * the path goes on; with nothing to review it with, it is never due. Returns false when it was studied already.
 */
export function markLessonRead(lessonId: string, now: Date = new Date()): boolean {
  if (isLessonStudied(lessonId)) return false;
  markLessonIntroduced(lessonId);
  recordLessonIntroDay(lessonId, now);
  logLearningEvent("grammar_intro", { meta: { lessonId, read: true } }).catch(() => {});
  try {
    window.dispatchEvent(new CustomEvent("myenglish-grammar-updated", { detail: { lessonId } }));
  } catch {}
  return true;
}

/** Questions in one lesson's exercise session: enough to practise, short enough to finish */
export const LESSON_SESSION_MAX = 20;

/** At most `limit` items in their order, each kind of exercise (set type) getting its share before the rest */
function varied(ranked: IndexedItem[], limit: number): IndexedItem[] {
  if (ranked.length <= limit) return ranked;
  const share = Math.ceil(limit / new Set(ranked.map((it) => it.setType)).size);
  const perKind = new Map<string, number>();
  const picked = new Set<IndexedItem>();
  for (const it of ranked) {
    if (picked.size >= limit) break;
    const n = perKind.get(it.setType) ?? 0;
    if (n >= share) continue;
    picked.add(it);
    perKind.set(it.setType, n + 1);
  }
  for (const it of ranked) {
    if (picked.size >= limit) break;
    picked.add(it);
  }
  return ranked.filter((it) => picked.has(it));
}

/**
 * The exercises of one lesson (tab "Bài tập"): the questions that use this lesson and no other, questions
 * never seen or missed first, then by their place in the book, at most LESSON_SESSION_MAX of them with the
 * kinds of exercise mixed; format from the item's ladder. Answers count as reviews once the lesson is studied
 * (see lessonExerciseMode).
 */
export async function buildLessonExerciseSession(
  lessonId: string,
  now: Date = new Date(),
  random: () => number = Math.random,
  limit: number = LESSON_SESSION_MAX
): Promise<SessionEntry[]> {
  const index = await loadBookIndex();
  const history = getGrammarExerciseHistoryMap();
  const t = now.getTime();
  const ranked = index.items
    .filter((it) => it.lessonIds.length === 1 && it.lessonIds[0] === lessonId)
    .map((it) => ({ it, score: itemPriority(history[it.key], t) }))
    .sort((a, b) => b.score - a.score || a.it.order - b.it.order)
    .map(({ it }) => it);
  return varied(ranked, limit).map((it) => entry(it, ladderTask(it.item, it.setType, random)));
}

/** A studied lesson's exercises are pooled into its FSRS grade like any review; before that they are practice */
export function lessonExerciseMode(lessonId: string): GrammarSessionMode {
  return isLessonStudied(lessonId) ? "review" : "practice";
}

/** One exercise set of the book, in its order and format ("Bài tập theo sách") */
export async function buildBookSetSession(setId: string, random: () => number = Math.random): Promise<SessionEntry[]> {
  const index = await loadBookIndex();
  return index.items
    .filter((it) => it.item.setId === setId)
    .map((it) => entry(it, buildTask(it.item, it.setType, nativeFormat(it.item, it.setType), random)));
}

/** The lessons on the path that have been studied */
function studiedPathLessons(index: BookIndex): Set<string> {
  return new Set(getEffectiveLessonIds(index.lessons.map((l) => l.id)).filter((id) => isLessonStudied(id)));
}

/**
 * Review of the due lessons: only as many lessons as the session can grade, MIN_LESSON_ANSWERS questions each
 * (12 questions: 4 lessons), most overdue first; the other due lessons wait for the next session. Then more
 * questions of those lessons by priority. Only questions whose lessons are all studied; format from the ladder.
 */
export async function buildReviewSession(size = 12, now: Date = new Date(), random: () => number = Math.random): Promise<SessionEntry[]> {
  const index = await loadBookIndex();
  const studied = studiedPathLessons(index);
  const due = getDueGrammarLessons(now).filter((id) => studied.has(id));
  if (due.length === 0) return [];
  const dueSet = new Set(due);
  const history = getGrammarExerciseHistoryMap();
  const t = now.getTime();
  const candidates = index.items
    .filter((it) => !it.selfGraded && it.lessonIds.every((id) => studied.has(id)) && it.lessonIds.some((id) => dueSet.has(id)))
    .map((it) => ({ it, score: itemPriority(history[it.key], t) + (random() - 0.5) * 6 }))
    .sort((a, b) => b.score - a.score);

  const dueAtMap = new Map<string, number>();
  const availableMap = new Map<string, number>();
  for (const id of due) {
    dueAtMap.set(id, new Date(getLessonProgress(id).nextReviewDate).getTime() || 0);
    availableMap.set(id, 0);
  }
  for (const c of candidates) {
    for (const id of c.it.lessonIds) {
      if (availableMap.has(id)) {
        availableMap.set(id, (availableMap.get(id) ?? 0) + 1);
      }
    }
  }
  const dueAt = (id: string) => dueAtMap.get(id) ?? 0;
  const available = (id: string) => availableMap.get(id) ?? 0;
  const ordered = [...due].sort((a, b) => dueAt(a) - dueAt(b));
  // Lessons with enough questions to be graded come first; one with only 1–2 questions still gets reviewed
  const gradable = ordered.filter((id) => available(id) >= MIN_LESSON_ANSWERS);
  const short = ordered.filter((id) => available(id) > 0 && available(id) < MIN_LESSON_ANSWERS);
  const chosen = [...gradable, ...short].slice(0, Math.max(1, Math.floor(size / MIN_LESSON_ANSWERS)));
  const chosenSet = new Set(chosen);
  // Questions of the lessons left for later stay out (they would give those lessons too few answers)
  const pool = candidates.filter((c) => c.it.lessonIds.every((id) => !dueSet.has(id) || chosenSet.has(id)));
  return pickBalanced(pool, chosen, size).map((it) => entry(it, ladderTask(it.item, it.setType, random)));
}

function pickBalanced(candidates: Array<{ it: IndexedItem; score: number }>, lessons: string[], size: number): IndexedItem[] {
  const picked: IndexedItem[] = [];
  const used = new Set<string>();
  for (const lessonId of lessons) {
    // A mixed question picked for an earlier lesson counts for this one too
    let n = picked.filter((it) => it.lessonIds.includes(lessonId)).length;
    for (const c of candidates) {
      if (picked.length >= size || n >= MIN_LESSON_ANSWERS) break;
      if (used.has(c.it.key) || !c.it.lessonIds.includes(lessonId)) continue;
      picked.push(c.it);
      used.add(c.it.key);
      n++;
    }
  }
  for (const c of candidates) {
    if (picked.length >= size) break;
    if (!used.has(c.it.key)) {
      picked.push(c.it);
      used.add(c.it.key);
    }
  }
  return picked;
}

/** "Luyện theo thì": questions using only the picked lessons (any of them), by priority, format by ladder */
export async function buildPracticeSession(lessonIds: string[], size = 15, now: Date = new Date(), random: () => number = Math.random): Promise<SessionEntry[]> {
  const index = await loadBookIndex();
  const chosen = new Set(lessonIds);
  const history = getGrammarExerciseHistoryMap();
  const t = now.getTime();
  const candidates = index.items
    .filter((it) => it.lessonIds.length > 0 && it.lessonIds.every((id) => chosen.has(id)))
    .filter((it) => !it.selfGraded)
    .map((it) => ({ it, score: itemPriority(history[it.key], t) + (random() - 0.5) * 6 }))
    .sort((a, b) => b.score - a.score);
  return pickBalanced(candidates, lessonIds, size).map((it) => entry(it, ladderTask(it.item, it.setType, random)));
}

// ---------------------------------------------------------------------------------------------------------
// Recording answers

function mistakeCategory(chapterId: string | undefined): MistakeCategory {
  if (chapterId === "ch01" || chapterId === "ch02") return "tense";
  if (chapterId === "ch24") return "article";
  if (chapterId === "ch22") return "preposition";
  if (chapterId === "ch25") return "word_form";
  return "other";
}

/**
 * One answer (the first one given to the question in this session).
 *  - every mode: the question's history (cooldown, priority) and its ladder level (a hint counts as a miss)
 *  - skipped ("Mình chưa biết"): a miss, whatever `correct` says
 *  - selfAccepted ("Tính là đúng"): shown as right, but the ladder stays and the lesson grade never sees it;
 *    for the question's history it is not a success (it comes back soon)
 *  - review / popup: pooled into each of its studied lessons; LESSON_GRADE_ANSWERS answers grade the lesson (FSRS)
 *  - learn and book are graded when the session ends
 *  - outside the popup (which counts its own) the answer counts toward the daily goal
 *  - a wrong answer goes to the mistake notebook
 */
export async function recordGrammarAnswer(
  e: SessionEntry,
  correct: boolean,
  opts: { mode: GrammarSessionMode; hinted?: boolean; given?: string; skipped?: boolean; selfAccepted?: boolean }
): Promise<void> {
  if (opts.mode === "retry") return;
  const key = e.task.itemKey;
  const skipped = !!opts.skipped;
  const selfAccepted = !!opts.selfAccepted && !skipped;
  const isCorrect = correct && !skipped;
  const clean = isCorrect && !opts.hinted && !selfAccepted;
  recordGrammarExerciseAttempt(key, clean, skipped);
  if (!selfAccepted && !(clean && e.belowLevel)) updateItemReviewLevel(key, clean);
  if (opts.mode !== "popup") recordDailyActivity(1);

  // The learner's own "Đúng/Sai" on a self-graded item never grades the lesson (it can appear in a studied
  // lesson's "Bài tập" tab, which is pooled as a review)
  if ((opts.mode === "review" || opts.mode === "popup") && !selfAccepted && e.task.format !== "self") {
    for (const id of e.lessonIds) {
      if (!isLessonStudied(id)) continue;
      const score = poolLessonAnswer(id, clean);
      if (score !== null) await recordPracticeResult(id, score);
    }
  }

  // Saved in the background: the next question never waits for the notebook
  if (!isCorrect && e.task.format !== "self") void saveGrammarMistake(e, opts.given);
}

/** The mistake-notebook card for a wrong answer; null when there is nothing meaningful to learn from it */
export function grammarMistakeOf(e: SessionEntry, given: string | undefined): { wrong: string; right: string } | null {
  const t = e.task;
  let wrong = given?.trim() ?? "";
  let right: string;
  if (t.format === "error") {
    // The learner tapped a word; the card is the wrong part of the sentence and its correction
    const [from, to] = t.errorSpan ?? [-1, -1];
    wrong = (t.errorTokens?.slice(from, to + 1) ?? []).join(" ").replace(/^[^\w']+|[^\w']+$/g, "");
    right = t.errorFix ?? "";
  } else {
    right = t.blanks > 0 ? t.answers.map((a) => a[0] ?? "").join(" … ") : t.full;
  }
  // No answer at all ("Mình chưa biết") is not a mistake to fix
  return wrong.trim() && right.trim() ? { wrong, right } : null;
}

async function saveGrammarMistake(e: SessionEntry, given: string | undefined): Promise<void> {
  try {
    const mistake = grammarMistakeOf(e, given);
    if (!mistake) return;
    const index = await loadBookIndex().catch(() => null);
    await saveMistakes(
      [
        {
          ...mistake,
          sentence: e.task.full,
          category: mistakeCategory(index?.chapterOfLesson.get(e.lessonIds[0])),
          whyVn: e.task.explain ?? "",
        },
      ],
      { source: "grammar" }
    );
  } catch {}
}

/** End of a new lesson's quick check: the lesson is studied and gets its first FSRS schedule */
export async function finishLearnSession(lessonId: string, results: boolean[]): Promise<{ scorePercent: number; xpEarned: number }> {
  const scorePercent = results.length > 0 ? Math.round((results.filter(Boolean).length / results.length) * 100) : 0;
  const perfectFirstTry = results.length > 0 && results.every(Boolean);
  const { xpEarned } = await recordDiagnosticResult(lessonId, perfectFirstTry, scorePercent);
  markLessonIntroduced(lessonId);
  recordLessonIntroDay(lessonId);
  logLearningEvent("grammar_intro", { meta: { lessonId, scorePercent } });
  return { scorePercent, xpEarned };
}

const SET_SCORES_KEY = "myenglish_grammar_set_scores_v1";

export interface SetScore {
  best: number;
  last: number;
  at: string;
}

export function getSetScores(): Record<string, SetScore> {
  try {
    return JSON.parse(localStorage.getItem(SET_SCORES_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

/**
 * End of a book exercise set: its score is kept, and each studied lesson with at least two questions in it
 * gets a practice result (FSRS moves only when that lesson is due, or on a failure).
 */
export async function finishBookSet(setId: string, results: Array<{ entry: SessionEntry; correct: boolean }>, now: Date = new Date()): Promise<number> {
  const graded = results;
  const scorePercent = graded.length > 0 ? Math.round((graded.filter((r) => r.correct).length / graded.length) * 100) : 0;
  const scores = getSetScores();
  const prev = scores[setId];
  scores[setId] = { best: Math.max(prev?.best ?? 0, scorePercent), last: scorePercent, at: now.toISOString() };
  try {
    localStorage.setItem(SET_SCORES_KEY, JSON.stringify(scores));
    persistKeyNow(SET_SCORES_KEY);
  } catch {}

  const perLesson = new Map<string, boolean[]>();
  for (const r of graded) {
    for (const id of r.entry.lessonIds) perLesson.set(id, [...(perLesson.get(id) ?? []), r.correct]);
  }
  for (const [id, answers] of perLesson) {
    if (answers.length < 2 || !isLessonStudied(id)) continue;
    await recordPracticeResult(id, Math.round((answers.filter(Boolean).length / answers.length) * 100));
  }
  return scorePercent;
}

// ---------------------------------------------------------------------------------------------------------
// Popup

export interface PopupGrammarItem {
  exercise: GrammarExercise;
  lesson: GrammarLesson;
  intro: boolean;
  entry: SessionEntry;
}

/** The lesson's formulas, one per line ("Khẳng định: S + V(s/es)") for the popup's intro card */
export function lessonFormulaText(lesson: GrammarBookLesson): string {
  return lesson.blocks
    .filter((b): b is Extract<GrammarBookLesson["blocks"][number], { type: "formula" }> => b.type === "formula")
    .slice(0, 4)
    .map((b) => (b.label ? `${b.label}: ${b.text}` : b.text))
    .join("\n");
}

/** A lesson in the shape the popup renders; `category` carries the chapter label ("Ch.1 · Các thì") */
export function bookLessonShell(lesson: GrammarBookLesson, chapterLabel: string = "Ngữ pháp"): GrammarLesson {
  return {
    id: lesson.id,
    level: "A1",
    category: chapterLabel,
    order: lesson.order,
    title: lesson.title,
    titleVn: lesson.titleVn,
    tagline: lesson.titleVn || lesson.title,
    formula: { positive: lessonFormulaText(lesson), negative: "", question: "" },
    timeSignals: [],
    usagePoints: [],
    commonMistakes: [],
    diagnosticExercises: [],
    practiceExercises: [],
  };
}

/**
 * Popup questions are quick: choose, or type a single blank; nothing self-graded or multi-line.
 * `levels` is the ladder levels map, read once by the caller.
 */
function popupFormat(it: IndexedItem, intro: boolean, levels: Record<string, number>): GrammarFormat | null {
  const level = intro ? 0 : getItemReviewLevel(it.key, levels);
  const available = availableFormats(it.item, it.setType);
  const f = formatForLevel(it.item, it.setType, level, available);
  if (f === "choice" || f === "pick_sentence") return f;
  const lower = formatForLevel(it.item, it.setType, 0, available);
  if (f === "type" && (it.item.prompt.match(/_{3,}/g) || []).length === 1) return "type";
  return lower === "choice" || lower === "pick_sentence" ? lower : null;
}

function toPopupExercise(e: SessionEntry): GrammarExercise {
  const t = e.task;
  const given = t.given ? `Bắt đầu bằng: ${t.given}` : undefined;
  const base = {
    id: t.itemKey,
    promptEn: t.prompt,
    promptVn: t.vi,
    hint: [e.instruction, given].filter(Boolean).join(" · ") || undefined,
    correctSentence: t.full,
    explanation: t.explain || `Đáp án: ${t.full}`,
  };
  if ((t.format === "choice" || t.format === "pick_sentence") && t.options && t.correctOption !== undefined) {
    return { ...base, type: "multiple_choice", options: t.options, correctAnswer: [t.options[t.correctOption]] };
  }
  return { ...base, type: "conjugation", correctAnswer: t.answers[0] };
}

/** Popup questions per lesson: a lesson is graded on answers pooled over several popups */
const POPUP_PER_LESSON = 2;

/**
 * Grammar for a popup: questions of the due lessons first, then other studied lessons out of cooldown; two per
 * lesson (a lesson is graded on pooled answers). Only lessons already studied: a new lesson is learnt in the hub
 * (reading it and its quick check), never met in a popup. `intro` is always false.
 */
export async function getPopupGrammarItems(count: number, now: Date = new Date(), random: () => number = Math.random): Promise<PopupGrammarItem[]> {
  if (count <= 0) return [];
  const index = await loadBookIndex();
  if (index.items.length === 0) return [];
  const path = getEffectiveLessonIds(index.lessons.map((l) => l.id));
  const studied = new Set(path.filter((id) => isLessonStudied(id)));
  if (studied.size === 0) return [];
  const due = new Set(getDueGrammarLessons(now).filter((id) => studied.has(id)));
  const history = getGrammarExerciseHistoryMap();
  const t = now.getTime();
  const chapters = await getAllBookChapters();
  const chapterLabel = (lessonId: string) => {
    const ch = chapters.find((c) => c.chapterId === index.chapterOfLesson.get(lessonId));
    if (!ch) return "Ngữ pháp";
    const name = ch.chapter?.titleVn || ch.chapter?.title || "";
    return `Ch.${ch.chapter?.order ?? ""} · ${name.charAt(0) + name.slice(1).toLowerCase()}`;
  };

  // The ladder levels are read once; each question's format is worked out once
  const levels = readItemLevels();
  const formats = new Map<IndexedItem, GrammarFormat | null>();
  const formatOf = (it: IndexedItem) => {
    if (!formats.has(it)) formats.set(it, popupFormat(it, false, levels));
    return formats.get(it) ?? null;
  };

  const result: PopupGrammarItem[] = [];
  const push = (it: IndexedItem) => {
    const format = formatOf(it);
    if (!format) return false;
    const e = entry(it, buildTask(it.item, it.setType, format, random), { intro: false });
    if (format !== formatForLevel(it.item, it.setType, getItemReviewLevel(it.key, levels))) e.belowLevel = true;
    const lesson = index.lessonById.get(it.lessonIds[it.lessonIds.length - 1]);
    if (!lesson) return false;
    result.push({ exercise: toPopupExercise(e), lesson: bookLessonShell(lesson, chapterLabel(lesson.id)), intro: false, entry: e });
    return true;
  };

  // Reviews: due lessons first (pairs per lesson)
  const reviewCandidates = index.items
    .filter((it) => it.lessonIds.length > 0 && it.lessonIds.every((id) => studied.has(id)))
    .map((it) => ({
      it,
      // Due lessons strictly first: the popup often has a single grammar slot, and a recently missed item of a
      // lesson that is not due must not take it
      score: itemPriority(history[it.key], t) + (it.lessonIds.some((id) => due.has(id)) ? 1000 : 0) + (random() - 0.5) * 6,
    }))
    .filter((c) => c.score > -50)
    .sort((a, b) => b.score - a.score);
  const byLesson = new Map<string, IndexedItem[]>();
  for (const c of reviewCandidates) {
    const lessonId = c.it.lessonIds[c.it.lessonIds.length - 1];
    const list = byLesson.get(lessonId) ?? [];
    if (list.length < POPUP_PER_LESSON && formatOf(c.it)) {
      list.push(c.it);
      byLesson.set(lessonId, list);
    }
  }

  for (const list of byLesson.values()) {
    for (const it of list) if (result.length < count) push(it);
    if (result.length >= count) break;
  }
  return result;
}

/** Remembering where each lesson's progress stands, for the hub */
export function lessonStatus(
  lessonId: string,
  now: Date = new Date(),
  /** The due lessons (getDueGrammarLessons), when the caller shows many lessons and works them out once */
  due: ReadonlySet<string> | string[] = getDueGrammarLessons(now)
): "new" | "learning" | "due" | "mastered" {
  if (!isLessonStudied(lessonId)) return "new";
  const p = getLessonProgress(lessonId);
  if (Array.isArray(due) ? due.includes(lessonId) : due.has(lessonId)) return "due";
  return isLessonMastered(p) ? "mastered" : "learning";
}
