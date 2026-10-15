import { createGrammarBookTables, getDatabase } from "./db";
import type {
  GrammarBlock,
  GrammarBookChapterMeta,
  GrammarBookExerciseSet,
  GrammarBookFile,
  GrammarBookImportMode,
  GrammarBookItem,
  GrammarBookItemAi,
  GrammarBookLesson,
  GrammarBookPracticeGroup,
  GrammarExerciseSetType,
  ItemValidationError,
} from "@/types/grammarBook";
import { persistKeyNow } from "./storageBackup";
import { answerReadings } from "./smartReview";

/**
 * The grammar book is the learner's own data: JSON files they convert from their copy of the book and import
 * in the app (Ngữ pháp → Nhập dữ liệu sách). It lives only in the local database, never in the app bundle.
 */

export const ACCEPTED_ANSWERS_KEY = "myenglish_grammar_accepted_answers_v1";
export const HIDDEN_ITEMS_KEY = "myenglish_grammar_hidden_items_v1";
/** Bumped (localStorage) each time the imported book changes, so the other windows (the popup) drop their copy */
export const BOOK_REVISION_KEY = "myenglish_grammar_book_revision_v1";

/** The 31 chapters in book order (same ids and titles as docs/grammar-import-prompt.md) */
export const BOOK_CHAPTERS: GrammarBookChapterMeta[] = [
  { order: 1, title: "TENSES", titleVn: "CÁC THÌ" },
  { order: 2, title: "SEQUENCE OF TENSES", titleVn: "SỰ PHỐI HỢP CÁC THÌ" },
  { order: 3, title: "CLAUSES OF CONDITION", titleVn: "CÂU ĐIỀU KIỆN" },
  { order: 4, title: "CLAUSES AFTER WISH, IF ONLY", titleVn: "MỆNH ĐỀ SAU WISH, IF ONLY" },
  { order: 5, title: "PHRASES AND CLAUSES OF PURPOSE", titleVn: "CỤM TỪ VÀ MỆNH ĐỀ CHỈ MỤC ĐÍCH" },
  { order: 6, title: "PHRASES AND CLAUSES OF RESULT", titleVn: "CỤM TỪ VÀ MỆNH ĐỀ CHỈ KẾT QUẢ" },
  { order: 7, title: "PHRASES AND CLAUSES OF REASON", titleVn: "CỤM TỪ VÀ MỆNH ĐỀ CHỈ LÝ DO" },
  { order: 8, title: "PHRASES AND CLAUSES OF CONCESSION", titleVn: "CỤM TỪ VÀ MỆNH ĐỀ CHỈ SỰ NHƯỢNG BỘ" },
  {
    order: 9,
    title: "CLAUSES AFTER AS IF, AS THOUGH, IT'S HIGH TIME, IT'S TIME, WOULD RATHER",
    titleVn: "MỆNH ĐỀ SAU AS IF, AS THOUGH, IT'S (HIGH) TIME, WOULD RATHER",
  },
  { order: 10, title: "NOUN CLAUSES", titleVn: "MỆNH ĐỀ DANH TỪ" },
  { order: 11, title: "RELATIVE CLAUSES", titleVn: "MỆNH ĐỀ QUAN HỆ" },
  { order: 12, title: "EXPRESSION OF QUANTITY", titleVn: "TỪ CHỈ SỐ LƯỢNG" },
  { order: 13, title: "STYLES", titleVn: "VĂN PHONG" },
  { order: 14, title: "EMPHASIS", titleVn: "DẠNG NHẤN MẠNH" },
  { order: 15, title: "NOUNS", titleVn: "DANH TỪ" },
  { order: 16, title: "PRONOUNS", titleVn: "ĐẠI TỪ" },
  { order: 17, title: "ADJECTIVES", titleVn: "TÍNH TỪ" },
  { order: 18, title: "ADVERBS", titleVn: "TRẠNG TỪ" },
  { order: 19, title: "DEGREES OF COMPARISON OF ADJECTIVES AND ADVERBS", titleVn: "SO SÁNH CỦA TÍNH TỪ VÀ TRẠNG TỪ" },
  { order: 20, title: "VERBS", titleVn: "ĐỘNG TỪ" },
  { order: 21, title: "NUMBERS", titleVn: "SỐ TỪ" },
  { order: 22, title: "PREPOSITIONS", titleVn: "GIỚI TỪ" },
  { order: 23, title: "CONJUNCTIONS", titleVn: "LIÊN TỪ" },
  { order: 24, title: "ARTICLES", titleVn: "MẠO TỪ" },
  { order: 25, title: "WORD FORMATIONS AND WORD FORMS", titleVn: "CẤU TẠO TỪ VÀ DẠNG TỪ" },
  { order: 26, title: "ACRONYMS", titleVn: "TỪ VIẾT TẮT" },
  { order: 27, title: "IDIOMATIC EXPRESSIONS", titleVn: "THÀNH NGỮ" },
  { order: 28, title: "REPORTED SPEECH", titleVn: "LỜI NÓI GIÁN TIẾP" },
  { order: 29, title: "THE PASSIVE AND ACTIVE SENTENCES", titleVn: "CÂU CHỦ ĐỘNG VÀ BỊ ĐỘNG" },
  { order: 30, title: "SENTENCES", titleVn: "CÂU" },
  { order: 31, title: "PRACTICE TEST", titleVn: "BÀI KIỂM TRA TỔNG HỢP" },
];

export const VALID_CHAPTER_IDS = new Set(Array.from({ length: 31 }, (_, i) => `ch${String(i + 1).padStart(2, "0")}`));

export function getChapterMetadata(chapterId: string): GrammarBookChapterMeta | undefined {
  const match = /^ch(\d+)$/.exec(chapterId);
  if (!match) return undefined;
  const ord = parseInt(match[1], 10);
  return BOOK_CHAPTERS.find((c) => c.order === ord);
}

/** A chapter's place in the book comes from its id ("ch07" → 7), never from the file */
export function chapterOrderFromId(chapterId: string): number {
  const match = /^ch(\d+)$/.exec(chapterId);
  return match ? parseInt(match[1], 10) : 99;
}

/** "ch01-s03#7": the item's place in the book (exercise set + number), stable across re-imports */
export function bookItemKey(item: Pick<GrammarBookItem, "setId" | "n">): string {
  return `${item.setId || "misc"}#${item.n}`;
}

/** Blanks in a prompt: "___" (3 or more underscores, a longer run counts once) */
export function countBlanks(prompt: string): number {
  return (prompt.match(/_{3,}/g) || []).length;
}

/** True when the text matches one of the accepted answers (case, punctuation and contractions ignored) */
export function matchesAny(text: string, accepted: string[]): boolean {
  const user = new Set(answerReadings(text.trim()));
  // An empty answer means "nothing goes here": accept an empty box, "-", "x" or "Ø"
  if (accepted.some((a) => a.trim() === "") && /^\s*[-xØ∅]?\s*$/i.test(text)) return true;
  return accepted.some((a) => a.trim() !== "" && answerReadings(a.trim()).some((r) => user.has(r)));
}

const ELLIPSIS = /\.\.\.|…/;
/** Most words an alternative may have to be told apart from a "/" inside a longer sentence */
const MAX_ALTERNATIVE_WORDS = 4;

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * The accepted alternatives of an answer written with "/" ("was / were", "has been/ has gone"): the answer
 * itself when it has no "/". null when the "/" cannot be split safely: no space next to it ("and/or",
 * "24/7"), an empty alternative, long parts that may be pieces of one sentence ("He is / was late"), or parts
 * that mix capitalised and lower-case starts in a whole-sentence answer.
 */
