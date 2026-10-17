/**
 * One path for every answer to a vocabulary card (flashcard sessions, the review popup, the nudge's
 * micro-quiz): decide whether the answer may move the FSRS schedule, record it, log it with the card's
 * memory state, award XP and apply leech actions. Keeping this in one place is what keeps the three
 * entry points grading the same way.
 */
import { Rating } from "ts-fsrs";
import { emit } from "@tauri-apps/api/event";
import { getInitialWindowLabel } from "@/lib/windowLabel";
import type { CardDirection, ReviewCard, SRSReview } from "@/types/database";
import { getDatabase, SRS_COLUMNS } from "./db";
import { getFSRSSettings, recordReview, type FSRSResult } from "./srs";
import { INTRO_READY_MS, isDueSrs, isValidEvidence } from "./cards";
import {
  awardXP,
  calculateRetrievability,
  calculateXPReward,
  getLeechSettings,
  isLeech,
  isSuspended,
  MATURE_STABILITY_DAYS,
  reviewLogBefore,
  saveReviewLog,
  type ExerciseType,
  type XPReward,
} from "./smartReview";
import { recordDailyActivity } from "./streak";
import { logLearningEvent } from "./learningEvents";

/** A new word's first graded quiz must come at least this long after its introduction card */
export const INTRO_MIN_GAP_MS = INTRO_READY_MS;
/** A new word quizzed too soon after its introduction is asked again (graded) after this delay */
export const INTRO_POSTPONE_MINUTES = 10;

export type PracticeReason =
  | "practice_mode" // the learner chose extra practice
  | "already_graded" // this card was already graded in this session (retry after Again)
  | "exercise_mismatch" // the exercise does not test this card's direction, or is practice-only
  | "not_due" // the card is not due yet: reviewing early would distort its schedule
  | "intro_too_recent" // asked seconds after its introduction: that is short-term memory
  | "suspended";

export interface SchedulingDecision {
  scheduled: boolean;
  reason?: PracticeReason;
}

export interface SchedulingContext {
  card: ReviewCard;
  exerciseType: ExerciseType;
  practiceMode?: boolean;
  /** The card (word + direction) was already graded in this session */
  alreadyGraded?: boolean;
  /** When the card's introduction (new word / leech relearn) was shown, if it was */
  introducedAt?: number | null;
  now?: Date;
}

/**
 * Whether an answer may update the card's FSRS schedule. Only a first answer, to a due card, through an
 * exercise that really tests the card's direction, counts. Everything else is recorded as practice.
 */
export function schedulingDecision(ctx: SchedulingContext): SchedulingDecision {
  const now = ctx.now ?? new Date();
  if (ctx.practiceMode) return { scheduled: false, reason: "practice_mode" };
  if (isSuspended(ctx.card)) return { scheduled: false, reason: "suspended" };
  if (ctx.alreadyGraded) return { scheduled: false, reason: "already_graded" };
  if (!isValidEvidence(ctx.exerciseType, ctx.card.direction)) return { scheduled: false, reason: "exercise_mismatch" };
  if (!isDueSrs(ctx.card.srs, now)) return { scheduled: false, reason: "not_due" };
  if (ctx.introducedAt != null && now.getTime() - ctx.introducedAt < INTRO_MIN_GAP_MS) {
    return { scheduled: false, reason: "intro_too_recent" };
  }
  return { scheduled: true };
}

export interface CardAnswerInput {
  card: ReviewCard;
  exerciseType: ExerciseType;
  rating: Rating;
  wrongAttempts: number;
  responseTimeMs: number;
  /** From schedulingDecision */
  scheduled: boolean;
  /** First answer to this card in the session: counts toward the daily goal */
  countsForDailyGoal: boolean;
  now?: Date;
}

export interface CardAnswerResult {
  /** New schedule when the answer was scheduled */
  result: FSRSResult | null;
  xp: XPReward;
  /** Recognition schedule credited by a correct recall answer */
  implicit: FSRSResult | null;
  /** The answer turned the card into a leech */
  becameLeech: boolean;
  /** The leech action suspended the word */
  suspended: boolean;
  /** This answer took the card into long-term memory (stability crossed MATURE_STABILITY_DAYS) */
  mastered: boolean;
  /**
   * Remembered while FSRS expected the memory to be fading (R < RESCUE_RETRIEVABILITY): the most
   * valuable kind of review, worth telling the learner about.
   */
  rescued: boolean;
  /** Whether the answer really moved the schedule (a scheduled answer can be downgraded, see practiceReason) */
  scheduled: boolean;
  /**
   * Why an answer the caller decided to schedule was recorded as practice: the stored card was no longer
   * due (graded since the caller's snapshot was taken). Null otherwise.
   */
  practiceReason: PracticeReason | null;
}

