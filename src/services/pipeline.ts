import { enrichWordWithGemini, type GeminiEnrichmentResult } from "./ai";
import { insertEnrichedWord } from "./db";

export interface PipelineItem {
  word: string;
  status: "pending" | "analyzing" | "completed" | "failed";
  timestamp: string;
  result?: GeminiEnrichmentResult;
  error?: string;
  wordId?: string;
}

type PipelineListener = (items: PipelineItem[]) => void;

class WordProcessingPipeline {
  private queue: PipelineItem[] = [];
  private listeners: Set<PipelineListener> = new Set();
  private isProcessing = false;

  public subscribe(listener: PipelineListener): () => void {
    this.listeners.add(listener);
    listener([...this.queue]);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const snapshot = [...this.queue];
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  /**
   * Enqueue a new word for AI enrichment and SQLite storage
   */
  public async enqueue(word: string): Promise<void> {
    const cleanWord = word.trim().toLowerCase();
    if (!cleanWord) return;

    // Check if already in queue or processing or already completed in session
    const existing = this.queue.find(
      (item) =>
        item.word === cleanWord &&
        (item.status === "pending" || item.status === "analyzing" || item.status === "completed")
    );
    if (existing) return;

    const item: PipelineItem = {
      word: cleanWord,
      status: "pending",
      timestamp: new Date().toLocaleTimeString(),
    };

    this.queue = [item, ...this.queue];
    this.notify();

    // Start queue processing
    this.processNext();
  }

  private async processNext() {
    if (this.isProcessing) return;

    const pendingItem = this.queue.find((item) => item.status === "pending");
    if (!pendingItem) return;

    this.isProcessing = true;
    pendingItem.status = "analyzing";
    this.notify();

    try {
      // 1. Call Gemini CLI integration
      const enrichment = await enrichWordWithGemini(pendingItem.word);
      pendingItem.result = enrichment;

      // 2. Save primary enriched word to SQLite
      const wordTopic = enrichment.topic || "General Tech";
      const wordId = await insertEnrichedWord({
        word: pendingItem.word,
        phonetic: enrichment.phonetic,
        part_of_speech: enrichment.part_of_speech,
        topic: wordTopic,
        meaning_vn: enrichment.meaning_vn,
        image_url: null, // Note: image generation & drive upload deferred per user request
        synonyms: enrichment.synonyms,
        antonyms: enrichment.antonyms,
        collocations: enrichment.collocations,
        code_snippet: enrichment.code_snippet,
        examples: enrichment.examples,
      });

      // 3. Automatically save all synonyms into the vocabulary list
      for (const syn of enrichment.synonyms) {
        if (!syn.word || syn.word.trim().toLowerCase() === pendingItem.word) continue;
        const synExamples = (syn.examples || []).map((ex) => ({
          sentence_en: ex.sentence_en,
          sentence_vn: ex.meaning_vn,
          grammar_analysis: [
            ex.structure ? `Cấu trúc: ${ex.structure}` : "",
            ex.why_used ? `Giải thích: ${ex.why_used}` : "",
          ].filter(Boolean).join("\n"),
        }));

        try {
          await insertEnrichedWord({
            word: syn.word.trim().toLowerCase(),
            phonetic: syn.phonetic || null,
            topic: wordTopic,
            meaning_vn: syn.meaning_vn || `Từ đồng nghĩa của "${pendingItem.word}"`,
            image_url: null,
            synonyms: [{ word: pendingItem.word, meaning_vn: enrichment.meaning_vn }],
            antonyms: [],
            examples: synExamples,
          });
        } catch (e) {
          console.warn(`Auto-saving synonym "${syn.word}" notice:`, e);
        }
      }

      // 4. Automatically save all antonyms into the vocabulary list
      for (const ant of enrichment.antonyms) {
        if (!ant.word || ant.word.trim().toLowerCase() === pendingItem.word) continue;
        const antExamples = (ant.examples || []).map((ex) => ({
          sentence_en: ex.sentence_en,
          sentence_vn: ex.meaning_vn,
          grammar_analysis: [
            ex.structure ? `Cấu trúc: ${ex.structure}` : "",
            ex.why_used ? `Giải thích: ${ex.why_used}` : "",
          ].filter(Boolean).join("\n"),
        }));

        try {
          await insertEnrichedWord({
            word: ant.word.trim().toLowerCase(),
            phonetic: ant.phonetic || null,
            topic: wordTopic,
            meaning_vn: ant.meaning_vn || `Từ trái nghĩa của "${pendingItem.word}"`,
            image_url: null,
            synonyms: [],
            antonyms: [{ word: pendingItem.word, meaning_vn: enrichment.meaning_vn }],
            examples: antExamples,
          });
        } catch (e) {
          console.warn(`Auto-saving antonym "${ant.word}" notice:`, e);
        }
      }

      pendingItem.wordId = wordId;
      pendingItem.status = "completed";
    } catch (err) {
      console.error(`Pipeline failed for word "${pendingItem.word}":`, err);
      pendingItem.status = "failed";
      pendingItem.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.isProcessing = false;
      this.notify();
      // Process remaining items in queue
      this.processNext();
    }
  }

  public getQueue(): PipelineItem[] {
    return [...this.queue];
  }
}

export const pipeline = new WordProcessingPipeline();
