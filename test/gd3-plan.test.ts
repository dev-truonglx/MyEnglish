import { describe, it, expect, vi } from "vitest";
import { Rating } from "ts-fsrs";
import type { CatalogEntry, StudyLevel } from "@/services/vocabCatalog";
import type { WordDetail } from "@/types/database";
import { suggestNextLevel, type LevelProgress } from "@/services/vocabFeed";
import {
  applyComebackToWork,
  comebackNewWords,
  comebackStatus,
  nextComebackPlan,
  COMEBACK_MAX_PLAN_DAYS,
  type ComebackPlan,
} from "@/services/comeback";
import { hasRealReview, summarizeWeek } from "@/services/progress";
import { computeCoverage } from "@/services/coverage";
import { COVERAGE_TEXTS } from "@/data/coverageCorpus";
import { freshServices, makeWord, reviewSrs } from "./helpers";

function entry(word: string, cefr: StudyLevel, order: number, extra: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: word,
    word,
    cefr,
    list: 3000,
    order,
    freq: order,
    it: false,
    pos: "noun",
    vn: `nghĩa của ${word}`,
    senses: [{ pos: "noun", vn: `nghĩa của ${word}` }],
    ipaUs: [`/${word}/`],
    ipaUk: [`/${word}/`],
    variants: [],
    irregular: [],
    examples: [{ en: `I see the ${word} here.`, vi: "Tôi thấy nó ở đây.", focus: [word] }],
    ...extra,
  };
}

// 10 A1 words (two IT words), 10 A2, 5 B1
const DECK: CatalogEntry[] = [
  ...Array.from({ length: 8 }, (_, i) => entry(`aone${i}`, "A1", i + 1)),
  entry("server", "A1", 50, { it: true }),
  entry("laptop", "A1", 60, { it: true }),
  ...Array.from({ length: 10 }, (_, i) => entry(`atwo${i}`, "A2", 100 + i)),
  ...Array.from({ length: 5 }, (_, i) => entry(`bone${i}`, "B1", 200 + i)),
];

async function setup(newCardsPerDay = 4) {
  const services = await freshServices();
  const catalog = await import("@/services/vocabCatalog");
  await catalog.ensureCatalogSeeded(async () => ({ version: catalog.CATALOG_VERSION, words: DECK }));
  services.srs.saveStudyLimits({ newCardsPerDay, maxSessionSize: 30 });
  const feed = await import("@/services/vocabFeed");
  return { ...services, catalog, feed };
}

/** Words not studied yet, in the order they will be introduced */
async function waitingWords(db: Awaited<ReturnType<typeof setup>>["db"]) {
  const words = await db.getAllWords();
  return words
    .filter((w) => (w.srs.reps ?? 0) === 0)
    .sort((a, b) => a.srs.next_review_date.localeCompare(b.srs.next_review_date) || a.created_at.localeCompare(b.created_at));
}

async function wordIdOf(db: Awaited<ReturnType<typeof setup>>["db"], catalogId: string): Promise<string> {
  const conn = await db.getDatabase();
  const rows = await conn.select<Array<{ id: string }>>(`SELECT id FROM words WHERE catalog_id = $1`, [catalogId]);
  return rows[0].id;
}

const realLog = (wordId: string, exerciseType = "multiple_choice") => ({
  wordId,
  exerciseType: exerciseType as "multiple_choice",
  responseTimeMs: 2000,
  isCorrect: true,
  wrongAttempts: 0,
  rating: Rating.Good,
  xpEarned: 0,
  timestamp: new Date().toISOString(),
  isScheduled: true,
  direction: "recognition" as const,
});

// ─── 1. P7: when to open the next level ─────────────────────────────────────

