import type { GrammarBookItem, GrammarExerciseSetType } from "@/types/grammarBook";
import { normalizeTypedText } from "./smartReview";
import { bookItemKey, countBlanks, getUserAcceptedAnswers, hasUnreadableAnswers, matchesAny } from "./grammarBook";
import { persistKeyNow } from "./storageBackup";

/**
 * One book item can be practised in several formats. The format a learner gets follows a ladder per item:
 * recognise first (choose, arrange), then spot the mistake, then produce it (type). See formatForLevel.
 */
export type GrammarFormat =
  | "choice" // pick the right form (or the right pair of forms) for the blank(s)
  | "pick_sentence" // pick the correctly rewritten sentence
  | "order" // arrange word tiles: the answer phrase into the blank, or the whole sentence
  | "translate" // arrange word tiles into the English sentence from its Vietnamese translation
  | "error" // tap the wrong part of a sentence
  | "type" // type the blank(s) or the whole sentence
  | "self"; // no reliable key: compare with the book's answer and mark it yourself

export const FORMAT_LABELS: Record<GrammarFormat, string> = {
  choice: "Trắc nghiệm",
  pick_sentence: "Chọn câu đúng",
  order: "Ghép từ",
  translate: "Dịch câu",
  error: "Tìm lỗi sai",
  type: "Tự viết",
  self: "Tự chấm",
};

export interface GrammarTask {
  format: GrammarFormat;
  item: GrammarBookItem;
  itemKey: string;
  setType: GrammarExerciseSetType;
  /** Prompt with "___" blanks (cues such as "(sleep)" kept); the Vietnamese sentence for "translate" */
  prompt: string;
  given?: string;
  underline?: string;
  /** Blanks to fill; 0 = the answer is a whole sentence */
  blanks: number;
  /** Accepted answers per blank, or [[sentences]] when blanks = 0 */
  answers: string[][];
  /** The complete correct sentence */
  full: string;
  options?: string[];
  correctOption?: number;
  /** Shuffled tiles and the order that is correct */
  tiles?: string[];
  tilesTarget?: string[];
  /** Tiles fill the blank (answer phrase) instead of building the whole sentence */
  tilesIntoBlank?: boolean;
  /** Error spotting: the sentence split into tokens, the wrong span and its correction */
  errorTokens?: string[];
  errorSpan?: [number, number];
  errorFix?: string;
  vi?: string;
  explain?: string;
  /** From the item's exercise set (copied from its session entry): the instruction in Vietnamese */
  instruction?: string;
  /** Words to choose from ("điền từ trong khung") */
  wordBank?: string[];
  /** The text the questions are about ("dựa vào đoạn văn") */
  passage?: string;
}

export type TaskResponse =
  | { kind: "typed"; values: string[] }
  | { kind: "option"; index: number }
  | { kind: "tiles"; tiles: string[] }
  | { kind: "token"; index: number }
  | { kind: "self"; correct: boolean };

export interface TaskCheck {
  correct: boolean;
  /** What the learner answered, as text */
  given: string;
  /** The expected answer, as text */
  expected: string;
}

export const getItemKey = bookItemKey;

const SENTENCE_SETS = new Set<GrammarExerciseSetType>(["rewrite", "combine", "question", "complete", "correct", "identify", "translate", "write"]);
/** Long sentences make tile puzzles about word order rather than grammar */
const MAX_SENTENCE_TILES = 16;

/** Replace each blank (and the cues right after it, e.g. "(sleep)" or "(be) (1)") with the given parts */
export function fillBlanks(prompt: string, parts: string[]): string {
  let i = 0;
  const filled = prompt.replace(/_{3,}(?:\s*\([^)]*\))*/g, () => parts[i++] ?? "___");
  return tidySentence(filled);
}

