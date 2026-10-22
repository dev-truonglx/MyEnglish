import { describe, it, expect } from "vitest";
import { Rating } from "ts-fsrs";
import { buildPopupChoices, buildPopupListenChoices, needsIntro, popupAnswerRating, selectSmartPopupMode } from "@/services/popupSession";
import { toCard } from "@/services/cards";
import { generateMultipleChoiceQuestion, selectExerciseType } from "@/services/smartReview";
import {
  getIgnoredNudgeCount,
  getReminderSettings,
  ignoredNudgeSnoozeMinutes,
  resetIgnoredNudges,
  saveReminderSettings,
  snoozeIgnoredNudge,
} from "@/services/reminderSettings";
import { makeWord, reviewSrs } from "./helpers";

describe("#1 new words are introduced before being quizzed", () => {
  it("needs an intro only for a brand-new recognition card", () => {
    expect(needsIntro(toCard(makeWord("fresh"), "recognition"))).toBe(true);
    expect(needsIntro(toCard(makeWord("known", { srs: reviewSrs(5, 2) }), "recognition"))).toBe(false);
    // A new recall card belongs to a word already learned by recognition
    const recall = makeWord("recall", {
      srs: reviewSrs(5, 2),
      srsProduction: { ...(makeWord("recall").srs as never), word_id: "recall" },
    });
    expect(needsIntro(toCard(recall, "production"))).toBe(false);
  });

  it("flashcard sessions show a new word as a flip card, never a quiz", () => {
    const withExample = { examples: [{ id: "e", word_id: "w", sentence_en: "We cache results.", grammar_analysis: "" }] };
    const card = toCard(makeWord("w", withExample), "recognition");
    for (let i = 0; i < 30; i++) expect(selectExerciseType(card)).toBe("flip");
  });
});

describe("#2 plausible distractors", () => {
  const target = makeWord("deploy", { topic: "DevOps", part_of_speech: "verb", meaning_vn: "triển khai" });
  const pool = [
    target,
    makeWord("release", { topic: "DevOps", part_of_speech: "verb", meaning_vn: "phát hành" }),
    makeWord("rollback", { topic: "DevOps", part_of_speech: "verb", meaning_vn: "hoàn tác" }),
    makeWord("pipeline", { topic: "DevOps", part_of_speech: "noun", meaning_vn: "luồng xử lý" }),
    makeWord("compile", { topic: "Coding", part_of_speech: "verb", meaning_vn: "biên dịch" }),
    makeWord("banana", { topic: "Food", part_of_speech: "noun", meaning_vn: "quả chuối" }),
    makeWord("apple", { topic: "Food", part_of_speech: "noun", meaning_vn: "quả táo" }),
  ];

  it("prefers same topic, then same part of speech", () => {
    for (let i = 0; i < 20; i++) {
      const words = buildPopupChoices(target, pool).map((c) => c.word).sort();
      expect(words).toEqual(["deploy", "pipeline", "release", "rollback"]);
    }
  });

  it("has exactly one correct option and no duplicates", () => {
    const choices = buildPopupChoices(target, pool);
    expect(choices).toHaveLength(4);
    expect(choices.filter((c) => c.isCorrect).map((c) => c.word)).toEqual(["deploy"]);
    expect(new Set(choices.map((c) => c.word.toLowerCase())).size).toBe(4);
  });

  it("falls back to filler options in a tiny deck", () => {
    const choices = buildPopupChoices(target, [target]);
    expect(choices).toHaveLength(4);
    expect(choices.filter((c) => c.isCorrect)).toHaveLength(1);
  });

  it("skips distractors whose meaning looks identical (EN -> VN)", () => {
    const twin = makeWord("ship", { topic: "DevOps", meaning_vn: "triển khai" });
    const q = generateMultipleChoiceQuestion(target, [target, twin, ...pool.slice(1)], "en_to_vn");
    expect(q.options.filter((o) => o.text.toLowerCase() === "triển khai")).toHaveLength(1);
  });
});

describe("#3 popup answers are graded like flashcards", () => {
  it.each([
    [false, "multiple_choice", 2000, false, Rating.Again],
    [true, "multiple_choice", 2000, false, Rating.Good],
    [true, "multiple_choice", 16000, false, Rating.Good], // slow but right: still Good
    [true, "spelling", 5000, true, Rating.Hard],
    [true, "spelling", 5000, false, Rating.Good],
    [true, "spelling", 21000, false, Rating.Good],
  ] as const)("correct=%s %s %ims nearMiss=%s -> %i", (correct, type, ms, near, expected) => {
    expect(popupAnswerRating(correct, type, ms, near)).toBe(expected);
  });

  it("never grades Easy automatically", () => {
    expect(popupAnswerRating(true, "multiple_choice", 300)).toBe(Rating.Good);
  });

  it("the typing hint makes a right answer Hard, as in flashcard sessions", () => {
    expect(popupAnswerRating(true, "cloze", 3000, false, false, true)).toBe(Rating.Hard);
    expect(popupAnswerRating(false, "cloze", 3000, false, false, true)).toBe(Rating.Again);
  });
});

