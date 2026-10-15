/**
 * The Today screen's plan, as pure functions (tested in test/gd4-today.test.ts) plus the few marks it keeps
 * in localStorage:
 *  - at most 3 things to do today, sized by the minutes chosen at onboarding: words (reviews + new words),
 *    one grammar lesson (only with an imported book), one short pronunciation lesson
 *  - the main button is always the first thing not done yet
 *  - small moments: a "Nhớ lâu" milestone (celebrated once), the coverage gain since the first measure,
 *    the weekly summary card shown on the first day the app is opened in a new week
 */
import type { WordDetail } from "@/types/database";
import type { DashboardTab } from "./shared";
import { DAILY_PLANS, type DailyMinutes } from "@/services/onboarding";
import { nextLocalDayStart } from "@/services/cards";
import { getLocalDateString } from "@/services/streak";
import { weekKey } from "@/services/progress";
import { persistKeyNow } from "@/services/storageBackup";

// ─── The minutes chosen at onboarding ────────────────────────────────────────

/** The plan (5 / 10 / 15 minutes) of the daily goal; a goal set by hand takes the plan with the nearest goal */
export function chosenDailyMinutes(dailyGoal: number): DailyMinutes {
  const plans = Object.values(DAILY_PLANS);
  const exact = plans.find((p) => p.dailyGoal === dailyGoal);
  if (exact) return exact.minutes;
  return plans.reduce((best, p) => (Math.abs(p.dailyGoal - dailyGoal) < Math.abs(best.dailyGoal - dailyGoal) ? p : best)).minutes;
}

// ─── Today's list ────────────────────────────────────────────────────────────

export type TodayTaskId = "vocab" | "grammar" | "pronunciation";

export interface TodayTask {
  id: TodayTaskId;
  title: string;
  detail: string;
  /** Estimated minutes */
  minutes: number;
  done: boolean;
}

export interface TodayTaskInput {
  minutes: DailyMinutes;
  vocab: {
    reviews: number;
    newToday: number;
    minutes: number;
    /** Day of a comeback plan still running (null otherwise) */
    comebackDay?: number | null;
  };
  /** null: no grammar book imported */
  grammar: {
    due: number;
    studiedToday: boolean;
    /** Next new lesson of the path, when one is still for today */
    nextTitle: string | null;
    /** A lesson whose quick check failed, to redo */
    relearnTitle: string | null;
  } | null;
  /** null: nothing to offer (every lesson passed and none practised today) */
  pronunciation: { doneToday: boolean; lessonTitle: string | null } | null;
}

export const GRAMMAR_TASK_MINUTES = 5;

export function vocabDetail(reviews: number, newToday: number): string {
  if (reviews + newToday === 0) return "Đã xong phần từ hôm nay";
  return [reviews > 0 ? `${reviews} thẻ ôn` : "", newToday > 0 ? `${newToday} từ mới` : ""].filter(Boolean).join(" · ");
}

/**
 * Words first (the core of the day), then one grammar lesson (when a book is imported and there is something
 * to do or it was done today), then one pronunciation lesson. A 5-minute plan keeps 2 things, longer plans 3.
 */
export function buildTodayTasks(input: TodayTaskInput): TodayTask[] {
  const v = input.vocab;
  const tasks: TodayTask[] = [
    {
      id: "vocab",
      title: v.comebackDay ? `Ôn từ · kế hoạch quay lại, ngày ${v.comebackDay}` : "Ôn từ & học từ mới",
      detail: vocabDetail(v.reviews, v.newToday),
      minutes: v.minutes,
      done: v.reviews + v.newToday === 0,
    },
  ];
  const extras: TodayTask[] = [];
  const g = input.grammar;
  if (g && (g.studiedToday || g.due > 0 || g.relearnTitle || g.nextTitle)) {
    extras.push({
      id: "grammar",
      title: g.studiedToday
        ? "1 bài ngữ pháp"
        : g.due > 0
          ? "Ôn 1 bài ngữ pháp"
          : g.relearnTitle
            ? "Học lại 1 bài ngữ pháp"
            : "1 bài ngữ pháp mới",
      detail: g.studiedToday
        ? "Đã học hôm nay"
        : g.due > 1
          ? `${g.due} bài đến hạn ôn, hôm nay làm 1 bài là đủ`
          : g.due === 1
            ? "1 bài đến hạn ôn, vài phút là xong"
            : (g.relearnTitle ?? g.nextTitle ?? ""),
      minutes: GRAMMAR_TASK_MINUTES,
      done: g.studiedToday,
    });
  }
  const p = input.pronunciation;
  if (p) {
    extras.push({
      id: "pronunciation",
      title: "1 bài phát âm ngắn",
      detail: p.doneToday ? "Đã luyện hôm nay" : (p.lessonTitle ?? "Nghe và đọc to theo"),
      minutes: input.minutes === 5 ? 3 : 5,
      done: p.doneToday,
    });
  }
  return [...tasks, ...extras.slice(0, input.minutes >= 10 ? 2 : 1)];
}

