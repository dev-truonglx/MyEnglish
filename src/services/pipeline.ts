import { enrichWordWithGemini, isSafeVocabularyTerm, type GeminiEnrichmentResult } from "./ai";
import { maskWordInSentence } from "./smartReview";
import {
  addUserContextExample,
  insertEnrichedWord,
  insertWordIfAbsent,
  replacePlaceholderMeaning,
  getPlaceholderWords,
  getAllWords,
  isPlaceholderMeaning,
} from "./db";
import { recordDailyActivity } from "./streak";
import { logTerminal } from "./logger";
import { assessUserProficiency, getUserOverrideLevel } from "./userProficiency";
import { findCatalogWord } from "./vocabCatalog";

export { isPlaceholderMeaning };

const PENDING_MEANING = "Đang phân tích nghĩa & cấu trúc ngữ pháp...";
const FAILED_MEANING = "Chờ phân tích (Lỗi phân tích AI - hãy nhấn Thử lại)";

// Assessed CEFR level is cached so each enrichment doesn't reload the whole collection
const LEVEL_CACHE_TTL_MS = 10 * 60 * 1000;
let cachedLevel: { level: string; at: number } | null = null;

/**
 * The learner's level for AI prompts: their own choice, else the level assessed from their words.
 * Used for content and for grading, so a beginner is never graded at the B1 fallback.
 */
export async function getActiveCefrLevel(): Promise<string> {
  const override = getUserOverrideLevel();
  if (override) return override;
  if (cachedLevel && Date.now() - cachedLevel.at < LEVEL_CACHE_TTL_MS) return cachedLevel.level;
  try {
    const words = await getAllWords();
    const level = assessUserProficiency(words).effectiveLevel;
    cachedLevel = { level, at: Date.now() };
    return level;
  } catch (e) {
    console.warn("[Pipeline] Không xác định được cấp độ CEFR, dùng B1:", e);
    return cachedLevel?.level ?? "B1";
  }
}

// Automatic re-queue on launch gives up on a word after this many attempts that didn't enrich it
const REQUEUE_ATTEMPTS_KEY = "myenglish_pending_requeue_attempts_v1";
const MAX_AUTO_REQUEUE_ATTEMPTS = 3;

