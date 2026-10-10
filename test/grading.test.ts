import { describe, it, expect } from "vitest";
import { Rating } from "ts-fsrs";
import {
  areConfusable,
  calculateUrgencyScore,
  deriveRating,
  generateMultipleChoiceQuestion,
  newCardAllowance,
  pickExample,
  prepareMeaningMatch,
  ratingFromSentenceGrade,
  selectExerciseType,
  setTypicalResponseTimes,
  slowThresholdMs,
  todayWorkFromCounts,
  splitNewCardBudget,
  calculateXPReward,
  PRACTICE_XP,
} from "@/services/smartReview";
import { schedulingDecision, INTRO_MIN_GAP_MS } from "@/services/reviewRecorder";
import { toCard } from "@/services/cards";
import { buildPlacementQuestions, placementLevel } from "@/services/placement";
import { parseSentenceGrade } from "@/services/ai";
import { preferredTopic } from "@/services/autoReplenish";
import { makeWord, reviewSrs, DAY_MS } from "./helpers";

const syn = (words: string[]) => JSON.stringify(words.map((w) => ({ word: w, meaning_vn: "" })));

describe("grading never rewards speed with Easy", () => {
  it("fast correct answers are Good, wrong are Again, synonyms / hints / typos Hard", () => {
    expect(deriveRating({ exerciseType: "multiple_choice", wrongAttempts: 0, responseTimeMs: 800 })).toBe(Rating.Good);
    expect(deriveRating({ exerciseType: "spelling", wrongAttempts: 0, responseTimeMs: 900 })).toBe(Rating.Good);
    expect(deriveRating({ exerciseType: "spelling", wrongAttempts: 1, responseTimeMs: 900 })).toBe(Rating.Again);
    expect(deriveRating({ exerciseType: "spelling", wrongAttempts: 0, confusedWithSynonym: true, responseTimeMs: 900 })).toBe(Rating.Hard);
  });

  it("uses the learner's own speed for 'too slow' within bounds", () => {
    setTypicalResponseTimes({});
    expect(slowThresholdMs("multiple_choice")).toBe(15000);
    setTypicalResponseTimes({ multiple_choice: 8000 }); // slow reader: 2.5x = 20s
    expect(slowThresholdMs("multiple_choice")).toBe(20000);
    setTypicalResponseTimes({ multiple_choice: 1000 }); // very fast: bounded at 60% of the default
    expect(slowThresholdMs("multiple_choice")).toBe(9000);
    setTypicalResponseTimes({ multiple_choice: 60000 }); // bounded at 150%
    expect(slowThresholdMs("multiple_choice")).toBe(22500);
    setTypicalResponseTimes({});
  });

  it("maps an AI sentence grade to FSRS", () => {
    expect(ratingFromSentenceGrade({ correct: true, score: 90, usesTargetWord: true })).toBe(Rating.Good);
    expect(ratingFromSentenceGrade({ correct: false, score: 70, usesTargetWord: true })).toBe(Rating.Hard);
    expect(ratingFromSentenceGrade({ correct: true, score: 95, usesTargetWord: false })).toBe(Rating.Again);
    expect(parseSentenceGrade('{"correct":true,"score":"88.6","uses_target_word":true,"corrections":[{"wrong":"a","right":"b","why_vn":"x"}]}')).toMatchObject({
      correct: true,
      score: 89,
      corrections: [{ wrong: "a", right: "b", whyVn: "x" }],
    });
  });
});

describe("scheduling decision", () => {
  const due = toCard(makeWord("due", { srs: reviewSrs(3, 4) }), "recognition");
  const notDue = toCard(makeWord("later", { srs: reviewSrs(30, 1) }), "recognition");

  it("only the first answer to a due card through a matching exercise is scheduled", () => {
    expect(schedulingDecision({ card: due, exerciseType: "multiple_choice" })).toEqual({ scheduled: true });
    expect(schedulingDecision({ card: due, exerciseType: "multiple_choice", alreadyGraded: true }).reason).toBe("already_graded");
    expect(schedulingDecision({ card: notDue, exerciseType: "multiple_choice" }).reason).toBe("not_due");
    expect(schedulingDecision({ card: due, exerciseType: "spelling" }).reason).toBe("exercise_mismatch");
    expect(schedulingDecision({ card: due, exerciseType: "sentence_builder" }).reason).toBe("exercise_mismatch");
    expect(schedulingDecision({ card: due, exerciseType: "multiple_choice", practiceMode: true }).reason).toBe("practice_mode");
  });

  it("a quiz seconds after an introduction is practice", () => {
    const fresh = toCard(makeWord("fresh"), "recognition");
    const now = new Date();
    expect(
      schedulingDecision({ card: fresh, exerciseType: "multiple_choice", introducedAt: now.getTime() - 5000, now }).reason
    ).toBe("intro_too_recent");
    expect(
      schedulingDecision({ card: fresh, exerciseType: "multiple_choice", introducedAt: now.getTime() - INTRO_MIN_GAP_MS - 1, now }).scheduled
    ).toBe(true);
  });

  it("suspended words are never scheduled", () => {
    const suspended = toCard(makeWord("s", { srs: reviewSrs(3, 4), suspended: 1 }), "recognition");
    expect(schedulingDecision({ card: suspended, exerciseType: "multiple_choice" }).reason).toBe("suspended");
  });
});

