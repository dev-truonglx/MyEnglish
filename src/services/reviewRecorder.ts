/**
 * One path for every answer to a vocabulary card (flashcard sessions, the review popup, the nudge's
 * micro-quiz): decide whether the answer may move the FSRS schedule, record it, log it with the card's
 * memory state, award XP and apply leech actions. Keeping this in one place is what keeps the three
 * entry points grading the same way.
 */
import { Rating } from "ts-fsrs";
import { emit } from "@tauri-apps/api/event";
import type { CardDirection, ReviewCard, SRSReview } from "@/types/database";
import { getDatabase, SRS_COLUMNS } from "./db";
import { getFSRSSettings, recordReview, type FSRSResult } from "./srs";
import { isValidEvidence } from "./cards";
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
export const INTRO_MIN_GAP_MS = 60 * 1000;
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
  if (new Date(ctx.card.srs.next_review_date).getTime() > now.getTime()) return { scheduled: false, reason: "not_due" };
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
    lapses: r.lapses,
    state: r.state as SRSReview["state"],
    last_review: r.lastReview ?? null,
    next_review_date: r.nextReviewDate,
    scheduled_days: r.scheduled_days,
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
 * asked again tomorrow. Logged with is_scheduled = 2 so the optimizer can tell it apart.
 */
async function creditRecognition(card: ReviewCard, exerciseType: ExerciseType, now: Date): Promise<FSRSResult | null> {
  const rec = card.srsRecognition;
  if (!rec || (rec.state ?? 0) !== 2) return null;
  const due = new Date(rec.next_review_date).getTime() <= now.getTime();
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
  await db.execute(`UPDATE words SET suspended = $1 WHERE id = $2`, [suspended ? 1 : 0, wordId]);
}

function notifyWordsChanged(): void {
  emit("words-changed").catch(() => {});
  try {
    window.dispatchEvent(new CustomEvent("words-changed"));
  } catch {}
}

/** Record one answer to a vocabulary card. See schedulingDecision for when the schedule moves. */
export async function recordCardAnswer(input: CardAnswerInput): Promise<CardAnswerResult> {
  const now = input.now ?? new Date();
  const { card, rating, scheduled } = input;
  const before = reviewLogBefore(card.srs, now);
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
  if (result && card.direction === "production" && rating >= Rating.Hard) {
    implicit = await creditRecognition(card, input.exerciseType, now).catch(() => null);
  }

  const becameLeech = !!result && !wasLeech && leechSettings.enabled && result.lapses >= leechSettings.threshold;
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

  if (input.countsForDailyGoal) recordDailyActivity(1);
  if (result || implicit || suspended) notifyWordsChanged();

  return { result, xp, implicit, becameLeech, suspended, mastered, rescued };
}

/** Log that a new (or relearned) word's introduction card was shown. Consumes the daily new-word budget. */
export async function recordIntro(card: ReviewCard, now: Date = new Date()): Promise<void> {
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
}

/**
 * The learner already knows a new word: its recognition card is scheduled as Easy (a check in about a week)
 * without a quiz. It is outside the daily new-word budget, and recall practice only starts once a real
 * review has confirmed the word (otherwise skimming hundreds of easy words would flood the budget with
 * recall cards). A word already studied is left alone. Returns whether the word was marked.
 */
export async function markWordKnown(wordId: string, now: Date = new Date()): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.select<SRSReview[]>(`SELECT ${SRS_COLUMNS} FROM srs_reviews WHERE word_id = $1 LIMIT 1`, [wordId]);
  const before = rows[0];
  if (before && ((before.reps ?? 0) > 0 || (before.state ?? 0) !== 0)) return false;
  await recordReview(wordId, Rating.Easy, "recognition", { unlockProduction: false });
  await saveReviewLog({
    wordId,
    exerciseType: "known",
    responseTimeMs: 0,
    isCorrect: true,
    wrongAttempts: 0,
    rating: Rating.Easy,
    xpEarned: 0,
    timestamp: now.toISOString(),
    isScheduled: false,
    direction: "recognition",
    before: before ? reviewLogBefore(before, now) : undefined,
  });
  await logLearningEvent("known", { wordId, direction: "recognition", at: now });
  notifyWordsChanged();
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

/**
 * Introductions shown recently, keyed "wordId:direction" -> time (ms). Lets any window know a new word was
 * already introduced, so its next appearance is the graded quiz rather than another introduction.
 */
export async function getRecentIntros(withinMs: number = 24 * 60 * 60 * 1000, now: Date = new Date()): Promise<Map<string, number>> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ word_id: string; direction: string | null; last: string }>>(
    `SELECT word_id, COALESCE(direction, 'recognition') AS direction, MAX(timestamp) AS last
     FROM review_logs WHERE exercise_type = 'intro' AND timestamp >= $1
     GROUP BY word_id, COALESCE(direction, 'recognition')`,
    [new Date(now.getTime() - withinMs).toISOString()]
  );
  const map = new Map<string, number>();
  for (const r of rows) {
    const t = new Date(r.last).getTime();
    if (Number.isFinite(t)) map.set(`${r.word_id}:${r.direction ?? "recognition"}`, t);
  }
  return map;
}