describe("#6 ignored reminders back off", () => {
  it("doubles the wait from the reminder interval, and stays under 4 hours", () => {
    expect([0, 1, 2, 3, 4].map((n) => ignoredNudgeSnoozeMinutes(n, 10, 60))).toEqual([60, 120, 240, 240, 240]);
    expect([0, 1, 2, 3, 4].map((n) => ignoredNudgeSnoozeMinutes(n, 10, 0))).toEqual([10, 20, 40, 80, 80]); // reminders disabled: the snooze is the base
    expect(ignoredNudgeSnoozeMinutes(5, 10, 120)).toBe(240); // no overflow on long streaks
  });

  it("grows while ignored and resets once the user answers", () => {
    saveReminderSettings({ snoozeMinutes: 10, intervalMinutes: 30 });
    const t0 = Date.now();
    expect(snoozeIgnoredNudge()).toBe(30);
    expect(snoozeIgnoredNudge()).toBe(60);
    expect(snoozeIgnoredNudge()).toBe(120);
    expect(getIgnoredNudgeCount()).toBe(3);
    const until = getReminderSettings().snoozedUntil!;
    expect(until - t0).toBeGreaterThanOrEqual(120 * 60 * 1000);
    expect(until - t0).toBeLessThan(121 * 60 * 1000);

    resetIgnoredNudges();
    expect(getIgnoredNudgeCount()).toBe(0);
    expect(snoozeIgnoredNudge()).toBe(30);
  });
});

describe("#7 smart popup exercise mode ladder", () => {
  const recall = (word: string, srs: Partial<import("@/types/database").SRSReview>, extra = {}) =>
    toCard(
      makeWord(word, { srs: reviewSrs(10, 2), srsProduction: { ...(srs as never), word_id: word }, ...extra }),
      "production"
    );

  it("asks recognition cards as multiple choice, whatever their state", () => {
    expect(selectSmartPopupMode(toCard(makeWord("fresh"), "recognition"))).toBe("multiple_choice");
    const learning = makeWord("have to", {
      srs: { state: 1, reps: 1, lapses: 0, stability: 1.29, difficulty: 5, next_review_date: new Date().toISOString() },
    });
    expect(selectSmartPopupMode(toCard(learning, "recognition"))).toBe("multiple_choice");
    expect(selectSmartPopupMode(toCard(makeWord("mature", { srs: reviewSrs(40, 3) }), "recognition"))).toBe(
      "multiple_choice"
    );
  });

  it("recall cards: letter tiles while new or weak, typing once the memory has some strength", () => {
    expect(selectSmartPopupMode(recall("fresh", { state: 0, reps: 0, next_review_date: new Date().toISOString() }))).toBe(
      "letter_tiles"
    );
    expect(selectSmartPopupMode(recall("young", reviewSrs(1, 1)))).toBe("letter_tiles");
    expect(selectSmartPopupMode(recall("mature", reviewSrs(5, 3)))).toBe("typing");
    expect(selectSmartPopupMode(recall("leech", reviewSrs(1, 4, { lapses: 5 })))).toBe("letter_tiles");
  });

  it("a recall card failed at the tiles stage gets tiles again, not typing", () => {
    const failedTiles = recall("so", {
      state: 1, reps: 1, lapses: 0, stability: 0.21, difficulty: 7, next_review_date: new Date().toISOString(),
    });
    expect(selectSmartPopupMode(failedTiles)).toBe("letter_tiles");
    // Relearning a word whose memory is still fairly strong: typing
    const relearningStrong = recall("cache", {
      state: 3, reps: 6, lapses: 1, stability: 3, difficulty: 6, next_review_date: new Date().toISOString(),
    });
    expect(selectSmartPopupMode(relearningStrong)).toBe("typing");
  });

  it("a Learning card answered Hard moves on and graduates instead of repeating its step", async () => {
    const { freshServices } = await import("./helpers");
    const { db, srs } = await freshServices();
    const id = await db.insertEnrichedWord({
      word: "have to",
      meaning_vn: "phải",
      synonyms: [],
      antonyms: [],
      examples: [],
    });

    // New word, multiple choice, right on the first try -> Good -> Learning (second step)
    const step1 = await srs.recordReview(id, popupAnswerRating(true, "multiple_choice", 3000), "recognition");
    expect(step1.state).toBe(1);

    // Next session: right but with the hint -> Hard. ts-fsrs alone would keep the card on the same step
    // (back in a few minutes, i.e. practice), so it would never leave Learning.
    const step2 = await srs.recordReview(id, popupAnswerRating(true, "spelling", 3000, false, false, true), "recognition");
    expect(step2.state).toBe(2);
    expect(step2.scheduled_days).toBeGreaterThanOrEqual(1);
  });

  it("auto-repairs cards previously trapped in State.Learning by old letter_tiles Hard loop on initSchema", async () => {
    const { freshServices } = await import("./helpers");
    const { db } = await freshServices();
    const conn = await db.getDatabase();
    const id = await db.insertEnrichedWord({
      word: "so",
      meaning_vn: "vì vậy",
      synonyms: [],
      antonyms: [],
      examples: [],
    });
    await conn.execute(
      `UPDATE srs_reviews
       SET state = 1, reps = 10, lapses = 0, stability = 0.42, difficulty = 9.86, learning_steps = 1,
           last_review = '2026-10-13T03:40:46.892Z', next_review_date = '2026-10-13T03:46:46.892Z'
       WHERE word_id = $1`,
      [id]
    );
    // An install upgraded from before the one-time repair
    await conn.execute(`DELETE FROM app_kv WHERE key = 'repair_stuck_learning_v1'`);
    await db.initSchema(conn);
    const [repaired] = await db.getWordsByIds([id]);
    expect(repaired.srs.state).toBe(2);
    expect(repaired.srs.stability).toBeGreaterThanOrEqual(3);
    expect(repaired.srs.difficulty).toBe(5);
    expect(repaired.srs.scheduled_days).toBe(3);
  });

  it("does not repeat the repair on later launches (a genuine lapse stays in Relearning)", async () => {
    const { freshServices } = await import("./helpers");
    const { db } = await freshServices();
    const conn = await db.getDatabase();
    await db.initSchema(conn); // first launch of the repaired build: runs once
    const id = await db.insertEnrichedWord({
      word: "so",
      meaning_vn: "vì vậy",
      synonyms: [],
      antonyms: [],
      examples: [],
    });
    await conn.execute(
      `UPDATE srs_reviews
       SET state = 3, reps = 6, lapses = 1, stability = 0.8, difficulty = 7, learning_steps = 0,
           last_review = '2026-10-13T03:40:46.892Z', next_review_date = '2026-10-13T03:50:46.892Z'
       WHERE word_id = $1`,
      [id]
    );
    await db.initSchema(conn); // e.g. the popup window opening
    const [card] = await db.getWordsByIds([id]);
    expect(card.srs.state).toBe(3);
    expect(card.srs.next_review_date).toBe("2026-10-13T03:50:46.892Z");
  });
});

