export interface SentenceBreakdown {
  sentence_en: string;
  meaning_vn: string;
  structure: string;
  why_used: string;
}

export interface TermWithMeaning {
  word: string;
  phonetic?: string | null;
  meaning_vn: string;
  examples?: SentenceBreakdown[];
}

export interface Word {
  id: string;
  word: string;
  phonetic?: string | null;
  part_of_speech?: string | null;
  meaning_vn: string;
  image_url: string | null;
  synonyms: string; // JSON array string of TermWithMeaning[] or string[]
  antonyms: string; // JSON array string of TermWithMeaning[] or string[]
  collocations?: string | null; // JSON array string of string[]
  code_snippet?: string | null;
  topic?: string | null;
  cefr_level?: string | null; // CEFR level of the term (A1..C2), null for words added before tagging
  created_at: string;
}

export interface WordExample {
  id: string;
  word_id: string;
  sentence_en: string;
  sentence_vn?: string;
  grammar_analysis: string;
}

export type FSRSState = 0 | 1 | 2 | 3; // 0: New, 1: Learning, 2: Review, 3: Relearning

export interface SRSReview {
  word_id: string;
  // Legacy SM-2 compatibility fields
  ease_factor: number; // default 2.5
  interval: number; // in days, default 0
  repetitions: number; // default 0
  next_review_date: string; // ISO timestamp

  // FSRS (DSR) Modern Fields
  stability?: number; // Days until R drops to requested retention (default 0)
  difficulty?: number; // Inherent difficulty 1 - 10 (default 0)
  elapsed_days?: number; // Days since last review (default 0)
  scheduled_days?: number; // Next interval in days (default 0)
  reps?: number; // Total repetition count
  lapses?: number; // Number of times forgotten
  state?: FSRSState; // 0: New, 1: Learning, 2: Review, 3: Relearning
  last_review?: string | null; // ISO timestamp of last review
  learning_steps?: number; // Current (re)learning step index, required by ts-fsrs v5 short-term scheduling
}

export interface WordDetail extends Word {
  examples: WordExample[];
  /** Recognition card (EN -> VN): flip, multiple choice, context match... */
  srs: SRSReview;
  /** Production card (recall the English word): spelling, cloze, dictation. Created once recognition graduates. */
  srsProduction?: SRSReview | null;
}

/**
 * Which memory a card trains. Each direction has its own FSRS schedule because recognising a word
 * among options is much easier than producing it from memory.
 */
export type CardDirection = "recognition" | "production";

/**
 * One reviewable card: the word with `srs` set to the schedule of `direction`.
 * Lets per-card logic (urgency, rating, interval previews) keep reading `card.srs`.
 */
export type ReviewCard = WordDetail & {
  direction: CardDirection;
  /** The word's recognition schedule (since `srs` holds the production schedule on production cards) */
  srsRecognition: SRSReview;
};

export interface CreateWordInput {
  word: string;
  phonetic?: string | null;
  part_of_speech?: string | null;
  meaning_vn: string;
  image_url?: string | null;
  synonyms: Array<string | TermWithMeaning>;
  antonyms: Array<string | TermWithMeaning>;
  collocations?: string[];
  code_snippet?: string | null;
  topic?: string | null;
  cefr_level?: string | null;
  examples: Array<{
    sentence_en: string;
    sentence_vn?: string;
    grammar_analysis: string;
  }>;
}

/**
 * Safely parse synonyms/antonyms JSON string into structured TermWithMeaning array.
 * Supports legacy strings, simple objects, and full objects with sentence breakdowns.
 */
export function parseTerms(raw: string | undefined | null): TermWithMeaning[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item === "string") {
          return { word: item, meaning_vn: "", examples: [] };
        }
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          const rawExamples = Array.isArray(obj.examples) ? obj.examples : [];
          const examples: SentenceBreakdown[] = rawExamples
            .map((ex) => {
              const e = (ex && typeof ex === "object" ? ex : {}) as Record<string, unknown>;
              return {
                sentence_en: String(e.sentence_en || ""),
                meaning_vn: String(e.meaning_vn || e.sentence_vn || ""),
                structure: String(e.structure || e.grammar_analysis || ""),
                why_used: String(e.why_used || ""),
              };
            })
            .filter((ex) => ex.sentence_en.trim().length > 0);

          return {
            word: String(obj.word || obj.term || ""),
            phonetic: obj.phonetic ? String(obj.phonetic) : null,
            meaning_vn: String(obj.meaning_vn || obj.meaning || ""),
            examples,
          };
        }
        return { word: String(item), meaning_vn: "", examples: [] };
      })
      .filter((t) => t.word.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * Safely parse collocations JSON string into an array of strings.
 */
export function parseCollocations(raw: string | undefined | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}