describe("distractors never include synonyms", () => {
  const rapid = makeWord("rapid", { topic: "Tech", meaning_vn: "Nhanh chóng, diễn ra dồn dập", synonyms: syn(["quick"]) });
  const fast = makeWord("fast", { topic: "Tech", meaning_vn: "Nhanh, có tốc độ cao" });
  const quick = makeWord("quick", { topic: "Tech", meaning_vn: "Mau lẹ" });
  const others = ["deploy", "cache", "queue", "mutex"].map((w, i) => makeWord(w, { topic: "Tech", meaning_vn: `nghĩa ${i} khác` }));

  it("detects synonyms by relation and by shared sense", () => {
    expect(areConfusable(rapid, quick)).toBe(true); // listed synonym
    expect(areConfusable(rapid, fast)).toBe(true); // "nhanh" ⊂ "nhanh chóng"
    expect(areConfusable(rapid, others[0])).toBe(false);
  });

  it("multiple choice and matching leave confusable words out", () => {
    for (let i = 0; i < 20; i++) {
      const words = generateMultipleChoiceQuestion(rapid, [rapid, fast, quick, ...others], "vn_to_en").options.map((o) => o.text);
      expect(words).not.toContain("fast");
      expect(words).not.toContain("quick");
      const pairs = prepareMeaningMatch(rapid, [rapid, fast, quick, ...others]).map((p) => p.word);
      expect(pairs).not.toContain("fast");
      expect(pairs).not.toContain("quick");
    }
  });

  it("matching never shows words still to come in the session", () => {
    const pairs = prepareMeaningMatch(others[0], others, new Set([others[1].id]));
    expect(pairs.map((p) => p.wordId)).not.toContain(others[1].id);
  });
});

describe("exercise choice follows memory strength and direction", () => {
  const ex = { examples: [{ id: "e", word_id: "w", sentence_en: "We cache results.", grammar_analysis: "" }] };

  it("recognition: young cards get multiple choice; recall climbs a ladder: letter tiles, cloze, then spelling", () => {
    const young = toCard(makeWord("cache", { ...ex, srs: reviewSrs(1.5, 2) }), "recognition");
    for (let i = 0; i < 10; i++) expect(selectExerciseType(young)).toBe("multiple_choice");
    const recallNew = toCard(
      makeWord("cache", { ...ex, srs: reviewSrs(10, 2), srsProduction: { word_id: "cache", ease_factor: 2.5, interval: 0, repetitions: 0, state: 0, reps: 0, next_review_date: new Date().toISOString() } }),
      "production"
    );
    expect(selectExerciseType(recallNew)).toBe("letter_tiles");
    const recallVeryYoung = toCard(
      makeWord("cache", { ...ex, srs: reviewSrs(10, 2), srsProduction: { ...(reviewSrs(1, 1) as never), word_id: "cache" } }),
      "production"
    );
    expect(selectExerciseType(recallVeryYoung)).toBe("letter_tiles");
    const recallYoung = toCard(
      makeWord("cache", { ...ex, srs: reviewSrs(10, 2), srsProduction: { ...(reviewSrs(4, 2) as never), word_id: "cache" } }),
      "production"
    );
    for (let i = 0; i < 10; i++) expect(selectExerciseType(recallYoung)).toBe("cloze");
    const recallMature = toCard(
      makeWord("cache", { ...ex, srs: reviewSrs(60, 2), srsProduction: { ...(reviewSrs(40, 1) as never), word_id: "cache" } }),
      "production"
    );
    for (let i = 0; i < 10; i++) expect(selectExerciseType(recallMature)).toBe("spelling");
  });

  it("picks formats deterministically, rotating with the review count", () => {
    const at = (reps: number) =>
      toCard(makeWord("cache", { ...ex, srs: { ...reviewSrs(10, reps), reps } as never }), "recognition");
    expect(selectExerciseType(at(4))).toBe(selectExerciseType(at(4)));
    const seen = new Set([0, 1, 2, 3].map((r) => selectExerciseType(at(r))));
    expect(seen.size).toBe(4);
  });

  it("never picks sentence building (practice only)", () => {
    const mature = toCard(makeWord("cache", { ...ex, srs: reviewSrs(40, 2) }), "recognition");
    for (let i = 0; i < 50; i++) expect(selectExerciseType(mature)).not.toBe("sentence_builder");
  });

  it("rotates examples, the learner's own sentence first", () => {
    const w = makeWord("cache", {
      examples: [
        { id: "a", word_id: "cache", sentence_en: "AI sentence with cache.", grammar_analysis: "" },
        { id: "u", word_id: "cache", sentence_en: "My own cache sentence.", grammar_analysis: "", source: "user_context" },
        { id: "x", word_id: "cache", sentence_en: "No target word here.", grammar_analysis: "" },
      ],
    });
    expect(pickExample(w, 0)?.id).toBe("u");
    expect(pickExample(w, 1)?.id).toBe("a");
    expect(pickExample(w, 2)?.id).toBe("u");
  });
});

