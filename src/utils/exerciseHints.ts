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

/**
 * The sense of a meaning that the example sentence uses (M5): the one found in `exampleVi` with the
 * longest match. Without a match, or without a Vietnamese sentence, the first sense.
 */
export function pickSenseForExample(meaningVn: string, exampleVi: string): string {
  const senses = splitMeaningSenses(meaningVn);
  const sentence = normalizeText(exampleVi || "");
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
  const target = word.trim();
  if (!meaning || !target) return meaning;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return meaning.replace(new RegExp(`(^|[^a-z])${escaped}(?=$|[^a-z])`, "gi"), "$1___");
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
