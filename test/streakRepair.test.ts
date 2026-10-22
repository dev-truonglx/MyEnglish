import { describe, it, expect } from "vitest";
import {
  calculateStreakAndGoal,
  computeStreak,
  freezeNoticeText,
  getLocalDateString,
  markFreezeNoticeSeen,
  readStreakRepairDates,
  recordDailyActivity,
  setDailyGoal,
  streakRepairTarget,
  unannouncedFrozenDays,
  STREAK_REPAIRS_KEY,
} from "@/services/streak";
import { SYNCED_KV } from "@/services/sync/keys";
import { checkAndUnlockAchievements, getAchievements } from "@/services/achievements";

/** Local date `n` days before `today` */
const ago = (today: Date, n: number) => getLocalDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n));
/** Every day from `from` days ago to `to` days ago */
const range = (today: Date, from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => ago(today, from - i));

function logsWith(dates: Record<string, number>) {
  localStorage.setItem("myenglish_study_logs_v1", JSON.stringify(dates));
}

describe("B10 streak repair", () => {
  const today = new Date(2026, 9, 22, 12);

  it("offers a repair when yesterday alone broke the streak (no freeze left)", () => {
    const days = range(today, 6, 2); // 5 study days, yesterday missed
    const before = computeStreak(days, today, [], []);
    expect(before.current).toBe(0);
    expect(before.repairable).toEqual({ missedDay: ago(today, 1), streak: 5 });
    // Studying today does not repair it by itself
    expect(computeStreak([...days, ago(today, 0)], today, [], []).repairable).toEqual({ missedDay: ago(today, 1), streak: 5 });
  });

  it("a repaired day is covered like a frozen one, without using a freeze", () => {
    const days = [...range(today, 6, 2), ago(today, 0)];
    const r = computeStreak(days, today, [], [ago(today, 1)]);
    expect(r.current).toBe(6);
    expect(r.repairedDates).toEqual([ago(today, 1)]);
    expect(r.frozenDates).toEqual([]);
    expect(r.repairable).toBeNull();
    // 7 study days earn a freeze: a repair recorded for the day keeps it in stock
    const week = [...range(today, 8, 2), ago(today, 0)];
    expect(computeStreak(week, today, [], [ago(today, 1)])).toMatchObject({ current: 8, freezes: 1, frozenDates: [] });
  });

  it("no offer when a freeze covers the day, after two missed days, or once the day after has passed", () => {
    const week = range(today, 8, 2); // 7 study days: a freeze covers yesterday
    expect(computeStreak(week, today, [], [])).toMatchObject({ repairable: null, frozenDates: [ago(today, 1)] });
    expect(computeStreak(range(today, 7, 3), today, [], []).repairable).toBeNull(); // 2 missed days
    expect(computeStreak([...range(today, 7, 3), ago(today, 1)], today, [], []).repairable).toBeNull(); // missed 2 days ago
    expect(computeStreak([], today, [], []).repairable).toBeNull();
  });

  it("the answer that reaches twice the goal repairs yesterday", () => {
    const now = new Date();
    setDailyGoal(5);
    expect(streakRepairTarget(5)).toBe(10);
    logsWith({ [ago(now, 3)]: 4, [ago(now, 2)]: 6 });
    recordDailyActivity(9);
    let stats = calculateStreakAndGoal([]);
    expect(stats.currentStreak).toBe(1);
    expect(stats.streakRepair).toEqual({ missedDay: ago(now, 1), streak: 2, target: 10 });
    expect(readStreakRepairDates()).toEqual([]);

    recordDailyActivity(1);
    expect(readStreakRepairDates()).toEqual([ago(now, 1)]);
    stats = calculateStreakAndGoal([]);
    expect(stats.currentStreak).toBe(3);
    expect(stats.streakRepair).toBeNull();
    expect(stats.repairedDates).toEqual([ago(now, 1)]);
  });

  it("answers counted elsewhere (synced log) repair on the next streak check", () => {
    const now = new Date();
    setDailyGoal(5);
    logsWith({ [ago(now, 3)]: 4, [ago(now, 2)]: 6, [ago(now, 0)]: 12 });
    expect(calculateStreakAndGoal([]).currentStreak).toBe(3);
    expect(readStreakRepairDates()).toEqual([ago(now, 1)]);
  });

  it("repairs travel with the account like bonus freezes", () => {
    expect(SYNCED_KV[STREAK_REPAIRS_KEY]).toBe("arrayUnion");
    localStorage.setItem(STREAK_REPAIRS_KEY, "{bad");
    expect(readStreakRepairDates()).toEqual([]);
  });
});

describe("B10 freeze notice", () => {
  const today = new Date(2026, 9, 22, 12);

  it("tells each frozen day of the last week once", () => {
    expect(unannouncedFrozenDays(["2026-10-21"], today, null)).toEqual(["2026-10-21"]);
    expect(unannouncedFrozenDays(["2026-10-21"], today, "2026-10-21")).toEqual([]);
    expect(unannouncedFrozenDays(["2026-10-01", "2026-10-19"], today, null)).toEqual(["2026-10-19"]); // too old
    expect(unannouncedFrozenDays(["2026-10-21", "2026-10-19"], today, "2026-10-19")).toEqual(["2026-10-21"]);

    expect(unannouncedFrozenDays(["2026-10-21"], today)).toEqual(["2026-10-21"]);
    markFreezeNoticeSeen("2026-10-21");
    expect(unannouncedFrozenDays(["2026-10-21"], today)).toEqual([]);
    markFreezeNoticeSeen("2026-10-19"); // never goes back
    expect(unannouncedFrozenDays(["2026-10-21"], today)).toEqual([]);
  });

  it("names the day", () => {
    expect(freezeNoticeText(["2026-10-21"], today)).toBe("🧊 Đóng băng đã giữ chuỗi hôm qua");
    expect(freezeNoticeText(["2026-10-19"], today)).toBe("🧊 Đóng băng đã giữ chuỗi ngày 19/10");
    expect(freezeNoticeText(["2026-10-19", "2026-10-21"], today)).toBe("🧊 2 lượt đóng băng đã giữ chuỗi (19/10, hôm qua)");
  });
});

describe("B10 long streak badges", () => {
  it("50 and 100 days unlock through the same check as the shorter streaks, 365 later", () => {
    const got = checkAndUnlockAchievements({ currentStreak: 100 }).map((b) => b.id);
    expect(got).toEqual(expect.arrayContaining(["streak_3", "streak_7", "streak_30", "streak_50", "streak_100"]));
    expect(got).not.toContain("streak_365");

    const year = getAchievements({ currentStreak: 120 }).find((b) => b.id === "streak_365")!;
    expect(year).toMatchObject({ isUnlocked: false, currentValue: 120, targetValue: 365, progress: 33 });
    expect(checkAndUnlockAchievements({ currentStreak: 365 }).map((b) => b.id)).toEqual(["streak_365"]);
  });
});
