/**
 * One sync pass: push what changed here, exchange XP ledgers, pull what changed elsewhere. Safe to run any
 * time and as often as wanted: pushes and pulls are idempotent and resume from cursors kept in SQLite.
 */
import { getDatabase } from "../db";
import { getXPState } from "../smartReview";
import { computeStreak, getActivityLogs } from "../streak";
import { applyRows, createApplyContext } from "./apply";
import { notifyWordsChanged } from "../reviewRecorder";
import { COLLECTORS, collectKv, PUSH_BATCH } from "./collect";
import { EPOCH } from "./keys";
import {
  deleteSyncState,
  getDeviceId,
  getSyncedUserId,
  getSyncState,
  resetSyncCursors,
  setSyncedUserId,
  setSyncState,
} from "./state";
import type { SyncReport, SyncRow, SyncTransport, XpRow } from "./types";
import { applyRemoteXp, ensureLedger, ledgerRows } from "./xpLedger";

const PULL_PAGE = 500;
/** A pull restarts this far before its cursor: rows committed late by a concurrent transaction are not missed */
const PULL_OVERLAP_MS = 5000;

/** Thrown when this machine last synced with another account */
export class AccountMismatchError extends Error {
  constructor(public readonly previousUserId: string) {
    super("Máy này đã đồng bộ với một tài khoản khác");
    this.name = "AccountMismatchError";
  }
}

/** The account was reset ("reset all data") on another machine since this one last synced */
export class AccountResetElsewhereError extends Error {
  constructor() {
    super("Tài khoản đã được đặt lại từ một máy khác");
    this.name = "AccountResetElsewhereError";
  }
}

/** Largest `data` the server stores (0001: pg_column_size <= 20000); JSON text is kept under it with a margin */
const MAX_DATA_CHARS = 16000;
/** Rows that could not be placed yet (their word is unknown here), kept across passes and crashes */
const DEFERRED_KEY = "pull:deferred";
const MAX_DEFERRED = 2000;

/**
 * A row the server will accept as it is, or null. A free word with many examples is shortened (examples
 * dropped from the end) rather than refused; anything else too large or with a bad key / time is left out:
 * the server would drop it silently, or fail the whole batch on a bad time.
 */
export function fitRow(row: SyncRow): SyncRow | null {
  if (!row.key || row.key.length > 200 || !Number.isFinite(Date.parse(row.ts))) return null;
  if (JSON.stringify(row.data).length <= MAX_DATA_CHARS) return row;
  const examples = Array.isArray(row.data.examples) ? [...(row.data.examples as unknown[])] : null;
  if (!examples) return null;
  while (examples.length > 0) {
    examples.pop();
    const data = { ...row.data, examples };
    if (JSON.stringify(data).length <= MAX_DATA_CHARS) return { ...row, data };
  }
  return null;
}

/** The account this machine's cursors belong to, or null when it never synced */
export const syncedAccount = getSyncedUserId;

/** Start syncing with `userId`: forget the cursors, so everything here is pushed and everything there pulled. */
export async function adoptAccount(userId: string): Promise<void> {
  await resetSyncCursors();
  await setSyncedUserId(userId);
}

/** Streak of the learner, for their profile row */
export function currentStreak(now: Date = new Date()): number {
  const logs = getActivityLogs();
  return computeStreak(Object.keys(logs).filter((d) => Number(logs[d]) > 0), now).current;
}

async function pushKind(
  transport: SyncTransport,
  kind: string,
  pages: AsyncGenerator<SyncRow[]>,
  startedAt: string,
  report: SyncReport
): Promise<number> {
  let pushed = 0;
  for await (const page of pages) {
    const rows = page.map(fitRow).filter((r): r is SyncRow => r !== null);
    report.skipped = (report.skipped ?? 0) + page.length - rows.length;
    for (let i = 0; i < rows.length; i += PUSH_BATCH) {
      const chunk = rows.slice(i, i + PUSH_BATCH);
      await transport.push(chunk);
      pushed += chunk.length;
    }
  }
  // Rows changed while this ran are after `startedAt` and go in the next pass
  await setSyncState(`push:${kind}`, startedAt);
  return pushed;
}