function readRequeueAttempts(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(REQUEUE_ATTEMPTS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeRequeueAttempts(attempts: Record<string, number>): void {
  try {
    if (Object.keys(attempts).length === 0) localStorage.removeItem(REQUEUE_ATTEMPTS_KEY);
    else localStorage.setItem(REQUEUE_ATTEMPTS_KEY, JSON.stringify(attempts));
  } catch {}
}

/** Forget automatic attempts for a word (enriched successfully or added again by hand) */
function resetRequeueAttempts(word: string): void {
  const attempts = readRequeueAttempts();
  if (!(word in attempts)) return;
  delete attempts[word];
  writeRequeueAttempts(attempts);
}

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
   * Terms the AI step would reject ("what?", "a, b", over 64 characters...) are refused up front, so
   * they never sit in the library as a placeholder that can't be analysed.
   * `context` is the sentence the learner met the word in; it is kept as the word's first example.
   */
  public async enqueue(
    word: string,
    options: { source?: "user" | "auto"; context?: string | null } = {}
  ): Promise<{ accepted: boolean; reason?: string }> {
    const cleanWord = word.trim().toLowerCase().replace(/\s+/g, " ");
    if (!cleanWord) return { accepted: false, reason: "Từ trống" };
    if (!isSafeVocabularyTerm(cleanWord)) {
      return {
        accepted: false,
        reason: "Chỉ nhận từ hoặc cụm từ (chữ, số, khoảng trắng và - ' . / + # &), tối đa 64 ký tự",
      };
    }
    if (options.source !== "auto") resetRequeueAttempts(cleanWord);

    // If currently being analyzed or pending, ignore duplicate clicks
    const ongoing = this.queue.find(
      (item) => item.word === cleanWord && (item.status === "pending" || item.status === "analyzing")
    );
    if (ongoing) {
      console.log(`[Pipeline] Từ "${cleanWord}" đang được xử lý trong hàng đợi.`);
      return { accepted: true };
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

    // Adding a word yourself counts as study activity; AI auto-replenish does not
    if (options.source !== "auto") {
      recordDailyActivity(1);
    }
    console.log(`[Pipeline] Đã thêm "${cleanWord}" vào hàng đợi. Bắt đầu xử lý...`);

    // Pre-save a placeholder only for brand-new words, so an existing enriched word is never overwritten.
    // Awaited so it can't race with the failure write below.
    try {
      const { id } = await insertWordIfAbsent({
        word: cleanWord,
        meaning_vn: PENDING_MEANING,
        topic: "General Tech",
        synonyms: [],
        antonyms: [],
        examples: [],
      });
      item.wordId = id;
      // The learner's own sentence (only if it really contains the word)
      const context = options.context?.trim();
      if (context && maskWordInSentence(context, cleanWord)) {
        await addUserContextExample(id, context).catch((e) => console.warn("[Pipeline] Context sentence notice:", e));
      }
    } catch (e) {
      console.warn("[Pipeline] Pre-saving baseline notice:", e);
    }

    // Start queue processing immediately
    this.processNext();
    return { accepted: true };
  }

  /**
   * Retry analyzing a failed or pending word
   */
  public async retry(word: string): Promise<void> {
    const cleanWord = word.trim().toLowerCase();
    const item = this.queue.find((i) => i.word === cleanWord);
    if (item) {
      resetRequeueAttempts(cleanWord);
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
      // 1. Determine user's active CEFR level (override or assessed) for tailored examples
      const userLevel = await getActiveCefrLevel();

      // Call Gemini CLI integration (calibrated to user's CEFR level)
      const enrichment = await enrichWordWithGemini(pendingItem.word, userLevel);
      logTerminal("Pipeline", `Đã nhận kết quả AI (${userLevel}) cho "${pendingItem.word}". Bắt đầu lưu vào SQLite...`);
      pendingItem.result = enrichment;

      // 2. Save/Update primary enriched word to SQLite. A word of the Oxford deck keeps Oxford's level
      // rather than the AI's guess.
      const wordTopic = enrichment.topic || "General Tech";
      const officialLevel = (await findCatalogWord(pendingItem.word).catch(() => []))[0]?.cefr ?? null;
      const wordId = await insertEnrichedWord({
        word: pendingItem.word,
        cefr_level: officialLevel ?? enrichment.cefr ?? null,
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

      // Synonyms and antonyms stay as related terms of this word (shown in its details, and used to keep
      // them out of its multiple-choice distractors). They are not added as cards automatically: each
      // would bypass analysis and the daily new-word limit. The learner can add any of them from the
      // word's details.

      pendingItem.wordId = wordId;
      pendingItem.status = "completed";
      pendingItem.error = undefined;
      resetRequeueAttempts(pendingItem.word);
      logTerminal("Pipeline", `Hoàn tất toàn bộ quy trình cho từ "${pendingItem.word}" ✓`);
    } catch (err) {
      logTerminal("Pipeline ERROR", `Lỗi quy trình cho từ "${pendingItem.word}": ${err}`);
      console.error(`[Pipeline] Phân tích thất bại cho từ "${pendingItem.word}":`, err);
      pendingItem.status = "failed";
      pendingItem.error = err instanceof Error ? err.message : String(err);

      // Keep word in SQLite with clear status, but never overwrite an already-enriched word
      try {
        const { inserted } = await insertWordIfAbsent({
          word: pendingItem.word,
          meaning_vn: FAILED_MEANING,
          topic: "General Tech",
          synonyms: [],
          antonyms: [],
          examples: [],
        });
        if (!inserted) {
          await replacePlaceholderMeaning(pendingItem.word, FAILED_MEANING);
        }
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

/**
 * Re-queue words still holding a placeholder meaning (e.g. app closed mid-analysis or AI failed).
 * Call once on main window mount. Uses source "auto" so it doesn't count as study activity.
 * Each automatic attempt is counted (reset on success / manual re-add); a word is skipped after
 * MAX_AUTO_REQUEUE_ATTEMPTS so a word the AI keeps failing on isn't retried on every launch.
 */
export async function requeuePendingWords(): Promise<number> {
  try {
    const placeholders = await getPlaceholderWords();
    const attempts = readRequeueAttempts();
    // Drop counters for words that are no longer placeholders (enriched elsewhere or deleted)
    const placeholderSet = new Set(placeholders.map((w) => w.word.trim().toLowerCase()));
    for (const word of Object.keys(attempts)) {
      if (!placeholderSet.has(word)) delete attempts[word];
    }
    const pending = placeholders.filter(
      (w) => (attempts[w.word.trim().toLowerCase()] ?? 0) < MAX_AUTO_REQUEUE_ATTEMPTS
    );
    for (const w of pending) {
      const key = w.word.trim().toLowerCase();
      attempts[key] = (attempts[key] ?? 0) + 1;
    }
    writeRequeueAttempts(attempts);

    for (const w of pending) {
      await pipeline.enqueue(w.word, { source: "auto" });
    }
    const skipped = placeholders.length - pending.length;
    if (pending.length > 0 || skipped > 0) {
      logTerminal(
        "Pipeline",
        `Đã đưa lại ${pending.length} từ chưa phân tích vào hàng đợi` +
          (skipped > 0 ? ` (bỏ qua ${skipped} từ đã thử ${MAX_AUTO_REQUEUE_ATTEMPTS} lần).` : ".")
      );
    }
    return pending.length;
  } catch (e) {
    console.warn("[Pipeline] Re-queue pending words notice:", e);
    return 0;
  }
}

export { looksLikeSentence, stashPendingContext, takePendingContext } from "./contextHandover";
