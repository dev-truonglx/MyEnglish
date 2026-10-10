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

import { parseTerms, type WordDetail, type WordExample, type SRSReview, type ReviewCard, type CardDirection } from "@/types/database";
import Database from "@tauri-apps/plugin-sql";
import { Rating } from "ts-fsrs";
import { getDatabase, isPlaceholderMeaning } from "./db";
import { getCardRetrievability, getStudyLimits } from "./srs";
import { directionForExercise, getDueCards } from "./cards";
import { persistKeyNow } from "./storageBackup";
import { COMMON_WORDS } from "@/data/commonWords";
import { FULL_VERB_FORMS, IRREGULAR_PLURALS, IRREGULAR_VERB_FORMS } from "@/data/irregularForms";

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

/** A word is a leech when either of its cards is (recall cards are forgotten more often). */
export function isLeechWord(word: WordDetail, settings?: LeechSettings): boolean {
  const s = settings || getLeechSettings();
  return isLeech(word.srs, s) || (!!word.srsProduction && isLeech(word.srsProduction, s));
}

/**
 * Get all leech words from a word list
 */
export function getLeechWords(words: WordDetail[], settings?: LeechSettings): WordDetail[] {
  const s = settings || getLeechSettings();
  if (!s.enabled) return [];
  return words.filter((w) => isLeechWord(w, s));
}

/** Suspended words (leech action "suspend", or suspended by hand) are left out of every review session. */
export function isSuspended(word: Partial<WordDetail>): boolean {
  return !!word.suspended;
}

/**
 * A leech whose action is "relearn" is studied again like a new word before its next quiz: the word,
 * meaning, examples and memory hook are shown first, and the quiz comes a few cards later.
 */
export function needsRelearnIntro(card: ReviewCard, settings?: LeechSettings): boolean {
  const s = settings || getLeechSettings();
  return s.enabled && s.action === "relearn" && isLeech(card.srs, s);
}

// ─── 3. ADAPTIVE QUEUE ORDERING ─────────────────────────────────────────────