describe("buildPopupListenChoices", () => {
  const sound = (word: string, ipa: string, vn: string) => ({
    id: `catalog:${word}`, word, meaning_vn: vn, synonyms: "[]", phonetic: ipa, part_of_speech: "noun", cefr_level: "A1", catalog_id: word,
  });
  const deck = [
    sound("ship", "/ʃɪp/", "con tàu"),
    sound("sheep", "/ʃiːp/", "con cừu"),
    sound("chip", "/tʃɪp/", "khoai tây chiên"),
    sound("shop", "/ʃɑːp/", "cửa hàng"),
    sound("banana", "/bəˈnænə/", "quả chuối"),
  ];
  const ship = makeWord("w-ship", { word: "ship", meaning_vn: "con tàu", phonetic: "/ʃɪp/", catalog_id: "ship", srs: reviewSrs(30, 6) });

  it("offers the meanings of the deck words that sound like the word heard, with their word and IPA", () => {
    const choices = buildPopupListenChoices(ship, deck, []);
    expect(choices.map((c) => c.english).sort()).toEqual(["chip", "sheep", "ship", "shop"]);
    expect(choices.find((c) => c.isCorrect)).toMatchObject({ word: "Con tàu", english: "ship", phonetic: "/ʃɪp/" });
    expect(choices.find((c) => c.english === "sheep")).toMatchObject({ word: "Con cừu", phonetic: "/ʃiːp/", isCorrect: false });
  });

  it("fills from the session's words when too few sound alike, never with a homophone", () => {
    const pool = [
      makeWord("w-a", { word: "alpha", meaning_vn: "nghĩa a" }),
      makeWord("w-b", { word: "bravo", meaning_vn: "nghĩa b" }),
      makeWord("w-same", { word: "shipp", meaning_vn: "đồng âm", phonetic: "/ʃɪp/" }),
    ];
    const choices = buildPopupListenChoices(ship, [deck[0], deck[4]], pool);
    expect(choices).toHaveLength(4);
    expect(choices.map((c) => c.english)).not.toContain("shipp");
  });
});