export function splitAnswerAlternatives(answer: string, wholeSentence: boolean): string[] | null {
  if (!answer.includes("/")) return [answer];
  if (/\S\/\S/.test(answer)) return null;
  const parts = answer.split("/").map((p) => p.trim());
  if (parts.length < 2 || parts.some((p) => !p)) return null;
  // Complete sentences: each starts with a capital and all but the last end the sentence
  const sentences = parts.every((p) => /^[A-Z]/.test(p)) && parts.slice(0, -1).every((p) => /[.!?]["')]*$/.test(p));
  if (!sentences && parts.some((p) => wordCount(p) > MAX_ALTERNATIVE_WORDS)) return null;
  if (wholeSentence && !sentences && new Set(parts.map((p) => /^[A-Z]/.test(p))).size > 1) return null;
  return [...new Set(parts)];
}

/** An answer that no typed text can match: cut off ("...") or a "/" left unsplit (see normalizeItemAnswers) */
export function hasUnreadableAnswers(item: GrammarBookItem): boolean {
  if (countBlanks(item.prompt) === 0 && ELLIPSIS.test(item.answerSentence ?? "")) return true;
  return (item.answers ?? []).some((slot) => slot.some((a) => a.includes("/") || ELLIPSIS.test(a)));
}

/**
 * Makes an item's answers something a typed answer can match: an answer written as "a / b" becomes the
 * alternatives "a" and "b"; an answer that is cut off ("...", "…") or has a "/" that cannot be split safely
 * makes the item self-graded (the learner sees the book's answer and marks it). Nothing else changes.
 */
export function normalizeItemAnswers(item: GrammarBookItem): GrammarBookItem {
  if (item.noKey || item.selfGrade) return item;
  const blanks = countBlanks(item.prompt);
  let unsafe = false;
  let changed = false;
  const answers = (item.answers ?? []).map((slot) => {
    const out: string[] = [];
    for (const answer of slot) {
      const text = String(answer);
      if (ELLIPSIS.test(text)) unsafe = true;
      const parts = splitAnswerAlternatives(text, blanks === 0);
      if (!parts) unsafe = true;
      else if (parts.length !== 1 || parts[0] !== text) changed = true;
      out.push(...(parts ?? [text]));
    }
    return [...new Set(out)];
  });
  // A whole-sentence answer is also read from the sentence itself
  if (blanks === 0 && ELLIPSIS.test(item.answerSentence ?? "")) unsafe = true;
  if (unsafe) return { ...item, selfGrade: true };
  if (!changed) return item;
  const next: GrammarBookItem = { ...item, answers };
  if (blanks === 0 && item.answerSentence && item.answerSentence.includes("/")) next.answerSentence = answers[0]?.[0] ?? item.answerSentence;
  return next;
}

// ---------------------------------------------------------------------------------------------------------
// Reading a file pasted from an AI chat

export const TRUNCATED_JSON_MESSAGE =
  "File có vẻ bị cắt giữa chừng — trong chat với AI hãy gõ 'tiếp' rồi ghép phần còn lại vào cuối file";

export type GrammarJsonResult = { ok: true; value: unknown } | { ok: false; message: string };

/**
 * Parse a grammar file the forgiving way: drops a BOM, a ```json fence, text before the first "{" and after
 * the closing "}", and trailing commas; escapes raw line breaks inside strings. Errors are explained in
 * Vietnamese with an approximate line, never with the engine's message.
 */
export function parseGrammarBookJson(text: string): GrammarJsonResult {
  const full = text.replace(/^﻿/, "");
  let start = 0;
  let stop = full.length;
  const firstBrace = full.indexOf("{");
  const fenceAt = full.indexOf("```");
  if (fenceAt >= 0 && (firstBrace < 0 || fenceAt < firstBrace)) {
    const opener = /^```[\w-]*/.exec(full.slice(fenceAt));
    start = fenceAt + (opener ? opener[0].length : 3);
    const close = full.indexOf("```", start);
    if (close >= 0) stop = close;
  }
  const open = full.indexOf("{", start);
  if (open < 0 || open >= stop) {
    return { ok: false, message: "Không thấy dữ liệu JSON trong file (dữ liệu phải bắt đầu bằng dấu { )." };
  }

  const lineAt = (index: number) => full.slice(0, index).split("\n").length;
  const cleaned = cleanJsonText(full, open, stop);
  if (cleaned.end >= 0 && /[{[]|"\s*:/.test(full.slice(cleaned.end, stop))) {
    return {
      ok: false,
      message: `Sau dấu } kết thúc dữ liệu (dòng ${lineAt(cleaned.end)}) vẫn còn dữ liệu khác: có thể thừa một dấu }, hoặc file chứa hai khối JSON. Mỗi phần nên lưu thành một file riêng.`,
    };
  }
  try {
    return { ok: true, value: JSON.parse(cleaned.text) };
  } catch {
    const at = jsonErrorIndex(cleaned.text);
    if (at >= cleaned.text.trimEnd().length) return { ok: false, message: TRUNCATED_JSON_MESSAGE };
    if (at < 0) return { ok: false, message: "File JSON bị lỗi cú pháp. Hãy nhờ AI xuất lại phần này." };
    const source = cleaned.map[at] ?? open;
    const near = full
      .slice(Math.max(open, source - 30), source + 20)
      .replace(/\s+/g, " ")
      .trim();
    return {
      ok: false,
      message: `File JSON bị lỗi cú pháp gần dòng ${lineAt(source)}${near ? ` (đoạn "${near}")` : ""}. Thường do thiếu dấu phẩy, dấu ngoặc kép hoặc dấu ngoặc. Hãy sửa chỗ đó, hoặc nhờ AI xuất lại phần này.`,
    };
  }
}

/**
 * The JSON object starting at `from`: trailing commas dropped, raw line breaks in strings escaped. `map`
 * gives each output character's index in `src`; `end` is the index after the closing brace (-1: never closed).
 */
function cleanJsonText(src: string, from: number, stop: number): { text: string; map: number[]; end: number } {
  const out: string[] = [];
  const map: number[] = [];
  const push = (ch: string, at: number) => {
    out.push(ch);
    map.push(at);
  };
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < stop; i++) {
    const c = src[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      else if (c === "\r") continue;
      else if (c === "\n" || c === "\t") {
        push("\\", i);
        push(c === "\n" ? "n" : "t", i);
        continue;
      }
      push(c, i);
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    else if (c === ",") {
      let j = i + 1;
      while (j < stop && /\s/.test(src[j])) j++;
      if (src[j] === "}" || src[j] === "]") continue; // trailing comma
    }
    push(c, i);
    if (depth === 0 && (c === "}" || c === "]")) return { text: out.join(""), map, end: i + 1 };
  }
  return { text: out.join(""), map, end: -1 };
}

/** Index of the first syntax error in a JSON text (its length when the text ends too early); -1 if none */
function jsonErrorIndex(s: string): number {
  let i = 0;
  let errorAt = -1;
  const STOP = {};
  const fail = (): never => {
    errorAt = Math.min(i, s.length);
    throw STOP;
  };
  const space = () => {
    while (i < s.length && (s[i] === " " || s[i] === "\n" || s[i] === "\r" || s[i] === "\t")) i++;
  };
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const string = () => {
    if (s[i] !== '"') fail();
    i++;
    while (i < s.length) {
      const c = s[i];
      if (c === '"') {
        i++;
        return;
      }
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c < " ") fail();
      i++;
    }
    i = s.length;
    fail();
  };
  const value = (depth: number): void => {
    if (depth > 200) fail();
    space();
    const c = s[i];
    if (c === "{") {
      i++;
      space();
      if (s[i] === "}") {
        i++;
        return;
      }
      for (;;) {
        space();
        string();
        space();
        if (s[i] !== ":") fail();
        i++;
        value(depth + 1);
        space();
        if (s[i] === ",") {
          i++;
          continue;
        }
        if (s[i] === "}") {
          i++;
          return;
        }
        fail();
      }
    }
    if (c === "[") {
      i++;
      space();
      if (s[i] === "]") {
        i++;
        return;
      }
      for (;;) {
        value(depth + 1);
        space();
        if (s[i] === ",") {
          i++;
          continue;
        }
        if (s[i] === "]") {
          i++;
          return;
        }
        fail();
      }
    }
    if (c === '"') return string();
    for (const word of ["true", "false", "null"]) {
      if (s.startsWith(word, i)) {
        i += word.length;
        return;
      }
      if (s.length - i < word.length && word.startsWith(s.slice(i))) {
        i = s.length;
        fail();
      }
    }
    number.lastIndex = i;
    if (number.test(s)) {
      i = number.lastIndex;
      return;
    }
    fail();
  };
  try {
    value(0);
    space();
    return i < s.length ? i : -1;
  } catch (err) {
    if (err === STOP) return errorAt;
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Validation: file-level problems reject the file; a bad item, lesson, set or block is left out with a warning

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const isScalar = (v: unknown): v is string | number => typeof v === "string" || typeof v === "number";
const notNull = <T,>(v: T | null | undefined): v is T => v !== null && v !== undefined;

/** A text field: strings as they are, numbers as text, a list of lines joined; anything else is missing */
function textOf(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v) && v.length > 0 && v.every(isScalar)) return v.join("\n");
  return null;
}

/** A list of short values (options, word bank) as strings; not a list → undefined */
function scalarList(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter(isScalar).map(String) : undefined;
}

/** Ids (lessonIds): a single id is accepted, blanks dropped */
function idList(v: unknown): string[] | undefined {
  if (typeof v === "string") return v.trim() ? [v.trim()] : [];
  if (!Array.isArray(v)) return undefined;
  return v
    .filter(isScalar)
    .map((x) => String(x).trim())
    .filter(Boolean);
}

function integerOf(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^\s*\d+\s*$/.test(v)) return parseInt(v, 10);
  return null;
}

/** A set's "Ex:" line as text (older files gave { prompt, answer }) */
function exampleOf(v: unknown): string | null {
  if (typeof v === "string") return v.trim() ? v : null;
  if (isObject(v)) {
    const parts = [textOf(v.prompt), textOf(v.answer)].filter((p): p is string => !!p && !!p.trim());
    return parts.length > 0 ? parts.join(" → ") : null;
  }
  return null;
}

/**
 * Accepted answers as one list per blank. A flat list (["x"], or "x") is wrapped: one answer per blank when
 * the counts match, otherwise alternatives for a single blank. null = unusable shape.
 */
export function normalizeAnswers(value: unknown, blanks: number): string[][] | null {
  if (value === undefined || value === null) return [];
  if (isScalar(value)) return [[String(value)]];
  if (!Array.isArray(value)) return null;
  if (value.every(isScalar)) {
    const flat = value.map(String);
    if (flat.length === 0) return [];
    return blanks > 1 && flat.length === blanks ? flat.map((a) => [a]) : [flat];
  }
  const out: string[][] = [];
  for (const a of value) {
    if (isScalar(a)) out.push([String(a)]);
    else if (Array.isArray(a) && a.every(isScalar)) out.push(a.map(String));
    else return null;
  }
  return out;
}

function cleanAi(v: unknown, blanks: number): GrammarBookItemAi | undefined {
  if (!isObject(v)) return undefined;
  const ai: GrammarBookItemAi = {};
  const vi = textOf(v.vi);
  if (vi && vi.trim()) ai.vi = vi;
  const explain = textOf(v.explainVn);
  if (explain && explain.trim()) ai.explainVn = explain;
  const distractors = normalizeAnswers(v.distractors, blanks);
  if (distractors && distractors.length > 0) ai.distractors = distractors;
  const wrong = scalarList(v.wrongSentences);
  if (wrong && wrong.length > 0) ai.wrongSentences = wrong;
  const suggested = normalizeAnswers(v.suggestedAnswers, blanks);
  if (suggested && suggested.length > 0) ai.suggestedAnswers = suggested;
  const lessonIds = idList(v.lessonIds);
  if (lessonIds && lessonIds.length > 0) ai.lessonIds = lessonIds;
  return Object.keys(ai).length > 0 ? ai : undefined;
}

/** One theory block in a shape the handbook can show (a bullet with a list becomes several), null = unusable */
function normalizeBlock(b: unknown): GrammarBlock[] | null {
  if (typeof b === "string") return b.trim() ? [{ type: "text", text: b }] : [];
  if (!isObject(b)) return null;
  const type = typeof b.type === "string" ? b.type.trim().toLowerCase() : "";
  const text = textOf(b.text);
  switch (type) {
    case "heading":
    case "text":
    case "note":
      return text === null ? null : [{ type, text }];
    case "bullet":
    case "list": {
      if (Array.isArray(b.items)) {
        const lines = b.items.map(textOf).filter((t): t is string => t !== null);
        return lines.length > 0 ? lines.map((line) => ({ type: "bullet" as const, text: line })) : null;
      }
      return text === null ? null : [{ type: "bullet", text }];
    }
    case "formula": {
      if (text === null) return null;
      const label = textOf(b.label);
      return [label ? { type: "formula", label, text } : { type: "formula", text }];
    }
    case "example": {
      const en = textOf(b.en) ?? text;
      return en === null ? null : [{ type: "example", en, vi: textOf(b.vi) ?? "" }];
    }
    case "table": {
      const headers = Array.isArray(b.headers) ? b.headers.map((h) => textOf(h) ?? "") : null;
      const rows = Array.isArray(b.rows) ? b.rows.map((r) => (Array.isArray(r) ? r : [r]).map((c) => textOf(c) ?? "")) : null;
      if (!headers && !rows) return null;
      return [{ type: "table", headers: headers ?? [], rows: rows ?? [] }];
    }
    case "wordlist": {
      if (!Array.isArray(b.items)) return null;
      const items = b.items
        .map((w) => {
          if (isScalar(w)) return { en: String(w), vi: "" };
          const en = isObject(w) ? textOf(w.en) : null;
          return en === null || !isObject(w) ? null : { en, vi: textOf(w.vi) ?? "" };
        })
        .filter(notNull);
      return items.length > 0 ? [{ type: "wordlist", items }] : null;
    }
    default:
      // An unknown kind of block that still has text is shown as plain text
      return text === null ? null : [{ type: "text", text }];
  }
}

function normalizeBlocks(value: unknown, where: string, warn: (message: string) => void): GrammarBlock[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    warn(`${where}: phần lý thuyết ("blocks") không phải danh sách → bỏ qua`);
    return [];
  }
  const out: GrammarBlock[] = [];
  let dropped = 0;
  for (const b of value) {
    const blocks = normalizeBlock(b);
    if (blocks) out.push(...blocks);
    else dropped++;
  }
  if (dropped > 0) warn(`${where}: bỏ ${dropped} khối lý thuyết sai định dạng`);
  return out;
}

/**
 * Validate a single JSON file before importing. Errors (wrong format, version or chapter) reject the file.
 * Anything smaller is a warning: a broken item, lesson or set is left out, a doubtful item is imported as
 * self-graded (the learner sees the book's answer and marks it right or wrong).
 */
export function validateGrammarBookFile(
  raw: unknown,
  fileName: string = "unnamed.json"
): { valid: boolean; errors: ItemValidationError[]; warnings: ItemValidationError[]; data?: GrammarBookFile } {
  const errors: ItemValidationError[] = [];
  const warnings: ItemValidationError[] = [];

  if (!isObject(raw)) {
    errors.push({ file: fileName, chapterId: "unknown", message: "Nội dung JSON không phải là object hợp lệ", severity: "error" });
    return { valid: false, errors, warnings };
  }

  const file = raw;
  const chapterId = String(file.chapterId || "").trim();

  if (file.format !== "myenglish-grammar-book") {
    errors.push({ file: fileName, chapterId: chapterId || "unknown", message: `Format không đúng (cần "myenglish-grammar-book", nhận: "${String(file.format)}")`, severity: "error" });
  }
  const version = Number(file.version);
  if (version !== 1 && version !== 2) {
    errors.push({ file: fileName, chapterId: chapterId || "unknown", message: `Version không được hỗ trợ (chỉ nhận 1 hoặc 2, nhận: ${String(file.version)})`, severity: "error" });
  }
  if (!VALID_CHAPTER_IDS.has(chapterId)) {
    errors.push({ file: fileName, chapterId, message: `chapterId "${chapterId}" không thuộc 31 chương (ch01 – ch31)`, severity: "error" });
  }
  if (errors.length > 0) return { valid: false, errors, warnings };

  const prefix = `${chapterId}-`;
  const warn = (message: string, extra: Partial<ItemValidationError> = {}) =>
    warnings.push({ file: fileName, chapterId, ...extra, message, severity: "warning" });
  const drop = (message: string, extra: Partial<ItemValidationError> = {}) => warn(message, { ...extra, dropped: true });

  // Lessons: ids must carry the chapter prefix, or saving would overwrite a lesson of another chapter
  const lessons: GrammarBookLesson[] = [];
  const lessonIds = new Set<string>();
  (Array.isArray(file.lessons) ? file.lessons : []).forEach((l: unknown, i: number) => {
    if (!isObject(l) || typeof l.id !== "string" || !l.id.trim()) {
      drop(`Bài thứ ${i + 1} thiếu id → bỏ qua bài này`);
      return;
    }
    const id = l.id.trim();
    if (!id.startsWith(prefix)) {
      drop(`Bài "${id}" không bắt đầu bằng "${prefix}" → bỏ qua (tránh ghi đè bài của chương khác)`);
      return;
    }
    if (lessonIds.has(id)) {
      drop(`Bài "${id}" bị trùng id → chỉ giữ bài đầu tiên`);
      return;
    }
    lessonIds.add(id);
    const fromId = /-l(\d+)$/.exec(id);
    lessons.push({
      ...(l as unknown as GrammarBookLesson),
      id,
      order: typeof l.order === "number" && Number.isFinite(l.order) ? l.order : fromId ? parseInt(fromId[1], 10) : i + 1,
      title: textOf(l.title) ?? "",
      titleVn: textOf(l.titleVn) ?? "",
      blocks: normalizeBlocks(l.blocks, `Bài ${id}`, (m) => warn(m)),
    });
  });
  const chapterNotes = normalizeBlocks(file.chapterNotes, "Ghi nhớ chương", (m) => warn(m));

  const cleanItem = (raw: unknown, inheritedSet: string | undefined, containerLessons: string[] | undefined, position: string): GrammarBookItem | null => {
    if (!isObject(raw)) {
      drop(`${position}: không đọc được câu này → bỏ qua`);
      return null;
    }
    const n = integerOf(raw.n);
    const setId = typeof raw.setId === "string" && raw.setId.trim() ? raw.setId.trim() : inheritedSet;
    const label = `Câu ${setId ?? "?"}#${n ?? "?"}`;
    const where = { setId, itemN: n ?? undefined };
    if (!setId) {
      drop(`${label} (${position}): thiếu "setId" (câu thuộc nhóm bài tập nào) → bỏ câu này`, where);
      return null;
    }
    if (!setId.startsWith(prefix)) {
      drop(`${label}: nhóm "${setId}" không thuộc chương ${chapterId} → bỏ câu này`, where);
      return null;
    }
    if (n === null) {
      drop(`${label} (${position}): thiếu số thứ tự câu "n" (số nguyên) → bỏ câu này`, where);
      return null;
    }
    if (typeof raw.prompt !== "string" || !raw.prompt.trim()) {
      drop(`${label}: thiếu đề (prompt) → bỏ câu này`, where);
      return null;
    }

    const prompt = raw.prompt;
    const blanks = countBlanks(prompt);
    const item = { ...raw, setId, n, prompt } as unknown as GrammarBookItem;
    delete item.hidden;
    delete item.userAcceptedAnswers;
    const ownLessons = idList(raw.lessonIds);
    if (ownLessons) item.lessonIds = ownLessons;
    else delete item.lessonIds;
    const options = scalarList(raw.options);
    if (options) item.options = options;
    else delete item.options;
    for (const key of ["given", "underline", "keyRaw"] as const) {
      const value = textOf(raw[key]);
      if (value !== null) item[key] = value;
      else delete item[key];
    }
    item.answerSentence = textOf(raw.answerSentence) ?? "";
    if (Array.isArray(raw.parts)) item.parts = raw.parts.filter(isObject).map((p) => ({ text: textOf(p.text) ?? "", role: textOf(p.role) ?? "" }));
    else delete item.parts;
    const ai = cleanAi(raw.ai, blanks);
    if (ai) item.ai = ai;
    else delete item.ai;
    for (const flag of ["noKey", "keyPartial", "selfGrade"] as const) {
      if (raw[flag] === true) item[flag] = true;
      else delete item[flag];
    }

    const answers = normalizeAnswers(raw.answers, blanks);
    item.answers = answers ?? [];
    // "a / b" becomes two accepted answers; a cut-off answer ("...") or a "/" that cannot be split is self-graded
    const tidy = normalizeItemAnswers(item);
    item.answers = tidy.answers;
    item.answerSentence = tidy.answerSentence;
    if (tidy.selfGrade && !item.selfGrade && !item.noKey) {
      warn(`${label}: đáp án bị cắt dở ("...") hoặc có dấu "/" không tách được → tự chấm`, where);
      item.selfGrade = true;
    }
    if (!answers && !item.noKey) {
      warn(`${label}: "answers" sai định dạng → tự chấm`, where);
      item.selfGrade = true;
    }
    if (!item.noKey && blanks > 0 && blanks !== item.answers.length) {
      warn(`${label}: ${blanks} chỗ trống nhưng ${item.answers.length} đáp án → tự chấm`, where);
      item.selfGrade = true;
    }
    if (!item.noKey && item.answers.length === 0 && !item.answerSentence.trim()) {
      warn(`${label}: không có đáp án → tự chấm`, where);
      item.selfGrade = true;
    }
    if (item.options && item.options.length > 0 && item.answers.length > 0) {
      // The same matcher as the player's: curly and straight apostrophes, contractions and case do not matter
      const first = item.answers[0] || [];
      if (!item.options.some((opt) => matchesAny(opt, first))) {
        warn(`${label}: đáp án không có trong các lựa chọn → tự chấm`, where);
        item.selfGrade = true;
      }
    }
    if (item.noKey) item.selfGrade = true;
    const effectiveLessons = ownLessons && ownLessons.length > 0 ? ownLessons : item.ai?.lessonIds?.length ? item.ai.lessonIds : containerLessons;
    if (!effectiveLessons || effectiveLessons.length === 0) {
      warn(`${label}: chưa gắn bài nào (lessonIds)`, where);
    } else if (containerLessons && ownLessons && ownLessons.length > 0 && [...ownLessons].sort().join() !== [...containerLessons].sort().join() && !inheritedSet) {
      warn(`${label}: lessonIds khác với nhóm luyện chứa nó (dùng lessonIds của câu)`, where);
    }
    return item;
  };

  // Exercise sets (their items, when given inside the set, inherit its id)
  const exerciseSets: GrammarBookExerciseSet[] = [];
  const setById = new Map<string, GrammarBookExerciseSet>();
  (Array.isArray(file.exerciseSets) ? file.exerciseSets : []).forEach((s: unknown, i: number) => {
    const count = isObject(s) && Array.isArray(s.items) ? s.items.length : 0;
    const lost = count > 0 ? ` (bỏ cả ${count} câu của nhóm)` : "";
    if (!isObject(s) || typeof s.id !== "string" || !s.id.trim()) {
      drop(`Nhóm bài tập thứ ${i + 1} thiếu id → bỏ qua${lost}`);
      return;
    }
    const id = s.id.trim();
    if (!id.startsWith(prefix)) {
      drop(`Nhóm bài tập "${id}" không bắt đầu bằng "${prefix}" → bỏ qua${lost} (tránh ghi đè chương khác)`, { setId: id });
      return;
    }
    const setLessons = idList(s.lessonIds);
    const items = Array.isArray(s.items)
      ? s.items.map((it: unknown, j: number) => cleanItem(it, id, setLessons, `nhóm ${id}, câu thứ ${j + 1}`)).filter(notNull)
      : undefined;
    const existing = setById.get(id);
    if (existing) {
      warn(`Nhóm bài tập "${id}" xuất hiện hai lần trong file → gộp câu vào nhóm đầu`, { setId: id });
      if (items) existing.items = [...(existing.items ?? []), ...items];
      return;
    }
    const set = {
      ...(s as unknown as GrammarBookExerciseSet),
      id,
      roman: textOf(s.roman) ?? "",
      instruction: textOf(s.instruction) ?? "",
      type: (textOf(s.type) ?? "fill_blank").trim() as GrammarExerciseSetType,
      wordBank: scalarList(s.wordBank) ?? [],
      example: exampleOf(s.example),
      passage: textOf(s.passage),
    };
    if (setLessons && setLessons.length > 0) set.lessonIds = setLessons;
    else delete set.lessonIds;
    const itemCount = integerOf(s.itemCount);
    if (itemCount !== null) set.itemCount = itemCount;
    else delete set.itemCount;
    for (const key of ["page", "keyPage"] as const) if (typeof s[key] !== "number") delete set[key];
    if (items) set.items = items;
    else delete set.items;
    setById.set(id, set);
    exerciseSets.push(set);
  });

  // Practice groups (v2): their ids are rebuilt from the items' lessons, so a wrong id only loses the title
  const practiceGroups: GrammarBookPracticeGroup[] = [];
  (Array.isArray(file.practiceGroups) ? file.practiceGroups : []).forEach((g: unknown, i: number) => {
    if (!isObject(g)) {
      drop(`Nhóm luyện thứ ${i + 1} không đọc được → bỏ qua`);
      return;
    }
    const gid = typeof g.id === "string" ? g.id.trim() : "";
    const groupLessons = idList(g.lessonIds) ?? [];
    if (gid && !gid.startsWith(prefix)) warn(`Nhóm luyện "${gid}" không bắt đầu bằng "${prefix}" → app tự đặt lại id theo bài`);
    const items = (Array.isArray(g.items) ? g.items : [])
      .map((it: unknown, j: number) => cleanItem(it, undefined, groupLessons, `nhóm luyện ${gid || i + 1}, câu thứ ${j + 1}`))
      .filter(notNull);
    practiceGroups.push({
      id: gid.startsWith(prefix) ? gid : groupIdFor(chapterId, [...groupLessons].sort()),
      lessonIds: groupLessons,
      title: textOf(g.title) ?? "",
      items,
    });
  });

  if (version === 1 && setById.size > 0) {
    for (const g of practiceGroups) {
      for (const it of g.items) {
        if (it.setId && !setById.has(it.setId)) warn(`Câu ${bookItemKey(it)}: setId không có trong file`, { setId: it.setId, itemN: it.n });
      }
    }
  }

  const itemTotal =
    practiceGroups.reduce((n, g) => n + g.items.length, 0) + exerciseSets.reduce((n, s) => n + (s.items?.length ?? 0), 0);
  if (lessons.length === 0 && chapterNotes.length === 0 && exerciseSets.length === 0 && itemTotal === 0) {
    errors.push({ file: fileName, chapterId, message: "File không có bài học hay câu bài tập nào (có thể sai tên trường)", severity: "error" });
    return { valid: false, errors, warnings };
  }

  const stats = isObject(file.stats) ? (file.stats as Record<string, number>) : undefined;
  if (stats) {
    const actual: Record<string, number> = { lessons: lessons.length, sets: exerciseSets.length, groups: practiceGroups.length, items: itemTotal };
    for (const [k, v] of Object.entries(actual)) {
      if (stats[k] !== undefined && stats[k] !== v) warn(`stats.${k} = ${stats[k]} nhưng file có ${v}`);
    }
  }

  // The chapter's place in the book always comes from its id
  const known = getChapterMetadata(chapterId);
  let chapter: GrammarBookChapterMeta | undefined;
  if (isObject(file.chapter)) {
    chapter = {
      order: chapterOrderFromId(chapterId),
      title: textOf(file.chapter.title) ?? known?.title ?? "",
      titleVn: textOf(file.chapter.titleVn) ?? known?.titleVn ?? "",
    };
    const pages = file.chapter.pages;
    if (Array.isArray(pages) && pages.length === 2 && pages.every((p) => typeof p === "number")) chapter.pages = [pages[0], pages[1]];
  }

  const data: GrammarBookFile = {
    format: "myenglish-grammar-book",
    version: version as 1 | 2,
    chapterId,
    part: integerOf(file.part) ?? undefined,
    parts: integerOf(file.parts) ?? undefined,
    chapter,
    lessons,
    chapterNotes,
    exerciseSets,
    practiceGroups,
    fixes: Array.isArray(file.fixes) ? (file.fixes.filter(isObject) as unknown as GrammarBookFile["fixes"]) : [],
    stats: stats as GrammarBookFile["stats"],
  };
  return { valid: true, errors, warnings, data };
}

/**
 * Checks that need every file of a chapter: missing parts, an item given twice, sets with fewer items than
 * "itemCount", items pointing to a lesson or set that does not exist. `stored`: chapters already in the
 * database, counted in when the files are added to them (their parts are not missing, their items count).
 */
export function validateChapterFiles(files: GrammarBookFile[], stored: GrammarBookFile[] = []): ItemValidationError[] {
  const warnings: ItemValidationError[] = [];
  const byChapter = new Map<string, GrammarBookFile[]>();
  for (const f of files) {
    const list = byChapter.get(f.chapterId);
    if (list) list.push(f);
    else byChapter.set(f.chapterId, [f]);
  }

  for (const [chapterId, parts] of byChapter) {
    const base = stored.find((c) => c.chapterId === chapterId);
    const declared = Math.max(1, ...parts.map((p) => p.parts || 1));
    const have = new Set([...parts.map((p) => p.part || 1), ...(base?.importedParts ?? [])]);
    const missing = Array.from({ length: declared }, (_, i) => i + 1).filter((p) => !have.has(p));
    if (missing.length > 0) {
      warnings.push({
        chapterId,
        message: `${chapterId}: thiếu phần ${missing.join(", ")}/${declared} — vẫn nhập được; nhập phần còn thiếu sau, app sẽ gộp thêm`,
        severity: "warning",
      });
    }

    const lessonIds = new Set([...(base?.lessons ?? []), ...parts.flatMap((p) => p.lessons || [])].map((l) => l.id));
    const sets = new Map<string, GrammarBookExerciseSet>();
    for (const s of base?.exerciseSets ?? []) sets.set(s.id, s);
    for (const p of parts) for (const s of p.exerciseSets || []) sets.set(s.id, s);
    const seen = new Map<string, number>();
    const perSet = new Map<string, Set<string>>();
    const countIn = (setId: string, key: string) => perSet.set(setId, (perSet.get(setId) ?? new Set<string>()).add(key));
    const items = parts.flatMap((p) => [
      ...(p.practiceGroups || []).flatMap((g) => (g.items || []).map((it) => ({ ...it, lessonIds: it.lessonIds || g.lessonIds }))),
      ...(p.exerciseSets || []).flatMap((s) => (s.items || []).map((it) => ({ ...it, setId: it.setId || s.id, lessonIds: it.lessonIds || s.lessonIds }))),
    ]);
    for (const it of items) {
      const key = bookItemKey(it);
      seen.set(key, (seen.get(key) ?? 0) + 1);
      if (it.setId) countIn(it.setId, key);
      if (it.setId && sets.size > 0 && !sets.has(it.setId)) {
        warnings.push({ chapterId, setId: it.setId, itemN: it.n, message: `Câu ${key}: nhóm ${it.setId} không có trong dữ liệu`, severity: "warning" });
      }
      if (lessonIds.size > 0) {
        const unknown = (it.lessonIds || []).filter((id) => !lessonIds.has(id));
        if (unknown.length > 0) {
          warnings.push({ chapterId, setId: it.setId, itemN: it.n, message: `Câu ${key}: bài ${unknown.join(", ")} không có trong chương`, severity: "warning" });
        }
      }
    }
    // Items already imported that these files do not replace still count for their set
    for (const g of base?.practiceGroups ?? []) {
      for (const it of g.items) if (it.setId) countIn(it.setId, bookItemKey(it));
    }
    for (const [key, count] of seen) {
      if (count > 1) warnings.push({ chapterId, message: `Câu ${key} xuất hiện ${count} lần (chỉ giữ lần đầu)`, severity: "warning" });
    }
    for (const [id, set] of sets) {
      const got = perSet.get(id)?.size ?? 0;
      if (typeof set.itemCount === "number" && got !== set.itemCount) {
        warnings.push({ chapterId, setId: id, message: `Nhóm ${set.roman || id}: có ${got}/${set.itemCount} câu`, severity: "warning" });
      }
    }
  }
  return warnings;
}

/**
 * Merge the parts of each chapter: lessons and sets by id, practice groups by id (items deduplicated by
 * their place in the book), items given inside their set regrouped by the lessons they use. Files are taken
 * in part order and the first copy of a lesson, set or item wins; with `overwrite` the files are taken in
 * the given order and a later copy replaces an earlier one (adding new files to a stored chapter).
 */
export function mergeChapterParts(files: GrammarBookFile[], options: { overwrite?: boolean } = {}): Map<string, GrammarBookFile> {
  const overwrite = !!options.overwrite;
  const chapterMap = new Map<string, GrammarBookFile>();
  // Per chapter: its practice groups by id, where each item (by place in the book) sits, and the replaced
  // items still to be removed (dropped in one pass at the end instead of re-filtering per replaced item)
  const placed = new Map<string, { groups: Map<string, GrammarBookPracticeGroup>; groupOf: Map<string, { group: GrammarBookPracticeGroup; item: GrammarBookItem }>; replaced: Set<GrammarBookItem> }>();
  const ordered = overwrite
    ? [...files]
    : [...files].sort((a, b) => a.chapterId.localeCompare(b.chapterId) || (a.part || 1) - (b.part || 1));

  for (const file of ordered) {
    let chapter = chapterMap.get(file.chapterId);
    if (!chapter) {
      chapter = {
        format: "myenglish-grammar-book",
        version: 2,
        chapterId: file.chapterId,
        part: 1,
        parts: file.parts || 1,
        chapter: undefined,
        lessons: [],
        chapterNotes: [],
        exerciseSets: [],
        practiceGroups: [],
        fixes: [],
        importedParts: [],
      };
      chapterMap.set(file.chapterId, chapter);
      placed.set(file.chapterId, { groups: new Map(), groupOf: new Map(), replaced: new Set() });
    }
    if (file.chapter && (overwrite || !chapter.chapter)) chapter.chapter = file.chapter;
    if (file.parts) chapter.parts = overwrite ? file.parts : Math.max(chapter.parts || 1, file.parts);
    chapter.importedParts = [...new Set([...(chapter.importedParts ?? []), ...(file.importedParts ?? [file.part || 1])])].sort((a, b) => a - b);

    const lessonAt = new Map(chapter.lessons!.map((l, i) => [l.id, i]));
    for (const l of file.lessons || []) {
      const at = lessonAt.get(l.id);
      if (at === undefined) {
        lessonAt.set(l.id, chapter.lessons!.length);
        chapter.lessons!.push(l);
      } else if (overwrite) chapter.lessons![at] = l;
    }
    // Notes come with part 1: added part by part, or replaced when part 1 is imported again
    if (overwrite) {
      if ((file.chapterNotes || []).length > 0) chapter.chapterNotes = [...file.chapterNotes!];
    } else chapter.chapterNotes!.push(...(file.chapterNotes || []));
    const fixKeys = new Set(chapter.fixes!.map((f) => JSON.stringify(f)));
    for (const f of file.fixes || []) {
      const key = JSON.stringify(f);
      if (!fixKeys.has(key)) {
        fixKeys.add(key);
        chapter.fixes!.push(f);
      }
    }

    const setAt = new Map(chapter.exerciseSets!.map((s, i) => [s.id, i]));
    for (const s of file.exerciseSets || []) {
      const { items: _items, ...meta } = s;
      const at = setAt.get(s.id);
      if (at === undefined) {
        setAt.set(s.id, chapter.exerciseSets!.length);
        chapter.exerciseSets!.push(meta);
      } else if (overwrite) chapter.exerciseSets![at] = meta;
    }

    const { groups, groupOf, replaced } = placed.get(file.chapterId)!;
    for (const incoming of extractPracticeGroups(file)) {
      let group = groups.get(incoming.id);
      if (!group) {
        group = { ...incoming, items: [] };
        chapter.practiceGroups!.push(group);
        groups.set(group.id, group);
      } else if (overwrite && incoming.title) group.title = incoming.title;
      for (const item of incoming.items) {
        const key = bookItemKey(item);
        const previous = groupOf.get(key);
        if (previous) {
          if (!overwrite) continue;
          replaced.add(previous.item);
        }
        group.items.push(item);
        groupOf.set(key, { group, item });
      }
    }
  }

  for (const chapter of chapterMap.values()) {
    const replaced = placed.get(chapter.chapterId)!.replaced;
    if (replaced.size > 0) for (const g of chapter.practiceGroups!) g.items = g.items.filter((it) => !replaced.has(it));
    chapter.chapter = chapter.chapter || getChapterMetadata(chapter.chapterId);
    chapter.lessons!.sort((a, b) => a.order - b.order);
    if (overwrite) chapter.exerciseSets!.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    chapter.practiceGroups = chapter.practiceGroups!.filter((g) => g.items.length > 0);
    const setOrder = new Map(chapter.exerciseSets!.map((s, i) => [s.id, i]));
    for (const g of chapter.practiceGroups) {
      g.items.sort((a, b) => (setOrder.get(a.setId ?? "") ?? 999) - (setOrder.get(b.setId ?? "") ?? 999) || a.n - b.n);
    }
    chapter.stats = {
      lessons: chapter.lessons!.length,
      sets: chapter.exerciseSets!.length,
      groups: chapter.practiceGroups.length,
      items: chapter.practiceGroups.reduce((n, g) => n + g.items.length, 0),
    };
  }
  return chapterMap;
}

function groupIdFor(chapterId: string, lessonIds: string[]): string {
  if (lessonIds.length === 0) return `${chapterId}-g00`;
  return `${chapterId}-g${lessonIds.map((id) => id.replace(/^.*-l/, "")).join("-")}`;
}

/**
 * Items grouped by exactly the lessons they use. Items may come in practice groups (v2) or inside their
 * exercise set, each carrying its own lessonIds (flat format, v1): the importer builds the groups itself.
 */
function extractPracticeGroups(file: GrammarBookFile): GrammarBookPracticeGroup[] {
  const groups = new Map<string, GrammarBookPracticeGroup>();
  const add = (item: GrammarBookItem, lessons: string[], title?: string) => {
    // An item belongs to the group of exactly the lessons it uses (its own tags win over its group's)
    const sorted = [...new Set(lessons)].sort();
    const id = groupIdFor(file.chapterId, sorted);
    let group = groups.get(id);
    if (!group) {
      group = { id, lessonIds: sorted, title: title || "", items: [] };
      groups.set(id, group);
    } else if (title && !group.title) group.title = title;
    group.items.push({ ...item, lessonIds: sorted });
  };

  for (const g of file.practiceGroups || []) {
    for (const it of g.items || []) {
      const own = it.lessonIds && it.lessonIds.length > 0 ? it.lessonIds : it.ai?.lessonIds?.length ? it.ai.lessonIds : g.lessonIds || [];
      const sameAsGroup = [...own].sort().join() === [...(g.lessonIds || [])].sort().join();
      add(it, own, sameAsGroup ? g.title : undefined);
    }
  }
  for (const s of file.exerciseSets || []) {
    for (const it of s.items || []) {
      add({ ...it, setId: it.setId || s.id }, it.lessonIds?.length ? it.lessonIds : it.ai?.lessonIds?.length ? it.ai.lessonIds : s.lessonIds || []);
    }
  }
  return Array.from(groups.values());
}

function stripAiFromItem(item: GrammarBookItem): GrammarBookItem {
  const { ai: _ai, ...rest } = item;
  return rest;
}

// ---------------------------------------------------------------------------------------------------------
// Database

type BookDb = Awaited<ReturnType<typeof getDatabase>>;
type BookRow = { id: string; chapter_id: string; ord: number; data: string };
type InsertRow = [string, string, number, string];
type StoredItem = GrammarBookItem & { groupId?: string; groupTitle?: string; groupLessonIds?: string[] };
type ChapterMetaRow = {
  chapter?: GrammarBookChapterMeta;
  chapterNotes?: GrammarBookFile["chapterNotes"];
  fixes?: GrammarBookFile["fixes"];
  stats?: GrammarBookFile["stats"];
  parts?: number;
  importedParts?: number[];
};

const BOOK_TABLES = ["grammar_book_chapters", "grammar_book_lessons", "grammar_book_sets", "grammar_book_items"] as const;

let tablesChecked: Promise<void> | null = null;

/** The book's tables, created if a database is missing them (checked once per run) */
async function bookDatabase(): Promise<BookDb> {
  const db = await getDatabase();
  if (!tablesChecked) {
    tablesChecked = createGrammarBookTables((sql) => db.execute(sql)).catch((err) => {
      tablesChecked = null;
      throw err;
    });
  }
  await tablesChecked;
  return db;
}

/** Multi-row INSERT in batches: one statement per batch instead of one per row */
async function insertRows(db: BookDb, table: string, rows: InsertRow[]): Promise<void> {
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = chunk.map((_, j) => `($${j * 4 + 1}, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4})`).join(", ");
    await db.execute(`INSERT OR REPLACE INTO ${table} (id, chapter_id, ord, data) VALUES ${values};`, chunk.flat());
  }
}

