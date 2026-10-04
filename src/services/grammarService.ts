import { getDatabase, getAllWords } from "./db";
import { awardXP, wordFormsPattern } from "./smartReview";
import type { GrammarProgress, DiagnosticStatus } from "@/types/grammar";
import { GRAMMAR_LESSONS } from "@/data/grammarData";

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
};

let initPromise: Promise<void> | null = null;

/** True when date `a` is strictly newer than `b` (missing/invalid dates count as oldest) */
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
      lesson_id, diagnostic_status, score, mastery, reps, lapses, last_attempt_date, next_review_date, streak, first_try_bonus
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT(lesson_id) DO UPDATE SET
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
    ]
  );
}

/**
 * Initialize schema in SQLite and hydrate cache.
 * localStorage and SQLite are merged per lesson (newest lastAttemptDate wins) and the winner is
 * written back to whichever store is behind. Saves await this promise so they never get clobbered.
 */
export function initGrammarStorage(): Promise<void> {
  if (!initPromise) initPromise = runGrammarInit();
  return initPromise;
}

async function runGrammarInit(): Promise<void> {
  if (isInitialized) return;

  // Hydrate from localStorage first for instantaneous availability
  const local = loadFromLocalStorage();
  progressCache = { ...local };

  try {
    const db = await getDatabase();
    if (db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS grammar_progress (
          lesson_id TEXT PRIMARY KEY,
          diagnostic_status TEXT DEFAULT 'unattempted',
          score INTEGER DEFAULT 0,
          mastery INTEGER DEFAULT 0,
          reps INTEGER DEFAULT 0,
          lapses INTEGER DEFAULT 0,
          last_attempt_date TIMESTAMP,
          next_review_date TIMESTAMP,
          streak INTEGER DEFAULT 0,
          first_try_bonus INTEGER DEFAULT 0
        );
      `);
      try {
        // Older databases were created without this column
        await db.execute(`ALTER TABLE grammar_progress ADD COLUMN first_try_bonus INTEGER DEFAULT 0;`);
      } catch {}

      const rows = await db.select<GrammarProgressRow[]>("SELECT * FROM grammar_progress");
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
        };
      }

      // Merge: SQLite wins only when strictly newer than localStorage
      const merged: Record<string, GrammarProgress> = { ...local };
      for (const [id, dbEntry] of Object.entries(fromDb)) {
        const localEntry = local[id];
        if (!localEntry || isNewerDate(dbEntry.lastAttemptDate, localEntry.lastAttemptDate)) {
          // Never lose the one-time bonus flag
          merged[id] = {
            ...dbEntry,
            firstTryBonusAwarded: dbEntry.firstTryBonusAwarded || !!localEntry?.firstTryBonusAwarded,
          };
        } else if (dbEntry.firstTryBonusAwarded && !localEntry.firstTryBonusAwarded) {
          merged[id] = { ...localEntry, firstTryBonusAwarded: true };
        }
      }

      // Write back entries that SQLite is missing or has older/different data for
      for (const [id, entry] of Object.entries(merged)) {
        const dbEntry = fromDb[id];
        if (
          !dbEntry ||
          isNewerDate(entry.lastAttemptDate, dbEntry.lastAttemptDate) ||
          !!entry.firstTryBonusAwarded !== !!dbEntry.firstTryBonusAwarded
        ) {
          try {
            await upsertProgressRow(db, entry);
          } catch (e) {
            console.warn("Failed to write grammar progress back to SQLite:", e);
          }
        }
      }

      progressCache = merged;
      saveToLocalStorage(progressCache);
    }
  } catch (err) {
    console.warn("SQLite grammar init failed or running in non-Tauri mode, using localStorage fallback:", err);
  }

  isInitialized = true;
}

/**
 * Get progress for a specific lesson
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
 * Save progress for a lesson (syncs with SQLite and localStorage)
 */
export async function saveLessonProgress(progress: GrammarProgress): Promise<void> {
  // Wait for init so its merge cannot overwrite this save
  await initGrammarStorage().catch(() => {});

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
  } catch (e) {
    // LocalStorage already has the data
  }

  window.dispatchEvent(new CustomEvent("myenglish-grammar-updated", { detail: { lessonId: progress.lessonId } }));
  window.dispatchEvent(new CustomEvent("myenglish-activity-updated"));
}

/**
 * Calculate the next review date based on consecutive reps (SRS)
 */
function calculateNextReview(currentReps: number): string {
  const intervalsInDays = [1, 3, 7, 14, 30, 60, 120];
  const days = intervalsInDays[Math.min(currentReps, intervalsInDays.length - 1)];
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

/**
 * Submit diagnostic test outcome
 * @param lessonId - ID of lesson
 * @param passedFirstTry - Did user pass all diagnostic questions cleanly?
 * @param scorePercent - Score percentage (0 - 100)
 */
export async function recordDiagnosticResult(
  lessonId: string,
  passedFirstTry: boolean,
  scorePercent: number
): Promise<{ xpEarned: number; newMastery: number }> {
  await initGrammarStorage().catch(() => {});
  const current = getLessonProgress(lessonId);
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const passed = scorePercent >= DIAGNOSTIC_PASS_SCORE;
  const isFirstAttempt = current.diagnosticStatus === "unattempted" && current.mastery === 0;

  // Moving average like recordPracticeResult, so mastery can also drop
  const newMastery = isFirstAttempt
    ? scorePercent
    : Math.round(Math.min(100, Math.max(0, current.mastery * 0.7 + scorePercent * 0.3)));

  let newStatus: DiagnosticStatus;
  let newReps = current.reps;
  let newStreak = current.streak;
  let newLapses = current.lapses;
  let nextReviewDate = current.nextReviewDate;
  let firstTryBonusAwarded = !!current.firstTryBonusAwarded;
  let xpEarned = 0;

  if (!passed) {
    // Failed: reset the interval so the lesson comes back tomorrow
    newStatus = "needs_work";
    newReps = 0;
    newStreak = 0;
    newLapses += 1;
    nextReviewDate = calculateNextReview(0);
  } else {
    newStatus = passedFirstTry ? "passed_first_try" : "reviewed_and_passed";
    // Re-passing in the same period counts as one review, not one per retake
    const wasDue = new Date(current.nextReviewDate) <= nowDate || current.reps === 0;
    if (wasDue) {
      newReps = current.reps + 1;
      newStreak = current.streak + 1;
      nextReviewDate = calculateNextReview(newReps);
    }
    xpEarned = 10;
    if (passedFirstTry && !firstTryBonusAwarded) {
      xpEarned = 25; // One-time bonus for mastering on first attempt
      firstTryBonusAwarded = true;
    }
  }

  const updated: GrammarProgress = {
    ...current,
    diagnosticStatus: newStatus,
    score: scorePercent,
    mastery: newMastery,
    streak: newStreak,
    reps: newReps,
    lapses: newLapses,
    lastAttemptDate: now,
    nextReviewDate,
    firstTryBonusAwarded,
  };

  await saveLessonProgress(updated);
  if (xpEarned > 0) {
    awardXP(xpEarned);
  }

  return { xpEarned, newMastery };
}

/** Score (%) below which a diagnostic counts as failed */
const DIAGNOSTIC_PASS_SCORE = 60;

/** Score (%) at or above which a practice attempt counts as a successful recall */
const PRACTICE_PASS_SCORE = 60;

/**
 * Record practice exercise completion.
 *
 * SRS rules:
 *  - failing resets the interval (reps = 0, lapses + 1) so the lesson comes back tomorrow
 *  - passing only advances the interval when the lesson was actually due (or never scheduled),
 *    so answering several questions of one lesson in a single session counts as one review
 *  - mastery is an exponential moving average, so it can also go down
 */
export async function recordPracticeResult(
  lessonId: string,
  scorePercent: number
): Promise<{ xpEarned: number; newMastery: number }> {
  await initGrammarStorage().catch(() => {});
  const current = getLessonProgress(lessonId);
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const passed = scorePercent >= PRACTICE_PASS_SCORE;
  const isFirstAttempt = current.diagnosticStatus === "unattempted" && current.mastery === 0;
  // A correct retry right after failing (same session) must not advance the interval
  const failedRecently =
    !!current.lastAttemptDate &&
    nowDate.getTime() - new Date(current.lastAttemptDate).getTime() < 12 * 60 * 60 * 1000 &&
    current.score < PRACTICE_PASS_SCORE;
  const wasDue = (new Date(current.nextReviewDate) <= nowDate || current.reps === 0) && !failedRecently;

  const newMastery = isFirstAttempt
    ? scorePercent
    : Math.round(Math.min(100, Math.max(0, current.mastery * 0.7 + scorePercent * 0.3)));

  let newReps = current.reps;
  let newLapses = current.lapses;
  let nextReviewDate = current.nextReviewDate;
  if (!passed) {
    newReps = 0;
    newLapses += current.reps > 0 ? 1 : 0;
    nextReviewDate = calculateNextReview(0);
  } else if (wasDue) {
    newReps = current.reps + 1;
    nextReviewDate = calculateNextReview(newReps);
  }

  const xpEarned = passed ? 15 : 0;

  const updated: GrammarProgress = {
    ...current,
    diagnosticStatus: current.diagnosticStatus === "unattempted" ? "reviewed_and_passed" : current.diagnosticStatus,
    score: scorePercent,
    mastery: newMastery,
    reps: newReps,
    lapses: newLapses,
    lastAttemptDate: now,
    nextReviewDate,
  };

  await saveLessonProgress(updated);
  if (xpEarned > 0) awardXP(xpEarned);

  return { xpEarned, newMastery };
}

/**
 * Check which grammar lessons are due for review today
 */
export function getDueGrammarLessons(): string[] {
  if (!isInitialized) {
    progressCache = loadFromLocalStorage();
  }

  const now = new Date();
  const dueLessonIds: string[] = [];

  for (const lesson of GRAMMAR_LESSONS) {
    const progress = progressCache[lesson.id];
    if (progress && progress.diagnosticStatus !== "unattempted") {
      const reviewDate = new Date(progress.nextReviewDate);
      if (reviewDate <= now) {
        dueLessonIds.push(lesson.id);
      }
    }
  }

  return dueLessonIds;
}

/**
 * Calculate overall stats across all grammar levels
 */
export function getGrammarSummaryStats(): {
  totalLessons: number;
  masteredCount: number;
  learningCount: number;
  dueCount: number;
  overallMasteryPercent: number;
  levelStats: Record<string, { total: number; mastered: number; percent: number }>;
} {
  if (!isInitialized) {
    progressCache = loadFromLocalStorage();
  }

  const totalLessons = GRAMMAR_LESSONS.length;
  let masteredCount = 0;
  let learningCount = 0;
  let totalMasteryScore = 0;

  const levelStats: Record<string, { total: number; mastered: number; percent: number }> = {
    A1: { total: 0, mastered: 0, percent: 0 },
    A2: { total: 0, mastered: 0, percent: 0 },
    B1: { total: 0, mastered: 0, percent: 0 },
    B2: { total: 0, mastered: 0, percent: 0 },
    C1: { total: 0, mastered: 0, percent: 0 },
  };

  for (const lesson of GRAMMAR_LESSONS) {
    const lvl = lesson.level;
    if (levelStats[lvl]) {
      levelStats[lvl].total += 1;
    }

    const progress = progressCache[lesson.id];
    if (progress) {
      totalMasteryScore += progress.mastery;
      if (progress.mastery >= 80) {
        masteredCount += 1;
        if (levelStats[lvl]) {
          levelStats[lvl].mastered += 1;
        }
      } else if (progress.mastery > 0 || progress.diagnosticStatus !== "unattempted") {
        learningCount += 1;
      }
    }
  }

  for (const lvl of Object.keys(levelStats)) {
    const stat = levelStats[lvl];
    stat.percent = stat.total > 0 ? Math.round((stat.mastered / stat.total) * 100) : 0;
  }

  const overallMasteryPercent =
    totalLessons > 0 ? Math.round(totalMasteryScore / totalLessons) : 0;
  const dueCount = getDueGrammarLessons().length;

  return {
    totalLessons,
    masteredCount,
    learningCount,
    dueCount,
    overallMasteryPercent,
    levelStats,
  };
}

/**
 * Per-lesson mining rules: `analysis` = lowercase tags searched in grammar_analysis,
 * `patterns` = structural regexes on the English sentence (tied to the grammar point, not single common words).
 */
const AUX_ING = String.raw`(?:\w+ly\s+)?(?!\w*thing\b)\w{2,}ing\b`;
const MINING_RULES: Record<string, { analysis: string[]; patterns: RegExp[] }> = {
  "a1-present-simple": { analysis: ["present simple", "hiện tại đơn"], patterns: [] },
  "a1-present-continuous": {
    analysis: ["present continuous", "hiện tại tiếp diễn"],
    patterns: [new RegExp(String.raw`\b(?:am|is|are|i'm|you're|we're|they're)\s+(?:not\s+)?` + AUX_ING, "i")],
  },
  "a1-past-simple": {
    analysis: ["past simple", "quá khứ đơn"],
    patterns: [/\b(?:yesterday|last\s+(?:night|week|month|year|sprint)|\d+\s+(?:minutes|hours|days|weeks|months|years)\s+ago)\b/i],
  },
  "a1-future-simple": {
    analysis: ["future simple", "tương lai đơn"],
    patterns: [/\b(?:will|won't)\s+(?:not\s+)?(?:\w+ly\s+)?[a-z]+\b/i],
  },
  "a1-nouns-articles": { analysis: ["article", "mạo từ"], patterns: [] },
  "a2-past-continuous": {
    analysis: ["past continuous", "quá khứ tiếp diễn"],
    patterns: [new RegExp(String.raw`\b(?:was|were)\s+(?:not\s+)?` + AUX_ING, "i")],
  },
  "a2-present-perfect-basic": {
    analysis: ["present perfect", "hiện tại hoàn thành"],
    patterns: [/\b(?:have|has|haven't|hasn't)\s+(?:not\s+|never\s+|already\s+|just\s+|ever\s+|recently\s+)?(?:been|[a-z]+(?:ed|en))\b/i],
  },
  "a2-modals-basic": {
    analysis: ["modal", "động từ khuyết thiếu"],
    patterns: [/\b(?:should|must|can|could|might|may)(?:n't)?\s+(?:not\s+)?(?:be|have|[a-z]{3,})\b/i],
  },
  "a2-comparatives": {
    analysis: ["comparative", "superlative", "so sánh"],
    patterns: [/\b(?:[a-z]+er|more\s+[a-z]+|less\s+[a-z]+)\s+than\b/i, /\bthe\s+(?:most|least)\s+[a-z]+|\bthe\s+[a-z]+est\b/i],
  },
  "b1-pres-perf-vs-past-simple": {
    analysis: ["present perfect", "hiện tại hoàn thành"],
    patterns: [/\b(?:have|has)\s+(?:never\s+|already\s+|just\s+|ever\s+)?(?:been|[a-z]+(?:ed|en))\b/i],
  },
  "b1-conditionals-0-1": {
    analysis: ["conditional type 0", "conditional type 1", "zero conditional", "first conditional", "điều kiện loại 0", "điều kiện loại 1"],
    patterns: [/\b(?:if|unless)\b[^.?!]*\b(?:will|won't)\b/i],
  },
  "b1-passive-basic": {
    analysis: ["passive", "bị động"],
    patterns: [/\b(?:is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?[a-z]+(?:ed|en)\s+by\b/i],
  },
  "b1-relative-clauses": {
    analysis: ["relative clause", "mệnh đề quan hệ"],
    patterns: [/\w\s*,?\s+(?:who|whom|whose|which)\s+\w+/i],
  },
  "b2-conditionals-2-3": {
    analysis: ["conditional type 2", "conditional type 3", "second conditional", "third conditional", "điều kiện loại 2", "điều kiện loại 3"],
    patterns: [/\bif\b[^.?!]*\b(?:would|could|might)(?:n't)?\s+(?:have\s+)?[a-z]+/i],
  },
  "b2-gerund-vs-infinitive": {
    analysis: ["gerund", "infinitive", "danh động từ", "động từ nguyên mẫu"],
    patterns: [
      /\b(?:enjoy|avoid|finish|consider|suggest|mind|keep|recommend|decide|plan|want|hope|agree|refuse|manage|promise|afford)(?:s|ed|ing)?\s+(?:to\s+[a-z]+|[a-z]{2,}ing)\b/i,
    ],
  },
  "b2-reduced-relative-clauses": { analysis: ["reduced relative", "rút gọn mệnh đề"], patterns: [] },
  "c1-inversion": {
    analysis: ["inversion", "đảo ngữ"],
    patterns: [
      /^\s*(?:never|seldom|rarely|hardly|scarcely|little|not only|no sooner|only\s+(?:when|after|then|by|if))\b[^.?!]*?\b(?:have|has|had|do|does|did|is|are|was|were|will|can|could|should|would)\b/i,
    ],
  },
  "c1-cleft-sentences": {
    analysis: ["cleft", "câu chẻ"],
    patterns: [/^\s*it\s+(?:is|was)\s+[^.?!]+?\s+(?:that|who)\s+\w+/i, /^\s*what\s+[^.?!]+?\s+(?:is|was)\b/i],
  },
};

/**
 * Mine real grammar exercises from the user's saved vocabulary examples (Sentence Mining)
 * 100% offline, zero tokens consumed!
 */
export async function mineGrammarExercisesFromVocabulary(
  lessonId: string
): Promise<import("@/types/grammar").GrammarExercise[]> {
  try {
    const rule = MINING_RULES[lessonId];
    if (!rule) return [];

    const allWords = await getAllWords();
    if (!allWords || allWords.length === 0) return [];

    const lesson = GRAMMAR_LESSONS.find((l) => l.id === lessonId);
    const minedExercises: import("@/types/grammar").GrammarExercise[] = [];
    const seenIds = new Set<string>();

    for (const w of allWords) {
      if (!w.examples || w.examples.length === 0) continue;
      const rawWord = w.word.trim();
      if (!rawWord) continue;

      for (let exIdx = 0; exIdx < w.examples.length; exIdx++) {
        const ex = w.examples[exIdx];
        const textEn = (ex.sentence_en || "").trim();
        if (!textEn) continue;
        const textVn = ex.sentence_vn || "";
        const analysis = (ex.grammar_analysis || "").toLowerCase();

        // The sentence must show the grammar point: tagged in the analysis, or a structural pattern in the text
        const matched =
          rule.analysis.some((k) => analysis.includes(k)) || rule.patterns.some((re) => re.test(textEn));
        if (!matched) continue;

        // Whole-word match of the vocabulary word (escaped, so "c++" / ".net" are safe)
        const wordMatch = new RegExp(wordFormsPattern(rawWord), "i").exec(textEn);
        if (!wordMatch) continue;

        // Stable id scoped to the lesson
        const id = `mined-${lessonId}-${w.id}-${ex.id || exIdx}`;
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const matchedWord = wordMatch[0];
        // Replace exactly the matched span
        const maskedSentence =
          textEn.slice(0, wordMatch.index) +
          `_____ (${rawWord.toLowerCase()})` +
          textEn.slice(wordMatch.index + matchedWord.length);

        const analysisText = (ex.grammar_analysis || "").trim();
        const baseExplanation =
          analysisText || `Câu ví dụ thực tế cho chủ điểm "${lesson?.titleVn || lesson?.title || "ngữ pháp"}".`;

        minedExercises.push({
          id,
          type: "conjugation",
          promptEn: maskedSentence,
          promptVn: textVn || undefined,
          hint: `Từ vựng gốc: "${w.word}" (Nghĩa: ${w.meaning_vn || "—"})`,
          correctAnswer: matchedWord,
          explanation: `${baseExplanation} (✨ Khai thác từ kho từ vựng của bạn: từ "${w.word}")`,
        });
      }
    }

    return minedExercises.slice(0, 5); // Limit to top 5
  } catch (err) {
    console.warn("Sentence mining failed:", err);
    return [];
  }
}

/**
 * Save custom or AI-generated exercises permanently to SQLite (with localStorage fallback)
 */
export async function saveCustomGrammarExercises(
  lessonId: string,
  exercises: import("@/types/grammar").GrammarExercise[]
): Promise<void> {
  if (!exercises || exercises.length === 0) return;

  // 1. Save to localStorage
  try {
    const key = `myenglish_grammar_custom_${lessonId}`;
    const existing = JSON.parse(localStorage.getItem(key) || "[]") as import("@/types/grammar").GrammarExercise[];
    const merged = [...existing];
    for (const ex of exercises) {
      const idx = merged.findIndex((m) => m.id === ex.id);
      // Replace stale copies so edited answers/options are not kept
      if (idx >= 0) merged[idx] = ex;
      else merged.push(ex);
    }
    localStorage.setItem(key, JSON.stringify(merged));
  } catch (e) {
    console.warn("Failed to save custom exercises to localStorage:", e);
  }

  // 2. Save to SQLite
  try {
    const db = await getDatabase();
    if (db) {
      for (const ex of exercises) {
        await db.execute(
          `INSERT INTO grammar_custom_exercises (
            id, lesson_id, type, prompt_en, prompt_vn, hint, options, correct_answer, error_word, explanation
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT(id) DO UPDATE SET
            lesson_id = excluded.lesson_id,
            type = excluded.type,
            prompt_en = excluded.prompt_en,
            prompt_vn = excluded.prompt_vn,
            hint = excluded.hint,
            options = excluded.options,
            correct_answer = excluded.correct_answer,
            error_word = excluded.error_word,
            explanation = excluded.explanation;`,
          [
            ex.id,
            lessonId,
            ex.type,
            ex.promptEn,
            ex.promptVn || null,
            ex.hint || null,
            ex.options ? JSON.stringify(ex.options) : null,
            Array.isArray(ex.correctAnswer) ? ex.correctAnswer.join("|") : ex.correctAnswer,
            ex.errorWord || null,
            ex.explanation,
          ]
        );
      }
    }
  } catch (err) {
    console.warn("SQLite save custom exercises error:", err);
  }
}

type CustomExerciseRow = {
  id: string;
  lesson_id: string;
  type: string;
  prompt_en: string;
  prompt_vn: string | null;
  hint: string | null;
  options: string | null;
  correct_answer: string;
  error_word: string | null;
  explanation: string;
};

function mapCustomExerciseRow(r: CustomExerciseRow): import("@/types/grammar").GrammarExercise {
  let options: string[] | undefined = undefined;
  if (r.options) {
    try {
      options = JSON.parse(r.options);
    } catch {}
  }
  return {
    id: r.id,
    type: r.type as import("@/types/grammar").GrammarExercise["type"],
    promptEn: r.prompt_en,
    promptVn: r.prompt_vn || undefined,
    hint: r.hint || undefined,
    options,
    correctAnswer: r.correct_answer.includes("|") ? r.correct_answer.split("|") : r.correct_answer,
    errorWord: r.error_word || undefined,
    explanation: r.explanation,
  };
}

function getLocalCustomExercises(lessonId: string): import("@/types/grammar").GrammarExercise[] {
  try {
    const raw = localStorage.getItem(`myenglish_grammar_custom_${lessonId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

/**
 * Load permanently saved AI/custom exercises for a lesson
 */
export async function getCustomGrammarExercises(
  lessonId: string
): Promise<import("@/types/grammar").GrammarExercise[]> {
  const map = await getCustomGrammarExercisesForLessons([lessonId]);
  return map.get(lessonId) ?? [];
}

/**
 * Load custom exercises for many lessons with a single query (SQLite first, localStorage fallback per lesson)
 */
export async function getCustomGrammarExercisesForLessons(
  lessonIds: string[]
): Promise<Map<string, import("@/types/grammar").GrammarExercise[]>> {
  const result = new Map<string, import("@/types/grammar").GrammarExercise[]>();
  if (lessonIds.length === 0) return result;

  try {
    const db = await getDatabase();
    const placeholders = lessonIds.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await db.select<CustomExerciseRow[]>(
      `SELECT * FROM grammar_custom_exercises WHERE lesson_id IN (${placeholders}) ORDER BY created_at ASC;`,
      lessonIds
    );
    for (const row of rows) {
      const list = result.get(row.lesson_id);
      const mapped = mapCustomExerciseRow(row);
      if (list) list.push(mapped);
      else result.set(row.lesson_id, [mapped]);
    }
  } catch (err) {
    console.warn("SQLite read custom exercises error:", err);
  }

  for (const id of lessonIds) {
    if (!result.has(id)) {
      const local = getLocalCustomExercises(id);
      if (local.length > 0) result.set(id, local);
    }
  }
  return result;
}

const EXERCISE_HISTORY_KEY = "myenglish_grammar_exercise_history_v1";

export interface GrammarExerciseHistory {
  exerciseId: string;
  attempts: number;
  incorrect: number;
  lastAttempt: string;
}

export function getGrammarExerciseHistoryMap(): Record<string, GrammarExerciseHistory> {
  try {
    const raw = localStorage.getItem(EXERCISE_HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed to load grammar exercise history:", e);
  }
  return {};
}

/**
 * Record attempt outcome for an individual exercise
 */
export function recordGrammarExerciseAttempt(exerciseId: string, isCorrect: boolean): void {
  try {
    const map = getGrammarExerciseHistoryMap();
    const existing = map[exerciseId] || {
      exerciseId,
      attempts: 0,
      incorrect: 0,
      lastAttempt: new Date().toISOString(),
    };

    existing.attempts += 1;
    if (!isCorrect) {
      existing.incorrect += 1;
    }
    existing.lastAttempt = new Date().toISOString();
    map[exerciseId] = existing;

    localStorage.setItem(EXERCISE_HISTORY_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn("Failed to record grammar exercise attempt:", e);
  }
}

/**
 * Fisher-Yates array shuffle helper
 */
function shuffleArray<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Smartly sort, randomize and prepare grammar exercises:
 * 1. Shuffles options for multiple-choice / option-based questions (randomizes choice positions)
 * 2. Scores exercises using SRS / Urgency algorithm (error lapse weight + unseen question boost + recency penalty)
 * 3. Applies interleaving (avoids consecutive identical question types)
 */
export function smartPrepareGrammarExercises(
  exercises: import("@/types/grammar").GrammarExercise[],
  options: { reorder?: boolean } = {}
): import("@/types/grammar").GrammarExercise[] {
  const { reorder = true } = options;
  if (!exercises || exercises.length === 0) return [];

  const historyMap = getGrammarExerciseHistoryMap();
  const now = Date.now();

  // 1. Clone & shuffle choices
  const prepared = exercises.map((ex) => {
    const cloned = { ...ex };
    if (cloned.options && cloned.options.length > 1) {
      cloned.options = shuffleArray(cloned.options);
    }
    return cloned;
  });

  // 2. Score urgency based on learning algorithm
  const scored = prepared.map((ex) => {
    const hist = historyMap[ex.id];
    let score = 0;

    if (!hist || hist.attempts === 0) {
      // Unseen question: prioritize introducing it
      score += 20;
    } else {
      // Error/lapse rate penalty: questions with high error rate need urgent practice
      const errorRate = hist.incorrect / Math.max(1, hist.attempts);
      score += errorRate * 35;

      // Recency check: if attempted less than 30 mins ago and was correct, lower priority
      const hoursSinceLast = (now - new Date(hist.lastAttempt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLast < 0.5 && hist.incorrect === 0) {
        score -= 15;
      }
    }

    // Dynamic temperature/entropy to ensure natural non-deterministic shuffle
    score += (Math.random() - 0.5) * 10;

    return { exercise: ex, score };
  });

  // Sort by urgency descending (callers that already prioritised the list keep their order)
  if (reorder) {
    scored.sort((a, b) => b.score - a.score);
  }

  // 3. Cognitive Interleaving (similar to smartSortReviewQueue):
  // Avoid consecutive identical exercise types if possible
  const result: import("@/types/grammar").GrammarExercise[] = [];
  const remaining = scored.map((s) => s.exercise);

  while (remaining.length > 0) {
    let chosenIdx = 0;
    if (result.length > 0) {
      const lastType = result[result.length - 1].type;
      const diffIdx = remaining.findIndex((item) => item.type !== lastType);
      if (diffIdx !== -1) {
        chosenIdx = diffIdx;
      }
    }
    const [picked] = remaining.splice(chosenIdx, 1);
    result.push(picked);
  }

  return result;
}

/**
 * Select a prioritized pool of grammar exercises for the popup review queue
 * based on user's selected CEFR levels, SRS due status, and lapse weighting.
 */
export async function getGrammarExercisesForReview(
  selectedLevels: ("A1" | "A2" | "B1" | "B2" | "C1")[],
  count: number = 3
): Promise<Array<{ exercise: import("@/types/grammar").GrammarExercise; lesson: import("@/types/grammar").GrammarLesson }>> {
  if (count <= 0) return [];
  const levels = selectedLevels.length > 0 ? selectedLevels : (["A1", "A2", "B1"] as ("A1" | "A2" | "B1" | "B2" | "C1")[]);

  const matchingLessons = GRAMMAR_LESSONS.filter((l) => levels.includes(l.level));
  if (matchingLessons.length === 0) return [];

  const dueLessonIds = new Set(getDueGrammarLessons());
  const historyMap = getGrammarExerciseHistoryMap();

  const pairs: Array<{ exercise: import("@/types/grammar").GrammarExercise; lesson: import("@/types/grammar").GrammarLesson }> = [];

  const customByLesson = await getCustomGrammarExercisesForLessons(matchingLessons.map((l) => l.id)).catch(
    () => new Map<string, import("@/types/grammar").GrammarExercise[]>()
  );

  for (const lesson of matchingLessons) {
    const custom = customByLesson.get(lesson.id) ?? [];

    const lessonExercises = [
      ...lesson.diagnosticExercises,
      ...lesson.practiceExercises,
      ...custom,
    ];

    for (const ex of lessonExercises) {
      pairs.push({ exercise: ex, lesson });
    }
  }

  if (pairs.length === 0) return [];

  // Score each pair based on SRS due status, error history, and natural variety
  const scored = pairs.map((item) => {
    const isLessonDue = dueLessonIds.has(item.lesson.id);
    const hist = historyMap[item.exercise.id];

    let score = isLessonDue ? 30 : 0;

    if (!hist || hist.attempts === 0) {
      score += 15; // unseen
    } else {
      const errorRate = hist.incorrect / Math.max(1, hist.attempts);
      score += errorRate * 35;
      if (hist.incorrect > 0) score += 10;
    }

    // Natural variety jitter
    score += (Math.random() - 0.5) * 8;

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Take candidates and apply smartPrepareGrammarExercises to shuffle choices & interleave types
  const candidateExercises = scored.map((s) => s.item.exercise);
  // Keep the due-aware ordering computed above; only shuffle options and interleave types
  const preparedExercises = smartPrepareGrammarExercises(candidateExercises, { reorder: false });

  // Map back to lesson
  const exerciseToLesson = new Map(pairs.map((p) => [p.exercise.id, p.lesson]));

  const result: Array<{ exercise: import("@/types/grammar").GrammarExercise; lesson: import("@/types/grammar").GrammarLesson }> = [];
  for (const ex of preparedExercises) {
    const lesson = exerciseToLesson.get(ex.id);
    if (lesson) {
      result.push({ exercise: ex, lesson });
      if (result.length >= count) break;
    }
  }

  return result;
}


