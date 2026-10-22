import { describe, it, expect } from "vitest";
import { Rating } from "ts-fsrs";
import {
  areConfusable,
  askableCards,
  buildReviewSession,
  deriveRating,
  generateMultipleChoiceQuestion,
  getUnmasteredWords,
  isCatalogSynonym,
  isKnownOnly,
  isLeech,
  isWordKnown,
  matchTypedAnswer,
  meaningSenses,
  multipleChoiceDirection,
  prepareContextMatch,
  registerCatalogMeanings,
  requeuePosition,
  selectExerciseType,
  summarizeTodayWork,
  todayWorkFromCounts,
} from "@/services/smartReview";
import { isDueSrs, nextLocalDayStart, toCard } from "@/services/cards";
import {
  KNOWN_STABILITY_MAX_DAYS,
  KNOWN_STABILITY_MIN_DAYS,
  knownStabilityDays,
  schedulingDecision,
  wasGradedSince,
} from "@/services/reviewRecorder";
import { saveStudyLimits } from "@/services/srs";
import { isRememberedLong } from "@/services/wordStatus";
import type { SRSReview, WordDetail } from "@/types/database";
import { freshServices, makeWord, reviewSrs, DAY_MS } from "./helpers";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** Today at `hour` o'clock, local time */
const todayAt = (hour: number) => {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
};

const input = (word: string, meaning = "nghĩa của " + word) => ({
  word,
  meaning_vn: meaning,
  synonyms: [],
  antonyms: [],
  examples: [{ sentence_en: `The ${word} works.`, grammar_analysis: "S + V" }],
});

const ex = (word: string) => [{ id: `e-${word}`, word_id: word, sentence_en: `We use the ${word} every day.`, grammar_analysis: "" }];

