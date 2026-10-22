/**
 * How alike two words sound, from their IPA. Used by the listening exercise: the wrong options are the deck
 * words that sound most like the word heard (ship -> sheep, chip, shop), so the learner has to hear the
 * difference instead of ruling options out by meaning or topic.
 */

/** Sounds written with more than one character, longest first so "tʃ" is read before "t" */
const MULTI_CHAR = [
  "aɪə", "aʊə",
  "tʃ", "dʒ", "aɪ", "aʊ", "ɔɪ", "eɪ", "əʊ", "oʊ", "ɪə", "eə", "ʊə",
  "iː", "uː", "ɑː", "ɔː", "ɜː",
];

const VOWELS = new Set([
  "i", "ɪ", "e", "æ", "ɑ", "ɒ", "ɔ", "ʊ", "u", "ʌ", "ə", "ɜ", "a", "o", "ɝ", "ɚ",
  "iː", "uː", "ɑː", "ɔː", "ɜː",
  "aɪ", "aʊ", "ɔɪ", "eɪ", "əʊ", "oʊ", "ɪə", "eə", "ʊə", "aɪə", "aʊə",
]);

/**
 * Pairs of sounds a Vietnamese learner easily hears as one another (long / short vowels, voiced / voiceless
 * consonants, th / s / t, final l / n ...): swapping one costs less than swapping two unrelated sounds.
 */
const NEAR_PAIRS: Array<[string, string]> = [
  ["i", "ɪ"], ["iː", "ɪ"], ["iː", "i"], ["e", "æ"], ["æ", "ʌ"], ["ʌ", "ɑː"], ["ʌ", "ɑ"], ["ɑ", "ɑː"],
  ["ɒ", "ɔː"], ["ɑ", "ɔː"], ["ɒ", "ɑ"], ["ʊ", "uː"], ["u", "uː"], ["ə", "ʌ"], ["ə", "ɪ"], ["ɜː", "ɝ"], ["ɚ", "ə"],
  ["eɪ", "e"], ["əʊ", "oʊ"], ["əʊ", "ɔː"], ["oʊ", "ɔː"], ["aɪ", "eɪ"], ["eə", "e"], ["ɪə", "iː"],
  ["p", "b"], ["t", "d"], ["k", "ɡ"], ["f", "v"], ["s", "z"], ["ʃ", "ʒ"], ["tʃ", "dʒ"], ["θ", "ð"], ["θ", "t"],
  ["θ", "s"], ["ð", "d"], ["ð", "z"], ["s", "ʃ"], ["tʃ", "ʃ"], ["dʒ", "ʒ"], ["m", "n"], ["n", "ŋ"], ["l", "r"],
  ["w", "v"], ["l", "n"], ["j", "dʒ"],
];
const NEAR = new Map<string, Set<string>>();
for (const [a, b] of NEAR_PAIRS) {
  NEAR.set(a, (NEAR.get(a) ?? new Set()).add(b));
  NEAR.set(b, (NEAR.get(b) ?? new Set()).add(a));
}

const NEAR_COST = 0.4;
/** The most the shared first / last sound, syllable count and stress take off a distance */
const MAX_BONUS = 0.2;
/** A vowel in place of a consonant (or the reverse) changes the word's shape more than any other swap */
const CLASS_CHANGE_COST = 1.6;

export interface Phonemes {
  /** One entry per sound: "tʃ", "iː" and "aɪ" are one sound each */
  units: string[];
  vowels: number;
  /** Which vowel (0-based) carries the main stress; -1 when not marked */
  stress: number;
}

const phonemeCache = new Map<string, Phonemes>();

/** Forget the sounds read so far (about 1.6 MB for the whole deck), when the deck is released */
export function clearPhonemeCache(): void {
  phonemeCache.clear();
}

/**
 * The sounds of an IPA transcription: "/ˈtʃiːp/" -> tʃ, iː, p. Slashes, brackets, syllable dots and
 * optional-sound brackets are dropped (the sound inside is kept).
 */
export function ipaPhonemes(ipa: string | null | undefined): Phonemes {
  const key = ipa || "";
  const cached = phonemeCache.get(key);
  if (cached) return cached;
  const text = key
    .normalize("NFC")
    .replace(/g/g, "ɡ")
    .replace(/[/[\]().‿ˌ\s̩͡]/g, "");
  const units: string[] = [];
  let vowels = 0;
  let stress = -1;
  let stressNext = false;
  for (let i = 0; i < text.length; ) {
    if (text[i] === "ˈ") {
      stressNext = true;
      i++;
      continue;
    }
    const unit = MULTI_CHAR.find((m) => text.startsWith(m, i)) ?? text[i];
    i += unit.length;
    if (unit === "ː") continue;
    units.push(unit);
    if (VOWELS.has(unit)) {
      if (stressNext) stress = vowels;
      stressNext = false;
      vowels++;
    }
  }
  const out = { units, vowels, stress };
  phonemeCache.set(key, out);
  return out;
}

function substitutionCost(a: string, b: string): number {
  if (a === b) return 0;
  if (NEAR.get(a)?.has(b)) return NEAR_COST;
  return VOWELS.has(a) === VOWELS.has(b) ? 1 : CLASS_CHANGE_COST;
}

let rowA = new Float64Array(32);
let rowB = new Float64Array(32);

/** Edit distance between two sound sequences, where hard-to-hear swaps cost less (NEAR_PAIRS) */
export function phonemeEditDistance(a: readonly string[], b: readonly string[]): number {
  // Two rows reused across calls: a whole deck is compared at once
  if (rowA.length <= b.length) {
    rowA = new Float64Array(b.length + 16);
    rowB = new Float64Array(b.length + 16);
  }
  let prev = rowA;
  let row = rowB;
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + substitutionCost(a[i - 1], b[j - 1]));
    }
    [prev, row] = [row, prev];
  }
  return prev[b.length];
}

/**
 * How different two pronunciations sound: 0 for (nearly) the same, around 0.3 for words easily misheard as
 * one another (ship / shop, think / thank), above 0.6 for words that do not sound alike. The edit distance is
 * divided by the longer word's length so long and short words compare fairly, and the parts the ear holds on
 * to most count extra: the first and last sound, the number of syllables and where the stress falls.
 * Pairs that cannot come under `limit` (their lengths alone differ too much) return Infinity without the
 * edit distance, so ranking a whole deck stays cheap.
 */
export function soundDistance(a: Phonemes, b: Phonemes, limit = Infinity): number {
  if (a.units.length === 0 || b.units.length === 0) return Infinity;
  const longer = Math.max(a.units.length, b.units.length);
  // Every extra sound costs at least 1, and the bonuses below take off at most MAX_BONUS
  if (Math.abs(a.units.length - b.units.length) / longer - MAX_BONUS > limit) return Infinity;
  let score = phonemeEditDistance(a.units, b.units) / longer;
  if (a.units[0] === b.units[0]) score -= 0.08;
  if (a.units[a.units.length - 1] === b.units[b.units.length - 1]) score -= 0.05;
  if (a.vowels === b.vowels) score -= 0.04;
  if (a.vowels > 1 && a.stress >= 0 && a.stress === b.stress) score -= 0.03;
  return Math.max(0, score);
}
