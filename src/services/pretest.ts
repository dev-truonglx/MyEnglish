/**
 * "Đoán trước khi học" (pretesting): before a brand-new word is introduced, the learner sees it in a
 * sentence and guesses its meaning among 3 options. Guessing first, even wrongly, makes the meaning shown
 * right after better remembered than reading it cold (pretesting effect).
 *
 * The guess never touches the schedule: it is logged as a learning event only.
 */
import type { ReviewCard, WordDetail } from "@/types/database";
import { generateMultipleChoiceQuestion, pickExample } from "./smartReview";
import { needsIntro } from "./popupSession";
import { logLearningEvent } from "./learningEvents";
import { persistKeyNow } from "./storageBackup";
import { getUserOverrideLevel } from "./userProficiency";

const ENABLED_KEY = "myenglish_pretest_enabled_v1";

export interface PretestOption {
  text: string;
  isCorrect: boolean;
}

export interface PretestQuestion {
  word: string;
  /** The sentence the meaning is guessed from (contains the word) */
  sentence: string;
  options: PretestOption[];
}

export interface PretestResult {
  correct: boolean;
  /** The option picked; null = "Chưa đoán được" */
  chosen: string | null;
}

/**
 * The learner's own choice when they made one. Otherwise on from A2 up: a beginner (A1, or no level
 * chosen) can't read the English sentence yet, so the guess is blind and only feels like failing.
 */
export function isPretestEnabled(): boolean {
  try {
    const stored = localStorage.getItem(ENABLED_KEY);
    if (stored === "0" || stored === "1") return stored === "1";
  } catch {}
  const level = getUserOverrideLevel();
  return level !== null && level !== "A1";
}

export function setPretestEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
    persistKeyNow(ENABLED_KEY);
  } catch {}
}

/** Brand-new words only (not a leech being relearned: it was seen before, there is nothing to guess) */
export function shouldPretest(card: ReviewCard): boolean {
  return isPretestEnabled() && needsIntro(card) && (card.srs.reps ?? 0) === 0;
}

/**
 * The guess question: a sentence containing the word, its meaning and 2 plausible other meanings.
 * null when the word has no usable sentence (the guess would be blind) or not enough other meanings.
 */
export function buildPretest(word: WordDetail, pool: WordDetail[], random: () => number = Math.random): PretestQuestion | null {
  const example = pickExample(word, 0);
  if (!example) return null;
  const mc = generateMultipleChoiceQuestion(word, pool, "en_to_vn");
  const correct = mc.options.find((o) => o.isCorrect);
  const others = mc.options.filter((o) => !o.isCorrect).slice(0, 2);
  if (!correct || others.length < 2) return null;
  const options = [correct, ...others]
    .map((o) => ({ text: o.text, isCorrect: o.isCorrect, k: random() }))
    .sort((a, b) => a.k - b.k)
    .map(({ text, isCorrect }) => ({ text, isCorrect }));
  return { word: word.word, sentence: example.sentence_en, options };
}

export function recordPretest(word: WordDetail, result: PretestResult, surface: "flashcard" | "popup"): void {
  logLearningEvent("pretest", { wordId: word.id, direction: "recognition", meta: { correct: result.correct, surface } });
}
