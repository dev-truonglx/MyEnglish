/**
 * Study habits from the learning event log and review history: words reaching long-term memory per week,
 * the hours the learner actually studies, and what happens to reminders (opened / snoozed / ignored).
 * Pure functions take the data in; loadHabitInsights reads SQLite.
 */
import { getDatabase } from "./db";
import { getLearningEventsSince, type LearningEvent } from "./learningEvents";
import { startOfWeek } from "./progress";

export interface WeekCount {
  weekStart: string; // YYYY-MM-DD (Monday)
  count: number;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Words that reached long-term memory (recognition "mastered" events), per week, oldest first */
export function masteredPerWeek(events: LearningEvent[], weeks: number, now: Date = new Date()): WeekCount[] {
  const result: WeekCount[] = [];
  const first = startOfWeek(now);
  first.setDate(first.getDate() - 7 * (weeks - 1));
  for (let i = 0; i < weeks; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + 7 * i);
    result.push({ weekStart: dayKey(d), count: 0 });
  }
  for (const e of events) {
    if (e.type !== "mastered" || (e.direction ?? "recognition") !== "recognition") continue;
    const key = dayKey(startOfWeek(new Date(e.at)));
    const bucket = result.find((w) => w.weekStart === key);
    if (bucket) bucket.count++;
  }
  return result;
}

/** Answers per local hour of day (0..23) */
export function answersByHour(timestamps: string[]): number[] {
  const hours = new Array<number>(24).fill(0);
  for (const t of timestamps) {
    const d = new Date(t);
    if (!isNaN(d.getTime())) hours[d.getHours()]++;
  }
  return hours;
}

export interface ReminderFunnel {
  shown: number;
  opened: number; // opened the review, or answered the 1-question quiz
  snoozed: number;
  ignored: number;
  /** Share of reminders the learner acted on (opened / answered) */
  responseRate: number | null;
  /** Hours (local) where reminders get answered most, best first (at least 3 reminders in that hour) */
  bestHours: number[];
  popupShown: number;
  popupCompleted: number;
  popupClosedEarly: number;
  completionRate: number | null;
}

export function reminderFunnel(events: LearningEvent[]): ReminderFunnel {
  const count = (t: LearningEvent["type"]) => events.filter((e) => e.type === t).length;
  const shown = count("nudge_shown");
  const opened = count("nudge_opened") + count("nudge_quiz");
  const shownByHour = new Array<number>(24).fill(0);
  const openedByHour = new Array<number>(24).fill(0);
  for (const e of events) {
    const h = new Date(e.at).getHours();
    if (e.type === "nudge_shown") shownByHour[h]++;
    if (e.type === "nudge_opened" || e.type === "nudge_quiz") openedByHour[h]++;
  }
  const bestHours = shownByHour
    .map((n, h) => ({ h, n, rate: n > 0 ? openedByHour[h] / n : 0 }))
    .filter((x) => x.n >= 3 && x.rate > 0)
    .sort((a, b) => b.rate - a.rate || b.n - a.n)
    .slice(0, 3)
    .map((x) => x.h);
  const popupShown = count("popup_shown");
  const popupCompleted = count("popup_completed");
  return {
    shown,
    opened,
    snoozed: count("nudge_snoozed"),
    ignored: count("nudge_ignored"),
    responseRate: shown > 0 ? Math.min(1, opened / shown) : null,
    bestHours,
    popupShown,
    popupCompleted,
    popupClosedEarly: count("popup_closed_early"),
    completionRate: popupShown > 0 ? Math.min(1, popupCompleted / popupShown) : null,
  };
}

