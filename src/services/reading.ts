/**
 * Reading mode: the learner pastes real text (docs, a PR, an email) and sees which words are already
 * theirs, which they are learning, and which unfamiliar ones are worth adding, with the sentence they
 * appear in as context. Meeting a learning word in real text is logged as an "encounter" (never graded:
 * it is exposure, not retrieval).
 */
import type { WordDetail } from "@/types/database";
import { COMMON_WORDS } from "@/data/commonWords";
import { wordForms, wordFormsPattern } from "./smartReview";
import { logLearningEvent } from "./learningEvents";
import { MASTERED_STABILITY_DAYS } from "./progress";

export type BankStatus = "mastered" | "learning" | "new";

export type TokenClass =
  | { kind: "bank"; word: WordDetail; status: BankStatus }
  | { kind: "common" }
  /** Not in the word bank and not a very common word: possibly worth learning */
  | { kind: "candidate"; base: string };

export interface ReadingSegment {
  text: string;
  /** null = text between words (spaces, punctuation, numbers, code) */
  token: (TokenClass & { sentence: string }) | null;
}

export interface BankHit {
  word: WordDetail;
  status: BankStatus;
  count: number;
  /** First sentence the word appears in */
  sentence: string;
}

export interface Candidate {
  base: string;
  count: number;
  sentence: string;
}

export interface ReadingAnalysis {
  segments: ReadingSegment[];
  bankHits: BankHit[];
  candidates: Candidate[];
  totalWords: number;
}

export function bankStatus(word: WordDetail): BankStatus {
  const srs = word.srs;
  if ((srs?.state ?? 0) === 2 && (srs?.stability ?? 0) >= MASTERED_STABILITY_DAYS) return "mastered";
  return (srs?.reps ?? 0) > 0 ? "learning" : "new";
}

/** Possible base forms of an inflected token ("deployed" -> deploy, deploye; "queries" -> query) */
export function baseCandidates(token: string): string[] {
  const t = token.toLowerCase();
  const out = new Set<string>([t]);
  const add = (x: string) => x.length >= 2 && out.add(x);
  if (t.endsWith("ies")) add(t.slice(0, -3) + "y");
  if (t.endsWith("ied")) add(t.slice(0, -3) + "y");
  if (t.endsWith("es")) add(t.slice(0, -2));
  if (t.endsWith("s") && !t.endsWith("ss")) add(t.slice(0, -1));
  if (t.endsWith("ed")) {
    add(t.slice(0, -2));
    add(t.slice(0, -1));
    if (/(.)\1ed$/.test(t)) add(t.slice(0, -3));
  }
  if (t.endsWith("ing")) {
    add(t.slice(0, -3));
    add(t.slice(0, -3) + "e");
    if (/(.)\1ing$/.test(t)) add(t.slice(0, -4));
  }
  // Comparatives and adverbs of common adjectives: longer, easiest, easier, quickly
  for (const suffix of ["er", "est"]) {
    if (!t.endsWith(suffix)) continue;
    const stem = t.slice(0, -suffix.length);
    add(stem);
    add(stem + "e");
    if (stem.endsWith("i")) add(stem.slice(0, -1) + "y");
    if (/(.)\1$/.test(stem)) add(stem.slice(0, -1));
  }
  if (t.endsWith("ly")) {
    add(t.slice(0, -2));
    if (t.endsWith("ily")) add(t.slice(0, -3) + "y");
  }
  return [...out];
}

/** The form to add to the word bank: plural nouns are singularised, other forms are kept as written */
export function suggestedBase(token: string): string {
  const t = token.toLowerCase();
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 3 && t.endsWith("s") && !/(ss|us|is|ous)$/.test(t)) return t.slice(0, -1);
  return t;
}

function isCommon(token: string, known: ReadonlySet<string>): boolean {
  return baseCandidates(token).some((b) => known.has(b));
}

/** Acronyms (API, JSON), camelCase / snake_case identifiers and very short tokens are not vocabulary */
function looksLikeVocabulary(raw: string): boolean {
  if (raw.length < 3) return false;
  if (/^[A-Z0-9]+$/.test(raw) && raw.length <= 6) return false;
  if (/[a-z][A-Z]/.test(raw)) return false;
  return /^[A-Za-z][A-Za-z'’-]*$/.test(raw);
}

/** Sentence spans: split on . ! ? and line breaks */
function sentenceSpans(text: string): Array<{ start: number; end: number; text: string }> {
  const spans: Array<{ start: number; end: number; text: string }> = [];
  const re = /[^.!?\n]+[.!?]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const trimmed = m[0].trim();
    if (trimmed) spans.push({ start: m.index, end: m.index + m[0].length, text: trimmed });
  }
  return spans;
}

