/**
 * "How much of a typical IT text do I recognise?" A beginner-friendly progress number: the share of word
 * tokens in a few sample texts (src/data/coverageCorpus.ts: README, bug report, standup, email, API docs,
 * code review) that are function words or the learner's own words already in long-term review.
 * Uses the reading-mode analyser, so inflected forms (deployed, wrote) count for their word.
 */
import type { WordDetail } from "@/types/database";
import type { CoverageText } from "@/data/coverageCorpus";
import { FUNCTION_WORDS } from "@/data/commonWords";
import { analyzeText } from "./reading";

export interface Coverage {
  /** 0–100 */
  percent: number;
  known: number;
  total: number;
}

/** A bank word counts once its recognition card has graduated to Review */
function isRecognised(word: WordDetail): boolean {
  return (word.srs?.state ?? 0) === 2;
}

export function computeCoverage(words: WordDetail[], texts: CoverageText[]): Coverage {
  let known = 0;
  let total = 0;
  for (const t of texts) {
    for (const seg of analyzeText(t.text, words, FUNCTION_WORDS).segments) {
      if (!seg.token) continue;
      total++;
      if (seg.token.kind === "common" || (seg.token.kind === "bank" && isRecognised(seg.token.word))) known++;
    }
  }
  return { percent: total > 0 ? Math.round((known * 100) / total) : 0, known, total };
}

export async function loadCoverage(words: WordDetail[]): Promise<Coverage> {
  const { COVERAGE_TEXTS } = await import("@/data/coverageCorpus");
  return computeCoverage(words, COVERAGE_TEXTS);
}
