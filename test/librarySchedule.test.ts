import { describe, it, expect } from "vitest";
import { librarySchedule } from "@/services/librarySchedule";
import { buildReviewSession } from "@/services/smartReview";
import { makeWord, DAY_MS } from "./helpers";
import type { SRSReview } from "@/types/database";

const now = new Date(2026, 9, 17, 15, 0); // 17 Oct 2026 15:00 local
const at = (hoursFromNow: number) => new Date(now.getTime() + hoursFromNow * 3600 * 1000).toISOString();
const review = (extra: Partial<SRSReview> = {}): Partial<SRSReview> => ({
  state: 2,
  reps: 4,
  repetitions: 4,
  stability: 6,
  scheduled_days: 5,
  last_review: at(-5 * 24),
  next_review_date: at(48),
  ...extra,
});
const production = (id: string, extra: Partial<SRSReview> = {}) =>
  ({ word_id: id, ease_factor: 2.5, interval: 0, repetitions: 0, ...extra }) as SRSReview;

describe("library schedule", () => {
  it("a word never studied is 'Chưa học'", () => {
    const s = librarySchedule(makeWord("fresh"), now);
    expect(s.kind).toBe("new");
    expect(s.info.bucket).toBe("new");
  });

  it("a due review card is due, with the usual overdue label", () => {
    const s = librarySchedule(makeWord("d", { srs: review({ next_review_date: at(-30) }) }), now);
    expect(s).toMatchObject({ kind: "due", isDue: true });
    expect(s.info.bucket).toBe("due");
    expect(s.info.label).toMatch(/Quá hạn/);
  });

  it("a new recall card past its unlock date waits for the new-card budget: 'Chờ lượt từ mới', not overdue", () => {
    const w = makeWord("p", {
      srs: review({ next_review_date: at(72) }),
      srsProduction: production("p", { state: 0, reps: 0, next_review_date: at(-26) }),
    });
    const s = librarySchedule(w, now);
    expect(s).toMatchObject({ kind: "waiting", isDue: false });
    expect(s.info.shortLabel).toBe("Chờ lượt");
    expect(s.info.bucket).toBe("waiting");
    // The session agrees: with no new-card budget left it does not ask the word
    expect(buildReviewSession([w], 99, now)).toHaveLength(0);
  });

  it("a new recall card not unlocked yet shows its date", () => {
    const w = makeWord("q", {
      srs: review({ next_review_date: at(72) }),
      srsProduction: production("q", { state: 0, reps: 0, next_review_date: at(10) }),
    });
    expect(librarySchedule(w, now)).toMatchObject({ kind: "scheduled", isDue: false });
  });

  it("a due review card whose other card was reviewed today is 'Ôn mai'", () => {
    const w = makeWord("b", {
      srs: review({ next_review_date: at(-3) }),
      srsProduction: production("b", { state: 2, reps: 3, stability: 4, scheduled_days: 4, last_review: at(-1), next_review_date: at(96) }),
    });
    const s = librarySchedule(w, now);
    expect(s).toMatchObject({ kind: "buried", isDue: false });
    expect(s.info.shortLabel).toBe("Ôn mai");
    expect(s.info.bucket).toBe("1-3d");
    expect(buildReviewSession([w], 0, now)).toHaveLength(0);
  });

  it("a due card wins over a waiting recall card, and its date is the one shown", () => {
    const w = makeWord("w", {
      srs: review({ next_review_date: at(-5) }),
      srsProduction: production("w", { state: 0, reps: 0, next_review_date: at(-40) }),
    });
    const s = librarySchedule(w, now);
    expect(s.kind).toBe("due");
    expect(s.sortAt).toBe(new Date(at(-5)).getTime());
  });

  it("sorts: due, then tomorrow, then waiting, then later", () => {
    const due = librarySchedule(makeWord("a", { srs: review({ next_review_date: at(-1) }) }), now).sortAt!;
    const buried = librarySchedule(
      makeWord("b", {
        srs: review({ next_review_date: at(-3) }),
        srsProduction: production("b", { state: 2, reps: 3, stability: 4, scheduled_days: 4, last_review: at(-1), next_review_date: at(96) }),
      }),
      now
    ).sortAt!;
    const waiting = librarySchedule(
      makeWord("c", { srs: review({ next_review_date: at(72) }), srsProduction: production("c", { state: 0, reps: 0, next_review_date: at(-2) }) }),
      now
    ).sortAt!;
    const later = librarySchedule(makeWord("d", { srs: review({ next_review_date: at(5 * 24) }) }), now).sortAt!;
    expect(due < buried && buried < waiting && waiting < later).toBe(true);
    expect(buried - now.getTime()).toBeLessThan(DAY_MS);
  });
});