async function deleteRows(db: BookDb, table: string, ids: string[]): Promise<void> {
  const BATCH = 200;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    await db.execute(`DELETE FROM ${table} WHERE id IN (${chunk.map((_, j) => `$${j + 1}`).join(", ")});`, chunk);
  }
}

function parseRow<T>(row: BookRow): T | null {
  try {
    return JSON.parse(row.data) as T;
  } catch {
    return null;
  }
}

/**
 * One chapter rebuilt from its rows. Items come with usable answers (see normalizeItemAnswers); the items the
 * learner hid are not flagged here: that set changes without the book being reloaded (getHiddenItemsSet).
 */
function buildChapter(chapterRow: BookRow, lessonRows: BookRow[], setRows: BookRow[], itemRows: BookRow[]): GrammarBookFile {
  const chapterId = chapterRow.chapter_id;
  const meta = parseRow<ChapterMetaRow>(chapterRow) ?? {};
  const lessons = lessonRows.map((r) => parseRow<GrammarBookLesson>(r)).filter(notNull);
  const exerciseSets = setRows
    .map((r) => parseRow<GrammarBookExerciseSet>(r))
    .filter(notNull)
    .map((s) => ({ ...s, example: exampleOf(s.example) }));
  const groups = new Map<string, GrammarBookPracticeGroup>();
  for (const r of itemRows) {
    const it = parseRow<StoredItem>(r);
    if (!it) continue;
    const { groupId, groupTitle, groupLessonIds, hidden: _hidden, ...item } = it;
    const id = groupId || `${chapterId}-g00`;
    let group = groups.get(id);
    if (!group) {
      group = { id, lessonIds: groupLessonIds || item.lessonIds || [], title: groupTitle || "", items: [] };
      groups.set(id, group);
    }
    group.items.push(normalizeItemAnswers(item));
  }
  const known = meta.chapter || getChapterMetadata(chapterId);
  return {
    format: "myenglish-grammar-book",
    version: 2,
    chapterId,
    parts: meta.parts,
    importedParts: Array.isArray(meta.importedParts) ? meta.importedParts : [],
    chapter: known ? { ...known, order: chapterOrderFromId(chapterId) } : undefined,
    lessons: lessons.sort((a, b) => a.order - b.order),
    chapterNotes: meta.chapterNotes || [],
    exerciseSets,
    practiceGroups: Array.from(groups.values()),
    fixes: meta.fixes || [],
    stats: meta.stats,
  };
}