/** Actionable advice from the funnel (null when there is not enough data or nothing to change) */
export function habitAdvice(f: ReminderFunnel, studyHours: number[]): string | null {
  const topStudy = studyHours
    .map((n, h) => ({ h, n }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 2)
    .map((x) => `${x.h}h`);
  if (f.shown >= 10 && f.responseRate !== null && f.responseRate < 0.4) {
    const when = f.bestHours.length > 0 ? f.bestHours.map((h) => `${h}h`).join(", ") : topStudy.join(", ");
    return `Phần lớn lời nhắc bị hoãn hoặc bỏ qua — chúng đang đến lúc bạn bận.${when ? ` Bạn hay học/trả lời nhất vào khoảng ${when}: thử để lời nhắc thưa hơn hoặc chỉ ôn vào các giờ đó.` : ""}`;
  }
  if (f.popupShown >= 5 && f.completionRate !== null && f.completionRate < 0.6) {
    return "Nhiều phiên popup bị đóng giữa chừng — giảm số câu mỗi phiên (cài đặt nhắc ôn) để dễ làm hết hơn.";
  }
  return null;
}

export interface HabitInsights {
  masteredWeeks: WeekCount[];
  masteredThisWeek: number;
  productionMasteredThisWeek: number;
  studyHours: number[];
  funnel: ReminderFunnel;
  advice: string | null;
  days: number;
}

export async function loadHabitInsights(days: number = 30, weeks: number = 8, now: Date = new Date()): Promise<HabitInsights> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const weeksStart = startOfWeek(now);
  weeksStart.setDate(weeksStart.getDate() - 7 * (weeks - 1));
  const earliest = weeksStart < since ? weeksStart : since;
  const events = await getLearningEventsSince(earliest);
  const db = await getDatabase();
  const rows = await db.select<Array<{ timestamp: string }>>(
    `SELECT timestamp FROM review_logs WHERE timestamp >= $1 AND exercise_type != 'intro' AND COALESCE(is_scheduled, 1) != 2`,
    [since.toISOString()]
  );
  const recent = events.filter((e) => new Date(e.at) >= since);
  const funnel = reminderFunnel(recent);
  const studyHours = answersByHour(rows.map((r) => r.timestamp));
  const weekStart = startOfWeek(now);
  const thisWeek = events.filter((e) => e.type === "mastered" && new Date(e.at) >= weekStart);
  return {
    masteredWeeks: masteredPerWeek(events, weeks, now),
    masteredThisWeek: thisWeek.filter((e) => (e.direction ?? "recognition") === "recognition").length,
    productionMasteredThisWeek: thisWeek.filter((e) => e.direction === "production").length,
    studyHours,
    funnel,
    advice: habitAdvice(funnel, studyHours),
    days,
  };
}

// ─── Beginner metrics: is the foundation path working? ───────────────────────

export interface BeginnerMetrics {
  /** Active days in the last 14 */
  activeDays14: number;
  /** First scheduled answer of each recall (typing) card: how many were remembered */
  firstRecall: { total: number; remembered: number };
  /** Say-aloud self-checks (intro cards and pronunciation lessons) and how many felt right */
  sayAloud: { total: number; ok: number };
  pronunciationQuizzes: number;
  grammarIntros: number;
}

/**
 * What tells whether a beginner is on track: studying most days, remembering a word the first time it has
 * to be typed (the recall ladder and the later recall start should push this up), and practising sound.
 */
export function beginnerMetrics(
  logs: Array<{ rating: number; isScheduled: boolean; direction?: string; stateBefore?: number | null }>,
  events: LearningEvent[],
  activeDates: string[],
  now: Date = new Date()
): BeginnerMetrics {
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);
  const sinceKey = dayKey(since);
  const firstRecall = logs.filter((l) => l.isScheduled && l.direction === "production" && l.stateBefore === 0);
  const say = events.filter((e) => e.type === "say_aloud");
  return {
    activeDays14: new Set(activeDates.filter((d) => d >= sinceKey && d <= dayKey(now))).size,
    firstRecall: { total: firstRecall.length, remembered: firstRecall.filter((l) => l.rating > 1).length },
    sayAloud: { total: say.length, ok: say.filter((e) => e.meta?.ok === true).length },
    pronunciationQuizzes: events.filter((e) => e.type === "pronunciation_quiz").length,
    grammarIntros: events.filter((e) => e.type === "grammar_intro").length,
  };
}
