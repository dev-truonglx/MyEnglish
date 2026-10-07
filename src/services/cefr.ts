/**
 * CEFR helpers shared by AI parsing, filtering and the proficiency assessment.
 */
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** Parse "b1", "B1+", "Level B1" ... into a CEFR level, or null when unknown. */
export function normalizeCefr(value: unknown): CefrLevel | null {
  if (typeof value !== "string") return null;
  const match = value.toUpperCase().match(/\b([ABC][12])\b/);
  return match ? (match[1] as CefrLevel) : null;
}

export function cefrRank(level: CefrLevel): number {
  return CEFR_LEVELS.indexOf(level);
}

/** True when `wordLevel` is at or below the learner's level (unknown levels can't be checked: true). */
export function isWithinLevel(wordLevel: CefrLevel | null | undefined, learnerLevel: string): boolean {
  const target = normalizeCefr(learnerLevel);
  if (!wordLevel || !target) return true;
  return cefrRank(wordLevel) <= cefrRank(target);
}

/** Exactly one CEFR level above the learner (the "i+1" stretch zone). */
export function isOneLevelAbove(wordLevel: CefrLevel | null | undefined, learnerLevel: string): boolean {
  const target = normalizeCefr(learnerLevel);
  if (!wordLevel || !target) return false;
  return cefrRank(wordLevel) === cefrRank(target) + 1;
}
