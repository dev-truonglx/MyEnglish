/**
 * Words for extra practice: answers that never move FSRS ("Luyện thêm" / "Luyện tất cả", the popup when no
 * word is due, or fewer than it asks for). FSRS already spaces the graded reviews. Practice used to take the
 * weakest words in a fixed order (smartSortReviewQueue), and since a practice answer does not change that
 * order, a popup every 30 minutes asked the same few words all day, however often they were answered right.
 *
 * Here a word answered right several times in a row rests from practice for a while (its graded reviews still
 * come on the FSRS schedule), words missed lately come first, words seen in the last hours go behind the
 * others, and near-equal words are taken in random order so two sessions do not ask the same list.
 */
import type { ReviewCard, WordDetail } from "@/types/database";
import { getDatabase, isPlaceholderMeaning } from "./db";
import { getNextReviewDate, isWordDue } from "./cards";
import {
  calculateRetrievability,
  isLeech,
  isSuspended,
  pickExample,
  selectExerciseType,
  YOUNG_STABILITY_DAYS,
  type ExerciseType,
} from "./smartReview";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Right answers in a row after which a word rests from practice */
export const SOLID_STREAK = 2;
/** Answers this close to the previous one count once: a retry minutes after a mistake proves little */
export const RUN_BURST_MS = 5 * MINUTE_MS;
/** A word answered right this recently (once) goes behind the words not seen for a while */
export const RECENT_ANSWER_MS = 3 * HOUR_MS;
/** A card due again within this time (a learning step) comes graded soon: practising it now is a repeat */
export const PRACTICE_SOON_MS = 3 * HOUR_MS;
/** Longest rest, and how far back answers are read */
export const MAX_PRACTICE_REST_MS = 7 * DAY_MS;

/** The latest answers to a word, both cards, every window, practice included */
export interface RecentRun {
  /**
   * Right answers in a row, newest first: Good or Easy, answers less than RUN_BURST_MS apart counting once.
   * A Hard (hint, typo) or a wrong answer ends the run.
   */
  streak: number;
  /** Latest answer (ms) */
  lastAt: number;
  /** The latest answer was wrong or needed help (Again / Hard) */
  lastMissed: boolean;
}

/** How long a word answered right `streak` times in a row rests from practice */
export function practiceRestMs(streak: number): number {
  if (streak < SOLID_STREAK) return 0;
  if (streak === SOLID_STREAK) return 20 * HOUR_MS; // until about the same time tomorrow
  if (streak === SOLID_STREAK + 1) return 3 * DAY_MS;
  return MAX_PRACTICE_REST_MS;
}

/** The word was answered right often enough lately to be left out of practice for now */
export function isResting(run: RecentRun | null | undefined, now: number): boolean {
  return !!run && now - run.lastAt < practiceRestMs(run.streak);
}

/** Summary of a word's answers, given newest first (`rating`: 1 Again … 4 Easy) */
export function summarizeRun(answers: ReadonlyArray<{ rating: number; at: number }>): RecentRun | null {
  if (answers.length === 0) return null;
  let streak = 0;
  let countedAt = Infinity;
  for (const a of answers) {
    if (a.rating < 3) break;
    if (countedAt - a.at >= RUN_BURST_MS) {
      streak++;
      countedAt = a.at;
    }
  }
  return { streak, lastAt: answers[0].at, lastMissed: answers[0].rating < 3 };
}

/**
 * Recent runs of every word answered in the last MAX_PRACTICE_REST_MS. Introductions and "Đã biết" marks are
 * no answers; a recognition card credited by a recall answer (is_scheduled = 2) repeats that answer.
 */
export async function loadRecentRuns(now: Date = new Date()): Promise<Map<string, RecentRun>> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ word_id: string; rating: number; timestamp: string }>>(
    `SELECT word_id, rating, timestamp FROM review_logs
     WHERE timestamp >= $1
       AND exercise_type NOT IN ('intro', 'known')
       AND COALESCE(is_scheduled, 0) <> 2
     ORDER BY word_id, timestamp DESC`,
    [new Date(now.getTime() - MAX_PRACTICE_REST_MS).toISOString()]
  );
  const byWord = new Map<string, Array<{ rating: number; at: number }>>();
  for (const r of rows) {
    const at = Date.parse(r.timestamp);
    if (!Number.isFinite(at)) continue;
    const list = byWord.get(r.word_id);
    if (list) list.push({ rating: r.rating, at });
    else byWord.set(r.word_id, [{ rating: r.rating, at }]);
  }
  const runs = new Map<string, RecentRun>();
  for (const [id, answers] of byWord) {
    const run = summarizeRun(answers);
    if (run) runs.set(id, run);
  }
  return runs;
}

