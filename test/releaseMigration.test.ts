import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ensureReleaseMigrationV27,
  RELEASE_WIPE_VERSION_KEY,
  TARGET_RELEASE_WIPE_VERSION,
} from "@/services/releaseMigration";

describe("ensureReleaseMigrationV27", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("wipes legacy tables and re-seeds fresh data on first run", async () => {
    vi.resetModules();
    const { getDatabase } = await import("@/services/db");
    const { ensureReleaseMigrationV27, RELEASE_WIPE_VERSION_KEY, TARGET_RELEASE_WIPE_VERSION } = await import("@/services/releaseMigration");
    const db = await getDatabase();

    // Insert dummy legacy word and progress
    await db.execute(`
      INSERT OR REPLACE INTO words (id, word, meaning_vn)
      VALUES ('legacy_word_1', 'legacy', 'từ cũ');
    `);
    await db.execute(`
      INSERT OR REPLACE INTO grammar_progress (lesson_id, mastery)
      VALUES ('legacy_lesson_1', 90);
    `);
    await db.execute(`
      INSERT OR REPLACE INTO app_kv (key, value)
      VALUES ('myenglish_old_setting', '123');
    `);
    localStorage.setItem("myenglish_old_setting", "123");

    // Run release migration
    const wiped = await ensureReleaseMigrationV27();
    expect(wiped).toBe(true);

    // Verify legacy word and grammar progress are wiped
    const words = await db.select<Array<{ id: string }>>(`SELECT id FROM words WHERE id = 'legacy_word_1';`);
    expect(words).toHaveLength(0);

    const prog = await db.select<Array<{ lesson_id: string }>>(`SELECT lesson_id FROM grammar_progress;`);
    expect(prog).toHaveLength(0);

    // Verify old app_kv key is deleted
    const oldKv = await db.select<Array<{ key: string }>>(`SELECT key FROM app_kv WHERE key = 'myenglish_old_setting';`);
    expect(oldKv).toHaveLength(0);
    expect(localStorage.getItem("myenglish_old_setting")).toBeNull();

    // Verify release version marker is set
    expect(localStorage.getItem(RELEASE_WIPE_VERSION_KEY)).toBe(TARGET_RELEASE_WIPE_VERSION);
    const markerKv = await db.select<Array<{ value: string }>>(`SELECT value FROM app_kv WHERE key = $1;`, [RELEASE_WIPE_VERSION_KEY]);
    expect(markerKv[0]?.value).toBe(TARGET_RELEASE_WIPE_VERSION);

    // Verify fresh catalogs were seeded
    const catalogWords = await db.select<Array<{ n: number }>>(`SELECT count(*) as n FROM vocab_catalog;`);
    expect(catalogWords[0]?.n).toBeGreaterThan(0);

    const grammarChs = await db.select<Array<{ n: number }>>(`SELECT count(*) as n FROM grammar_book_chapters;`);
    expect(grammarChs[0]?.n).toBe(31);
  });

  it("skips wiping and does nothing if version marker is already present", async () => {
    vi.resetModules();
    const { getDatabase } = await import("@/services/db");
    const { ensureReleaseMigrationV27, RELEASE_WIPE_VERSION_KEY, TARGET_RELEASE_WIPE_VERSION } = await import("@/services/releaseMigration");
    const db = await getDatabase();

    // Pre-set marker
    localStorage.setItem(RELEASE_WIPE_VERSION_KEY, TARGET_RELEASE_WIPE_VERSION);
    await db.execute(`
      INSERT OR REPLACE INTO app_kv (key, value)
      VALUES ($1, $2);
    `, [RELEASE_WIPE_VERSION_KEY, TARGET_RELEASE_WIPE_VERSION]);

    // Insert user word
    await db.execute(`
      INSERT OR REPLACE INTO words (id, word, meaning_vn)
      VALUES ('new_user_word', 'future', 'tương lai');
    `);

    // Run release migration
    const wiped = await ensureReleaseMigrationV27();
    expect(wiped).toBe(false);

    // User word is still intact!
    const words = await db.select<Array<{ id: string }>>(`SELECT id FROM words WHERE id = 'new_user_word';`);
    expect(words).toHaveLength(1);
  });
});
