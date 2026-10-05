import type { WordDetail } from "@/types/database";

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
 */
export function computeStreak(activeDates: Iterable<string>, today: Date = new Date()): StreakResult {
  const active = new Set(activeDates);
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

/**
 * Read activity logs from localStorage
 */
export function getActivityLogs(): DailyActivityLog {
  try {
    const raw = localStorage.getItem(REVIEWS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
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
    localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(logs));
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
      if (!w.created_at) continue;
      const d = new Date(w.created_at);
      if (isNaN(d.getTime())) continue;
      const dateStr = getLocalDateString(d);
      if (dateStr === today || logs[dateStr]) continue;
      logs[dateStr] = 1;
      activityMap.set(dateStr, (activityMap.get(dateStr) || 0) + 1);
    }
    localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(logs));
    localStorage.setItem(CREATED_AT_BACKFILL_KEY, "1");
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
