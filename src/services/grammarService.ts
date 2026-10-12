import { getDatabase } from "./db";
import { awardXP } from "./smartReview";
import type { GrammarProgress, DiagnosticStatus } from "@/types/grammar";
import { createEmptyCard, Rating, State, type Card, type Grade } from "ts-fsrs";
import { getGrammarScheduler } from "./srs";
import { persistKeyNow } from "./storageBackup";
import { checkAndRunGrammarReset } from "./grammarReset";
import { dropLegacyChapterCopies, getKnownLessonIds } from "./grammarBook";
import { getEffectiveLessonIds, isLessonStudied } from "./grammarPath";
import type { PopupGrammarItem } from "./grammarSession";

const GRAMMAR_STORAGE_KEY = "myenglish_grammar_progress_v1";

/**
 * In-memory cache for fast, synchronous reads in components
 */
let progressCache: Record<string, GrammarProgress> = {};
let isInitialized = false;

function loadFromLocalStorage(): Record<string, GrammarProgress> {
  try {
    const raw = localStorage.getItem(GRAMMAR_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("Failed to load grammar progress from localStorage:", e);
  }
  return {};
}

function saveToLocalStorage(data: Record<string, GrammarProgress>) {
  try {
    localStorage.setItem(GRAMMAR_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to save grammar progress to localStorage:", e);
  }
}

/** Another window (popup / main) may have saved progress since this one read it: take its entries */
function refreshFromLocalStorage(): void {
  progressCache = { ...progressCache, ...loadFromLocalStorage() };
}

function onStorage(e: Event): void {
  const key = (e as StorageEvent).key;
  if (key !== GRAMMAR_STORAGE_KEY && key !== null) return;
  if (key !== null && (e as StorageEvent).newValue === null) progressCache = {};
  else refreshFromLocalStorage();
  window.dispatchEvent(new CustomEvent("myenglish-grammar-updated"));
}

// Progress saved by another window reaches this one's cache (and its open screens); a reloaded module
// (hot reload) replaces the previous listener
const STORAGE_LISTENER = "__myenglishGrammarStorageListener";
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  const holder = window as unknown as Record<string, EventListener | undefined>;
  const previous = holder[STORAGE_LISTENER];
  if (previous) window.removeEventListener("storage", previous);
  holder[STORAGE_LISTENER] = onStorage;
  window.addEventListener("storage", onStorage);
}

type GrammarProgressRow = {
  lesson_id: string;
  diagnostic_status: string;
  score: number;
  mastery: number;
  reps: number;
  lapses: number;
  last_attempt_date: string | null;
  next_review_date: string;
  streak: number;
  first_try_bonus: number | null;
  stability: number | null;
  difficulty: number | null;
  fsrs_state: number | null;
  last_review: string | null;
};

let initPromise: Promise<void> | null = null;

function isNewerDate(a?: string | null, b?: string | null): boolean {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  if (isNaN(ta)) return false;
  if (isNaN(tb)) return true;
  return ta > tb;
}

async function upsertProgressRow(
  db: Awaited<ReturnType<typeof getDatabase>>,
  progress: GrammarProgress
): Promise<void> {
  await db.execute(
    `INSERT INTO grammar_progress (
      lesson_id, diagnostic_status, score, mastery, reps, lapses, last_attempt_date, next_review_date, streak, first_try_bonus,
      stability, difficulty, fsrs_state, last_review
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT(lesson_id) DO UPDATE SET
      stability = excluded.stability,
      difficulty = excluded.difficulty,
      fsrs_state = excluded.fsrs_state,
      last_review = excluded.last_review,
      diagnostic_status = excluded.diagnostic_status,
      score = excluded.score,
      mastery = excluded.mastery,
      reps = excluded.reps,
      lapses = excluded.lapses,
      last_attempt_date = excluded.last_attempt_date,
      next_review_date = excluded.next_review_date,
      streak = excluded.streak,
      first_try_bonus = excluded.first_try_bonus;`,
    [
      progress.lessonId,
      progress.diagnosticStatus,
      progress.score,
      progress.mastery,
      progress.reps,
      progress.lapses,
      progress.lastAttemptDate || null,
      progress.nextReviewDate,
      progress.streak,
      progress.firstTryBonusAwarded ? 1 : 0,
      progress.stability ?? null,
      progress.difficulty ?? null,
      progress.fsrsState ?? null,
      progress.lastReview ?? null,
    ]
  );
}

/**
 * Initialize storage in SQLite, hydrate cache, and run reset if needed.
 */
export function initGrammarStorage(): Promise<void> {
  if (!initPromise) initPromise = runGrammarInit();
  return initPromise;
}

async function runGrammarInit(): Promise<void> {
  if (isInitialized) return;

  // 1. Check if legacy reset is required
  await checkAndRunGrammarReset().catch(() => {});

  // 2. Hydrate from localStorage
  const local = loadFromLocalStorage();
  progressCache = { ...local };

  // 3. Sync with SQLite
  try {
    const db = await getDatabase();
    if (db) {
      for (const column of [
        "first_try_bonus INTEGER DEFAULT 0",
        "stability REAL",
        "difficulty REAL",
        "fsrs_state INTEGER",
        "last_review TIMESTAMP",
      ]) {
        try {
          await db.execute(`ALTER TABLE grammar_progress ADD COLUMN ${column};`);
        } catch {}
      }

      const rows = await db.select<GrammarProgressRow[]>(
        "SELECT lesson_id, diagnostic_status, score, mastery, reps, lapses, last_attempt_date, next_review_date, streak, first_try_bonus, stability, difficulty, fsrs_state, last_review FROM grammar_progress"
      );
      const fromDb: Record<string, GrammarProgress> = {};
      for (const row of rows || []) {
        fromDb[row.lesson_id] = {
          lessonId: row.lesson_id,
          diagnosticStatus: (row.diagnostic_status as DiagnosticStatus) || "unattempted",
          score: row.score || 0,
          mastery: row.mastery || 0,
          reps: row.reps || 0,
          lapses: row.lapses || 0,
          lastAttemptDate: row.last_attempt_date || undefined,
          nextReviewDate: row.next_review_date || new Date().toISOString(),
          streak: row.streak || 0,
          firstTryBonusAwarded: !!row.first_try_bonus,
          stability: row.stability ?? undefined,
          difficulty: row.difficulty ?? undefined,
          fsrsState: row.fsrs_state ?? undefined,
          lastReview: row.last_review || undefined,
        };
      }

      const merged: Record<string, GrammarProgress> = { ...local };
      for (const [id, dbEntry] of Object.entries(fromDb)) {
        const localEntry = local[id];
        if (!localEntry || isNewerDate(dbEntry.lastAttemptDate, localEntry.lastAttemptDate)) {
          merged[id] = {
            ...dbEntry,
            firstTryBonusAwarded: dbEntry.firstTryBonusAwarded || !!localEntry?.firstTryBonusAwarded,
          };
        } else if (dbEntry.firstTryBonusAwarded && !localEntry.firstTryBonusAwarded) {
          merged[id] = { ...localEntry, firstTryBonusAwarded: true };
        }
      }

      progressCache = merged;
      saveToLocalStorage(progressCache);

      await dropLegacyChapterCopies();
    }
  } catch (err) {
    console.warn("SQLite grammar init notice (using local cache):", err);
  }

  isInitialized = true;
}

/**
 * Get progress for a specific lesson or review group
 */
export function getLessonProgress(lessonId: string): GrammarProgress {
  if (!isInitialized) {
    progressCache = loadFromLocalStorage();
  }

  if (progressCache[lessonId]) {
    return progressCache[lessonId];
  }

  const defaultProgress: GrammarProgress = {
    lessonId,
    diagnosticStatus: "unattempted",
    score: 0,
    mastery: 0,
    reps: 0,
    lapses: 0,
    nextReviewDate: new Date().toISOString(),
    streak: 0,
  };

  return defaultProgress;
}

/**
 * Get all progress records
 */
export function getAllGrammarProgress(): Record<string, GrammarProgress> {
  if (!isInitialized) {
    progressCache = loadFromLocalStorage();
  }
  return { ...progressCache };
}

/**
 * Save progress for a lesson or review group
 */
export async function saveLessonProgress(progress: GrammarProgress): Promise<void> {
  await initGrammarStorage().catch(() => {});

  refreshFromLocalStorage();
  progressCache[progress.lessonId] = progress;
  saveToLocalStorage(progressCache);

  try {
    const db = await getDatabase();
    if (db) {
      await upsertProgressRow(db, {
        ...progress,
        lastAttemptDate: progress.lastAttemptDate || new Date().toISOString(),
      });
    }
  } catch (e) {}

  window.dispatchEvent(new CustomEvent("myenglish-grammar-updated", { detail: { lessonId: progress.lessonId } }));
  window.dispatchEvent(new CustomEvent("myenglish-activity-updated"));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SAME_SESSION_MS = 12 * 60 * 60 * 1000;

export const GRAMMAR_PASS_SCORE = 60;
const DIAGNOSTIC_PASS_SCORE = GRAMMAR_PASS_SCORE;
const PRACTICE_PASS_SCORE = GRAMMAR_PASS_SCORE;
export const LESSON_GRADE_ANSWERS = 3;
/** Questions a session gives each lesson it reviews: enough to grade it in that session */
export const MIN_LESSON_ANSWERS = LESSON_GRADE_ANSWERS;
const ANSWER_POOL_KEY = "myenglish_grammar_answer_pool_v1";
const ANSWER_POOL_MAX_AGE_MS = 3 * DAY_MS;

export function isCuratedExercise(exerciseId: string): boolean {
  if (exerciseId.startsWith("ai-gen-") || exerciseId.startsWith("mined-")) return false;
  return true;
}

export function poolLessonAnswer(lessonId: string, correct: boolean, now: number = Date.now()): number | null {
  let pools: Record<string, { correct: number; total: number; since: number }> = {};
  try {
    pools = JSON.parse(localStorage.getItem(ANSWER_POOL_KEY) || "{}") || {};
  } catch {}
  const prev = pools[lessonId];
  const pool = prev && now - prev.since < ANSWER_POOL_MAX_AGE_MS ? prev : { correct: 0, total: 0, since: now };
  pool.total += 1;
  if (correct) pool.correct += 1;
  let score: number | null = null;
  if (pool.total >= LESSON_GRADE_ANSWERS) {
    score = Math.round((pool.correct / pool.total) * 100);
    delete pools[lessonId];
  } else {
    pools[lessonId] = pool;
  }
  try {
    localStorage.setItem(ANSWER_POOL_KEY, JSON.stringify(pools));
    persistKeyNow(ANSWER_POOL_KEY);
  } catch {}
  return score;
}

export function gradeFromScore(scorePercent: number, perfectFirstTry = false): Rating {
  if (scorePercent < PRACTICE_PASS_SCORE) return Rating.Again;
  if (scorePercent < 80) return Rating.Hard;
  if (perfectFirstTry && scorePercent >= 100) return Rating.Easy;
  return Rating.Good;
}

/** First grade of a lesson (right after it was learnt): at most Good, and Hard as soon as one answer was wrong */
export function firstLessonGrade(scorePercent: number): Rating {
  if (scorePercent < PRACTICE_PASS_SCORE) return Rating.Again;
  return scorePercent < 100 ? Rating.Hard : Rating.Good;
}

function neverScheduled(progress: GrammarProgress): boolean {
  return !progress.lastReview && progress.reps === 0;
}

/** "Đã thuộc": a high mastery confirmed by at least two graded reviews (not a single quick check) */
export function isLessonMastered(progress: Pick<GrammarProgress, "mastery" | "reps"> | undefined): boolean {
  return !!progress && progress.mastery >= 80 && progress.reps >= 2;
}

function lessonToCard(progress: GrammarProgress, now: Date): Card {
  const empty = createEmptyCard(now);
  if (progress.stability && progress.stability > 0) {
    return {
      ...empty,
      due: new Date(progress.nextReviewDate),
      stability: progress.stability,
      difficulty: progress.difficulty ?? 5,
      reps: progress.reps,
      lapses: progress.lapses,
      state: (progress.fsrsState ?? State.Review) as State,
      last_review: progress.lastReview ? new Date(progress.lastReview) : undefined,
    };
  }
  if (progress.reps > 0) {
    const due = new Date(progress.nextReviewDate);
    const last = progress.lastAttemptDate ? new Date(progress.lastAttemptDate) : new Date(due.getTime() - DAY_MS);
    const intervalDays = Math.max(1, (due.getTime() - last.getTime()) / DAY_MS);
    return {
      ...empty,
      due,
      stability: intervalDays,
      difficulty: 5,
      reps: progress.reps,
      lapses: progress.lapses,
      state: State.Review,
      last_review: last,
    };
  }
  return empty;
}

export function scheduleLessonReview(
  current: GrammarProgress,
  grade: Rating,
  now: Date
): Pick<GrammarProgress, "nextReviewDate" | "reps" | "lapses" | "stability" | "difficulty" | "fsrsState" | "lastReview"> | null {
  const firstTime = neverScheduled(current);
  const isDue = new Date(current.nextReviewDate).getTime() <= now.getTime();
  const reviewedThisSession =
    !!current.lastReview && now.getTime() - new Date(current.lastReview).getTime() < SAME_SESSION_MS;

  if (!firstTime && !isDue && (grade !== Rating.Again || reviewedThisSession)) {
    return null;
  }

  const card = lessonToCard(current, now);
  const next = getGrammarScheduler().next(card, now, grade as Grade).card;
  return {
    nextReviewDate: next.due.toISOString(),
    reps: next.reps,
    lapses: next.lapses,
    stability: Number(next.stability.toFixed(4)),
    difficulty: Number(next.difficulty.toFixed(4)),
    fsrsState: next.state,
    lastReview: now.toISOString(),
  };
}

const SINGLE_QUESTION_MASTERY_CAP = 50;

function movingMastery(current: GrammarProgress, scorePercent: number, firstAttemptCap = 100): number {
  const isFirstAttempt = current.mastery === 0 && current.reps === 0 && !current.lastAttemptDate;
  return isFirstAttempt
    ? Math.min(scorePercent, firstAttemptCap)
    : Math.round(Math.min(100, Math.max(0, current.mastery * 0.7 + scorePercent * 0.3)));
}

export async function recordDiagnosticResult(
  lessonId: string,
  passedFirstTry: boolean,
  scorePercent: number
): Promise<{ xpEarned: number; newMastery: number }> {
  await initGrammarStorage().catch(() => {});
  refreshFromLocalStorage();
  const current = getLessonProgress(lessonId);
  const nowDate = new Date();
  const passed = scorePercent >= DIAGNOSTIC_PASS_SCORE;
  const newMastery = movingMastery(current, scorePercent);
  // The quick check comes right after reading the lesson: never Easy, and the first one is Hard on any miss
  const grade = neverScheduled(current) ? firstLessonGrade(scorePercent) : Math.min(gradeFromScore(scorePercent), Rating.Good);
  const schedule = scheduleLessonReview(current, grade as Rating, nowDate);

  let firstTryBonusAwarded = !!current.firstTryBonusAwarded;
  let xpEarned = 0;
  // XP only when the schedule really moved (redoing the check the same day earns nothing)
  if (passed && schedule) {
    xpEarned = 10;
    if (passedFirstTry && !firstTryBonusAwarded) {
      xpEarned = 25;
      firstTryBonusAwarded = true;
    }
  }

  const updated: GrammarProgress = {
    ...current,
    ...(schedule ?? {}),
    diagnosticStatus: passed ? (passedFirstTry ? "passed_first_try" : "reviewed_and_passed") : "needs_work",
    score: scorePercent,
    mastery: newMastery,
    streak: !passed ? 0 : schedule ? current.streak + 1 : current.streak,
    lastAttemptDate: nowDate.toISOString(),
    firstTryBonusAwarded,
  };

  await saveLessonProgress(updated);
  if (xpEarned > 0) {
    awardXP(xpEarned);
  }

  return { xpEarned, newMastery };
}

export async function recordPracticeResult(
  lessonId: string,
  scorePercent: number
): Promise<{ xpEarned: number; newMastery: number }> {
  await initGrammarStorage().catch(() => {});
  refreshFromLocalStorage();
  const current = getLessonProgress(lessonId);
  const nowDate = new Date();
  const passed = scorePercent >= PRACTICE_PASS_SCORE;
  const grade = neverScheduled(current) ? firstLessonGrade(scorePercent) : gradeFromScore(scorePercent);
  const schedule = scheduleLessonReview(current, grade, nowDate);
  // XP only for a real review (a lesson not due yet is practice)
  const xpEarned = passed && schedule ? 15 : 0;

  const updated: GrammarProgress = {
    ...current,
    ...(schedule ?? {}),
    diagnosticStatus: current.diagnosticStatus,
    score: scorePercent,
    mastery: movingMastery(current, scorePercent, SINGLE_QUESTION_MASTERY_CAP),
    lastAttemptDate: nowDate.toISOString(),
  };

  await saveLessonProgress(updated);
  if (xpEarned > 0) awardXP(xpEarned);

  return { xpEarned, newMastery: updated.mastery };
}

/** Lessons of the book with no question to review (theory only, or every question hidden / self-graded) */
let lessonsWithoutExercises = new Set<string>();

/** Kept up to date by the session builder each time it indexes the book */
export function setLessonsWithoutExercises(lessonIds: Iterable<string>): void {
  lessonsWithoutExercises = new Set(lessonIds);
}

/**
 * Lessons of the path due for review: studied (scheduled) and their FSRS due date reached.
 * A lesson taken off the path is not due (its schedule is kept for when it comes back), nor one that has no
 * question to review it with.
 */
export function getDueGrammarLessons(now: Date = new Date()): string[] {
  if (!isInitialized) {
    progressCache = loadFromLocalStorage();
  }
  const known = getKnownLessonIds();
  const path = new Set(known.length > 0 ? getEffectiveLessonIds(known) : Object.keys(progressCache));
  const dueIds: string[] = [];
  for (const [id, progress] of Object.entries(progressCache)) {
    if (!path.has(id) || lessonsWithoutExercises.has(id)) continue;
    const isScheduled = progress.diagnosticStatus !== "unattempted" || !!progress.lastReview || progress.reps > 0;
    if (isScheduled && new Date(progress.nextReviewDate).getTime() <= now.getTime()) dueIds.push(id);
  }
  return dueIds;
}

/** When a studied lesson comes back for review (for "ôn lại sau X ngày"); null when it has no schedule yet */
export function getLessonNextReview(lessonId: string, now: Date = new Date()): { date: Date; days: number } | null {
  const p = getLessonProgress(lessonId);
  if (neverScheduled(p) && p.diagnosticStatus === "unattempted") return null;
  const date = new Date(p.nextReviewDate);
  if (isNaN(date.getTime())) return null;
  return { date, days: Math.max(0, Math.ceil((date.getTime() - now.getTime()) / DAY_MS)) };
}

/**
 * Progress over the lessons of the path (the picked lessons, or the whole imported book):
 * mastered = mastery ≥ 80 over at least two reviews, learning = studied but not mastered yet.
 */
export function getGrammarSummaryStats(): {
  totalLessons: number;
  studiedCount: number;
  masteredCount: number;
  learningCount: number;
  dueCount: number;
  overallMasteryPercent: number;
} {
  if (!isInitialized) {
    progressCache = loadFromLocalStorage();
  }
  const path = getEffectiveLessonIds();
  let masteredCount = 0;
  let learningCount = 0;
  let totalMasteryScore = 0;
  for (const id of path) {
    if (!isLessonStudied(id)) continue;
    const mastery = progressCache[id]?.mastery ?? 0;
    totalMasteryScore += mastery;
    if (isLessonMastered(progressCache[id])) masteredCount += 1;
    else learningCount += 1;
  }
  return {
    totalLessons: path.length,
    studiedCount: masteredCount + learningCount,
    masteredCount,
    learningCount,
    dueCount: getDueGrammarLessons().length,
    overallMasteryPercent: path.length > 0 ? Math.round(totalMasteryScore / path.length) : 0,
  };
}

const EXERCISE_HISTORY_KEY = "myenglish_grammar_exercise_history_v1";

export interface GrammarExerciseHistory {
  exerciseId: string;
  attempts: number;
  incorrect: number;
  skipped?: number;
  consecutiveCorrect?: number;
  lastAttempt: string;
}

export const MISSED_EXERCISE_COOLDOWN_HOURS = 0.75;

export function getGrammarExerciseCooldownHours(consecutiveCorrect: number = 0): number {
  if (consecutiveCorrect <= 0) return MISSED_EXERCISE_COOLDOWN_HOURS;
  if (consecutiveCorrect === 1) return 12;
  if (consecutiveCorrect === 2) return 48;
  if (consecutiveCorrect === 3) return 120;
  return Math.min(720, Math.round(120 * Math.pow(2, consecutiveCorrect - 3)));
}

export function getGrammarExerciseHistoryMap(): Record<string, GrammarExerciseHistory> {
  try {
    const raw = localStorage.getItem(EXERCISE_HISTORY_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {}
  return {};
}

export function recordGrammarExerciseAttempt(
  exerciseId: string,
  isCorrect: boolean,
  isSkipped: boolean = false
): void {
  try {
    const map = getGrammarExerciseHistoryMap();
    const existing = map[exerciseId] || {
      exerciseId,
      attempts: 0,
      incorrect: 0,
      skipped: 0,
      consecutiveCorrect: 0,
      lastAttempt: new Date().toISOString(),
    };

    existing.attempts += 1;
    if (isCorrect) {
      existing.consecutiveCorrect = (existing.consecutiveCorrect || 0) + 1;
      existing.skipped = 0;
      const reduction = existing.consecutiveCorrect >= 2 ? 2 : 1;
      existing.incorrect = Math.max(0, existing.incorrect - reduction);
    } else {
      existing.consecutiveCorrect = 0;
      existing.incorrect += 1;
      if (isSkipped) {
        existing.skipped = (existing.skipped || 0) + 1;
      }
    }
    existing.lastAttempt = new Date().toISOString();
    map[exerciseId] = existing;

    localStorage.setItem(EXERCISE_HISTORY_KEY, JSON.stringify(map));
    persistKeyNow(EXERCISE_HISTORY_KEY);
  } catch (e) {}
}

const INTRODUCED_LESSONS_KEY = "myenglish_grammar_introduced_v1";

function readIntroducedLessons(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(INTRODUCED_LESSONS_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export function isLessonIntroduced(lessonId: string): boolean {
  const p = getAllGrammarProgress()[lessonId];
  if (p && (p.diagnosticStatus !== "unattempted" || !!p.lastReview || p.reps > 0)) return true;
  return readIntroducedLessons().has(lessonId);
}

export function markLessonIntroduced(lessonId: string): void {
  try {
    const set = readIntroducedLessons();
    if (set.has(lessonId)) return;
    set.add(lessonId);
    localStorage.setItem(INTRODUCED_LESSONS_KEY, JSON.stringify([...set]));
    persistKeyNow(INTRODUCED_LESSONS_KEY);
  } catch {}
}

export type { PopupGrammarItem };

/**
 * Grammar questions for the popup (see getPopupGrammarItems in grammarSession: reviews of studied lessons only,
 * due lessons first, pairs per lesson; new lessons are learnt in the hub).
 */
export async function getGrammarExercisesForReview(
  countOrLevels: number | unknown = 3,
  maybeCount?: number
): Promise<PopupGrammarItem[]> {
  await initGrammarStorage().catch(() => {});
  const count =
    typeof countOrLevels === "number"
      ? countOrLevels
      : typeof maybeCount === "number"
      ? maybeCount
      : 3;
  const { getPopupGrammarItems } = await import("./grammarSession");
  return getPopupGrammarItems(count);
}