export interface WordPriority {
  wordId: string;
  word: string;
  urgencyScore: number;
  factors: {
    /** Retrievability now (0..1) */
    retrievability: number;
    /** Retrievability the card loses if its review waits one more day (0..1) */
    dailyLoss: number;
    /** Learning / relearning cards are on minute-level steps and always go first */
    shortTerm: boolean;
    isDue: boolean;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Review priority of a card (higher = review sooner), from the FSRS memory model rather than hand-tuned weights:
 *  - learning / relearning cards first: their minute-level steps only work if they come back soon
 *  - review cards by how much memory is lost if the review waits one more day: R(now) - R(now + 1 day).
 *    A card just reaching its due date with low stability loses the most; a card with high stability
 *    loses little; a card overdue for weeks is already mostly forgotten and loses little more.
 *    When the backlog is larger than a session, this keeps the most memory per review.
 *  - cards that are not due are pushed far behind due cards (used by practice / micro-quiz fallbacks).
 * Leeches get no bonus: drilling them first makes sessions heavy, they are spread and capped instead.
 */
export function calculateUrgencyScore(word: WordDetail, now: Date = new Date()): WordPriority {
  const srs = word.srs;
  const state = srs.state ?? 0;
  const isNew = state === 0 && (srs.reps ?? 0) === 0;
  const isDue = srs.next_review_date ? new Date(srs.next_review_date).getTime() <= now.getTime() : true;
  const shortTerm = state === 1 || state === 3;
  const R = isNew ? 0 : calculateRetrievability(srs, now);
  const dailyLoss = isNew || shortTerm ? 0 : Math.max(0, R - calculateRetrievability(srs, new Date(now.getTime() + DAY_MS)));

  let score: number;
  if (isNew) score = 0;
  else if (shortTerm) score = 200 + Math.min(50, (now.getTime() - new Date(srs.next_review_date).getTime()) / 60000);
  else score = 100 * dailyLoss;
  if (!isDue) score *= 0.01;

  return {
    wordId: word.id,
    word: word.word,
    urgencyScore: score,
    factors: { retrievability: R, dailyLoss, shortTerm, isDue },
  };
}

function topicOf(word: WordDetail): string {
  return (word.topic || "General Tech").toLowerCase();
}

/**
 * Sort words for optimal review order (highest priority first), interleaved so that
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
  return interleaveTopics(scored.map((s) => s.word));
}

function interleaveTopics<T extends WordDetail>(ordered: T[]): T[] {
  const result: T[] = [];
  const remaining = [...ordered];
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
 * Cards started today (local day), per direction: their first scheduled review, or the introduction
 * card shown before a new word's first quiz. Other practice answers never consume the budget.
 */
export async function getNewCardsIntroducedToday(): Promise<NewCardCounts> {
  const db = await getDatabase();
  // A word marked "already known" never uses the budget for recognition (neither the day it is marked nor
  // the day of its first real review). Its recall card, started later, is a new card like any other.
  const rows = await db.select<Array<{ direction: string | null; cnt: number }>>(
    `SELECT COALESCE(direction, 'recognition') AS direction, COUNT(*) AS cnt FROM (
       SELECT word_id, COALESCE(direction, 'recognition') AS direction, MIN(timestamp) AS first_seen
       FROM review_logs
       WHERE (is_scheduled IS NULL OR is_scheduled = 1 OR exercise_type = 'intro')
         AND NOT (COALESCE(direction, 'recognition') = 'recognition'
                  AND word_id IN (SELECT word_id FROM review_logs WHERE exercise_type = 'known'))
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

export interface TodayWork {
  /** Reviews due now (studied cards, both directions) */
  reviews: number;
  /** New cards a session may still introduce today (daily budget left, both directions) */
  newToday: number;
  /** reviews + newToday: what is actually left to do today */
  total: number;
}

/**
 * Today's new cards. The daily limit is ONE budget for both directions: a new recall card costs future
 * reviews just like a new word, and a beginner can't take 10 new words plus 10 new recall cards a day.
 * New words get at least half of what is left (rounded up) when enough are waiting; whatever one
 * direction can't use goes to the other.
 */
export function splitNewCardBudget(
  newCardsPerDay: number,
  introduced: NewCardCounts,
  waiting: { recognition: number; production: number }
): NewCardCounts {
  const budget = Math.max(0, newCardsPerDay - introduced.recognition - introduced.production);
  const recognition = Math.min(waiting.recognition, Math.max(Math.ceil(budget / 2), budget - waiting.production));
  const production = Math.min(waiting.production, budget - recognition);
  return { recognition, production };
}

/**
 * What is left to study today. Counting every new word as "due" made the number never reach 0; new
 * words only count up to what the daily new-card budget still allows.
 */
export function todayWorkFromCounts(
  counts: { reviews: number; newWaiting: number; newRecallWaiting?: number },
  introduced: NewCardCounts,
  newCardsPerDay: number = getStudyLimits().newCardsPerDay
): TodayWork {
  const split = splitNewCardBudget(newCardsPerDay, introduced, {
    recognition: counts.newWaiting,
    production: counts.newRecallWaiting ?? 0,
  });
  const newToday = split.recognition + split.production;
  return { reviews: counts.reviews, newToday, total: counts.reviews + newToday };
}

/** Same as todayWorkFromCounts, from words already loaded in memory. */
export function summarizeTodayWork(words: WordDetail[], introduced: NewCardCounts, now: Date = new Date()): TodayWork {
  let reviews = 0;
  let newWaiting = 0;
  let newRecallWaiting = 0;
  for (const w of words) {
    if (isPlaceholderMeaning(w.meaning_vn) || isSuspended(w)) continue;
    for (const c of getDueCards(w, now)) {
      if (isBuriedBySibling(c, now)) continue;
      if (!isNewCard(c)) reviews++;
      else if (c.direction === "recognition") newWaiting++;
      else newRecallWaiting++;
    }
  }
  return todayWorkFromCounts({ reviews, newWaiting, newRecallWaiting }, introduced);
}

/** Leeches allowed in one session: more of them makes a session discouraging and slow */
export const MAX_LEECHES_PER_SESSION = 4;

function isSameLocalDay(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/**
 * The other card of the same word was reviewed (on schedule) today: a review card waits until tomorrow,
 * otherwise it would be answered from a memory refreshed minutes ago (Anki's "bury siblings").
 * Learning cards are never buried: their short steps must run.
 */
export function isBuriedBySibling(card: ReviewCard, now: Date = new Date()): boolean {
  if ((card.srs.state ?? 0) !== 2) return false;
  const sibling = card.direction === "recognition" ? card.srsProduction : card.srsRecognition;
  return !!sibling && isSameLocalDay(sibling.last_review, now);
}

/**
 * How many new cards a session may introduce, given the due reviews. New words create future reviews,
 * so the more reviews are waiting, the fewer new words are added:
 *  - reviews fit in the session: new cards fill the rest (at least 20% of the session)
 *  - up to 2 sessions of reviews waiting: 20% of the session
 *  - more than that: none, until the backlog is cleared
 */
export function newCardAllowance(dueReviewCount: number, maxSessionSize: number): number {
  const reserve = Math.ceil(maxSessionSize * 0.2);
  if (dueReviewCount <= maxSessionSize) return Math.max(reserve, maxSessionSize - dueReviewCount);
  if (dueReviewCount <= maxSessionSize * 2) return reserve;
  return 0;
}

/**
 * Build a study session from due words:
 *  - every word contributes at most one due card per session (the higher-priority one); a review card
 *    whose sibling was reviewed today waits until tomorrow
 *  - due review/learning cards ordered by FSRS priority (see calculateUrgencyScore), at most
 *    MAX_LEECHES_PER_SESSION leeches, spread through the session
 *  - cards never reviewed are a separate, budgeted stage: one daily budget for both directions
 *    (splitNewCardBudget), limited further by the review backlog (newCardAllowance), oldest first,
 *    new words and new recall cards alternating, spread evenly through the session
 *  - whole session capped at maxSessionSize (or `options.maxCards`, today's share after a break)
 *  - `options.noNewCards`: reviews only (while a comeback plan clears the backlog)
 */
export function buildReviewSession(
  dueWords: WordDetail[],
  alreadyToday: NewCardCounts | number,
  now: Date = new Date(),
  options: { maxCards?: number; noNewCards?: boolean } = {}
): ReviewCard[] {
  const stored = getStudyLimits();
  const limits = {
    newCardsPerDay: options.noNewCards ? 0 : stored.newCardsPerDay,
    maxSessionSize: Math.max(1, Math.min(stored.maxSessionSize, options.maxCards ?? stored.maxSessionSize)),
  };
  const leechSettings = getLeechSettings();
  const introduced: NewCardCounts =
    typeof alreadyToday === "number" ? { recognition: alreadyToday, production: 0 } : alreadyToday;
  // Words still waiting for AI analysis have no real meaning to review yet
  const ready = dueWords.filter((w) => !isPlaceholderMeaning(w.meaning_vn) && !isSuspended(w));
  const cards = ready.flatMap((w) => {
    const due = getDueCards(w, now).filter((c) => !isBuriedBySibling(c, now));
    if (due.length <= 1) return due;
    return [due.reduce((a, b) =>
      calculateUrgencyScore(b, now).urgencyScore > calculateUrgencyScore(a, now).urgencyScore ? b : a
    )];
  });

  // Review cards by priority, leeches capped
  const byPriority = cards
    .filter((c) => !isNewCard(c))
    .map((c) => ({ c, score: calculateUrgencyScore(c, now).urgencyScore }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);
  const reviewCards: ReviewCard[] = [];
  let leeches = 0;
  for (const c of byPriority) {
    if (isLeech(c.srs, leechSettings)) {
      if (leeches >= MAX_LEECHES_PER_SESSION) continue;
      leeches++;
    }
    reviewCards.push(c);
  }

  const oldestFirst = (a: ReviewCard, b: ReviewCard) =>
    new Date(a.srs.next_review_date).getTime() - new Date(b.srs.next_review_date).getTime() ||
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  const waitingOf = (direction: ReviewCard["direction"]) =>
    cards.filter((c) => isNewCard(c) && c.direction === direction).sort(oldestFirst);
  const newWords = waitingOf("recognition");
  const newRecall = waitingOf("production");
  const split = splitNewCardBudget(limits.newCardsPerDay, introduced, {
    recognition: newWords.length,
    production: newRecall.length,
  });
  // Alternate, so a backlog cut (newCardAllowance) keeps both kinds
  const newCards: ReviewCard[] = [];
  for (let i = 0; i < Math.max(split.recognition, split.production); i++) {
    if (i < split.recognition) newCards.push(newWords[i]);
    if (i < split.production) newCards.push(newRecall[i]);
  }

  const newSlice = newCards.slice(0, Math.min(limits.maxSessionSize, newCardAllowance(reviewCards.length, limits.maxSessionSize)));
  const reviewSlice = interleaveTopics(spreadLeeches(reviewCards.slice(0, limits.maxSessionSize - newSlice.length), leechSettings));
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

/** Keep the priority order but move leeches so they are evenly spaced instead of bunched together */
function spreadLeeches(cards: ReviewCard[], settings: LeechSettings): ReviewCard[] {
  const leeches = cards.filter((c) => isLeech(c.srs, settings));
  if (leeches.length <= 1 || leeches.length === cards.length) return cards;
  const others = cards.filter((c) => !isLeech(c.srs, settings));
  const result: ReviewCard[] = [];
  const gap = (others.length + 1) / leeches.length;
  let nextAt = gap / 2;
  let li = 0;
  for (let i = 0; i < others.length; i++) {
    while (li < leeches.length && i >= nextAt) {
      result.push(leeches[li++]);
      nextAt += gap;
    }
    result.push(others[i]);
  }
  while (li < leeches.length) result.push(leeches[li++]);
  return result;
}

// ─── 3b. RATING DERIVATION ─────────────────────────────────────────────────


/** Correct answers slower than this (ms) are graded Hard, until the learner has enough history */
const SLOW_RESPONSE_MS: Partial<Record<ExerciseType, number>> = {
  multiple_choice: 15000,
  context_match: 30000,
  meaning_match: 45000,
  sentence_builder: 40000,
  reverse_cloze: 20000,
  spelling: 20000,
  cloze: 25000,
  listening: 20000,
  letter_tiles: 25000,
};

// ─── Free writing (AI-graded own sentence) ───────────────────────────────────

const FREE_WRITING_KEY = "myenglish_free_writing_v1";
/** AI-graded sentences per day: each takes 10–40 s of AI time */
export const FREE_WRITING_PER_DAY = 5;

export function freeWritingUsedToday(): number {
  try {
    const raw = JSON.parse(localStorage.getItem(FREE_WRITING_KEY) || "{}");
    return raw.date === new Date().toDateString() ? Number(raw.count) || 0 : 0;
  } catch {
    return 0;
  }
}

export function recordFreeWritingUse(): void {
  try {
    localStorage.setItem(FREE_WRITING_KEY, JSON.stringify({ date: new Date().toDateString(), count: freeWritingUsedToday() + 1 }));
  } catch {}
}

/**
 * Grade of an AI-checked sentence: the word must be used, with the right meaning. Producing a correct
 * sentence of your own is the strongest recall evidence (generation effect), but a sentence with errors
 * still shows the word was recalled, so it is Hard rather than Again unless the word was misused.
 */
export function ratingFromSentenceGrade(g: { correct: boolean; score: number; usesTargetWord: boolean }): Rating {
  if (!g.usesTargetWord || g.score < 50) return Rating.Again;
  if (!g.correct || g.score < 80) return Rating.Hard;
  return Rating.Good;
}

/** A correct answer this many times slower than the learner's own typical time was a struggle */
const SLOW_FACTOR = 2.5;
/** Correct scheduled answers needed per exercise type before the personal threshold is used */
const MIN_TIMING_SAMPLES = 20;

/** Median time of the learner's correct, scheduled answers per exercise type (loaded from review_logs) */
let typicalResponseMs: Partial<Record<ExerciseType, number>> = {};

export function setTypicalResponseTimes(times: Partial<Record<ExerciseType, number>>): void {
  typicalResponseMs = { ...times };
}

/**
 * Load the learner's median response time per exercise type from the last 200 correct scheduled answers
 * of each type. Called when a session starts; grading falls back to fixed thresholds without it.
 */
export async function loadTypicalResponseTimes(): Promise<Partial<Record<ExerciseType, number>>> {
  try {
    const db = await getDatabase();
    const rows = await db.select<Array<{ exercise_type: string; response_time_ms: number }>>(
      `SELECT exercise_type, response_time_ms FROM (
         SELECT exercise_type, response_time_ms,
                ROW_NUMBER() OVER (PARTITION BY exercise_type ORDER BY timestamp DESC) AS rn
         FROM review_logs
         WHERE is_scheduled = 1 AND rating >= 3 AND response_time_ms > 0
       ) WHERE rn <= 200`
    );
    const byType = new Map<string, number[]>();
    for (const r of rows) {
      const list = byType.get(r.exercise_type) ?? [];
      list.push(r.response_time_ms);
      byType.set(r.exercise_type, list);
    }
    const times: Partial<Record<ExerciseType, number>> = {};
    for (const [type, list] of byType) {
      if (list.length < MIN_TIMING_SAMPLES) continue;
      list.sort((a, b) => a - b);
      times[type as ExerciseType] = list[Math.floor(list.length / 2)];
    }
    setTypicalResponseTimes(times);
    return times;
  } catch {
    return typicalResponseMs;
  }
}

/**
 * "Too slow" threshold: 2.5x the learner's own median for this exercise when known (so slow readers and
 * typists are not punished), bounded to 60%–150% of the fixed default.
 */
export function slowThresholdMs(exerciseType: ExerciseType): number | undefined {
  const fallback = SLOW_RESPONSE_MS[exerciseType];
  if (!fallback) return undefined;
  const typical = typicalResponseMs[exerciseType];
  if (!typical) return fallback;
  return Math.min(fallback * 1.5, Math.max(fallback * 0.6, typical * SLOW_FACTOR));
}

export interface AnswerOutcome {
  exerciseType: ExerciseType;
  wrongAttempts: number;
  usedHint?: boolean;
  nearMiss?: boolean; // Accepted with a small typo
  /** Picked a synonym / near-synonym of the target: the meaning was known, the exact word was not */
  confusedWithSynonym?: boolean;
  responseTimeMs: number;
  srs?: Partial<SRSReview>;
}

/**
 * Map an exercise outcome to an FSRS grade following FSRS semantics:
 *  - any wrong attempt means the memory failed -> Again
 *  - picked a synonym of the target, hint, small typo -> Hard
 *  - correct on first try -> Good
 *  - a correct but very slow answer (relative to the learner's own speed) -> Hard
 *  - automatic grading never gives Easy (Easy stays a manual choice on recall flip cards).
 *    Speed-based Easy was tried twice: in simulation G,G,E,E schedules 19 -> 136 days against
 *    11 -> 46 for G,G,G,G, far beyond what a 2-second multiple-choice answer proves.
 */
export function deriveRating(outcome: AnswerOutcome): Rating {
  // A wrong answer is a memory failure, even after a synonym was tried first
  if (outcome.wrongAttempts > 0) return Rating.Again;
  if (outcome.confusedWithSynonym || outcome.usedHint || outcome.nearMiss) return Rating.Hard;
  // Response time only ever lowers the grade: a correct but very slow answer was a struggle.
  const slowMs = slowThresholdMs(outcome.exerciseType);
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
 * A typed word that is a real word other than the target ("effect" for "affect", "date" for "data"):
 * a different word, not a typo, so it never counts as a near miss.
 */
function isOtherRealWord(guess: string, targetForms: string[], knownWords: Iterable<string>): boolean {
  if (targetForms.includes(guess)) return false;
  if (COMMON_WORDS.has(guess)) return true;
  for (const w of knownWords) {
    const key = w.trim().toLowerCase();
    if (key && wordForms(key).some((f) => f.toLowerCase() === guess)) return true;
  }
  return false;
}

/**
 * Compare a typed answer with the target word.
 * - "exact": the word or any correct form of it (deployed, dependencies, wrote): the word was recalled.
 *   When the form differs from the one a cloze sentence uses, the UI says which form fits (formInSentence).
 * - "near": a one-letter slip on a word of 4+ letters, unless what was typed is another real word
 *   (common English word, or a word of the learner's own list passed in `knownWords`).
 */
export function matchTypedAnswer(
  input: string,
  target: string,
  sentence?: string,
  knownWords: Iterable<string> = []
): TypedAnswerMatch {
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
  const forms = wordForms(answer).map((f) => f.toLowerCase());
  if (forms.includes(guess)) return "exact";
  if (
    answer.length >= 4 &&
    forms.some((f) => editDistance(guess, f, 1) <= 1) &&
    !isOtherRealWord(guess, forms, knownWords)
  ) {
    return "near";
  }
  return "wrong";
}

// ─── 4. REVIEW LOG ──────────────────────────────────────────────────────────

export type ExerciseType =
  | "flip"
  | "cloze"
  | "spelling"
  | "multiple_choice"
  | "context_match"
  | "meaning_match"
  | "sentence_builder"
  | "reverse_cloze"
  | "listening"
  | "free_writing"
  /** Build the English word from shuffled letters: the first, easiest step of typed recall */
  | "letter_tiles";

/**
 * "intro" = a new (or relearned) word was shown before its first quiz; not a graded answer.
 * "known" = the learner said they already know a new word: scheduled as Easy, outside the daily budget.
 */
export type LoggedExerciseType = ExerciseType | "intro" | "known";

export interface ReviewLogEntry {
  id: string;
  wordId: string;
  exerciseType: LoggedExerciseType;
  responseTimeMs: number;
  isCorrect: boolean;
  wrongAttempts: number;
  rating: number;          // FSRS Rating value
  xpEarned: number;
  timestamp: string;       // ISO
  isScheduled: boolean | null; // true = updated the FSRS schedule, false = practice only, null = legacy row
  direction?: CardDirection | null; // card the answer was recorded on (null = legacy row, recognition)
  /**
   * Recognition credited from a correct recall answer (is_scheduled = 2): a real FSRS update, but kept
   * apart from direct answers so the optimizer can include or exclude it.
   */
  implicit?: boolean;
  /** Card memory state just before this answer (for true retention, calibration and the optimizer) */
  before?: ReviewLogBefore | null;
}

export interface ReviewLogBefore {
  state: number;
  stability: number;
  difficulty: number;
  /** Retrievability FSRS predicted at the moment of the answer (null for new cards) */
  retrievability: number | null;
  /** Days since the card's previous review (null for new cards) */
  elapsedDays: number | null;
}

/** Memory state of a card row right before an answer, as stored in review_logs. */
export function reviewLogBefore(srs: Partial<SRSReview> | null | undefined, now: Date = new Date()): ReviewLogBefore | null {
  if (!srs) return null;
  const state = srs.state ?? 0;
  const isNew = state === 0 && (srs.reps ?? 0) === 0;
  const last = srs.last_review ? new Date(srs.last_review).getTime() : NaN;
  return {
    state,
    stability: srs.stability ?? 0,
    difficulty: srs.difficulty ?? 0,
    retrievability: isNew ? null : calculateRetrievability(srs, now),
    elapsedDays: Number.isFinite(last) ? Math.max(0, (now.getTime() - last) / DAY_MS) : null,
  };
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
  const b = entry.before;
  const round = (n: number | null | undefined, digits: number) => (n == null ? null : Number(n.toFixed(digits)));
  await db.execute(
    `INSERT INTO review_logs (id, word_id, exercise_type, response_time_ms, is_correct, wrong_attempts, rating, xp_earned, timestamp,
       is_scheduled, direction, state_before, stability_before, difficulty_before, r_predicted, elapsed_days_before)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id, entry.wordId, entry.exerciseType, entry.responseTimeMs, entry.isCorrect ? 1 : 0, entry.wrongAttempts,
      entry.rating, entry.xpEarned, entry.timestamp, entry.implicit ? 2 : entry.isScheduled ? 1 : 0,
      entry.direction ??
        (entry.exerciseType === "intro" || entry.exerciseType === "known" ? "recognition" : directionForExercise(entry.exerciseType)),
      b ? b.state : null, round(b?.stability, 4), round(b?.difficulty, 4), round(b?.retrievability, 4), round(b?.elapsedDays, 3),
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
  { maxXP: 100, rank: "Mới bắt đầu", emoji: "🌱" },
  { maxXP: 200, rank: "Mới bắt đầu", emoji: "🌱" },
  { maxXP: 350, rank: "Mới bắt đầu", emoji: "🌱" },
  { maxXP: 500, rank: "Mới bắt đầu", emoji: "🌱" },
  { maxXP: 700, rank: "Mới bắt đầu", emoji: "🌱" },
  { maxXP: 1000, rank: "Chăm chỉ", emoji: "📚" },
  { maxXP: 1400, rank: "Chăm chỉ", emoji: "📚" },
  { maxXP: 1800, rank: "Chăm chỉ", emoji: "📚" },
  { maxXP: 2200, rank: "Chăm chỉ", emoji: "📚" },
  { maxXP: 2700, rank: "Chăm chỉ", emoji: "📚" },
  { maxXP: 3300, rank: "Khám phá", emoji: "🧭" },
  { maxXP: 4000, rank: "Khám phá", emoji: "🧭" },
  { maxXP: 4800, rank: "Khám phá", emoji: "🧭" },
  { maxXP: 5700, rank: "Khám phá", emoji: "🧭" },
  { maxXP: 6700, rank: "Khám phá", emoji: "🧭" },
  { maxXP: 7800, rank: "Tiến bộ", emoji: "⚡" },
  { maxXP: 9000, rank: "Tiến bộ", emoji: "⚡" },
  { maxXP: 10500, rank: "Tiến bộ", emoji: "⚡" },
  { maxXP: 12500, rank: "Tiến bộ", emoji: "⚡" },
  { maxXP: 15000, rank: "Tiến bộ", emoji: "⚡" },
  { maxXP: 18000, rank: "Thành thạo", emoji: "🏅" },
  { maxXP: 22000, rank: "Thành thạo", emoji: "🏅" },
  { maxXP: 27000, rank: "Thành thạo", emoji: "🏅" },
  { maxXP: 33000, rank: "Thành thạo", emoji: "🏅" },
  { maxXP: 40000, rank: "Thành thạo", emoji: "🏅" },
  { maxXP: 48000, rank: "Bậc thầy", emoji: "👑" },
  { maxXP: 57000, rank: "Bậc thầy", emoji: "👑" },
  { maxXP: 67000, rank: "Bậc thầy", emoji: "👑" },
  { maxXP: 78000, rank: "Bậc thầy", emoji: "👑" },
  { maxXP: 90000, rank: "Bậc thầy", emoji: "👑" },
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
      totalXP: 0, level: 1, rank: "Mới bắt đầu", rankEmoji: "🌱",
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

export interface XPInput {
  rating: Rating;
  exerciseType: ExerciseType;
  /** The answer moved the FSRS schedule (practice and retries only earn a token amount) */
  scheduled: boolean;
  direction: CardDirection;
  /** Retrievability just before the answer (null for new cards) */
  retrievabilityBefore?: number | null;
  isLeechWord?: boolean;
}

/** XP for one correct practice answer: enough to feel progress, too little to farm */
export const PRACTICE_XP = 1;

/**
 * XP rewards remembering, not volume or speed:
 *  - nothing for a forgotten card or a skip (Again)
 *  - practice answers (not due, retries, practice-only exercises) earn PRACTICE_XP when correct
 *  - scheduled answers: Hard 6, Good 10, Easy 12; +4 for recall (producing the word is harder)
 *  - "desirable difficulty" bonus: remembering a word FSRS expected to be fading (R < 80%) is worth +5,
 *    because those are the reviews that strengthen memory the most
 *  - remembering a leech +5
 * No speed bonus and no combo multiplier: both reward fast guessing.
 */
export function calculateXPReward(input: XPInput): XPReward {
  const { rating, scheduled, direction, retrievabilityBefore, isLeechWord } = input;
  const bonusReasons: string[] = [];
  if (rating === Rating.Again) return { baseXP: 0, bonusXP: 0, totalXP: 0, bonusReasons };
  if (!scheduled) {
    return { baseXP: PRACTICE_XP, bonusXP: 0, totalXP: PRACTICE_XP, bonusReasons: ["Luyện thêm"] };
  }

  const baseXP = rating === Rating.Hard ? 6 : rating === Rating.Easy ? 12 : 10;
  let bonusXP = 0;
  if (direction === "production") {
    bonusXP += 4;
    bonusReasons.push("Tự nhớ ra từ +4");
  }
  if (retrievabilityBefore != null && retrievabilityBefore < 0.8) {
    bonusXP += 5;
    bonusReasons.push("🧠 Cứu từ sắp quên +5");
  }
  if (isLeechWord) {
    bonusXP += 5;
    bonusReasons.push("🗡️ Thắng từ hay quên +5");
  }
  return { baseXP, bonusXP, totalXP: baseXP + bonusXP, bonusReasons };
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
    persistKeyNow(XP_STORAGE_KEY);
    persistKeyNow(XP_LOG_KEY);

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

/**
 * The format for this review, rotating through the band's formats with the card's review count:
 * deterministic (the same card state always gets the same format, so results can be compared and
 * calibrated per format) while successive reviews still give different retrieval cues.
 */
function rotate<T>(items: T[], reps: number): T {
  return items[Math.abs(reps) % items.length];
}

/** Stability (days) below which a card still needs cues; above MATURE it gets the hardest formats */
export const YOUNG_STABILITY_DAYS = 3;
export const MATURE_STABILITY_DAYS = 21;
/** Recall ladder: letter tiles below this stability (days), then the sentence cue, then typing alone */
export const TILES_STABILITY_DAYS = 2;
export const TYPING_STABILITY_DAYS = 7;

/**
 * Choose the exercise for a card from its memory strength, so the format gets harder as the memory gets
 * stronger (desirable difficulty) while every format stays valid evidence for that card's direction
 * (see exerciseDirection). Within a band the format varies to give different retrieval cues.
 *
 * Recognition (understand the English word):
 *  - new: "flip", shown as an introduction first (asking about a word never seen is a guess)
 *  - learning / relearning / young (S < 3d) / leech: multiple choice (cued, quick feedback)
 *  - S 3–21d: multiple choice, listening (audio → meaning), reading in context
 *  - S >= 21d: listening, reading in context, matching
 * Production (produce the English word): a ladder, each step with less help
 *  - new / learning / relearning / leech / S < 2d: letter tiles (build the word from shuffled letters)
 *  - S 2–7d: cloze (the sentence is a cue), spelling when the word has no usable sentence
 *  - S 7–21d: cloze and spelling in turn
 *  - S >= 21d: spelling from the meaning alone
 * Within a band the format rotates with the review count (no randomness).
 * Sentence building is practice only (it does not test the meaning) and is never picked here.
 */
export function selectExerciseType(card: WordDetail & { direction?: CardDirection }): ExerciseType {
  const { state = 0, reps = 0, stability = 0 } = card.srs || {};
  const hasExamples = (card.examples || []).some((e) => e.sentence_en?.trim() && maskWordInSentence(e.sentence_en, card.word));
  const young = state === 1 || state === 3 || stability < YOUNG_STABILITY_DAYS || isLeech(card.srs);

  if ((card.direction ?? "recognition") === "production") {
    if (state === 0 || reps === 0 || state === 1 || state === 3 || stability < TILES_STABILITY_DAYS || isLeech(card.srs)) {
      return "letter_tiles";
    }
    if (stability < TYPING_STABILITY_DAYS) return hasExamples ? "cloze" : "spelling";
    if (stability < MATURE_STABILITY_DAYS) return hasExamples ? rotate<ExerciseType>(["cloze", "spelling"], reps) : "spelling";
    return "spelling";
  }

  if (state === 0 || reps === 0) return "flip";
  if (young) return "multiple_choice";
  if (stability < MATURE_STABILITY_DAYS) {
    return rotate<ExerciseType>(hasExamples ? ["multiple_choice", "listening", "context_match", "reverse_cloze"] : ["multiple_choice", "listening"], reps);
  }
  return rotate<ExerciseType>(hasExamples ? ["listening", "context_match", "reverse_cloze", "meaning_match"] : ["listening", "meaning_match", "multiple_choice"], reps);
}

/**
 * Direction of a multiple-choice question. A young card (learning, relearning, stability under 3 days,
 * leech) is always asked English -> Vietnamese, the easier recognition step; older cards are asked
 * Vietnamese -> English one review in three.
 */
export function multipleChoiceDirection(card: WordDetail): "en_to_vn" | "vn_to_en" {
  const { state = 0, stability = 0, reps = 0 } = card.srs || {};
  const young = state === 0 || state === 1 || state === 3 || stability < YOUNG_STABILITY_DAYS || isLeech(card.srs);
  if (young) return "en_to_vn";
  // One review in three asks the other way round (deterministic, see selectExerciseType)
  return reps % 3 === 2 ? "vn_to_en" : "en_to_vn";
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
 * The example sentence for a context exercise. Rotates through the word's examples by review count, so
 * the learner meets the word in different sentences instead of memorising one sentence; the sentence the
 * learner originally met the word in (source "user_context") comes first in the rotation.
 * Only sentences that actually contain the word (so it can be blanked) are used.
 */
export function pickExample(word: WordDetail, rotation: number = word.srs?.reps ?? 0): WordExample | undefined {
  const usable = (word.examples || []).filter((e) => e.sentence_en?.trim() && maskWordInSentence(e.sentence_en, word.word));
  if (usable.length === 0) return undefined;
  const ordered = [...usable.filter((e) => e.source === "user_context"), ...usable.filter((e) => e.source !== "user_context")];
  return ordered[Math.abs(Math.floor(rotation)) % ordered.length];
}

/** Comma / "hoặc" separated senses of a Vietnamese meaning, lowercased, without explanations in brackets */
function meaningSenses(meaning: string): string[] {
  const first = (meaning || "").split(/[;\n.]/)[0].replace(/\([^)]*\)/g, " ").toLowerCase();
  return first
    .split(/,|\/|\bhoặc\b/)
    .map((x) => x.replace(/["'“”‘’]/g, "").replace(/\s+/g, " ").trim())
    .filter((x) => x.length > 0 && x.split(" ").length <= 6);
}

function syllables(text: string): Set<string> {
  return new Set(text.split(" ").filter(Boolean));
}

/**
 * Whether two words are too close in meaning to be told apart from the meaning alone: listed as
 * synonyms of each other, or sharing a sense ("nhanh" / "nhanh chóng"). Such a word must not be a
 * distractor: the question would have two right answers and the learner would be graded Again unfairly.
 */
export function areConfusable(a: WordDetail, b: WordDetail): boolean {
  const aw = a.word.trim().toLowerCase();
  const bw = b.word.trim().toLowerCase();
  if (aw === bw) return true;
  const synonymsOf = (w: WordDetail) => new Set(parseTerms(w.synonyms).map((t) => t.word.trim().toLowerCase()));
  if (synonymsOf(a).has(bw) || synonymsOf(b).has(aw)) return true;

  const sa = meaningSenses(a.meaning_vn);
  const sb = meaningSenses(b.meaning_vn);
  for (const x of sa) {
    for (const y of sb) {
      if (x === y) return true;
      const X = syllables(x);
      const Y = syllables(y);
      let shared = 0;
      X.forEach((t) => {
        if (Y.has(t)) shared++;
      });
      // "nhanh" vs "nhanh chóng": every syllable of the shorter sense is in the longer one
      if (shared > 0 && shared === Math.min(X.size, Y.size) && Math.min(X.size, Y.size) <= 2) return true;
    }
  }
  return false;
}

/**
 * Generate 4 options for multiple choice quiz:
 * Prioritizes distractors from the same topic and similar difficulty, never synonyms of the target.
 */
export function generateMultipleChoiceQuestion(
  targetWord: WordDetail,
  allWords: WordDetail[],
  promptType: "en_to_vn" | "vn_to_en" = "en_to_vn"
): MultipleChoiceQuestion {
  const otherWords = allWords.filter(
    (w) => w.id !== targetWord.id && !isPlaceholderMeaning(w.meaning_vn) && !areConfusable(targetWord, w)
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

/** Maximum number of words in a sentence suitable for Sentence Builder mode */
export const MAX_SENTENCE_BUILDER_WORDS = 20;

export function prepareSentenceBuilder(word: WordDetail): SentenceBuilderData | null {
  const allExamples = word.examples || [];

  // Filter valid candidate examples that contain text and at least 3 words, within manageable length
  const validCandidates = allExamples.filter((e) => {
    if (!e || !e.sentence_en || e.sentence_en.trim().length === 0) return false;
    const wordCount = e.sentence_en.trim().split(/\s+/).filter(Boolean).length;
    return wordCount >= 3 && wordCount <= MAX_SENTENCE_BUILDER_WORDS;
  });

  // Pick the best example:
  // 1. Prefer examples containing the target word
  // 2. Prefer concise examples (4 to 14 words) for an optimal unscramble experience
  // 3. Fallback to pickExample(word) if it meets the word count constraint
  let chosenExample: WordExample | undefined;

  const withTargetWord = validCandidates.filter((e) =>
    maskWordInSentence(e.sentence_en, word.word)
  );
  const pool = withTargetWord.length > 0 ? withTargetWord : validCandidates;

  if (pool.length > 0) {
    // Prefer concise sentences (4-14 words) over long ones
    const concise = pool.filter((e) => {
      const cnt = e.sentence_en.trim().split(/\s+/).filter(Boolean).length;
      return cnt >= 4 && cnt <= 14;
    });
    const candidateList = concise.length > 0 ? concise : pool;
    const rotation = Math.abs(Math.floor(word.srs?.reps ?? 0));
    chosenExample = candidateList[rotation % candidateList.length];
  } else {
    const fallbackEx = pickExample(word) ?? allExamples[0];
    if (fallbackEx?.sentence_en) {
      const cnt = fallbackEx.sentence_en.trim().split(/\s+/).filter(Boolean).length;
      if (cnt >= 3 && cnt <= MAX_SENTENCE_BUILDER_WORDS) {
        chosenExample = fallbackEx;
      }
    }
  }

  if (!chosenExample || !chosenExample.sentence_en) {
    return null;
  }

  const rawSentence = chosenExample.sentence_en.trim();
  const rawWords = rawSentence.split(/\s+/).filter(Boolean);
  if (rawWords.length < 3 || rawWords.length > MAX_SENTENCE_BUILDER_WORDS) {
    return null;
  }

  // Use ALL words of the sentence without truncation, so the user never faces missing words!
  const fullSentence = rawSentence;
  const tokens = rawWords.map((text, idx) => ({
    id: `token-${idx}-${text}`,
    text,
  }));

  // Fisher-Yates shuffle to ensure tokens are thoroughly scrambled
  const shuffledTokens = [...tokens];
  for (let i = shuffledTokens.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledTokens[i], shuffledTokens[j]] = [shuffledTokens[j], shuffledTokens[i]];
  }
  // Ensure it doesn't accidentally stay in the exact original order
  if (shuffledTokens.length > 1 && shuffledTokens.every((t, idx) => t.id === tokens[idx].id)) {
    [shuffledTokens[0], shuffledTokens[1]] = [shuffledTokens[1], shuffledTokens[0]];
  }

  return {
    fullSentence,
    meaningVN: chosenExample.sentence_vn || word.meaning_vn,
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
  allWords: WordDetail[],
  excludeIds: ReadonlySet<string> = new Set()
): ContextMatchPair[] {
  const pairs: ContextMatchPair[] = [];
  const usedWords = new Set<string>();
  const usedMeanings = new Set<string>();

  const chosen: WordDetail[] = [];
  const tryAdd = (w: WordDetail): boolean => {
    const wordKey = w.word.trim().toLowerCase();
    const meaningKey = cleanMeaningForOption(w.meaning_vn || "").trim().toLowerCase();
    if (!wordKey || usedWords.has(wordKey) || (meaningKey && usedMeanings.has(meaningKey))) return false;
    // Synonyms could fill each other's blanks: the pairing would be ambiguous
    if (chosen.some((c) => areConfusable(c, w))) return false;

    // The reviewed word uses its rotated example; others the first example where the word can be masked
    const ordered = w.id === primaryWord.id ? [pickExample(w), ...(w.examples || [])] : w.examples || [];
    for (const ex of ordered) {
      const sentence = ex?.sentence_en?.trim();
      if (!sentence) continue;
      // Every occurrence is blanked: a second, visible one would give the pairing away
      const masked = maskAllWordForms(sentence, w.word);
      if (!masked) continue;
      usedWords.add(wordKey);
      if (meaningKey) usedMeanings.add(meaningKey);
      chosen.push(w);
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
    .filter((w) => w.id !== primaryWord.id && !excludeIds.has(w.id) && !isPlaceholderMeaning(w.meaning_vn) && w.examples && w.examples.length > 0)
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
  // Longest first so "stopped" wins over "stop"
  const alts = wordForms(word).map(escapeRegExp).sort((a, b) => b.length - a.length).join("|");
  return `(?<![\\w])(?:${alts})(?![\\w])`;
}

/**
 * Inflections of one plain word, following the spelling rules, so no unrelated word is produced
 * ("car" never gives "card", "hop" never gives "hoped"):
 *  - -s / -es (after s, x, z, ch, sh, o) / consonant + y -> -ies
 *  - -ed / -d (after e) / consonant + y -> -ied; -ing, dropping a final e (not after ee/oe/ye), ie -> ying
 *  - a final consonant after one vowel is doubled: always in one-syllable words (stop -> stopped),
 *    both spellings in longer ones, where it depends on stress (commit -> committed, open -> opened)
 *  - irregular verbs and plurals from src/data/irregularForms.ts (wrote, written, children)
 * Words under 3 letters (us, is, at) are not inflected: "us" must not match "used".
 */
function inflections(word: string): string[] {
  const w = word.toLowerCase();
  const full = FULL_VERB_FORMS.get(w);
  if (full) return full;
  const plural = IRREGULAR_PLURALS.get(w);
  if (plural) return plural;
  if (w.length < 3) return [];

  const out: string[] = [];
  if (/(s|x|z|ch|sh)$/.test(w)) out.push(w + "es");
  else if (/[^aeiou]y$/.test(w)) out.push(w.slice(0, -1) + "ies");
  else if (/[^aeiou]o$/.test(w)) out.push(w + "es", w + "s");
  else out.push(w + "s");

  const cvc = /[^aeiou][aeiou][bdgklmnprt]$/.test(w);
  const oneSyllable = (w.match(/[aeiouy]+/g) ?? []).length === 1;
  const doubled = cvc ? w + w.slice(-1) : null;

  const irregular = IRREGULAR_VERB_FORMS.get(w);
  if (irregular) out.push(...irregular);
  else if (w.endsWith("e")) out.push(w + "d");
  else if (/[^aeiou]y$/.test(w)) out.push(w.slice(0, -1) + "ied");
  else if (doubled && oneSyllable) out.push(doubled + "ed");
  else if (doubled) out.push(doubled + "ed", w + "ed");
  else out.push(w + "ed");

  if (w.endsWith("ie")) out.push(w.slice(0, -2) + "ying");
  else if (/(ee|oe|ye)$/.test(w)) out.push(w + "ing");
  else if (w.endsWith("e")) out.push(w.slice(0, -1) + "ing");
  else if (doubled && oneSyllable) out.push(doubled + "ing");
  else if (doubled) out.push(doubled + "ing", w + "ing");
  else out.push(w + "ing");
  return out;
}

/**
 * Forms the vocabulary deck lists for a word, registered when its words are loaded:
 *  - `forms`: used as they are (went, children, "is" for "be", the forms its examples use)
 *  - `variants`: other spellings, inflected like the word (colour -> color, colors)
 */
const deckForms = new Map<string, { forms: string[]; variants: string[] }>();

export function registerWordForms(word: string, forms: string[], variants: string[] = []): void {
  const key = word.trim().toLowerCase();
  const clean = (list: string[]) =>
    [...new Set(list.map((f) => f.trim()).filter((f) => f && f.toLowerCase() !== key && f.length <= 40))];
  deckForms.set(key, { forms: clean(forms), variants: clean(variants) });
}

function ruleForms(w: string): string[] {
  const forms = new Set<string>([w]);
  if (/^[a-z]+$/i.test(w)) {
    inflections(w).forEach((f) => forms.add(f));
  } else if (/^[a-z]+(?: [a-z]+)+$/i.test(w)) {
    const tokens = w.split(" ");
    const rest = tokens.slice(1).join(" ");
    const head = tokens.slice(0, -1).join(" ");
    inflections(tokens[0]).forEach((f) => forms.add(`${f} ${rest}`));
    inflections(tokens[tokens.length - 1]).forEach((f) => forms.add(`${head} ${f}`));
  }
  return [...forms];
}

/**
 * `word` plus its inflections (see `inflections`). A phrase is inflected on its first word
 * ("follow up" -> "followed up") and on its last word ("edge case" -> "edge cases").
 * Forms and spellings listed by the vocabulary deck are added (see `registerWordForms`).
 */
export function wordForms(word: string): string[] {
  const w = word.trim();
  const forms = new Set(ruleForms(w));
  const listed = deckForms.get(w.toLowerCase());
  if (listed) {
    listed.forms.forEach((f) => forms.add(f));
    listed.variants.forEach((v) => ruleForms(v).forEach((f) => forms.add(f)));
  }
  return [...forms];
}

/** The form of `word` that a sentence actually uses ("deployed" in "We deployed it"); null when absent */
export function formInSentence(sentence: string | null | undefined, word: string): string | null {
  if (!sentence || !word.trim()) return null;
  return new RegExp(wordFormsPattern(word), "i").exec(sentence)?.[0] ?? null;
}

/** Blank every occurrence of `word` and its inflections; null when the sentence does not contain it. */
export function maskAllWordForms(sentence: string, word: string, blank = "______"): string | null {
  if (!word.trim()) return null;
  const re = new RegExp(wordFormsPattern(word), "gi");
  return re.test(sentence) ? sentence.replace(re, blank) : null;
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
 * Every normalized reading of a text. "'s" can be "is", "has" or a possessive and "'d" can be "would"
 * or "had", so "Someone's knocking" matches "Someone is knocking". The possessive keeps its apostrophe,
 * so "it's" never matches "its".
 */
function answerReadings(text: string): string[] {
  const t = text.toLowerCase().replace(/[‘’ʼ´`]/g, "'");
  const sForms = /'s\b/.test(t) ? [" is", " has", "qpossq"] : [null];
  const dForms = /'d\b/.test(t) ? [" would", " had"] : [null];
  const out = new Set<string>();
  for (const sf of sForms) {
    for (const df of dForms) {
      let v = t;
      if (sf) v = v.replace(/'s\b/g, sf);
      if (df) v = v.replace(/'d\b/g, df);
      out.add(normalizeTypedText(v).replace(/qpossq/g, "'s"));
    }
  }
  return [...out];
}

/**
 * Whether a typed or picked answer solves a grammar exercise. Accepts the answer alone or the whole
 * sentence with it filled in ("She does not work on Sunday." for "She [not work] on Sunday."),
 * with contractions (incl. 's and 'd), case, curly quotes, punctuation and spacing ignored.
 */
export function isGrammarAnswerCorrect(input: string, ex: GradableExercise): boolean {
  const user = answerReadings(input).filter(Boolean);
  if (user.length === 0) return false;
  const answers = (Array.isArray(ex.correctAnswer) ? ex.correctAnswer : [ex.correctAnswer]).filter(Boolean);
  if (ex.errorWord) answers.push(ex.errorWord);
  const targets = new Set(answers.flatMap(answerReadings));
  // In error spotting the brackets mark clickable words, not a blank to fill
  if (ex.type !== "error_spotting") {
    for (const a of answers) {
      const sentence = fillPromptBlanks(ex.promptEn, a);
      if (sentence) answerReadings(sentence).forEach((r) => targets.add(r));
    }
  }
  return user.some((r) => targets.has(r));
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

  // Scheduled answers only: practice, retries and introductions would inflate accuracy.
  // An answer counts as remembered when it was not graded Again (Hard is a pass in FSRS).
  const rawLogs = await db.select<Array<{
    exercise_type: string;
    response_time_ms: number;
    rating: number;
    timestamp: string;
  }>>(
    `SELECT exercise_type, response_time_ms, rating, timestamp
     FROM review_logs
     WHERE timestamp >= $1 AND exercise_type != 'intro' AND (is_scheduled IS NULL OR is_scheduled = 1)
     ORDER BY timestamp ASC`,
    [cutoffStr]
  );
  const logs = rawLogs.map((l) => ({ ...l, is_correct: l.rating > 1 ? 1 : 0 }));

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
    meaning_match: 0,
    sentence_builder: 0,
    reverse_cloze: 0,
    listening: 0,
    free_writing: 0,
    letter_tiles: 0,
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


export interface MeaningMatchPair {
  wordId: string;
  word: string;
  meaningVN: string;
}

/** Pairs shown in the word ↔ meaning matching game (the reviewed word + up to 3 others) */
export const MEANING_MATCH_PAIRS = 4;

/**
 * Pairs for the matching game. The extra words must not leak or blur the answer:
 *  - never words that are still to come in this session (`excludeIds`): seeing their meaning now would
 *    turn their own question into a memory of a few seconds ago
 *  - never words confusable with another pair (synonyms / shared sense), never words still being analysed
 *  - words already known (reviewed before) are preferred, so the game does not introduce new words
 */
export function prepareMeaningMatch(
  primaryWord: WordDetail,
  allWords: WordDetail[],
  excludeIds: ReadonlySet<string> = new Set()
): MeaningMatchPair[] {
  const pairs: MeaningMatchPair[] = [];
  const chosen: WordDetail[] = [];
  const usedMeanings = new Set<string>();

  const tryAdd = (w: WordDetail): boolean => {
    const meaning = cleanMeaningForOption(w.meaning_vn || "");
    const meaningKey = meaning.trim().toLowerCase();
    if (!w.word.trim() || !meaningKey || isPlaceholderMeaning(w.meaning_vn) || usedMeanings.has(meaningKey)) return false;
    if (chosen.some((c) => areConfusable(c, w))) return false;
    usedMeanings.add(meaningKey);
    chosen.push(w);
    pairs.push({ wordId: w.id, word: w.word, meaningVN: meaning });
    return true;
  };

  if (!tryAdd(primaryWord)) return [];

  const candidates = allWords
    .filter((w) => w.id !== primaryWord.id && !excludeIds.has(w.id))
    .sort(() => 0.5 - Math.random())
    .sort((a, b) => Number((b.srs?.reps ?? 0) > 0) - Number((a.srs?.reps ?? 0) > 0));
  for (const w of candidates) {
    if (pairs.length >= MEANING_MATCH_PAIRS) break;
    tryAdd(w);
  }

  return pairs.sort(() => 0.5 - Math.random());
}
