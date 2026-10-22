import type { WordDetail } from "@/types/database";
import { persistKeyNow } from "./storageBackup";

const REVIEWS_STORAGE_KEY = "myenglish_study_logs_v1";
const GOAL_STORAGE_KEY = "myenglish_daily_goal_v1";
const DEFAULT_DAILY_GOAL = 10;

export interface DailyActivityLog {
  [dateStr: string]: number; // "YYYY-MM-DD": count
}

export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
  todayCount: number;
  dailyGoal: number;
  goalReached: boolean;
  goalPercentage: number;
  /** Streak freezes in stock: a missed day is covered automatically while one is left */
  freezesAvailable: number;
  /** Missed days inside the current streak that a freeze covered */
  frozenDates: string[];
  /** Missed days inside the current streak that a streak repair covered */
  repairedDates?: string[];
  /** Yesterday broke the streak and today can still repair it (see StreakResult.repairable) */
  streakRepair?: { missedDay: string; streak: number; target: number } | null;
  /** Words with a card due right now, when known (0 = everything due was reviewed) */
  dueRemaining: number | null;
}

/** Every this many active days in a streak earns one freeze ... */
export const FREEZE_EVERY_DAYS = 7;
/** ... up to this many in stock */
export const MAX_FREEZES = 2;

/** Days a daily-quest chest granted a bonus freeze ("YYYY-MM-DD"), kept apart from the earned ones */
export const BONUS_FREEZES_KEY = "myenglish_bonus_freezes_v1";

export function readBonusFreezeDates(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(BONUS_FREEZES_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((d): d is string => typeof d === "string") : [];
  } catch {
    return [];
  }
}

/** Record a bonus freeze granted today (one per day at most) */
export function addBonusFreeze(day: string): void {
  try {
    const dates = readBonusFreezeDates();
    if (dates.includes(day)) return;
    localStorage.setItem(BONUS_FREEZES_KEY, JSON.stringify([...dates, day]));
    persistKeyNow(BONUS_FREEZES_KEY);
    window.dispatchEvent(new CustomEvent("myenglish-activity-updated"));
  } catch {}
}

/**
 * Missed days covered by a streak repair ("YYYY-MM-DD"): the streak broke on that one day with no freeze left,
 * and the learner made up for it the day after by answering STREAK_REPAIR_GOAL_FACTOR × the daily goal
 */
export const STREAK_REPAIRS_KEY = "myenglish_streak_repairs_v1";
/** A repair asks for this many times the daily goal, on the day right after the missed day only */
export const STREAK_REPAIR_GOAL_FACTOR = 2;

export function readStreakRepairDates(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STREAK_REPAIRS_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((d): d is string => typeof d === "string") : [];
  } catch {
    return [];
  }
}