describe("P7 next level", () => {
  const lp = (level: StudyLevel, total: number, met: number, remembered: number, notAdded = 1): LevelProgress => ({
    level,
    total,
    met,
    remembered,
    known: 0,
    notAdded,
  });

  it("is suggested at 80% met and 50% remembered, for every chosen level", () => {
    expect(suggestNextLevel([lp("A1", 100, 79, 60)], ["A1"])).toBeNull();
    expect(suggestNextLevel([lp("A1", 100, 80, 49)], ["A1"])).toBeNull();
    expect(suggestNextLevel([lp("A1", 100, 80, 50)], ["A1"])).toEqual({ next: "A2", reason: "ready" });
    expect(suggestNextLevel([lp("A1", 100, 100, 90), lp("A2", 100, 50, 20)], ["A1", "A2"])).toBeNull();
    expect(suggestNextLevel([lp("A1", 100, 100, 90), lp("A2", 100, 85, 60)], ["A1", "A2"])).toEqual({ next: "B1", reason: "ready" });
  });

  it("is offered as soon as the chosen levels have no new word left", () => {
    expect(suggestNextLevel([lp("A1", 100, 30, 5, 0)], ["A1"])).toEqual({ next: "A2", reason: "exhausted" });
    const all = (["A1", "A2", "B1", "B2", "C1"] as StudyLevel[]).map((l) => lp(l, 100, 100, 90, 0));
    expect(suggestNextLevel(all, ["A1", "A2", "B1", "B2", "C1"])).toEqual({ next: null, reason: "exhausted" });
  });

  it("counts a word as remembered only after a real review, and reports the exhausted deck", async () => {
    const { feed, db, smart, srs } = await setup(4);
    feed.setStudyLevels(["A1"]);
    expect(await feed.topUpNewWords()).toEqual({ added: 9, exhausted: false });
    const conn = await db.getDatabase();

    // "Đã biết" only, even with a long stability: met, not remembered
    expect(await feed.markCatalogWordsKnown(["server"])).toBe(1);
    const serverId = await wordIdOf(db, "server");
    await conn.execute(`UPDATE srs_reviews SET state = 2, stability = 40 WHERE word_id = $1`, [serverId]);

    // A real review and 3+ weeks of stability: remembered
    const aoneId = await wordIdOf(db, "aone0");
    await srs.recordReview(aoneId, Rating.Good);
    await smart.saveReviewLog(realLog(aoneId));
    await conn.execute(`UPDATE srs_reviews SET state = 2, stability = 30 WHERE word_id = $1`, [aoneId]);
    // A real review but only 10 days: not yet
    const laptopId = await wordIdOf(db, "laptop");
    await srs.recordReview(laptopId, Rating.Good);
    await smart.saveReviewLog(realLog(laptopId));
    await conn.execute(`UPDATE srs_reviews SET state = 2, stability = 10 WHERE word_id = $1`, [laptopId]);

    const progress = await feed.loadLevelProgress();
    const a1 = progress.find((p) => p.level === "A1")!;
    expect(a1).toMatchObject({ total: 10, met: 3, remembered: 1, known: 1 });
    // The known word left the buffer, so the last A1 word came in: nothing left to add
    expect(a1.notAdded).toBe(0);
    expect(feed.isFeedExhausted()).toBe(true);
    expect(suggestNextLevel(progress, ["A1"])).toEqual({ next: "A2", reason: "exhausted" });
  });
});

// ─── 2. P10: a running top-up does not undo a level change ──────────────────

describe("P10 level change during a top-up", () => {
  it("keeps the new levels and only words of them", async () => {
    const { feed, db } = await setup(4);
    feed.setStudyLevels(["A1", "A2"]);
    const running = feed.topUpNewWords(); // has read A1 + A2 already
    const changed = feed.changeStudyLevels(["A1"]);
    await Promise.all([running, changed]);

    expect(feed.getStudyLevels()).toEqual(["A1"]);
    expect(JSON.parse(localStorage.getItem("myenglish_study_levels_v1") || "null").levels).toEqual(["A1"]);
    const waiting = await waitingWords(db);
    expect(waiting.every((w) => w.cefr_level === "A1")).toBe(true);
    // The buffer was refilled after the change (budget 4 + 5)
    expect(waiting).toHaveLength(9);
  });
});

// ─── 3. P14: words the learner pulled in stay ───────────────────────────────

describe("P14 words learnt early", () => {
  it("are not removed when the levels change", async () => {
    const { feed, db } = await setup(4);
    feed.setStudyLevels(["A1", "A2"]);
    await feed.topUpNewWords();
    expect(await feed.learnEarly("bone0")).toBe("added"); // B1, not chosen
    expect(await feed.learnEarly("atwo0")).toBe("moved"); // A2, already in the buffer
    expect(feed.getPickedCatalogIds().sort()).toEqual(["atwo0", "bone0"]);

    await feed.changeStudyLevels(["A1"]);
    const words = await db.getAllWords();
    const ids = words.map((w) => w.catalog_id);
    expect(ids).toContain("bone0");
    expect(ids).toContain("atwo0");
    // Other unstarted A2 words left
    expect(words.filter((w) => w.cefr_level === "A2").map((w) => w.catalog_id)).toEqual(["atwo0"]);
  });
});

// ─── 4. P16: a new deck version updates the words already added ─────────────

