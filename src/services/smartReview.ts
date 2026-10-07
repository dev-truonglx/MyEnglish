/**
 * Smart Review Engine — Phase 1: Algorithm Core
 *
 * Provides:
 * 1. Retrievability Calculation — FSRS forgetting curve R = (1 + t/9s)^(-1)
 * 2. Leech Detection — identifies chronically forgotten words
 * 3. Adaptive Queue Ordering — urgency-based review prioritization
 * 4. Review Log — per-review response time & accuracy tracking
 * 5. XP System — gamified experience points
 */

import type { WordDetail, SRSReview, ReviewCard, CardDirection } from "@/types/database";
import Database from "@tauri-apps/plugin-sql";
import { Rating } from "ts-fsrs";
import { getDatabase, isPlaceholderMeaning } from "./db";
import { getCardRetrievability, getFSRSSettings, getStudyLimits } from "./srs";
import { directionForExercise, getDueCards } from "./cards";

// ─── 1. RETRIEVABILITY ──────────────────────────────────────────────────────

/**
 * Calculate memory retrievability R ∈ [0, 1] using the same FSRS model (FSRS-6 curve in ts-fsrs v5)
 * that schedules the card, so the UI and the scheduler always agree.
 *
 * @returns A number between 0 (fully forgotten) and 1 (perfectly remembered)
 */
export function calculateRetrievability(srs: Partial<SRSReview>, now: Date = new Date()): number {
  return getCardRetrievability(srs, now);
}

/**
 * Human-readable label + CSS color class for retrievability level
 */
export type RetrievabilityLevel = "strong" | "fading" | "critical" | "new";

export interface RetrievabilityInfo {
  value: number;           // 0..1
  percent: number;         // 0..100
  level: RetrievabilityLevel;
  label: string;
  colorClass: string;      // Tailwind classes for the progress bar
  textColorClass: string;  // Tailwind classes for text
  bgColorClass: string;    // Tailwind bg class for badge
}

export function getRetrievabilityInfo(srs: Partial<SRSReview>, now?: Date): RetrievabilityInfo {
  const R = calculateRetrievability(srs, now);
  const percent = Math.round(R * 100);

  // New cards (never reviewed)
  if ((srs.state === 0 || srs.state === undefined) && (!srs.reps || srs.reps === 0) && (!srs.stability || srs.stability === 0)) {
    return {
      value: 0,
      percent: 0,
      level: "new",
      label: "Mới",
      colorClass: "bg-slate-400 dark:bg-zinc-500",
      textColorClass: "text-slate-500 dark:text-zinc-400",
      bgColorClass: "bg-slate-100 dark:bg-zinc-800",
    };
  }

  if (percent >= 90) {
    return {
      value: R, percent, level: "strong",
      label: "Nhớ tốt",
      colorClass: "bg-emerald-500",
      textColorClass: "text-emerald-600 dark:text-emerald-400",
      bgColorClass: "bg-emerald-50 dark:bg-emerald-950/60",
    };
  }
  if (percent >= 70) {
    return {
      value: R, percent, level: "fading",
      label: "Sắp quên",
      colorClass: "bg-amber-500",
      textColorClass: "text-amber-600 dark:text-amber-400",
      bgColorClass: "bg-amber-50 dark:bg-amber-950/60",
    };
  }
  return {
    value: R, percent, level: "critical",
    label: "Cần ôn ngay",
    colorClass: "bg-rose-500",
    textColorClass: "text-rose-600 dark:text-rose-400",
    bgColorClass: "bg-rose-50 dark:bg-rose-950/60",
  };
}

// ─── 2. LEECH DETECTION ─────────────────────────────────────────────────────

const LEECH_SETTINGS_KEY = "myenglish_leech_settings_v1";

export interface LeechSettings {
  threshold: number;     // Number of lapses to trigger leech status (default: 4)
  action: "highlight" | "suspend" | "relearn";  // What to do when a word becomes a leech
  enabled: boolean;
}

const DEFAULT_LEECH_SETTINGS: LeechSettings = {
  threshold: 4,
  action: "highlight",
  enabled: true,
};

export function getLeechSettings(): LeechSettings {
  try {
    const raw = localStorage.getItem(LEECH_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_LEECH_SETTINGS };
    return { ...DEFAULT_LEECH_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_LEECH_SETTINGS };
  }
}

