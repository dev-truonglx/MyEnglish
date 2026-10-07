import { invoke } from "@tauri-apps/api/core";
import type { TermWithMeaning } from "@/types/database";
import type { GrammarExercise } from "@/types/grammar";
import { normalizeCefr, isWithinLevel, isOneLevelAbove, type CefrLevel } from "./cefr";
import { PREDEFINED_TOPICS } from "./db";

/** Map the model's topic onto the fixed topic list (avoids near-duplicate topics in the library) */
function normalizeTopic(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return PREDEFINED_TOPICS.find((t) => t.toLowerCase() === raw) ?? "General Tech";
}

const VALID_EXERCISE_TYPES: GrammarExercise["type"][] = [
  "multiple_choice",
  "conjugation",
  "error_spotting",
  "sentence_transform",
];

export interface EnrichedExample {
  sentence_en: string;
  sentence_vn?: string;
  grammar_analysis: string;
}

export interface GeminiEnrichmentResult {
  cefr?: CefrLevel | null; // CEFR level of the term itself
  phonetic?: string;
  part_of_speech?: string;
  topic?: string;
  meaning_vn: string;
  collocations?: string[];
  code_snippet?: string;
  synonyms: TermWithMeaning[];
  antonyms: TermWithMeaning[];
  examples: EnrichedExample[];
}

// Rust enforces 45s primary + up to 60s fallback; keep the JS limit above that so a late valid result isn't dropped
const AI_CALL_TIMEOUT_MS = 120000;

