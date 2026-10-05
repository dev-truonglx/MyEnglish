import { describe, it, expect } from "vitest";
import { computeStreak, calculateStreakAndGoal, getLocalDateString, recordDailyActivity, setDailyGoal } from "@/services/streak";
import {
  challengeTarget,
  claimTopicChallengeReward,
  formatAgain,
  getTopicChallenge,
  pickChallengeTopic,
  startOfWeek,
  summarizeSession,
  summarizeWeek,
  weekKey,
  type ProgressLog,
} from "@/services/progress";
import { describeWrongChoice } from "@/services/popupSession";
import { getXPState } from "@/services/smartReview";
import { freshServices, makeWord, reviewSrs } from "./helpers";

const DAY = 864e5;
/** Local date string `n` days before `today` */
const ago = (today: Date, n: number) => getLocalDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n));
const range = (today: Date, from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => ago(today, from - i));

describe("#9 streak with freezes", () => {
  const today = new Date(2026, 9, 5, 12);

  it("counts consecutive days and ignores a today without activity", () => {
    expect(computeStreak(range(today, 3, 0), today).current).toBe(4);
    expect(computeStreak(range(today, 3, 1), today).current).toBe(3);
    expect(computeStreak([], today)).toEqual({ current: 0, longest: 0, freezes: 0, frozenDates: [] });
  });

  it("breaks on a missed day when no freeze was earned", () => {
    const days = [...range(today, 5, 3), ...range(today, 1, 0)]; // missed day 2
    const r = computeStreak(days, today);
    expect(r.current).toBe(2);
    expect(r.longest).toBe(3);
  });

  it("a freeze earned after 7 days covers one missed day", () => {
    const days = [...range(today, 10, 4), ...range(today, 2, 0)]; // 7 days, miss day 3, 3 days
    const r = computeStreak(days, today);
    expect(r.current).toBe(10); // the frozen day keeps the streak but does not add to it
    expect(r.frozenDates).toEqual([ago(today, 3)]);
    expect(r.freezes).toBe(0);
  });

  it("caps freezes at 2 and breaks once they run out", () => {
    const long = range(today, 40, 20); // 21 days -> 3 earned, capped at 2
    const lastDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 20, 12);
    expect(computeStreak(long, lastDay).freezes).toBe(2);
    const days = [...long, ago(today, 16)]; // misses 19,18,17 (2 frozen, 3rd breaks), active 16
    const r = computeStreak(days, today);
    expect(r.current).toBe(0); // and nothing since day 16 either
    expect(r.longest).toBe(21);
  });

  it("goal is reached by answers or by clearing every due word", () => {
    setDailyGoal(10);
    recordDailyActivity(3);
    expect(calculateStreakAndGoal([]).goalReached).toBe(false);
    expect(calculateStreakAndGoal([], 2).goalReached).toBe(false);
    const cleared = calculateStreakAndGoal([], 0);
    expect(cleared.goalReached).toBe(true);
    expect(cleared.goalPercentage).toBe(100);
  });

  it("clearing due words without studying today is not a success", () => {
    setDailyGoal(10);
    expect(calculateStreakAndGoal([], 0).goalReached).toBe(false);
  });
});

describe("#10 week in numbers", () => {
  const log = (wordId: string, rating: number, isScheduled = true): ProgressLog => ({
    wordId,
    rating,
    isScheduled,
    timestamp: new Date().toISOString(),
  });

  it("measures retention on scheduled answers only", () => {
    const words = [makeWord("a", { srs: reviewSrs(30, 1) }), makeWord("b", { srs: reviewSrs(3, 1) })];
    const s = summarizeWeek([log("a", 3), log("b", 1), log("b", 3, false), log("a", 2)], words, 0.9);
    expect(s.answers).toBe(4);
    expect(s.wordsStudied).toBe(2);
    expect(s.activeDays).toBe(1);
    expect(s.retention).toBeCloseTo(2 / 3);
    expect(s.masteredWords).toBe(1);
    expect(summarizeWeek([log("a", 3, false)], words, 0.9).retention).toBeNull();
  });

  it("weeks start on Monday", () => {
    const sunday = new Date(2026, 9, 11, 22);
    expect(startOfWeek(sunday).getDay()).toBe(1);
    expect(weekKey(sunday)).toBe("2026-10-05");
    expect(weekKey(new Date(2026, 9, 12, 1))).toBe("2026-10-12");
  });

  it("reads this week's logs from the database", async () => {
    const { smart, db } = await freshServices();
    const { getReviewLogsSince } = await import("@/services/progress");
    const conn = await db.getDatabase();
    for (const id of ["a", "b", "old"]) {
      await conn.execute(`INSERT INTO words (id, word, meaning_vn) VALUES ($1, $1, 'nghĩa')`, [id]);
    }
    const base = { exerciseType: "multiple_choice" as const, responseTimeMs: 1000, wrongAttempts: 0, xpEarned: 10, direction: "recognition" as const };
    await smart.saveReviewLog({ ...base, wordId: "a", isCorrect: true, rating: 3, isScheduled: true, timestamp: new Date().toISOString() });
    await smart.saveReviewLog({ ...base, wordId: "b", isCorrect: false, rating: 1, isScheduled: false, timestamp: new Date().toISOString() });
    await smart.saveReviewLog({ ...base, wordId: "old", isCorrect: true, rating: 3, isScheduled: true, timestamp: new Date(Date.now() - 30 * DAY).toISOString() });
    const logs = await getReviewLogsSince(new Date(Date.now() - 7 * DAY));
    expect(logs.map((l) => [l.wordId, l.rating, l.isScheduled])).toEqual([["a", 3, true], ["b", 1, false]]);
  });
});