describe("'Đã biết' is 'Nhớ lâu' at once, checked once months later by FSRS (M6/P8)", () => {
  it("knownStabilityDays is deterministic, at least 'Nhớ lâu', and spreads a batch of words", () => {
    const ids = Array.from({ length: 3000 }, (_, i) => `word-${i}-${(i * 7919) % 1000}`);
    const days = ids.map(knownStabilityDays);
    expect(KNOWN_STABILITY_MIN_DAYS).toBeGreaterThanOrEqual(21);
    expect(days.every((d) => d >= KNOWN_STABILITY_MIN_DAYS && d <= KNOWN_STABILITY_MAX_DAYS)).toBe(true);
    expect(ids.map(knownStabilityDays)).toEqual(days);
    const perDay = new Map<number, number>();
    days.forEach((d) => perDay.set(d, (perDay.get(d) ?? 0) + 1));
    expect(perDay.size).toBeGreaterThan((KNOWN_STABILITY_MAX_DAYS - KNOWN_STABILITY_MIN_DAYS + 1) * 0.9);
    expect(Math.max(...perDay.values())).toBeLessThan(3000 * 0.02);
  });

  it("puts the card in Review, difficulty 5, long stability, due at the FSRS interval, without spending the budget", async () => {
    const { db, smart } = await freshServices();
    const recorder = await import("@/services/reviewRecorder");
    const id = await db.insertEnrichedWord(input("server"));
    const now = new Date();
    expect(await recorder.markWordKnown(id, now)).toBe(true);
    expect(await recorder.markWordKnown(id, now)).toBe(false);

    const [w] = await db.getWordsByIds([id]);
    const days = recorder.knownStabilityDays(id);
    // At the default 90% retention FSRS's interval for a stability S is S days
    expect(w.srs).toMatchObject({ state: 2, reps: 1, lapses: 0, difficulty: 5, stability: days, scheduled_days: days });
    expect(new Date(w.srs.next_review_date).getTime()).toBe(now.getTime() + days * DAY_MS);
    expect(w.srsProduction ?? null).toBeNull();
    expect(await smart.getNewCardsIntroducedToday()).toEqual({ recognition: 0, production: 0 });

    const conn = await db.getDatabase();
    const logs = await conn.select<Array<{ exercise_type: string; is_scheduled: number }>>(
      `SELECT exercise_type, is_scheduled FROM review_logs WHERE word_id = $1`,
      [id]
    );
    expect(logs).toEqual([{ exercise_type: "known", is_scheduled: 0 }]);

    // "Nhớ lâu" at once, still waiting for its check
    expect(smart.isKnownOnly(w.srs)).toBe(true);
    expect(isRememberedLong(w)).toBe(true);
    expect(smart.getUnmasteredWords([w])).toHaveLength(0);
    // Its check answered right: FSRS only raises the stability, so it stays "Nhớ lâu"; no recall card, the
    // learner can already write it
    const res = await (await import("@/services/srs")).recordReview(id, Rating.Good);
    expect(res.stability).toBeGreaterThanOrEqual(days);
    const [after] = await db.getWordsByIds([id]);
    expect(smart.isKnownOnly(after.srs)).toBe(false);
    expect(isRememberedLong(after)).toBe(true);
    expect(after.srsProduction ?? null).toBeNull();
  });

  it("a word marked 'Đã biết' gets a recall card only once its check was missed (learned like any other)", async () => {
    const { db } = await freshServices();
    const srs = await import("@/services/srs");
    const recorder = await import("@/services/reviewRecorder");
    const conn = await db.getDatabase();
    const id = await db.insertEnrichedWord(input("buffer"));
    await recorder.markWordKnown(id);
    // Later reviews of a confirmed word: still none
    await conn.execute(`UPDATE srs_reviews SET reps = 3, stability = 60, next_review_date = $1 WHERE word_id = $2`, [new Date().toISOString(), id]);
    await srs.recordReview(id, Rating.Good);
    expect((await db.getWordsByIds([id]))[0].srsProduction ?? null).toBeNull();
    // Forgotten once and relearned to Review: recall practice opens
    await conn.execute(`UPDATE srs_reviews SET state = 2, lapses = 1, stability = 10, next_review_date = $1 WHERE word_id = $2`, [new Date().toISOString(), id]);
    await srs.recordReview(id, Rating.Good);
    expect((await db.getWordsByIds([id]))[0].srsProduction).not.toBeNull();
  });

  it("untouched recall cards of words marked 'Đã biết' are removed; answered ones and lapsed words keep theirs", async () => {
    const { db } = await freshServices();
    const recorder = await import("@/services/reviewRecorder");
    const conn = await db.getDatabase();
    const [fresh, answered, lapsed, normal] = await Promise.all(["fresh", "answered", "lapsed", "normal"].map((w) => db.insertEnrichedWord(input(w))));
    for (const id of [fresh, answered, lapsed]) await recorder.markWordKnown(id);
    await conn.execute(`UPDATE srs_reviews SET lapses = 1, state = 3 WHERE word_id = $1`, [lapsed]);
    for (const [id, reps] of [[fresh, 0], [answered, 2], [lapsed, 0], [normal, 0]] as const) {
      await conn.execute(
        `INSERT OR REPLACE INTO srs_production (word_id, next_review_date, state, reps, lapses, stability, difficulty, learning_steps)
         VALUES ($1, $2, $3, $4, 0, $5, 5, 0)`,
        [id, new Date().toISOString(), reps > 0 ? 2 : 0, reps, reps > 0 ? 5 : 0]
      );
    }

    expect(await recorder.removeKnownRecallCards()).toBe(1);
    expect(await recorder.removeKnownRecallCards()).toBe(0);
    const left = await conn.select<Array<{ word_id: string }>>(`SELECT word_id FROM srs_production ORDER BY word_id`);
    expect(left.map((r) => r.word_id).sort()).toEqual([answered, lapsed, normal].sort());
  });

  it("a missed check is an FSRS lapse: the word goes back to learning", async () => {
    const { db } = await freshServices();
    const recorder = await import("@/services/reviewRecorder");
    const id = await db.insertEnrichedWord(input("cache"));
    await recorder.markWordKnown(id);
    const res = await (await import("@/services/srs")).recordReview(id, Rating.Again);
    expect(res).toMatchObject({ state: 3, lapses: 1 });
    const [after] = await db.getWordsByIds([id]);
    expect(isRememberedLong(after)).toBe(false);
  });

  it("the first check follows the learner's retention target (FSRS interval, not the raw stability)", async () => {
    const { db } = await freshServices();
    const srs = await import("@/services/srs");
    const recorder = await import("@/services/reviewRecorder");
    srs.saveFSRSSettings({ requestRetention: 0.95 });
    const id = await db.insertEnrichedWord(input("queue"));
    const now = new Date();
    await recorder.markWordKnown(id, now);
    const [w] = await db.getWordsByIds([id]);
    const stability = recorder.knownStabilityDays(id);
    const expected = Math.round(stability * srs.getFSRSScheduler().interval_modifier);
    expect(w.srs.stability).toBe(stability);
    expect(w.srs.scheduled_days).toBe(expected);
    expect(expected).toBeLessThan(stability);
    expect(new Date(w.srs.next_review_date).getTime()).toBe(now.getTime() + expected * DAY_MS);
    // Recall predicted at the target on the due day
    const r = srs.getCardRetrievability(w.srs, new Date(now.getTime() + expected * DAY_MS));
    expect(r).toBeGreaterThan(0.94);
    expect(r).toBeLessThan(0.96);
  });

  it("words marked on the old short schedule move to the long one, from when they were marked", async () => {
    const { db } = await freshServices();
    const recorder = await import("@/services/reviewRecorder");
    const conn = await db.getDatabase();
    const markedAt = new Date(Date.now() - 10 * DAY_MS);
    const old = await db.insertEnrichedWord(input("legacy"));
    const checked = await db.insertEnrichedWord(input("checked"));
    for (const [id, reps, stability] of [[old, 1, 9], [checked, 2, 12]] as const) {
      await conn.execute(
        `UPDATE srs_reviews SET state = 2, reps = $1, lapses = 0, stability = $2, difficulty = 5, scheduled_days = $2, interval = $2,
           last_review = $3, next_review_date = $4 WHERE word_id = $5`,
        [reps, stability, markedAt.toISOString(), new Date(markedAt.getTime() + stability * DAY_MS).toISOString(), id]
      );
    }

    expect(await recorder.rescheduleLegacyKnownCards()).toBe(1);
    expect(await recorder.rescheduleLegacyKnownCards()).toBe(0);
    const [moved] = await db.getWordsByIds([old]);
    const expected = recorder.knownSchedule(old, markedAt);
    expect(moved.srs).toMatchObject({ state: 2, reps: 1, lapses: 0, stability: expected.stability, scheduled_days: expected.scheduledDays });
    expect(moved.srs.next_review_date).toBe(expected.due);
    expect(moved.srs.last_review).toBe(markedAt.toISOString());
    expect(isRememberedLong(moved)).toBe(true);
    // A word whose check was already answered keeps the schedule FSRS gave it
    const [kept] = await db.getWordsByIds([checked]);
    expect(kept.srs.stability).toBe(12);
  });

  it("isKnownOnly: only the untouched 'known' schedule", () => {
    expect(isKnownOnly({ state: 2, reps: 1, lapses: 0, stability: 9 })).toBe(true);
    expect(isKnownOnly({ state: 2, reps: 2, lapses: 0, stability: 20 })).toBe(false);
    expect(isKnownOnly({ state: 1, reps: 1, lapses: 0 })).toBe(false);
    const known = makeWord("known", { srs: { state: 2, reps: 1, lapses: 0, stability: 15, interval: 15 } });
    const real = makeWord("real", { srs: reviewSrs(15, 3) });
    expect(isWordKnown(known)).toBe(false);
    expect(isWordKnown(real)).toBe(true);
    expect(getUnmasteredWords([known, makeWord("learning", { srs: reviewSrs(2, 1) })]).map((w) => w.id)).toEqual(["learning"]);
  });
});

