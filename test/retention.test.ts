import { describe, it, expect } from "vitest";
import { computeReturnRates, focusStats } from "@/services/retention";
import type { LearningEvent } from "@/services/learningEvents";

const today = new Date(2026, 9, 17, 9, 0); // 17 Oct 2026, local

describe("return rates", () => {
  it("D1: share of study days followed by a study day; today is never judged", () => {
    // 14, 15, 16 studied; 16 → 17 (today) is not over yet, so 16 is not judged
    const r = computeReturnRates(["2026-10-14", "2026-10-15", "2026-10-16"], { today });
    expect(r.d1).toEqual({ days: 2, returned: 2, rate: 1 });
    expect(r.d7.days).toBe(0);
    expect(r.daysInNextWeek).toBeNull();
  });

  it("D7 and days in the following week", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-04", "2026-10-08"];
    const r = computeReturnRates(days, { today });
    // Judged for D7: days with day+7 before today (all four here: 10-08 + 7 = 10-15)
    expect(r.d7.days).toBe(4);
    // 10-01 → 10-08 studied; the others not
    expect(r.d7.returned).toBe(1);
    // Following week of 10-01: 02, 04, 08 = 3; of 10-02: 04, 08 = 2; of 10-04: 08 = 1; of 10-08: 0
    expect(r.daysInNextWeek).toBeCloseTo(6 / 4);
  });

  it("crosses a month end and a DST-free local calendar", () => {
    const r = computeReturnRates(["2026-09-30", "2026-10-01"], { today });
    expect(r.d1).toEqual({ days: 2, returned: 1, rate: 0.5 });
  });

  it("window, previous window and a filter", () => {
    const days = ["2026-09-01", "2026-09-02", "2026-10-10", "2026-10-11"];
    const current = computeReturnRates(days, { today, windowDays: 30 });
    expect(current.d1.days).toBe(2); // only October
    const previous = computeReturnRates(days, { today, windowDays: 30, offsetDays: 30 });
    expect(previous.d1).toEqual({ days: 2, returned: 1, rate: 0.5 });
    const only = computeReturnRates(days, { today, only: (d) => d === "2026-10-11" });
    expect(only.d1).toEqual({ days: 1, returned: 0, rate: 0 });
  });

  it("no study day: no rate", () => {
    expect(computeReturnRates([], { today }).d1).toEqual({ days: 0, returned: 0, rate: null });
  });
});

describe("focus stats", () => {
  const ev = (type: LearningEvent["type"], id: string, meta: Record<string, unknown> = {}, at = "2026-10-15T05:00:00.000Z"): LearningEvent => ({
    type,
    at,
    meta: { id, ...meta },
  });

  it("counts completed, abandoned and started-but-never-ended sessions", () => {
    const s = focusStats([
      ev("focus_started", "a"),
      ev("focus_completed", "a", { day: "2026-10-15", activeSec: 600, cards: 10, firstTry: 8 }),
      ev("focus_started", "b"),
      ev("focus_abandoned", "b", { activeSec: 120, cards: 2 }),
      ev("focus_started", "c"), // app quit
      ev("focus_started", "d"),
      ev("focus_completed", "d", { day: "2026-10-16", activeSec: 300, cards: 6, firstTry: 3 }),
    ]);
    expect(s.sessions).toBe(4);
    expect(s.completed).toBe(2);
    expect(s.abandoned).toBe(2);
    expect(s.completionRate).toBe(0.5);
    expect(s.avgMinutes).toBeCloseTo(7.5);
    expect(s.firstTryRate).toBeCloseTo(11 / 16);
    expect([...s.completedDays].sort()).toEqual(["2026-10-15", "2026-10-16"]);
  });

  it("a session started twice (development double mount) counts once", () => {
    const s = focusStats([ev("focus_started", "a"), ev("focus_started", "a"), ev("focus_completed", "a", { day: "2026-10-15" })]);
    expect(s.sessions).toBe(1);
    expect(s.completed).toBe(1);
  });
});