export function saveLeechSettings(settings: Partial<LeechSettings>): void {
  try {
    const current = getLeechSettings();
    localStorage.setItem(LEECH_SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
  } catch {}
}

/**
 * Check if a word qualifies as a "leech" (chronically forgotten)
 */
export function isLeech(srs: Partial<SRSReview>, settings?: LeechSettings): boolean {
  const { threshold, enabled } = settings || getLeechSettings();
  if (!enabled) return false;
  const lapses = srs.lapses ?? 0;
  return lapses >= threshold;
}

/**
 * Get all leech words from a word list
 */
export function getLeechWords(words: WordDetail[], settings?: LeechSettings): WordDetail[] {
  const s = settings || getLeechSettings();
  if (!s.enabled) return [];
  return words.filter((w) => isLeech(w.srs, s));
}

// ─── 3. ADAPTIVE QUEUE ORDERING ─────────────────────────────────────────────

export interface WordPriority {
  wordId: string;
  word: string;
  urgencyScore: number;
  factors: {
    overdueness: number;      // Based on retrievability drop
    difficulty: number;       // FSRS difficulty 1-10
    leechBonus: number;       // Extra priority for leeches
    lapsePenalty: number;     // Extra for frequently forgotten words
  };
}

/**
 * Calculate composite urgency score for a word.
 * Higher score = should be reviewed sooner.
 */
export function calculateUrgencyScore(
  word: WordDetail,
  now: Date = new Date()
): WordPriority {
  const srs = word.srs;
  const isNew = (srs.state ?? 0) === 0 && (srs.reps ?? 0) === 0;
  const leechSettings = getLeechSettings();

  // Factor 1: Overdueness — how far retrievability has dropped below the user's target retention.
  // New cards have no memory yet, so they are not "overdue".
  const targetRetention = getFSRSSettings().requestRetention;
  const R = isNew ? targetRetention : calculateRetrievability(srs, now);
  const overdueness = Math.max(0, (targetRetention - R) * 50);

  // Factor 2: Difficulty — harder words get slight priority
  const difficulty = isNew ? 0 : srs.difficulty ?? 5;

  // Factor 3: Leech bonus — leeches get strong priority
  const leechBonus = isLeech(srs, leechSettings) ? 25 : 0;

  // Factor 4: Lapse penalty — more lapses = more forgotten = more urgency
  const lapsePenalty = Math.min(15, (srs.lapses ?? 0) * 3);

  const isDue = srs.next_review_date ? new Date(srs.next_review_date).getTime() <= now.getTime() : true;
  // If card is not due yet, heavily downweight its urgency so it never outranks truly due cards
  const dueWeight = isDue ? 1 : 0.05;

  // Recent review cooldown: if reviewed within 60 minutes and already in Review state, heavily scale down urgency
  let cooldownWeight = 1;
  // Chỉ áp dụng cooldown cho thẻ đã học xong (State.Review = 2), KHÔNG phạt thẻ đang học (Learning/Relearning)
  if (srs.last_review && srs.state === 2) {
    const elapsedMinutes = (now.getTime() - new Date(srs.last_review).getTime()) / (60 * 1000);
    if (elapsedMinutes < 60) {
      cooldownWeight = Math.max(0.01, elapsedMinutes / 60);
    }
  }

  const rawScore = overdueness + difficulty + leechBonus + lapsePenalty;
  const urgencyScore = rawScore * dueWeight * cooldownWeight;

  return {
    wordId: word.id,
    word: word.word,
    urgencyScore,
    factors: {
      overdueness,
      difficulty,
      leechBonus,
      lapsePenalty,
    },
  };
}

function topicOf(word: WordDetail): string {
  return (word.topic || "General Tech").toLowerCase();
}

/**
 * Sort words for optimal review order using urgency scoring.
 * Returns a new array sorted by urgency (highest first), interleaved so that
 * no more than 2 consecutive words share a topic when an alternative exists.
 */
export function smartSortReviewQueue<T extends WordDetail>(
  words: T[],
  now: Date = new Date()
): T[] {
  const scored = words.filter((w) => !isPlaceholderMeaning(w.meaning_vn)).map((w) => ({
    word: w,
    score: calculateUrgencyScore(w, now).urgencyScore,
  }));
  scored.sort((a, b) => b.score - a.score);

  const result: T[] = [];
  const remaining = scored.map((s) => s.word);

  while (remaining.length > 0) {
    let chosen = 0;
    const n = result.length;
    if (n >= 2 && topicOf(result[n - 1]) === topicOf(result[n - 2])) {
      const blocked = topicOf(result[n - 1]);
      const alt = remaining.findIndex((w) => topicOf(w) !== blocked);
      if (alt !== -1) chosen = alt;
    }
    result.push(remaining.splice(chosen, 1)[0]);
  }

  return result;
}

export function isNewCard(word: WordDetail): boolean {
  return (word.srs.state ?? 0) === 0 && (word.srs.reps ?? 0) === 0;
}

export interface NewCardCounts {
  recognition: number; // brand-new words introduced today
  production: number; // recall cards started today
}

/**
 * Cards that received their first *scheduled* review today (local day), per direction.
 * Practice answers (is_scheduled = 0) never consume the budget, even if they came first.
 */
export async function getNewCardsIntroducedToday(): Promise<NewCardCounts> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ direction: string | null; cnt: number }>>(
    `SELECT COALESCE(direction, 'recognition') AS direction, COUNT(*) AS cnt FROM (
       SELECT word_id, COALESCE(direction, 'recognition') AS direction, MIN(timestamp) AS first_seen
       FROM review_logs
       WHERE is_scheduled IS NULL OR is_scheduled = 1
       GROUP BY word_id, COALESCE(direction, 'recognition')
     ) WHERE first_seen >= $1
     GROUP BY direction`,
    [getLocalStartOfDayIso()]
  );
  const counts: NewCardCounts = { recognition: 0, production: 0 };
  for (const r of rows) {
    if (r.direction === "production") counts.production = r.cnt;
    else counts.recognition = r.cnt;
  }
  return counts;
}

/**
 * Build a study session from due words:
 *  - every word contributes at most one due card per session (if both directions are due, the more
 *    urgent one), so recognition and recall of the same word are never drilled back to back
 *  - due review/learning cards first, ordered by urgency
 *  - cards never reviewed are a separate, budgeted stage per direction (newCardsPerDay each):
 *    brand-new words (recognition) and newly unlocked recall cards (production), oldest first,
 *    spread evenly through the session
 *  - whole session capped at maxSessionSize
 */
export function buildReviewSession(
  dueWords: WordDetail[],
  alreadyToday: NewCardCounts | number,
  now: Date = new Date()
): ReviewCard[] {
  const limits = getStudyLimits();
  const introduced: NewCardCounts =
    typeof alreadyToday === "number" ? { recognition: alreadyToday, production: 0 } : alreadyToday;
  // Words still waiting for AI analysis have no real meaning to review yet
  const ready = dueWords.filter((w) => !isPlaceholderMeaning(w.meaning_vn));
  const cards = ready.flatMap((w) => {
    const due = getDueCards(w, now);
    if (due.length <= 1) return due;
    return [due.reduce((a, b) =>
      calculateUrgencyScore(b, now).urgencyScore > calculateUrgencyScore(a, now).urgencyScore ? b : a
    )];
  });

  const reviewCards = smartSortReviewQueue(cards.filter((c) => !isNewCard(c)), now);
  const oldestFirst = (a: ReviewCard, b: ReviewCard) =>
    new Date(a.srs.next_review_date).getTime() - new Date(b.srs.next_review_date).getTime() ||
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  const newOf = (direction: ReviewCard["direction"], used: number) =>
    cards
      .filter((c) => isNewCard(c) && c.direction === direction)
      .sort(oldestFirst)
      .slice(0, Math.max(0, limits.newCardsPerDay - used));
  // Recall cards of known words first: they are cheaper and unlock real usage of the word
  const newCards = [...newOf("production", introduced.production), ...newOf("recognition", introduced.recognition)];

  // Guarantee up to 20% of the session for new cards so users don't get stuck only reviewing old cards
  const maxNewCards = Math.ceil(limits.maxSessionSize * 0.2);
  const newSlice = newCards.slice(0, maxNewCards);
  const maxReviewCards = limits.maxSessionSize - newSlice.length;
  const reviewSlice = reviewCards.slice(0, maxReviewCards);
  if (newSlice.length === 0) return reviewSlice;
  if (reviewSlice.length === 0) return newSlice;

  const result: ReviewCard[] = [];
  const gap = reviewSlice.length / newSlice.length;
  let nextNewAt = gap / 2;
  let newIdx = 0;
  for (let i = 0; i < reviewSlice.length; i++) {
    result.push(reviewSlice[i]);
    while (newIdx < newSlice.length && i + 1 >= nextNewAt) {
      result.push(newSlice[newIdx++]);
      nextNewAt += gap;
    }
  }
  while (newIdx < newSlice.length) result.push(newSlice[newIdx++]);
  return result;
}