const TOKEN_RE = /[A-Za-z][A-Za-z0-9'’-]*[A-Za-z0-9]|[A-Za-z]/g;

/**
 * `knownCommon`: words treated as already known when they are not in the bank. Default: the ~900 very
 * common words; a beginner (foundation mode) passes FUNCTION_WORDS so everyday words are suggested too.
 */
export function analyzeText(
  text: string,
  words: WordDetail[],
  knownCommon: ReadonlySet<string> = COMMON_WORDS
): ReadingAnalysis {
  // Single words: every inflected form -> the bank word
  const formIndex = new Map<string, WordDetail>();
  const phrases: WordDetail[] = [];
  for (const w of words) {
    const key = w.word.trim().toLowerCase();
    if (!key) continue;
    if (/\s/.test(key)) {
      phrases.push(w);
      continue;
    }
    for (const f of wordForms(key)) if (!formIndex.has(f)) formIndex.set(f, w);
  }

  const sentences = sentenceSpans(text);
  const sentenceAt = (pos: number) => sentences.find((s) => pos >= s.start && pos < s.end)?.text ?? "";

  // Phrases of the bank ("follow up", "edge case") first; their words are not looked up again
  type Span = { start: number; end: number; cls: TokenClass };
  const spans: Span[] = [];
  const covered = (start: number, end: number) => spans.some((s) => start < s.end && end > s.start);
  for (const p of phrases.sort((a, b) => b.word.length - a.word.length)) {
    const re = new RegExp(wordFormsPattern(p.word.trim()), "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (!covered(m.index, m.index + m[0].length)) {
        spans.push({ start: m.index, end: m.index + m[0].length, cls: { kind: "bank", word: p, status: bankStatus(p) } });
      }
    }
  }

  let totalWords = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text))) {
    const start = m.index;
    const end = start + m[0].length;
    totalWords++;
    if (covered(start, end)) continue;
    const raw = m[0].replace(/['’]s$/i, "");
    const lower = raw.toLowerCase();
    const bank = formIndex.get(lower);
    let cls: TokenClass;
    if (bank) cls = { kind: "bank", word: bank, status: bankStatus(bank) };
    else if (/['’]/.test(raw) || !looksLikeVocabulary(raw) || isCommon(lower, knownCommon)) cls = { kind: "common" };
    else if (lower.includes("-") && lower.split("-").every((part) => !part || isCommon(part, knownCommon))) cls = { kind: "common" };
    else cls = { kind: "candidate", base: suggestedBase(lower) };
    spans.push({ start, end, cls });
  }
  spans.sort((a, b) => a.start - b.start);

  const segments: ReadingSegment[] = [];
  const hits = new Map<string, BankHit>();
  const cands = new Map<string, Candidate>();
  let pos = 0;
  for (const s of spans) {
    if (s.start > pos) segments.push({ text: text.slice(pos, s.start), token: null });
    const sentence = sentenceAt(s.start);
    segments.push({ text: text.slice(s.start, s.end), token: { ...s.cls, sentence } });
    if (s.cls.kind === "bank") {
      const hit = hits.get(s.cls.word.id);
      if (hit) hit.count++;
      else hits.set(s.cls.word.id, { word: s.cls.word, status: s.cls.status, count: 1, sentence });
    } else if (s.cls.kind === "candidate") {
      const c = cands.get(s.cls.base);
      if (c) c.count++;
      else cands.set(s.cls.base, { base: s.cls.base, count: 1, sentence });
    }
    pos = s.end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), token: null });

  const statusOrder: Record<BankStatus, number> = { learning: 0, new: 1, mastered: 2 };
  return {
    segments,
    bankHits: [...hits.values()].sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.count - a.count),
    candidates: [...cands.values()].sort((a, b) => b.count - a.count || a.base.localeCompare(b.base)),
    totalWords,
  };
}

/** Meeting words being learned in real text: logged as exposure, once per word per reading */
export function logEncounters(hits: BankHit[]): number {
  const studied = hits.filter((h) => h.status !== "new");
  for (const h of studied) {
    logLearningEvent("encounter", { wordId: h.word.id, meta: { source: "reading", status: h.status } });
  }
  return studied.length;
}
