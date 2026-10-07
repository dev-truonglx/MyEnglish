/**
 * Learning moments and reminder outcomes, stored in SQLite (`learning_events`):
 *  - "mastered": a card reached long-term memory (stability crossed MATURE_STABILITY_DAYS)
 *  - reminder funnel: nudge shown / opened / quiz answered / snoozed / ignored; popup shown / completed /
 *    closed early / snoozed; flashcard session completed
 *  - "pretest": the meaning of a new word guessed before its introduction (meta.correct)
 *  - "encounter": a word being learned met in real text (reading mode), exposure only
 * Used to celebrate progress that matters and to show when the learner actually studies.
 */
import { getDatabase } from "./db";
import type { CardDirection } from "@/types/database";

export type LearningEventType =
  | "mastered"
  | "nudge_shown"
  | "nudge_opened"
  | "nudge_quiz"
  | "nudge_snoozed"
  | "nudge_ignored"
  | "popup_shown"
  | "popup_completed"
  | "popup_closed_early"
  | "popup_snoozed"
  | "session_completed"
  | "pretest"
  | "encounter";

export interface LearningEvent {
  type: LearningEventType;
  at: string;
  wordId?: string | null;
  direction?: CardDirection | null;
  meta?: Record<string, unknown> | null;
}

/** Fire-and-forget: an event that fails to save must never break studying */
export function logLearningEvent(
  type: LearningEventType,
  data: { wordId?: string; direction?: CardDirection; meta?: Record<string, unknown>; at?: Date } = {}
): Promise<void> {
  return getDatabase()
    .then((db) =>
      db.execute(`INSERT INTO learning_events (id, type, word_id, direction, at, meta) VALUES ($1, $2, $3, $4, $5, $6)`, [
        crypto.randomUUID(),
        type,
        data.wordId ?? null,
        data.direction ?? null,
        (data.at ?? new Date()).toISOString(),
        data.meta ? JSON.stringify(data.meta) : null,
      ])
    )
    .then(() => undefined)
    .catch((err) => console.warn("Learning event not saved:", err));
}

export async function getLearningEventsSince(since: Date, types?: LearningEventType[]): Promise<LearningEvent[]> {
  const db = await getDatabase();
  const filter = types && types.length > 0 ? ` AND type IN (${types.map((_, i) => `$${i + 2}`).join(", ")})` : "";
  const rows = await db.select<Array<{ type: string; at: string; word_id: string | null; direction: string | null; meta: string | null }>>(
    `SELECT type, at, word_id, direction, meta FROM learning_events WHERE at >= $1${filter} ORDER BY at`,
    [since.toISOString(), ...(types ?? [])]
  );
  return rows.map((r) => {
    let meta: Record<string, unknown> | null = null;
    try {
      meta = r.meta ? JSON.parse(r.meta) : null;
    } catch {}
    return { type: r.type as LearningEventType, at: r.at, wordId: r.word_id, direction: r.direction as CardDirection | null, meta };
  });
}