async function readStoredChapter(db: BookDb, chapterId: string): Promise<GrammarBookFile | null> {
  const [chapterRows, lessonRows, setRows, itemRows] = await Promise.all(
    BOOK_TABLES.map((t) => db.select<BookRow[]>(`SELECT id, chapter_id, ord, data FROM ${t} WHERE chapter_id = $1 ORDER BY ord ASC;`, [chapterId]))
  );
  return chapterRows.length > 0 ? buildChapter(chapterRows[0], lessonRows, setRows, itemRows) : null;
}

export interface SaveChapterOptions {
  /** Leave out the AI additions (translations, distractors, explanations) of the new data */
  stripAi?: boolean;
  /** "merge" (default) adds to what is already imported; "replace" drops the chapter's old content */
  mode?: GrammarBookImportMode;
}

async function writeChapter(db: BookDb, incoming: GrammarBookFile, options: SaveChapterOptions): Promise<GrammarBookFile> {
  const chapterId = incoming.chapterId;
  // Items regrouped by their lessons first (lessonIds may come from "ai"), then the AI part dropped if asked
  let own = mergeChapterParts([incoming]).get(chapterId)!;
  if (options.stripAi) own = { ...own, practiceGroups: own.practiceGroups!.map((g) => ({ ...g, items: g.items.map(stripAiFromItem) })) };
  const stored = options.mode === "replace" ? null : await readStoredChapter(db, chapterId);
  const chapter = stored ? mergeChapterParts([stored, own], { overwrite: true }).get(chapterId)! : own;

  const ord = chapterOrderFromId(chapterId);
  const known = chapter.chapter ?? getChapterMetadata(chapterId);
  chapter.chapter = known ? { ...known, order: ord } : undefined;

  const chapterRow: InsertRow = [
    chapterId,
    chapterId,
    ord,
    JSON.stringify({
      chapter: chapter.chapter,
      chapterNotes: chapter.chapterNotes || [],
      fixes: chapter.fixes || [],
      stats: chapter.stats,
      parts: chapter.parts,
      importedParts: chapter.importedParts || [],
    } satisfies ChapterMetaRow),
  ];
  const lessonRows = (chapter.lessons || []).map((l): InsertRow => [l.id, chapterId, l.order, JSON.stringify(l)]);
  const setRows = (chapter.exerciseSets || []).map((s, i): InsertRow => {
    const { items: _items, ...meta } = s;
    return [s.id, chapterId, i + 1, JSON.stringify(meta)];
  });
  let itemOrd = 0;
  const itemRows = (chapter.practiceGroups || []).flatMap((g) =>
    g.items.map((it): InsertRow => {
      const { hidden: _hidden, ...item } = it;
      return [
        `${chapterId}:${bookItemKey(item)}`,
        chapterId,
        ++itemOrd,
        JSON.stringify({ ...item, groupId: g.id, groupTitle: g.title, groupLessonIds: g.lessonIds }),
      ];
    })
  );

  // New rows are written first and the chapter's unused rows deleted afterwards: a failure half-way never
  // loses what was imported before
  const before = await Promise.all(BOOK_TABLES.map((t) => db.select<Array<{ id: string }>>(`SELECT id FROM ${t} WHERE chapter_id = $1;`, [chapterId])));
  // Replacing the chapter keeps the learner's own AI exercises (their rows carry "importBatchId"): their
  // import history still lists them and can undo them
  const custom = new Set<string>();
  if (options.mode === "replace") {
    for (const t of ["grammar_book_sets", "grammar_book_items"]) {
      const kept = await db.select<Array<{ id: string }>>(`SELECT id FROM ${t} WHERE chapter_id = $1 AND data LIKE '%"importBatchId"%';`, [chapterId]);
      for (const r of kept) custom.add(r.id);
    }
  }
  const rows = [[chapterRow], lessonRows, setRows, itemRows];
  for (let t = 0; t < BOOK_TABLES.length; t++) await insertRows(db, BOOK_TABLES[t], rows[t]);
  for (let t = 0; t < BOOK_TABLES.length; t++) {
    const keep = new Set(rows[t].map((r) => r[0]));
    await deleteRows(db, BOOK_TABLES[t], before[t].map((r) => r.id).filter((id) => !keep.has(id) && !custom.has(id)));
  }
  return chapter;
}