describe("P16 deck version sync", () => {
  it("updates level and meaning by catalog id, keeps the learner's examples and topic", async () => {
    const { feed, db } = await setup(4);
    feed.setStudyLevels(["A1"]);
    await feed.topUpNewWords();
    const conn = await db.getDatabase();
    const serverId = await wordIdOf(db, "server");
    const laptopId = await wordIdOf(db, "laptop");
    await db.addUserContextExample(serverId, "We restarted the server last night.");
    await conn.execute(`UPDATE words SET topic = 'DevOps' WHERE id = $1`, [laptopId]);
    const examplesBefore = (await db.getWordsByIds([serverId]))[0].examples.length;

    await conn.execute(`UPDATE vocab_catalog SET cefr = 'A2', vn = 'máy chủ' WHERE id = 'server'`);
    await conn.execute(`UPDATE vocab_catalog SET cefr = 'A2' WHERE id = 'laptop'`);
    await conn.execute(`UPDATE vocab_catalog_meta SET value = '99' WHERE key = 'version'`);
    expect(await feed.syncWordsWithCatalog()).toBe(2);

    const [server] = await db.getWordsByIds([serverId]);
    expect(server).toMatchObject({ cefr_level: "A2", meaning_vn: "máy chủ", topic: "A2" });
    expect(server.examples).toHaveLength(examplesBefore);
    const [laptop] = await db.getWordsByIds([laptopId]);
    expect(laptop).toMatchObject({ cefr_level: "A2", topic: "DevOps" });
    // In sync: nothing to do
    expect(await feed.syncWordsWithCatalog()).toBe(0);
  });
});

// ─── 5. P3: the comeback plan lasts until caught up ─────────────────────────

describe("P3 comeback plan", () => {
  const base = { maxSessionSize: 30, dailyGoal: 10, activeDates: ["2026-10-01"] };

  it("allows new words once the backlog goes down", () => {
    const plan = nextComebackPlan(null, { ...base, backlog: 90, today: "2026-10-05" })!;
    expect(plan.dailyQuota).toBe(30);
    expect(comebackNewWords(plan)).toBe(0); // first day back

    const day2 = nextComebackPlan(plan, { ...base, backlog: 70, today: "2026-10-06" })!;
    expect(day2.dayStart).toEqual({ on: "2026-10-06", backlog: 70, previous: 90 });
    expect(comebackNewWords(day2)).toBe(1);
    expect(comebackStatus(day2, 70, 0, "2026-10-06").newWordsPerDay).toBe(1);
    // Later checks the same day keep the day's start
    expect(nextComebackPlan(day2, { ...base, backlog: 45, today: "2026-10-06" })).toEqual(day2);

    // Today's share covers what is left: 2
    const day3 = nextComebackPlan(day2, { ...base, backlog: 25, today: "2026-10-07" })!;
    expect(comebackNewWords(day3)).toBe(2);
    // Growing again: none
    const day4 = nextComebackPlan(day3, { ...base, backlog: 40, today: "2026-10-08" })!;
    expect(comebackNewWords(day4)).toBe(0);
  });

  it("goes on after day 7 until nothing is due, at most 14 days", () => {
    expect(COMEBACK_MAX_PLAN_DAYS).toBe(14);
    const plan: ComebackPlan = { startedOn: "2026-10-05", missedDays: 5, backlogAtStart: 300, dailyQuota: 10 };
    const input = { ...base, activeDates: ["2026-10-05"], backlog: 120 };
    expect(nextComebackPlan(plan, { ...input, today: "2026-10-13" })).not.toBeNull(); // day 9
    expect(nextComebackPlan(plan, { ...input, today: "2026-10-18" })).not.toBeNull(); // day 14
    expect(nextComebackPlan(plan, { ...input, today: "2026-10-19" })).toBeNull(); // past the max
    expect(nextComebackPlan(plan, { ...input, backlog: 0, today: "2026-10-13" })?.completedOn).toBe("2026-10-13");
  });

  it("never shows more days than the plan has left", () => {
    const plan: ComebackPlan = { startedOn: "2026-10-05", missedDays: 5, backlogAtStart: 300, dailyQuota: 10 };
    // Day 10, 300 due at 10 a day: 30 days at this pace, 5 days of plan left
    expect(comebackStatus(plan, 300, 0, "2026-10-14")).toMatchObject({ dayNumber: 10, daysLeft: 5, catchesUpInPlan: false });
    // Last day, share done
    expect(comebackStatus(plan, 200, 10, "2026-10-18")).toMatchObject({ daysLeft: 0, catchesUpInPlan: false });
    // A pace that fits is shown as is
    expect(comebackStatus(plan, 30, 0, "2026-10-06")).toMatchObject({ daysLeft: 3, catchesUpInPlan: true });
  });

  it("counts the plan's new words minus the ones introduced today", () => {
    const plan: ComebackPlan = {
      startedOn: "2026-10-05",
      missedDays: 5,
      backlogAtStart: 90,
      dailyQuota: 30,
      dayStart: { on: "2026-10-06", backlog: 70, previous: 90 },
    };
    const status = comebackStatus(plan, 70, 5, "2026-10-06");
    const work = { reviews: 70, newToday: 5, total: 75 };
    expect(applyComebackToWork(work, status, { recognition: 0, production: 0 })).toEqual({ reviews: 25, newToday: 1, total: 26 });
    expect(applyComebackToWork(work, status, { recognition: 1, production: 0 })).toEqual({ reviews: 25, newToday: 0, total: 25 });
    expect(applyComebackToWork(work, status)).toEqual({ reviews: 25, newToday: 0, total: 25 });
  });
});