export async function syncNow(transport: SyncTransport, userId: string): Promise<SyncReport> {
  const previous = await getSyncedUserId();
  if (previous && previous !== userId) throw new AccountMismatchError(previous);
  if (!previous) await setSyncedUserId(userId);

  // "Reset all data" on another machine bumps the account's epoch: pushing this machine's copy now would
  // bring back what was erased, so the learner chooses first (as for another account)
  const epoch = transport.getEpoch ? await transport.getEpoch() : null;
  if (epoch !== null) {
    const known = await getSyncState("epoch");
    if (known === null) await setSyncState("epoch", String(epoch));
    else if (epoch > Number(known)) throw new AccountResetElsewhereError();
  }

  const db = await getDatabase();
  const deviceId = await getDeviceId();
  // Before any pulled XP is merged in: the device's own earnings must be separable from other devices'
  const ledger = ensureLedger();
  const report: SyncReport = { pushed: 0, pulled: 0, applied: 0, xpChanged: false };

  // 1. Push
  for (const { kind, cursor, collect } of COLLECTORS) {
    const startedAt = new Date().toISOString();
    const since = (await getSyncState(`push:${cursor ?? kind}`)) ?? EPOCH;
    report.pushed += await pushKind(transport, cursor ?? kind, collect(db, since), startedAt, report);
  }
  const kv = await collectKv();
  if (kv.rows.length > 0) {
    for (let i = 0; i < kv.rows.length; i += PUSH_BATCH) await transport.push(kv.rows.slice(i, i + PUSH_BATCH));
    report.pushed += kv.rows.length;
  }
  await kv.commit();

  // 2. XP: the ledger up (when it changed), everyone's ledgers down
  const rows = ledgerRows(deviceId, ledger);
  const fingerprint = JSON.stringify(rows);
  if (fingerprint !== (await getSyncState("xp_pushed"))) {
    try {
      await transport.pushXp(rows);
      await setSyncState("xp_pushed", fingerprint);
      report.xpPushed = true;
    } catch (err) {
      // Too many machines on the account: this one's XP stays off the board (retried next pass), progress
      // still syncs
      if (!/device limit/i.test(String((err as { message?: string })?.message ?? err))) throw err;
      report.xpDeviceLimit = true;
    }
  }
  report.xpChanged = applyRemoteXp(await pullXpChanges(transport), deviceId);

  // 3. Pull. One context for the whole pull (the word index is read once); the windows are told once at the end.
  const ctx = await createApplyContext();
  const cursor = await getSyncState("pull");
  let since = cursor ? new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString() : EPOCH;
  let deferred: SyncRow[] = await readDeferred();
  for (;;) {
    const page = await transport.pull(since, PULL_PAGE);
    if (page.length === 0) break;
    const result = await applyRows(page, ctx);
    report.pulled += page.length;
    report.applied += result.applied;
    if (result.deferred.length > 0) {
      deferred = deferred.concat(result.deferred);
      // Saved before the cursor moves past them: a crash before the retry below must not lose them
      await writeDeferred(deferred);
    }
    const last = page[page.length - 1].updated_at;
    await setSyncState("pull", last);
    if (page.length < PULL_PAGE || last === since) break;
    since = last;
  }
  if (deferred.length > 0) {
    const retry = await applyRows(deferred, ctx);
    report.applied += retry.applied;
    // Still unknown (a deck word this machine's deck lacks): kept for later passes
    await writeDeferred(retry.deferred);
  }
  if (ctx.wordsChanged) notifyWordsChanged();

  // 4. Profile (leaderboard row), only when it changed
  const profile = { level: getXPState().level, streak: currentStreak() };
  const profileFingerprint = JSON.stringify(profile);
  if (profileFingerprint !== (await getSyncState("profile_pushed"))) {
    await transport.pushProfile(profile);
    await setSyncState("profile_pushed", profileFingerprint);
    report.profilePushed = true;
  }
  await setSyncState("last_sync_at", new Date().toISOString());
  return report;
}

export const getLastSyncAt = () => getSyncState("last_sync_at");

async function readDeferred(): Promise<SyncRow[]> {
  try {
    const raw = await getSyncState(DEFERRED_KEY);
    return raw ? (JSON.parse(raw) as SyncRow[]) : [];
  } catch {
    return [];
  }
}

async function writeDeferred(rows: SyncRow[]): Promise<void> {
  if (rows.length === 0) await deleteSyncState(DEFERRED_KEY);
  else await setSyncState(DEFERRED_KEY, JSON.stringify(rows.slice(-MAX_DEFERRED)));
}

/**
 * Every device's XP rows, read incrementally: only rows written since the last pass come down, merged into the
 * copy kept from earlier passes (the totals need all of them).
 */
async function pullXpChanges(transport: SyncTransport): Promise<XpRow[]> {
  const cursor = await getSyncState("xp_pull");
  let cache: Record<string, XpRow> = {};
  try {
    cache = cursor ? (JSON.parse((await getSyncState("xp_remote")) ?? "{}") as Record<string, XpRow>) : {};
  } catch {
    cache = {};
  }
  const since = cursor ? new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString() : null;
  const rows = await transport.pullXp(since);
  let latest = cursor;
  for (const r of rows as Array<XpRow & { updated_at?: string }>) {
    const id = `${r.device_id}|${r.day}`;
    cache[id] = { device_id: r.device_id, day: r.day, xp: Math.max(Number(r.xp) || 0, cache[id]?.xp ?? 0) };
    if (r.updated_at && (!latest || r.updated_at > latest)) latest = r.updated_at;
  }
  // A transport without times (an old server answer) gives no cursor: next pass reads everything again
  if (latest && rows.every((r) => (r as { updated_at?: string }).updated_at)) {
    await setSyncState("xp_remote", JSON.stringify(cache));
    await setSyncState("xp_pull", latest);
  }
  return Object.values(cache);
}

/**
 * Sign-out: local data stays, and so does the account this machine's data belongs to (user id and cursors).
 * Signing in again with the same account resumes where it stopped; another account gets the merge / wipe
 * choice (AccountMismatchError) instead of silently receiving this machine's data.
 */
export async function forgetAccount(): Promise<void> {
  await deleteSyncState("last_sync_at");
}
