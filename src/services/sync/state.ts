/** Sync cursors and the device id, kept in SQLite (`sync_state`): they must survive a WebView data wipe. */
import { getDatabase } from "../db";

export async function getSyncState(key: string): Promise<string | null> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ value: string }>>(`SELECT value FROM sync_state WHERE key = $1`, [key]);
  return rows[0]?.value ?? null;
}

export async function setSyncState(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO sync_state (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export async function deleteSyncState(prefix: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM sync_state WHERE key LIKE $1`, [`${prefix}%`]);
}

/** Identifies this installation in the XP ledger */
export async function getDeviceId(): Promise<string> {
  const existing = await getSyncState("device_id");
  if (existing) return existing;
  const id = crypto.randomUUID();
  await setSyncState("device_id", id);
  return id;
}

/** The account the cursors belong to (null before the first sync) */
export const getSyncedUserId = () => getSyncState("user_id");
export const setSyncedUserId = (id: string) => setSyncState("user_id", id);

/** Forget what was pushed/pulled: the next sync is a full one (state kept: device id) */
export async function resetSyncCursors(): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM sync_state WHERE key NOT IN ('device_id')`);
}

/** Push everything again on the next pass (after rows were added outside the app's own writes, e.g. a restored backup) */
export async function resetPushCursors(): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM sync_state WHERE key LIKE 'push:%' OR key = 'xp_pushed'`);
}
