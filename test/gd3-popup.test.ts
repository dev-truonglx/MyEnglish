import { describe, it, expect } from "vitest";
import { Rating } from "ts-fsrs";
import type { WordDetail } from "@/types/database";
import { calculateXPReward } from "@/services/smartReview";
import { applyComebackToWork, comebackStatus, type ComebackPlan } from "@/services/comeback";
import { getLocalDateString } from "@/services/streak";
import { isDueSrs } from "@/services/cards";
import { freshServices, DAY_MS } from "./helpers";

const MIN = 60 * 1000;

const input = (word: string) => ({
  word,
  meaning_vn: "nghĩa của " + word,
  synonyms: [],
  antonyms: [],
  examples: [{ sentence_en: `The ${word} works.`, grammar_analysis: "S + V" }],
});

/** A review word long overdue, or a new word waiting */
const word = (id: string, reviewed: boolean): WordDetail =>
  ({
    id,
    word: id,
    meaning_vn: "nghĩa " + id,
    topic: "General",
    created_at: new Date(Date.now() - 30 * DAY_MS).toISOString(),
    examples: [],
    srs: reviewed
      ? {
          word_id: id,
          state: 2,
          reps: 3,
          lapses: 0,
          stability: 5,
          difficulty: 5,
          scheduled_days: 5,
          last_review: new Date(Date.now() - 20 * DAY_MS).toISOString(),
          next_review_date: new Date(Date.now() - 15 * DAY_MS).toISOString(),
        }
      : { word_id: id, state: 0, reps: 0, lapses: 0, next_review_date: new Date(Date.now() - 1000).toISOString() },
  }) as unknown as WordDetail;

describe("comeback: the plan's new words (not cut by the backlog)", () => {
  it("buildReviewSession gives exactly comebackNewCards new cards, minus the ones introduced today", async () => {
    const { srs, smart } = await freshServices();
    srs.saveStudyLimits({ newCardsPerDay: 10, maxSessionSize: 30 });
    // 70 reviews due: more than 2 sessions, so the normal backlog rule allows no new card at all
    const words = [...Array.from({ length: 70 }, (_, i) => word(`r${i}`, true)), ...["n1", "n2", "n3"].map((id) => word(id, false))];
    const none = { recognition: 0, production: 0 };
    const isNew = (c: { id: string }) => c.id.startsWith("n");

    expect(smart.buildReviewSession(words, none).filter(isNew)).toHaveLength(0);
    expect(smart.buildReviewSession(words, none, new Date(), { noNewCards: true }).filter(isNew)).toHaveLength(0);

    const two = smart.buildReviewSession(words, none, new Date(), { maxCards: 20, comebackNewCards: 2 });
    expect(two).toHaveLength(20);
    expect(two.filter(isNew)).toHaveLength(2);

    const oneLeft = smart.buildReviewSession(words, { recognition: 1, production: 0 }, new Date(), { maxCards: 20, comebackNewCards: 2 });
    expect(oneLeft.filter(isNew)).toHaveLength(1);
    const doneToday = smart.buildReviewSession(words, { recognition: 2, production: 0 }, new Date(), { maxCards: 20, comebackNewCards: 2 });
    expect(doneToday.filter(isNew)).toHaveLength(0);
    // No new word yet in the plan (backlog not going down)
    expect(smart.buildReviewSession(words, none, new Date(), { comebackNewCards: 0 }).filter(isNew)).toHaveLength(0);
  });

  it("applyComebackToWork still counts an introduction whose quiz is to come", () => {
    const plan: ComebackPlan = {
      startedOn: "2026-10-05",
      missedDays: 5,
      backlogAtStart: 90,
      dailyQuota: 30,
      dayStart: { on: "2026-10-06", backlog: 25, previous: 70 },
    };
    const status = comebackStatus(plan, 25, 0, "2026-10-06");
    expect(status.newWordsPerDay).toBe(2);
    const pending = new Map([["n1:recognition", Date.now() + 5 * MIN]]);
    // One word introduced (its quiz pending) + one new word left
    expect(applyComebackToWork({ reviews: 25, newToday: 2, total: 27 }, status, { recognition: 1, production: 0, pending })).toEqual({
      reviews: 25,
      newToday: 2,
      total: 27,
    });
    expect(applyComebackToWork({ reviews: 25, newToday: 5, total: 30 }, status, { recognition: 0, production: 0 }).newToday).toBe(2);
  });

  it("countTodayWork counts the plan's new words while the backlog is too big for the normal budget", async () => {
    const { db, srs } = await freshServices();
    const conn = await db.getDatabase();
    srs.saveStudyLimits({ newCardsPerDay: 10, maxSessionSize: 5 });
    const past = (d: number) => new Date(Date.now() - d * DAY_MS).toISOString();
    for (let i = 0; i < 12; i++) {
      const id = await db.insertEnrichedWord(input(`review${i}`));
      await conn.execute(
        `UPDATE srs_reviews SET reps = 3, state = 2, stability = 4, difficulty = 5, scheduled_days = 4, next_review_date = $1, last_review = $2 WHERE word_id = $3`,
        [past(2), past(6), id]
      );
    }
    for (let i = 0; i < 3; i++) await db.insertEnrichedWord(input(`fresh${i}`));

    // A running plan whose backlog went down since yesterday: 1 new word today (backlog above today's share)
    const today = getLocalDateString();
    const plan: ComebackPlan = {
      startedOn: getLocalDateString(new Date(Date.now() - DAY_MS)),
      missedDays: 5,
      backlogAtStart: 20,
      dailyQuota: 5,
      dayStart: { on: today, backlog: 12, previous: 20 },
    };
    localStorage.setItem("myenglish_comeback_plan_v1", JSON.stringify(plan));
    localStorage.setItem("myenglish_study_logs_v1", JSON.stringify({ [getLocalDateString(new Date(Date.now() - 6 * DAY_MS))]: 10 }));

    const work = await srs.countTodayWork();
    expect(work.comeback?.newWordsPerDay).toBe(1);
    expect(work.reviews).toBe(5); // today's share
    expect(work.newToday).toBe(1); // 12 reviews > 2 sessions of 5: the normal budget would give 0
    expect(work.total).toBe(6);
  });
});

