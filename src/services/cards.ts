/**
 * Review cards: each word has a recognition card (always) and a production card (once the word
 * has been learned by recognition). Pure helpers, no database or Tauri access.
 */
import type { CardDirection, ReviewCard, SRSReview, WordDetail } from "@/types/database";
import type { ExerciseType } from "./smartReview";

/**
 * Which card an exercise is valid evidence for.
 *  - recognition: understand the English word when reading / hearing it (pick or match its meaning)
 *  - production: produce the English word from its meaning (typed, with or without a sentence)
 *  - null: practice only. Rebuilding a shuffled sentence does not test the word's meaning, so it never
 *    moves a schedule.
 */
const EXERCISE_DIRECTION: Record<ExerciseType, CardDirection | null> = {
  flip: "recognition",
  multiple_choice: "recognition",
  context_match: "recognition",
  meaning_match: "recognition",
  reverse_cloze: "recognition",
  listening: "recognition",
  spelling: "production",
  cloze: "production",
  free_writing: "production",
  letter_tiles: "production",
  sentence_builder: null,
};

export function exerciseDirection(exerciseType: ExerciseType): CardDirection | null {
  return EXERCISE_DIRECTION[exerciseType] ?? null;
}

/** Which card an exercise trains (practice-only exercises are logged against recognition). */
export function directionForExercise(exerciseType: ExerciseType): CardDirection {
  return exerciseDirection(exerciseType) ?? "recognition";
}

/** Whether an answer to this exercise may update the FSRS schedule of a card of this direction. */
export function isValidEvidence(exerciseType: ExerciseType, direction: CardDirection): boolean {
  return exerciseDirection(exerciseType) === direction;
}

/** Recognition schedule of a word or card (on a production card `srs` is the production schedule). */
function recognitionSrs(word: WordDetail): SRSReview {
  return (word as Partial<ReviewCard>).srsRecognition ?? word.srs;
}

export function getCardSrs(word: WordDetail, direction: CardDirection): SRSReview | null {
  return direction === "recognition" ? recognitionSrs(word) : word.srsProduction ?? null;
}

/** A card for `direction`; falls back to recognition when the word has no production card yet. */
export function toCard(word: WordDetail, direction: CardDirection): ReviewCard {
  const srsRecognition = recognitionSrs(word);
  const production = direction === "production" ? word.srsProduction : null;
  return production
    ? { ...word, srs: production, srsRecognition, direction: "production" }
    : { ...word, srs: srsRecognition, srsRecognition, direction: "recognition" };
}

/** A new word's first graded quiz must come at least this long after its introduction card */
export const INTRO_READY_MS = 60 * 1000;

/** Start of the local day after `now` (ms) */
export function nextLocalDayStart(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
}

/**
 * The one "is this card due" rule, used by sessions, counts and grading:
 *  - a Review card on a schedule of a day or more is due for its whole due day (local time), like Anki:
 *    once the morning's reviews are done, the same cards do not come back in the evening
 *  - learning / relearning cards (minute steps) and new cards are due to the minute
 *  - a new card whose introduction was shown (last_review set by recordIntro) at least INTRO_READY_MS ago
 *    is due: postponing its first quiz only keeps it out of the minute after the introduction
 */
export function isDueSrs(srs: Partial<SRSReview> | null | undefined, now: Date = new Date()): boolean {
  if (!srs?.next_review_date) return false;
  const due = new Date(srs.next_review_date).getTime();
  if (due <= now.getTime()) return true;
  const state = srs.state ?? 0;
  if (state === 2 && (srs.scheduled_days ?? srs.interval ?? 0) >= 1) return due < nextLocalDayStart(now);
  if (state === 0 && (srs.reps ?? 0) === 0 && srs.last_review) {
    const introducedAt = new Date(srs.last_review).getTime();
    return Number.isFinite(introducedAt) && now.getTime() - introducedAt >= INTRO_READY_MS;
  }
  return false;
}

/** Cards of this word that are due now (recognition first), see isDueSrs. */
export function getDueCards(word: WordDetail, now: Date = new Date()): ReviewCard[] {
  const cards: ReviewCard[] = [];
  if (isDueSrs(recognitionSrs(word), now)) cards.push(toCard(word, "recognition"));
  if (isDueSrs(word.srsProduction, now)) cards.push(toCard(word, "production"));
  return cards;
}

export function isWordDue(word: WordDetail, now: Date = new Date()): boolean {
  return isDueSrs(recognitionSrs(word), now) || isDueSrs(word.srsProduction, now);
}

/** Earliest next review across both cards (for sorting / "next review" labels). */
export function getNextReviewDate(word: WordDetail): Date {
  const rec = new Date(recognitionSrs(word).next_review_date).getTime();
  const prod = word.srsProduction ? new Date(word.srsProduction.next_review_date).getTime() : Infinity;
  return new Date(Math.min(rec, prod));
}

/** Words as recognition cards: used for practice sessions and legacy callers. */
export function asRecognitionCards(words: WordDetail[]): ReviewCard[] {
  return words.map((w) => toCard(w, "recognition"));
}

/**
 * Cards for extra practice (not recorded in FSRS): drill recall for words that already have a
 * production card, recognition for the rest.
 */
export function practiceCards(words: WordDetail[]): ReviewCard[] {
  return words.map((w) => toCard(w, w.srsProduction ? "production" : "recognition"));
}
