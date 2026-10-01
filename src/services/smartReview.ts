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

import type { WordDetail, SRSReview } from "@/types/database";
import Database from "@tauri-apps/plugin-sql";
import { getDatabase } from "./db";

// ─── 1. RETRIEVABILITY ──────────────────────────────────────────────────────

/**
 * Calculate memory retrievability R ∈ [0, 1] using FSRS forgetting curve.
 *   R = (1 + elapsed / (9 × stability))^(−1)
 *
 * @returns A number between 0 (fully forgotten) and 1 (perfectly remembered)
 */
export function calculateRetrievability(srs: Partial<SRSReview>, now: Date = new Date()): number {
  const stability = srs.stability ?? 0;
  if (stability <= 0) return 0;

  const lastReview = srs.last_review ? new Date(srs.last_review).getTime() : now.getTime();
  const elapsedMs = now.getTime() - lastReview;
  const elapsedDays = Math.max(0, elapsedMs / (24 * 60 * 60 * 1000));

  // FSRS forgetting curve: R = (1 + t / (9 * S))^(-1)
  const R = Math.pow(1 + elapsedDays / (9 * stability), -1);
  return Math.max(0, Math.min(1, R));
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
    topicDiversity: number;   // Bonus if different topic from recent reviews
  };
}

/**
 * Calculate composite urgency score for a word.
 * Higher score = should be reviewed sooner.
 */
export function calculateUrgencyScore(
  word: WordDetail,
  recentTopics: string[] = [],
  now: Date = new Date()
): WordPriority {
  const srs = word.srs;
  const R = calculateRetrievability(srs, now);
  const leechSettings = getLeechSettings();

  // Factor 1: Overdueness — how much retrievability has dropped below target (0.9)
  const targetRetention = 0.9;
  const overdueness = Math.max(0, (targetRetention - R) * 50);

  // Factor 2: Difficulty — harder words get slight priority
  const difficulty = ((srs.difficulty ?? 5) / 10) * 10;

  // Factor 3: Leech bonus — leeches get strong priority
  const leechBonus = isLeech(srs, leechSettings) ? 25 : 0;

  // Factor 4: Lapse penalty — more lapses = more forgotten = more urgency
  const lapsePenalty = Math.min(15, (srs.lapses ?? 0) * 3);

  // Factor 5: Topic diversity — bonus if different from recent topics
  const wordTopic = (word.topic || "General Tech").toLowerCase();
  const isNewTopic = recentTopics.length > 0 && !recentTopics.slice(-3).includes(wordTopic);
  const topicDiversity = isNewTopic ? 5 : 0;

  const urgencyScore = overdueness + difficulty + leechBonus + lapsePenalty + topicDiversity;

  return {
    wordId: word.id,
    word: word.word,
    urgencyScore,
    factors: {
      overdueness,
      difficulty,
      leechBonus,
      lapsePenalty,
      topicDiversity,
    },
  };
}

/**
 * Sort words for optimal review order using urgency scoring.
 * Returns a new array sorted by urgency (highest first).
 */
export function smartSortReviewQueue(
  words: WordDetail[],
  now: Date = new Date()
): WordDetail[] {
  const recentTopics: string[] = [];

  // Score each word
  const scored = words.map((w) => ({
    word: w,
    priority: calculateUrgencyScore(w, recentTopics, now),
  }));

  // Sort by urgency score descending
  scored.sort((a, b) => b.priority.urgencyScore - a.priority.urgencyScore);

  // Apply interleaving: avoid 3+ consecutive same-topic words
  const result: WordDetail[] = [];
  const remaining = scored.map((s) => s.word);
  const usedTopics: string[] = [];

  while (remaining.length > 0) {
    // Try to find a word with a different topic than the last 2
    let chosen = -1;
    for (let i = 0; i < remaining.length; i++) {
      const topic = (remaining[i].topic || "General Tech").toLowerCase();
      const lastTwo = usedTopics.slice(-2);
      if (!lastTwo.every((t) => t === topic)) {
        chosen = i;
        break;
      }
    }
    if (chosen === -1) chosen = 0; // fallback

    const word = remaining.splice(chosen, 1)[0];
    result.push(word);
    usedTopics.push((word.topic || "General Tech").toLowerCase());
  }

  return result;
}

// ─── 4. REVIEW LOG ──────────────────────────────────────────────────────────

