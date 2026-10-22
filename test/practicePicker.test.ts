import { describe, it, expect, vi, afterEach } from "vitest";
import { Rating } from "ts-fsrs";
import {
  isResting,
  pickPracticeWords,
  practiceRestMs,
  summarizeRun,
  countResting,
  RUN_BURST_MS,
  type RecentRun,
} from "@/services/practicePicker";
import { bringReadyCardForward } from "@/services/smartReview";
import { INTRO_READY_MS, toCard } from "@/services/cards";
import { makeWord, reviewSrs, freshServices, DAY_MS } from "./helpers";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const NOW = new Date("2026-10-22T10:00:00Z");
const T = NOW.getTime();

afterEach(() => {
  vi.useRealTimers();
});

/** A studied word in Review, not due for `dueInDays` days */
function studied(id: string, stability = 5, dueInDays = 3) {
  return makeWord(id, {
    srs: reviewSrs(stability, 1, {
      last_review: new Date(T - DAY_MS).toISOString(),
      next_review_date: new Date(T + dueInDays * DAY_MS).toISOString(),
    }),
  });
}

/** Deterministic "random" source */
function seq(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("summarizeRun", () => {
  it("counts right answers in a row, newest first", () => {
    const run = summarizeRun([
      { rating: Rating.Good, at: T - 1 * HOUR },
      { rating: Rating.Good, at: T - 5 * HOUR },
      { rating: Rating.Good, at: T - 30 * HOUR },
      { rating: Rating.Again, at: T - 40 * HOUR },
      { rating: Rating.Good, at: T - 50 * HOUR },
    ]);
    expect(run).toEqual({ streak: 3, lastAt: T - HOUR, lastMissed: false });
  });

  it("ends the run at a Hard (hint, typo) and marks a latest miss", () => {
    expect(summarizeRun([{ rating: Rating.Good, at: T }, { rating: Rating.Hard, at: T - HOUR }])?.streak).toBe(1);
    expect(summarizeRun([{ rating: Rating.Again, at: T }, { rating: Rating.Good, at: T - HOUR }])).toEqual({
      streak: 0,
      lastAt: T,
      lastMissed: true,
    });
    expect(summarizeRun([])).toBeNull();
  });

  it("counts retries minutes apart once: right twice just after a mistake is not a solid word", () => {
    const run = summarizeRun([
      { rating: Rating.Good, at: T },
      { rating: Rating.Good, at: T - 40 * 1000 },
      { rating: Rating.Again, at: T - 80 * 1000 },
    ]);
    expect(run?.streak).toBe(1);
    // Far enough apart, they are two proofs
    expect(
      summarizeRun([
        { rating: Rating.Good, at: T },
        { rating: Rating.Good, at: T - RUN_BURST_MS },
      ])?.streak
    ).toBe(2);
  });
});

describe("practice rest", () => {
  it("rests longer the longer the run", () => {
    expect(practiceRestMs(0)).toBe(0);
    expect(practiceRestMs(1)).toBe(0);
    expect(practiceRestMs(2)).toBe(20 * HOUR);
    expect(practiceRestMs(3)).toBe(3 * DAY_MS);
    expect(practiceRestMs(6)).toBe(7 * DAY_MS);
  });

  it("ends the rest once its time has passed", () => {
    const run: RecentRun = { streak: 2, lastAt: T - 10 * HOUR, lastMissed: false };
    expect(isResting(run, T)).toBe(true);
    expect(isResting(run, T + 11 * HOUR)).toBe(false);
    expect(isResting(undefined, T)).toBe(false);
  });
});

describe("pickPracticeWords", () => {
  it("leaves out words answered right two or three times in a row", () => {
    const words = ["solid", "solid3", "fresh"].map((id) => studied(id));
    const runs = new Map<string, RecentRun>([
      ["solid", { streak: 2, lastAt: T - 4 * HOUR, lastMissed: false }],
      ["solid3", { streak: 3, lastAt: T - 30 * HOUR, lastMissed: false }],
    ]);
    const picked = pickPracticeWords(words, runs, 10, { now: NOW });
    expect(picked.map((w) => w.id)).toEqual(["fresh"]);
    expect(countResting(words, runs, NOW)).toBe(2);
  });

  it("puts words missed lately first, then the weakest", () => {
    const strong = studied("strong", 60);
    const weak = studied("weak", 1.5);
    const missed = studied("missed", 60);
    const runs = new Map<string, RecentRun>([["missed", { streak: 0, lastAt: T - 6 * HOUR, lastMissed: true }]]);
    const picked = pickPracticeWords([strong, weak, missed], runs, 3, { now: NOW, random: () => 0 });
    expect(picked.map((w) => w.id)).toEqual(["missed", "weak", "strong"]);
  });

  it("asks words answered in the last hours or coming back soon only after the others", () => {
    const recent = studied("recent", 1.5);
    const learning = makeWord("learning", {
      srs: { state: 1, reps: 1, stability: 0.5, last_review: new Date(T - 2 * MIN).toISOString(), next_review_date: new Date(T + 8 * MIN).toISOString() },
    });
    const other = studied("other", 40);
    const runs = new Map<string, RecentRun>([["recent", { streak: 1, lastAt: T - 30 * MIN, lastMissed: false }]]);
    const picked = pickPracticeWords([recent, learning, other], runs, 3, { now: NOW, random: () => 0 });
    expect(picked[0].id).toBe("other");
    expect(picked.slice(1).map((w) => w.id).sort()).toEqual(["learning", "recent"]);
    expect(pickPracticeWords([recent, learning, other], runs, 1, { now: NOW }).map((w) => w.id)).toEqual(["other"]);
  });

  it("varies the order of near-equal words between sessions", () => {
    const words = Array.from({ length: 8 }, (_, i) => studied(`w${i}`, 10));
    const a = pickPracticeWords(words, new Map(), 8, { now: NOW, random: seq([0.1, 0.9, 0.3, 0.7, 0.5, 0.2, 0.8, 0.4]) });
    const b = pickPracticeWords(words, new Map(), 8, { now: NOW, random: seq([0.9, 0.1, 0.7, 0.3, 0.2, 0.5, 0.4, 0.8]) });
    expect(a.map((w) => w.id)).not.toEqual(b.map((w) => w.id));
  });

  it("never picks words never quizzed, excluded, suspended or without a meaning", () => {
    const waiting = makeWord("waiting");
    const suspended = { ...studied("suspended"), suspended: 1 };
    const placeholder = { ...studied("placeholder"), meaning_vn: "" };
    const taken = studied("taken");
    const ok = studied("ok");
    const picked = pickPracticeWords([waiting, suspended, placeholder, taken, ok], new Map(), 10, {
      now: NOW,
      exclude: new Set(["taken"]),
    });
    expect(picked.map((w) => w.id)).toEqual(["ok"]);
  });

  it("fills with resting words only when asked, fewest right answers and oldest first", () => {
    const words = ["r3", "r2old", "r2new"].map((id) => studied(id));
    const runs = new Map<string, RecentRun>([
      ["r3", { streak: 3, lastAt: T - 30 * HOUR, lastMissed: false }],
      ["r2old", { streak: 2, lastAt: T - 10 * HOUR, lastMissed: false }],
      ["r2new", { streak: 2, lastAt: T - 4 * HOUR, lastMissed: false }],
    ]);
    expect(pickPracticeWords(words, runs, 2, { now: NOW })).toEqual([]);
    expect(pickPracticeWords(words, runs, 2, { now: NOW, fillWithResting: true }).map((w) => w.id)).toEqual(["r2old", "r2new"]);
  });
});

describe("loadRecentRuns", () => {
  it("reads every answer of the last days, practice included, without introductions or implicit credits", async () => {
    const { db, smart } = await freshServices();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const { loadRecentRuns } = await import("@/services/practicePicker");
    const id = await db.insertEnrichedWord({ word: "deploy", meaning_vn: "triển khai", synonyms: [], antonyms: [], examples: [] });
    const log = (exerciseType: "intro" | "multiple_choice" | "cloze", rating: number, hoursAgo: number, extra: { isScheduled?: boolean; implicit?: boolean } = {}) =>
      smart.saveReviewLog({
        wordId: id,
        exerciseType,
        responseTimeMs: 1000,
        isCorrect: rating > Rating.Again,
        wrongAttempts: 0,
        rating,
        xpEarned: 0,
        timestamp: new Date(T - hoursAgo * HOUR).toISOString(),
        isScheduled: extra.isScheduled ?? false,
        implicit: extra.implicit,
      });
    await log("multiple_choice", Rating.Again, 30);
    await log("intro", 0, 26);
    await log("multiple_choice", Rating.Good, 25, { isScheduled: true });
    await log("cloze", Rating.Good, 3); // practice
    await log("multiple_choice", Rating.Good, 3, { implicit: true }); // repeats the cloze answer
    await log("multiple_choice", Rating.Good, 1); // practice

    const runs = await loadRecentRuns();
    expect(runs.get(id)).toEqual({ streak: 3, lastAt: T - HOUR, lastMissed: false });
    expect(isResting(runs.get(id), T)).toBe(true);
  });
});

describe("bringReadyCardForward", () => {
  const newWord = (id: string) => toCard(makeWord(id), "recognition");
  const review = (id: string) => toCard(studied(id), "recognition");

  it("lets a ready card go before a new word's quiz that comes too soon after its introduction", () => {
    const queue = [newWord("a"), review("x"), newWord("a"), review("y"), review("z")];
    const intros = new Map([["a:recognition", T - 20 * 1000]]);
    const moved = bringReadyCardForward(queue, 2, intros, T);
    expect(moved.map((c) => c.id)).toEqual(["a", "x", "y", "a", "z"]);
  });

  it("asks the quiz as it is once a minute has passed, or when no other card is ready", () => {
    const queue = [newWord("a"), review("x"), newWord("a")];
    expect(bringReadyCardForward(queue, 2, new Map([["a:recognition", T - INTRO_READY_MS]]), T)).toBe(queue);
    expect(bringReadyCardForward(queue, 2, new Map([["a:recognition", T - 1000]]), T)).toBe(queue);
    // Two quizzes too soon in a row: the first ready card behind both comes first
    const two = [newWord("a"), newWord("b"), newWord("a"), newWord("b"), review("x")];
    const intros = new Map([
      ["a:recognition", T - 20 * 1000],
      ["b:recognition", T - 10 * 1000],
    ]);
    expect(bringReadyCardForward(two, 2, intros, T).map((c) => c.id)).toEqual(["a", "b", "x", "a", "b"]);
  });

  it("leaves review cards and new words not introduced yet where they are", () => {
    const queue = [review("x"), newWord("b"), review("y")];
    expect(bringReadyCardForward(queue, 0, new Map(), T)).toBe(queue);
    expect(bringReadyCardForward(queue, 1, new Map(), T)).toBe(queue);
  });
});
