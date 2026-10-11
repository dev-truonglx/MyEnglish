import { getDatabase } from "./db";
import { ensureCatalogSeeded } from "./vocabCatalog";
import { ensureGrammarBookSeeded, clearBookCache } from "./grammarBook";
import { GRAMMAR_CONTENT_VERSION_KEY, TARGET_GRAMMAR_CONTENT_VERSION } from "./grammarReset";

export const RELEASE_WIPE_VERSION_KEY = "myenglish_release_wipe_version";
export const TARGET_RELEASE_WIPE_VERSION = "0.0.27";

const TABLES_TO_CLEAR = [
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

/** Keys to preserve during full wipe (hardware preferences & UI configs) */
const PRESERVED_KEYS = new Set([
  "myenglish_ui_scale_v1",
  "myenglish_theme_v1",
  "myenglish_custom_cli_path",
  "myenglish_gemini_api_key",
  RELEASE_WIPE_VERSION_KEY,
  GRAMMAR_CONTENT_VERSION_KEY,
]);

let migrationPromise: Promise<boolean> | null = null;

/**
 * One-time clean slate migration for release v0.0.27:
 * Wipes legacy AI-generated content, old user words, old grammar and progress.
 * Re-imports complete Oxford 5000 vocab catalog and all 31 grammar chapters.
 *
 * Runs exactly once per device upon install or update to v0.0.27.
 */
export function ensureReleaseMigrationV27(): Promise<boolean> {
  migrationPromise ??= runReleaseMigrationV27().finally(() => {
    migrationPromise = null;
  });
  return migrationPromise;
}

async function runReleaseMigrationV27(): Promise<boolean> {
  try {
    const localVersion = typeof localStorage !== "undefined" ? localStorage.getItem(RELEASE_WIPE_VERSION_KEY) : null;
    const db = await getDatabase();

    // Check SQLite app_kv as well in case localStorage was cleared
    let dbVersion: string | null = null;
    try {
      const rows = await db.select<Array<{ value: string }>>(
        `SELECT value FROM app_kv WHERE key = $1;`,
        [RELEASE_WIPE_VERSION_KEY]
      );
      if (rows && rows.length > 0) {
        dbVersion = rows[0].value;
      }
    } catch {}

    if (localVersion === TARGET_RELEASE_WIPE_VERSION || dbVersion === TARGET_RELEASE_WIPE_VERSION) {
      return false;
    }

    console.info(`[ReleaseMigration] Executing one-time clean slate wipe and full data re-import for v${TARGET_RELEASE_WIPE_VERSION}...`);

    // 1. Wipe all existing data tables
    for (const table of TABLES_TO_CLEAR) {
      await db.execute(`DELETE FROM ${table};`).catch((err) => {
        console.error(`[ReleaseMigration] Error deleting from ${table}:`, err);
      });
    }

    // 2. Clean app_kv in SQLite (keep only preserved preference keys)
    const preservedList = Array.from(PRESERVED_KEYS);
    const placeholders = preservedList.map((_, i) => `$${i + 1}`).join(", ");
    await db.execute(
      `DELETE FROM app_kv WHERE key NOT IN (${placeholders});`,
      preservedList
    ).catch(() => {});

    // 3. Clean localStorage
    if (typeof localStorage !== "undefined") {
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith("myenglish_") && !PRESERVED_KEYS.has(key)) {
            localStorage.removeItem(key);
          }
        }
      } catch (err) {
        console.warn("[ReleaseMigration] Error cleaning localStorage:", err);
      }
    }

    // 4. Reset in-memory book caches
    clearBookCache();

    // 5. Re-import all catalog data freshly
    await ensureCatalogSeeded().catch((err) => console.warn("[ReleaseMigration] Failed to seed vocab catalog:", err));
    await ensureGrammarBookSeeded().catch((err) => console.warn("[ReleaseMigration] Failed to seed grammar catalog:", err));

    // 6. Record release wipe completion flag
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(RELEASE_WIPE_VERSION_KEY, TARGET_RELEASE_WIPE_VERSION);
      localStorage.setItem(GRAMMAR_CONTENT_VERSION_KEY, TARGET_GRAMMAR_CONTENT_VERSION);
    }

    await db.execute(
      `INSERT OR REPLACE INTO app_kv (key, value) VALUES ($1, $2);`,
      [RELEASE_WIPE_VERSION_KEY, TARGET_RELEASE_WIPE_VERSION]
    ).catch(() => {});

    await db.execute(
      `INSERT OR REPLACE INTO app_kv (key, value) VALUES ($1, $2);`,
      [GRAMMAR_CONTENT_VERSION_KEY, TARGET_GRAMMAR_CONTENT_VERSION]
    ).catch(() => {});

    // 7. Dispatch events to notify active views
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("myenglish-grammar-updated", { detail: { book: true } }));
      window.dispatchEvent(new CustomEvent("myenglish-activity-updated"));
    }

    console.info(`[ReleaseMigration] Successfully completed clean slate migration for v${TARGET_RELEASE_WIPE_VERSION}.`);
    return true;
  } catch (err) {
    console.error("[ReleaseMigration] Failed to complete release migration:", err);
    return false;
  }
}
