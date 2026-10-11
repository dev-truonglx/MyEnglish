import { describe, it, expect } from "vitest";
import { Rating } from "ts-fsrs";
import {
  answerReadings,
  isGrammarAnswerCorrect,
  matchTypedAnswer,
  normalizeTypedText,
  todayWorkFromCounts,
} from "@/services/smartReview";
import { gradeMistakeAnswer, normalizeMistakeText } from "@/services/mistakes";
import { freshServices } from "./helpers";

const input = (word: string) => ({
  word,
  meaning_vn: "nghĩa của " + word,
  synonyms: [],
  antonyms: [],
  examples: [{ sentence_en: `The ${word} works.`, grammar_analysis: "S + V" }],
});

const MIN = 60 * 1000;

describe("new words introduced today whose first quiz was postponed (P1)", () => {
  async function setup(newCardsPerDay: number) {
    const base = await freshServices();
    const recorder = await import("@/services/reviewRecorder");
    const cards = await import("@/services/cards");
    base.srs.saveStudyLimits({ newCardsPerDay, maxSessionSize: 30 });
    // Inserted first: the other new words are older and would come first by date
    const others: string[] = [];
    for (let i = 0; i < 3; i++) others.push(await base.db.insertEnrichedWord(input(`other${i}`)));
    const introduced: string[] = [];
    for (let i = 0; i < 5; i++) introduced.push(await base.db.insertEnrichedWord(input(`intro${i}`)));
    // Intro card shown, then the quiz came too soon: postponed, still new
    for (const word of await base.db.getWordsByIds(introduced)) {
      await recorder.recordIntro(cards.toCard(word, "recognition"));
      await recorder.postponeNewCard(word.id, "recognition", 10);
    }
    const words = await base.db.getWordsByIds([...others, ...introduced]);
    return { ...base, recorder, others, introduced, words };
  }

  it("spend the budget once: the next session still has them, and Today still counts them", async () => {
    const { db, smart, srs, introduced, words } = await setup(5);
    const counts = await smart.getNewCardsIntroducedToday();
    expect(counts.recognition).toBe(5);
    expect([...(counts.pending?.keys() ?? [])].sort()).toEqual(introduced.map((id) => `${id}:recognition`).sort());

    const later = new Date(Date.now() + 11 * MIN);
    const session = smart.buildReviewSession(words, counts, later);
    expect(session.map((c) => c.id).sort()).toEqual([...introduced].sort()); // no other new word: budget spent
    expect(session.every((c) => c.direction === "recognition")).toBe(true);

    // Today: still 5 to do, before and after the postponement is over (DB counts and in-memory words)
    const now = new Date();
    for (const at of [now, later]) {
      expect(todayWorkFromCounts(await db.countDueCards(at), counts, 5, at).newToday).toBe(5);
      expect(smart.summarizeTodayWork(words, counts, at).newToday).toBe(5);
    }

    // Graded: no longer pending, the budget stays spent
    await srs.recordReview(introduced[0], Rating.Good);
    const after = await smart.getNewCardsIntroducedToday();
    expect(after.recognition).toBe(5);
    expect(after.pending?.size).toBe(4);
    expect(after.pending?.has(`${introduced[0]}:recognition`)).toBe(false);
  });

  it("come before new words not introduced yet", async () => {
    const { db, smart, introduced, others, words } = await setup(8);
    const counts = await smart.getNewCardsIntroducedToday();
    const later = new Date(Date.now() + 11 * MIN);
    const ids = smart.buildReviewSession(words, counts, later).map((c) => c.id);
    expect(ids.slice(0, 5).sort()).toEqual([...introduced].sort());
    expect(ids.slice(5).sort()).toEqual([...others].sort()); // 8 - 5 already spent
    expect(todayWorkFromCounts(await db.countDueCards(later), counts, 8, later).newToday).toBe(8);
    expect(smart.summarizeTodayWork(words, counts, later).newToday).toBe(8);
  });

  it("are left out of a comeback session (reviews only)", async () => {
    const { smart, words } = await setup(5);
    const counts = await smart.getNewCardsIntroducedToday();
    expect(smart.buildReviewSession(words, counts, new Date(Date.now() + 11 * MIN), { noNewCards: true })).toEqual([]);
  });

  it("a word marked known is neither counted nor pending", async () => {
    const { smart, recorder, introduced } = await setup(5);
    expect(await recorder.markWordKnown(introduced[0])).toBe(true);
    const counts = await smart.getNewCardsIntroducedToday();
    expect(counts.recognition).toBe(4);
    expect(counts.pending?.size).toBe(4);
    expect(counts.pending?.has(`${introduced[0]}:recognition`)).toBe(false);
  });
});