/** Below this predicted recall, remembering the word counts as "rescued just before forgetting" */
export const RESCUE_RETRIEVABILITY = 0.8;

/**
 * Whether a scheduled answer moved a card into long-term memory: it was below MATURE_STABILITY_DAYS
 * and is now at or above it, still in Review state (not just forgotten).
 */
export function crossedMastery(stabilityBefore: number | null | undefined, after: FSRSResult | null): boolean {
  if (!after || after.state !== 2) return false;
  return (stabilityBefore ?? 0) < MATURE_STABILITY_DAYS && after.stability >= MATURE_STABILITY_DAYS;
}

function srsAfter(card: SRSReview, r: FSRSResult): SRSReview {
  return {
    ...card,
    stability: r.stability,
    difficulty: r.difficulty,
    reps: r.reps,
    repetitions: r.reps,
    lapses: r.lapses,
    state: r.state as SRSReview["state"],
    last_review: r.lastReview ?? null,
    next_review_date: r.nextReviewDate,
    scheduled_days: r.scheduled_days,
    interval: r.scheduled_days,
    learning_steps: r.learningSteps,
  };
}

/** The card with its schedule replaced by a recorded result (for in-session requeues and summaries). */
export function cardWithResult(card: ReviewCard, r: FSRSResult): ReviewCard {
  const srs = srsAfter(card.srs, r);
  return card.direction === "recognition" ? { ...card, srs, srsRecognition: srs } : { ...card, srs, srsProduction: srs };
}

/**
 * Producing the English word from its meaning proves the word is also recognised. When the recognition
 * card is due (or has faded below the target retention), it is credited with Good instead of being
 * asked again tomorrow. Logged with is_scheduled = 2 so the optimizer can tell it apart. Letter tiles
 * never credit it.
 */
async function creditRecognition(card: ReviewCard, exerciseType: ExerciseType, now: Date): Promise<FSRSResult | null> {
  // Building the word from its own letters is not enough evidence of reading it (M9)
  if (exerciseType === "letter_tiles") return null;
  // Decide on the stored row, not the session snapshot: the popup window may have graded the recognition
  // card since (now Relearning or no longer due), and crediting it again would grade one recall twice
  const rec = await readStoredSrs({ ...card, direction: "recognition" });
  if (!rec || (rec.state ?? 0) !== 2) return null;
  const due = isDueSrs(rec, now);
  const R = calculateRetrievability(rec, now);
  if (!due && R >= getFSRSSettings().requestRetention) return null;
  const before = reviewLogBefore(rec, now);
  const result = await recordReview(card.id, Rating.Good, "recognition");
  await saveReviewLog({
    wordId: card.id,
    exerciseType,
    responseTimeMs: 0,
    isCorrect: true,
    wrongAttempts: 0,
    rating: Rating.Good,
    xpEarned: 0,
    timestamp: now.toISOString(),
    isScheduled: true,
    implicit: true,
    direction: "recognition",
    before,
  }).catch((err) => console.warn("Implicit review log save failed:", err));
  return result;
}