// ─── 3b. RATING DERIVATION ─────────────────────────────────────────────────


/** Correct answers slower than this (ms) are graded Hard */
const SLOW_RESPONSE_MS: Partial<Record<ExerciseType, number>> = {
  multiple_choice: 20000,
  context_match: 40000,
  meaning_match: 60000,
  sentence_builder: 60000,
  reverse_cloze: 30000,
  spelling: 30000,
  cloze: 35000,
  listening: 35000,
};

export interface AnswerOutcome {
  exerciseType: ExerciseType;
  wrongAttempts: number;
  usedHint?: boolean;
  nearMiss?: boolean; // Accepted with a small typo
  responseTimeMs: number;
  srs?: Partial<SRSReview>;
}

/**
 * Map an exercise outcome to an FSRS grade following FSRS semantics:
 *  - any wrong attempt means the memory failed -> Again
 *  - hint / small typo -> Hard
 *  - correct on first try -> Good
 *  - a correct but very slow answer -> Hard
 *  - super fast correct answer -> Easy
 */
export function deriveRating(outcome: AnswerOutcome): Rating {
  if (outcome.wrongAttempts > 0) return Rating.Again;
  if (outcome.usedHint || outcome.nearMiss) return Rating.Hard;
  
  // Super fast response (< 3s) gets Easy, as it shows strong mastery.
  // For long reading exercises, < 5s gets Easy.
  const isReadingExercise = outcome.exerciseType === "context_match" || outcome.exerciseType === "sentence_builder" || outcome.exerciseType === "cloze";
  const fastThreshold = isReadingExercise ? 5000 : 3000;
  if (outcome.responseTimeMs > 0 && outcome.responseTimeMs < fastThreshold) return Rating.Easy;

  // Response time only ever lowers the grade: a correct but very slow answer was a struggle.
  const slowMs = SLOW_RESPONSE_MS[outcome.exerciseType];
  if (slowMs && outcome.responseTimeMs > slowMs) return Rating.Hard;
  return Rating.Good;
}

/**
 * Levenshtein distance with early exit once it exceeds `max`.
 */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export type TypedAnswerMatch = "exact" | "near" | "wrong";

/**
 * Compare a typed answer with the target word.
 * "near" = one-letter typo on words of 5+ letters, or a simple inflection (s/es/ed/d/ing) of the target.
 */
