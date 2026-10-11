import { getDatabase } from "./db";
import { persistKeyNow } from "./storageBackup";

export const GRAMMAR_CONTENT_VERSION_KEY = "myenglish_grammar_content_v";
export const TARGET_GRAMMAR_CONTENT_VERSION = "2";

/**
 * Runs once when myenglish_grammar_content_v !== 2:
 * - Clears legacy grammar_progress and grammar_custom_exercises in SQLite & localStorage
 * - Clears localStorage and app_kv keys: progress, answer pool, exercise history, introduced, custom exercises
 */
export async function checkAndRunGrammarReset(): Promise<boolean> {
  const currentVersion = localStorage.getItem(GRAMMAR_CONTENT_VERSION_KEY);
  if (currentVersion === TARGET_GRAMMAR_CONTENT_VERSION) {
    return false;
  }

  console.info(`[GrammarReset] Resetting legacy grammar data (old version: ${currentVersion ?? "none"} -> ${TARGET_GRAMMAR_CONTENT_VERSION})`);

  // 1. Clean localStorage keys
  const keysToRemove: string[] = [
    "myenglish_grammar_progress_v1",
    "myenglish_grammar_answer_pool_v1",
    "myenglish_grammar_exercise_history_v1",
    "myenglish_grammar_introduced_v1",
  ];

  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("myenglish_grammar_custom_") || keysToRemove.includes(k))) {
        localStorage.removeItem(k);
      }
    }
  } catch (err) {
    console.warn("[GrammarReset] Failed to clean localStorage:", err);
  }

  // 2. Clean SQLite tables and app_kv keys
  try {
    const db = await getDatabase();
    if (db) {
      await db.execute(`DELETE FROM grammar_progress;`).catch(() => {});
      await db.execute(`DELETE FROM grammar_custom_exercises;`).catch(() => {});

      // Delete corresponding keys in app_kv
      await db.execute(`
        DELETE FROM app_kv 
        WHERE key IN ('myenglish_grammar_progress_v1', 'myenglish_grammar_answer_pool_v1', 'myenglish_grammar_exercise_history_v1', 'myenglish_grammar_introduced_v1')
           OR key LIKE 'myenglish_grammar_custom_%';
      `).catch(() => {});
    }
  } catch (err) {
    console.warn("[GrammarReset] SQLite reset failed:", err);
  }

  // 3. Mark reset as completed
  try {
    localStorage.setItem(GRAMMAR_CONTENT_VERSION_KEY, TARGET_GRAMMAR_CONTENT_VERSION);
    persistKeyNow(GRAMMAR_CONTENT_VERSION_KEY);
  } catch (err) {
    console.warn("[GrammarReset] Failed to save content version flag:", err);
  }

  return true;
}
