import { enrichWordWithGemini, type GeminiEnrichmentResult } from "./ai";
import { insertEnrichedWord } from "./db";
import { logTerminal } from "./logger";

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
   * Enqueue a new word for AI enrichment and SQLite storage.
   * Immediately puts the word into the queue and starts processing without blocking.
   */
  public async enqueue(word: string): Promise<void> {
    const cleanWord = word.trim().toLowerCase();
    if (!cleanWord) return;

    // If currently being analyzed or pending, ignore duplicate clicks
    const ongoing = this.queue.find(
      (item) => item.word === cleanWord && (item.status === "pending" || item.status === "analyzing")
    );
    if (ongoing) {
      console.log(`[Pipeline] Từ "${cleanWord}" đang được xử lý trong hàng đợi.`);
      return;
    }

    // Remove any previous completed/failed entry so it is re-analyzed fresh
    this.queue = this.queue.filter((item) => item.word !== cleanWord);

    const item: PipelineItem = {
      word: cleanWord,
      status: "pending",
      timestamp: new Date().toLocaleTimeString(),
    };

    this.queue = [item, ...this.queue];
    this.notify();
    console.log(`[Pipeline] Đã thêm "${cleanWord}" vào hàng đợi. Bắt đầu xử lý...`);

    // Asynchronously pre-save baseline word record into SQLite to ensure zero data loss
    insertEnrichedWord({
      word: cleanWord,
      meaning_vn: "Đang phân tích nghĩa & cấu trúc ngữ pháp...",
      topic: "General Tech",
      synonyms: [],
      antonyms: [],
      examples: [],
    })
      .then((id) => {
        item.wordId = id;
      })
      .catch((e) => {
        console.warn("[Pipeline] Pre-saving baseline notice:", e);
      });

    // Start queue processing immediately
    this.processNext();
  }

  /**
   * Retry analyzing a failed or pending word
   */
  public async retry(word: string): Promise<void> {
    const cleanWord = word.trim().toLowerCase();
    const item = this.queue.find((i) => i.word === cleanWord);
    if (item) {
      item.status = "pending";
      item.error = undefined;
      this.notify();
      this.processNext();
    } else {
      await this.enqueue(cleanWord);
    }
  }

  private async processNext() {
    if (this.isProcessing) {
      console.log("[Pipeline] Đang có tiến trình phân tích chạy. Chờ tới lượt...");
      return;
    }

    const pendingItem = this.queue.find((item) => item.status === "pending");
    if (!pendingItem) return;

    this.isProcessing = true;
    pendingItem.status = "analyzing";
    this.notify();
    logTerminal("Pipeline", `Bắt đầu xử lý từ: "${pendingItem.word}"`);

    try {
      // 1. Call Gemini CLI integration (fast mode with low effort & timeout)
      const enrichment = await enrichWordWithGemini(pendingItem.word);
      logTerminal("Pipeline", `Đã nhận kết quả AI cho "${pendingItem.word}". Bắt đầu lưu vào SQLite...`);
      pendingItem.result = enrichment;

      // 2. Save/Update primary enriched word to SQLite
      const wordTopic = enrichment.topic || "General Tech";
      const wordId = await insertEnrichedWord({
        word: pendingItem.word,
        phonetic: enrichment.phonetic,
        part_of_speech: enrichment.part_of_speech,
        topic: wordTopic,
        meaning_vn: enrichment.meaning_vn,
        image_url: null,
        synonyms: enrichment.synonyms,
        antonyms: enrichment.antonyms,
        collocations: enrichment.collocations,
        code_snippet: enrichment.code_snippet,
        examples: enrichment.examples,
      });
      logTerminal("Pipeline", `Đã lưu từ gốc "${pendingItem.word}" vào SQLite thành công (id: ${wordId})`);

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
          console.warn(`[Pipeline] Auto-saving synonym "${syn.word}" notice:`, e);
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
          console.warn(`[Pipeline] Auto-saving antonym "${ant.word}" notice:`, e);
        }
      }

      pendingItem.wordId = wordId;
      pendingItem.status = "completed";
      pendingItem.error = undefined;
      logTerminal("Pipeline", `Hoàn tất toàn bộ quy trình cho từ "${pendingItem.word}" ✓`);
    } catch (err) {
      logTerminal("Pipeline ERROR", `Lỗi quy trình cho từ "${pendingItem.word}": ${err}`);
      console.error(`[Pipeline] Phân tích thất bại cho từ "${pendingItem.word}":`, err);
      pendingItem.status = "failed";
      pendingItem.error = err instanceof Error ? err.message : String(err);

      // Keep word in SQLite with clear status so user never loses their vocabulary
      try {
        await insertEnrichedWord({
          word: pendingItem.word,
          meaning_vn: "Chờ phân tích (Lỗi phân tích AI - hãy nhấn Thử lại)",
          topic: "General Tech",
          synonyms: [],
          antonyms: [],
          examples: [],
        });
      } catch (saveErr) {
        console.warn("[Pipeline] Fallback save notice:", saveErr);
      }
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
