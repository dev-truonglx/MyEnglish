import { describe, it, expect } from "vitest";
import {
  applyComebackToWork,
  comebackQuota,
  comebackStatus,
  getComebackPlan,
  missedDaysBefore,
  nextComebackPlan,
  resolveComeback,
  COMEBACK_MAX_PLAN_DAYS,
  type ComebackPlan,
} from "@/services/comeback";
import { evaluateMotivationState } from "@/services/duoMotivation";
import { buildReviewSession } from "@/services/smartReview";
import { getLocalDateString } from "@/services/streak";
import type { WordDetail } from "@/types/database";

const base = { maxSessionSize: 30, dailyGoal: 10 };

function logsWith(dates: Record<string, number>) {
  localStorage.setItem("myenglish_study_logs_v1", JSON.stringify(dates));
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return getLocalDateString(d);
}

describe("comeback plan", () => {
  it("counts the days without study before today", () => {
    expect(missedDaysBefore(["2026-10-01", "2026-10-02"], "2026-10-06")).toBe(3);
    expect(missedDaysBefore(["2026-10-05"], "2026-10-06")).toBe(0);
    expect(missedDaysBefore(["2026-10-06"], "2026-10-06")).toBeNull(); // only today: no history before
    expect(missedDaysBefore([], "2026-10-06")).toBeNull();
  });

  it("asks about a third of the backlog per day, within the daily goal and one session", () => {
    expect(comebackQuota(120, 30, 10)).toBe(30);
    expect(comebackQuota(45, 30, 10)).toBe(15);
    expect(comebackQuota(12, 30, 10)).toBe(10);
  });

  it("starts only after 3+ missed days with more due than one day's share", () => {
    const input = { ...base, today: "2026-10-10", backlog: 90 };
    expect(nextComebackPlan(null, { ...input, activeDates: ["2026-10-06"] })).toMatchObject({
      startedOn: "2026-10-10",
      missedDays: 3,
      backlogAtStart: 90,
      dailyQuota: 30,
    });
    expect(nextComebackPlan(null, { ...input, activeDates: ["2026-10-07"] })).toBeNull(); // 2 missed days
    expect(nextComebackPlan(null, { ...input, backlog: 12, activeDates: ["2026-10-01"] })).toBeNull(); // small pile
    expect(nextComebackPlan(null, { ...input, activeDates: [] })).toBeNull(); // new learner
  });

  it("marks the plan done when nothing is due, shows it that day, then drops it", () => {
    const plan: ComebackPlan = { startedOn: "2026-10-10", missedDays: 4, backlogAtStart: 90, dailyQuota: 30 };
    const input = { ...base, activeDates: ["2026-10-10"], backlog: 0 };
    const done = nextComebackPlan(plan, { ...input, today: "2026-10-12" });
    expect(done?.completedOn).toBe("2026-10-12");
    expect(nextComebackPlan(done, { ...input, today: "2026-10-12" })).toEqual(done);
    expect(nextComebackPlan(done, { ...input, today: "2026-10-13", backlog: 5 })).toBeNull();
    // Never longer than the max length
    expect(nextComebackPlan(plan, { ...input, backlog: 40, today: dateAfter("2026-10-10", COMEBACK_MAX_PLAN_DAYS) })).toBeNull();
  });

  it("reports today's share and the days left", () => {
    const plan: ComebackPlan = { startedOn: "2026-10-10", missedDays: 4, backlogAtStart: 90, dailyQuota: 30 };
    expect(comebackStatus(plan, 90, 0, "2026-10-10")).toMatchObject({ dayNumber: 1, todayRemaining: 30, daysLeft: 3 });
    expect(comebackStatus(plan, 70, 20, "2026-10-10")).toMatchObject({ todayRemaining: 10, daysLeft: 3 });
    expect(comebackStatus(plan, 60, 30, "2026-10-10")).toMatchObject({ todayRemaining: 0, daysLeft: 2 });
    expect(comebackStatus(plan, 50, 0, "2026-10-11")).toMatchObject({ dayNumber: 2, todayRemaining: 30, daysLeft: 2 });
  });

  it("counts only today's share and no new words while the plan runs", () => {
    const work = { reviews: 90, newToday: 8, total: 98 };
    const plan: ComebackPlan = { startedOn: "2026-10-10", missedDays: 4, backlogAtStart: 90, dailyQuota: 30 };
    expect(applyComebackToWork(work, comebackStatus(plan, 90, 12, "2026-10-10"))).toEqual({ reviews: 18, newToday: 0, total: 18 });
    expect(applyComebackToWork(work, comebackStatus(plan, 60, 30, "2026-10-10")).total).toBe(0);
    expect(applyComebackToWork(work, null)).toEqual(work);
    const caughtUp = comebackStatus({ ...plan, completedOn: "2026-10-12" }, 0, 5, "2026-10-12");
    expect(applyComebackToWork({ reviews: 0, newToday: 8, total: 8 }, caughtUp).total).toBe(8);
  });

  it("resolveComeback stores the plan from the activity log", () => {
    logsWith({ [dateOffset(-6)]: 12 });
    const status = resolveComeback(80, 30);
    expect(status).toMatchObject({ dayNumber: 1, todayRemaining: 27, backlog: 80 });
    expect(getComebackPlan()?.missedDays).toBe(5);
    // Studying today keeps the same plan
    logsWith({ [dateOffset(-6)]: 12, [dateOffset(0)]: 7 });
    expect(resolveComeback(73, 30)?.todayRemaining).toBe(20);
    expect(resolveComeback(0, 30)?.caughtUp).toBe(true);
  });

  it("the nudge welcomes back instead of pressing about the streak", () => {
    const plan: ComebackPlan = { startedOn: "2026-10-10", missedDays: 4, backlogAtStart: 90, dailyQuota: 30 };
    const state = evaluateMotivationState({
      dueCount: 30,
      consecutiveSkips: 4,
      streak: 0,
      todayCount: 0,
      dailyGoal: 10,
      hour: 21,
      comeback: comebackStatus(plan, 90, 0, "2026-10-10"),
    });
    expect(state.title).toContain("quay lại");
    expect(state.mascotMood).toBe("happy");
    expect(state.tone).toBe("level_1_encouraging");
  });
});

describe("buildReviewSession options", () => {
  const word = (id: string, reviewed: boolean): WordDetail =>
    ({
      id,
      word: id,
      meaning_vn: "nghĩa " + id,
      topic: "General",
      created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      examples: [],
      srs: reviewed
        ? {
            word_id: id,
            state: 2,
            reps: 3,
            lapses: 0,
            stability: 5,
            difficulty: 5,
            last_review: new Date(Date.now() - 20 * 86_400_000).toISOString(),
            next_review_date: new Date(Date.now() - 15 * 86_400_000).toISOString(),
          }
        : { word_id: id, state: 0, reps: 0, lapses: 0, next_review_date: new Date(Date.now() - 1000).toISOString() },
    }) as unknown as WordDetail;

  it("caps the session at today's share and leaves new words out", () => {
    const words = [...Array.from({ length: 12 }, (_, i) => word(`r${i}`, true)), word("n1", false), word("n2", false)];
    const normal = buildReviewSession(words, 0);
    expect(normal.some((c) => c.id.startsWith("n"))).toBe(true);
    const comeback = buildReviewSession(words, 0, new Date(), { maxCards: 5, noNewCards: true });
    expect(comeback).toHaveLength(5);
    expect(comeback.every((c) => c.id.startsWith("r"))).toBe(true);
  });
});

function dateAfter(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return getLocalDateString(new Date(y, m - 1, d + days));
}
