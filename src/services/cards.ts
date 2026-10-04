/**
 * Review cards: each word has a recognition card (always) and a production card (once the word
 * has been learned by recognition). Pure helpers, no database or Tauri access.
 */
import type { CardDirection, ReviewCard, SRSReview, WordDetail } from "@/types/database";
import type { ExerciseType } from "./smartReview";

/** Exercises that only require recognising the word or its meaning among options */
const RECOGNITION_EXERCISE_TYPES: ReadonlySet<ExerciseType> = new Set<ExerciseType>([
  "flip",
  "multiple_choice",
  "context_match",
  "sentence_builder",
  "reverse_cloze",
]);

/** Which card an exercise trains: producing the English word (typing/dictation) vs recognising it. */
export function directionForExercise(exerciseType: ExerciseType): CardDirection {
  return RECOGNITION_EXERCISE_TYPES.has(exerciseType) ? "recognition" : "production";
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

function isDueSrs(srs: SRSReview | null | undefined, now: Date): boolean {
  return !!srs && new Date(srs.next_review_date).getTime() <= now.getTime();
}

/** Cards of this word that are due now (recognition first). */
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
