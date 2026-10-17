import { describe, it, expect } from "vitest";
import { forecastSessionLoad, summarizeTodayWork } from "@/services/smartReview";
import { makeWord } from "./helpers";
import type { SRSReview } from "@/types/database";

const now = new Date(2026, 9, 17, 15, 0); // Sat 17 Oct 2026, 15:00 local
const at = (h: number) => new Date(now.getTime() + h * 3600 * 1000).toISOString();
const dayAt = (d: number, hour = 9) => new Date(2026, 9, 17 + d, hour).toISOString();
const review = (extra: Partial<SRSReview> = {}): Partial<SRSReview> => ({
  state: 2,
  reps: 4,
  repetitions: 4,
  stability: 6,
  scheduled_days: 5,
  last_review: dayAt(-5),
  next_review_date: dayAt(3),
  ...extra,
});
const prod = (id: string, extra: Partial<SRSReview> = {}) =>
  ({ word_id: id, ease_factor: 2.5, interval: 5, repetitions: 3, ...review(), ...extra }) as SRSReview;
const none = { recognition: 0, production: 0 };

describe("review forecast with the session's rules", () => {
  it("today is exactly the reviews a session would ask now", () => {
    const words = [
      makeWord("a", { srs: review({ next_review_date: dayAt(-2) }) }),
      // both cards due: one today (the other waits)
      makeWord("b", { srs: review({ next_review_date: dayAt(-1) }), srsProduction: prod("b", { next_review_date: dayAt(-1) }) }),
      // a learning card due now goes first; the review card of the same word waits
      makeWord("c", { srs: review({ next_review_date: dayAt(-1) }), srsProduction: prod("c", { state: 1, scheduled_days: 0, next_review_date: at(-0.1) }) }),
      makeWord("new"),
      makeWord("s", { srs: review({ next_review_date: dayAt(-1) }), suspended: 1 }),
    ];
    const f = forecastSessionLoad(words, 7, now);
    expect(f.days[0].reviews).toBe(summarizeTodayWork(words, none, now).reviews);
    // a, b (one card), c (the learning card first: its review sibling waits)
    expect(f.days[0].reviews).toBe(3);
  });

  it("the card waiting for its sibling comes the next day", () => {
    const w = makeWord("b", { srs: review({ next_review_date: dayAt(-1) }), srsProduction: prod("b", { next_review_date: dayAt(-1) }) });
    const f = forecastSessionLoad([w], 7, now);
    expect(f.days.map((d) => d.reviews)).toEqual([1, 1, 0, 0, 0, 0, 0]);
  });

  it("a card buried today (its sibling was reviewed today) goes to tomorrow", () => {
    const w = makeWord("x", {
      srs: review({ next_review_date: dayAt(-1) }),
      srsProduction: prod("x", { last_review: at(-2), next_review_date: dayAt(6) }),
    });
    expect(forecastSessionLoad([w], 7, now).days.map((d) => d.reviews)).toEqual([0, 1, 0, 0, 0, 0, 1]);
  });

  it("two review cards due the same future day: one a day", () => {
    const w = makeWord("y", { srs: review({ next_review_date: dayAt(2) }), srsProduction: prod("y", { next_review_date: dayAt(2, 20) }) });
    expect(forecastSessionLoad([w], 7, now).days.map((d) => d.reviews)).toEqual([0, 0, 1, 1, 0, 0, 0]);
  });

  it("learning steps later today are apart; new recall cards are not reviews", () => {
    const w = makeWord("z", {
      srs: review({ state: 1, scheduled_days: 0, next_review_date: at(3) }),
      srsProduction: prod("z", { state: 0, reps: 0, repetitions: 0, next_review_date: dayAt(-2) }),
    });
    const f = forecastSessionLoad([w], 7, now);
    expect(f.laterToday).toBe(1);
    expect(f.days.every((d) => d.reviews === 0)).toBe(true);
  });

  it("dates are local days from today", () => {
    const f = forecastSessionLoad([], 3, now);
    expect(f.days.map((d) => d.date)).toEqual(["2026-10-17", "2026-10-18", "2026-10-19"]);
  });
});