/**
 * Drop the cached book and tell the screens once (each event makes the Hub reload the whole book). Other
 * windows (the review popup is never destroyed) hear about it through the book revision in localStorage.
 */
export function notifyBookUpdated(chapterIds: string[]): void {
  clearBookCache();
  try {
    localStorage.setItem(BOOK_REVISION_KEY, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  } catch {}
  window.dispatchEvent(new CustomEvent("myenglish-grammar-updated", { detail: { book: true, chapterIds } }));
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Save one chapter: merged with what is already imported by default (the same lesson, set or item is
 * replaced by the new one, the rest kept), or replacing the chapter's old content with mode "replace".
 * Progress, accepted answers and hidden items are keyed by id and always kept. Returns the chapter as saved.
 */
export async function saveGrammarBookChapter(chapter: GrammarBookFile, options: SaveChapterOptions = {}): Promise<GrammarBookFile> {
  const db = await bookDatabase();
  try {
    return await writeChapter(db, chapter, options);
  } finally {
    notifyBookUpdated([chapter.chapterId]);
  }
}

export interface GrammarBookImportResult {
  /** Each chapter as saved (after merging with the stored one) */
  saved: GrammarBookFile[];
  failed: Array<{ chapterId: string; message: string }>;
}

/** Save several chapters (see saveGrammarBookChapter) with a single update event at the end */
export async function importGrammarBookChapters(
  chapters: Iterable<GrammarBookFile>,
  options: SaveChapterOptions = {}
): Promise<GrammarBookImportResult> {
  const list = Array.from(chapters);
  const result: GrammarBookImportResult = { saved: [], failed: [] };
  if (list.length === 0) return result;
  let db: BookDb;
  try {
    db = await bookDatabase();
  } catch (err) {
    result.failed = list.map((c) => ({ chapterId: c.chapterId, message: errorText(err) }));
    return result;
  }
  for (const chapter of list) {
    try {
      result.saved.push(await writeChapter(db, chapter, options));
    } catch (err) {
      result.failed.push({ chapterId: chapter.chapterId, message: errorText(err) });
    }
  }
  notifyBookUpdated(list.map((c) => c.chapterId));
  return result;
}

/** Delete every imported chapter (the learner's progress is kept) */
export async function clearGrammarBook(): Promise<void> {
  const db = await bookDatabase();
  for (const table of BOOK_TABLES) {
    await db.execute(`DELETE FROM ${table};`);
  }
  // The AI exercises went with the book: their history must not offer to undo what is no longer there
  await db.execute(`UPDATE grammar_exercise_imports SET status = 'reverted' WHERE status != 'reverted';`).catch(() => {});
  notifyBookUpdated([]);
}

let bookSeeding: Promise<void> | null = null;

/** app_kv flag: this database has had a book (seeded or imported). Not a localStorage key (not mirrored). */
const BOOK_SEEDED_KEY = "grammar_book_seeded_v1";

/**
 * Seed all 31 chapters into SQLite from the bundled grammarCatalog.json, once per database: a book the
 * learner cleared stays cleared (it used to be re-imported, 1.1 MB, at the next start).
 * `reseed`: seed even if it was done before (app reset, release wipe), when the database has 0 chapters.
 * Safe to call concurrently: multiple calls share a single operation.
 */
export function ensureGrammarBookSeeded({ reseed = false }: { reseed?: boolean } = {}): Promise<void> {
  bookSeeding ??= seedGrammarBook(reseed).finally(() => {
    bookSeeding = null;
  });
  return bookSeeding;
}

async function markBookSeeded(db: BookDb): Promise<void> {
  await db
    .execute(`INSERT OR REPLACE INTO app_kv (key, value) VALUES ('${BOOK_SEEDED_KEY}', '1');`)
    .catch(() => {});
}

async function seedGrammarBook(reseed: boolean): Promise<void> {
  try {
    const db = await bookDatabase();
    const rows = await db.select<Array<{ count: number }>>("SELECT count(*) as count FROM grammar_book_chapters;");
    if (rows[0] && rows[0].count > 0) {
      await markBookSeeded(db);
      return;
    }
    if (!reseed) {
      const seeded = await db
        .select<Array<{ value: string }>>(`SELECT value FROM app_kv WHERE key = '${BOOK_SEEDED_KEY}';`)
        .catch(() => []);
      if (seeded.length > 0) return;
    }

    const catalog = await import("@/data/grammarCatalog.json").then(
      (m) => m.default as unknown as { version: number; files: GrammarBookFile[] }
    );
    if (!catalog?.files || catalog.files.length === 0) return;

    const merged = mergeChapterParts(catalog.files);
    let written = 0;
    for (const chapter of merged.values()) {
      try {
        await writeChapter(db, chapter, { mode: "replace" });
        written++;
      } catch (err) {
        console.warn(`Failed to seed grammar chapter ${chapter.chapterId}:`, err);
      }
    }
    if (written > 0) await markBookSeeded(db);
    notifyBookUpdated(Array.from(merged.keys()));
  } catch (err) {
    console.warn("Failed to seed grammar book:", err);
  }
}

let cachedChapters: GrammarBookFile[] | null = null;
let loading: Promise<GrammarBookFile[]> | null = null;
/** Bumped by clearBookCache: a load started before it neither fills the cache nor is handed out */
let cacheGeneration = 0;
/** Lesson ids in book order, kept for synchronous callers (stats, due counts) once the book is loaded */
let knownLessonIds: string[] = [];

export function getKnownLessonIds(): string[] {
  return knownLessonIds;
}

export async function getAllBookChapters(): Promise<GrammarBookFile[]> {
  for (;;) {
    if (cachedChapters) return cachedChapters;
    const generation = cacheGeneration;
    let current = loading;
    if (!current) {
      const started = loadChapters(generation);
      const settle = () => {
        if (loading === started) loading = null;
      };
      started.then(settle, settle);
      loading = current = started;
    }
    const result = await current;
    // The book changed while it was loading: load again
    if (generation === cacheGeneration) return result;
  }
}

/** Why the last book load failed (null after a successful load): lets the Hub tell an error from no book */
let lastLoadError: string | null = null;
export function getBookLoadError(): string | null {
  return lastLoadError;
}

async function loadChapters(generation: number): Promise<GrammarBookFile[]> {
  const result: GrammarBookFile[] = [];
  try {
    const db = await bookDatabase();
    let [chapterRows, lessonRows, setRows, itemRows] = await Promise.all(
      BOOK_TABLES.map((t) => db.select<BookRow[]>(`SELECT id, chapter_id, ord, data FROM ${t} ORDER BY ord ASC;`))
    );
    if (chapterRows.length === 0 && process.env.NODE_ENV !== "test") {
      await ensureGrammarBookSeeded();
      [chapterRows, lessonRows, setRows, itemRows] = await Promise.all(
        BOOK_TABLES.map((t) => db.select<BookRow[]>(`SELECT id, chapter_id, ord, data FROM ${t} ORDER BY ord ASC;`))
      );
    }
    const byChapter = (rows: BookRow[]) => {
      const map = new Map<string, BookRow[]>();
      for (const r of rows) {
        const list = map.get(r.chapter_id);
        if (list) list.push(r);
        else map.set(r.chapter_id, [r]);
      }
      return map;
    };
    const lessons = byChapter(lessonRows);
    const sets = byChapter(setRows);
    const items = byChapter(itemRows);
    for (const chRow of chapterRows) {
      const id = chRow.chapter_id;
      result.push(buildChapter(chRow, lessons.get(id) ?? [], sets.get(id) ?? [], items.get(id) ?? []));
    }
  } catch (err) {
    // Not cached: the next call tries again
    console.warn("Failed to load the grammar book:", err);
    lastLoadError = err instanceof Error ? err.message : String(err);
    return result;
  }
  lastLoadError = null;
  result.sort((a, b) => (a.chapter?.order ?? 99) - (b.chapter?.order ?? 99) || a.chapterId.localeCompare(b.chapterId));
  if (generation === cacheGeneration) {
    cachedChapters = result;
    knownLessonIds = result.flatMap((c) => (c.lessons || []).map((l) => l.id));
  }
  return result;
}

export async function getBookChapter(chapterId: string): Promise<GrammarBookFile | null> {
  return (await getAllBookChapters()).find((c) => c.chapterId === chapterId) || null;
}

export async function getAllBookLessons(): Promise<GrammarBookLesson[]> {
  return (await getAllBookChapters()).flatMap((ch) => ch.lessons || []);
}

export async function getBookLesson(lessonId: string): Promise<GrammarBookLesson | null> {
  return (await getAllBookLessons()).find((l) => l.id === lessonId) || null;
}

export async function getAllPracticeGroups(): Promise<GrammarBookPracticeGroup[]> {
  return (await getAllBookChapters()).flatMap((ch) => ch.practiceGroups || []);
}

export async function getAllExerciseSets(): Promise<GrammarBookExerciseSet[]> {
  return (await getAllBookChapters()).flatMap((ch) => ch.exerciseSets || []);
}

/** Forget the loaded book; a load already running is discarded */
export function clearBookCache(): void {
  cacheGeneration++;
  cachedChapters = null;
  loading = null;
}

/** Another window changed the book (import, replace, undo, reset): forget this window's copy and let the screens reload */
function onBookRevision(e: Event): void {
  if ((e as StorageEvent).key !== BOOK_REVISION_KEY) return;
  clearBookCache();
  knownLessonIds = [];
  window.dispatchEvent(new CustomEvent("myenglish-grammar-updated", { detail: { book: true, chapterIds: [] } }));
}

// A reloaded module (hot reload) replaces the previous listener
const REVISION_LISTENER = "__myenglishBookRevisionListener";
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  const holder = window as unknown as Record<string, EventListener | undefined>;
  const previous = holder[REVISION_LISTENER];
  if (previous) window.removeEventListener("storage", previous);
  holder[REVISION_LISTENER] = onBookRevision;
  window.addEventListener("storage", onBookRevision);
}

/**
 * Answers the learner accepted with "Tính là đúng": item key → answers; for a blank other than the first the
 * entry is prefixed with "<index>::".
 */
let acceptedCache: { raw: string; map: Record<string, string[]> } | null = null;

/** Parsed again only when the stored text changed (any window): the returned map is shared, never change it */
export function getAcceptedAnswersMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(ACCEPTED_ANSWERS_KEY);
    if (raw) {
      if (acceptedCache?.raw !== raw) acceptedCache = { raw, map: JSON.parse(raw) || {} };
      return acceptedCache.map;
    }
  } catch {}
  return {};
}

