/**
 * Switching to the bundled vocabulary deck: every word learnt before, with its cards and review history,
 * is deleted and the learner starts again from A1 (their choice when the deck was introduced). Grammar,
 * pronunciation, settings, streak, XP and badges are kept.
 */
import { getDatabase } from "./db";

/** localStorage keys that describe the old words (cleared in app_kv too, or the startup restore brings them back) */
const VOCAB_KEYS = [
  "myenglish_mnemonics_v1",
  "myenglish_starter_decks_v1",
  "myenglish_pending_requeue_attempts_v1",
  "myenglish_first_try_total_v1",
  // FSRS weights fitted to the old review history
  "myenglish_fsrs_weights_v1",
  "myenglish_study_levels_v1",
];

/** Words from before the deck (no catalog entry): the learner must go through the switch first */
export async function needsVocabMigration(): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ n: number }>>(`SELECT COUNT(*) AS n FROM words WHERE catalog_id IS NULL`);
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function resetVocabulary(): Promise<void> {
  const db = await getDatabase();
  for (const sql of [
    `DELETE FROM review_logs`,
    `DELETE FROM srs_production`,
    `DELETE FROM srs_reviews`,
    `DELETE FROM examples`,
    `DELETE FROM words`,
    `DELETE FROM learning_events WHERE word_id IS NOT NULL OR type IN ('mastered', 'pretest', 'encounter', 'known')`,
    `UPDATE mistakes SET word_id = NULL WHERE word_id IS NOT NULL`,
  ]) {
    await db.execute(sql);
  }
  await db.execute(`DELETE FROM app_kv WHERE key IN (${VOCAB_KEYS.map((_, i) => `$${i + 1}`).join(", ")})`, VOCAB_KEYS);
  for (const key of VOCAB_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
}
