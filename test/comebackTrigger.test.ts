import { describe, it, expect } from "vitest";
import {
  COMEBACK_MAX_PLAN_DAYS,
  getComebackPlan,
  nextComebackPlan,
  resolveComeback,
  type ComebackPlan,
} from "@/services/comeback";
import {
  buildReviewSession,
  calculateUrgencyScore,
  isLeech,
  MAX_LEECHES_PER_SESSION,
  OVERDUE_RESERVE_SHARE,
} from "@/services/smartReview";
import { getLocalDateString } from "@/services/streak";
import { makeWord, reviewSrs } from "./helpers";
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

describe("B11 comeback after a short break", () => {
  const today = "2026-10-10";

  it("starts after 1-2 days off once more than 1.5 sessions are due", () => {
    const oneDayOff = { ...base, today, activeDates: ["2026-10-08"] };
    expect(nextComebackPlan(null, { ...oneDayOff, backlog: 46 })).toMatchObject({
      startedOn: today,
      missedDays: 1,
      backlogAtStart: 46,
      dailyQuota: 16, // about a third of the pile, at least the daily goal
      dayStart: { on: today, backlog: 46, previous: 46 },
    });
    expect(nextComebackPlan(null, { ...oneDayOff, backlog: 45 })).toBeNull(); // 1.5 sessions: reviewed as usual
    expect(nextComebackPlan(null, { ...base, today, activeDates: ["2026-10-07"], backlog: 60 })).toMatchObject({ missedDays: 2 });
    // The long-break path is unchanged: 3 days off and more than one session
    expect(nextComebackPlan(null, { ...base, today, activeDates: ["2026-10-06"], backlog: 31 })).toMatchObject({ missedDays: 3 });
  });

  it("not for a learner who studied yesterday, so a plan that ran its course is not restarted", () => {
    expect(nextComebackPlan(null, { ...base, today, activeDates: ["2026-10-09"], backlog: 200 })).toBeNull();
    const plan: ComebackPlan = { startedOn: "2026-09-26", missedDays: 1, backlogAtStart: 90, dailyQuota: 30 };
    const input = { ...base, today, activeDates: ["2026-10-09"], backlog: 120 };
    expect(COMEBACK_MAX_PLAN_DAYS).toBe(14);
    expect(nextComebackPlan(plan, input)).toBeNull(); // day 15: over
    expect(nextComebackPlan(null, input)).toBeNull(); // and not started again
  });

  it("resolveComeback stores a plan started by the backlog and keeps it the next day", () => {
    logsWith({ [dateOffset(-2)]: 12 });
    const status = resolveComeback(50, 30);
    expect(status).toMatchObject({ dayNumber: 1, todayRemaining: 17, backlog: 50, newWordsPerDay: 0 });
    expect(getComebackPlan()).toMatchObject({ missedDays: 1, startedOn: dateOffset(0) });
    // Studying today: same plan, today's share goes down
    logsWith({ [dateOffset(-2)]: 12, [dateOffset(0)]: 7 });
    expect(resolveComeback(43, 30)?.todayRemaining).toBe(10);
  });
});

describe("B11 overdue cards get a share of a full session", () => {
  /** Review card due about a day ago: a high daily loss, so a high priority */
  const fresh = (id: string, topic = "General Tech") => makeWord(id, { topic, srs: reviewSrs(5, 6) });
  /** Review card overdue for `days` days: mostly forgotten already, so a low priority */
  const late = (id: string, days: number, extra: Partial<WordDetail["srs"]> = {}) =>
    makeWord(id, { srs: { ...reviewSrs(2, days + 2), ...extra } });
  const now = new Date();
  const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

  it("the priority order alone leaves long-overdue cards out", () => {
    expect(calculateUrgencyScore(late("x", 60), now).urgencyScore).toBeLessThan(calculateUrgencyScore(fresh("y"), now).urgencyScore);
  });

  it("reserves about a quarter of the review slots for the cards longest past due, spread through the session", () => {
    const words = [
      ...Array.from({ length: 16 }, (_, i) => fresh(`f${i}`)),
      late("late40", 40),
      late("late50", 50),
      late("late60", 60),
      late("late70", 70),
    ];
    const session = buildReviewSession(words, 0, now, { maxCards: 8, noNewCards: true });
    expect(session).toHaveLength(8);
    expect(new Set(ids(session)).size).toBe(8);
    const reserve = Math.floor(8 * OVERDUE_RESERVE_SHARE);
    expect(reserve).toBe(2);
    // The two most overdue, not the next ones
    expect(ids(session).filter((id) => id.startsWith("late")).sort()).toEqual(["late60", "late70"]);
    // The rest by priority (all fresh cards score the same: deck order)
    expect(ids(session).filter((id) => id.startsWith("f"))).toEqual(["f0", "f1", "f2", "f3", "f4", "f5"]);
    // Not left at the end of the session
    expect(ids(session).indexOf("late70")).toBeLessThan(4);
  });

  it("also on a comeback day (today's share, the plan's new words)", () => {
    const words = [...Array.from({ length: 30 }, (_, i) => fresh(`f${i}`)), late("late90", 90), makeWord("n1")];
    const session = buildReviewSession(words, 0, now, { maxCards: 12, comebackNewCards: 0 });
    expect(session).toHaveLength(12);
    expect(ids(session)).toContain("late90");
  });

  it("a backlog that fits is unchanged: every card, in priority order", () => {
    const words = [fresh("f0"), late("late60", 60), fresh("f1"), late("late40", 40)];
    const session = buildReviewSession(words, 0, now, { maxCards: 8, noNewCards: true });
    expect(ids(session)).toEqual(["f0", "f1", "late40", "late60"]);
  });

  it("keeps the leech cap and the topic interleaving", () => {
    const leech = (id: string, days: number) => late(id, days, { lapses: 6 });
    const words = [
      ...Array.from({ length: 10 }, (_, i) => fresh(`a${i}`, "A")),
      ...Array.from({ length: 10 }, (_, i) => fresh(`b${i}`, "B")),
      ...Array.from({ length: 8 }, (_, i) => leech(`leech${i}`, 30 + i * 5)),
    ];
    const session = buildReviewSession(words, 0, now, { maxCards: 20, noNewCards: true });
    expect(session).toHaveLength(20);
    expect(new Set(ids(session)).size).toBe(20);
    expect(session.filter((c) => isLeech(c.srs)).length).toBeLessThanOrEqual(MAX_LEECHES_PER_SESSION);
    // Never three cards of one topic in a row while another topic is left
    const topics = session.map((c) => (c.topic || "").toLowerCase());
    for (let i = 2; i < topics.length; i++) {
      const run = topics[i] === topics[i - 1] && topics[i] === topics[i - 2];
      if (run) expect(topics.slice(i + 1).every((t) => t === topics[i])).toBe(true);
    }
  });

  it("the reserve is for Review cards: relearning cards past due keep their own priority", () => {
    // Relearning cards (minute steps) fill the top by priority, however late they are
    const relearning = Array.from({ length: 10 }, (_, i) => makeWord(`relearn${i}`, { srs: { ...reviewSrs(2, 80), state: 3 } }));
    const session = buildReviewSession([...relearning, late("late70", 70), late("late40", 40)], 0, now, { maxCards: 8, noNewCards: true });
    expect(session).toHaveLength(8);
    expect(ids(session).filter((id) => id.startsWith("late")).sort()).toEqual(["late40", "late70"]);
    expect(ids(session)[0]).toBe("relearn0");
  });
});
