import { getDatabase, getAllWords } from "./db";
import { awardXP } from "./smartReview";
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

/**
 * Initialize schema in SQLite and hydrate cache
 */
export async function initGrammarStorage(): Promise<void> {
  if (isInitialized) return;

  // Hydrate from localStorage first for instantaneous availability
  progressCache = loadFromLocalStorage();

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
          streak INTEGER DEFAULT 0
        );
      `);

      // Load existing records from SQLite
      const rows = await db.select<Array<{
        lesson_id: string;
        diagnostic_status: string;
        score: number;
        mastery: number;
        reps: number;
        lapses: number;
        last_attempt_date: string | null;
        next_review_date: string;
        streak: number;
      }>>("SELECT * FROM grammar_progress");

      if (rows && rows.length > 0) {
        for (const row of rows) {
          progressCache[row.lesson_id] = {
            lessonId: row.lesson_id,
            diagnosticStatus: (row.diagnostic_status as DiagnosticStatus) || "unattempted",
            score: row.score || 0,
            mastery: row.mastery || 0,
            reps: row.reps || 0,
            lapses: row.lapses || 0,
            lastAttemptDate: row.last_attempt_date || undefined,
            nextReviewDate: row.next_review_date || new Date().toISOString(),
            streak: row.streak || 0,
          };
        }
        saveToLocalStorage(progressCache);
      }
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
  progressCache[progress.lessonId] = progress;
  saveToLocalStorage(progressCache);

  try {
    const db = await getDatabase();
    if (db) {
      await db.execute(
        `INSERT INTO grammar_progress (
          lesson_id, diagnostic_status, score, mastery, reps, lapses, last_attempt_date, next_review_date, streak
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT(lesson_id) DO UPDATE SET
          diagnostic_status = excluded.diagnostic_status,
          score = excluded.score,
          mastery = excluded.mastery,
          reps = excluded.reps,
          lapses = excluded.lapses,
          last_attempt_date = excluded.last_attempt_date,
          next_review_date = excluded.next_review_date,
          streak = excluded.streak;`,
        [
          progress.lessonId,
          progress.diagnosticStatus,
          progress.score,
          progress.mastery,
          progress.reps,
          progress.lapses,
          progress.lastAttemptDate || new Date().toISOString(),
          progress.nextReviewDate,
          progress.streak,
        ]
      );
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
  const current = getLessonProgress(lessonId);
  const now = new Date().toISOString();

  let xpEarned = 0;
  let newMastery = current.mastery;
  let newStatus: DiagnosticStatus = current.diagnosticStatus;
  let newStreak = current.streak;
  let newReps = current.reps;
  let newLapses = current.lapses;

  if (passedFirstTry) {
    newStatus = "passed_first_try";
    newMastery = Math.max(85, Math.min(100, scorePercent));
    newStreak += 1;
    newReps += 1;
    xpEarned = 25; // Bonus for mastering on first attempt
  } else {
    newStatus = scorePercent >= 60 ? "reviewed_and_passed" : "needs_work";
    newMastery = Math.max(current.mastery, Math.min(75, scorePercent));
    if (scorePercent < 60) {
      newLapses += 1;
    }
    xpEarned = 10;
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
    nextReviewDate: calculateNextReview(newReps),
  };

  await saveLessonProgress(updated);
  if (xpEarned > 0) {
    awardXP(xpEarned);
  }

  return { xpEarned, newMastery };
}

/**
 * Record practice exercise completion
 */
export async function recordPracticeResult(
  lessonId: string,
  scorePercent: number
): Promise<{ xpEarned: number; newMastery: number }> {
  const current = getLessonProgress(lessonId);
  const now = new Date().toISOString();

  const newMastery = Math.min(100, Math.max(current.mastery, scorePercent));
  const newReps = current.reps + 1;
  const xpEarned = 15;

  const updated: GrammarProgress = {
    ...current,
    diagnosticStatus: current.diagnosticStatus === "unattempted" ? "reviewed_and_passed" : current.diagnosticStatus,
    score: Math.max(current.score, scorePercent),
    mastery: newMastery,
    reps: newReps,
    lastAttemptDate: now,
    nextReviewDate: calculateNextReview(newReps),
  };

  await saveLessonProgress(updated);
  awardXP(xpEarned);

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
 * Mine real grammar exercises from the user's saved vocabulary examples (Sentence Mining)
 * 100% offline, zero tokens consumed!
 */
export async function mineGrammarExercisesFromVocabulary(
  lessonId: string
): Promise<import("@/types/grammar").GrammarExercise[]> {
  try {
    const allWords = await getAllWords();
    if (!allWords || allWords.length === 0) return [];

    const minedExercises: import("@/types/grammar").GrammarExercise[] = [];
    const keywords: string[] = [];

    // Map lesson to search terms in grammar_analysis or sentence keywords
    if (lessonId.includes("present-simple")) {
      keywords.push("present simple", "hiện tại đơn", "[present simple]");
    } else if (lessonId.includes("present-continuous")) {
      keywords.push("present continuous", "hiện tại tiếp diễn", "[present continuous]");
    } else if (lessonId.includes("past-simple")) {
      keywords.push("past simple", "quá khứ đơn", "[past simple]");
    } else if (lessonId.includes("past-continuous")) {
      keywords.push("past continuous", "quá khứ tiếp diễn", "[past continuous]");
    } else if (lessonId.includes("present-perfect")) {
      keywords.push("present perfect", "hiện tại hoàn thành", "[present perfect]");
    } else if (lessonId.includes("passive")) {
      keywords.push("passive", "bị động", "[passive]");
    } else if (lessonId.includes("conditional")) {
      keywords.push("conditional", "điều kiện", "[conditional]", "if ");
    } else if (lessonId.includes("relative-clauses")) {
      keywords.push("relative clause", "mệnh đề quan hệ", "who", "which", "that");
    } else if (lessonId.includes("modals")) {
      keywords.push("modal", "should", "must", "can", "could");
    } else if (lessonId.includes("gerund")) {
      keywords.push("gerund", "infinitive", "v-ing", "to-v");
    } else if (lessonId.includes("inversion")) {
      keywords.push("inversion", "đảo ngữ", "never", "seldom", "hardly");
    } else if (lessonId.includes("cleft")) {
      keywords.push("cleft", "câu chẻ", "it was", "it is");
    } else if (lessonId.includes("articles")) {
      keywords.push("article", "mạo từ", " a ", " an ", " the ");
    } else if (lessonId.includes("comparatives")) {
      keywords.push("comparative", "so sánh", "more", "better", "faster");
    }

    for (const w of allWords) {
      if (!w.examples || w.examples.length === 0) continue;

      for (const ex of w.examples) {
        const textEn = ex.sentence_en.trim();
        const textVn = ex.sentence_vn || "";
        const analysis = (ex.grammar_analysis || "").toLowerCase();

        // Check if this example matches the grammar topic
        const matched = keywords.some(
          (k) => analysis.includes(k.toLowerCase()) || textEn.toLowerCase().includes(k.toLowerCase())
        );

        if (matched) {
          // Identify target word to mask
          const rawWord = w.word.trim();
          const wordRegex = new RegExp(`\\b${rawWord}[a-z]*\\b`, "i");
          const wordMatch = textEn.match(wordRegex);

          if (wordMatch && wordMatch[0]) {
            const matchedWord = wordMatch[0];
            const maskedSentence = textEn.replace(
              wordMatch[0],
              `_____ (${rawWord.toLowerCase()})`
            );

            minedExercises.push({
              id: `mined-${w.id}-${ex.id || Math.random().toString(36).slice(2, 7)}`,
              type: "conjugation",
              promptEn: maskedSentence,
              promptVn: textVn || undefined,
              hint: `Từ vựng gốc: "${w.word}" (Nghĩa: ${w.meaning_vn})`,
              correctAnswer: matchedWord,
              explanation: `${ex.grammar_analysis} (✨ Khai thác từ kho từ vựng của bạn: từ "${w.word}")`,
            });
          }
        }
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
      if (!merged.some((m) => m.id === ex.id)) {
        merged.push(ex);
      }
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
            prompt_en = excluded.prompt_en,
            prompt_vn = excluded.prompt_vn,
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

/**
 * Load permanently saved AI/custom exercises for a lesson
 */
export async function getCustomGrammarExercises(
  lessonId: string
): Promise<import("@/types/grammar").GrammarExercise[]> {
  // 1. Try SQLite first
  try {
    const db = await getDatabase();
    if (db) {
      const rows = await db.select<Array<{
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
      }>>(
        `SELECT * FROM grammar_custom_exercises WHERE lesson_id = $1 ORDER BY created_at ASC;`,
        [lessonId]
      );

      if (rows && rows.length > 0) {
        return rows.map((r) => {
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
            correctAnswer: r.correct_answer.includes("|")
              ? r.correct_answer.split("|")
              : r.correct_answer,
            errorWord: r.error_word || undefined,
            explanation: r.explanation,
          };
        });
      }
    }
  } catch (err) {
    console.warn("SQLite read custom exercises error:", err);
  }

  // 2. Fallback to localStorage
  try {
    const key = `myenglish_grammar_custom_${lessonId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}

  return [];
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
  exercises: import("@/types/grammar").GrammarExercise[]
): import("@/types/grammar").GrammarExercise[] {
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

  // Sort by urgency descending
  scored.sort((a, b) => b.score - a.score);

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

  for (const lesson of matchingLessons) {
    const custom = await getCustomGrammarExercises(lesson.id).catch(() => []);

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
  const preparedExercises = smartPrepareGrammarExercises(candidateExercises);

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