describe("leeches recover (M2)", () => {
  const leechSrs = (stability: number): Partial<SRSReview> => ({ ...reviewSrs(stability, 1), lapses: 5, reps: 12 });

  it("is a leech only while still unstable", () => {
    expect(isLeech(leechSrs(3))).toBe(true);
    expect(isLeech(leechSrs(6.9))).toBe(true);
    expect(isLeech(leechSrs(7))).toBe(false);
    expect(isLeech(leechSrs(120))).toBe(false);
  });

  it("a settled leech goes back to the normal ladder", () => {
    const settled = makeWord("cache", { examples: ex("cache"), srs: reviewSrs(60, 2), srsProduction: { ...(leechSrs(40) as SRSReview), word_id: "cache" } });
    expect(selectExerciseType(toCard(settled, "production"))).toBe("spelling");
    const unstable = makeWord("cache", { examples: ex("cache"), srs: reviewSrs(60, 2), srsProduction: { ...(leechSrs(4) as SRSReview), word_id: "cache" } });
    expect(selectExerciseType(toCard(unstable, "production"))).toBe("letter_tiles");

    const recognition = makeWord("mutex", { srs: { ...leechSrs(40), reps: 14 } as SRSReview });
    expect(multipleChoiceDirection(recognition)).toBe("vn_to_en"); // 14 % 3 === 2: no longer forced en_to_vn
    expect(multipleChoiceDirection(makeWord("mutex", { srs: { ...leechSrs(4), reps: 14 } as SRSReview }))).toBe("en_to_vn");
  });
});

