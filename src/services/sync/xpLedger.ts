/**
 * XP ledger of this device: what it earned each day, kept next to the running XP total. The account's XP is the
 * sum over its devices' ledgers (one `xp_daily` row per device and day), so two machines used on the same day add
 * up instead of overwriting each other, and the leaderboard can sum any period.
 *
 * `BASE_DAY` holds the XP the device had before the ledger existed (older than the daily log).
 */
import { persistKeyNow } from "../storageBackup";
import type { XpRow } from "./types";

export const XP_TOTAL_KEY = "myenglish_xp_v1";
export const XP_DAILY_LOG_KEY = "myenglish_xp_log_v1";
export const XP_LEDGER_KEY = "myenglish_xp_device_v1";
export const BASE_DAY = "0001-01-01";

type DayMap = Record<string, number>;

function readMap(key: string): DayMap | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as DayMap) : null;
  } catch {
    return null;
  }
}

function readTotal(): number {
  try {
    return parseInt(localStorage.getItem(XP_TOTAL_KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

const sum = (m: DayMap) => Object.values(m).reduce((a, b) => a + (Number(b) || 0), 0);

/** The ledger a device starts with: its daily log, plus what the total holds beyond it */
export function initialLedger(total: number, log: DayMap): DayMap {
  const ledger: DayMap = {};
  for (const [day, xp] of Object.entries(log)) if (Number(xp) > 0) ledger[day] = Number(xp);
  const rest = total - sum(ledger);
  if (rest > 0) ledger[BASE_DAY] = rest;
  return ledger;
}

/** The device's ledger, created from the current XP state the first time it is needed */
export function ensureLedger(): DayMap {
  const existing = readMap(XP_LEDGER_KEY);
  if (existing) return existing;
  const ledger = initialLedger(readTotal(), readMap(XP_DAILY_LOG_KEY) ?? {});
  try {
    localStorage.setItem(XP_LEDGER_KEY, JSON.stringify(ledger));
    persistKeyNow(XP_LEDGER_KEY);
  } catch {}
  return ledger;
}

/**
 * Called by awardXP with the state from BEFORE the award, so a device that has never synced still brings its
 * earlier XP along when its ledger is created.
 */
export function recordXpEarned(day: string, amount: number, before: { total: number; log: DayMap }): void {
  try {
    const ledger = readMap(XP_LEDGER_KEY) ?? initialLedger(before.total, before.log);
    ledger[day] = (ledger[day] || 0) + amount;
    localStorage.setItem(XP_LEDGER_KEY, JSON.stringify(ledger));
    persistKeyNow(XP_LEDGER_KEY);
  } catch {}
}

export function ledgerRows(deviceId: string, ledger: DayMap = ensureLedger()): XpRow[] {
  return Object.entries(ledger)
    .filter(([, xp]) => Number(xp) > 0)
    .map(([day, xp]) => ({ device_id: deviceId, day, xp: Math.round(Number(xp)) }));
}

export interface MergedXp {
  total: number;
  log: DayMap;
}

/**
 * Local XP state combined with every device's ledger. XP never goes down: where the local state is higher
 * (a total restored from a backup, say) it is kept.
 */
export function mergeXp(remote: XpRow[], deviceId: string, ledger: DayMap, local: MergedXp): MergedXp {
  const perDevice = new Map<string, DayMap>();
  for (const r of remote) {
    const m = perDevice.get(r.device_id) ?? {};
    m[r.day] = Math.max(m[r.day] || 0, r.xp);
    perDevice.set(r.device_id, m);
  }
  const own = perDevice.get(deviceId) ?? {};
  for (const [day, xp] of Object.entries(ledger)) own[day] = Math.max(own[day] || 0, Number(xp) || 0);
  perDevice.set(deviceId, own);

  const days: DayMap = {};
  let base = 0;
  for (const m of perDevice.values()) {
    for (const [day, xp] of Object.entries(m)) {
      if (day === BASE_DAY) base += xp;
      else days[day] = (days[day] || 0) + xp;
    }
  }
  const log: DayMap = { ...local.log };
  for (const [day, xp] of Object.entries(days)) log[day] = Math.max(log[day] || 0, xp);
  return { total: Math.max(local.total, base + sum(days)), log };
}

/** Pulled XP merged into the local state. Returns whether anything changed (and tells open screens). */
export function applyRemoteXp(remote: XpRow[], deviceId: string): boolean {
  const ledger = ensureLedger();
  const local: MergedXp = { total: readTotal(), log: readMap(XP_DAILY_LOG_KEY) ?? {} };
  const merged = mergeXp(remote, deviceId, ledger, local);
  const changed = merged.total !== local.total || JSON.stringify(merged.log) !== JSON.stringify(local.log);
  if (!changed) return false;
  try {
    localStorage.setItem(XP_TOTAL_KEY, String(merged.total));
    localStorage.setItem(XP_DAILY_LOG_KEY, JSON.stringify(merged.log));
    persistKeyNow(XP_TOTAL_KEY);
    persistKeyNow(XP_DAILY_LOG_KEY);
    window.dispatchEvent(
      new CustomEvent("myenglish-xp-updated", { detail: { amount: 0, totalXP: merged.total, leveledUp: false } })
    );
  } catch {}
  return true;
}
