import { describe, it, expect } from "vitest";
import {
  clockActiveMs,
  clockRemainingMs,
  focusOutcome,
  focusUntil,
  focusXp,
  focusXpToday,
  endFocus,
  getFocusSettings,
  saveFocusSettings,
  newFocusPlan,
  nextReviewPeek,
  pauseClock,
  resumeClock,
  startClock,
  DEFAULT_FOCUS_MINUTES,
  FOCUS_REMINDER_MARGIN_MS,
  FOCUS_XP_DAILY_CAP,
} from "@/services/focusSession";
import { isFocusActive, isMainSessionActive, setFocusUntil } from "@/services/activeSession";
import { getXPState } from "@/services/smartReview";
import type { WordDetail } from "@/types/database";

const MIN = 60 * 1000;

describe("focus clock", () => {
  it("counts only running time and stops while paused", () => {
    let c = startClock(10, 0);
    expect(clockRemainingMs(c, 3 * MIN)).toBe(7 * MIN);
    c = pauseClock(c, 3 * MIN); // window left
    expect(clockActiveMs(c, 20 * MIN)).toBe(3 * MIN);
    c = resumeClock(c, 20 * MIN); // back 17 minutes later
    expect(clockRemainingMs(c, 22 * MIN)).toBe(5 * MIN);
    expect(clockRemainingMs(c, 40 * MIN)).toBe(0);
  });

  it("pausing or resuming twice changes nothing", () => {
    const c = pauseClock(pauseClock(startClock(5, 0), MIN), 2 * MIN);
    expect(clockActiveMs(c, 9 * MIN)).toBe(MIN);
    const r = resumeClock(resumeClock(c, 3 * MIN), 4 * MIN);
    expect(r.runningSince).toBe(3 * MIN);
  });

  it("keeps reminders off until the planned end plus a margin", () => {
    const c = startClock(10, 0);
    expect(focusUntil(c, 4 * MIN)).toBe(10 * MIN + FOCUS_REMINDER_MARGIN_MS);
    // Paused: the block is not moved forward, it runs out
    const p = pauseClock(c, 4 * MIN);
    expect(focusUntil(p, 4 * MIN)).toBe(10 * MIN + FOCUS_REMINDER_MARGIN_MS);
  });
});

describe("focus outcome and XP", () => {
  it("time up or no card left is completed; leaving early only after 80% of the time", () => {
    expect(focusOutcome("time", 10 * MIN, 10 * MIN)).toBe("completed");
    expect(focusOutcome("queue", 2 * MIN, 10 * MIN)).toBe("completed");
    expect(focusOutcome("user", 8 * MIN, 10 * MIN)).toBe("completed");
    expect(focusOutcome("user", 7.9 * MIN, 10 * MIN)).toBe("abandoned");
  });

  it("pays per active minute, needs a few cards, and respects the daily cap", () => {
    const base = { completed: true, plannedMin: 10, cards: 12, earnedToday: 0 };
    expect(focusXp({ ...base, activeMs: 10 * MIN })).toBe(20);
    expect(focusXp({ ...base, activeMs: 4.5 * MIN })).toBe(8); // whole minutes
    expect(focusXp({ ...base, activeMs: 10 * MIN, completed: false })).toBe(0);
    expect(focusXp({ ...base, activeMs: 10 * MIN, cards: 2 })).toBe(0);
    expect(focusXp({ ...base, activeMs: 10 * MIN, earnedToday: FOCUS_XP_DAILY_CAP - 6 })).toBe(6);
    expect(focusXp({ ...base, activeMs: 10 * MIN, earnedToday: FOCUS_XP_DAILY_CAP })).toBe(0);
  });

  it("endFocus awards the XP once and keeps today's focus total", () => {
    const plan = newFocusPlan(10);
    const before = getXPState().totalXP;
    const r = endFocus(plan, { endedBy: "time", activeMs: 10 * MIN, cards: 9, firstTry: 7 });
    expect(r).toMatchObject({ outcome: "completed", xp: 20, activeSec: 600, cards: 9, firstTry: 7 });
    expect(getXPState().totalXP).toBe(before + 20);
    expect(focusXpToday()).toBe(20);

    const early = endFocus(newFocusPlan(25), { endedBy: "user", activeMs: 5 * MIN, cards: 9, firstTry: 7 });
    expect(early).toMatchObject({ outcome: "abandoned", xp: 0 });
    expect(focusXpToday()).toBe(20);
  });
});

describe("focus settings", () => {
  it("defaults to 10 minutes and keeps the last choice", () => {
    expect(getFocusSettings()).toEqual({ minutes: DEFAULT_FOCUS_MINUTES, hideClock: false });
    saveFocusSettings({ minutes: 25 });
    saveFocusSettings({ hideClock: true });
    expect(getFocusSettings()).toEqual({ minutes: 25, hideClock: true });
    localStorage.setItem("myenglish_focus_settings_v1", JSON.stringify({ minutes: 7 }));
    expect(getFocusSettings().minutes).toBe(DEFAULT_FOCUS_MINUTES);
  });
});

describe("reminder block", () => {
  it("a focus session counts as studying until its time runs out", () => {
    const now = 1_000_000;
    expect(isMainSessionActive(now)).toBe(false);
    setFocusUntil(now + 5 * MIN);
    expect(isFocusActive(now)).toBe(true);
    expect(isMainSessionActive(now)).toBe(true);
    // App quit in the middle: the block expires by itself
    expect(isMainSessionActive(now + 6 * MIN)).toBe(false);
    setFocusUntil(null);
    expect(isFocusActive(now)).toBe(false);
  });
});