describe("letter tiles (M9)", () => {
  it("grades Good on first try without hint (however slow), Hard with hint, and Again on wrong attempts", () => {
    expect(deriveRating({ exerciseType: "letter_tiles", wrongAttempts: 0, responseTimeMs: 2000 })).toBe(Rating.Good);
    expect(deriveRating({ exerciseType: "letter_tiles", wrongAttempts: 0, usedHint: true, responseTimeMs: 2000 })).toBe(Rating.Hard);
    expect(deriveRating({ exerciseType: "letter_tiles", wrongAttempts: 0, nearMiss: true, responseTimeMs: 2000 })).toBe(Rating.Hard);
    expect(deriveRating({ exerciseType: "letter_tiles", wrongAttempts: 0, responseTimeMs: 30000 })).toBe(Rating.Good);
    expect(deriveRating({ exerciseType: "letter_tiles", wrongAttempts: 1, responseTimeMs: 2000 })).toBe(Rating.Again);
    expect(deriveRating({ exerciseType: "spelling", wrongAttempts: 0, responseTimeMs: 2000 })).toBe(Rating.Good);
  });

  it("a failure steps the ladder down: weak learning cards get tiles, stronger ones are typed", () => {
    const weak = makeWord("cache", {
      examples: ex("cache"),
      srs: reviewSrs(10, 2),
      srsProduction: { word_id: "cache", ease_factor: 2.5, interval: 0, repetitions: 1, state: 1, reps: 1, stability: 1, next_review_date: new Date().toISOString() },
    });
    expect(selectExerciseType(toCard(weak, "production"))).toBe("letter_tiles");
    const learning = makeWord("cache", {
      examples: ex("cache"),
      srs: reviewSrs(10, 2),
      srsProduction: { word_id: "cache", ease_factor: 2.5, interval: 0, repetitions: 1, state: 1, reps: 1, stability: 2.3, next_review_date: new Date().toISOString() },
    });
    expect(selectExerciseType(toCard(learning, "production"))).toBe("cloze");
    const relearningNoSentence = makeWord("cache", {
      srs: reviewSrs(10, 2),
      srsProduction: { word_id: "cache", ease_factor: 2.5, interval: 0, repetitions: 5, state: 3, reps: 5, stability: 3, next_review_date: new Date().toISOString() },
    });
    expect(selectExerciseType(toCard(relearningNoSentence, "production"))).toBe("spelling");
  });

  it("never credits the recognition card", async () => {
    const { db } = await freshServices();
    const recorder = await import("@/services/reviewRecorder");
    const cards = await import("@/services/cards");
    const conn = await db.getDatabase();
    const id = await db.insertEnrichedWord(input("cache"));
    const past = (d: number) => new Date(Date.now() - d * DAY_MS).toISOString();
    for (const table of ["srs_reviews", "srs_production"]) {
      await conn.execute(
        `INSERT OR REPLACE INTO ${table} (word_id, next_review_date, stability, difficulty, reps, lapses, state, last_review, scheduled_days)
         VALUES ($1, $2, 4, 5, 3, 0, 2, $3, 4)`,
        [id, past(1), past(5)]
      );
    }
    const [word] = await db.getWordsByIds([id]);
    const res = await recorder.recordCardAnswer({
      card: cards.toCard(word, "production"),
      exerciseType: "letter_tiles",
      rating: Rating.Hard,
      wrongAttempts: 0,
      responseTimeMs: 3000,
      scheduled: true,
      countsForDailyGoal: true,
    });
    expect(res.result?.direction).toBe("production");
    expect(res.implicit).toBeNull();
  });
});

