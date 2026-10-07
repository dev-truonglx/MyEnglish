/**
 * Context sentence handed over from the Quick Input window to the main window (which owns the pipeline).
 * Kept free of heavy imports so the Quick Input bundle stays small.
 */

const PENDING_CONTEXT_KEY = "myenglish_pending_context_v1";
/** A context handed over by Quick Input is only used for the word submitted right after it */
const PENDING_CONTEXT_TTL_MS = 2 * 60 * 1000;

/** The clipboard text looks like a sentence (a context worth keeping), not a single term */
export function looksLikeSentence(text: string | null | undefined): boolean {
  const t = (text || "").replace(/\s+/g, " ").trim();
  return t.length >= 12 && t.length <= 300 && t.split(" ").length >= 4 && /[a-z]/i.test(t);
}

/** Whether the sentence contains the word (or a simple inflection of it) as a whole word */
export function sentenceContainsWord(sentence: string, word: string): boolean {
  const w = word.trim().toLowerCase();
  if (!w) return false;
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w])${escaped}(?:s|es|ed|d|ing)?(?![\\w])`, "i").test(sentence);
}

/** Quick Input stores the sentence the word was copied from, for the main window to use */
export function stashPendingContext(word: string, sentence: string): void {
  try {
    localStorage.setItem(
      PENDING_CONTEXT_KEY,
      JSON.stringify({ word: word.trim().toLowerCase(), sentence: sentence.replace(/\s+/g, " ").trim(), at: Date.now() })
    );
  } catch {}
}

/** The stashed sentence for this word, if any (consumed). */
export function takePendingContext(word: string): string | null {
  try {
    const raw = localStorage.getItem(PENDING_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { word?: string; sentence?: string; at?: number };
    localStorage.removeItem(PENDING_CONTEXT_KEY);
    if (parsed.word !== word.trim().toLowerCase() || !parsed.sentence) return null;
    if (!parsed.at || Date.now() - parsed.at > PENDING_CONTEXT_TTL_MS) return null;
    return parsed.sentence;
  } catch {
    return null;
  }
}
