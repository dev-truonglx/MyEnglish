/**
 * Pure helpers for the review popup (FocusReviewModal): which cards need an introduction,
 * the 4 options of a vocabulary question and the FSRS grade of an answer.
 */
import { Rating } from "ts-fsrs";
import type { ReviewCard, WordDetail } from "@/types/database";
import {
  cleanMeaningForOption,
  deriveRating,
  generateMultipleChoiceQuestion,
  isLeech,
  isNewCard,
  multipleChoiceDirection,
  selectExerciseType,
  YOUNG_STABILITY_DAYS,
  type ExerciseType,
} from "./smartReview";

/**
 * Question format of a vocabulary card in the popup, the same ladder as flashcard sessions:
 * - recognition card (read the word, know its meaning): multiple choice. Asking a learner to type a word
 *   they only need to recognise would fail cards whose skill is fine, and keep them in relearning
 * - recall card (produce the word): letter tiles while the memory is new or weak, including right after a
 *   failure at that stage; typing (cloze / spelling) once it has some strength (see selectExerciseType)
 */
export function selectSmartPopupMode(card: ReviewCard): "multiple_choice" | "letter_tiles" | "typing" {
  if (card.direction !== "production") return "multiple_choice";
  return selectExerciseType(card) === "letter_tiles" ? "letter_tiles" : "typing";
}

/**
 * How the popup asks a recognition card in multiple choice: the English word (pick its meaning), the meaning
 * with the sentence blanked (pick the word), or the word heard, not read (pick its meaning).
 */
export type PopupMcVariant = "en_to_vn" | "vn_to_en" | "listen";

/** Stability (days) from which a card may also be asked by ear in the popup */
export const POPUP_LISTEN_STABILITY_DAYS = 7;

/**
 * The popup shows up to 8 times a day, all multiple choice, and 2 known words in 3 came as the same English →
 * Vietnamese question. Young cards (and leeches) keep English → Vietnamese, the easiest step. Known cards
 * rotate with their review count: English → Vietnamese, Vietnamese → English, and from
 * POPUP_LISTEN_STABILITY_DAYS by ear, when this computer has an English voice (`canSpeak`). Every variant
 * tests recognition.
 */
export function popupMcVariant(card: ReviewCard, canSpeak: boolean): PopupMcVariant {
  const { state = 0, stability = 0, reps = 0 } = card.srs || {};
  if (card.direction !== "recognition" || state !== 2 || stability < YOUNG_STABILITY_DAYS || isLeech(card.srs)) {
    return multipleChoiceDirection(card);
  }
  const variants: PopupMcVariant[] =
    canSpeak && stability >= POPUP_LISTEN_STABILITY_DAYS ? ["en_to_vn", "vn_to_en", "listen"] : ["en_to_vn", "vn_to_en"];
  return variants[reps % variants.length];
}

/** The exercise a popup multiple-choice answer is logged as */
export function popupMcExercise(variant: PopupMcVariant): ExerciseType {
  return variant === "listen" ? "listening" : "multiple_choice";
}

export interface PopupChoice {
  id: string;
  word: string;
  isCorrect: boolean;
}

/**
 * A brand-new word is shown (word, meaning, example, audio) before being quizzed: asking about a
 * word never seen is a guess. A new recall card belongs to a word already learned, so no intro.
 */
export function needsIntro(card: ReviewCard): boolean {
  return card.direction === "recognition" && isNewCard(card);
}

/**
 * Options of a vocabulary question, with plausible distractors (same topic / part of speech):
 * "en_to_vn" shows the word and offers meanings, "vn_to_en" shows the meaning and offers words.
 */
export function buildPopupChoices(
  target: WordDetail,
  allWords: WordDetail[],
  direction: "en_to_vn" | "vn_to_en" = "vn_to_en"
): PopupChoice[] {
  return generateMultipleChoiceQuestion(target, allWords, direction).options.map((o) => ({
    id: o.id,
    word: o.text,
    isCorrect: o.isCorrect,
  }));
}

/**
 * Same grading as flashcard sessions: wrong -> Again, typo / synonym tried first -> Hard,
 * else Good (however slow). Never Easy.
 */
export function popupAnswerRating(
  correct: boolean,
  exerciseType: ExerciseType,
  responseTimeMs: number,
  nearMiss = false,
  confusedWithSynonym = false,
  usedHint = false
): Rating {
  if (!correct) return Rating.Again;
  return deriveRating({ exerciseType, wrongAttempts: 0, nearMiss, confusedWithSynonym, usedHint, responseTimeMs });
}

/** The word the learner picked instead of the right one, to explain the mix-up after a wrong answer */
export function describeWrongChoice(
  choiceId: string | null,
  allWords: WordDetail[]
): { word: string; meaning: string } | null {
  if (!choiceId) return null;
  const picked = allWords.find((w) => w.id === choiceId);
  if (!picked) return null; // filler option, not a real word
  return { word: picked.word, meaning: cleanMeaningForOption(picked.meaning_vn) };
}