describe("requeue position (M18)", () => {
  it("leaves at least 3 cards before a forgotten card, else puts it last", () => {
    expect(requeuePosition(10, 2, 3)).toBe(6);
    expect(requeuePosition(5, 2, 3)).toBe(5);
    expect(requeuePosition(4, 3, 3)).toBe(4);
  });
});

describe("distractors never match any sense of the target (M4)", () => {
  const word = (w: string, vn: string, extra: Partial<WordDetail> = {}) => makeWord(w, { meaning_vn: vn, ...extra });
  const get = word("get", "nhận; mua; trở nên; lấy");
  const become = word("become", "trở nên; trở thành");
  const just = word("just", "chỉ; vừa mới; vừa đúng; công bằng");
  const only = word("only", "duy nhất; chỉ");
  const fillers = ["bàn", "ghế", "cửa sổ", "con mèo", "quả táo", "cái bút", "bầu trời"].map((vn, i) => word(`filler${i}`, vn));

  it("splits every sense, drops brackets", () => {
    expect(meaningSenses("ánh sáng; đèn; nhẹ; thắp, châm lửa; sáng, nhạt (màu)")).toEqual(
      expect.arrayContaining(["ánh sáng", "đèn", "nhẹ", "thắp", "châm lửa", "sáng", "nhạt"])
    );
    expect(meaningSenses("a (b; c)\nd")).toEqual(["a", "d"]);
    expect(areConfusable(get, become)).toBe(true);
    expect(areConfusable(just, only)).toBe(true);
    expect(areConfusable(get, fillers[0])).toBe(false);
  });

  it("in both directions", () => {
    for (let i = 0; i < 20; i++) {
      const en = generateMultipleChoiceQuestion(get, [get, become, ...fillers], "en_to_vn").options.map((o) => o.text);
      expect(en).not.toContain("Trở nên");
      const vn = generateMultipleChoiceQuestion(just, [just, only, ...fillers], "vn_to_en").options.map((o) => o.text);
      expect(vn).not.toContain("only");
    }
  });
});

describe("Vietnamese -> English options are words already studied (M7)", () => {
  it("prefers studied words, fills with others", () => {
    const target = makeWord("server", { meaning_vn: "máy chủ", srs: reviewSrs(10, 2) });
    const studied = ["bàn", "ghế", "cửa sổ"].map((vn, i) => makeWord(`studied${i}`, { meaning_vn: vn, srs: reviewSrs(5, 1) }));
    const unseen = Array.from({ length: 30 }, (_, i) => makeWord(`catalog${i}`, { meaning_vn: `nghĩa số ${i} khác` }));
    for (let i = 0; i < 20; i++) {
      const ids = generateMultipleChoiceQuestion(target, [target, ...unseen, ...studied], "vn_to_en").options.map((o) => o.id);
      expect(ids.filter((id) => id.startsWith("studied"))).toHaveLength(3);
    }
    const one = generateMultipleChoiceQuestion(target, [target, ...unseen, studied[0]], "vn_to_en").options.map((o) => o.id);
    expect(one).toContain("studied0");
    expect(one.filter((id) => id.startsWith("catalog"))).toHaveLength(2);
  });
});

