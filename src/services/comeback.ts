/**
 * "Quay lại nhẹ nhàng": after a break of several days, the pile of due reviews is split over a few days
 * instead of being shown all at once (seeing 120 cards due is the main reason people quit an SRS app).
 *
 *  - starts on the first day back, when the learner missed COMEBACK_MIN_MISSED_DAYS days or more and more
 *    reviews are due than one session holds
 *  - each day asks for `dailyQuota` answers; counts, reminders and the tray show what is left of that share,
 *    and once it is done nothing nags until tomorrow (more practice stays possible)
 *  - new words pause until the backlog is cleared (they would only add future reviews)
 *  - ends when no review is due any more, or after COMEBACK_MAX_PLAN_DAYS days
 *
 * FSRS already reviews the most valuable cards first (lowest retrievability), so the order is not changed:
 * only how much is asked per day and how it is presented.
 */
import { getActivityLogs, getDailyGoal, getLocalDateString } from "./streak";
import { persistKeyNow } from "./storageBackup";

const PLAN_KEY = "myenglish_comeback_plan_v1";

/** Missed days (no study at all) before a comeback plan is offered */
export const COMEBACK_MIN_MISSED_DAYS = 3;
/** A plan never lasts longer than this: after it, normal counts come back whatever is left */
export const COMEBACK_MAX_PLAN_DAYS = 7;
/** The backlog is spread over about this many days ... */
const TARGET_PLAN_DAYS = 3;
/** Rough time per answered card (question, feedback, next), for the "~N phút" estimate */
export const SECONDS_PER_CARD = 15;

export interface ComebackPlan {
  /** Local date (YYYY-MM-DD) of the first day back */
  startedOn: string;
  /** Days without any study before coming back */
  missedDays: number;
  /** Reviews due on the first day back */
  backlogAtStart: number;
  /** Answers asked per day while the plan runs */
  dailyQuota: number;
  /** Local date the backlog reached 0 (the plan is shown as done that day, then removed) */
  completedOn?: string | null;
}

export interface ComebackStatus {
  plan: ComebackPlan;
  /** 1 on the first day back */
  dayNumber: number;
  /** Days still needed at the current pace, today included while today's share is not done */
  daysLeft: number;
  /** Answers given today */
  todayDone: number;
  /** Answers left in today's share (0 = done for today) */
  todayRemaining: number;
  /** Reviews due right now */
  backlog: number;
  caughtUp: boolean;
}

/** Whole days between two local YYYY-MM-DD dates (b - a) */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Days without any study between the last active day before today and today; null without history */
export function missedDaysBefore(activeDates: Iterable<string>, today: string): number | null {
  let last: string | null = null;
  for (const d of activeDates) if (d < today && (!last || d > last)) last = d;
  return last ? Math.max(0, daysBetween(last, today) - 1) : null;
}

/**
 * Answers asked per day: about a third of the backlog, never more than one full session and never less
 * than the daily goal (a comeback must not ask more than a normal day would, nor less).
 */
export function comebackQuota(backlog: number, maxSessionSize: number, dailyGoal: number): number {
  const share = Math.ceil(backlog / TARGET_PLAN_DAYS);
  return Math.max(1, Math.min(maxSessionSize, Math.max(dailyGoal, share)));
}

export function minutesFor(cards: number): number {
  return Math.max(1, Math.round((cards * SECONDS_PER_CARD) / 60));
}

/**
 * Pure state machine: the plan to keep (or start, or end) given today's data. A plan only starts on the
 * first day back: the next day, the last active day is yesterday.
 */
export function nextComebackPlan(
  current: ComebackPlan | null,
  input: { activeDates: Iterable<string>; backlog: number; today: string; maxSessionSize: number; dailyGoal: number }
): ComebackPlan | null {
  const { backlog, today } = input;
  if (current) {
    if (daysBetween(current.startedOn, today) >= COMEBACK_MAX_PLAN_DAYS) return null;
    if (current.completedOn) return current.completedOn === today ? current : null;
    if (backlog === 0) return { ...current, completedOn: today };
    return current;
  }
  const missed = missedDaysBefore(input.activeDates, today);
  if (missed === null || missed < COMEBACK_MIN_MISSED_DAYS) return null;
  // A pile that fits in one session is simply reviewed
  if (backlog <= input.maxSessionSize) return null;
  const dailyQuota = comebackQuota(backlog, input.maxSessionSize, input.dailyGoal);
  return { startedOn: today, missedDays: missed, backlogAtStart: backlog, dailyQuota };
}

export function comebackStatus(plan: ComebackPlan, backlog: number, todayDone: number, today: string): ComebackStatus {
  const todayRemaining = plan.completedOn ? 0 : Math.max(0, plan.dailyQuota - todayDone);
  const afterToday = Math.max(0, backlog - todayRemaining);
  return {
    plan,
    dayNumber: daysBetween(plan.startedOn, today) + 1,
    daysLeft: (todayRemaining > 0 ? 1 : 0) + Math.ceil(afterToday / plan.dailyQuota),
    todayDone,
    todayRemaining,
    backlog,
    caughtUp: !!plan.completedOn,
  };
}

export function getComebackPlan(): ComebackPlan | null {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    return raw ? (JSON.parse(raw) as ComebackPlan) : null;
  } catch {
    return null;
  }
}

function saveComebackPlan(plan: ComebackPlan | null): void {
  try {
    if (plan) localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
    else localStorage.removeItem(PLAN_KEY);
    persistKeyNow(PLAN_KEY);
  } catch {}
}

/**
 * Start, keep or end the comeback plan from the current reviews due, and return today's status
 * (null = no plan: show the normal counts). Called wherever "what is left today" is computed.
 */
export function resolveComeback(backlog: number, maxSessionSize: number, now: Date = new Date()): ComebackStatus | null {
  const today = getLocalDateString(now);
  const logs = getActivityLogs();
  const activeDates = Object.keys(logs).filter((d) => (logs[d] || 0) > 0);
  const current = getComebackPlan();
  const next = nextComebackPlan(current, { activeDates, backlog, today, maxSessionSize, dailyGoal: getDailyGoal() });
  if (JSON.stringify(next) !== JSON.stringify(current)) saveComebackPlan(next);
  return next ? comebackStatus(next, backlog, logs[today] || 0, today) : null;
}

/** What reminders, the tray and badges should count while a plan runs: today's share, no new words */
export function applyComebackToWork<T extends { reviews: number; newToday: number; total: number }>(
  work: T,
  status: ComebackStatus | null
): T {
  if (!status || status.caughtUp) return work;
  const reviews = Math.min(work.reviews, status.todayRemaining);
  return { ...work, reviews, newToday: 0, total: reviews };
}
