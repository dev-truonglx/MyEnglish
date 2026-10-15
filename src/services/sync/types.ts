/**
 * Cloud sync (Supabase). The local SQLite database stays the source of truth the app reads; sync only moves
 * rows between it and the account's `sync_rows` / `xp_daily` tables. Everything here talks to a SyncTransport,
 * so the engine is tested against an in-memory one.
 */

/** Row kinds stored in `sync_rows` (the server accepts only these) */
export type SyncKind = "word" | "card" | "log" | "event" | "mistake" | "grammar" | "kv";

export interface SyncRow {
  kind: SyncKind;
  /** Unique within the kind (and the account) */
  key: string;
  data: Record<string, unknown>;
  /** ISO time of the change on the device: the newer one wins */
  ts: string;
}

export interface PulledRow extends SyncRow {
  /** Server time of the write, the pull cursor */
  updated_at: string;
}

/** XP a device earned on a day (BASE_DAY = what it had before the first sync) */
export interface XpRow {
  device_id: string;
  day: string;
  xp: number;
}

export interface ProfileStats {
  level: number;
  streak: number;
}

export interface SyncTransport {
  push(rows: SyncRow[]): Promise<void>;
  /** Rows written after `since`, oldest first, at most `limit` */
  pull(since: string, limit: number): Promise<PulledRow[]>;
  pushXp(rows: XpRow[]): Promise<void>;
  /** Every device's rows; with `since`, only those written after it (each with its `updated_at`) */
  pullXp(since?: string | null): Promise<Array<XpRow & { updated_at?: string }>>;
  pushProfile(stats: ProfileStats): Promise<void>;
  /** The account's reset counter (bumped by sync_clear), or null when the server does not have it */
  getEpoch?(): Promise<number | null>;
}

export interface SyncReport {
  pushed: number;
  pulled: number;
  /** Rows that changed the local data */
  applied: number;
  xpChanged: boolean;
  /** Rows left out of the push (too large, bad key or time) */
  skipped?: number;
  /** The leaderboard row was written */
  profilePushed?: boolean;
  /** This machine's XP ledger went up to the account */
  xpPushed?: boolean;
  /** The server refused this machine's XP: the account already has XP from the most machines it allows */
  xpDeviceLimit?: boolean;
}

export const EMPTY_REPORT: SyncReport = { pushed: 0, pulled: 0, applied: 0, xpChanged: false };