describe("deck words in typed answers (M8/M12)", () => {
  it("another deck word with the same meaning is a synonym; another real word is no typo", () => {
    expect(matchTypedAnswer("effect", "affect")).toBe("near"); // before the deck is registered
    registerCatalogMeanings([
      { word: "he", vn: "anh ấy, ông ấy" },
      { word: "him", vn: "anh ấy, ông ấy" },
      { word: "phone", vn: "điện thoại; gọi điện" },
      { word: "telephone", vn: "điện thoại; gọi điện" },
      { word: "affect", vn: "ảnh hưởng đến" },
      { word: "effect", vn: "ảnh hưởng" },
    ]);
    expect(isCatalogSynonym("him", makeWord("he", { meaning_vn: "anh ấy, ông ấy" }))).toBe(true);
    expect(isCatalogSynonym("Telephone ", makeWord("phone", { meaning_vn: "điện thoại; gọi điện" }))).toBe(true);
    expect(isCatalogSynonym("effect", makeWord("affect", { meaning_vn: "ảnh hưởng đến" }))).toBe(false);
    expect(isCatalogSynonym("phones", makeWord("phone", { meaning_vn: "điện thoại" }))).toBe(false); // a form of the target
    expect(matchTypedAnswer("effect", "affect")).toBe("wrong");
  });

  it("loads the deck's meanings once from vocab_catalog", async () => {
    const { db } = await freshServices();
    const conn = await db.getDatabase();
    await conn.execute(
      `INSERT INTO vocab_catalog (id, word, cefr, list, study_order, freq, it, pos, vn, data)
       VALUES ('he', 'he', 'A1', 3000, 1, 1, 0, 'pronoun', 'anh ấy', '{}'), ('him', 'him', 'A1', 3000, 2, 1, 0, 'pronoun', 'anh ấy', '{}')`
    );
    const catalog = await import("@/services/vocabCatalog");
    const smart = await import("@/services/smartReview");
    expect(await catalog.loadCatalogMeanings()).toBe(2);
    expect(smart.isCatalogSynonym("him", makeWord("he", { meaning_vn: "anh ấy" }))).toBe(true);
  });
});

describe("due by day for review cards (P4)", () => {
  const morning = todayAt(9);
  const evening = todayAt(21);
  const reviewDue = (due: Date): Partial<SRSReview> => ({ ...reviewSrs(3, 2), next_review_date: due.toISOString(), scheduled_days: 3 });

  it("a review card due tonight is due this morning; learning cards keep their minute", () => {
    expect(isDueSrs(reviewDue(evening), morning)).toBe(true);
    expect(isDueSrs(reviewDue(new Date(nextLocalDayStart(morning) + HOUR)), morning)).toBe(false);
    const learning: Partial<SRSReview> = { state: 1, reps: 1, stability: 0.5, next_review_date: new Date(morning.getTime() + 5 * MIN).toISOString() };
    expect(isDueSrs(learning, morning)).toBe(false);
    expect(isDueSrs(learning, new Date(morning.getTime() + 6 * MIN))).toBe(true);
  });

  it("the same rule decides scheduling and the stored-row check", () => {
    const card = toCard(makeWord("cache", { srs: reviewDue(evening) }), "recognition");
    expect(schedulingDecision({ card, exerciseType: "multiple_choice", now: morning }).scheduled).toBe(true);
    // Stored row still due tonight: not graded since; graded since (due in days): practice
    expect(wasGradedSince(card.srs, reviewDue(evening), morning)).toBe(false);
    expect(wasGradedSince(card.srs, reviewDue(new Date(morning.getTime() + 3 * DAY_MS)), morning)).toBe(true);
    // A new card stays new when its quiz is postponed; graded, it is not new any more
    const fresh = makeWord("fresh").srs;
    expect(wasGradedSince(fresh, { ...fresh, next_review_date: new Date(morning.getTime() + 10 * MIN).toISOString() }, morning)).toBe(false);
    expect(wasGradedSince(fresh, { state: 1, reps: 1, next_review_date: new Date(morning.getTime() + 10 * MIN).toISOString() }, morning)).toBe(true);
  });
});