describe("hyphens in typed answers (M10/G4)", () => {
  it("turns hyphens and dashes into spaces", () => {
    expect(normalizeTypedText("long-term")).toBe("long term");
    expect(normalizeTypedText("Well–being")).toBe("well being");
    expect(normalizeTypedText("It works — finally.")).toBe("it works finally");
  });

  it.each([
    ["long term", "long-term"],
    ["longterm", "long-term"],
    ["Long-Term", "long-term"],
    ["well being", "well-being"],
    ["twenty one", "twenty-one"],
    ["twentyone", "twenty-one"],
    ["e-mail", "email"],
    ["email", "e-mail"],
    ["t-shirts", "t-shirt"],
    ["t shirts", "t-shirt"],
  ])("vocabulary: %s vs %s is exact", (typed, target) => {
    expect(matchTypedAnswer(typed, target)).toBe("exact");
  });

  it("only a hyphen joins words; contractions still work", () => {
    expect(matchTypedAnswer("everyday", "every day")).not.toBe("exact");
    expect(matchTypedAnswer("long tern", "long-term")).not.toBe("exact");
    expect(matchTypedAnswer("do not", "don't")).toBe("exact");
    expect(matchTypedAnswer("they’re", "they're")).toBe("exact");
    expect(normalizeTypedText("He doesn't  like it")).toBe(normalizeTypedText("he does not like it"));
  });

  it("grammar: a hyphenated answer matches spaced and joined spellings", () => {
    const ex = { type: "fill_blank", promptEn: "My brother is ___ years old.", correctAnswer: "twenty-one" };
    for (const typed of ["twenty-one", "twenty one", "twentyone", "Twenty-one.", "My brother is twenty one years old."]) {
      expect(isGrammarAnswerCorrect(typed, ex)).toBe(true);
    }
    expect(isGrammarAnswerCorrect("twenty", ex)).toBe(false);
    expect(isGrammarAnswerCorrect("every day", { type: "fill_blank", promptEn: "I run ___.", correctAnswer: "everyday" })).toBe(false);
    // Apostrophes and 's readings unchanged
    expect(isGrammarAnswerCorrect("it's", { type: "fill_blank", promptEn: "The app lost ___ data.", correctAnswer: "its" })).toBe(false);
    const knock = { type: "conjugation", promptEn: "Someone _____ (knock) on the door.", correctAnswer: "is knocking" };
    expect(isGrammarAnswerCorrect("Someone's knocking on the door.", knock)).toBe(true);
    expect(answerReadings("e-mail")).toEqual(expect.arrayContaining(["e mail", "email"]));
  });
});

describe("mistake notebook keeps apostrophes (M11)", () => {
  it("grades apostrophe mistakes as wrong", () => {
    expect(gradeMistakeAnswer("its", "it's")).toBe(Rating.Again);
    expect(gradeMistakeAnswer("users'", "user's")).toBe(Rating.Again);
    expect(gradeMistakeAnswer("dont", "don't")).toBe(Rating.Again);
    expect(gradeMistakeAnswer("it's", "it's")).toBe(Rating.Good);
    expect(gradeMistakeAnswer("It’s", "it's")).toBe(Rating.Good);
  });

  it("still ignores case, extra spaces and end punctuation", () => {
    expect(normalizeMistakeText("  It’s   FINE! ")).toBe("it's fine");
    expect(gradeMistakeAnswer("  i   fixed. ", "I fixed")).toBe(Rating.Good);
    expect(gradeMistakeAnswer("user's", "User's.")).toBe(Rating.Good);
  });

  it("saves an apostrophe fix instead of dropping it as a no-op", async () => {
    await freshServices();
    const mistakes = await import("@/services/mistakes");
    const res = await mistakes.saveMistakes([{ wrong: "its", right: "it's", category: "other" }], { source: "standup" });
    expect(res.added).toBe(1);
  });
});

describe("review: mistake notebook keeps contractions equal", () => {
  it("accepts do not for don't but still separates its / it's", async () => {
    const { gradeMistakeAnswer } = await import("@/services/mistakes");
    const { Rating } = await import("ts-fsrs");
    expect(gradeMistakeAnswer("I do not know.", "I don't know")).toBe(Rating.Good);
    expect(gradeMistakeAnswer("its", "it's")).toBe(Rating.Again);
  });
});
