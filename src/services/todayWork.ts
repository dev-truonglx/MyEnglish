/**
 * Today's study work for Today, the tray and the popup: the counting rules (smartReview) applied to the
 * schedules (srs). Its own module so srs.ts keeps the scheduler and the worker only.
 */
import { invoke } from "@tauri-apps/api/core";
import { applyComebackToWork, resolveComeback, type ComebackStatus } from "./comeback";
import { snoozedUntilLabel } from "./reminderSettings";
import { getNewCardsIntroducedToday, summarizeTodayWork } from "./smartReview";
import { getStudyLimits, loadTodaySchedules } from "./srs";

/**
 * What is left to study today (reviews due + new cards the daily budget still allows), counted the way a
 * session takes cards (summarizeTodayWork: same due rule, one review per word, the backlog limit on new
 * cards), so Today, the tray and the popup agree with the session. Also shows it on the menu-bar / tray icon.
 */
export async function countTodayWork(): Promise<{
  reviews: number;
  newToday: number;
  total: number;
  comeback: ComebackStatus | null;
}> {
  // A new day may need new words of the chosen levels in the buffer (cheap when it is full)
  await import("./vocabFeed").then((m) => m.topUpNewWords()).catch(() => {});
  const now = new Date();
  const [words, introduced] = await Promise.all([
    loadTodaySchedules(now),
    getNewCardsIntroducedToday().catch(() => ({ recognition: 0, production: 0 })),
  ]);
  const limits = getStudyLimits();
  const full = summarizeTodayWork(words, introduced, now, limits);
  // After a break, only today's share of the backlog is counted (see comeback.ts), with the plan's new
  // words instead of the daily budget, not cut by the backlog (as buildReviewSession's comebackNewCards):
  // no session size limit, so newCardAllowance lets them all through
  const comeback = resolveComeback(full.reviews, limits.maxSessionSize, now);
  const base = comeback && !comeback.caughtUp
    ? summarizeTodayWork(words, introduced, now, { newCardsPerDay: comeback.newWordsPerDay, maxSessionSize: Number.MAX_SAFE_INTEGER })
    : full;
  const work = applyComebackToWork(base, comeback, introduced);
  // The tooltip also says when a pause ends (N9)
  invoke("set_tray_due_count", { reviews: work.reviews, newCards: work.newToday, pausedUntil: snoozedUntilLabel() }).catch(() => {});
  return { ...work, comeback };
}