describe("next review", () => {
  const word = (id: string, due: string, state = 2, extra: Partial<WordDetail> = {}) =>
    ({ id, srs: { next_review_date: due, state }, ...extra }) as unknown as WordDetail;

  it("finds the next due card and counts those due in the half hour after it", () => {
    const now = new Date("2026-10-17T12:00:00");
    const words = [
      word("a", "2026-10-17T11:00:00"), // already due: not "next"
      word("b", "2026-10-17T14:30:00"),
      word("c", "2026-10-17T14:50:00"),
      word("d", "2026-10-17T15:10:00"),
      word("e", "2026-10-17T13:00:00", 0), // waiting in the deck, not a review
      word("f", "2026-10-17T13:00:00", 2, { suspended: true } as Partial<WordDetail>),
    ];
    const peek = nextReviewPeek(words, now);
    expect(peek?.at.toISOString()).toBe(new Date("2026-10-17T14:30:00").toISOString());
    expect(peek?.count).toBe(2);
    expect(nextReviewPeek([], now)).toBeNull();
  });
});

describe("focus pitch", async () => {
  const { focusPitch } = await import("@/services/focusPitch");
  const base = {
    minutes: 10,
    due: 0,
    todaySessions: 0,
    todayMinutes: 0,
    yesterdayMinutes: 0,
    completedTotal: 3,
    returnLiftPoints: null,
    hour: 10,
  };

  it("done today: a calm card", () => {
    const p = focusPitch({ ...base, todaySessions: 2, todayMinutes: 19.6 });
    expect(p.tone).toBe("calm");
    expect(p.title).toContain("2 phiên");
    expect(p.body).toContain("20 phút");
  });

  it("never tried, then measured lift, then yesterday, then cards waiting", () => {
    expect(focusPitch({ ...base, completedTotal: 0, due: 30 }).title).toContain("không bị làm phiền");
    expect(focusPitch({ ...base, returnLiftPoints: 22.4, yesterdayMinutes: 10 }).body).toContain("22%");
    expect(focusPitch({ ...base, returnLiftPoints: 5, yesterdayMinutes: 9.6 }).body).toContain("10 phút");
    const due = focusPitch({ ...base, due: 40 });
    expect(due.title).toBe("40 thẻ đang chờ bạn");
    expect(due.body).toContain("khoảng 15 thẻ");
    expect(focusPitch({ ...base, due: 6 }).body).toContain("Vừa đủ");
  });

  it("nothing special: a time-of-day line, and the XP of the chosen length", () => {
    expect(focusPitch({ ...base, hour: 20 }).title).toContain("Kết thúc ngày");
    expect(focusPitch({ ...base, minutes: 25 }).xp).toBe(50);
  });
});

describe("focus preview and top-up", async () => {
  const { focusPreview, focusPreviewText, pickFocusTopUp, FOCUS_TOPUP_BATCH } = await import("@/services/focusSession");
  const { makeWord, reviewSrs, DAY_MS } = await import("./helpers");
  const { toCard } = await import("@/services/cards");
  const NOW = new Date("2026-10-22T10:00:00Z");

  it("says what the session holds and what fills the time left", () => {
    // 6 reviews + 2 new = 10 card-equivalents × 15 s ≈ 3 min
    const short = focusPreview({ reviews: 6, newToday: 2 }, 10, 30);
    expect(short).toEqual({ reviews: 6, newCards: 2, workMin: 3, overflow: false });
    expect(focusPreviewText(short, 10)).toBe("6 thẻ ôn · 2 từ mới (~3′), sau đó luyện thêm từ đang học cho đủ 10′.");
  });

  it("caps the session and says when the time is too short", () => {
    const long = focusPreview({ reviews: 80, newToday: 5 }, 5, 30);
    expect(long).toMatchObject({ reviews: 30, newCards: 0, overflow: true });
    expect(focusPreviewText(long, 5)).toBe("30 thẻ ôn, khoảng 8′: làm trước thẻ cần nhất, phần còn lại để lượt sau.");
  });

  it("is practice only when nothing is due", () => {
    expect(focusPreviewText(focusPreview({ reviews: 0, newToday: 0 }, 10, 30), 10)).toBe(
      "Hết thẻ đến hạn: 10′ luyện thêm từ đang học (không đổi lịch ôn)."
    );
  });

  it("adds practice cards for words being learnt, never the last ones on screen", () => {
    const words = Array.from({ length: 12 }, (_, i) =>
      makeWord(`w${i}`, {
        srs: reviewSrs(3, 1, {
          last_review: new Date(NOW.getTime() - DAY_MS).toISOString(),
          next_review_date: new Date(NOW.getTime() + 2 * DAY_MS).toISOString(),
        }),
      })
    );
    const queue = words.slice(0, 4).map((w) => toCard(w, "recognition"));
    const added = pickFocusTopUp(words, queue, new Map(), NOW);
    expect(added).toHaveLength(FOCUS_TOPUP_BATCH);
    const ids = added.map((c) => c.id);
    for (const recent of ["w1", "w2", "w3"]) expect(ids).not.toContain(recent);
  });

  it("adds nothing when no word was quizzed yet", () => {
    expect(pickFocusTopUp([makeWord("fresh")], [], new Map(), NOW)).toEqual([]);
  });
});