export interface PracticePickOptions {
  now?: Date;
  /** Words already in the session or popup */
  exclude?: ReadonlySet<string>;
  /** "weakest" (default): words missed lately, then the weakest memories. "random": any order */
  order?: "weakest" | "random";
  /**
   * Resting words fill what is left (fewest right answers in a row, then least recently answered first)
   * instead of leaving the list short. For the popup, which must not open empty.
   */
  fillWithResting?: boolean;
  /** Random source (tests) */
  random?: () => number;
}

/** Quizzed at least once: a word never quizzed needs its introduction, not practice */
function wasQuizzed(w: WordDetail): boolean {
  return (w.srs?.reps ?? 0) > 0 || (w.srsProduction?.reps ?? 0) > 0;
}

/** Recall of the weaker of the word's started cards */
function weakestRetrievability(w: WordDetail, now: Date): number {
  const recognition = calculateRetrievability(w.srs, now);
  return w.srsProduction && (w.srsProduction.reps ?? 0) > 0
    ? Math.min(recognition, calculateRetrievability(w.srsProduction, now))
    : recognition;
}

/**
 * Up to `count` words for practice, in this order:
 *  1. words not seen lately: missed lately first, then the weakest (or at random), near-equal ones shuffled
 *  2. words answered right once in the last RECENT_ANSWER_MS, due now, or due again within PRACTICE_SOON_MS
 *     (a learning step): least recently answered first
 *  3. only with `fillWithResting`: words resting after SOLID_STREAK right answers in a row
 * Words never quizzed, suspended or still without a meaning are left out.
 */
export function pickPracticeWords<T extends WordDetail>(
  words: readonly T[],
  runs: ReadonlyMap<string, RecentRun>,
  count: number,
  options: PracticePickOptions = {}
): T[] {
  if (count <= 0) return [];
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const random = options.random ?? Math.random;
  const fresh: Array<{ w: T; score: number }> = [];
  const later: Array<{ w: T; at: number }> = [];
  const resting: Array<{ w: T; run: RecentRun }> = [];

  for (const w of words) {
    if (options.exclude?.has(w.id) || isPlaceholderMeaning(w.meaning_vn) || isSuspended(w) || !wasQuizzed(w)) continue;
    const run = runs.get(w.id);
    if (run && isResting(run, nowMs)) {
      resting.push({ w, run });
      continue;
    }
    const comingSoon = isWordDue(w, now) || getNextReviewDate(w).getTime() - nowMs < PRACTICE_SOON_MS;
    const seenRecently = !!run && !run.lastMissed && nowMs - run.lastAt < RECENT_ANSWER_MS;
    if (comingSoon || seenRecently) {
      later.push({ w, at: run?.lastAt ?? 0 });
      continue;
    }
    const missed = run?.lastMissed ? 1 : 0;
    const score =
      options.order === "random"
        ? random() + missed * 0.5
        : 1 - weakestRetrievability(w, now) + missed + random() * 0.3;
    fresh.push({ w, score });
  }

  fresh.sort((a, b) => b.score - a.score);
  later.sort((a, b) => a.at - b.at);
  const picked = [...fresh.map((x) => x.w), ...later.map((x) => x.w)];
  if (options.fillWithResting && picked.length < count) {
    resting.sort((a, b) => a.run.streak - b.run.streak || a.run.lastAt - b.run.lastAt);
    picked.push(...resting.map((x) => x.w));
  }
  return picked.slice(0, count);
}

/** Words of `words` resting from practice now (see isResting) */
export function countResting(words: readonly WordDetail[], runs: ReadonlyMap<string, RecentRun>, now: Date = new Date()): number {
  const nowMs = now.getTime();
  return words.filter((w) => isResting(runs.get(w.id), nowMs)).length;
}

/**
 * The exercise for a practice card. Practice moves no schedule, so the format need not follow the review count,
 * which practice never changes: the same word came back as the same exercise every time. Recognition cards
 * rotate with `seed` through the formats of their band (young: multiple choice and matching; known: listening
 * and reading in context too, listening only with an English voice); recall keeps its ladder
 * (selectExerciseType), which follows what the learner can already produce. The caller still falls back when a
 * format cannot be built (too few words to match, no sentence).
 */
export function practiceExerciseType(card: ReviewCard, seed: number, canSpeak: boolean): ExerciseType {
  if (card.direction === "production") return selectExerciseType(card);
  const { state = 0, reps = 0, stability = 0 } = card.srs || {};
  if (state === 0 && reps === 0) return selectExerciseType(card);
  const withExample = !!pickExample(card);
  const young = state !== 2 || stability < YOUNG_STABILITY_DAYS || isLeech(card.srs);
  const formats: ExerciseType[] = young
    ? ["multiple_choice", "meaning_match", ...(withExample ? (["context_match"] as const) : [])]
    : [
        "multiple_choice",
        "meaning_match",
        ...(canSpeak ? (["listening"] as const) : []),
        ...(withExample ? (["context_match", "reverse_cloze"] as const) : []),
      ];
  return formats[Math.abs(Math.floor(seed)) % formats.length];
}
