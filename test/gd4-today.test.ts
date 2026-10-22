import { describe, it, expect } from "vitest";
import {
  buildTodayTasks,
  cardsLaterToday,
  chosenDailyMinutes,
  coverageGain,
  milestoneToCelebrate,
  pickNextStep,
  primaryTask,
  quickStartMode,
  weeklyCardVisibility,
  type TodayTaskInput,
} from "@/components/dashboard/todayPlan";
import {
  estimateNewWordsPerDay,
  levelEtaDays,
  shouldCelebrateDailyGoal,
  summarizeLastWeek,
  weeklySuggestion,
  type ProgressLog,
} from "@/services/progress";
import { bankStatus } from "@/services/reading";
import { pronunciationPracticedToday, recordPronunciationQuiz, recordSayAloud } from "@/services/pronunciation";
import { getActivityLogs, getLocalDateString } from "@/services/streak";
import { makeWord } from "./helpers";

const base: TodayTaskInput = {
  minutes: 10,
  vocab: { reviews: 12, newToday: 3, minutes: 5 },
  grammar: { due: 1, studiedToday: false, nextTitle: "Thì hiện tại đơn", relearnTitle: null },
  pronunciation: { doneToday: false, lessonTitle: "Âm /iː/ và /ɪ/" },
};

describe("Today as a list of at most 3 things (P13)", () => {
  it("words, then one grammar lesson, then one pronunciation lesson; the main button is the first not done", () => {
    const tasks = buildTodayTasks(base);
    expect(tasks.map((t) => t.id)).toEqual(["vocab", "grammar", "pronunciation"]);
    expect(tasks[0]).toMatchObject({ detail: "12 thẻ ôn · 3 từ mới", minutes: 5, done: false });
    expect(primaryTask(tasks)?.id).toBe("vocab");

    const wordsDone = buildTodayTasks({ ...base, vocab: { reviews: 0, newToday: 0, minutes: 1 } });
    expect(primaryTask(wordsDone)?.id).toBe("grammar");

    const grammarDone = buildTodayTasks({
      ...base,
      vocab: { reviews: 0, newToday: 0, minutes: 1 },
      grammar: { ...base.grammar!, studiedToday: true },
    });
    expect(primaryTask(grammarDone)?.id).toBe("pronunciation");

    const allDone = buildTodayTasks({
      ...base,
      vocab: { reviews: 0, newToday: 0, minutes: 1 },
      grammar: { ...base.grammar!, studiedToday: true },
      pronunciation: { doneToday: true, lessonTitle: null },
    });
    expect(primaryTask(allDone)).toBeNull();
  });

  it("a later thing done first does not become the main button: the first undone one does", () => {
    const tasks = buildTodayTasks({ ...base, pronunciation: { doneToday: true, lessonTitle: null } });
    expect(tasks.find((t) => t.id === "pronunciation")?.done).toBe(true);
    expect(primaryTask(tasks)?.id).toBe("vocab");
  });

  it("grammar only with an imported book and something to do (or done today); a 5-minute plan keeps 2 things", () => {
    expect(buildTodayTasks({ ...base, grammar: null }).map((t) => t.id)).toEqual(["vocab", "pronunciation"]);
    const nothing = { due: 0, studiedToday: false, nextTitle: null, relearnTitle: null };
    expect(buildTodayTasks({ ...base, grammar: nothing }).map((t) => t.id)).toEqual(["vocab", "pronunciation"]);
    expect(buildTodayTasks({ ...base, minutes: 5 }).map((t) => t.id)).toEqual(["vocab", "grammar"]);
    expect(buildTodayTasks({ ...base, minutes: 5, grammar: null }).map((t) => t.id)).toEqual(["vocab", "pronunciation"]);
    expect(buildTodayTasks({ ...base, pronunciation: null, grammar: null }).map((t) => t.id)).toEqual(["vocab"]);
  });

  it("the minutes of the onboarding plan come from the daily goal (nearest plan for a goal set by hand)", () => {
    expect(chosenDailyMinutes(15)).toBe(5);
    expect(chosenDailyMinutes(30)).toBe(10);
    expect(chosenDailyMinutes(45)).toBe(15);
    expect(chosenDailyMinutes(10)).toBe(5); // the default goal before onboarding
    expect(chosenDailyMinutes(40)).toBe(15);
  });
});

