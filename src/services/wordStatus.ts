/**
 * One definition of "how well does the learner know this word", used by every screen that counts words
 * (sidebar, word library filter, word detail). Two tiers, judged on the recognition card (EN -> VN):
 *  - "Đang học" (learning): the word has been met (at least one answer or a schedule) but is not
 *    remembered for the long run yet
 *  - "Nhớ lâu" (remembered long): the recognition card is in Review with a stability of at least
 *    MASTERED_STABILITY_DAYS (21 days)
 * A word marked "Đã biết" (isKnownOnly) starts with a stability above that (knownSchedule), so it is "Nhớ lâu"
 * from the mark on: the learner knows it well. Its one check months later keeps it there or, if missed,
 * sends it back to learning like any lapse.
 */
import type { SRSReview } from "@/types/database";
import { isKnownOnly } from "./smartReview";
import { MASTERED_STABILITY_DAYS } from "./progress";

/** What the status functions read: a word, or a review card (whose `srs` may be the production card) */
export interface StatusWord {
  srs?: Partial<SRSReview> | null;
  srsRecognition?: Partial<SRSReview> | null;
}

export type WordStatus = "new" | "known_only" | "learning" | "remembered_long";

/** Learner-facing labels, the same on every screen */
export const WORD_STATUS_LABELS: Record<WordStatus, string> = {
  new: "Từ mới",
  known_only: "Nhớ lâu · Đã biết",
  learning: "Đang học",
  remembered_long: "Nhớ lâu",
};

function recognitionSrs(w: StatusWord): Partial<SRSReview> | null {
  return w.srsRecognition ?? w.srs ?? null;
}

/** The learner has met the word: answered it at least once, or it has a schedule */
function hasBeenMet(srs: Partial<SRSReview>): boolean {
  return (srs.reps ?? 0) > 0 || (srs.state ?? 0) > 0 || Boolean(srs.last_review);
}

/** Remembered for the long run: recognition card in Review, stability >= 21 days (words marked "Đã biết" included) */
export function isRememberedLong(w: StatusWord): boolean {
  const srs = recognitionSrs(w);
  if (!srs) return false;
  return srs.state === 2 && (srs.stability ?? 0) >= MASTERED_STABILITY_DAYS;
}

/** Being learnt: met at least once, not remembered for the long run yet (words marked "Đã biết" are not) */
export function isLearning(w: StatusWord): boolean {
  const srs = recognitionSrs(w);
  if (!srs || isKnownOnly(srs) || !hasBeenMet(srs)) return false;
  return !isRememberedLong(w);
}

export function wordStatus(w: StatusWord): WordStatus {
  const srs = recognitionSrs(w);
  if (!srs || !hasBeenMet(srs)) return "new";
  // Counted as "Nhớ lâu", shown as marked: it has not been asked yet
  if (isKnownOnly(srs)) return "known_only";
  return isRememberedLong(w) ? "remembered_long" : "learning";
}

export interface WordStatusCounts {
  learning: number;
  rememberedLong: number;
}

export function countWordStatus(words: readonly StatusWord[]): WordStatusCounts {
  let learning = 0;
  let rememberedLong = 0;
  for (const w of words) {
    if (isRememberedLong(w)) rememberedLong++;
    else if (isLearning(w)) learning++;
  }
  return { learning, rememberedLong };
}
