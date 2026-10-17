/**
 * Closing the day: one clear line that says the learner may stop ("Hôm nay xong ✓") once the daily goal is
 * reached, and exactly when the next review comes ("Lượt ôn tới: 14:30, khoảng 6 thẻ"). Without it, studying
 * feels endless. Shared by the Today tab's day close and the end-of-session summary.
 */
export interface NextReview {
  at: Date;
  count: number;
}

const WEEKDAYS = ["Chủ nhật", "thứ Hai", "thứ Ba", "thứ Tư", "thứ Năm", "thứ Sáu", "thứ Bảy"];

const pad = (n: number) => String(n).padStart(2, "0");
export const clockTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function localDayDiff(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** When the next review comes, said the short way: "14:30 (25 phút nữa)", "14:30", "mai 08:15", "thứ Hai 20/10" */
export function nextReviewWhen(at: Date, now: Date = new Date()): string {
  const days = localDayDiff(now, at);
  if (days <= 0) {
    const mins = Math.round((at.getTime() - now.getTime()) / 60000);
    return mins < 60 ? `${clockTime(at)} (${Math.max(1, mins)} phút nữa)` : clockTime(at);
  }
  if (days === 1) return `mai ${clockTime(at)}`;
  return `${WEEKDAYS[at.getDay()]} ${at.getDate()}/${at.getMonth() + 1}`;
}

/** "Lượt ôn tới: 14:30, khoảng 6 thẻ" */
export function nextReviewText(next: NextReview | null, now: Date = new Date()): string {
  if (!next) return "Chưa có lượt ôn nào sắp tới.";
  return `Lượt ôn tới: ${nextReviewWhen(next.at, now)}, khoảng ${next.count} thẻ`;
}

export interface DayCloseInput {
  goalReached: boolean;
  todayCount: number;
  dailyGoal: number;
  /** Cards still due now (null: unknown) */
  dueNow: number | null;
}

export interface DayCloseStatus {
  /** The learner may stop: the daily goal is reached */
  done: boolean;
  title: string;
  note: string;
}

/** What the day's close says: done (stop here, guilt-free), or how far from the goal */
export function dayCloseStatus(s: DayCloseInput): DayCloseStatus {
  if (s.goalReached) {
    return {
      done: true,
      title: "Hôm nay xong ✓",
      note:
        s.dueNow && s.dueNow > 0
          ? `Bạn có thể dừng ở đây. Còn ${s.dueNow} thẻ đến hạn: không bắt buộc, lần ôn sau làm cũng được.`
          : "Bạn có thể dừng ở đây. App sẽ nhắc khi đến lượt ôn.",
    };
  }
  if (s.todayCount === 0) {
    return { done: false, title: "Hôm nay chưa có thẻ nào đến hạn", note: "Ôn nhanh 3 thẻ là đủ giữ chuỗi ngày học." };
  }
  const left = Math.max(1, s.dailyGoal - s.todayCount);
  return { done: false, title: "Xong phần đến hạn", note: `Còn ${left} câu nữa là đạt mục tiêu hôm nay (${s.todayCount}/${s.dailyGoal}).` };
}
