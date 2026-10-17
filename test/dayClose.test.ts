import { describe, it, expect } from "vitest";
import { clockTime, dayCloseStatus, nextReviewText, nextReviewWhen } from "@/services/dayClose";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m); // October 2026 (17th is a Saturday)

describe("next review", () => {
  const now = at(17, 14, 5);

  it("says the time today, with minutes when it is soon", () => {
    expect(nextReviewWhen(at(17, 14, 30), now)).toBe("14:30 (25 phút nữa)");
    expect(nextReviewWhen(at(17, 14, 5), now)).toBe("14:05 (1 phút nữa)");
    expect(nextReviewWhen(at(17, 18, 0), now)).toBe("18:00");
  });

  it("says tomorrow, or the weekday and date further on", () => {
    expect(nextReviewWhen(at(18, 8, 15), now)).toBe("mai 08:15");
    expect(nextReviewWhen(at(19, 9, 0), now)).toBe("thứ Hai 19/10");
    expect(nextReviewWhen(at(25, 9, 0), now)).toBe("Chủ nhật 25/10");
  });

  it("reads as one line with the card count", () => {
    expect(nextReviewText({ at: at(17, 14, 30), count: 6 }, at(17, 13, 0))).toBe("Lượt ôn tới: 14:30, khoảng 6 thẻ");
    expect(nextReviewText(null)).toBe("Chưa có lượt ôn nào sắp tới.");
  });

  it("pads hours and minutes", () => {
    expect(clockTime(at(17, 7, 3))).toBe("07:03");
  });
});

describe("day close", () => {
  it("is done once the goal is reached, and says the learner may stop", () => {
    const s = dayCloseStatus({ goalReached: true, todayCount: 12, dailyGoal: 10, dueNow: 0 });
    expect(s.done).toBe(true);
    expect(s.title).toBe("Hôm nay xong ✓");
    expect(s.note).toMatch(/dừng ở đây/);
  });

  it("still done with cards due, which become optional", () => {
    const s = dayCloseStatus({ goalReached: true, todayCount: 30, dailyGoal: 30, dueNow: 4 });
    expect(s.done).toBe(true);
    expect(s.note).toMatch(/Còn 4 thẻ đến hạn: không bắt buộc/);
  });

  it("says how far the goal is when not reached", () => {
    const s = dayCloseStatus({ goalReached: false, todayCount: 7, dailyGoal: 10, dueNow: null });
    expect(s.done).toBe(false);
    expect(s.note).toBe("Còn 3 câu nữa là đạt mục tiêu hôm nay (7/10).");
  });

  it("offers the 3-card start when nothing was studied", () => {
    const s = dayCloseStatus({ goalReached: false, todayCount: 0, dailyGoal: 10, dueNow: 0 });
    expect(s.done).toBe(false);
    expect(s.title).toBe("Hôm nay chưa có thẻ nào đến hạn");
  });
});
