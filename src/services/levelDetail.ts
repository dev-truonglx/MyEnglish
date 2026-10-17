import type { WordDetail } from "@/types/database";
import type { GrammarLevel } from "@/types/grammar";
import { normalizeCefr } from "./cefr";
import { isPlaceholderMeaning } from "./db";
import { librarySchedule } from "./librarySchedule";
import { hasRealReview } from "./progress";
import { isKnownOnly, isWordKnown } from "./smartReview";

/** Stability (days) from which a word counts as remembered for the long run, as on the rest of the progress screen */
const LONG_TERM_DAYS = 21;

export interface LevelWord {
  id: string;
  word: string;
  meaning: string;
  /** Days of stability: how long it stays remembered */
  stability: number;
  lapses: number;
}

/** One CEFR level of the learner's words, for the detail under the level cards */
export interface LevelDetail {
  level: GrammarLevel;
  /** Words of the level among the learner's words (met or waiting to be introduced) */
  inLibrary: number;
  /** Studied at least once */
  met: number;
  /** Counted as known for the level (the same rule as the level card: recognised for at least 7 days) */
  known: number;
  /** Remembered for at least LONG_TERM_DAYS */
  longTerm: number;
  /** Met but not known yet */
  learning: number;
  /** Marked "Đã biết" and still waiting for their one check */
  markedKnown: number;
  /** Due now in a review session */
  due: number;
  /** Not known yet, closest to it first (highest stability) */
  almostKnown: LevelWord[];
  /** Forgotten twice or more, most forgotten first */
  oftenForgotten: LevelWord[];
}

const toLevelWord = (w: WordDetail): LevelWord => ({
  id: w.id,
  word: w.word,
  meaning: w.meaning_vn,
  stability: Math.round((w.srs?.stability ?? 0) * 10) / 10,
  lapses: w.srs?.lapses ?? 0,
});

/** The level a word counts toward (C2 counts toward C1, the highest level the app teaches) */
function levelOf(w: WordDetail): GrammarLevel | null {
  const lvl = normalizeCefr(w.cefr_level);
  if (!lvl) return null;
  return lvl === "C2" ? "C1" : (lvl as GrammarLevel);
}

export function levelDetail(words: WordDetail[], level: GrammarLevel, now: Date = new Date(), listSize = 12): LevelDetail {
  const ofLevel = words.filter((w) => levelOf(w) === level);
  const met = ofLevel.filter((w) => (w.srs?.reps ?? 0) > 0 || (w.srs?.state ?? 0) > 0);
  // Same words the level card counts: studied with a real review, with a real meaning
  const studied = met.filter((w) => (w.srs?.reps ?? 0) > 0 && hasRealReview(w) && !isPlaceholderMeaning(w.meaning_vn));
  const known = studied.filter(isWordKnown);
  const knownIds = new Set(known.map((w) => w.id));
  const markedKnown = met.filter((w) => isKnownOnly(w.srs));
  const learning = met.filter((w) => !knownIds.has(w.id) && !isKnownOnly(w.srs));

  return {
    level,
    inLibrary: ofLevel.length,
    met: met.length,
    known: known.length,
    longTerm: known.filter((w) => (w.srs?.stability ?? 0) >= LONG_TERM_DAYS).length,
    learning: learning.length,
    markedKnown: markedKnown.length,
    due: met.filter((w) => librarySchedule(w, now).isDue).length,
    almostKnown: [...learning]
      .sort((a, b) => (b.srs?.stability ?? 0) - (a.srs?.stability ?? 0) || a.word.localeCompare(b.word))
      .slice(0, listSize)
      .map(toLevelWord),
    oftenForgotten: met
      .filter((w) => (w.srs?.lapses ?? 0) >= 2)
      .sort((a, b) => (b.srs?.lapses ?? 0) - (a.srs?.lapses ?? 0) || a.word.localeCompare(b.word))
      .slice(0, listSize)
      .map(toLevelWord),
  };
}