/** Record a repaired day; false when it was already recorded or storage failed */
function saveStreakRepair(day: string): boolean {
  try {
    const dates = readStreakRepairDates();
    if (dates.includes(day)) return false;
    localStorage.setItem(STREAK_REPAIRS_KEY, JSON.stringify([...dates, day]));
    persistKeyNow(STREAK_REPAIRS_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Answers asked today to repair yesterday */
export function streakRepairTarget(dailyGoal: number): number {
  return Math.max(1, dailyGoal) * STREAK_REPAIR_GOAL_FACTOR;
}

export interface StreakResult {
  current: number;
  longest: number;
  freezes: number;
  frozenDates: string[];
  /** Missed days inside the current streak that a streak repair covered */
  repairedDates: string[];
  /**
   * Yesterday was the one missed day that ended a streak of `streak` days (no freeze left, the day before was
   * studied): it can still be repaired today. null otherwise.
   */
  repairable: { missedDay: string; streak: number } | null;
}

/**
 * Streak over local dates with activity. Today without activity yet does not break it.
 * Each FREEZE_EVERY_DAYS active days earn a freeze (max MAX_FREEZES) that covers one missed day,
 * so one busy day does not wipe out weeks of habit. Frozen days keep the streak but don't add to it.
 * A bonus freeze (daily-quest chest) adds one to the stock on its active day, within the same cap.
 * A repaired day (STREAK_REPAIRS_KEY) is covered like a frozen day, without using a freeze.
 */
export function computeStreak(
  activeDates: Iterable<string>,
  today: Date = new Date(),
  bonusFreezeDates: Iterable<string> = readBonusFreezeDates(),
  repairDates: Iterable<string> = readStreakRepairDates()
): StreakResult {
  const active = new Set(activeDates);
  const bonus = new Set(bonusFreezeDates);
  const repaired = new Set(repairDates);
  const todayStr = getLocalDateString(today);
  const sorted = Array.from(active).filter((d) => d <= todayStr).sort();
  const result: StreakResult = { current: 0, longest: 0, freezes: 0, frozenDates: [], repairedDates: [], repairable: null };
  if (sorted.length === 0) return result;

  const [y, m, d] = sorted[0].split("-").map(Number);
  const day = new Date(y, m - 1, d);
  let activeInRun = 0;
  let previous: string | null = null;
  let lastBreak: StreakResult["repairable"] = null;
  for (let s = getLocalDateString(day); s <= todayStr; day.setDate(day.getDate() + 1), s = getLocalDateString(day)) {
    if (active.has(s)) {
      result.current++;
      activeInRun++;
      if (activeInRun % FREEZE_EVERY_DAYS === 0) result.freezes = Math.min(MAX_FREEZES, result.freezes + 1);
    } else if (s !== todayStr) {
      // A repair was recorded because no freeze was left that day: it must not take a freeze synced in later
      if (result.current > 0 && repaired.has(s)) {
        result.repairedDates.push(s);
      } else if (result.current > 0 && result.freezes > 0) {
        result.freezes--;
        result.frozenDates.push(s);
      } else {
        // Only a single missed day right after a study day can be repaired (two in a row cannot)
        lastBreak = result.current > 0 && previous !== null && active.has(previous) ? { missedDay: s, streak: result.current } : null;
        result.current = 0;
        activeInRun = 0;
        result.frozenDates = [];
        result.repairedDates = [];
      }
    }
    if (bonus.has(s) && (active.has(s) || s === todayStr)) result.freezes = Math.min(MAX_FREEZES, result.freezes + 1);
    result.longest = Math.max(result.longest, result.current);
    previous = s;
  }
  const yesterday = getLocalDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  result.repairable = lastBreak?.missedDay === yesterday ? lastBreak : null;
  return result;
}

function activeDaysOf(logs: DailyActivityLog): string[] {
  return Object.keys(logs).filter((d) => (logs[d] || 0) > 0);
}

/**
 * Repair yesterday when today's answers reached streakRepairTarget and yesterday alone broke the streak.
 * Returns whether a repair was recorded.
 */
function repairStreakIfEarned(logs: DailyActivityLog, now: Date): boolean {
  if ((logs[getLocalDateString(now)] || 0) < streakRepairTarget(getDailyGoal())) return false;
  const offer = computeStreak(activeDaysOf(logs), now).repairable;
  return !!offer && saveStreakRepair(offer.missedDay);
}

/** Last frozen day the Today tab announced (per machine: each one shows the notice once) */
const FREEZE_NOTICE_KEY = "myenglish_freeze_notice_v1";
/** Frozen days older than this are not announced any more */
const FREEZE_NOTICE_MAX_AGE_DAYS = 7;

export function readFreezeNoticeDay(): string | null {
  try {
    return localStorage.getItem(FREEZE_NOTICE_KEY);
  } catch {
    return null;
  }
}

export function markFreezeNoticeSeen(day: string): void {
  try {
    const seen = readFreezeNoticeDay();
    if (!seen || day > seen) localStorage.setItem(FREEZE_NOTICE_KEY, day);
  } catch {}
}

/**
 * Frozen days of the current streak not announced yet, oldest first. computeStreak uses a freeze silently, so
 * the learner would only see a smaller freeze count: the Today tab says once which day a freeze kept.
 */
export function unannouncedFrozenDays(
  frozenDates: readonly string[],
  today: Date = new Date(),
  seen: string | null = readFreezeNoticeDay()
): string[] {
  const todayStr = getLocalDateString(today);
  const oldest = getLocalDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - FREEZE_NOTICE_MAX_AGE_DAYS));
  return frozenDates.filter((d) => d < todayStr && d >= oldest && (!seen || d > seen)).sort();
}

/** "hôm qua" for yesterday, else "19/10" */
function shortDayLabel(day: string, today: Date): string {
  const yesterday = getLocalDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  if (day === yesterday) return "hôm qua";
  const [, m, d] = day.split("-").map(Number);
  return `${d}/${m}`;
}

/** The one-time line about freezes that kept the streak ("🧊 Đóng băng đã giữ chuỗi hôm qua") */
export function freezeNoticeText(days: readonly string[], today: Date = new Date()): string {
  const labels = days.map((d) => shortDayLabel(d, today));
  if (days.length === 1) return `🧊 Đóng băng đã giữ chuỗi ${labels[0] === "hôm qua" ? labels[0] : `ngày ${labels[0]}`}`;
  return `🧊 ${days.length} lượt đóng băng đã giữ chuỗi (${labels.join(", ")})`;
}

/**
 * Get current date string formatted as YYYY-MM-DD in local timezone
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

let cachedActivityRaw: string | null = null;
let cachedActivityLogs: DailyActivityLog = {};

/**
 * Read activity logs from localStorage
 */
export function getActivityLogs(): DailyActivityLog {
  try {
    const raw = localStorage.getItem(REVIEWS_STORAGE_KEY);
    if (raw === cachedActivityRaw) return { ...cachedActivityLogs };
    cachedActivityRaw = raw;
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    // A stored "null", an array or a number would break Object.entries / property access in render
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      cachedActivityLogs = {};
      return {};
    }
    const logs: DailyActivityLog = {};
    for (const [day, count] of Object.entries(parsed)) {
      if (typeof count === "number" && Number.isFinite(count)) logs[day] = count;
    }
    cachedActivityLogs = logs;
    return { ...logs };
  } catch {
    cachedActivityRaw = null;
    cachedActivityLogs = {};
    return {};
  }
}