function tidySentence(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

/** The complete correct sentence, built from the prompt and the first answers when the item has blanks */
export function fullSentence(item: GrammarBookItem): string {
  const blanks = countBlanks(item.prompt);
  if (blanks > 0 && item.answers?.length === blanks && item.answers.every((a) => a.length > 0)) {
    return fillBlanks(item.prompt, item.answers.map((a) => a[0]));
  }
  return tidySentence(item.answerSentence || item.answers?.[0]?.[0] || "");
}

/** Accepted answers per blank: the book's, plus those the learner accepted with "Tính là đúng" */
export function acceptedAnswers(item: GrammarBookItem): string[][] {
  const key = bookItemKey(item);
  const blanks = countBlanks(item.prompt);
  if (blanks === 0) {
    const sentences = [...(item.answers?.[0] ?? []), item.answerSentence].filter((s): s is string => !!s && !!s.trim());
    return [[...new Set([...sentences, ...getUserAcceptedAnswers(key, 0)])]];
  }
  return Array.from({ length: blanks }, (_, i) => [...new Set([...(item.answers?.[i] ?? []), ...getUserAcceptedAnswers(key, i)])]);
}

// The matcher lives next to the book (the import check uses it too)
export { matchesAny };

/** Wrong options for blank i: the AI's distractors minus anything that is in fact accepted, deduplicated */
export function cleanDistractors(item: GrammarBookItem, blankIndex: number): string[] {
  const accepted = acceptedAnswers(item)[blankIndex] ?? [];
  const out: string[] = [];
  for (const d of item.ai?.distractors?.[blankIndex] ?? []) {
    const v = String(d ?? "").trim();
    if (!v || matchesAny(v, accepted) || out.some((o) => normalizeTypedText(o) === normalizeTypedText(v))) continue;
    out.push(v);
  }
  return out;
}

function cleanWrongSentences(item: GrammarBookItem, full: string = fullSentence(item)): string[] {
  const accepted = acceptedAnswers(item)[0] ?? [];
  const checkAgainst = full ? [full, ...accepted] : accepted;
  const out: string[] = [];
  for (const s of item.ai?.wrongSentences ?? []) {
    const v = String(s ?? "").trim();
    if (!v || matchesAny(v, checkAgainst) || out.some((o) => normalizeTypedText(o) === normalizeTypedText(v))) continue;
    out.push(v);
  }
  return out;
}

export function tokenize(sentence: string): string[] {
  return sentence.trim().split(/\s+/).filter(Boolean);
}

function shuffle<T>(arr: T[], random: () => number = Math.random): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Shuffle tiles so they never come out already in the right order */
function shuffleTiles(target: string[], random: () => number = Math.random): string[] {
  if (target.length < 2) return [...target];
  for (let attempt = 0; attempt < 5; attempt++) {
    const s = shuffle(target, random);
    if (s.join(" ") !== target.join(" ")) return s;
  }
  return [...target.slice(1), target[0]];
}

/** Letters only Vietnamese uses (not "é" or "à", which English borrows: café, à la carte) */
const VIETNAMESE_LETTERS = /[ạảấầẩẫậăắằẳẵặẹẻẽếềểễệỉịĩọỏốồổỗộơớờởỡợụủũưứừửữựỳỵỷỹđ]/i;

/** A "translate" item whose answer is Vietnamese: many wordings are right, so the learner marks it */
function hasVietnameseAnswer(item: GrammarBookItem): boolean {
  const answers = [item.answerSentence, ...(item.answers ?? []).flat()].filter((a): a is string => typeof a === "string");
  return answers.some((a) => VIETNAMESE_LETTERS.test(a));
}

/** Items with no trustworthy key are marked by the learner; open "complete the sentence" sets and translations into Vietnamese too */
export function isSelfGraded(item: GrammarBookItem, setType: GrammarExerciseSetType): boolean {
  if (item.selfGrade || item.noKey) return true;
  // An answer cut off ("...") or written with a "/" that was not split could never be typed: never auto-graded
  if (hasUnreadableAnswers(item)) return true;
  if (setType === "complete" || setType === "identify") return true;
  if (setType === "translate" && hasVietnameseAnswer(item)) return true;
  const blanks = countBlanks(item.prompt);
  if (blanks === 0) return acceptedAnswers(item)[0].length === 0;
  return item.answers.length !== blanks || item.answers.some((a) => a.length === 0);
}

/** The item's own options that are wrong (an option list where every option is accepted cannot be a quiz) */
function wrongOptions(item: GrammarBookItem): string[] {
  if (countBlanks(item.prompt) !== 1) return [];
  const accepted = acceptedAnswers(item)[0] ?? [];
  return [...new Set((item.options ?? []).map((o) => String(o).trim()).filter((o) => o && !matchesAny(o, accepted)))];
}

function hasOwnOptions(item: GrammarBookItem): boolean {
  return wrongOptions(item).length > 0 && (item.options ?? []).some((o) => matchesAny(String(o), acceptedAnswers(item)[0] ?? []));
}

/** The format of the book's own exercise: choose for "choose" sets, typing otherwise */
export function nativeFormat(item: GrammarBookItem, setType: GrammarExerciseSetType): GrammarFormat {
  if (isSelfGraded(item, setType)) return "self";
  if (setType === "choose" && hasOwnOptions(item)) return "choice";
  return "type";
}

/** Formats this item can be shown in */
export function availableFormats(item: GrammarBookItem, setType: GrammarExerciseSetType): GrammarFormat[] {
  if (isSelfGraded(item, setType)) return ["self"];
  const blanks = countBlanks(item.prompt);
  const formats: GrammarFormat[] = [];
  const full = fullSentence(item);
  const sentenceTiles = tokenize(full).length;
  if (blanks > 0) {
    const hasOptions = hasOwnOptions(item);
    const everyBlankHasDistractor = Array.from({ length: blanks }, (_, i) => cleanDistractors(item, i).length > 0).every(Boolean);
    if (hasOptions || everyBlankHasDistractor) formats.push("choice");
    if (blanks === 1 && tokenize(item.answers[0][0]).length >= 2) formats.push("order");
    if (everyBlankHasDistractor || hasOptions) formats.push("error");
    if (item.ai?.vi && sentenceTiles <= MAX_SENTENCE_TILES) formats.push("translate");
    // A "choose" item is typed only when its options cannot make a fair quiz
    if (setType !== "choose" || !hasOptions) formats.push("type");
  } else {
    if (cleanWrongSentences(item, full).length > 0) formats.push("pick_sentence");
    if (sentenceTiles >= 3 && sentenceTiles <= MAX_SENTENCE_TILES + 4) formats.push("order");
    if (item.ai?.vi && sentenceTiles <= MAX_SENTENCE_TILES) formats.push("translate");
    formats.push("type");
  }
  if (formats.length === 0) formats.push("type");
  return formats;
}

/** Ladder level → preferred formats, easiest first. Level 0 recognise, 1 spot/arrange, 2 produce. */
const LADDER: GrammarFormat[][] = [
  ["choice", "pick_sentence", "order"],
  ["error", "translate", "order", "choice"],
  ["type"],
];

export function formatForLevel(
  item: GrammarBookItem,
  setType: GrammarExerciseSetType,
  level: number,
  available: GrammarFormat[] = availableFormats(item, setType)
): GrammarFormat {
  if (available[0] === "self") return "self";
  const wanted = LADDER[Math.max(0, Math.min(2, level))];
  return wanted.find((f) => available.includes(f)) ?? (level >= 2 ? nativeFormat(item, setType) : available[0]);
}

const COMBO_SEPARATOR = " … ";

/** Build a task in the given format (falls back to the native format when that one is impossible) */
export function buildTask(
  item: GrammarBookItem,
  setType: GrammarExerciseSetType,
  format: GrammarFormat,
  random: () => number = Math.random
): GrammarTask {
  const available = availableFormats(item, setType);
  const fmt = available.includes(format) ? format : available.includes(nativeFormat(item, setType)) ? nativeFormat(item, setType) : available[0];
  const blanks = countBlanks(item.prompt);
  const answers = acceptedAnswers(item);
  const full = fullSentence(item);
  const base: GrammarTask = {
    format: fmt,
    item,
    itemKey: bookItemKey(item),
    setType,
    prompt: item.prompt,
    given: item.given || undefined,
    underline: item.underline || undefined,
    blanks,
    answers,
    full,
    vi: item.ai?.vi || undefined,
    explain: item.ai?.explainVn || undefined,
  };

  if (fmt === "choice") {
    if (hasOwnOptions(item)) {
      // One right option (the first accepted one in the list) and the wrong ones
      const right = item.options!.map((o) => String(o).trim()).find((o) => matchesAny(o, answers[0]))!;
      const options = shuffle([right, ...wrongOptions(item)], random);
      return { ...base, options, correctOption: options.indexOf(right) };
    }
    // One option per combination of forms; build up to 3 distinct wrong combinations across pools
    const correct = item.answers.map((a) => a[0]);
    const wrong: string[][] = [];
    const pools = Array.from({ length: blanks }, (_, i) => cleanDistractors(item, i));
    const addCombo = (combo: string[]) => {
      if (wrong.length >= 3) return;
      if (combo.join("|") === correct.join("|")) return;
      if (!wrong.some((w) => w.join("|") === combo.join("|"))) wrong.push(combo);
    };
    const maxPoolLen = Math.max(0, ...pools.map((p) => p.length));
    for (let depth = 0; depth < maxPoolLen && wrong.length < 3; depth++) {
      for (let b = 0; b < blanks && wrong.length < 3; b++) {
        const d = pools[b][depth];
        if (!d) continue;
        const combo = [...correct];
        combo[b] = d;
        addCombo(combo);
      }
    }
    // If single-blank substitutions yielded fewer than 3 wrong options (e.g. 2 blanks with 1 distractor each),
    // combine distractors across multiple blanks
    if (wrong.length < 3 && blanks >= 2) {
      for (let b1 = 0; b1 < blanks && wrong.length < 3; b1++) {
        for (let b2 = b1 + 1; b2 < blanks && wrong.length < 3; b2++) {
          for (const d1 of pools[b1]) {
            for (const d2 of pools[b2]) {
              const combo = [...correct];
              combo[b1] = d1;
              combo[b2] = d2;
              addCombo(combo);
            }
          }
        }
      }
    }
    const options = shuffle([correct, ...wrong].map((c) => c.join(COMBO_SEPARATOR)), random);
    return { ...base, options, correctOption: options.indexOf(correct.join(COMBO_SEPARATOR)) };
  }

  if (fmt === "pick_sentence") {
    const options = shuffle([full, ...cleanWrongSentences(item, full).slice(0, 3)], random);
    return { ...base, options, correctOption: options.indexOf(full) };
  }

  if (fmt === "order" && blanks === 1) {
    const target = tokenize(item.answers[0][0]);
    const extra = cleanDistractors(item, 0)
      .flatMap(tokenize)
      .filter((t) => !target.some((x) => x.toLowerCase() === t.toLowerCase()));
    const tiles = shuffleTiles([...target, ...[...new Set(extra)].slice(0, 2)], random);
    return { ...base, tiles, tilesTarget: target, tilesIntoBlank: true };
  }

  if (fmt === "order" || fmt === "translate") {
    const target = tokenize(full);
    return {
      ...base,
      prompt: fmt === "translate" ? item.ai?.vi || item.prompt : item.prompt,
      tiles: shuffleTiles(target, random),
      tilesTarget: target,
    };
  }

  if (fmt === "error") {
    // Put a wrong form into one blank; the learner taps it
    const blankIdx = Math.floor(random() * blanks);
    const wrongForm = cleanDistractors(item, blankIdx)[0] ?? wrongOptions(item)[0] ?? "";
    const parts = item.answers.map((a) => a[0]);
    // A marker on the wrong form finds its tokens after punctuation has been tidied
    const MARK = "\u0001";
    const marked = tokenize(fillBlanks(item.prompt, parts.map((p, i) => (i === blankIdx ? `${MARK}${wrongForm}` : p))));
    const start = Math.max(0, marked.findIndex((t) => t.includes(MARK)));
    const tokens = marked.map((t) => t.replace(MARK, ""));
    const len = Math.max(1, tokenize(wrongForm).length);
    return {
      ...base,
      errorTokens: tokens,
      errorSpan: [start, Math.min(tokens.length - 1, start + len - 1)],
      errorFix: parts[blankIdx],
    };
  }

  return base;
}

/** Strip the trailing punctuation that sticks to a tile, for comparing arranged tiles */
function joinTiles(tiles: string[]): string {
  return tidySentence(tiles.join(" "));
}

const MAX_SENTENCE_VARIANTS = 64;

/** Every complete sentence the accepted answers make: the sentences themselves, or the prompt filled with each combination */
export function acceptedSentences(task: GrammarTask): string[] {
  if (task.blanks === 0) return [...new Set([task.full, ...(task.answers[0] ?? [])])];
  let combos: string[][] = [[]];
  for (const accepted of task.answers) {
    const options = accepted.length > 0 ? accepted : [""];
    const next: string[][] = [];
    for (const combo of combos) {
      for (const a of options) {
        if (next.length >= MAX_SENTENCE_VARIANTS) break;
        next.push([...combo, a]);
      }
    }
    combos = next;
  }
  return [...new Set([task.full, ...combos.map((c) => fillBlanks(task.item.prompt, c))])];
}

export function checkTask(task: GrammarTask, response: TaskResponse): TaskCheck {
  const expectedText = task.blanks > 0 ? task.answers.map((a) => a[0] ?? "").join(COMBO_SEPARATOR) : task.full;
  switch (response.kind) {
    case "option": {
      const given = task.options?.[response.index] ?? "";
      const expected = task.options?.[task.correctOption ?? -1] ?? expectedText;
      return { correct: response.index === task.correctOption, given, expected };
    }
    case "tiles": {
      const given = joinTiles(response.tiles);
      if (task.tilesIntoBlank) return { correct: matchesAny(given, task.answers[0]), given, expected: task.answers[0][0] };
      // Any complete accepted answer counts, in whatever order it puts the words
      return { correct: matchesAny(given, acceptedSentences(task)), given, expected: task.full };
    }
    case "token": {
      const [a, b] = task.errorSpan ?? [-1, -1];
      const given = task.errorTokens?.[response.index] ?? "";
      return { correct: response.index >= a && response.index <= b, given, expected: task.errorTokens?.slice(a, b + 1).join(" ") ?? "" };
    }
    case "self":
      return { correct: response.correct, given: response.correct ? "Đúng" : "Sai", expected: task.full };
    case "typed": {
      if (task.blanks === 0) {
        const given = (response.values[0] ?? "").trim();
        return { correct: matchesAny(given, task.answers[0]), given, expected: task.full };
      }
      const given = response.values.map((v) => (v ?? "").trim()).join(COMBO_SEPARATOR);
      const correct = task.answers.every((accepted, i) => matchesAny(response.values[i] ?? "", accepted));
      return { correct, given, expected: expectedText };
    }
  }
}

/** Indexes of the blanks the learner got wrong (typed answers), to accept them one by one */
export function wrongBlanks(task: GrammarTask, values: string[]): number[] {
  if (task.blanks === 0) return matchesAny(values[0] ?? "", task.answers[0]) ? [] : [0];
  return task.answers.map((accepted, i) => (matchesAny(values[i] ?? "", accepted) ? -1 : i)).filter((i) => i >= 0);
}

// ---------------------------------------------------------------------------------------------------------
// Ladder level per item

const ITEM_LEVELS_KEY = "myenglish_grammar_item_levels_v1";

let levelsCache: { raw: string; map: Record<string, number> } | null = null;

/** Parsed again only when the stored text changed (any window): the returned map is shared, never change it */
export function readItemLevels(): Record<string, number> {
  try {
    const raw = localStorage.getItem(ITEM_LEVELS_KEY);
    if (!raw) return {};
    if (levelsCache?.raw !== raw) levelsCache = { raw, map: JSON.parse(raw) || {} };
    return levelsCache.map;
  } catch {
    return {};
  }
}

export function getItemReviewLevel(itemKey: string, levels: Record<string, number> = readItemLevels()): number {
  const v = levels[itemKey];
  return typeof v === "number" ? v : 0;
}

/** Correct (without a hint) moves the item one format up the ladder, a miss one down */
export function updateItemReviewLevel(itemKey: string, isCorrect: boolean): number {
  const map = { ...readItemLevels() };
  const next = isCorrect ? Math.min(2, (map[itemKey] ?? 0) + 1) : Math.max(0, (map[itemKey] ?? 0) - 1);
  map[itemKey] = next;
  try {
    localStorage.setItem(ITEM_LEVELS_KEY, JSON.stringify(map));
    persistKeyNow(ITEM_LEVELS_KEY);
  } catch {}
  return next;
}

/** The task for an item at its current ladder level */
export function ladderTask(item: GrammarBookItem, setType: GrammarExerciseSetType, random: () => number = Math.random): GrammarTask {
  return buildTask(item, setType, formatForLevel(item, setType, getItemReviewLevel(bookItemKey(item))), random);
}

export function isSentenceSet(setType: GrammarExerciseSetType): boolean {
  return SENTENCE_SETS.has(setType);
}
