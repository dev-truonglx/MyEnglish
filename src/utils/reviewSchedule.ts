import { srsRowToCard, getFSRSScheduler, Rating, State } from "@/services/srs";
import type { WordDetail, SRSReview, FSRSState } from "@/types/database";
import type { GrammarProgress } from "@/types/grammar";
import { getNextReviewDate } from "@/services/cards";

export type ReviewTimeBucket = "all" | "due" | "today" | "1-3d" | "4-7d" | "future" | "new";

export interface ReviewTimeRelativeInfo {
  label: string;
  shortLabel: string;
  urgency: "overdue" | "today" | "near" | "week" | "future" | "new";
  bucket: ReviewTimeBucket;
  exactDateStr: string;
  diffMs: number;
  badgeClass: string;
}

export interface ReviewStepProjection {
  step: number;
  label: string;
  date: Date;
  dateFormatted: string;
  relativeLabel: string;
  intervalDays: number;
  isCurrentSchedule?: boolean;
}

/**
 * Compare two words by their next review schedule.
 * Prioritizes words that need review soonest:
 * 1. Overdue / Due words (earliest review date first)
 * 2. Future scheduled words (closest review date first)
 * 3. Never-studied new words (newest created first)
 */
export function compareNextReview(a: WordDetail, b: WordDetail, _now: Date = new Date()): number {
  const isNewA = (!a.srs.reps && !a.srs.repetitions) || a.srs.repetitions === 0;
  const isNewB = (!b.srs.reps && !b.srs.repetitions) || b.srs.repetitions === 0;

  // If both are new: sort by created_at DESC (newest created first)
  if (isNewA && isNewB) {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  }
  // Put scheduled words before never-studied new words
  if (isNewA !== isNewB) {
    return isNewA ? 1 : -1;
  }

  // Both are scheduled words: closest due date first
  const dateA = getNextReviewDate(a).getTime();
  const dateB = getNextReviewDate(b).getTime();

  if (dateA !== dateB) {
    return dateA - dateB;
  }
  return a.word.localeCompare(b.word);
}

/**
 * Format relative countdown and categorize urgency bucket for any next review date.
 */
export function formatNextReviewRelative(
  dateInput: string | Date | undefined | null,
  isNew = false,
  now: Date = new Date()
): ReviewTimeRelativeInfo {
  if (isNew || !dateInput) {
    return {
      label: "Chưa học (Từ mới)",
      shortLabel: "Mới",
      urgency: "new",
      bucket: "new",
      exactDateStr: "Chưa lên lịch",
      diffMs: 0,
      badgeClass:
        "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700/60",
    };
  }

  const targetDate = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const nowMs = now.getTime();
  const targetMs = targetDate.getTime();
  const diffMs = targetMs - nowMs;

  const exactDateStr = targetDate.toLocaleDateString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Overdue / Due now
  if (diffMs <= 0) {
    const overdueMs = Math.abs(diffMs);
    const overdueMinutes = Math.floor(overdueMs / 60000);
    const overdueHours = Math.floor(overdueMs / 3600000);
    const overdueDays = Math.floor(overdueMs / 86400000);

    let label = "Đến hạn ôn";
    if (overdueDays >= 1) {
      label = `Quá hạn ${overdueDays} ngày`;
    } else if (overdueHours >= 1) {
      label = `Quá hạn ${overdueHours} giờ`;
    } else if (overdueMinutes >= 5) {
      label = `Quá hạn ${overdueMinutes} phút`;
    }

    return {
      label,
      shortLabel: "Cần ôn ngay",
      urgency: "overdue",
      bucket: "due",
      exactDateStr,
      diffMs,
      badgeClass:
        "bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 animate-pulse",
    };
  }

  // Within 24 hours
  if (diffMs <= 24 * 3600000) {
    const hours = Math.max(1, Math.round(diffMs / 3600000));
    return {
      label: `Sau ${hours} giờ (Hôm nay)`,
      shortLabel: `Sau ${hours}h`,
      urgency: "today",
      bucket: "today",
      exactDateStr,
      diffMs,
      badgeClass:
        "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/80",
    };
  }

  // 1 to 3 days
  if (diffMs <= 3 * 86400000) {
    const days = Math.max(1, Math.round(diffMs / 86400000));
    return {
      label: `Sau ${days} ngày`,
      shortLabel: `Sau ${days}d`,
      urgency: "near",
      bucket: "1-3d",
      exactDateStr,
      diffMs,
      badgeClass:
        "bg-cyan-50 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800/70",
    };
  }

  // 4 to 7 days (this week)
  if (diffMs <= 7 * 86400000) {
    const days = Math.round(diffMs / 86400000);
    return {
      label: `Sau ${days} ngày`,
      shortLabel: `Sau ${days}d`,
      urgency: "week",
      bucket: "4-7d",
      exactDateStr,
      diffMs,
      badgeClass:
        "bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-800/70",
    };
  }

  // Future > 7 days
  const days = Math.round(diffMs / 86400000);
  let label = `Sau ${days} ngày`;
  if (days >= 30) {
    const months = Math.round(days / 30);
    label = `Sau ${months} tháng`;
  }

  return {
    label,
    shortLabel: `Sau ${days}d`,
    urgency: "future",
    bucket: "future",
    exactDateStr,
    diffMs,
    badgeClass:
      "bg-slate-100 dark:bg-zinc-800/90 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700/60",
  };
}

/**
 * Predict next 4 scheduled review appearances according to FSRS algorithm.
 * Assumes the learner rates "Good" at each upcoming review.
 */