export function matchTypedAnswer(input: string, target: string, sentence?: string): TypedAnswerMatch {
  const guess = input.trim().toLowerCase().replace(/\s+/g, " ");
  const answer = target.trim().toLowerCase().replace(/\s+/g, " ");
  if (!guess) return "wrong";
  if (guess === answer) return "exact";
  // Symbols matter for terms like "c++" / "c#", so only loosen the match for plain words:
  // case, curly quotes, contractions ("don't" = "do not"), punctuation and spacing
  const isPlainWord = /^[a-z\s'\u2019-]+$/i.test(target.trim());
  const normGuess = normalizeTypedText(input);
  if (isPlainWord && normGuess === normalizeTypedText(target)) return "exact";
  // The learner retyped the whole context sentence (which contains the word) instead of the blank
  if (sentence && new RegExp(wordFormsPattern(target), "i").test(sentence) && normGuess === normalizeTypedText(sentence)) {
    return "exact";
  }
  if (/^(s|es|ed|d|ing)$/.test(guess.startsWith(answer) ? guess.slice(answer.length) : "")) return "near";
  if (answer.length >= 5 && editDistance(guess, answer, 1) <= 1) return "near";
  return "wrong";
}

// ─── 4. REVIEW LOG ──────────────────────────────────────────────────────────

export type ExerciseType = "flip" | "cloze" | "spelling" | "multiple_choice" | "context_match" | "meaning_match" | "sentence_builder" | "reverse_cloze" | "listening";

export interface ReviewLogEntry {
  id: string;
  wordId: string;
  exerciseType: ExerciseType;
  responseTimeMs: number;
  isCorrect: boolean;
  wrongAttempts: number;
  rating: number;          // FSRS Rating value
  xpEarned: number;
  timestamp: string;       // ISO
  isScheduled: boolean | null; // true = updated the FSRS schedule, false = practice only, null = legacy row
  direction?: CardDirection | null; // card the answer was recorded on (null = legacy row, recognition)
}

/**
 * Initialize the review_logs table in SQLite
 */
export async function initReviewLogsTable(existingDb?: Database): Promise<void> {
  const db = existingDb || (await getDatabase());
  await db.execute(`
    CREATE TABLE IF NOT EXISTS review_logs (
      id TEXT PRIMARY KEY,
      word_id TEXT NOT NULL,
      exercise_type TEXT NOT NULL DEFAULT 'flip',
      response_time_ms INTEGER NOT NULL DEFAULT 0,
      is_correct INTEGER NOT NULL DEFAULT 1,
      wrong_attempts INTEGER NOT NULL DEFAULT 0,
      rating INTEGER NOT NULL DEFAULT 3,
      xp_earned INTEGER NOT NULL DEFAULT 0,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_scheduled INTEGER,
      FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
    );
  `);
  try {
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_review_logs_word ON review_logs(word_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_review_logs_time ON review_logs(timestamp);`);
  } catch {}
}

/**
 * Record a review log entry
 */
export async function saveReviewLog(entry: Omit<ReviewLogEntry, "id">): Promise<string> {
  const db = await getDatabase();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO review_logs (id, word_id, exercise_type, response_time_ms, is_correct, wrong_attempts, rating, xp_earned, timestamp, is_scheduled, direction)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id, entry.wordId, entry.exerciseType, entry.responseTimeMs, entry.isCorrect ? 1 : 0, entry.wrongAttempts,
      entry.rating, entry.xpEarned, entry.timestamp, entry.isScheduled ? 1 : 0,
      entry.direction ?? directionForExercise(entry.exerciseType),
    ]
  );
  return id;
}

/**
 * Get recent review logs for a specific word
 */
export async function getWordReviewLogs(wordId: string, limit: number = 20): Promise<ReviewLogEntry[]> {
  const db = await getDatabase();
  const rows = await db.select<Array<{
    id: string;
    word_id: string;
    exercise_type: string;
    response_time_ms: number;
    is_correct: number;
    wrong_attempts: number;
    rating: number;
    xp_earned: number;
    timestamp: string;
    is_scheduled: number | null;
    direction?: string | null;
  }>>(
    `SELECT id, word_id, exercise_type, response_time_ms, is_correct, wrong_attempts, rating, xp_earned, timestamp, is_scheduled, direction FROM review_logs WHERE word_id = $1 ORDER BY timestamp DESC LIMIT $2`,
    [wordId, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    wordId: r.word_id,
    exerciseType: r.exercise_type as ExerciseType,
    responseTimeMs: r.response_time_ms,
    isCorrect: r.is_correct === 1,
    wrongAttempts: r.wrong_attempts,
    rating: r.rating,
    xpEarned: r.xp_earned,
    timestamp: r.timestamp,
    isScheduled: r.is_scheduled === null || r.is_scheduled === undefined ? null : r.is_scheduled === 1,
    direction: (r.direction as CardDirection) || undefined,
  }));
}

/**
 * Get average response time for a word (ms)
 */
export async function getAverageResponseTime(wordId: string): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ avg_time: number | null }>>(
    `SELECT AVG(response_time_ms) as avg_time FROM review_logs WHERE word_id = $1 AND is_correct = 1`,
    [wordId]
  );
  return rows[0]?.avg_time ?? 0;
}

/**
 * Get total review count for today
 */
export async function getTodayReviewCount(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ cnt: number }>>(
    `SELECT COUNT(*) as cnt FROM review_logs WHERE timestamp >= $1`,
    [getLocalStartOfDayIso()]
  );
  return rows[0]?.cnt ?? 0;
}

// ─── 5. XP SYSTEM ───────────────────────────────────────────────────────────

const XP_STORAGE_KEY = "myenglish_xp_v1";
const XP_LOG_KEY = "myenglish_xp_log_v1";

export interface XPState {
  totalXP: number;
  level: number;
  rank: string;
  rankEmoji: string;
  currentLevelXP: number;    // XP within current level
  nextLevelXP: number;       // XP needed for next level
  progressPercent: number;   // % towards next level
  todayXP: number;
}

interface XPDailyLog {
  [dateStr: string]: number;
}

const LEVEL_THRESHOLDS = [
  { maxXP: 100, rank: "Beginner", emoji: "🌱" },
  { maxXP: 200, rank: "Beginner", emoji: "🌱" },
  { maxXP: 350, rank: "Beginner", emoji: "🌱" },
  { maxXP: 500, rank: "Beginner", emoji: "🌱" },
  { maxXP: 700, rank: "Beginner", emoji: "🌱" },
  { maxXP: 1000, rank: "Learner", emoji: "📚" },
  { maxXP: 1400, rank: "Learner", emoji: "📚" },
  { maxXP: 1800, rank: "Learner", emoji: "📚" },
  { maxXP: 2200, rank: "Learner", emoji: "📚" },
  { maxXP: 2700, rank: "Learner", emoji: "📚" },
  { maxXP: 3300, rank: "Explorer", emoji: "🧭" },
  { maxXP: 4000, rank: "Explorer", emoji: "🧭" },
  { maxXP: 4800, rank: "Explorer", emoji: "🧭" },
  { maxXP: 5700, rank: "Explorer", emoji: "🧭" },
  { maxXP: 6700, rank: "Explorer", emoji: "🧭" },
  { maxXP: 7800, rank: "Achiever", emoji: "⚡" },
  { maxXP: 9000, rank: "Achiever", emoji: "⚡" },
  { maxXP: 10500, rank: "Achiever", emoji: "⚡" },
  { maxXP: 12500, rank: "Achiever", emoji: "⚡" },
  { maxXP: 15000, rank: "Achiever", emoji: "⚡" },
  { maxXP: 18000, rank: "Expert", emoji: "🏅" },
  { maxXP: 22000, rank: "Expert", emoji: "🏅" },
  { maxXP: 27000, rank: "Expert", emoji: "🏅" },
  { maxXP: 33000, rank: "Expert", emoji: "🏅" },
  { maxXP: 40000, rank: "Expert", emoji: "🏅" },
  { maxXP: 48000, rank: "Master", emoji: "👑" },
  { maxXP: 57000, rank: "Master", emoji: "👑" },
  { maxXP: 67000, rank: "Master", emoji: "👑" },
  { maxXP: 78000, rank: "Master", emoji: "👑" },
  { maxXP: 90000, rank: "Master", emoji: "👑" },
];

function getLevelFromXP(totalXP: number): { level: number; rank: string; emoji: string; currentLevelXP: number; nextLevelXP: number } {
  let prevThreshold = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalXP < LEVEL_THRESHOLDS[i].maxXP) {
      return {
        level: i + 1,
        rank: LEVEL_THRESHOLDS[i].rank,
        emoji: LEVEL_THRESHOLDS[i].emoji,
        currentLevelXP: totalXP - prevThreshold,
        nextLevelXP: LEVEL_THRESHOLDS[i].maxXP - prevThreshold,
      };
    }
    prevThreshold = LEVEL_THRESHOLDS[i].maxXP;
  }
  // Beyond max level
  return {
    level: LEVEL_THRESHOLDS.length + 1,
    rank: "Legend",
    emoji: "💎",
    currentLevelXP: totalXP - prevThreshold,
    nextLevelXP: 15000, // repeating pattern
  };
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getTodayStr(): string {
  return localDateKey(new Date());
}

function getLocalStartOfDayIso(): string {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
}

/**
 * Get current XP state
 */
export function getXPState(): XPState {
  try {
    const totalXP = parseInt(localStorage.getItem(XP_STORAGE_KEY) || "0", 10) || 0;
    const level = getLevelFromXP(totalXP);
    const logs: XPDailyLog = JSON.parse(localStorage.getItem(XP_LOG_KEY) || "{}");
    const todayXP = logs[getTodayStr()] || 0;

    return {
      totalXP,
      level: level.level,
      rank: level.rank,
      rankEmoji: level.emoji,
      currentLevelXP: level.currentLevelXP,
      nextLevelXP: level.nextLevelXP,
      progressPercent: Math.min(100, Math.round((level.currentLevelXP / level.nextLevelXP) * 100)),
      todayXP,
    };
  } catch {
    return {
      totalXP: 0, level: 1, rank: "Beginner", rankEmoji: "🌱",
      currentLevelXP: 0, nextLevelXP: 100, progressPercent: 0, todayXP: 0,
    };
  }
}

/**
 * Calculate XP earned for a review action
 */
export interface XPReward {
  baseXP: number;
  bonusXP: number;
  totalXP: number;
  bonusReasons: string[];
}

export function calculateXPReward(
  rating: Rating,
  exerciseType: ExerciseType,
  wrongAttempts: number,
  responseTimeMs: number,
  isLeechWord: boolean,
  isFirstTry: boolean,
  consecutiveCorrect: number = 0
): XPReward {
  const bonusReasons: string[] = [];
  let baseXP = 0;
  let bonusXP = 0;

  // Base XP by rating
  switch (rating) {
    case Rating.Again: baseXP = 5; break;
    case Rating.Hard: baseXP = 8; break;
    case Rating.Good: baseXP = 10; break;
    case Rating.Easy: baseXP = 15; break;
    default: baseXP = 5;
  }

  // Exercise difficulty bonus (harder exercises = more XP)
  if (exerciseType === "spelling" || exerciseType === "listening") {
    bonusXP += 5;
    bonusReasons.push("Luyện gõ/nghe +5");
  } else if (exerciseType === "cloze" || exerciseType === "reverse_cloze" || exerciseType === "sentence_builder") {
    bonusXP += 3;
    bonusReasons.push("Bài tập nâng cao +3");
  }

  // First try bonus
  if (isFirstTry && wrongAttempts === 0 && (rating === Rating.Good || rating === Rating.Easy)) {
    bonusXP += 5;
    bonusReasons.push("🎯 Đúng ngay +5");
  }

  // Speed bonus (< 5 seconds for correct answer)
  if (responseTimeMs > 0 && responseTimeMs < 5000 && rating >= Rating.Good) {
    bonusXP += 3;
    bonusReasons.push("⚡ Nhanh +3");
  }

  // Leech slayer bonus
  if (isLeechWord && (rating === Rating.Good || rating === Rating.Easy)) {
    bonusXP += 10;
    bonusReasons.push("🗡️ Leech Slayer +10");
  }

  // Combo multiplier
  let totalXP = baseXP + bonusXP;
  if (consecutiveCorrect >= 10) {
    totalXP = Math.round(totalXP * 1.5);
    bonusReasons.push("🔥 Combo x10! (+50%)");
  } else if (consecutiveCorrect >= 5) {
    totalXP = Math.round(totalXP * 1.2);
    bonusReasons.push("🔥 Combo x5! (+20%)");
  } else if (consecutiveCorrect >= 3) {
    totalXP = Math.round(totalXP * 1.1);
    bonusReasons.push("🔥 Combo x3! (+10%)");
  }

  return {
    baseXP,
    bonusXP,
    totalXP,
    bonusReasons,
  };
}

/**
 * Award XP and persist
 */
export function awardXP(amount: number): { previousLevel: number; newLevel: number; leveledUp: boolean } {
  if (amount <= 0) return { previousLevel: 1, newLevel: 1, leveledUp: false };

  try {
    const previousState = getXPState();
    const newTotal = previousState.totalXP + amount;
    localStorage.setItem(XP_STORAGE_KEY, String(newTotal));

    // Update daily log
    const logs: XPDailyLog = JSON.parse(localStorage.getItem(XP_LOG_KEY) || "{}");
    const today = getTodayStr();
    logs[today] = (logs[today] || 0) + amount;
    localStorage.setItem(XP_LOG_KEY, JSON.stringify(logs));

    const newState = getXPState();
    const leveledUp = newState.level > previousState.level;

    // Dispatch event for UI updates
    window.dispatchEvent(new CustomEvent("myenglish-xp-updated", {
      detail: { amount, totalXP: newTotal, leveledUp, newLevel: newState.level },
    }));

    return {
      previousLevel: previousState.level,
      newLevel: newState.level,
      leveledUp,
    };
  } catch {
    return { previousLevel: 1, newLevel: 1, leveledUp: false };
  }
}

// ─── 6. WORD STATS SUMMARY ─────────────────────────────────────────────────

export interface WordStatsSummary {
  totalWords: number;
  newCount: number;
  learningCount: number;
  reviewCount: number;
  masteredCount: number;  // stability > 21 days
  leechCount: number;
  avgRetrievability: number;
  criticalCount: number;  // R < 0.7
}

export function getWordStatsSummary(words: WordDetail[]): WordStatsSummary {
  const leechSettings = getLeechSettings();
  let totalR = 0;
  let rCount = 0;
  let newCount = 0;
  let learningCount = 0;
  let reviewCount = 0;
  let masteredCount = 0;
  let leechCount = 0;
  let criticalCount = 0;

  const now = new Date();

  for (const w of words) {
    const state = w.srs.state ?? 0;
    if (state === 0 && (!w.srs.reps || w.srs.reps === 0)) {
      newCount++;
    } else if (state === 1 || state === 3) {
      learningCount++;
    } else {
      reviewCount++;
      if ((w.srs.stability ?? 0) > 21) {
        masteredCount++;
      }
    }

    if (isLeech(w.srs, leechSettings)) {
      leechCount++;
    }

    const R = calculateRetrievability(w.srs, now);
    if (R > 0) {
      totalR += R;
      rCount++;
    }
    if (R > 0 && R < 0.7) {
      criticalCount++;
    }
  }

  return {
    totalWords: words.length,
    newCount,
    learningCount,
    reviewCount,
    masteredCount,
    leechCount,
    avgRetrievability: rCount > 0 ? totalR / rCount : 0,
    criticalCount,
  };
}

// ─── 7. ADAPTIVE EXERCISE SELECTION ─────────────────────────────────────────

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Automatically choose optimal exercise type based on FSRS memory state:
 * - State 0 (New): Recognition focus (Flip, Multiple Choice, Context Match)
 * - State 1 (Learning): Mix recognition & production (Multiple Choice, Sentence Builder, Cloze)
 * - State 3 (Relearning): High-urgency production (Spelling, Listening)
 * - State 2 (Review): Challenge recall (Cloze, Spelling, Reverse Cloze, Listening)
 */
export function selectExerciseType(card: WordDetail & { direction?: CardDirection }): ExerciseType {
  const { state = 0, difficulty = 5, reps = 0 } = card.srs || {};
  const hasExamples = card.examples && card.examples.length > 0 && card.examples[0].sentence_en.trim().length > 0;
  const withExamples = (types: ExerciseType[], fallback: ExerciseType[]): ExerciseType =>
    randomFrom(hasExamples ? types : fallback);

  if ((card.direction ?? "recognition") === "production") {
    // Recall the English word. Leeches and forgotten cards get the hardest drills.
    if (isLeech(card.srs) || state === 3) return randomFrom(["spelling", "listening"]);
    // Still learning recall: a sentence context (cloze) makes the first attempts easier
    if (state === 0 || state === 1 || reps === 0) return withExamples(["cloze", "spelling"], ["spelling"]);
    if (difficulty >= 7) return randomFrom(["spelling", "listening"]);
    return withExamples(["cloze", "spelling", "listening"], ["spelling", "listening"]);
  }

  // Recognition: understand the word when reading/hearing it.
  // A brand-new word is shown first (flip card): quizzing a word never seen means guessing, and a
  // lucky guess would be graded Good and push the next review too far.
  if (state === 0 || reps === 0) return "flip";
  if (state === 1 || state === 3 || isLeech(card.srs)) {
    return withExamples(["multiple_choice", "sentence_builder", "meaning_match", "flip"], ["multiple_choice", "meaning_match", "flip"]);
  }
  return withExamples(
    ["multiple_choice", "meaning_match", "context_match", "reverse_cloze", "sentence_builder"],
    ["multiple_choice", "meaning_match", "flip"]
  );
}

// ─── 8. EXERCISE DATA GENERATORS ────────────────────────────────────────────

export interface MultipleChoiceOption {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface MultipleChoiceQuestion {
  promptType: "en_to_vn" | "vn_to_en";
  question: string;
  subPrompt?: string;
  phonetic?: string | null;
  partOfSpeech?: string | null;
  options: MultipleChoiceOption[];
}

/**
 * Truncate/clean Vietnamese meaning for concise multiple choice display
 */
export function cleanMeaningForOption(meaning: string): string {
  if (!meaning) return "";
  let text = meaning.split(/[;\n]/)[0].trim();
  // Strip parentheses explanations if too long
  if (text.length > 60) {
    text = text.replace(/\s*\([^)]*\)/g, "").trim();
  }
  if (text.length > 50) {
    text = text.substring(0, 47) + "...";
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Generate 4 options for multiple choice quiz:
 * Prioritizes distractors from the same topic and similar difficulty.
 */
export function generateMultipleChoiceQuestion(
  targetWord: WordDetail,
  allWords: WordDetail[],
  promptType: "en_to_vn" | "vn_to_en" = "en_to_vn"
): MultipleChoiceQuestion {
  const otherWords = allWords.filter(
    (w) => w.id !== targetWord.id && w.word.trim().toLowerCase() !== targetWord.word.trim().toLowerCase()
  );

  // Plausible distractors are harder to rule out: same topic first, then same part of speech.
  // Shuffled before the (stable) sort so equally similar words are picked at random.
  const targetTopic = (targetWord.topic || "").toLowerCase();
  const targetPos = (targetWord.part_of_speech || "").toLowerCase();
  const similarity = (w: WordDetail) =>
    ((w.topic || "").toLowerCase() === targetTopic ? 2 : 0) +
    (targetPos && (w.part_of_speech || "").toLowerCase() === targetPos ? 1 : 0);
  const ranked = [...otherWords]
    .sort(() => 0.5 - Math.random())
    .sort((x, y) => similarity(y) - similarity(x));

  // Displayed text of an option; options that look identical to another one are skipped
  const displayKey = (w: WordDetail) =>
    (promptType === "en_to_vn" ? cleanMeaningForOption(w.meaning_vn) : w.word).trim().toLowerCase();
  const usedTexts = new Set<string>([displayKey(targetWord)]);

  const selectedDistractors: WordDetail[] = [];
  for (const next of ranked) {
    if (selectedDistractors.length >= 3) break;
    const key = displayKey(next);
    if (!key || usedTexts.has(key)) continue;
    usedTexts.add(key);
    selectedDistractors.push(next);
  }

  // Fallbacks if deck is too small (skip ones equal to an existing option)
  const fallbackVN = ["Tối ưu hoá hiệu suất", "Cấu trúc dữ liệu lồng nhau", "Xử lý bất đồng bộ", "Khả năng mở rộng hệ thống", "Kiểm thử tự động"]
    .filter((t) => !usedTexts.has(t.toLowerCase()));
  const fallbackEN = ["refactor", "optimize", "scalability", "pipeline", "deployment"]
    .filter((t) => !usedTexts.has(t.toLowerCase()));

  let options: MultipleChoiceOption[] = [];

  if (promptType === "en_to_vn") {
    // Question: English word -> Answer: Vietnamese meaning
    options.push({
      id: targetWord.id,
      text: cleanMeaningForOption(targetWord.meaning_vn),
      isCorrect: true,
      explanation: targetWord.meaning_vn,
    });

    selectedDistractors.forEach((d) => {
      options.push({
        id: d.id,
        text: cleanMeaningForOption(d.meaning_vn),
        isCorrect: false,
        explanation: `${d.word}: ${cleanMeaningForOption(d.meaning_vn)}`,
      });
    });

    let fbIdx = 0;
    while (options.length < 4 && fbIdx < fallbackVN.length) {
      options.push({
        id: `fallback-${fbIdx}`,
        text: fallbackVN[fbIdx % fallbackVN.length],
        isCorrect: false,
      });
      fbIdx++;
    }

    // Shuffle options
    options = options.sort(() => 0.5 - Math.random());

    return {
      promptType,
      question: targetWord.word,
      subPrompt: "Chọn định nghĩa tiếng Việt chính xác nhất",
      phonetic: targetWord.phonetic,
      partOfSpeech: targetWord.part_of_speech,
      options,
    };
  } else {
    // Question: Vietnamese meaning -> Answer: English word
    options.push({
      id: targetWord.id,
      text: targetWord.word,
      isCorrect: true,
    });

    selectedDistractors.forEach((d) => {
      options.push({
        id: d.id,
        text: d.word,
        isCorrect: false,
      });
    });

    let fbIdx = 0;
    while (options.length < 4 && fbIdx < fallbackEN.length) {
      options.push({
        id: `fallback-${fbIdx}`,
        text: fallbackEN[fbIdx % fallbackEN.length],
        isCorrect: false,
      });
      fbIdx++;
    }

    options = options.sort(() => 0.5 - Math.random());

    return {
      promptType,
      question: cleanMeaningForOption(targetWord.meaning_vn),
      subPrompt: "Chọn thuật ngữ tiếng Anh phù hợp",
      phonetic: targetWord.phonetic,
      partOfSpeech: targetWord.part_of_speech,
      options,
    };
  }
}

/**
 * Sentence Builder: Splits example sentence into 4-8 shuffled word/phrase tiles
 */
export interface SentenceBuilderData {
  fullSentence: string;
  meaningVN?: string;
  tokens: Array<{ id: string; text: string }>;
  targetWord: string;
}

export function prepareSentenceBuilder(word: WordDetail): SentenceBuilderData | null {
  const example = word.examples?.[0];
  if (!example || !example.sentence_en || example.sentence_en.trim().length === 0) {
    return null;
  }

  const rawSentence = example.sentence_en.trim();
  // Split into tokens (words while keeping basic punctuation attached or grouped)
  const rawWords = rawSentence.split(/\s+/).filter(Boolean);

  if (rawWords.length < 3) return null;

  // If sentence is very long (> 12 words), slice around the target word to keep exercise engaging & manageable
  let wordsToUse = rawWords;
  if (rawWords.length > 10) {
    const targetIdx = rawWords.findIndex((w) =>
      w.toLowerCase().includes(word.word.toLowerCase())
    );
    if (targetIdx !== -1) {
      const start = Math.max(0, targetIdx - 4);
      const end = Math.min(rawWords.length, start + 9);
      wordsToUse = rawWords.slice(start, end);
    } else {
      wordsToUse = rawWords.slice(0, 9);
    }
  }

  const fullSentence = wordsToUse.join(" ");

  const tokens = wordsToUse.map((text, idx) => ({
    id: `token-${idx}-${text}`,
    text,
  }));

  // Shuffle tokens (ensure it is actually shuffled if length > 1)
  let shuffledTokens = [...tokens].sort(() => 0.5 - Math.random());
  if (tokens.length > 1 && shuffledTokens.every((t, idx) => t.id === tokens[idx].id)) {
    shuffledTokens = [shuffledTokens[1], shuffledTokens[0], ...shuffledTokens.slice(2)];
  }

  return {
    fullSentence,
    meaningVN: example.sentence_vn || word.meaning_vn,
    tokens: shuffledTokens,
    targetWord: word.word,
  };
}

/**
 * Context Match: Pair 3 words with 3 cloze-masked contextual sentences
 */
export interface ContextMatchPair {
  wordId: string;
  word: string;
  maskedSentence: string;
  fullSentence: string;
  meaningVN: string;
}

export function prepareContextMatch(
  primaryWord: WordDetail,
  allWords: WordDetail[]
): ContextMatchPair[] {
  const pairs: ContextMatchPair[] = [];
  const usedWords = new Set<string>();
  const usedMeanings = new Set<string>();

  const tryAdd = (w: WordDetail): boolean => {
    const wordKey = w.word.trim().toLowerCase();
    const meaningKey = cleanMeaningForOption(w.meaning_vn || "").trim().toLowerCase();
    if (!wordKey || usedWords.has(wordKey) || (meaningKey && usedMeanings.has(meaningKey))) return false;

    // Use the first example where the word can actually be masked
    for (const ex of w.examples || []) {
      const sentence = ex?.sentence_en?.trim();
      if (!sentence) continue;
      const masked = maskWordInSentence(sentence, w.word);
      if (!masked) continue;
      usedWords.add(wordKey);
      if (meaningKey) usedMeanings.add(meaningKey);
      pairs.push({
        wordId: w.id,
        word: w.word,
        maskedSentence: masked,
        fullSentence: sentence,
        meaningVN: w.meaning_vn,
      });
      return true;
    }
    return false;
  };

  // The card being reviewed must be part of the set
  if (!tryAdd(primaryWord)) return [];

  const shuffledOthers = allWords
    .filter((w) => w.id !== primaryWord.id && w.examples && w.examples.length > 0)
    .sort(() => 0.5 - Math.random());
  for (const other of shuffledOthers) {
    if (pairs.length >= 3) break;
    tryAdd(other);
  }

  // Caller falls back to another exercise when fewer than 3 pairs come back
  return pairs;
}

/** Escape a string for literal use inside a RegExp. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-word regex source for `word` plus common inflections.
 * Uses \w lookarounds instead of \b so words like "c++", "c#" or ".net" still match.
 */
export function wordFormsPattern(word: string): string {
  const w = word.trim();
  const forms = new Set<string>([escapeRegExp(w)]);
  if (/^[a-z]+$/i.test(w)) {
    const lower = w.toLowerCase();
    const suffixes = ["s", "es", "ed", "d", "ing"];
    suffixes.forEach((s) => forms.add(escapeRegExp(w + s)));
    if (lower.endsWith("e")) {
      forms.add(escapeRegExp(w.slice(0, -1) + "ing"));
    }
    if (/[^aeiou]y$/.test(lower)) {
      forms.add(escapeRegExp(w.slice(0, -1) + "ies"));
      forms.add(escapeRegExp(w.slice(0, -1) + "ied"));
    }
    if (/[^aeiou][aeiou][bdgklmnprt]$/.test(lower)) {
      const last = w.slice(-1);
      forms.add(escapeRegExp(w + last + "ed"));
      forms.add(escapeRegExp(w + last + "ing"));
    }
  }
  // Longest first so "stopped" wins over "stop"
  const alts = [...forms].sort((a, b) => b.length - a.length).join("|");
  return `(?<![\\w])(?:${alts})(?![\\w])`;
}

/** Replace the first occurrence of `word` (or an inflection) with a blank; null when not found. */
export function maskWordInSentence(sentence: string, word: string, blank = "______"): string | null {
  if (!word.trim()) return null;
  const match = new RegExp(wordFormsPattern(word), "i").exec(sentence);
  if (!match) return null;
  return sentence.slice(0, match.index) + blank + sentence.slice(match.index + match[0].length);
}

/**
 * Normalize a typed answer for comparison: case, curly quotes, common contractions, punctuation, whitespace.
 * "'s" and "'d" are ambiguous (is/has, had/would) so they are left alone.
 */
export function normalizeTypedText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ´`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bcan't\b/g, "can not")
    .replace(/\bshan't\b/g, "shall not")
    .replace(/\bcannot\b/g, "can not")
    .replace(/n't\b/g, " not")
    .replace(/'re\b/g, " are")
    .replace(/'ll\b/g, " will")
    .replace(/'ve\b/g, " have")
    .replace(/\bi'm\b/g, "i am")
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A blank in a grammar prompt: "[not work]" or "_____" with an optional "(verb)" hint */
const PROMPT_BLANK_RE = /\[[^\]]*\]|_{3,}(?:\s*\([^)]*\))?/g;

/**
 * The prompt with its blank(s) filled by `answer`, or null when it has no blank.
 * Several blanks take the "/"-separated parts in order ("a / the").
 */
export function fillPromptBlanks(prompt: string, answer: string): string | null {
  const blanks = prompt.match(PROMPT_BLANK_RE);
  if (!blanks) return null;
  const parts = blanks.length === 1 ? [answer] : answer.split(/\s*\/\s*/);
  if (parts.length !== blanks.length) return null;
  let i = 0;
  return prompt.replace(PROMPT_BLANK_RE, () => parts[i++]);
}

interface GradableExercise {
  type: string;
  promptEn: string;
  correctAnswer: string | string[];
  errorWord?: string;
}

/**
 * Whether a typed or picked answer solves a grammar exercise. Accepts the answer alone or the whole
 * sentence with it filled in ("She does not work on Sunday." for "She [not work] on Sunday."),
 * with contractions, case, curly quotes, punctuation and spacing ignored.
 */
export function isGrammarAnswerCorrect(input: string, ex: GradableExercise): boolean {
  const user = normalizeTypedText(input);
  if (!user) return false;
  const answers = (Array.isArray(ex.correctAnswer) ? ex.correctAnswer : [ex.correctAnswer]).filter(Boolean);
  if (ex.errorWord) answers.push(ex.errorWord);
  const targets = answers.map(normalizeTypedText);
  // In error spotting the brackets mark clickable words, not a blank to fill
  if (ex.type !== "error_spotting") {
    for (const a of answers) {
      const sentence = fillPromptBlanks(ex.promptEn, a);
      if (sentence) targets.push(normalizeTypedText(sentence));
    }
  }
  return targets.includes(user);
}

/** Full form -> contraction pairs used to show equivalent answers ("does not" / "doesn't") */
const CONTRACTIONS: Array<[string, string]> = [
  ["do not", "don't"], ["does not", "doesn't"], ["did not", "didn't"],
  ["is not", "isn't"], ["are not", "aren't"], ["was not", "wasn't"], ["were not", "weren't"],
  ["have not", "haven't"], ["has not", "hasn't"], ["had not", "hadn't"],
  ["will not", "won't"], ["would not", "wouldn't"], ["should not", "shouldn't"],
  ["could not", "couldn't"], ["must not", "mustn't"], ["cannot", "can't"], ["can not", "can't"],
  ["i am", "i'm"], ["you are", "you're"], ["we are", "we're"], ["they are", "they're"],
  ["i will", "i'll"], ["you will", "you'll"], ["we will", "we'll"], ["they will", "they'll"],
  ["i have", "i've"], ["you have", "you've"], ["we have", "we've"], ["they have", "they've"],
];

/**
 * Other accepted spellings of an answer: contracted <-> full forms
 * ("doesn't crash" -> ["does not crash"]). All of them pass normalizeTypedText equality.
 */
export function contractionVariants(answer: string): string[] {
  const variants = new Set<string>();
  for (const [full, short] of CONTRACTIONS) {
    const swap = (from: string, to: string) => {
      const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, "gi");
      if (re.test(answer)) {
        variants.add(answer.replace(re, (m) => (m[0] === m[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to)));
      }
    };
    swap(full, short);
    swap(short, full);
  }
  variants.delete(answer);
  return Array.from(variants);
}

// ─── 9. REVIEW ANALYTICS & STATS ────────────────────────────────────────────

export interface ReviewAnalyticsData {
  totalReviews: number;
  correctReviews: number;
  accuracyRate: number;      // 0..100%
  averageResponseTimeMs: number;
  dailyTrends: Array<{ date: string; count: number; accuracy: number }>;
  exerciseDistribution: Record<ExerciseType, number>;
}

export async function getReviewAnalytics(days: number = 14): Promise<ReviewAnalyticsData> {
  const db = await getDatabase();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  const logs = await db.select<Array<{
    exercise_type: string;
    response_time_ms: number;
    is_correct: number;
    timestamp: string;
  }>>(
    `SELECT exercise_type, response_time_ms, is_correct, timestamp
     FROM review_logs
     WHERE timestamp >= $1
     ORDER BY timestamp ASC`,
    [cutoffStr]
  );

  const totalReviews = logs.length;
  const correctReviews = logs.filter((l) => l.is_correct === 1).length;
  const accuracyRate = totalReviews > 0 ? Math.round((correctReviews / totalReviews) * 100) : 0;
  const avgTime =
    totalReviews > 0
      ? Math.round(logs.reduce((sum, l) => sum + (l.response_time_ms || 0), 0) / totalReviews)
      : 0;

  // Daily grouping
  const dayMap: Record<string, { count: number; correct: number }> = {};
  const exerciseDistribution: Record<ExerciseType, number> = {
    flip: 0,
    cloze: 0,
    spelling: 0,
    multiple_choice: 0,
    context_match: 0,
    sentence_builder: 0,
    reverse_cloze: 0,
    listening: 0,
  };

  logs.forEach((log) => {
    // Group by the learner's local day, not the UTC day of the ISO timestamp
    const parsed = new Date(log.timestamp);
    const dateKey = isNaN(parsed.getTime()) ? log.timestamp.substring(0, 10) : localDateKey(parsed);
    if (!dayMap[dateKey]) dayMap[dateKey] = { count: 0, correct: 0 };
    dayMap[dateKey].count++;
    if (log.is_correct === 1) dayMap[dateKey].correct++;

    const exType = (log.exercise_type || "flip") as ExerciseType;
    if (exerciseDistribution[exType] !== undefined) {
      exerciseDistribution[exType]++;
    } else {
      exerciseDistribution.flip++;
    }
  });

  const dailyTrends = Object.entries(dayMap).map(([date, val]) => ({
    date,
    count: val.count,
    accuracy: val.count > 0 ? Math.round((val.correct / val.count) * 100) : 0,
  }));

  return {
    totalReviews,
    correctReviews,
    accuracyRate,
    averageResponseTimeMs: avgTime,
    dailyTrends,
    exerciseDistribution,
  };
}


export function prepareMeaningMatch(
  primaryWord: WordDetail,
  allWords: WordDetail[]
): { wordId: string; word: string; meaningVN: string }[] {
  const pairs: { wordId: string; word: string; meaningVN: string }[] = [];
  const usedWords = new Set<string>();
  const usedMeanings = new Set<string>();

  const tryAdd = (w: WordDetail): boolean => {
    const wordKey = w.word.trim().toLowerCase();
    const meaningKey = cleanMeaningForOption(w.meaning_vn || "").trim().toLowerCase();
    if (!wordKey || !meaningKey || usedWords.has(wordKey) || usedMeanings.has(meaningKey)) return false;
    
    usedWords.add(wordKey);
    usedMeanings.add(meaningKey);
    pairs.push({ wordId: w.id, word: w.word, meaningVN: meaningKey });
    return true;
  };

  tryAdd(primaryWord);

  const shuffled = [...allWords].sort(() => 0.5 - Math.random());
  for (const w of shuffled) {
    if (pairs.length >= 5) break;
    if (w.id === primaryWord.id) continue;
    tryAdd(w);
  }

  return pairs.sort(() => 0.5 - Math.random());
}
