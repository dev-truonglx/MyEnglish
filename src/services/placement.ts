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
