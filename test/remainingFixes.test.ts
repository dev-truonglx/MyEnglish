import { describe, it, expect } from "vitest";
import { Rating } from "ts-fsrs";
import { nextMetMilestone, startOfLocalWeek } from "@/services/progress";
import { defaultHighFirst, isHighFirstMix, levelWeights, pickLevelSequence, setStudyLevels } from "@/services/vocabFeed";
import { popupMcExercise, popupMcVariant } from "@/services/popupSession";
import { practiceExerciseType } from "@/services/practicePicker";
import { celebrationFor, countOvernightRecall, praiseWord, PRAISE_WORDS } from "@/services/celebrations";
import { isFirstOvernightRecall } from "@/services/reviewRecorder";
import { toCard } from "@/services/cards";
import { makeWord, reviewSrs, freshServices, DAY_MS } from "./helpers";

describe("B3: Today counts down to a near milestone", () => {
  it("aims at the next round number of words met, at most the level's size", () => {
    expect(nextMetMilestone(0, 911)).toBe(10);
    expect(nextMetMilestone(10, 911)).toBe(25);
    expect(nextMetMilestone(120, 911)).toBe(150);
    expect(nextMetMilestone(1000, 2000)).toBe(1250);
    expect(nextMetMilestone(900, 911)).toBe(911);
    expect(nextMetMilestone(911, 911)).toBeNull();
  });

  it("counts this week's new words from Monday", async () => {
    const { smart, db } = await freshServices();
    const { countNewWordsSince } = await import("@/services/progress");
    const ids: Record<string, string> = {};
    for (const w of ["a", "b", "c", "d", "e"]) {
      ids[w] = await db.insertEnrichedWord({ word: `word${w}`, meaning_vn: "nghĩa", synonyms: [], antonyms: [], examples: [] });
    }
    const monday = startOfLocalWeek(new Date(2026, 9, 22, 15)); // Thursday 22/10/2026
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(19);
    const log = (wordId: string, exerciseType: "intro" | "known" | "multiple_choice", at: Date, stateBefore = 0) =>
      smart.saveReviewLog({
        wordId: ids[wordId], exerciseType, responseTimeMs: 0, isCorrect: true, wrongAttempts: 0, rating: 0, xpEarned: 0,
        timestamp: at.toISOString(), isScheduled: false,
        before: { state: stateBefore, stability: 0, difficulty: 0, retrievability: null, elapsedDays: null },
      });
    await log("a", "intro", new Date(2026, 9, 20, 9));
    await log("a", "intro", new Date(2026, 9, 20, 9, 5)); // the same word twice: once
    await log("b", "intro", new Date(2026, 9, 21, 9));
    await log("c", "intro", new Date(2026, 9, 21, 9), 3); // a leech relearned: not new
    await log("d", "known", new Date(2026, 9, 21, 9)); // marked known: not learnt
    await log("e", "intro", new Date(2026, 9, 18, 9)); // last week
    expect(await countNewWordsSince(monday)).toBe(2);
  });
});

describe("B4: a learner placed at B1 or above gets their own level first", () => {
  it("reverses the mix weights and the ties", () => {
    expect([...levelWeights(["A1", "A2", "B1", "B2"], false).values()]).toEqual([4, 3, 2, 1]);
    expect([...levelWeights(["A1", "A2", "B1", "B2"], true).values()]).toEqual([1, 2, 3, 4]);
    const seq = pickLevelSequence(["A1", "A2", "B1", "B2"], {}, { A1: 99, A2: 99, B1: 99, B2: 99 }, 10, true);
    expect(seq[0]).toBe("B2");
    const count = (l: string) => seq.filter((x) => x === l).length;
    expect(count("B2")).toBeGreaterThan(count("A1"));
    expect(count("A1")).toBe(1);
  });

  it("defaults by placement and keeps the choice when the levels change", () => {
    expect(defaultHighFirst("A2")).toBe(false);
    expect(defaultHighFirst("B1")).toBe(true);
    expect(defaultHighFirst("C1")).toBe(true);
    expect(defaultHighFirst(null)).toBe(false);
    setStudyLevels(["A1", "A2", "B1"], { highFirst: true });
    expect(isHighFirstMix()).toBe(true);
    setStudyLevels(["A1", "A2"]);
    expect(isHighFirstMix()).toBe(true);
    setStudyLevels(["A1", "A2"], { highFirst: false });
    expect(isHighFirstMix()).toBe(false);
  });
});

const sentence = [{ id: "e1", word_id: "w", sentence_en: "We deploy every Friday.", sentence_vn: "", grammar_analysis: "" }];

