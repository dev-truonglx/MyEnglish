/**
 * Focus session: a short timed review (5-25 minutes) with the rest of the app hidden and no reminders.
 *  - the clock runs only while the learner is studying: it stops when the window loses focus or is hidden, and
 *    after FOCUS_IDLE_MS without any input, so `activeSec` is time actually spent on the cards
 *  - time up never cuts an answer: the session ends after the card on screen
 *  - no card left with time to spare: practice cards are added (focusTopUpCards), so the session lasts what was
 *    promised; they move no schedule
 *  - a completed session earns FOCUS_XP_PER_MIN per active minute (FOCUS_MIN_CARDS answers at least), at most
 *    FOCUS_XP_DAILY_CAP a day
 *  - start and end are logged as learning events (synced), for the D1/D7 comparison in services/retention.ts
 */
import type { ReviewCard, WordDetail } from "@/types/database";
import { practiceCards } from "./cards";
import { minutesFor } from "./comeback";
import { logLearningEvent } from "./learningEvents";
import { loadRecentRuns, pickPracticeWords, type RecentRun } from "./practicePicker";
import { awardXP, getStudiedWords, getUnmasteredWords, interleaveTopics } from "./smartReview";
import { getLocalDateString } from "./streak";

export {
  FOCUS_DURATIONS,
  DEFAULT_FOCUS_MINUTES,
  FOCUS_SETTINGS_EVENT,
  getFocusSettings,
  saveFocusSettings,
  type FocusSettings,
} from "./focusSettings";

/** Share of the planned time after which leaving early still counts as done ("Xong") */
export const FOCUS_DONE_SHARE = 0.8;
/** No key, click or mouse move for this long: the clock stops until the next input */
export const FOCUS_IDLE_MS = 90 * 1000;
/** Reminders stay off this long after the planned end (time to finish the last card) */
export const FOCUS_REMINDER_MARGIN_MS = 2 * 60 * 1000;
export const FOCUS_XP_PER_MIN = 2;
export const FOCUS_MIN_CARDS = 3;
export const FOCUS_XP_DAILY_CAP = 60;

const XP_KEY = "myenglish_focus_xp_v1";

/** A focus session asked for: the review queue is built the usual way, then the clock starts */
export interface FocusPlan {
  id: string;
  plannedMin: number;
  /** Local day it started (the D1/D7 comparison counts the day it belongs to) */
  day: string;
}

export function newFocusPlan(plannedMin: number, now: Date = new Date()): FocusPlan {
  return { id: crypto.randomUUID(), plannedMin, day: getLocalDateString(now) };
}

// ─── Clock ──────────────────────────────────────────────────────────────────

/** Active time only: `runningSince` is null while paused */
export interface FocusClock {
  plannedMs: number;
  activeMs: number;
  runningSince: number | null;
}

export function startClock(plannedMin: number, now: number): FocusClock {
  return { plannedMs: plannedMin * 60 * 1000, activeMs: 0, runningSince: now };
}

export function clockActiveMs(c: FocusClock, now: number): number {
  return c.activeMs + (c.runningSince !== null ? Math.max(0, now - c.runningSince) : 0);
}

export function clockRemainingMs(c: FocusClock, now: number): number {
  return Math.max(0, c.plannedMs - clockActiveMs(c, now));
}

export function pauseClock(c: FocusClock, now: number): FocusClock {
  if (c.runningSince === null) return c;
  return { ...c, activeMs: clockActiveMs(c, now), runningSince: null };
}

export function resumeClock(c: FocusClock, now: number): FocusClock {
  if (c.runningSince !== null) return c;
  return { ...c, runningSince: now };
}

/** Until when reminders stay off: the planned end from now plus a margin (refreshed while the clock runs) */
export function focusUntil(c: FocusClock, now: number): number {
  return now + clockRemainingMs(c, now) + FOCUS_REMINDER_MARGIN_MS;
}

// ─── Outcome and XP ─────────────────────────────────────────────────────────

/** time: the clock ran out · queue: no card left · user: "Xong" or "Thoát" */
export type FocusEnd = "time" | "queue" | "user";

export function focusOutcome(endedBy: FocusEnd, activeMs: number, plannedMs: number): "completed" | "abandoned" {
  if (endedBy === "time" || endedBy === "queue") return "completed";
  return activeMs >= plannedMs * FOCUS_DONE_SHARE ? "completed" : "abandoned";
}