/** Changes whenever an accepted answer is added or removed, in any window */
export function getAcceptedAnswersRevision(): string {
  try {
    return localStorage.getItem(ACCEPTED_ANSWERS_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveAcceptedAnswersMap(map: Record<string, string[]>): void {
  try {
    localStorage.setItem(ACCEPTED_ANSWERS_KEY, JSON.stringify(map));
    persistKeyNow(ACCEPTED_ANSWERS_KEY);
  } catch {}
}

const acceptedEntry = (answer: string, blankIndex: number) => (blankIndex === 0 ? answer.trim() : `${blankIndex}::${answer.trim()}`);

export function getUserAcceptedAnswers(itemKey: string, blankIndex: number = 0): string[] {
  const list = getAcceptedAnswersMap()[itemKey] || [];
  if (blankIndex === 0) return list.filter((a) => !/^\d+::/.test(a));
  const prefix = `${blankIndex}::`;
  return list.filter((a) => a.startsWith(prefix)).map((a) => a.slice(prefix.length));
}

/** Every accepted answer, for a screen where the learner reviews and removes them */
export function listUserAcceptedAnswers(): Array<{ itemKey: string; blankIndex: number; answer: string }> {
  return Object.entries(getAcceptedAnswersMap()).flatMap(([itemKey, list]) =>
    (Array.isArray(list) ? list : []).map((entry) => {
      const match = /^(\d+)::(.*)$/s.exec(entry);
      return match ? { itemKey, blankIndex: parseInt(match[1], 10), answer: match[2] } : { itemKey, blankIndex: 0, answer: entry };
    })
  );
}

export function saveUserAcceptedAnswer(itemKey: string, answer: string, blankIndex: number = 0): void {
  if (!answer.trim()) return;
  const entry = acceptedEntry(answer, blankIndex);
  const map = { ...getAcceptedAnswersMap() };
  const list = map[itemKey] || [];
  if (list.includes(entry)) return;
  map[itemKey] = [...list, entry];
  saveAcceptedAnswersMap(map);
}

export function removeUserAcceptedAnswer(itemKey: string, answer: string, blankIndex: number = 0): void {
  const entry = acceptedEntry(answer, blankIndex);
  const map = { ...getAcceptedAnswersMap() };
  const list = map[itemKey];
  if (!list || !list.includes(entry)) return;
  const rest = list.filter((a) => a !== entry);
  if (rest.length > 0) map[itemKey] = rest;
  else delete map[itemKey];
  saveAcceptedAnswersMap(map);
}

export function getHiddenItemsSet(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_ITEMS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.map(String));
    }
  } catch {}
  return new Set();
}