describe("review priority and new-card allowance", () => {
  it("prefers a card about to be lost over one long forgotten or one very stable", () => {
    const now = new Date();
    const dueNow = makeWord("dueNow", { srs: reviewSrs(3, 3) });
    const longLost = makeWord("lost", { srs: reviewSrs(3, 90) });
    const stable = makeWord("stable", { srs: reviewSrs(200, 200) });
    const score = (w: typeof dueNow) => calculateUrgencyScore(w, now).urgencyScore;
    expect(score(dueNow)).toBeGreaterThan(score(longLost));
    expect(score(dueNow)).toBeGreaterThan(score(stable));
    const learning = makeWord("learn", { srs: { state: 1, reps: 1, stability: 0.5, next_review_date: new Date(Date.now() - 60000).toISOString(), last_review: new Date(Date.now() - 11 * 60000).toISOString() } });
    expect(score(learning)).toBeGreaterThan(score(dueNow));
  });

  it("limits new cards as the review backlog grows", () => {
    expect(newCardAllowance(5, 30)).toBe(25);
    expect(newCardAllowance(28, 30)).toBe(6);
    expect(newCardAllowance(50, 30)).toBe(6);
    expect(newCardAllowance(61, 30)).toBe(0);
  });

  it("counts today's work with one new-card budget for both directions", () => {
    // 10 a day, 7 already introduced: 3 left, shared between new words and new recall cards
    expect(todayWorkFromCounts({ reviews: 4, newWaiting: 36, newRecallWaiting: 3 }, { recognition: 7, production: 0 }, 10)).toEqual({
      reviews: 4,
      newToday: 3,
      total: 7,
    });
  });

  it("splits the daily new-card budget: new words get at least half, leftovers go to the other side", () => {
    const none = { recognition: 0, production: 0 };
    expect(splitNewCardBudget(10, none, { recognition: 20, production: 20 })).toEqual({ recognition: 5, production: 5 });
    expect(splitNewCardBudget(10, none, { recognition: 20, production: 3 })).toEqual({ recognition: 7, production: 3 });
    expect(splitNewCardBudget(10, none, { recognition: 2, production: 20 })).toEqual({ recognition: 2, production: 8 });
    expect(splitNewCardBudget(5, { recognition: 3, production: 2 }, { recognition: 9, production: 9 })).toEqual(none);
    expect(splitNewCardBudget(1, none, { recognition: 1, production: 1 })).toEqual({ recognition: 1, production: 0 });
  });
});

describe("XP rewards remembering", () => {
  it("nothing for Again, a token for practice, bonus for recall and for fading memories", () => {
    expect(calculateXPReward({ rating: Rating.Again, exerciseType: "spelling", scheduled: true, direction: "production" }).totalXP).toBe(0);
    expect(calculateXPReward({ rating: Rating.Good, exerciseType: "multiple_choice", scheduled: false, direction: "recognition" }).totalXP).toBe(PRACTICE_XP);
    const plain = calculateXPReward({ rating: Rating.Good, exerciseType: "multiple_choice", scheduled: true, direction: "recognition", retrievabilityBefore: 0.92 });
    const fading = calculateXPReward({ rating: Rating.Good, exerciseType: "multiple_choice", scheduled: true, direction: "recognition", retrievabilityBefore: 0.7 });
    expect(fading.totalXP).toBeGreaterThan(plain.totalXP);
  });
});

describe("placement and topic", () => {
  it("places at the first level not passed", () => {
    expect(placementLevel({})).toBe("A1");
    expect(placementLevel({ A1: 5, A2: 4, B1: 2 })).toBe("B1");
    expect(placementLevel({ A1: 5, A2: 5, B1: 5, B2: 5, C1: 5 })).toBe("C1");
    const qs = buildPlacementQuestions();
    expect(qs).toHaveLength(25);
    for (const q of qs) expect(q.options).toContain(q.answer);
  });

  it("auto-replenish follows the learner's own topics", () => {
    const words = [
      ...["a", "b", "c"].map((w) => makeWord(w, { topic: "Database & Storage" })),
      makeWord("d", { topic: "General Tech" }),
    ];
    expect(preferredTopic(words)).toBe("Database & Storage");
    expect(preferredTopic([makeWord("x", { topic: "General Tech" })])).toContain("Software");
  });
});

void DAY_MS;
