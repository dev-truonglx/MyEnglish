/**
 * Pure helpers for the exercise components (review 2026-10-11: M5, M14, M15). No service imports, so
 * they can be tested on their own.
 */

/** A letter, combining mark or digit: next to a match it means the match is part of a longer word */
const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;

/** Lowercase NFC form, for comparing Vietnamese text */
function normalizeText(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Senses of a Vietnamese meaning: split at ";" and new lines, explanations in brackets dropped */
export function splitMeaningSenses(meaningVn: string): string[] {
  return (meaningVn || "")
    .split(/[;\n]/)
    .map((sense) => sense.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim())
    .filter((sense) => sense.length > 0);
}

/** Raw sense clauses of a Vietnamese meaning: split at ";" and new lines, trimmed, preserving parenthesized notes */
export function splitMeaningClauses(meaningVn: string): string[] {
  return (meaningVn || "")
    .split(/[;\n]/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/** Whether `needle` occurs in `haystack` as whole words (no letter or digit right before or after) */
function occursAsWords(haystack: string, needle: string): boolean {
  if (!needle) return false;
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
    const before = haystack.charAt(at - 1);
    const after = haystack.charAt(at + needle.length);
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
  }
  return false;
}

export interface ExampleSenseRef {
  sentence_vn?: string | null;
  sense_index?: number | null;
}

/**
 * The sense of a meaning that the example sentence uses (M5):
 * 1. By exact senseIndex if available (0-indexed).
 * 2. By whole-word search in sentence_vn / exampleVi.
 * 3. Fallback to the first sense.
 */
export function pickSenseForExample(
  meaningVn: string,
  exampleViOrExample?: string | ExampleSenseRef | null
): string {
  const senses = splitMeaningSenses(meaningVn);
  if (senses.length === 0) return "";
  if (senses.length === 1) return senses[0];

  let sentenceVi = "";
  let senseIndex: number | null | undefined = null;

  if (typeof exampleViOrExample === "string") {
    sentenceVi = exampleViOrExample;
  } else if (exampleViOrExample && typeof exampleViOrExample === "object") {
    sentenceVi = exampleViOrExample.sentence_vn || "";
    senseIndex = exampleViOrExample.sense_index;
  }

  if (typeof senseIndex === "number" && senseIndex >= 0) {
    const targetIdx = Math.min(senseIndex, senses.length - 1);
    return senses[targetIdx];
  }

  const sentence = normalizeText(sentenceVi || "");
  let best = senses[0] ?? "";
  let bestLength = 0;
  for (const sense of senses) {
    const key = normalizeText(sense);
    if (key.length > bestLength && occursAsWords(sentence, key)) {
      best = sense;
      bestLength = key.length;
    }
  }
  return best;
}

/**
 * The raw sense clause of a meaning that matches an example (preserving parenthesized notes for concise formatting).
 */
export function getExampleSenseMeaning(
  meaningVn: string,
  example?: ExampleSenseRef | null
): string {
  const clauses = splitMeaningClauses(meaningVn);
  if (clauses.length <= 1) return meaningVn || "";

  if (example && typeof example.sense_index === "number" && example.sense_index >= 0) {
    const targetIdx = Math.min(example.sense_index, clauses.length - 1);
    return clauses[targetIdx];
  }

  if (example?.sentence_vn) {
    const cleanSense = pickSenseForExample(meaningVn, example.sentence_vn);
    if (cleanSense) {
      const match = clauses.find((c) => c.toLowerCase().includes(cleanSense.toLowerCase()));
      if (match) return match;
    }
  }

  return clauses[0] ?? meaningVn;
}

/** Whether two meanings share a sense, so one would be a right answer to the other's word */
export function sharesSense(meaningA: string, meaningB: string): boolean {
  const senses = new Set(splitMeaningSenses(meaningA).map(normalizeText));
  return splitMeaningSenses(meaningB).some((sense) => senses.has(normalizeText(sense)));
}

/**
 * The meaning with every whole-word occurrence of the English `word` replaced by a blank (M14):
 * "email; gửi email" becomes "___; gửi ___", while "therefore" is left alone for "there".
 */
export function maskTargetInMeaning(meaning: string, word: string): string {
  const target = word.trim().normalize("NFC");
  if (!meaning || !target) return meaning;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return meaning
    .normalize("NFC")
    .replace(new RegExp(`(^|[^\\p{L}])${escaped}(?=$|[^\\p{L}])`, "giu"), "$1___");
}

/** IPA reduced to its letters: no slashes, brackets, stress marks or spaces, lowercase */
function ipaKey(ipa?: string | null): string {
  return (ipa || "").normalize("NFC").replace(/[\/\[\]ˈˌ\s]/g, "").toLowerCase();
}

/**
 * Whether two pronunciations are the same, so the words sound alike (right / write) and cannot be told
 * apart by ear (M15). A missing pronunciation never matches.
 */
export function samePronunciation(a?: string | null, b?: string | null): boolean {
  const x = ipaKey(a);
  return x.length > 0 && x === ipaKey(b);
}