describe("B9: more than one way to ask", () => {
  const known = (id: string, stability: number, reps: number) =>
    toCard(makeWord(id, { word: "deploy", examples: sentence as never, srs: reviewSrs(stability, 1, { reps }) }), "recognition");

  it("popup: young cards stay English → Vietnamese, known cards rotate, by ear only with a voice and from 7 days", () => {
    const young = toCard(makeWord("y", { srs: { state: 1, reps: 1, stability: 0.5 } }), "recognition");
    expect(popupMcVariant(young, true)).toBe("en_to_vn");
    const variants = new Set([3, 4, 5].map((reps) => popupMcVariant(known("k", 10, reps), true)));
    expect(variants).toEqual(new Set(["en_to_vn", "vn_to_en", "listen"]));
    expect([3, 4, 5].map((reps) => popupMcVariant(known("k", 10, reps), false))).not.toContain("listen");
    expect([3, 4, 5].map((reps) => popupMcVariant(known("k", 4, reps), true))).not.toContain("listen");
    expect(popupMcExercise("listen")).toBe("listening");
    expect(popupMcExercise("vn_to_en")).toBe("multiple_choice");
  });

  it("practice: recognition formats rotate with the seed, recall keeps its ladder", () => {
    const card = known("k", 10, 3);
    const formats = new Set(Array.from({ length: 10 }, (_, i) => practiceExerciseType(card, i, true)));
    expect(formats.size).toBeGreaterThanOrEqual(4);
    const young = toCard(makeWord("y", { srs: { state: 1, reps: 1, stability: 0.5 } }), "recognition");
    const youngFormats = new Set(Array.from({ length: 6 }, (_, i) => practiceExerciseType(young, i, true)));
    expect(youngFormats.has("listening")).toBe(false);
    expect(youngFormats.size).toBeGreaterThanOrEqual(2);
    const recall = toCard(makeWord("p", { srs: reviewSrs(10, 1), srsProduction: { ...reviewSrs(1, 1), word_id: "p" } as never }), "production");
    expect(new Set([0, 1, 2].map((i) => practiceExerciseType(recall, i, true)))).toEqual(new Set(["letter_tiles"]));
  });
});

describe("B13: early wins and varied praise", () => {
  it("celebrates the first word remembered overnight, then round numbers", () => {
    expect(celebrationFor({ mastered: false, rescued: false, direction: "recognition", word: "cache", overnightCount: 1 })?.kind).toBe("overnight");
    expect(celebrationFor({ mastered: false, rescued: false, direction: "recognition", word: "cache", overnightCount: 10 })?.title).toContain("10");
    expect(celebrationFor({ mastered: false, rescued: false, direction: "recognition", word: "cache", overnightCount: 7 })).toBeNull();
    // A bigger moment wins
    expect(celebrationFor({ mastered: true, rescued: false, direction: "recognition", word: "cache", overnightCount: 1 })?.kind).toBe("mastered");
    expect(countOvernightRecall()).toBe(1);
    expect(countOvernightRecall()).toBe(2);
  });

  it("an overnight recall is a young word remembered on a later day than its last review", () => {
    const now = new Date(2026, 9, 22, 9);
    const yesterday = new Date(now.getTime() - DAY_MS).toISOString();
    const before = { state: 2, stability: 2.3, difficulty: 5, retrievability: 0.9, elapsedDays: 1 };
    const card = toCard(makeWord("w", { srs: { state: 2, reps: 2, lapses: 0, stability: 2.3, last_review: yesterday } }), "recognition");
    expect(isFirstOvernightRecall(card, Rating.Good, before, now)).toBe(true);
    expect(isFirstOvernightRecall(card, Rating.Again, before, now)).toBe(false);
    const sameDay = toCard(makeWord("w", { srs: { state: 1, reps: 1, stability: 2.3, last_review: new Date(now.getTime() - 3600e3).toISOString() } }), "recognition");
    expect(isFirstOvernightRecall(sameDay, Rating.Good, before, now)).toBe(false);
    const older = toCard(makeWord("w", { srs: { state: 2, reps: 4, stability: 2.3, last_review: yesterday } }), "recognition");
    expect(isFirstOvernightRecall(older, Rating.Good, before, now)).toBe(false);
    expect(isFirstOvernightRecall(card, Rating.Good, { ...before, stability: 8 }, now)).toBe(false);
  });

  it("varies the word of praise between answers", () => {
    expect(new Set([0, 1, 2, 3].map(praiseWord)).size).toBe(4);
    expect(PRAISE_WORDS).toContain(praiseWord(123));
  });
});
