/**
 * When the word library says a word comes back: the same rules a review session uses to pick cards
 * (buildReviewSession), so a word shown as due is one the next session will really ask.
 *  - due: a card is due (isDueSrs) and the session may ask it
 *  - buried: a review card is due, but the other card of the word was reviewed today, so it waits until
 *    tomorrow (isBuriedBySibling) → "Ôn mai"
 *  - waiting: the recall card ("Tự nhớ ra từ") is a new card: it comes when the daily new-card budget has room,
 *    not on a date → "Chờ lượt từ mới"
 *  - scheduled: the earliest coming date of a card in study
 *  - new: the word itself was never studied
 */
import type { WordDetail } from "@/types/database";
import { isDueSrs, nextLocalDayStart, toCard } from "./cards";
import { isBuriedBySibling, isNewCard } from "./smartReview";
import { formatNextReviewRelative, type ReviewTimeRelativeInfo } from "@/utils/reviewSchedule";

export type LibraryScheduleKind = "new" | "due" | "buried" | "waiting" | "scheduled";

export interface LibrarySchedule {
  kind: LibraryScheduleKind;
  info: ReviewTimeRelativeInfo;
  /** Sort key: when the word comes back (null for a word never studied) */
  sortAt: number | null;
  /** A session started now would ask a card of this word */
  isDue: boolean;
}

const dateStr = (d: Date) =>
  d.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function isNeverStudied(word: WordDetail): boolean {
  return (!word.srs.reps && !word.srs.repetitions) || word.srs.repetitions === 0;
}

export function librarySchedule(word: WordDetail, now: Date = new Date()): LibrarySchedule {
  if (isNeverStudied(word)) return { kind: "new", info: formatNextReviewRelative(null, true, now), sortAt: null, isDue: false };

  const cards = [toCard(word, "recognition"), ...(word.srsProduction ? [toCard(word, "production")] : [])];
  const due: number[] = [];
  const future: number[] = [];
  let buried = false;
  let waiting = false;
  for (const c of cards) {
    const at = new Date(c.srs.next_review_date).getTime();
    if (!Number.isFinite(at)) continue;
    if (c.direction === "production" && isNewCard(c)) {
      // A new recall card is due from its unlock date, but it is a new card: it waits for the daily budget
      if (isDueSrs(c.srs, now)) waiting = true;
      else future.push(at);
      continue;
    }
    if (!isDueSrs(c.srs, now)) future.push(at);
    else if (isBuriedBySibling(c, now)) buried = true;
    else due.push(at);
  }

  if (due.length > 0) {
    const at = Math.min(...due);
    return { kind: "due", info: formatNextReviewRelative(new Date(at), false, now), sortAt: at, isDue: true };
  }
  const tomorrow = nextLocalDayStart(now);
  if (buried) {
    return {
      kind: "buried",
      sortAt: tomorrow,
      isDue: false,
      info: {
        label: "Ôn mai (vừa ôn thẻ kia hôm nay)",
        shortLabel: "Ôn mai",
        urgency: "near",
        bucket: "1-3d",
        exactDateStr: dateStr(new Date(tomorrow)),
        diffMs: tomorrow - now.getTime(),
        badgeClass: "bg-sky-50 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-800/70",
      },
    };
  }
  if (waiting) {
    return {
      kind: "waiting",
      // After the words due and those back tomorrow, before the ones further away
      sortAt: tomorrow + 1,
      isDue: false,
      info: {
        label: "Chờ lượt từ mới (thẻ tự nhớ ra từ)",
        shortLabel: "Chờ lượt",
        urgency: "today",
        bucket: "waiting",
        exactDateStr: "Đến khi còn hạn mức từ mới trong ngày",
        diffMs: 0,
        badgeClass: "bg-violet-50 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-800/70",
      },
    };
  }
  if (future.length > 0) {
    const at = Math.min(...future);
    return { kind: "scheduled", info: formatNextReviewRelative(new Date(at), false, now), sortAt: at, isDue: false };
  }
  return { kind: "scheduled", info: formatNextReviewRelative(null, true, now), sortAt: null, isDue: false };
}
