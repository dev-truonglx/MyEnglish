/**
 * Coming back: of the days the learner studied, how many were followed by a study day the next day (D1) and a
 * week later (D7), over a rolling window, with study days that had a completed focus session compared to those
 * without. One learner, so per study day rather than per install cohort. A day only counts once the day it
 * waits for is over (today is never judged).
 *
 * The same numbers for every account are computed on Supabase from the synced rows
 * (supabase/migrations/0007_focus_retention.sql).
 */
import { getActivityLogs, getLocalDateString } from "./streak";
import { getLearningEventsSince, type LearningEvent } from "./learningEvents";

/** Fewer days than this in a group: the comparison is not shown */
export const MIN_GROUP_DAYS = 5;

export interface Rate {
  /** Study days that could be judged */
  days: number;
  returned: number;
  rate: number | null;
}

export interface ReturnRates {
  d1: Rate;
  d7: Rate;
  /** Average number of study days in the 7 days after a study day */
  daysInNextWeek: number | null;
}

export interface RetentionInsights {
  current: ReturnRates;
  previous: ReturnRates;
  /** Study days with a completed focus session, and those without (null when a group is too small) */
  withFocus: ReturnRates | null;
  withoutFocus: ReturnRates | null;
  focus: FocusStats;
  windowDays: number;
}

function shift(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return getLocalDateString(new Date(y, m - 1, d + n));
}

const rate = (days: number, returned: number): Rate => ({ days, returned, rate: days > 0 ? returned / days : null });

/**
 * Return rates of the study days in [today - offset - windowDays, today - offset), each judged only once the
 * day it looks at is over. `only` restricts the study days judged (focus / no focus).
 */
export function computeReturnRates(
  activeDates: Iterable<string>,
  opts: { today: Date; windowDays?: number; offsetDays?: number; only?: (day: string) => boolean }
): ReturnRates {
  const active = new Set(activeDates);
  const windowDays = opts.windowDays ?? 30;
  const today = getLocalDateString(opts.today);
  const end = shift(today, -(opts.offsetDays ?? 0));
  const start = shift(end, -windowDays);
  let d1Days = 0, d1Back = 0, d7Days = 0, d7Back = 0, weekSum = 0;
  for (const day of active) {
    if (day < start || day >= end) continue;
    if (opts.only && !opts.only(day)) continue;
    if (shift(day, 1) < today) {
      d1Days++;
      if (active.has(shift(day, 1))) d1Back++;
    }
    if (shift(day, 7) < today) {
      d7Days++;
      if (active.has(shift(day, 7))) d7Back++;
      for (let i = 1; i <= 7; i++) if (active.has(shift(day, i))) weekSum++;
    }
  }
  return { d1: rate(d1Days, d1Back), d7: rate(d7Days, d7Back), daysInNextWeek: d7Days > 0 ? weekSum / d7Days : null };
}

export interface FocusStats {
  sessions: number;
  completed: number;
  /** Ended early, or started and never ended (app quit) */
  abandoned: number;
  completionRate: number | null;
  avgMinutes: number | null;
  firstTryRate: number | null;
  /** Local days with at least one completed session */
  completedDays: Set<string>;
  /** Completed sessions and their active seconds per local day */
  byDay: Map<string, { count: number; activeSec: number }>;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function focusStats(events: readonly LearningEvent[]): FocusStats {
  const started = new Set<string>();
  const ended = new Map<string, LearningEvent>();
  for (const e of events) {
    const id = typeof e.meta?.id === "string" ? e.meta.id : null;
    if (!id) continue;
    if (e.type === "focus_started") started.add(id);
    else if (e.type === "focus_completed" || e.type === "focus_abandoned") ended.set(id, e);
  }
  const ids = new Set([...started, ...ended.keys()]);
  let completed = 0, activeSec = 0, cards = 0, firstTry = 0;
  const completedDays = new Set<string>();
  const byDay = new Map<string, { count: number; activeSec: number }>();
  for (const e of ended.values()) {
    if (e.type !== "focus_completed") continue;
    completed++;
    activeSec += num(e.meta?.activeSec);
    cards += num(e.meta?.cards);
    firstTry += num(e.meta?.firstTry);
    const day = typeof e.meta?.day === "string" ? e.meta.day : getLocalDateString(new Date(e.at));
    completedDays.add(day);
    const d = byDay.get(day) ?? { count: 0, activeSec: 0 };
    byDay.set(day, { count: d.count + 1, activeSec: d.activeSec + num(e.meta?.activeSec) });
  }
  return {
    sessions: ids.size,
    completed,
    abandoned: ids.size - completed,
    completionRate: ids.size > 0 ? completed / ids.size : null,
    avgMinutes: completed > 0 ? activeSec / 60 / completed : null,
    firstTryRate: cards > 0 ? firstTry / cards : null,
    completedDays,
    byDay,
  };
}

export async function loadRetentionInsights(now: Date = new Date(), windowDays = 30): Promise<RetentionInsights> {
  const logs = getActivityLogs();
  const activeDates = Object.keys(logs).filter((d) => (logs[d] || 0) > 0);
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - windowDays - 1);
  const events = await getLearningEventsSince(since, ["focus_started", "focus_completed", "focus_abandoned"]);
  const focus = focusStats(events);
  const withFocus = computeReturnRates(activeDates, { today: now, windowDays, only: (d) => focus.completedDays.has(d) });
  const withoutFocus = computeReturnRates(activeDates, { today: now, windowDays, only: (d) => !focus.completedDays.has(d) });
  const enough = withFocus.d1.days >= MIN_GROUP_DAYS && withoutFocus.d1.days >= MIN_GROUP_DAYS;
  return {
    current: computeReturnRates(activeDates, { today: now, windowDays }),
    previous: computeReturnRates(activeDates, { today: now, windowDays, offsetDays: windowDays }),
    withFocus: enough ? withFocus : null,
    withoutFocus: enough ? withoutFocus : null,
    focus,
    windowDays,
  };
}
