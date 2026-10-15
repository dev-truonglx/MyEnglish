/**
 * Mirrors learning state kept in localStorage (XP, streak logs, grammar history, settings…)
 * into the SQLite `app_kv` table, so clearing WebView data no longer wipes progress.
 *
 * Services keep their synchronous localStorage API; this module only:
 *  - restores missing keys from SQLite before the app renders
 *  - backs up changed keys periodically and when the window is hidden/closed
 */
import { getDatabase } from "./db";

const KEY_PREFIX = "myenglish_";
// Secrets and per-device transient values are not mirrored
const EXCLUDED_KEYS = new Set(["myenglish_gemini_api_key", "myenglish_srs_last_trigger_ms"]);
const BACKUP_INTERVAL_MS = 60_000;

const lastBackedUp = new Map<string, string>();
let backupTimer: number | null = null;

function isBackedUpKey(key: string): boolean {
  return key.startsWith(KEY_PREFIX) && !EXCLUDED_KEYS.has(key);
}

/** Clear the in-memory cache of mirrored keys (used during full app data reset) */
export function clearBackupCache(): void {
  lastBackedUp.clear();
  pendingKeys.clear();
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

/** null when localStorage can't be read (never treat that as "every key was deleted") */
function readLocalEntries(): Array<[string, string]> | null {
  const entries: Array<[string, string]> = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !isBackedUpKey(key)) continue;
      const value = localStorage.getItem(key);
      if (value !== null) entries.push([key, value]);
    }
  } catch {
    return null;
  }
  return entries;
}

/**
 * Restore keys that are missing from localStorage. Existing local values always win.
 */
export async function restoreLocalStorageFromDb(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ key: string; value: string }[]>(`SELECT key, value FROM app_kv;`);
  let restored = 0;
  for (const row of rows) {
    if (!isBackedUpKey(row.key)) continue;
    lastBackedUp.set(row.key, row.value);
    try {
      if (localStorage.getItem(row.key) === null) {
        localStorage.setItem(row.key, row.value);
        restored++;
      }
    } catch {}
  }
  return restored;
}

/**
 * Write changed keys to SQLite and drop rows for keys removed from localStorage
 * (otherwise restore would bring deleted keys back on the next start).
 */
export async function backupLocalStorageToDb(): Promise<void> {
  const local = readLocalEntries();
  if (!local) return;
  const changed = local.filter(([key, value]) => lastBackedUp.get(key) !== value);
  const present = new Set(local.map(([key]) => key));
  const removed = [...lastBackedUp.keys()].filter((key) => !present.has(key));
  if (changed.length === 0 && removed.length === 0) return;

  const db = await getDatabase();
  if (removed.length > 0) {
    const placeholders = removed.map((_, i) => `$${i + 1}`).join(", ");
    await db.execute(`DELETE FROM app_kv WHERE key IN (${placeholders});`, removed);
    for (const key of removed) lastBackedUp.delete(key);
  }
  if (changed.length === 0) return;

  const now = new Date().toISOString();
  const params: unknown[] = [];
  const rows = changed.map(([key, value], i) => {
    params.push(key, value, now);
    const o = i * 3;
    return `($${o + 1}, $${o + 2}, $${o + 3})`;
  });
  await db.execute(
    `INSERT INTO app_kv (key, value, updated_at) VALUES ${rows.join(", ")}
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
    params
  );
  for (const [key, value] of changed) lastBackedUp.set(key, value);
}

/** Keys waiting for flushPersistedKeys, and when they are written */
const pendingKeys = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const PERSIST_DELAY_MS = 1500;
let flushOnHideInstalled = false;

/**
 * Write one key to SQLite soon (fire-and-forget). Used for progress that must survive a crash between
 * periodic backups (XP, daily activity / streak). Any window may call it. Writes are batched: grammar
 * answers update several large maps per answer, and each used to be a full-value upsert of its own.
 * Pending keys are also written when the window is hidden or closed.
 */
export function persistKeyNow(key: string): void {
  if (!isBackedUpKey(key)) return;
  pendingKeys.add(key);
  if (!flushOnHideInstalled && typeof document !== "undefined") {
    flushOnHideInstalled = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flushPersistedKeys();
    });
    window.addEventListener("pagehide", () => void flushPersistedKeys());
  }
  if (flushTimer === null) flushTimer = setTimeout(() => void flushPersistedKeys(), PERSIST_DELAY_MS);
}

/** Write the keys queued by persistKeyNow, with their current localStorage values, in one statement. */
export async function flushPersistedKeys(): Promise<void> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pendingKeys.size === 0) return;
  const keys = [...pendingKeys];
  pendingKeys.clear();
  const rows: Array<[string, string]> = [];
  for (const key of keys) {
    let value: string | null = null;
    try {
      value = localStorage.getItem(key);
    } catch {
      continue;
    }
    // Removed since (e.g. an app reset), or already written
    if (value === null || lastBackedUp.get(key) === value) continue;
    rows.push([key, value]);
  }
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const params: unknown[] = [];
  const values = rows.map(([key, value], i) => {
    params.push(key, value, now);
    const o = i * 3;
    return `($${o + 1}, $${o + 2}, $${o + 3})`;
  });
  try {
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO app_kv (key, value, updated_at) VALUES ${values.join(", ")}
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
      params
    );
    for (const [key, value] of rows) lastBackedUp.set(key, value);
  } catch {}
}

/** Run only in the main window after a successful restore (other windows share localStorage). */
export function startLocalStorageBackup(): void {
  if (backupTimer !== null) return;
  const run = () => {
    backupLocalStorageToDb().catch((err) => console.warn("localStorage backup failed:", err));
  };
  backupTimer = window.setInterval(run, BACKUP_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") run();
  });
  window.addEventListener("beforeunload", run);
  run();
}