/** The main button: the first thing not done yet (null = everything done) */
export function primaryTask(tasks: readonly TodayTask[]): TodayTask | null {
  return tasks.find((t) => !t.done) ?? null;
}

/** The tab each thing opens (words start a session instead) */
export const TASK_TAB: Record<Exclude<TodayTaskId, "vocab">, DashboardTab> = {
  grammar: "grammar",
  pronunciation: "pronunciation",
};

// ─── "Chỉ 1 phút" and the day close ──────────────────────────────────────────

/**
 * The 3-card mini session that keeps the streak: offered while the daily goal is not reached, stressed after
 * 18:00 when nothing was studied today.
 */
export function quickStartMode(s: { goalReached: boolean; todayCount: number; hour: number; canStudy: boolean }): "hidden" | "normal" | "urgent" {
  if (s.goalReached || !s.canStudy) return "hidden";
  return s.hour >= 18 && s.todayCount === 0 ? "urgent" : "normal";
}

/** Learning / relearning cards (minute steps) that come due later today: "Tối nay còn ~N thẻ" */
export function cardsLaterToday(words: readonly WordDetail[], now: Date = new Date()): number {
  const end = nextLocalDayStart(now);
  let n = 0;
  for (const w of words) {
    if (w.suspended) continue;
    for (const srs of [w.srs, w.srsProduction]) {
      if (!srs?.next_review_date || (srs.state !== 1 && srs.state !== 3)) continue;
      const due = new Date(srs.next_review_date).getTime();
      if (due > now.getTime() && due < end) n++;
    }
  }
  return n;
}

export interface NextStep {
  label: string;
  tab: DashboardTab;
}

/** The one light thing offered once the day is done */
export function pickNextStep(s: { pronunciationAvailable: boolean; pronunciationDone: boolean; simple: boolean }): NextStep {
  if (s.pronunciationAvailable && !s.pronunciationDone) return { label: "Phát âm 5 phút", tab: "pronunciation" };
  // Reading asks for a real text to paste: too much for a beginner at the end of the day
  if (!s.simple) return { label: "Đọc một đoạn thật", tab: "reading" };
  return { label: "Xem tiến độ", tab: "analytics" };
}

// ─── Moments: milestones, coverage gain, weekly card ─────────────────────────

/** "Nhớ lâu" counts worth a small celebration (words only marked "Đã biết" never count) */
export const REMEMBERED_MILESTONES = [100, 250, 500, 1000] as const;

export interface MilestoneMark {
  value: number;
  /** Local day it was first celebrated: the line stays for that day */
  day: string;
}

/**
 * The milestone to show: a new one the first time the count reaches it (the highest one reached), then the
 * same one for the rest of that day; never again after. `next` is the mark to save (null = unchanged).
 */
export function milestoneToCelebrate(
  count: number,
  stored: MilestoneMark | null,
  today: string
): { show: number | null; next: MilestoneMark | null } {
  const reached = [...REMEMBERED_MILESTONES].reverse().find((m) => count >= m) ?? null;
  if (reached !== null && reached > (stored?.value ?? 0)) return { show: reached, next: { value: reached, day: today } };
  if (stored && stored.day === today) return { show: stored.value, next: null };
  return { show: null, next: null };
}

export interface CoverageBaseline {
  percent: number;
  day: string;
}

/** "46% → 52%": only once the coverage went up since the first measure */
export function coverageGain(current: number, baseline: CoverageBaseline | null): { from: number; to: number } | null {
  return baseline && current > baseline.percent ? { from: baseline.percent, to: current } : null;
}

export interface WeeklyCardMark {
  week: string;
  /** First day the app was opened this week: the card shows on that day only */
  day: string;
  dismissed: boolean;
}

/** The weekly summary shows on the first day the app is opened in a new week (Monday most of the time), until hidden */
export function weeklyCardVisibility(stored: WeeklyCardMark | null, now: Date = new Date()): { visible: boolean; next: WeeklyCardMark | null } {
  const week = weekKey(now);
  const today = getLocalDateString(now);
  if (!stored || stored.week !== week) return { visible: true, next: { week, day: today, dismissed: false } };
  return { visible: !stored.dismissed && stored.day === today, next: null };
}

const MILESTONE_KEY = "myenglish_remembered_milestone_v1";
const COVERAGE_BASELINE_KEY = "myenglish_coverage_baseline_v1";
const WEEKLY_CARD_KEY = "myenglish_weekly_card_v1";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    persistKeyNow(key);
  } catch {}
}

export const readMilestoneMark = () => readJson<MilestoneMark>(MILESTONE_KEY);
export const saveMilestoneMark = (m: MilestoneMark) => writeJson(MILESTONE_KEY, m);
export const readCoverageBaseline = () => readJson<CoverageBaseline>(COVERAGE_BASELINE_KEY);
export const saveCoverageBaseline = (b: CoverageBaseline) => writeJson(COVERAGE_BASELINE_KEY, b);
export const readWeeklyCardMark = () => readJson<WeeklyCardMark>(WEEKLY_CARD_KEY);
export const saveWeeklyCardMark = (m: WeeklyCardMark) => writeJson(WEEKLY_CARD_KEY, m);