export function getHiddenItemKeys(): string[] {
  return [...getHiddenItemsSet()];
}

/** Changes whenever an item is hidden or shown, in any window (the session index is rebuilt when it does) */
export function getHiddenItemsRevision(): string {
  try {
    return localStorage.getItem(HIDDEN_ITEMS_KEY) ?? "";
  } catch {
    return "";
  }
}

// The hidden set is read fresh by whoever needs it (see loadBookIndex): the loaded book stays as it is
function saveHiddenItems(set: Set<string>): void {
  try {
    localStorage.setItem(HIDDEN_ITEMS_KEY, JSON.stringify([...set]));
    persistKeyNow(HIDDEN_ITEMS_KEY);
  } catch {}
}

export function hideItem(itemKey: string): void {
  const set = getHiddenItemsSet();
  set.add(itemKey);
  saveHiddenItems(set);
}

export function unhideItem(itemKey: string): void {
  const set = getHiddenItemsSet();
  if (!set.delete(itemKey)) return;
  saveHiddenItems(set);
}

/** Older builds kept a copy of every chapter in localStorage (and its app_kv mirror): too big, now dropped */
export async function dropLegacyChapterCopies(): Promise<void> {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("myenglish_grammar_book_ch")) localStorage.removeItem(k);
    }
    const db = await getDatabase();
    await db.execute(`DELETE FROM app_kv WHERE key LIKE 'myenglish_grammar_book_ch%';`);
  } catch {}
}
