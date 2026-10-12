import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resetAllAppData,
  TABLES_TO_RESET,
  PRESERVED_SETTINGS_KEYS,
} from "@/services/appReset";
import { RELEASE_WIPE_VERSION_KEY, TARGET_RELEASE_WIPE_VERSION } from "@/services/releaseMigration";
import { GRAMMAR_CONTENT_VERSION_KEY, TARGET_GRAMMAR_CONTENT_VERSION } from "@/services/grammarReset";
import { GRAMMAR_TENSES_INIT_KEY } from "@/services/grammarPath";

describe("resetAllAppData", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("wipes all learning tables, resets keys, preserves UI preferences, and re-seeds fresh data", async () => {
    vi.resetModules();
    const { getDatabase } = await import("@/services/db");
    const { resetAllAppData } = await import("@/services/appReset");
    const db = await getDatabase();

    // 1. Setup mock existing learning data
    await db.execute(`
      INSERT OR REPLACE INTO words (id, word, meaning_vn)
      VALUES ('user_test_word', 'hello', 'xin chào');
    `);
    await db.execute(`
      INSERT OR REPLACE INTO grammar_progress (lesson_id, mastery)
      VALUES ('ch01-l01', 85);
    `);
    await db.execute(`
      INSERT OR REPLACE INTO mistakes (id, word_id, wrong_text, right_text, source, created_at, next_review_date)
      VALUES ('mistake_1', 'user_test_word', 'wrng', 'wrong', 'test', '2026-01-01', '2026-01-02');
    `);
    await db.execute(`
      INSERT OR REPLACE INTO review_logs (id, word_id, exercise_type)
      VALUES ('log_1', 'user_test_word', 'flip');
    `);

    // 2. Setup mock localStorage & app_kv (both learning keys & preserved preferences)
    localStorage.setItem("myenglish_onboarding_done_v1", "1");
    localStorage.setItem(GRAMMAR_TENSES_INIT_KEY, "1");
    localStorage.setItem("myenglish_streak_v1", "15");
    localStorage.setItem("myenglish_xp_v1", "500");
    localStorage.setItem("myenglish_study_levels_v1", JSON.stringify(["A1", "A2"]));
    localStorage.setItem("myenglish_grammar_path_excluded_v1", JSON.stringify(["ch01-l02"]));

    // Preserved preferences
    localStorage.setItem("myenglish_ui_scale_v1", "1.1");
    localStorage.setItem("myenglish_theme_v1", "dark");
    localStorage.setItem("myenglish_gemini_api_key", "secret-test-key-123");

    await db.execute(`
      INSERT OR REPLACE INTO app_kv (key, value)
      VALUES ('myenglish_streak_v1', '15'),
             ('myenglish_ui_scale_v1', '1.1'),
             ('myenglish_theme_v1', 'dark');
    `);

    // 3. Track progress callback
    const stages: string[] = [];
    const success = await resetAllAppData({
      onProgress: (stage) => stages.push(stage),
    });

    expect(success).toBe(true);
    expect(stages.length).toBeGreaterThan(0);

    // 4. Verify learning tables are wiped
    const words = await db.select<Array<{ id: string }>>(`SELECT id FROM words WHERE id = 'user_test_word';`);
    expect(words).toHaveLength(0);

    const grammarProg = await db.select<Array<{ lesson_id: string }>>(`SELECT lesson_id FROM grammar_progress;`);
    expect(grammarProg).toHaveLength(0);

    const mistakes = await db.select<Array<{ id: string }>>(`SELECT id FROM mistakes;`);
    expect(mistakes).toHaveLength(0);

    const reviewLogs = await db.select<Array<{ id: string }>>(`SELECT id FROM review_logs;`);
    expect(reviewLogs).toHaveLength(0);

    // 5. Verify learning / onboarding keys are removed
    expect(localStorage.getItem("myenglish_onboarding_done_v1")).toBeNull();
    expect(localStorage.getItem(GRAMMAR_TENSES_INIT_KEY)).toBeNull();
    expect(localStorage.getItem("myenglish_streak_v1")).toBeNull();
    expect(localStorage.getItem("myenglish_xp_v1")).toBeNull();
    expect(localStorage.getItem("myenglish_study_levels_v1")).toBeNull();
    expect(localStorage.getItem("myenglish_grammar_path_excluded_v1")).toBeNull();

    const streakInDb = await db.select<Array<{ value: string }>>(`SELECT value FROM app_kv WHERE key = 'myenglish_streak_v1';`);
    expect(streakInDb).toHaveLength(0);

    // 6. Verify preserved preferences remain intact
    expect(localStorage.getItem("myenglish_ui_scale_v1")).toBe("1.1");
    expect(localStorage.getItem("myenglish_theme_v1")).toBe("dark");
    expect(localStorage.getItem("myenglish_gemini_api_key")).toBe("secret-test-key-123");

    const scaleInDb = await db.select<Array<{ value: string }>>(`SELECT value FROM app_kv WHERE key = 'myenglish_ui_scale_v1';`);
    expect(scaleInDb[0]?.value).toBe("1.1");

    // 7. Verify migration markers are recorded
    expect(localStorage.getItem(RELEASE_WIPE_VERSION_KEY)).toBe(TARGET_RELEASE_WIPE_VERSION);
    expect(localStorage.getItem(GRAMMAR_CONTENT_VERSION_KEY)).toBe(TARGET_GRAMMAR_CONTENT_VERSION);

    // 8. Verify fresh catalogs were re-seeded
    const vocabCount = await db.select<Array<{ n: number }>>(`SELECT count(*) as n FROM vocab_catalog;`);
    expect(vocabCount[0]?.n).toBeGreaterThan(0);

    const grammarCount = await db.select<Array<{ n: number }>>(`SELECT count(*) as n FROM grammar_book_chapters;`);
    expect(grammarCount[0]?.n).toBe(31);

    // 9. Verify onboarding and initial tenses flow will be triggered
    const { shouldShowOnboarding } = await import("@/services/onboarding");
    const { hasChosenInitialTenses } = await import("@/services/grammarPath");
    const userWordsCount = (await db.select<Array<{ n: number }>>(`SELECT count(*) as n FROM words;`))[0]?.n ?? 0;
    expect(userWordsCount).toBe(0);
    expect(shouldShowOnboarding(userWordsCount, false)).toBe(true);
    expect(hasChosenInitialTenses()).toBe(false);
  });
});