function readFocusXp(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(XP_KEY) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function focusXpToday(day: string = getLocalDateString()): number {
  return Number(readFocusXp()[day]) || 0;
}

/** XP a completed session earns: per active minute (at most the planned minutes), within today's cap */
export function focusXp(s: { completed: boolean; activeMs: number; plannedMin: number; cards: number; earnedToday: number }): number {
  if (!s.completed || s.cards < FOCUS_MIN_CARDS) return 0;
  const minutes = Math.min(s.plannedMin, Math.floor(s.activeMs / 60000));
  return Math.max(0, Math.min(minutes * FOCUS_XP_PER_MIN, FOCUS_XP_DAILY_CAP - s.earnedToday));
}

// ─── Start / end ────────────────────────────────────────────────────────────

export function logFocusStarted(plan: FocusPlan): void {
  logLearningEvent("focus_started", { meta: { id: plan.id, plannedMin: plan.plannedMin, day: plan.day } });
}

export interface FocusResult {
  outcome: "completed" | "abandoned";
  endedBy: FocusEnd;
  plannedMin: number;
  activeSec: number;
  cards: number;
  firstTry: number;
  xp: number;
}

/** Logs the end, and awards the XP of a completed session. Call once per session. */
export function endFocus(
  plan: FocusPlan,
  s: { endedBy: FocusEnd; activeMs: number; cards: number; firstTry: number },
  now: Date = new Date()
): FocusResult {
  const outcome = focusOutcome(s.endedBy, s.activeMs, plan.plannedMin * 60 * 1000);
  const today = getLocalDateString(now);
  const xp = focusXp({ completed: outcome === "completed", activeMs: s.activeMs, plannedMin: plan.plannedMin, cards: s.cards, earnedToday: focusXpToday(today) });
  if (xp > 0) {
    const log = readFocusXp();
    // Older days are not needed for the cap
    const kept: Record<string, number> = { [today]: (Number(log[today]) || 0) + xp };
    try {
      localStorage.setItem(XP_KEY, JSON.stringify(kept));
    } catch {}
    awardXP(xp);
  }
  const result: FocusResult = {
    outcome,
    endedBy: s.endedBy,
    plannedMin: plan.plannedMin,
    activeSec: Math.round(s.activeMs / 1000),
    cards: s.cards,
    firstTry: s.firstTry,
    xp,
  };
  const { outcome: _o, ...meta } = result;
  logLearningEvent(outcome === "completed" ? "focus_completed" : "focus_abandoned", {
    meta: { id: plan.id, day: plan.day, ...meta },
  });
  return result;
}

// ─── Before and during the session ──────────────────────────────────────────

/** Cards added each time a focus session runs out of cards with time left */
export const FOCUS_TOPUP_BATCH = 8;
/** The last cards on screen are not added again right away */
const TOPUP_RECENT_CARDS = 3;

/**
 * Practice cards for a focus session that ran out of cards with time left: words being learnt first (all
 * studied words when none of them can be practised now), picked as for a practice session (pickPracticeWords:
 * words missed lately first, resting words left out). Never one of the last cards of `queue`.
 */
export function pickFocusTopUp(
  words: readonly WordDetail[],
  queue: readonly ReviewCard[],
  runs: ReadonlyMap<string, RecentRun>,
  now: Date = new Date()
): ReviewCard[] {
  const exclude = new Set(queue.slice(-TOPUP_RECENT_CARDS).map((c) => c.id));
  const pool = [...words];
  const learning = pickPracticeWords(getUnmasteredWords(pool), runs, FOCUS_TOPUP_BATCH, { now, exclude });
  const picked = learning.length > 0 ? learning : pickPracticeWords(getStudiedWords(pool), runs, FOCUS_TOPUP_BATCH, { now, exclude });
  return practiceCards(interleaveTopics(picked));
}

export async function focusTopUpCards(words: readonly WordDetail[], queue: readonly ReviewCard[], now: Date = new Date()): Promise<ReviewCard[]> {
  const runs = await loadRecentRuns(now).catch(() => new Map<string, RecentRun>());
  return pickFocusTopUp(words, queue, runs, now);
}

export interface FocusPreview {
  /** Reviews and new cards the session will hold */
  reviews: number;
  newCards: number;
  /** About how long they take */
  workMin: number;
  /** They take longer than the planned minutes: the most urgent go first, the rest wait */
  overflow: boolean;
}

/** What a focus session of `minutes` will hold, from today's work (the session is capped at maxSessionSize) */
export function focusPreview(work: { reviews: number; newToday: number }, minutes: number, maxSessionSize: number): FocusPreview {
  const reviews = Math.min(work.reviews, maxSessionSize);
  const newCards = Math.min(work.newToday, maxSessionSize - reviews);
  // A new word costs an introduction and a quiz, about two reviews
  const workMin = reviews + newCards > 0 ? minutesFor(reviews + newCards * 2) : 0;
  return { reviews, newCards, workMin, overflow: workMin > minutes };
}

/** The preview in one line, under the start button */
export function focusPreviewText(p: FocusPreview, minutes: number): string {
  if (p.reviews + p.newCards === 0) return `Hết thẻ đến hạn: ${minutes}′ luyện thêm từ đang học (không đổi lịch ôn).`;
  const parts = [p.reviews > 0 ? `${p.reviews} thẻ ôn` : "", p.newCards > 0 ? `${p.newCards} từ mới` : ""].filter(Boolean).join(" · ");
  if (p.overflow) return `${parts}, khoảng ${p.workMin}′: làm trước thẻ cần nhất, phần còn lại để lượt sau.`;
  if (p.workMin < minutes) return `${parts} (~${p.workMin}′), sau đó luyện thêm từ đang học cho đủ ${minutes}′.`;
  return `${parts} (~${p.workMin}′).`;
}

// ─── Next review ────────────────────────────────────────────────────────────

/** Window after the next due card in which the cards due are counted together ("khoảng 6 thẻ") */
const NEXT_REVIEW_WINDOW_MS = 30 * 60 * 1000;

/** When the next card comes due (after `now`), and how many come due in the half hour from then */
export function nextReviewPeek(words: readonly WordDetail[], now: Date = new Date()): { at: Date; count: number } | null {
  const t = now.getTime();
  const times: number[] = [];
  for (const w of words) {
    if (w.suspended) continue;
    for (const srs of [w.srs, w.srsProduction]) {
      // Cards in study only (a word still waiting in the deck buffer has state 0 and is not a review)
      if (!srs?.next_review_date || !srs.state) continue;
      const due = new Date(srs.next_review_date).getTime();
      if (due > t) times.push(due);
    }
  }
  if (times.length === 0) return null;
  const first = Math.min(...times);
  return { at: new Date(first), count: times.filter((d) => d < first + NEXT_REVIEW_WINDOW_MS).length };
}
