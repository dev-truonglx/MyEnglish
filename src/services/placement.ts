/**
 * Quick placement test: 5 vocabulary questions per CEFR level (A1–C1), easiest first. A new learner who
 * already knows English starts at their real level instead of being treated as A1 until they have
 * learned 40 A1 words. Pure data + scoring; the UI is PlacementTest.tsx.
 */
import type { GrammarLevel } from "@/types/grammar";

export interface PlacementItem {
  word: string;
  meaning: string;
}

export const PLACEMENT_LEVELS: GrammarLevel[] = ["A1", "A2", "B1", "B2", "C1"];

export const PLACEMENT_BANK: Record<GrammarLevel, PlacementItem[]> = {
  A1: [
    { word: "water", meaning: "nước" },
    { word: "family", meaning: "gia đình" },
    { word: "morning", meaning: "buổi sáng" },
    { word: "cheap", meaning: "rẻ" },
    { word: "open", meaning: "mở" },
  ],
  A2: [
    { word: "borrow", meaning: "mượn" },
    { word: "journey", meaning: "chuyến đi" },
    { word: "polite", meaning: "lịch sự" },
    { word: "receipt", meaning: "hóa đơn, biên lai" },
    { word: "careful", meaning: "cẩn thận" },
  ],
  B1: [
    { word: "efficient", meaning: "hiệu quả" },
    { word: "reliable", meaning: "đáng tin cậy" },
    { word: "improve", meaning: "cải thiện" },
    { word: "require", meaning: "đòi hỏi, yêu cầu" },
    { word: "deadline", meaning: "hạn chót" },
  ],
  B2: [
    { word: "feasible", meaning: "khả thi" },
    { word: "mitigate", meaning: "giảm thiểu" },
    { word: "thorough", meaning: "kỹ lưỡng" },
    { word: "allocate", meaning: "phân bổ" },
    { word: "consistent", meaning: "nhất quán" },
  ],
  C1: [
    { word: "meticulous", meaning: "tỉ mỉ" },
    { word: "cumbersome", meaning: "cồng kềnh, rườm rà" },
    { word: "ubiquitous", meaning: "có mặt khắp nơi" },
    { word: "alleviate", meaning: "làm dịu bớt" },
    { word: "scrutinize", meaning: "xem xét kỹ" },
  ],
};

/** Correct answers out of 5 needed to pass a level ("I don't know" counts as wrong) */
export const PLACEMENT_PASS = 4;

export interface PlacementQuestion {
  level: GrammarLevel;
  word: string;
  options: string[]; // 4 meanings from the same level, shuffled
  answer: string;
}

export function buildPlacementQuestions(random: () => number = Math.random): PlacementQuestion[] {
  const shuffle = <T,>(xs: T[]) => [...xs].map((x) => [random(), x] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  return PLACEMENT_LEVELS.flatMap((level) => {
    const items = PLACEMENT_BANK[level];
    return items.map((item) => {
      const distractors = shuffle(items.filter((i) => i.word !== item.word)).slice(0, 3).map((i) => i.meaning);
      return { level, word: item.word, options: shuffle([item.meaning, ...distractors]), answer: item.meaning };
    });
  });
}

/**
 * The level to study at: the first level not passed (levels are passed in order). Passing everything
 * places at C1, the highest level the app's content covers.
 */
export function placementLevel(correctByLevel: Partial<Record<GrammarLevel, number>>): GrammarLevel {
  for (const level of PLACEMENT_LEVELS) {
    if ((correctByLevel[level] ?? 0) < PLACEMENT_PASS) return level;
  }
  return "C1";
}

// ─── Adaptive placement: vocabulary + grammar + listening ────────────────────

/** "A0" = absolute beginner ("mất gốc"): below A1 */
export type PlacementBlockLevel = "A0" | GrammarLevel;
export type PlacementKind = "vocab" | "grammar" | "listening";

export interface AdaptiveQuestion {
  level: PlacementBlockLevel;
  kind: PlacementKind;
  /** What is shown: the English word (vocab), the sentence with "_____" (grammar); empty for listening */
  prompt: string;
  /** Listening only: what the text-to-speech says */
  say?: string;
  question: string;
  options: string[];
  answer: string;
}

/** Correct answers out of a 3-question block needed to pass that level */
export const BLOCK_PASS = 2;
/** The first block: most people who start the app are around A2; one step up or down from there */
export const START_LEVEL: PlacementBlockLevel = "A2";

function shuffled<T>(xs: T[], random: () => number): T[] {
  return [...xs].map((x) => [random(), x] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
}

/** One block of the adaptive test: a word, a grammar gap and a listening item of that level (A0: 3 words) */
export function buildPlacementBlock(
  level: PlacementBlockLevel,
  bank: { grammar: Record<GrammarLevel, PlacementGrammarItemLike[]>; listening: Record<GrammarLevel, PlacementListeningItemLike[]>; a0: PlacementItem[] },
  random: () => number = Math.random
): AdaptiveQuestion[] {
  const vocabQuestion = (items: PlacementItem[], item: PlacementItem): AdaptiveQuestion => ({
    level,
    kind: "vocab",
    prompt: item.word,
    question: "Từ này nghĩa là gì?",
    options: shuffled([item.meaning, ...shuffled(items.filter((i) => i.word !== item.word), random).slice(0, 3).map((i) => i.meaning)], random),
    answer: item.meaning,
  });
  if (level === "A0") {
    return shuffled(bank.a0, random).slice(0, 3).map((item) => vocabQuestion(bank.a0, item));
  }
  const words = PLACEMENT_BANK[level];
  const g = shuffled(bank.grammar[level], random)[0];
  const l = shuffled(bank.listening[level], random)[0];
  const out: AdaptiveQuestion[] = [vocabQuestion(words, shuffled(words, random)[0])];
  if (g) out.push({ level, kind: "grammar", prompt: g.sentence, question: "Chọn từ đúng cho chỗ trống", options: shuffled(g.options, random), answer: g.answer });
  if (l) out.push({ level, kind: "listening", prompt: "", say: l.say, question: l.question, options: shuffled(l.options, random), answer: l.answer });
  return out;
}

/** Structural types of the item bank (src/data/placementBank.ts), so this module stays data-free */
export interface PlacementGrammarItemLike {
  sentence: string;
  options: string[];
  answer: string;
}
export interface PlacementListeningItemLike {
  say: string;
  question: string;
  options: string[];
  answer: string;
}

/**
 * After a block: the next block to take, or the result (the level to study at = the first level not
 * passed). Starts at A2 and moves one level at a time:
 *  - passed: one level up (C1 passed -> C1); passed A1 after failing A2 -> A2; passed A0 -> A1
 *  - failed: above A2 -> that level; A2 -> try A1; A1 -> try A0; A0 -> "A0" (mất gốc)
 */
export function placementStep(
  level: PlacementBlockLevel,
  passed: boolean
): { next: PlacementBlockLevel } | { result: PlacementBlockLevel } {
  const order: PlacementBlockLevel[] = ["A0", "A1", "A2", "B1", "B2", "C1"];
  const i = order.indexOf(level);
  if (passed) {
    if (level === "A0") return { result: "A1" };
    if (level === "A1") return { result: "A2" };
    if (level === "C1") return { result: "C1" };
    return { next: order[i + 1] };
  }
  if (level === "A2") return { next: "A1" };
  if (level === "A1") return { next: "A0" };
  return { result: level };
}