export function predictFutureWordReviews(
  word: WordDetail,
  maxSteps = 4,
  now: Date = new Date()
): ReviewStepProjection[] {
  const steps: ReviewStepProjection[] = [];
  const srs = word.srs;
  const isNew = (!srs.reps && !srs.repetitions) || srs.repetitions === 0;

  try {
    const scheduler = getFSRSScheduler();
    let currentCard = srsRowToCard(srs);

    // Step 1: The current schedule
    const step1Date = isNew ? now : getNextReviewDate(word);
    const step1DiffMs = step1Date.getTime() - now.getTime();
    const step1Days = Math.max(0, Math.round(step1DiffMs / 86400000));

    let step1Relative = "";
    if (step1DiffMs <= 0) {
      step1Relative = isNew ? "Chưa học (Bắt đầu ngay)" : "Cần ôn ngay";
    } else if (step1DiffMs <= 86400000) {
      const h = Math.max(1, Math.round(step1DiffMs / 3600000));
      step1Relative = `Sau ${h} giờ`;
    } else {
      step1Relative = `Sau ${step1Days} ngày`;
    }

    steps.push({
      step: 1,
      label: "Lần 1 (Kế tiếp)",
      date: step1Date,
      dateFormatted: step1Date.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      relativeLabel: step1Relative,
      intervalDays: srs.interval || srs.scheduled_days || 0,
      isCurrentSchedule: true,
    });

    // Simulate subsequent appearances (Step 2 .. maxSteps)
    let simDate = step1Date > now ? step1Date : now;
    for (let i = 2; i <= maxSteps; i++) {
      const nextResult = scheduler.next(currentCard, simDate, Rating.Good);
      currentCard = nextResult.card;
      const scheduledDays = Math.max(1, Math.round(currentCard.scheduled_days));
      simDate = new Date(currentCard.due.getTime());

      const totalDiffMs = simDate.getTime() - now.getTime();
      const totalDays = Math.max(1, Math.round(totalDiffMs / 86400000));

      let rel = `+${scheduledDays} ngày (sau ${totalDays}d)`;
      if (scheduledDays >= 30) {
        rel = `+${Math.round(scheduledDays / 30)} tháng (sau ${totalDays}d)`;
      }

      steps.push({
        step: i,
        label: i === 2 ? "Lần 2 (Dự kiến)" : i === maxSteps ? `Lần ${i} (Dài hạn)` : `Lần ${i} (Dự kiến)`,
        date: simDate,
        dateFormatted: simDate.toLocaleDateString("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
        relativeLabel: rel,
        intervalDays: scheduledDays,
      });
    }
  } catch (err) {
    console.warn("FSRS simulation error:", err);
  }

  return steps;
}

/**
 * Predict future appearances for a Grammar Lesson.
 */
export function predictFutureGrammarReviews(
  progress: GrammarProgress | undefined | null,
  maxSteps = 4,
  now: Date = new Date()
): ReviewStepProjection[] {
  const steps: ReviewStepProjection[] = [];
  const isUnattempted = !progress || progress.diagnosticStatus === "unattempted" || progress.reps === 0;

  try {
    const scheduler = getFSRSScheduler();
    const rowLike: Partial<SRSReview> = {
      next_review_date: progress?.nextReviewDate || now.toISOString(),
      stability: progress?.stability || 0,
      difficulty: progress?.difficulty || 0,
      reps: progress?.reps || 0,
      lapses: progress?.lapses || 0,
      state: (progress?.fsrsState ?? (isUnattempted ? State.New : State.Review)) as FSRSState,
      last_review: progress?.lastReview || progress?.lastAttemptDate || null,
    };

    let currentCard = srsRowToCard(rowLike);

    const step1Date = isUnattempted ? now : new Date(progress.nextReviewDate);
    const step1DiffMs = step1Date.getTime() - now.getTime();
    const step1Days = Math.max(0, Math.round(step1DiffMs / 86400000));

    let step1Relative = "";
    if (step1DiffMs <= 0) {
      step1Relative = isUnattempted ? "Chưa làm (Bắt đầu ngay)" : "Cần ôn ngay";
    } else if (step1DiffMs <= 86400000) {
      const h = Math.max(1, Math.round(step1DiffMs / 3600000));
      step1Relative = `Sau ${h} giờ`;
    } else {
      step1Relative = `Sau ${step1Days} ngày`;
    }

    steps.push({
      step: 1,
      label: "Lần 1 (Kế tiếp)",
      date: step1Date,
      dateFormatted: step1Date.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      relativeLabel: step1Relative,
      intervalDays: Math.round(currentCard.scheduled_days) || 0,
      isCurrentSchedule: true,
    });

    let simDate = step1Date > now ? step1Date : now;
    for (let i = 2; i <= maxSteps; i++) {
      const nextResult = scheduler.next(currentCard, simDate, Rating.Good);
      currentCard = nextResult.card;
      const scheduledDays = Math.max(1, Math.round(currentCard.scheduled_days));
      simDate = new Date(currentCard.due.getTime());

      const totalDiffMs = simDate.getTime() - now.getTime();
      const totalDays = Math.max(1, Math.round(totalDiffMs / 86400000));

      let rel = `+${scheduledDays} ngày (sau ${totalDays}d)`;
      if (scheduledDays >= 30) {
        rel = `+${Math.round(scheduledDays / 30)} tháng (sau ${totalDays}d)`;
      }

      steps.push({
        step: i,
        label: i === 2 ? "Lần 2 (Dự kiến)" : i === maxSteps ? `Lần ${i} (Dài hạn)` : `Lần ${i} (Dự kiến)`,
        date: simDate,
        dateFormatted: simDate.toLocaleDateString("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
        relativeLabel: rel,
        intervalDays: scheduledDays,
      });
    }
  } catch (err) {
    console.warn("FSRS grammar simulation error:", err);
  }

  return steps;
}