describe("'Chỉ 1 phút' and the day close", () => {
  it("offered while the goal is not reached, stressed after 18:00 with nothing studied", () => {
    expect(quickStartMode({ goalReached: false, todayCount: 0, hour: 9, canStudy: true })).toBe("normal");
    expect(quickStartMode({ goalReached: false, todayCount: 0, hour: 19, canStudy: true })).toBe("urgent");
    expect(quickStartMode({ goalReached: false, todayCount: 4, hour: 19, canStudy: true })).toBe("normal");
    expect(quickStartMode({ goalReached: true, todayCount: 40, hour: 19, canStudy: true })).toBe("hidden");
    expect(quickStartMode({ goalReached: false, todayCount: 0, hour: 19, canStudy: false })).toBe("hidden");
  });

  it("counts learning cards due later today, not review cards or tomorrow's", () => {
    const now = new Date(2026, 9, 11, 10, 0);
    const at = (h: number, m = 0) => new Date(2026, 9, 11, h, m).toISOString();
    const words = [
      makeWord("a", { srs: { state: 1, reps: 1, next_review_date: at(10, 10) } }),
      makeWord("b", { srs: { state: 3, reps: 5, lapses: 1, next_review_date: at(21) } }),
      makeWord("c", { srs: { state: 2, reps: 3, next_review_date: at(22) } }), // review card: due all day already
      makeWord("d", { srs: { state: 1, reps: 1, next_review_date: new Date(2026, 9, 12, 8).toISOString() } }),
      makeWord("e", { srs: { state: 1, reps: 1, next_review_date: at(9) } }), // due now: in today's work
      makeWord("f", { suspended: 1, srs: { state: 1, reps: 1, next_review_date: at(11) } }),
    ];
    expect(cardsLaterToday(words, now)).toBe(2);
  });

  it("one light next step: pronunciation first, never reading for a beginner", () => {
    expect(pickNextStep({ pronunciationAvailable: true, pronunciationDone: false, simple: true }).tab).toBe("pronunciation");
    expect(pickNextStep({ pronunciationAvailable: true, pronunciationDone: true, simple: true }).tab).toBe("analytics");
    expect(pickNextStep({ pronunciationAvailable: false, pronunciationDone: false, simple: false }).tab).toBe("reading");
  });
});

describe("Oxford path: ETA and milestones", () => {
  it("new words per day is about half the daily budget (recall cards share it)", () => {
    expect(estimateNewWordsPerDay(5)).toBe(3);
    expect(estimateNewWordsPerDay(8)).toBe(4);
    expect(estimateNewWordsPerDay(3)).toBe(2);
    expect(estimateNewWordsPerDay(0)).toBe(1);
  });

  it("days left for a level at the current pace, with its share of the level mix", () => {
    expect(levelEtaDays(911 - 120, 3)).toBe(264);
    expect(levelEtaDays(0, 3)).toBe(0);
    expect(levelEtaDays(-5, 3)).toBe(0);
    // A1 + A2 mixed 2:1: A1 gets two thirds of the new words
    expect(levelEtaDays(100, 3, 2 / 3)).toBe(50);
  });

  it("a 'Nhớ lâu' milestone is celebrated once: shown the day it is reached, never again", () => {
    const first = milestoneToCelebrate(120, null, "2026-10-11");
    expect(first).toEqual({ show: 100, next: { value: 100, day: "2026-10-11" } });
    expect(milestoneToCelebrate(121, first.next, "2026-10-11")).toEqual({ show: 100, next: null });
    expect(milestoneToCelebrate(130, first.next, "2026-10-12")).toEqual({ show: null, next: null });
    // Back under 100 and over it again: no second party
    expect(milestoneToCelebrate(101, first.next, "2026-10-20")).toEqual({ show: null, next: null });
    expect(milestoneToCelebrate(260, first.next, "2026-11-02")).toEqual({ show: 250, next: { value: 250, day: "2026-11-02" } });
    expect(milestoneToCelebrate(80, null, "2026-10-11")).toEqual({ show: null, next: null });
    // Already past several milestones the first time: only the highest one
    expect(milestoneToCelebrate(600, null, "2026-10-11").show).toBe(500);
  });

  it("coverage gain only when it went up since the first measure", () => {
    expect(coverageGain(52, { percent: 46, day: "2026-09-27" })).toEqual({ from: 46, to: 52 });
    expect(coverageGain(46, { percent: 46, day: "2026-09-27" })).toBeNull();
    expect(coverageGain(50, null)).toBeNull();
  });
});