/**
 * Record a study activity (review completed or word added)
 */
export function recordDailyActivity(count: number = 1): void {
  try {
    const logs = getActivityLogs();
    const today = getLocalDateString();
    logs[today] = (logs[today] || 0) + count;
    const raw = JSON.stringify(logs);
    cachedActivityRaw = raw;
    cachedActivityLogs = logs;
    localStorage.setItem(REVIEWS_STORAGE_KEY, raw);
    persistKeyNow(REVIEWS_STORAGE_KEY);
    // The answer that reaches twice the goal on the day after a missed day repairs the streak
    repairStreakIfEarned(logs, new Date());
    window.dispatchEvent(new CustomEvent("myenglish-activity-updated"));
  } catch (err) {
    console.warn("Failed to record activity log:", err);
  }
}

/**
 * Get configured daily goal
 */
export function getDailyGoal(): number {
  try {
    const raw = localStorage.getItem(GOAL_STORAGE_KEY);
    const parsed = raw ? parseInt(raw, 10) : DEFAULT_DAILY_GOAL;
    return isNaN(parsed) || parsed <= 0 ? DEFAULT_DAILY_GOAL : parsed;
  } catch {
    return DEFAULT_DAILY_GOAL;
  }
}

/**
 * Set configured daily goal
 */
export function setDailyGoal(goal: number): void {
  try {
    localStorage.setItem(GOAL_STORAGE_KEY, String(Math.max(1, goal)));
    persistKeyNow(GOAL_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("myenglish-activity-updated"));
  } catch (err) {
    console.warn("Failed to save daily goal:", err);
  }
}

/**
 * Calculate streak and goal progress by merging word creation dates and study activity logs
 */
const CREATED_AT_BACKFILL_KEY = "myenglish_streak_created_backfill_v1";

/**
 * One-time migration: keep streaks earned before word creation stopped counting,
 * by copying past (not today's) word-creation days into the activity log.
 */
function backfillActivityFromWordsOnce(words: WordDetail[], activityMap: Map<string, number>): void {
  try {
    if (localStorage.getItem(CREATED_AT_BACKFILL_KEY) || words.length === 0) return;
    const logs = getActivityLogs();
    const today = getLocalDateString();
    for (const w of words) {
      if (w.catalog_id != null && !w.srs?.last_review && !((w.srs?.reps ?? 0) > 0)) continue;
      if (!w.created_at) continue;
      const d = new Date(w.created_at);
      if (isNaN(d.getTime())) continue;
      const dateStr = getLocalDateString(d);
      if (dateStr === today || logs[dateStr]) continue;
      logs[dateStr] = 1;
      activityMap.set(dateStr, (activityMap.get(dateStr) || 0) + 1);
    }
    cachedActivityLogs = logs;
    localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(logs));
    localStorage.setItem(CREATED_AT_BACKFILL_KEY, "1");
    persistKeyNow(REVIEWS_STORAGE_KEY);
    persistKeyNow(CREATED_AT_BACKFILL_KEY);
  } catch {}
}

/**
 * Streak (with freezes and repairs) and today's goal. The goal is reached with `dailyGoal` answers, or as soon
 * as every due word has been reviewed today (`dueRemaining` = 0): nothing left to do is a success.
 */
export function calculateStreakAndGoal(words: WordDetail[], dueRemaining: number | null = null): StreakStats {
  const logs = getActivityLogs();
  const activityMap = new Map<string, number>();
  for (const [dateStr, count] of Object.entries(logs)) {
    activityMap.set(dateStr, (activityMap.get(dateStr) || 0) + count);
  }
  // Word creation is no longer counted here (AI auto-replenish would keep the streak alive
  // without studying). Manual adds are logged by the pipeline; past days are backfilled once.
  backfillActivityFromWordsOnce(words, activityMap);

  const todayCount = activityMap.get(getLocalDateString()) || 0;
  const dailyGoal = getDailyGoal();
  const activeDates = Array.from(activityMap.keys()).filter((d) => (activityMap.get(d) || 0) > 0);
  let streak = computeStreak(activeDates);
  const repairTarget = streakRepairTarget(dailyGoal);
  // Reached without an answer recorded here (answers synced from another machine, a lower goal): repaired now,
  // without an event since this runs while rendering
  if (streak.repairable && todayCount >= repairTarget && saveStreakRepair(streak.repairable.missedDay)) {
    streak = computeStreak(activeDates);
  }
  const goalReached = todayCount >= dailyGoal || (dueRemaining === 0 && todayCount > 0);

  return {
    currentStreak: streak.current,
    longestStreak: streak.longest,
    todayCount,
    dailyGoal,
    goalReached,
    goalPercentage: goalReached ? 100 : Math.min(100, Math.round((todayCount / dailyGoal) * 100)),
    freezesAvailable: streak.freezes,
    frozenDates: streak.frozenDates,
    repairedDates: streak.repairedDates,
    streakRepair: streak.repairable ? { ...streak.repairable, target: repairTarget } : null,
    dueRemaining,
  };
}