describe("#11 weekly topic challenge", () => {
  const devops = ["deploy", "release", "rollback", "pipeline"].map((id) => makeWord(id, { topic: "DevOps" }));
  const food = ["apple", "banana", "kiwi"].map((id) => makeWord(id, { topic: "Food", srs: reviewSrs(40, 1) }));
  const words = [...devops, ...food, makeWord("solo", { topic: "Tiny" })];
  const correct = (wordId: string): ProgressLog => ({ wordId, rating: 3, isScheduled: true, timestamp: new Date().toISOString() });

  it("picks the topic with most words still to master (min 3 words)", () => {
    expect(pickChallengeTopic(words)).toBe("DevOps");
    expect(pickChallengeTopic(food)).toBeNull(); // all mastered
    expect(pickChallengeTopic([makeWord("x")])).toBeNull();
  });

  it("targets about 2 correct answers per word, 10..30", () => {
    expect(challengeTarget(2)).toBe(10);
    expect(challengeTarget(8)).toBe(16);
    expect(challengeTarget(40)).toBe(30);
  });

  it("keeps the topic for the week, counts correct answers on it and rewards once", () => {
    const now = new Date();
    const logs = [...Array(9)].map(() => correct("deploy"));
    logs.push(correct("apple"), { ...correct("release"), rating: 1 });
    let c = getTopicChallenge(words, logs, now)!;
    expect(c).toMatchObject({ topic: "DevOps", target: 10, progress: 9, completed: false });
    expect(claimTopicChallengeReward(c)).toBe(false);

    // Topic stays even if another topic now has more open words
    const more = [...words, ...["a1", "a2", "a3", "a4", "a5"].map((id) => makeWord(id, { topic: "Algorithms" }))];
    logs.push(correct("pipeline"));
    c = getTopicChallenge(more, logs, now)!;
    expect(c).toMatchObject({ topic: "DevOps", progress: 10, completed: true, rewarded: false });

    const xpBefore = getXPState().totalXP;
    expect(claimTopicChallengeReward(c)).toBe(true);
    expect(getXPState().totalXP).toBe(xpBefore + 50);
    expect(claimTopicChallengeReward(getTopicChallenge(more, logs, now)!)).toBe(false);

    // Next week: a new challenge
    const next = getTopicChallenge(more, [], new Date(now.getTime() + 7 * DAY))!;
    expect(next).toMatchObject({ topic: "Algorithms", progress: 0, rewarded: false });
  });
});

describe("#10 popup session summary", () => {
  it("lists misses first, then the soonest review, with Vietnamese intervals", () => {
    const now = new Date(2026, 9, 5, 12);
    const at = (ms: number) => new Date(now.getTime() + ms).toISOString();
    const s = summarizeSession(
      [
        { key: "1", label: "deploy", correct: true, nextReview: at(4 * DAY) },
        { key: "2", label: "idempotent", correct: false, nextReview: at(10 * 60000) },
        { key: "3", label: "Thì hiện tại đơn", correct: true, nextReview: null },
        { key: "4", label: "release", correct: true, nextReview: at(3 * 3600000) },
      ],
      now
    );
    expect(s.correct).toBe(3);
    expect(s.total).toBe(4);
    expect(s.items.map((i) => [i.label, i.again])).toEqual([
      ["idempotent", "10 phút"],
      ["release", "3 giờ"],
      ["deploy", "4 ngày"],
      ["Thì hiện tại đơn", ""],
    ]);
  });

  it("formats intervals", () => {
    const now = new Date();
    expect(formatAgain(new Date(now.getTime() + 20000), now)).toBe("1 phút");
    expect(formatAgain(new Date(now.getTime() + 45 * DAY), now)).toBe("2 tháng");
    expect(formatAgain(new Date(now.getTime() + 500 * DAY), now)).toBe("1.4 năm");
  });
});

describe("#5 explaining a wrong pick", () => {
  it("names the picked word and its meaning, ignores filler options", () => {
    const words = [makeWord("release", { meaning_vn: "Phát hành; công bố" })];
    expect(describeWrongChoice("release", words)).toEqual({ word: "release", meaning: "Phát hành" });
    expect(describeWrongChoice("fallback-0", words)).toBeNull();
    expect(describeWrongChoice(null, words)).toBeNull();
  });
});
