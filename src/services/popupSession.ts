/**
 * Pure helpers for the review popup (FocusReviewModal): which cards need an introduction,
 * the 4 options of a vocabulary question and the FSRS grade of an answer.
 */
import { Rating } from "ts-fsrs";
import type { ReviewCard, WordDetail } from "@/types/database";
import { cleanMeaningForOption, deriveRating, generateMultipleChoiceQuestion, isNewCard, type ExerciseType } from "./smartReview";

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

/** Vietnamese meaning -> pick the English word, with plausible distractors (same topic / part of speech). */
export function buildPopupChoices(target: WordDetail, allWords: WordDetail[]): PopupChoice[] {
  return generateMultipleChoiceQuestion(target, allWords, "vn_to_en").options.map((o) => ({
    id: o.id,
    word: o.text,
    isCorrect: o.isCorrect,
  }));
}

/**
 * Same grading as flashcard sessions: wrong -> Again, typo / synonym tried first -> Hard,
 * correct but very slow -> Hard, else Good. Never Easy.
 */
export function popupAnswerRating(
  correct: boolean,
  exerciseType: ExerciseType,
  responseTimeMs: number,
  nearMiss = false,
  confusedWithSynonym = false
): Rating {
  if (!correct) return Rating.Again;
  return deriveRating({ exerciseType, wrongAttempts: 0, nearMiss, confusedWithSynonym, responseTimeMs });
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