describe("weekly summary (#9)", () => {
  // Wednesday 14 Oct 2026: this week starts Mon 12, last week is 5–11, the week before 28 Sep – 4 Oct
  const now = new Date(2026, 9, 14, 9, 0);
  const day = (d: number, h = 10) => new Date(2026, 9, d, h).toISOString();
  const log = (ts: string, rating: number, stateBefore = 2): ProgressLog => ({
    wordId: "w",
    rating,
    isScheduled: true,
    timestamp: ts,
    stateBefore,
  });

  it("counts words that reached 'Nhớ lâu' last week (recognition, one per word), the week before, days studied", () => {
    const mastered = [
      { at: day(6), wordId: "a", direction: "recognition" as const },
      { at: day(7), wordId: "b", direction: null },
      { at: day(8), wordId: "a", direction: "recognition" as const }, // same word twice: once
      { at: day(9), wordId: "c", direction: "production" as const }, // recall card: not "Nhớ lâu"
      { at: day(1), wordId: "d", direction: "recognition" as const }, // the week before
      { at: day(13), wordId: "e", direction: "recognition" as const }, // this week
    ];
    const activity = { "2026-10-05": 10, "2026-10-06": 3, "2026-10-08": 0, "2026-10-11": 20, "2026-10-12": 5 };
    const s = summarizeLastWeek({ mastered, logs: [], activity, targetRetention: 0.9, now });
    expect(s).toMatchObject({ week: "2026-10-05", rememberedLong: 2, rememberedLongBefore: 1, activeDays: 3, retention: null });
  });

  it("retention only from at least 20 Review answers of last week", () => {
    const few = Array.from({ length: 19 }, (_, i) => log(day(6 + (i % 5)), i < 17 ? 3 : 1));
    expect(summarizeLastWeek({ mastered: [], logs: few, activity: {}, targetRetention: 0.9, now })?.retention).toBeNull();
    const enough = [
      ...Array.from({ length: 18 }, () => log(day(7), 3)),
      ...Array.from({ length: 2 }, () => log(day(8), 1)),
      log(day(8), 1, 1), // a learning card: not a retention answer
      log(day(13), 1), // this week
    ];
    const s = summarizeLastWeek({ mastered: [], logs: enough, activity: {}, targetRetention: 0.9, now });
    expect(s?.reviewAnswers).toBe(20);
    expect(s?.retention).toBeCloseTo(0.9);
  });

  it("nothing studied last week: no card", () => {
    expect(summarizeLastWeek({ mastered: [], logs: [log(day(13), 3)], activity: { "2026-10-13": 4 }, targetRetention: 0.9, now })).toBeNull();
  });

  it("one suggestion, from the weakest point", () => {
    expect(weeklySuggestion({ activeDays: 2, retention: 0.95, targetRetention: 0.9 })).toContain("giờ học cố định");
    expect(weeklySuggestion({ activeDays: 5, retention: 0.7, targetRetention: 0.9 })).toContain("ôn trước");
    expect(weeklySuggestion({ activeDays: 7, retention: 0.9, targetRetention: 0.9 })).toContain("thêm vài từ mới");
    expect(weeklySuggestion({ activeDays: 5, retention: null, targetRetention: 0.9 })).toContain("Giữ nhịp");
  });

  it("the card shows on the first day the app is opened in a new week, until hidden", () => {
    const monday = new Date(2026, 9, 12, 8);
    const first = weeklyCardVisibility(null, monday);
    expect(first).toEqual({ visible: true, next: { week: "2026-10-12", day: "2026-10-12", dismissed: false } });
    expect(weeklyCardVisibility(first.next, new Date(2026, 9, 12, 20)).visible).toBe(true);
    expect(weeklyCardVisibility({ ...first.next!, dismissed: true }, new Date(2026, 9, 12, 20)).visible).toBe(false);
    expect(weeklyCardVisibility(first.next, new Date(2026, 9, 13, 8))).toEqual({ visible: false, next: null });
    // First opened on a Thursday: shown that day
    expect(weeklyCardVisibility(first.next, new Date(2026, 9, 22, 8)).visible).toBe(true);
  });
});

describe("confetti only when this session reaches the daily goal for the first time today", () => {
  const today = "2026-10-11";
  it("fires once, when the goal goes from not reached to reached", () => {
    expect(shouldCelebrateDailyGoal({ reachedAtStart: false, reachedNow: true, celebratedOn: null, today })).toBe(true);
    expect(shouldCelebrateDailyGoal({ reachedAtStart: false, reachedNow: false, celebratedOn: null, today })).toBe(false);
    // An extra card after the goal was met
    expect(shouldCelebrateDailyGoal({ reachedAtStart: true, reachedNow: true, celebratedOn: null, today })).toBe(false);
    // Never twice the same day
    expect(shouldCelebrateDailyGoal({ reachedAtStart: false, reachedNow: true, celebratedOn: today, today })).toBe(false);
    expect(shouldCelebrateDailyGoal({ reachedAtStart: false, reachedNow: true, celebratedOn: "2026-10-10", today })).toBe(true);
  });
});

describe("pronunciation counts for the day, one definition of 'đã thuộc' in reading (U9)", () => {
  it("a finished quiz and a word said aloud count as answers and tick today's pronunciation", () => {
    expect(pronunciationPracticedToday()).toBe(false);
    recordPronunciationQuiz("p1", 6, 8);
    expect(pronunciationPracticedToday()).toBe(true);
    expect(getActivityLogs()[getLocalDateString()]).toBe(8);
    recordSayAloud("p1", "ship", true);
    expect(getActivityLogs()[getLocalDateString()]).toBe(9);
  });

  it("reading's 'mastered' is 'Nhớ lâu', words marked 'Đã biết' included", () => {
    expect(bankStatus(makeWord("deploy", { srs: { state: 2, stability: 40, reps: 6 } }))).toBe("mastered");
    expect(bankStatus(makeWord("tap", { srs: { state: 2, stability: 30, reps: 1, lapses: 0 } }))).toBe("mastered");
    expect(bankStatus(makeWord("young", { srs: { state: 2, stability: 5, reps: 3 } }))).toBe("learning");
    expect(bankStatus(makeWord("new"))).toBe("new");
  });
});