describe("Today counts like the session (P11)", () => {
  it("applies the backlog limit to new cards", async () => {
    await freshServices();
    expect(todayWorkFromCounts({ reviews: 50, newWaiting: 20 }, { recognition: 0, production: 0 }, 10, new Date(), 30)).toEqual({
      reviews: 50,
      newToday: 6,
      total: 56,
    });
    expect(todayWorkFromCounts({ reviews: 61, newWaiting: 20 }, { recognition: 0, production: 0 }, 10, new Date(), 30).newToday).toBe(0);
  });

  it("one review per word, siblings buried, new / learning siblings still counted", async () => {
    await freshServices();
    const now = new Date();
    const due = (stability: number) => ({ ...(reviewSrs(stability, stability + 1) as SRSReview) });
    const both = makeWord("both", { srs: due(3), srsProduction: { ...due(4), word_id: "both" } });
    const withLearning = makeWord("learn", {
      srs: due(3),
      srsProduction: { word_id: "learn", ease_factor: 2.5, interval: 0, repetitions: 1, state: 1, reps: 1, stability: 0.5, next_review_date: new Date(now.getTime() - MIN).toISOString() },
    });
    const buried = makeWord("buried", { srs: { ...due(3), last_review: now.toISOString(), next_review_date: new Date(now.getTime() + 3 * DAY_MS).toISOString() }, srsProduction: { ...due(4), word_id: "buried" } });
    const withNewRecall = makeWord("recall", {
      srs: due(3),
      srsProduction: { word_id: "recall", ease_factor: 2.5, interval: 0, repetitions: 0, state: 0, reps: 0, next_review_date: new Date(now.getTime() - MIN).toISOString() },
    });
    const limits = { newCardsPerDay: 10, maxSessionSize: 30 };
    const work = summarizeTodayWork([both, withLearning, buried, withNewRecall], { recognition: 0, production: 0 }, now, limits);
    // both: 1 (the other review is buried once one is answered); learn: the learning card goes first and buries
    // the review; buried: 0; recall: the review, then the new recall card (never buried)
    expect(work.reviews).toBe(3);
    expect(work.newToday).toBe(1);
  });

  it("the tray count (countTodayWork) uses the same rules", async () => {
    const { db, srs, smart } = await freshServices();
    const conn = await db.getDatabase();
    const a = await db.insertEnrichedWord(input("alpha"));
    const b = await db.insertEnrichedWord(input("beta"));
    await db.insertEnrichedWord(input("gamma"));
    const past = (d: number) => new Date(Date.now() - d * DAY_MS).toISOString();
    for (const table of ["srs_reviews", "srs_production"]) {
      await conn.execute(
        `INSERT OR REPLACE INTO ${table} (word_id, next_review_date, stability, difficulty, reps, lapses, state, last_review, scheduled_days)
         VALUES ($1, $2, 4, 5, 3, 0, 2, $3, 4)`,
        [a, past(1), past(5)]
      );
    }
    await conn.execute(`UPDATE srs_reviews SET reps = 3, state = 2, stability = 4, scheduled_days = 4, next_review_date = $1, last_review = $2 WHERE word_id = $3`, [
      past(0.5),
      past(4),
      b,
    ]);
    srs.saveStudyLimits({ newCardsPerDay: 10, maxSessionSize: 30 });
    const work = await (await import("@/services/todayWork")).countTodayWork();
    expect(work.reviews).toBe(2); // alpha's two cards count once
    const now = new Date();
    const expected = smart.summarizeTodayWork(await srs.loadTodaySchedules(now), await smart.getNewCardsIntroducedToday(), now);
    expect(work.newToday).toBe(expected.newToday);
  });
});