describe("N16: a 3-item popup asks due words first", () => {
  it("popupQuota", async () => {
    const { popupQuota } = await import("@/components/FocusReviewModal");
    const g = (size: number, dueWords: number, grammarAvailable: number, includeGrammar = true) =>
      popupQuota(size, { includeGrammar, dueWords, grammarAvailable });
    expect(g(3, 5, 3)).toEqual({ words: 2, grammar: 1 });
    expect(g(4, 5, 3)).toEqual({ words: 3, grammar: 1 });
    expect(g(5, 9, 5)).toEqual({ words: 3, grammar: 2 });
    expect(g(10, 20, 10)).toEqual({ words: 7, grammar: 3 });
    // No word due: the due grammar fills the popup, the rest goes to (practice) words
    expect(g(3, 0, 3)).toEqual({ words: 0, grammar: 3 });
    expect(g(3, 0, 1)).toEqual({ words: 2, grammar: 1 });
    // Grammar off or nothing to ask
    expect(g(3, 5, 3, false)).toEqual({ words: 3, grammar: 0 });
    expect(g(3, 5, 0)).toEqual({ words: 3, grammar: 0 });
  });
});

describe("db due counts follow isDueSrs (a review card is due for its whole day)", () => {
  it("countDueCards and getDueWordsFromDb", async () => {
    const { db } = await freshServices();
    const conn = await db.getDatabase();
    const now = new Date();
    now.setHours(10, 0, 0, 0);
    const at = (h: number, m = 0, dayOffset = 0) => {
      const d = new Date(now);
      d.setDate(d.getDate() + dayOffset);
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    };
    const set = async (id: string, f: { state: number; reps: number; scheduled_days: number; due: string; last?: string | null }) =>
      conn.execute(
        `UPDATE srs_reviews SET state = $1, reps = $2, scheduled_days = $3, next_review_date = $4, last_review = $5, stability = 3 WHERE word_id = $6`,
        [f.state, f.reps, f.scheduled_days, f.due, f.last ?? at(8, 0, -3), id]
      );
    const ids: Record<string, string> = {};
    for (const name of ["laterToday", "learning", "tomorrow", "shortReview", "introduced", "waiting"]) {
      ids[name] = await db.insertEnrichedWord(input(name));
    }
    await set(ids.laterToday, { state: 2, reps: 3, scheduled_days: 3, due: at(20) });
    await set(ids.learning, { state: 1, reps: 1, scheduled_days: 0, due: at(20) });
    await set(ids.tomorrow, { state: 2, reps: 3, scheduled_days: 3, due: at(8, 0, 1) });
    await set(ids.shortReview, { state: 2, reps: 3, scheduled_days: 0, due: at(20) });
    // Introduced 5 minutes ago, its quiz postponed: due by the intro rule (isDueSrs)
    await set(ids.introduced, { state: 0, reps: 0, scheduled_days: 0, due: at(10, 5), last: at(9, 55) });
    await set(ids.waiting, { state: 0, reps: 0, scheduled_days: 0, due: at(9), last: null });
    await conn.execute(`UPDATE srs_reviews SET last_review = NULL WHERE word_id = $1`, [ids.waiting]);

    expect(await db.countDueCards(now)).toEqual({ reviews: 1, newWaiting: 1, newRecallWaiting: 0 });

    const due = await db.getDueWordsFromDb(now);
    const dueIds = new Set(due.map((w) => w.id));
    expect(dueIds).toEqual(new Set([ids.laterToday, ids.introduced, ids.waiting]));
    // Same answer as the rule sessions use
    const all = await db.getAllWords();
    for (const w of all) expect(dueIds.has(w.id)).toBe(isDueSrs(w.srs, now));
  });

  it("per-word accuracy counts scheduled answers only (S18)", async () => {
    const { db, smart } = await freshServices();
    const conn = await db.getDatabase();
    const id = await db.insertEnrichedWord(input("cache"));
    const log = (rating: Rating, isScheduled: boolean, implicit = false) =>
      smart.saveReviewLog({
        wordId: id,
        exerciseType: "multiple_choice",
        responseTimeMs: 3000,
        isCorrect: rating > Rating.Again,
        wrongAttempts: rating > Rating.Again ? 0 : 1,
        rating,
        xpEarned: 0,
        timestamp: new Date().toISOString(),
        isScheduled,
        implicit,
        direction: "recognition",
      });
    await log(Rating.Good, true); // scheduled
    await log(Rating.Again, true); // scheduled
    await log(Rating.Good, false); // extra practice
    await log(Rating.Good, false); // extra practice
    await log(Rating.Good, true, true); // credited from a recall answer
    const legacy = await log(Rating.Good, true);
    await conn.execute(`UPDATE review_logs SET is_scheduled = NULL WHERE id = $1`, [legacy]);

    const [w] = await db.getWordsByIds([id]);
    expect(w.stats).toEqual({ totalAttempts: 3, correctCount: 2, wrongCount: 1, accuracy: 67 });
  });
});

describe("S12: XP", () => {
  const xp = (rating: Rating, retrievabilityBefore: number | null, direction: "recognition" | "production" = "recognition") =>
    calculateXPReward({ rating, exerciseType: "multiple_choice", scheduled: true, direction, retrievabilityBefore }).totalXP;

  it("Easy and Good earn the same", () => {
    expect(xp(Rating.Easy, 0.9)).toBe(xp(Rating.Good, 0.9));
    expect(xp(Rating.Easy, 0.9, "production")).toBe(xp(Rating.Good, 0.9, "production"));
    expect(xp(Rating.Hard, 0.9)).toBeLessThan(xp(Rating.Good, 0.9));
  });

  it("no bonus for a late review", () => {
    expect(xp(Rating.Good, 0.5)).toBe(xp(Rating.Good, 0.92));
    const late = calculateXPReward({ rating: Rating.Good, exerciseType: "multiple_choice", scheduled: true, direction: "recognition", retrievabilityBefore: 0.5 });
    expect(late.bonusReasons.join(" ")).not.toContain("sắp quên");
  });
});
