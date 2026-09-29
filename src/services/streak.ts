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
export function calculateStreakAndGoal(words: WordDetail[]): StreakStats {
  const logs = getActivityLogs();
  const activityMap = new Map<string, number>();

  // 1. Incorporate study logs (reviews, spelling, cloze)
  for (const [dateStr, count] of Object.entries(logs)) {
    activityMap.set(dateStr, (activityMap.get(dateStr) || 0) + count);
  }

  // 2. Incorporate words created_at
  words.forEach((w) => {
    if (w.created_at) {
      try {
        const d = new Date(w.created_at);
        const dateStr = getLocalDateString(d);
        activityMap.set(dateStr, (activityMap.get(dateStr) || 0) + 1);
      } catch {}
    }
  });

  const todayStr = getLocalDateString();
  const todayCount = activityMap.get(todayStr) || 0;
  const dailyGoal = getDailyGoal();

  // 3. Compute current streak (consecutive days backwards)
  let curStreak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const checkDate = new Date(today);
  const todayHasActivity = (activityMap.get(todayStr) || 0) > 0;

  if (todayHasActivity) {
    curStreak++;
    checkDate.setDate(checkDate.getDate() - 1);
  } else {
    // If today has no activity yet, check yesterday to keep streak active
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (true) {
    const dStr = getLocalDateString(checkDate);
    const count = activityMap.get(dStr) || 0;
    if (count > 0) {
      curStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // 4. Compute longest streak
  const sortedDates = Array.from(activityMap.keys())
    .filter((d) => (activityMap.get(d) || 0) > 0)
    .sort();

  let maxStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const dateStr of sortedDates) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const curDate = new Date(y, m - 1, d);
    if (!prevDate) {
      tempStreak = 1;
    } else {
      const diffDays = Math.round(
        (curDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays === 1) {
        tempStreak++;
      } else if (diffDays > 1) {
        tempStreak = 1;
      }
    }
    if (tempStreak > maxStreak) {
      maxStreak = tempStreak;
    }
    prevDate = curDate;
  }

  const finalLongest = Math.max(curStreak, maxStreak);
  const goalPercentage = Math.min(100, Math.round((todayCount / dailyGoal) * 100));

  return {
    currentStreak: curStreak,
    longestStreak: finalLongest,
    todayCount,
    dailyGoal,
    goalReached: todayCount >= dailyGoal,
    goalPercentage,
  };
}
