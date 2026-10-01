import { invoke } from "@tauri-apps/api/core";
import type { TermWithMeaning } from "@/types/database";

export interface EnrichedExample {
  sentence_en: string;
  sentence_vn?: string;
  grammar_analysis: string;
}

export interface GeminiEnrichmentResult {
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
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Phân tích AI vượt quá thời gian chờ (40s). Vui lòng thử lại.")),
        40000
      )
    );

    const rawResult = await Promise.race([
      invoke<Record<string, unknown>>("enrich_word_with_gemini", {
        word: cleanWord,
        level,
        customPath,
      }),
      timeoutPromise,
    ]);

    if (!rawResult || typeof rawResult.meaning_vn !== "string") {
      throw new Error("Invalid response format from Gemini");
    }

    const rawExamples = Array.isArray(rawResult.examples) ? rawResult.examples : [];
    const examples: EnrichedExample[] = rawExamples.map((ex) => {
      const e = (ex && typeof ex === "object" ? ex : {}) as Record<string, unknown>;
      return {
        sentence_en: String(e.sentence_en || ""),
        sentence_vn: e.sentence_vn ? String(e.sentence_vn) : undefined,
        grammar_analysis: String(e.grammar_analysis || ""),
      };
    });

    const rawCollocations = Array.isArray(rawResult.collocations) ? rawResult.collocations : [];
    const collocations = rawCollocations.map((c) => String(c)).filter((c) => c.trim().length > 0);

    const topic =
      typeof rawResult.topic === "string" && rawResult.topic.trim().length > 0
        ? rawResult.topic.trim()
        : "General Tech";

    return {
      phonetic: typeof rawResult.phonetic === "string" ? rawResult.phonetic : undefined,
      part_of_speech: typeof rawResult.part_of_speech === "string" ? rawResult.part_of_speech : undefined,
      topic,
      meaning_vn: String(rawResult.meaning_vn),
      collocations: collocations.length > 0 ? collocations : undefined,
      code_snippet: typeof rawResult.code_snippet === "string" ? rawResult.code_snippet : undefined,
      synonyms: normalizeTerms(rawResult.synonyms),
      antonyms: normalizeTerms(rawResult.antonyms),
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
): Promise<import("@/types/grammar").GrammarExercise[]> {
  try {
    const customPath = localStorage.getItem("myenglish_custom_cli_path") || undefined;
    const rawResult = await invoke<unknown>("generate_grammar_exercises_ai", {
      topic,
      level,
      customPath,
    });

    const items: Array<Record<string, unknown>> = Array.isArray(rawResult)
      ? (rawResult as Array<Record<string, unknown>>)
      : rawResult && typeof rawResult === "object" && Array.isArray((rawResult as Record<string, unknown>).exercises)
      ? ((rawResult as Record<string, unknown>).exercises as Array<Record<string, unknown>>)
      : rawResult && typeof rawResult === "object" && Array.isArray((rawResult as Record<string, unknown>).questions)
      ? ((rawResult as Record<string, unknown>).questions as Array<Record<string, unknown>>)
      : [];

    if (items.length === 0) return [];

    return items.map((item, idx) => {
      const type = (item.type as import("@/types/grammar").GrammarExercise["type"]) || "multiple_choice";
      const options = Array.isArray(item.options) ? item.options.map((o) => String(o)) : undefined;

      return {
        id: `ai-gen-${Date.now()}-${idx}`,
        type,
        promptEn: String(item.prompt_en || item.prompt || ""),
        promptVn: item.prompt_vn ? String(item.prompt_vn) : undefined,
        hint: item.hint ? String(item.hint) : undefined,
        options,
        correctAnswer: String(item.correct_answer || item.correct || ""),
        errorWord: item.error_word ? String(item.error_word) : undefined,
        explanation: String(item.explanation || "Bài tập được sinh tự động bởi Gemini AI"),
      };
    });
  } catch (err) {
    console.error("AI grammar exercise generation failed:", err);
    throw err;
  }
}

export interface VocabularyRecommendation {
  word: string;
  phonetic?: string;
  part_of_speech?: string;
  meaning_vn: string;
  topic?: string;
  why_recommended: string;
  sample_sentence_en: string;
  sample_sentence_vn?: string;
  grammar_structure?: string;
}

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
    const rawResult = await invoke<unknown>("generate_vocabulary_recommendations_ai", {
      level,
      existingWords,
      topic,
      count,
      customPath,
    });

    const items: Array<Record<string, unknown>> = Array.isArray(rawResult)
      ? (rawResult as Array<Record<string, unknown>>)
      : rawResult && typeof rawResult === "object" && Array.isArray((rawResult as Record<string, unknown>).words)
      ? ((rawResult as Record<string, unknown>).words as Array<Record<string, unknown>>)
      : rawResult && typeof rawResult === "object" && Array.isArray((rawResult as Record<string, unknown>).recommendations)
      ? ((rawResult as Record<string, unknown>).recommendations as Array<Record<string, unknown>>)
      : [];

    return items
      .map((item) => ({
        word: String(item.word || "").trim(),
        phonetic: item.phonetic ? String(item.phonetic) : undefined,
        part_of_speech: item.part_of_speech ? String(item.part_of_speech) : undefined,
        meaning_vn: String(item.meaning_vn || ""),
        topic: item.topic ? String(item.topic) : "General Tech",
        why_recommended: String(item.why_recommended || ""),
        sample_sentence_en: String(item.sample_sentence_en || ""),
        sample_sentence_vn: item.sample_sentence_vn ? String(item.sample_sentence_vn) : undefined,
        grammar_structure: item.grammar_structure ? String(item.grammar_structure) : undefined,
      }))
      .filter((w) => w.word.length > 0 && w.meaning_vn.length > 0);
  } catch (err) {
    console.error("AI vocabulary recommendation failed:", err);
    throw err;
  }
}


