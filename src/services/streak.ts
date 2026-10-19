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

export interface StreakResult {
  current: number;
  longest: number;
  freezes: number;
  frozenDates: string[];
}

/**
 * Streak over local dates with activity. Today without activity yet does not break it.
 * Each FREEZE_EVERY_DAYS active days earn a freeze (max MAX_FREEZES) that covers one missed day,
 * so one busy day does not wipe out weeks of habit. Frozen days keep the streak but don't add to it.
 * A bonus freeze (daily-quest chest) adds one to the stock on its active day, within the same cap.
 */
export function computeStreak(
  activeDates: Iterable<string>,
  today: Date = new Date(),
  bonusFreezeDates: Iterable<string> = readBonusFreezeDates()
): StreakResult {
  const active = new Set(activeDates);
  const bonus = new Set(bonusFreezeDates);
  const todayStr = getLocalDateString(today);
  const sorted = Array.from(active).filter((d) => d <= todayStr).sort();
  const result: StreakResult = { current: 0, longest: 0, freezes: 0, frozenDates: [] };
  if (sorted.length === 0) return result;

  const [y, m, d] = sorted[0].split("-").map(Number);
  const day = new Date(y, m - 1, d);
  let activeInRun = 0;
  for (let s = getLocalDateString(day); s <= todayStr; day.setDate(day.getDate() + 1), s = getLocalDateString(day)) {
    if (active.has(s)) {
      result.current++;
      activeInRun++;
      if (activeInRun % FREEZE_EVERY_DAYS === 0) result.freezes = Math.min(MAX_FREEZES, result.freezes + 1);
    } else if (s !== todayStr) {
      if (result.current > 0 && result.freezes > 0) {
        result.freezes--;
        result.frozenDates.push(s);
      } else {
        result.current = 0;
        activeInRun = 0;
        result.frozenDates = [];
      }
    }
    if (bonus.has(s) && (active.has(s) || s === todayStr)) result.freezes = Math.min(MAX_FREEZES, result.freezes + 1);
    result.longest = Math.max(result.longest, result.current);
  }
  return result;
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
 * Streak (with freezes) and today's goal. The goal is reached with `dailyGoal` answers, or as soon
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
  const streak = computeStreak(Array.from(activityMap.keys()).filter((d) => (activityMap.get(d) || 0) > 0));
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
    dueRemaining,
  };
}
