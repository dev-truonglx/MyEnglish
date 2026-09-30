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
 * Calls the Gemini CLI integration to analyze and enrich an English vocabulary word.
 */
export async function enrichWordWithGemini(word: string): Promise<GeminiEnrichmentResult> {
  const cleanWord = word.trim().toLowerCase();
  if (!cleanWord) {
    throw new Error("Word is empty");
  }

  try {
    const customPath = localStorage.getItem("myenglish_custom_cli_path") || undefined;
    const rawResult = await invoke<Record<string, unknown>>("enrich_word_with_gemini", {
      word: cleanWord,
      customPath,
    });

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