describe("introductions still new come first (after GĐ1)", () => {
  async function setup() {
    const base = await freshServices();
    const recorder = await import("@/services/reviewRecorder");
    const cards = await import("@/services/cards");
    base.srs.saveStudyLimits({ newCardsPerDay: 3, maxSessionSize: 30 });
    const others: string[] = [];
    for (let i = 0; i < 4; i++) others.push(await base.db.insertEnrichedWord(input(`other${i}`)));
    return { ...base, recorder, cards, others };
  }

  it("a postponed card joins the session once its introduction is a minute old", async () => {
    const { db, smart, recorder, cards, others } = await setup();
    const now = new Date();
    const ready = await db.insertEnrichedWord(input("ready"));
    const tooSoon = await db.insertEnrichedWord(input("toosoon"));
    for (const [id, introAt] of [
      [ready, new Date(now.getTime() - 2 * MIN)],
      [tooSoon, new Date(now.getTime() - 20 * 1000)],
    ] as const) {
      const [w] = await db.getWordsByIds([id]);
      await recorder.recordIntro(cards.toCard(w, "recognition"), introAt);
      await recorder.postponeNewCard(id, "recognition", 10, introAt);
    }
    const counts = await smart.getNewCardsIntroducedToday();
    expect(counts.pending?.size).toBe(2);
    const words = await db.getWordsByIds([...others, ready, tooSoon]);
    const ids = smart.buildReviewSession(words, counts, now).map((c) => c.id);
    expect(ids[0]).toBe(ready);
    expect(ids).not.toContain(tooSoon);
    expect(ids.filter((id) => others.includes(id))).toHaveLength(1); // 3 - 2 already spent today
    // Today still counts both introductions
    expect(smart.summarizeTodayWork(words, counts, now).newToday).toBe(3);
  });

  it("an introduction from yesterday evening, still new, comes first outside today's budget", async () => {
    const { db, smart, recorder, cards, others } = await setup();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const introAt = new Date(startOfToday - MIN);
    if (now.getTime() - introAt.getTime() >= DAY_MS - MIN) return; // 23:59: no "yesterday evening" within 24 hours
    const yesterday = await db.insertEnrichedWord(input("yesterday"));
    const [w] = await db.getWordsByIds([yesterday]);
    await recorder.recordIntro(cards.toCard(w, "recognition"), introAt);
    await recorder.postponeNewCard(yesterday, "recognition", 10, introAt);

    const counts = await smart.getNewCardsIntroducedToday();
    expect(counts.recognition).toBe(0);
    expect(counts.pending?.has(`${yesterday}:recognition`)).toBe(true);
    const words = await db.getWordsByIds([...others, yesterday]);
    const ids = smart.buildReviewSession(words, counts, now).map((c) => c.id);
    expect(ids[0]).toBe(yesterday);
    expect(ids.filter((id) => others.includes(id))).toHaveLength(3); // today's full budget
    expect(smart.summarizeTodayWork(words, counts, now).newToday).toBe(4);
  });

  it("askableCards keeps a card introduced seconds ago (in another window) out", () => {
    const now = new Date();
    const w = makeWord("w1");
    const intros = new Map([["w1:recognition", now.getTime() - 10 * 1000]]);
    expect(askableCards(w, now, { recognition: 1, production: 0, intros })).toHaveLength(0);
    expect(askableCards(w, now, { recognition: 1, production: 0 })).toHaveLength(1);
  });
});

describe("context match never shows words not introduced yet (M16)", () => {
  it("leaves buffer words out", async () => {
    await freshServices();
    saveStudyLimits({ newCardsPerDay: 10, maxSessionSize: 30 });
    const mk = (word: string, srs: Partial<SRSReview>) => makeWord(word, { meaning_vn: `nghĩa ${word}`, examples: ex(word), srs });
    const primary = mk("cache", reviewSrs(5, 2));
    const studied = ["queue", "mutex", "thread"].map((w) => mk(w, reviewSrs(5, 2)));
    const introduced = mk("socket", { last_review: new Date(Date.now() - HOUR).toISOString() });
    const buffer = ["alpha", "beta", "gamma", "delta"].map((w) => mk(w, {}));
    for (let i = 0; i < 10; i++) {
      const pairs = prepareContextMatch(primary, [primary, ...buffer, ...studied, introduced]).map((p) => p.word);
      expect(pairs).toHaveLength(3);
      for (const b of buffer) expect(pairs).not.toContain(b.word);
    }
    // Only buffer words around: no exercise (the caller falls back)
    expect(prepareContextMatch(primary, [primary, ...buffer])).toHaveLength(1);
  });
});