// ─── 6. S2: "Đã biết" is not studying ────────────────────────────────────────

describe("S2 words only marked as known", () => {
  const knownOnly = (id: string, extra: Partial<WordDetail> = {}) =>
    makeWord(id, {
      srs: reviewSrs(30, 1, { reps: 1 }),
      stats: { totalAttempts: 0, correctCount: 0, wrongCount: 0, accuracy: 0 },
      ...extra,
    });
  const reviewed = (id: string, extra: Partial<WordDetail> = {}) =>
    makeWord(id, {
      srs: reviewSrs(30, 1),
      stats: { totalAttempts: 2, correctCount: 2, wrongCount: 0, accuracy: 100 },
      ...extra,
    });

  it("are told apart by their attempts", () => {
    expect(hasRealReview(knownOnly("a"))).toBe(false);
    expect(hasRealReview(reviewed("b"))).toBe(true);
    expect(hasRealReview(makeWord("c"))).toBe(true); // no stats: counted
  });

  it("do not raise the CEFR level vocabulary", async () => {
    vi.resetModules();
    const { assessUserProficiency } = await import("@/services/userProficiency");
    const profile = assessUserProficiency([
      ...Array.from({ length: 5 }, (_, i) => knownOnly(`k${i}`, { cefr_level: "A1" })),
      ...Array.from({ length: 3 }, (_, i) => reviewed(`r${i}`, { cefr_level: "A1" })),
    ]);
    expect(profile.levelVocab.A1.known).toBe(3);
    expect(profile.vocabularyStats.totalWords).toBe(3);
  });

  it("do not count toward coverage or the week's long-term words", () => {
    const words = ["request", "file", "test", "bug", "change"];
    const none = computeCoverage([], COVERAGE_TEXTS).percent;
    expect(computeCoverage(words.map((w) => knownOnly(w)), COVERAGE_TEXTS).percent).toBe(none);
    expect(computeCoverage(words.map((w) => reviewed(w)), COVERAGE_TEXTS).percent).toBeGreaterThan(none);
    expect(summarizeWeek([], [knownOnly("a"), reviewed("b")], 0.9).masteredWords).toBe(1);
  });

  it("leave the answer logs and the study hours", async () => {
    const { db, smart } = await freshServices();
    const conn = await db.getDatabase();
    for (const id of ["a", "b"]) await conn.execute(`INSERT INTO words (id, word, meaning_vn) VALUES ($1, $1, 'nghĩa')`, [id]);
    await smart.saveReviewLog(realLog("a"));
    await smart.saveReviewLog({ ...realLog("b", "known"), isScheduled: false, rating: Rating.Easy });
    const { getReviewLogsSince } = await import("@/services/progress");
    const logs = await getReviewLogsSince(new Date(Date.now() - 86_400_000));
    expect(logs.map((l) => l.wordId)).toEqual(["a"]);
    const { loadHabitInsights } = await import("@/services/habits");
    const habits = await loadHabitInsights();
    expect(habits.studyHours.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

// ─── S3: levels below the chosen one are passed ──────────────────────────────

describe("S3 CEFR card", () => {
  it("shows the levels below the learner's level as passed, measured by vocabulary", async () => {
    vi.resetModules();
    const { assessUserProficiency, setUserOverrideLevel } = await import("@/services/userProficiency");
    setUserOverrideLevel("B1");
    const { levelBreakdown, recommendations } = assessUserProficiency([]);
    expect(levelBreakdown.A1.status).toBe("mastered");
    expect(levelBreakdown.A2.status).toBe("mastered");
    expect(levelBreakdown.B1.status).toBe("learning");
    expect(levelBreakdown.B2.status).toBe("locked");
    expect(levelBreakdown.B1.vocabPercent).toBe(0);
    expect(recommendations.join(" ")).not.toMatch(/chẩn đoán|tự động nạp/);
    setUserOverrideLevel(null);
  });
});