export type ExerciseType = "flip" | "cloze" | "spelling" | "multiple_choice" | "context_match" | "sentence_builder" | "reverse_cloze" | "listening";

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
    `INSERT INTO review_logs (id, word_id, exercise_type, response_time_ms, is_correct, wrong_attempts, rating, xp_earned, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, entry.wordId, entry.exerciseType, entry.responseTimeMs, entry.isCorrect ? 1 : 0, entry.wrongAttempts, entry.rating, entry.xpEarned, entry.timestamp]
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
  }>>(
    `SELECT * FROM review_logs WHERE word_id = $1 ORDER BY timestamp DESC LIMIT $2`,
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
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const rows = await db.select<Array<{ cnt: number }>>(
    `SELECT COUNT(*) as cnt FROM review_logs WHERE timestamp >= $1`,
    [startOfDay]
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

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

import { Rating } from "ts-fsrs";

export function calculateXPReward(
  rating: Rating,
  exerciseType: ExerciseType,
  wrongAttempts: number,
  responseTimeMs: number,
  isLeechWord: boolean,
  isFirstTry: boolean,
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

  return {
    baseXP,
    bonusXP,
    totalXP: baseXP + bonusXP,
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
export function selectExerciseType(word: WordDetail): ExerciseType {
  const { state = 0, lapses = 0, difficulty = 5, reps = 0 } = word.srs || {};
  const hasExamples = word.examples && word.examples.length > 0 && word.examples[0].sentence_en.trim().length > 0;

  // Leech word -> forces active production
  if (lapses >= 4) {
    return randomFrom(["spelling", "listening"]);
  }

  // 0: New word
  if (state === 0 || reps === 0) {
    if (hasExamples) {
      return randomFrom(["flip", "multiple_choice", "context_match"]);
    }
    return randomFrom(["flip", "multiple_choice"]);
  }

  // 1: Learning
  if (state === 1) {
    if (reps <= 2) {
      return randomFrom(["multiple_choice", hasExamples ? "sentence_builder" : "flip"]);
    }
    return randomFrom([hasExamples ? "cloze" : "spelling", hasExamples ? "sentence_builder" : "multiple_choice"]);
  }

  // 3: Relearning (forgotten)
  if (state === 3) {
    return randomFrom(["spelling", hasExamples ? "cloze" : "spelling", "listening"]);
  }

  // 2: Review (consolidated)
  if (state === 2) {
    if (difficulty >= 7) {
      return randomFrom(["spelling", "listening"]);
    }
    if (reps > 8 && hasExamples) {
      return randomFrom(["listening", "reverse_cloze", "spelling"]);
    }
    return randomFrom([hasExamples ? "cloze" : "spelling", "spelling", hasExamples ? "reverse_cloze" : "multiple_choice"]);
  }

  return "flip";
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

  // Group others by topic priority
  const targetTopic = (targetWord.topic || "").toLowerCase();
  const sameTopicOthers = otherWords.filter((w) => (w.topic || "").toLowerCase() === targetTopic);
  const diffTopicOthers = otherWords.filter((w) => (w.topic || "").toLowerCase() !== targetTopic);

  // Shuffle pools
  const shuffledSame = [...sameTopicOthers].sort(() => 0.5 - Math.random());
  const shuffledDiff = [...diffTopicOthers].sort(() => 0.5 - Math.random());

  // Pick up to 2 from same topic, rest from other
  const selectedDistractors: WordDetail[] = [];
  while (selectedDistractors.length < 3) {
    if (shuffledSame.length > 0 && selectedDistractors.length < 2) {
      selectedDistractors.push(shuffledSame.pop()!);
    } else if (shuffledDiff.length > 0) {
      selectedDistractors.push(shuffledDiff.pop()!);
    } else if (shuffledSame.length > 0) {
      selectedDistractors.push(shuffledSame.pop()!);
    } else {
      break;
    }
  }

  // Fallbacks if deck is too small
  const fallbackVN = ["Tối ưu hoá hiệu suất", "Cấu trúc dữ liệu lồng nhau", "Xử lý bất đồng bộ", "Khả năng mở rộng hệ thống"];
  const fallbackEN = ["refactor", "optimize", "scalability", "pipeline"];

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
    while (options.length < 4) {
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
    while (options.length < 4) {
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
  const candidates = [primaryWord];
  const otherWords = allWords.filter(
    (w) => w.id !== primaryWord.id && w.examples && w.examples.length > 0 && w.examples[0].sentence_en.trim().length > 0
  );

  const shuffledOthers = [...otherWords].sort(() => 0.5 - Math.random());
  for (const other of shuffledOthers) {
    if (candidates.length >= 3) break;
    candidates.push(other);
  }

  return candidates.map((w) => {
    const rawSentence = w.examples[0]?.sentence_en || `The ${w.word} was critical for our team.`;
    // Mask target word with blank
    const regex = new RegExp(`\\b${w.word}(?:s|es|ed|ing|d)?\\b`, "gi");
    const maskedSentence = rawSentence.replace(regex, "______");

    return {
      wordId: w.id,
      word: w.word,
      maskedSentence,
      fullSentence: rawSentence,
      meaningVN: w.meaning_vn,
    };
  });
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
    const dateKey = log.timestamp.split("T")[0] || log.timestamp.substring(0, 10);
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