// Same rule as the Rust side: plain vocabulary terms only
const SAFE_WORD_RE = /^[\p{L}\p{N} \-'./+#&]+$/u;

export function isSafeVocabularyTerm(word: string): boolean {
  const w = word.trim();
  return w.length > 0 && w.length <= 64 && SAFE_WORD_RE.test(w) && /[\p{L}\p{N}]/u.test(w);
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} vượt quá thời gian chờ (${AI_CALL_TIMEOUT_MS / 1000}s). Vui lòng thử lại.`)),
      AI_CALL_TIMEOUT_MS
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function normalizeTerms(items: unknown): TermWithMeaning[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") {
        return { word: item, meaning_vn: "", examples: [] };
      }
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const rawExamples = Array.isArray(obj.examples) ? obj.examples : [];
        const examples = rawExamples
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
}

/**
 * Calls the Gemini CLI integration to analyze and enrich an English vocabulary word
 * with sentence examples and grammatical depth calibrated to user's CEFR level.
 */
export async function enrichWordWithGemini(
  word: string,
  level?: string
): Promise<GeminiEnrichmentResult> {
  const cleanWord = word.trim().toLowerCase();
  if (!cleanWord) {
    throw new Error("Word is empty");
  }

  try {
    const customPath = localStorage.getItem("myenglish_custom_cli_path") || undefined;
    const rawResult = await withTimeout(
      invoke<Record<string, unknown>>("enrich_word_with_gemini", {
        word: cleanWord,
        level,
        customPath,
      }),
      "Phân tích AI"
    );

    if (!rawResult || typeof rawResult !== "object" || typeof rawResult.meaning_vn !== "string" || !rawResult.meaning_vn.trim()) {
      throw new Error("AI trả về kết quả không hợp lệ (thiếu nghĩa tiếng Việt).");
    }

    const rawExamples = Array.isArray(rawResult.examples) ? rawResult.examples : [];
    const examples: EnrichedExample[] = rawExamples
      .map((ex) => {
        const e = (ex && typeof ex === "object" ? ex : {}) as Record<string, unknown>;
        return {
          sentence_en: String(e.sentence_en || "").trim(),
          sentence_vn: e.sentence_vn ? String(e.sentence_vn) : undefined,
          grammar_analysis: String(e.grammar_analysis || ""),
        };
      })
      .filter((ex) => ex.sentence_en.length > 0);

    const rawCollocations = Array.isArray(rawResult.collocations) ? rawResult.collocations : [];
    const collocations = rawCollocations
      .filter((c) => typeof c === "string" || typeof c === "number")
      .map((c) => String(c).trim())
      .filter((c) => c.length > 0);

    const topic = normalizeTopic(rawResult.topic);

    return {
      cefr: normalizeCefr(rawResult.cefr),
      phonetic: typeof rawResult.phonetic === "string" ? rawResult.phonetic : undefined,
      part_of_speech: typeof rawResult.part_of_speech === "string" ? rawResult.part_of_speech : undefined,
      topic,
      meaning_vn: rawResult.meaning_vn.trim(),
      collocations: collocations.length > 0 ? collocations : undefined,
      code_snippet: typeof rawResult.code_snippet === "string" ? rawResult.code_snippet : undefined,
      synonyms: normalizeTerms(rawResult.synonyms).filter((t) => isSafeVocabularyTerm(t.word)),
      antonyms: normalizeTerms(rawResult.antonyms).filter((t) => isSafeVocabularyTerm(t.word)),
      examples,
    };
  } catch (error) {
    console.error("Gemini enrichment failed:", error);
    throw error;
  }
}

/**
 * Generate 10 practical grammar test questions using Gemini CLI strictly calibrated to CEFR level
 */
export async function generateGrammarExercisesWithGemini(
  topic: string,
  level: string
): Promise<GrammarExercise[]> {
  try {
    const customPath = localStorage.getItem("myenglish_custom_cli_path") || undefined;
    const rawResult = await withTimeout(
      invoke<unknown>("generate_grammar_exercises_ai", {
        topic,
        level,
        customPath,
      }),
      "Sinh bài tập ngữ pháp AI"
    );

    const items: Array<Record<string, unknown>> = Array.isArray(rawResult)
      ? (rawResult as Array<Record<string, unknown>>)
      : rawResult && typeof rawResult === "object" && Array.isArray((rawResult as Record<string, unknown>).exercises)
      ? ((rawResult as Record<string, unknown>).exercises as Array<Record<string, unknown>>)
      : rawResult && typeof rawResult === "object" && Array.isArray((rawResult as Record<string, unknown>).questions)
      ? ((rawResult as Record<string, unknown>).questions as Array<Record<string, unknown>>)
      : [];

    if (items.length === 0) return [];

    const exercises: GrammarExercise[] = [];
    items.forEach((item, idx) => {
      if (!item || typeof item !== "object") return;
      const type = (item.type ?? "multiple_choice") as GrammarExercise["type"];
      if (!VALID_EXERCISE_TYPES.includes(type)) return;

      const promptEn = String(item.prompt_en || item.prompt || "").trim();
      const correctAnswer = String(item.correct_answer ?? item.correct ?? "").trim();
      if (!promptEn || !correctAnswer) return;

      const options = Array.isArray(item.options)
        ? item.options.map((o) => String(o).trim()).filter((o) => o.length > 0)
        : undefined;
      const errorWord = item.error_word ? String(item.error_word).trim() : undefined;

      if (type === "multiple_choice") {
        const norm = (v: string) => v.trim().toLowerCase();
        if (!options || options.length < 2 || !options.some((o) => norm(o) === norm(correctAnswer))) return;
      }
      if (type === "error_spotting") {
        if (!errorWord || !promptEn.toLowerCase().includes(errorWord.toLowerCase())) return;
      }

      exercises.push({
        id: `ai-gen-${Date.now()}-${idx}`,
        type,
        promptEn,
        promptVn: item.prompt_vn ? String(item.prompt_vn) : undefined,
        hint: item.hint ? String(item.hint) : undefined,
        options,
        correctAnswer,
        errorWord,
        explanation: String(item.explanation || "Bài tập được sinh tự động bởi Gemini AI"),
      });
    });
    return exercises;
  } catch (err) {
    console.error("AI grammar exercise generation failed:", err);
    throw err;
  }
}

export interface VocabularyRecommendation {
  word: string;
  cefr?: CefrLevel | null;
  phonetic?: string;
  part_of_speech?: string;
  meaning_vn: string;
  topic?: string;
  why_recommended: string;
  sample_sentence_en: string;
  sample_sentence_vn?: string;
  grammar_structure?: string;
}

/** Recommended words allowed one CEFR level above the learner, per batch */
const MAX_STRETCH_WORDS = 1;

/**
 * Automatically generate high-value vocabulary recommendations tailored to user's CEFR level
 */
export async function generateVocabularyRecommendationsAI(
  level: string,
  existingWords: string[],
  topic?: string,
  count: number = 3
): Promise<VocabularyRecommendation[]> {
  try {
    const customPath = localStorage.getItem("myenglish_custom_cli_path") || undefined;
    const rawResult = await withTimeout(
      invoke<unknown>("generate_vocabulary_recommendations_ai", {
        level,
        existingWords,
        topic,
        count,
        customPath,
      }),
      "Đề xuất từ vựng AI"
    );

    let stretchUsed = 0;
    const items: Array<Record<string, unknown>> = Array.isArray(rawResult)
      ? (rawResult as Array<Record<string, unknown>>)
      : rawResult && typeof rawResult === "object" && Array.isArray((rawResult as Record<string, unknown>).words)
      ? ((rawResult as Record<string, unknown>).words as Array<Record<string, unknown>>)
      : rawResult && typeof rawResult === "object" && Array.isArray((rawResult as Record<string, unknown>).recommendations)
      ? ((rawResult as Record<string, unknown>).recommendations as Array<Record<string, unknown>>)
      : [];

    return items
      .filter((item) => item && typeof item === "object" && typeof item.word === "string")
      .map((item) => ({
        word: String(item.word || "").trim(),
        cefr: normalizeCefr(item.cefr),
        phonetic: item.phonetic ? String(item.phonetic) : undefined,
        part_of_speech: item.part_of_speech ? String(item.part_of_speech) : undefined,
        meaning_vn: String(item.meaning_vn || ""),
        topic: normalizeTopic(item.topic),
        why_recommended: String(item.why_recommended || ""),
        sample_sentence_en: String(item.sample_sentence_en || ""),
        sample_sentence_vn: item.sample_sentence_vn ? String(item.sample_sentence_vn) : undefined,
        grammar_structure: item.grammar_structure ? String(item.grammar_structure) : undefined,
      }))
      .filter((w) => isSafeVocabularyTerm(w.word) && w.meaning_vn.trim().length > 0)
      // At or below the learner's level, plus at most one word just above it ("i+1": slightly harder
      // input keeps the learner progressing). Anything further above is dropped.
      .filter((w) => {
        if (isWithinLevel(w.cefr, level)) return true;
        if (stretchUsed < MAX_STRETCH_WORDS && isOneLevelAbove(w.cefr, level)) {
          stretchUsed++;
          return true;
        }
        return false;
      });
  } catch (err) {
    console.error("AI vocabulary recommendation failed:", err);
    throw err;
  }
}



// ─── Free writing: the learner writes their own sentence, the AI grades it ───

export interface SentenceGrade {
  correct: boolean;
  score: number; // 0..100
  usesTargetWord: boolean;
  corrections: Array<{ wrong: string; right: string; whyVn: string }>;
  betterVersion: string;
  explanationVn: string;
}

/** Parse the AI's JSON grade defensively (missing fields get safe defaults). */
export function parseSentenceGrade(raw: string): SentenceGrade {
  const obj = JSON.parse(raw) as Record<string, unknown>;
  const score = Math.max(0, Math.min(100, Math.round(Number(obj.score) || 0)));
  const corrections = (Array.isArray(obj.corrections) ? obj.corrections : [])
    .map((c) => {
      const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      return { wrong: String(o.wrong ?? ""), right: String(o.right ?? ""), whyVn: String(o.why_vn ?? o.whyVn ?? "") };
    })
    .filter((c) => c.wrong || c.right);
  return {
    correct: obj.correct === true,
    score,
    usesTargetWord: obj.uses_target_word !== false,
    corrections,
    betterVersion: String(obj.better_version ?? ""),
    explanationVn: String(obj.explanation_vn ?? ""),
  };
}

export async function gradeSentenceWithAI(word: string, meaningVn: string, sentence: string, level?: string): Promise<SentenceGrade> {
  const customPath = localStorage.getItem("myenglish_custom_cli_path") || undefined;
  const raw = await withTimeout(
    invoke<string>("grade_sentence_ai", { word, meaningVn, sentence, level, customPath }),
    "Chấm câu bằng AI"
  );
  return parseSentenceGrade(raw);
}

// ─── Writing correction: a short text (daily standup), every error with its category ───

export type MistakeCategory =
  | "article"
  | "tense"
  | "word_form"
  | "preposition"
  | "agreement"
  | "word_choice"
  | "spelling"
  | "word_order"
  | "other";

const MISTAKE_CATEGORIES: MistakeCategory[] = [
  "article",
  "tense",
  "word_form",
  "preposition",
  "agreement",
  "word_choice",
  "spelling",
  "word_order",
  "other",
];

export interface WritingCorrection {
  wrong: string;
  right: string;
  /** The corrected full sentence */
  sentence: string;
  category: MistakeCategory;
  whyVn: string;
}

export interface WritingFeedback {
  score: number;
  corrections: WritingCorrection[];
  betterVersion: string;
  explanationVn: string;
}

/** Parse the AI's JSON defensively: unknown categories become "other", empty or no-op corrections are dropped. */
export function parseWritingFeedback(raw: string): WritingFeedback {
  const obj = JSON.parse(raw) as Record<string, unknown>;
  const corrections = (Array.isArray(obj.corrections) ? obj.corrections : [])
    .map((c) => {
      const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      const category = String(o.category ?? "").trim().toLowerCase() as MistakeCategory;
      return {
        wrong: String(o.wrong ?? "").trim(),
        right: String(o.right ?? "").trim(),
        sentence: String(o.sentence ?? "").trim(),
        category: MISTAKE_CATEGORIES.includes(category) ? category : "other",
        whyVn: String(o.why_vn ?? o.whyVn ?? "").trim(),
      };
    })
    .filter((c) => c.wrong && c.right && c.wrong.toLowerCase() !== c.right.toLowerCase())
    .slice(0, 8);
  return {
    score: Math.max(0, Math.min(100, Math.round(Number(obj.score) || 0))),
    corrections,
    betterVersion: String(obj.better_version ?? ""),
    explanationVn: String(obj.explanation_vn ?? ""),
  };
}

export async function correctWritingWithAI(text: string, level?: string): Promise<WritingFeedback> {
  const customPath = localStorage.getItem("myenglish_custom_cli_path") || undefined;
  const raw = await withTimeout(invoke<string>("correct_writing_ai", { text, level, customPath }), "Sửa bài viết bằng AI");
  return parseWritingFeedback(raw);
}
