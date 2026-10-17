/**
 * Introductions of new words, read from the review log. Needs only the database, so smartReview (budget of
 * new cards) and the sessions import it without going through reviewRecorder.
 */
import { getDatabase } from "./db";

/**
 * Introductions shown recently, keyed "wordId:direction" -> time (ms). Lets any window know a new word was
 * already introduced, so its next appearance is the graded quiz rather than another introduction.
 */
export async function getRecentIntros(withinMs: number = 24 * 60 * 60 * 1000, now: Date = new Date()): Promise<Map<string, number>> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ word_id: string; direction: string | null; last: string }>>(
    `SELECT word_id, COALESCE(direction, 'recognition') AS direction, MAX(timestamp) AS last
     FROM review_logs WHERE exercise_type = 'intro' AND timestamp >= $1
     GROUP BY word_id, COALESCE(direction, 'recognition')`,
    [new Date(now.getTime() - withinMs).toISOString()]
  );
  const map = new Map<string, number>();
  for (const r of rows) {
    const t = new Date(r.last).getTime();
    if (Number.isFinite(t)) map.set(`${r.word_id}:${r.direction ?? "recognition"}`, t);
  }
  return map;
}
