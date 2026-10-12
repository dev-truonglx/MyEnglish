import { getDatabase } from "./db";
import { ensureCatalogSeeded } from "./vocabCatalog";
import { ensureGrammarBookSeeded, clearBookCache } from "./grammarBook";
import { GRAMMAR_CONTENT_VERSION_KEY, TARGET_GRAMMAR_CONTENT_VERSION } from "./grammarReset";
import { RELEASE_WIPE_VERSION_KEY, TARGET_RELEASE_WIPE_VERSION } from "./releaseMigration";
import { clearBackupCache } from "./storageBackup";

export const TABLES_TO_RESET = [
  "review_logs",
  "srs_production",
  "srs_reviews",
  "examples",
  "words",
  "learning_events",
  "mistakes",
  "grammar_progress",
  "grammar_custom_exercises",
  "grammar_book_items",
  "grammar_book_sets",
  "grammar_book_lessons",
  "grammar_book_chapters",
  "vocab_catalog",
  "vocab_catalog_meta",
] as const;

/** Keys to preserve during full wipe & reset (hardware preferences, UI scaling, credentials) */
export const PRESERVED_SETTINGS_KEYS = new Set([
  "myenglish_ui_scale_v1",
  "myenglish_theme_v1",
  "myenglish_theme_mode_v1",
  "myenglish_custom_cli_path",
  "myenglish_gemini_api_key",
  "myenglish_autostart_enabled_v1",
]);

export interface ResetOptions {
  onProgress?: (stage: string) => void;
}

/**
 * Resets all user learning data and progress, treating the application as a brand-new install:
 * 1. Completely wipes learning history, words, SRS reviews, grammar progress, streak, XP, achievements.
 * 2. Preserves display/system preferences (UI scale, theme, custom CLI path, Gemini API key, autostart).
 * 3. Clears in-memory book and storage caches.
 * 4. Re-imports the complete Oxford 5000 vocabulary catalog and all 31 grammar chapters freshly.
 * 5. Removes onboarding and tense selection markers so the initial survey starts from scratch on fresh launch.
 *
 * @returns true if reset and re-import succeeded.
 */
export async function resetAllAppData(options?: ResetOptions): Promise<boolean> {
  const notify = (stage: string) => {
    try {
      options?.onProgress?.(stage);
    } catch {}
  };

  try {
    notify("Đang kết nối cơ sở dữ liệu...");
    const db = await getDatabase();

    notify("Đang xóa toàn bộ quá trình học và dữ liệu cá nhân...");

    // 1. Wipe all 15 data tables
    for (const table of TABLES_TO_RESET) {
      await db.execute(`DELETE FROM ${table};`).catch((err) => {
        console.error(`[AppReset] Error deleting table ${table}:`, err);
      });
    }

    // 2. Read and preserve system/display preferences
    const preservedValues = new Map<string, string>();
    for (const key of PRESERVED_SETTINGS_KEYS) {
      const val = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
      if (val !== null) {
        preservedValues.set(key, val);
      }
    }

    // Also read any preserved preferences stored in app_kv
    try {
      const rows = await db.select<Array<{ key: string; value: string }>>(`SELECT key, value FROM app_kv;`);
      for (const row of rows) {
        if (PRESERVED_SETTINGS_KEYS.has(row.key) && !preservedValues.has(row.key)) {
          preservedValues.set(row.key, row.value);
        }
      }
    } catch {}

    // Ensure migration markers are retained so standard migrations don't re-wipe
    preservedValues.set(RELEASE_WIPE_VERSION_KEY, TARGET_RELEASE_WIPE_VERSION);
    preservedValues.set(GRAMMAR_CONTENT_VERSION_KEY, TARGET_GRAMMAR_CONTENT_VERSION);

    // 3. Clear app_kv completely and re-insert only preserved keys
    await db.execute(`DELETE FROM app_kv;`).catch(() => {});
    for (const [key, val] of preservedValues.entries()) {
      await db
        .execute(`INSERT OR REPLACE INTO app_kv (key, value) VALUES ($1, $2);`, [key, val])
        .catch(() => {});
    }

    // 4. Clean localStorage (keep only preserved settings)
    if (typeof localStorage !== "undefined") {
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && !PRESERVED_SETTINGS_KEYS.has(key)) {
            localStorage.removeItem(key);
          }
        }

        // Set migration version markers in localStorage
        localStorage.setItem(RELEASE_WIPE_VERSION_KEY, TARGET_RELEASE_WIPE_VERSION);
        localStorage.setItem(GRAMMAR_CONTENT_VERSION_KEY, TARGET_GRAMMAR_CONTENT_VERSION);

        // Explicitly ensure survey & learning markers are deleted
        localStorage.removeItem("myenglish_onboarding_done_v1");
        localStorage.removeItem("myenglish_grammar_tenses_init_v1");
        localStorage.removeItem("myenglish_study_levels_v1");
        localStorage.removeItem("myenglish_grammar_path_excluded_v1");
        localStorage.removeItem("myenglish_daily_goal_v1");
        localStorage.removeItem("myenglish_streak_v1");
        localStorage.removeItem("myenglish_xp_v1");
      } catch (err) {
        console.warn("[AppReset] Error cleaning localStorage:", err);
      }
    }

    // 5. Invalidate in-memory caches
    clearBackupCache();
    clearBookCache();

    // 6. Re-seed Oxford 5000 vocabulary catalog
    notify("Đang nạp lại 5.000 từ vựng Oxford...");
    await ensureCatalogSeeded().catch((err) => {
      console.warn("[AppReset] Failed to seed vocab catalog:", err);
    });

    // 7. Re-seed 31 grammar chapters
    notify("Đang nạp lại 31 chương ngữ pháp...");
    await ensureGrammarBookSeeded().catch((err) => {
      console.warn("[AppReset] Failed to seed grammar book:", err);
    });

    // 8. Notify active listeners
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("myenglish-grammar-updated", { detail: { book: true } }));
      window.dispatchEvent(new CustomEvent("myenglish-activity-updated"));
      window.dispatchEvent(new CustomEvent("myenglish-streak-updated"));
      window.dispatchEvent(new CustomEvent("myenglish-words-updated"));
    }

    notify("Hoàn tất đặt lại dữ liệu!");
    console.info("[AppReset] All app data reset successfully. Ready for initial survey.");
    return true;
  } catch (err) {
    console.error("[AppReset] Failed to reset app data:", err);
    return false;
  }
}