export async function setWordSuspended(wordId: string, suspended: boolean): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE words SET suspended = $1, updated_at = $3 WHERE id = $2`, [suspended ? 1 : 0, wordId, new Date().toISOString()]);
}

/** Payload of the "words-changed" event (Tauri) and `detail` of the DOM event */
export interface WordsChangedDetail {
  source?: string;
  /** Only these words changed (a review, an introduction): listeners may reload just them. Absent: anything. */
  wordIds?: string[];
}

/** DOM event of the main window for another window's word changes held back while it is hidden (the list and
 *  the cards reload once it is shown): the cloud sync listens to it to push them meanwhile */
export const WORDS_CHANGED_WHILE_HIDDEN_EVENT = "myenglish-words-changed-while-hidden";

/** Tells every window the words changed. `source`: the Tauri event also comes back to the window that sent it,
 *  which has already had the DOM event, so only other windows' changes are re-dispatched there. */
export function notifyWordsChanged(wordIds?: string[]): void {
  emit("words-changed", { source: getInitialWindowLabel(), wordIds } satisfies WordsChangedDetail).catch(() => {});
  try {
    window.dispatchEvent(new CustomEvent<WordsChangedDetail>("words-changed", { detail: { wordIds } }));
  } catch {}
}

/** The card's stored schedule: the row recordReview would update (production falls back to recognition). */
async function readStoredSrs(card: ReviewCard): Promise<SRSReview | null> {
  const db = await getDatabase();
  const read = (table: string) =>
    db.select<SRSReview[]>(`SELECT ${SRS_COLUMNS} FROM ${table} WHERE word_id = $1 LIMIT 1`, [card.id]);
  let rows = await read(card.direction === "production" ? "srs_production" : "srs_reviews");
  if (card.direction === "production" && rows.length === 0) rows = await read("srs_reviews");
  return rows[0] ?? null;
}

/**
 * Whether the stored row shows the card was graded after the snapshot was taken. A new card stays new
 * until its first graded answer (a postponed quiz moves its due date but is no grade); any other card was
 * graded when it is no longer due (same rule as schedulingDecision).
 */
export function wasGradedSince(snapshot: Partial<SRSReview>, stored: Partial<SRSReview>, now: Date = new Date()): boolean {
  const isNew = (s: Partial<SRSReview>) => (s.state ?? 0) === 0 && (s.reps ?? 0) === 0;
  if (isNew(snapshot)) return !isNew(stored);
  return !isDueSrs(stored, now);
}

/** Record one answer to a vocabulary card. See schedulingDecision for when the schedule moves. */
export async function recordCardAnswer(input: CardAnswerInput): Promise<CardAnswerResult> {
  const now = input.now ?? new Date();
  const { card, rating } = input;
  // schedulingDecision saw a snapshot (session queue, popup). If the card was graded since (popup, another
  // window, an earlier mount of the session), its stored row is no longer due: grading it again would move
  // FSRS twice for one recall and count twice toward the daily goal, so the answer becomes practice.
  const stored = input.scheduled ? await readStoredSrs(card).catch(() => null) : null;
  const gradedSince = !!stored && wasGradedSince(card.srs, stored, now);
  const scheduled = input.scheduled && !gradedSince;
  const practiceReason: PracticeReason | null = gradedSince ? "not_due" : null;
  const before = reviewLogBefore(gradedSince && stored ? stored : card.srs, now);
  const leechSettings = getLeechSettings();
  const wasLeech = isLeech(card.srs, leechSettings);

  const result = scheduled ? await recordReview(card.id, rating, card.direction) : null;

  const xp = calculateXPReward({
    rating,
    exerciseType: input.exerciseType,
    scheduled,
    direction: card.direction,
    retrievabilityBefore: before?.retrievability,
    isLeechWord: wasLeech,
  });
  if (xp.totalXP > 0) awardXP(xp.totalXP);

  await saveReviewLog({
    wordId: card.id,
    exerciseType: input.exerciseType,
    responseTimeMs: input.responseTimeMs,
    isCorrect: rating > Rating.Again,
    wrongAttempts: input.wrongAttempts,
    rating,
    xpEarned: xp.totalXP,
    timestamp: now.toISOString(),
    isScheduled: scheduled,
    direction: result?.direction ?? card.direction,
    before,
  }).catch((err) => console.warn("Review log save failed:", err));

  let implicit: FSRSResult | null = null;
  // (a production answer recorded on the recognition card — no production card yet — is not a second grade)
  if (result && card.direction === "production" && result.direction === "production" && rating >= Rating.Hard) {
    implicit = await creditRecognition(card, input.exerciseType, now).catch(() => null);
  }

  const becameLeech =
    !!result && !wasLeech && isLeech({ lapses: result.lapses, stability: result.stability }, leechSettings);
  let suspended = false;
  if (becameLeech && leechSettings.action === "suspend") {
    await setWordSuspended(card.id, true).catch(() => {});
    suspended = true;
  }

  const mastered = crossedMastery(before?.stability, result);
  if (mastered) {
    await logLearningEvent("mastered", {
      wordId: card.id,
      direction: card.direction,
      meta: { word: card.word, stability: Number(result!.stability.toFixed(1)) },
      at: now,
    });
  }
  const rescued =
    !!result && rating >= Rating.Hard && before?.retrievability != null && before.retrievability < RESCUE_RETRIEVABILITY;

  if (input.countsForDailyGoal && !gradedSince) recordDailyActivity(1);
  if (result || implicit || suspended) notifyWordsChanged([card.id]);

  return { result, xp, implicit, becameLeech, suspended, mastered, rescued, scheduled, practiceReason };
}

/** Log that a new (or relearned) word's introduction card was shown. Consumes the daily new-word budget. */
export async function recordIntro(card: ReviewCard, now: Date = new Date()): Promise<void> {
  const db = await getDatabase();
  await db
    .execute(
      `UPDATE srs_reviews
       SET last_review = COALESCE(last_review, $1)
       WHERE word_id = $2`,
      [now.toISOString(), card.id]
    )
    .catch((err) => console.warn("Failed to update srs_reviews last_review on intro:", err));

  await saveReviewLog({
    wordId: card.id,
    exerciseType: "intro",
    responseTimeMs: 0,
    isCorrect: true,
    wrongAttempts: 0,
    rating: 0,
    xpEarned: 0,
    timestamp: now.toISOString(),
    isScheduled: false,
    direction: card.direction,
    before: reviewLogBefore(card.srs, now),
  }).catch((err) => console.warn("Intro log save failed:", err));

  notifyWordsChanged([card.id]);
}

/** First check of a word marked "Đã biết": spread over this many days, by word id */
export const KNOWN_CHECK_MIN_DAYS = 4;
export const KNOWN_CHECK_MAX_DAYS = 21;
/** Difficulty a word marked "Đã biết" starts with: a middle value, as after a first Good (not the minimum, as Easy gave) */
export const KNOWN_DIFFICULTY = 5;

/**
 * Days until the first check of a word marked "Đã biết", from KNOWN_CHECK_MIN_DAYS to KNOWN_CHECK_MAX_DAYS.
 * Deterministic (a hash of the word id, not Math.random): marking hundreds of words in one sitting spreads
 * their checks over two and a half weeks instead of piling them on one day, and a retry gives the same date.
 */
export function knownCheckDays(wordId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < wordId.length; i++) {
    h ^= wordId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return KNOWN_CHECK_MIN_DAYS + ((h >>> 0) % (KNOWN_CHECK_MAX_DAYS - KNOWN_CHECK_MIN_DAYS + 1));
}

/**
 * The learner already knows a new word: its recognition card goes straight to Review without a quiz, with a
 * middle difficulty (KNOWN_DIFFICULTY) and a stability equal to the wait before its first check (knownCheckDays),
 * so FSRS expects 90% recall on that day. It is outside the daily new-word budget, it is not "remembered" until
 * a real review confirms it (see isKnownOnly), and recall practice only starts after that review (otherwise
 * skimming hundreds of easy words would flood the budget with recall cards). A word already studied is left
 * alone. Returns whether the word was marked.
 */
export async function markWordKnown(wordId: string, now: Date = new Date()): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.select<SRSReview[]>(`SELECT ${SRS_COLUMNS} FROM srs_reviews WHERE word_id = $1 LIMIT 1`, [wordId]);
  const before = rows[0];
  if (before && ((before.reps ?? 0) > 0 || (before.state ?? 0) !== 0)) return false;
  const days = knownCheckDays(wordId);
  const due = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  await db.execute(
    `INSERT INTO srs_reviews (
       word_id, ease_factor, interval, repetitions, next_review_date,
       stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, learning_steps
     )
     VALUES ($1, 2.5, $2, 1, $3, $2, $4, 0, $2, 1, 0, 2, $5, 0)
     ON CONFLICT(word_id) DO UPDATE SET
       ease_factor = excluded.ease_factor,
       interval = excluded.interval,
       repetitions = excluded.repetitions,
       next_review_date = excluded.next_review_date,
       stability = excluded.stability,
       difficulty = excluded.difficulty,
       elapsed_days = excluded.elapsed_days,
       scheduled_days = excluded.scheduled_days,
       reps = excluded.reps,
       lapses = excluded.lapses,
       state = excluded.state,
       last_review = excluded.last_review,
       learning_steps = excluded.learning_steps`,
    [wordId, days, due, KNOWN_DIFFICULTY, now.toISOString()]
  );
  await saveReviewLog({
    wordId,
    exerciseType: "known",
    responseTimeMs: 0,
    isCorrect: true,
    wrongAttempts: 0,
    rating: Rating.Good,
    xpEarned: 0,
    timestamp: now.toISOString(),
    isScheduled: false,
    direction: "recognition",
    before: before ? reviewLogBefore(before, now) : undefined,
  });
  await logLearningEvent("known", { wordId, direction: "recognition", at: now });
  notifyWordsChanged([wordId]);
  return true;
}

/**
 * A new card answered too soon after its introduction stays new but becomes due a few minutes later,
 * so its first graded review is a real retrieval (next popup / later in the session).
 */
export async function postponeNewCard(
  wordId: string,
  direction: CardDirection,
  minutes: number = INTRO_POSTPONE_MINUTES,
  now: Date = new Date()
): Promise<string> {
  const db = await getDatabase();
  const table = direction === "production" ? "srs_production" : "srs_reviews";
  const due = new Date(now.getTime() + minutes * 60 * 1000).toISOString();
  await db.execute(
    `UPDATE ${table} SET next_review_date = $1 WHERE word_id = $2 AND COALESCE(state, 0) = 0 AND COALESCE(reps, 0) = 0`,
    [due, wordId]
  );
  return due;
}

