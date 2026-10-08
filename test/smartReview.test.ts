import { describe, it, expect } from "vitest";
import { Rating } from "ts-fsrs";
import {
  deriveRating,
  matchTypedAnswer,
  buildReviewSession,
  smartSortReviewQueue,
  escapeRegExp,
  maskWordInSentence,
  normalizeTypedText,
  prepareContextMatch,
  contractionVariants,
  fillPromptBlanks,
  isGrammarAnswerCorrect,
  prepareSentenceBuilder,
} from "@/services/smartReview";
import { saveStudyLimits } from "@/services/srs";
import { makeWord, reviewSrs, freshServices } from "./helpers";

describe("deriveRating", () => {
  const base = { responseTimeMs: 2000 };

  it("grades any wrong attempt as Again", () => {
    expect(deriveRating({ ...base, exerciseType: "multiple_choice", wrongAttempts: 1 })).toBe(Rating.Again);
    expect(deriveRating({ ...base, exerciseType: "spelling", wrongAttempts: 2 })).toBe(Rating.Again);
  });

  it("caps recognition exercises at Good", () => {
    expect(deriveRating({ ...base, exerciseType: "multiple_choice", wrongAttempts: 0, srs: { state: 2 } })).toBe(
      Rating.Good
    );
  });

  it("grades hints and near misses as Hard", () => {
    expect(deriveRating({ ...base, exerciseType: "spelling", wrongAttempts: 0, usedHint: true })).toBe(Rating.Hard);
    expect(deriveRating({ ...base, exerciseType: "spelling", wrongAttempts: 0, nearMiss: true })).toBe(Rating.Hard);
  });

  it("never gives Easy automatically; very slow correct answers are Hard", () => {
    expect(deriveRating({ ...base, exerciseType: "spelling", wrongAttempts: 0, srs: { state: 2 } })).toBe(Rating.Good);
    expect(deriveRating({ exerciseType: "spelling", wrongAttempts: 0, responseTimeMs: 25000 })).toBe(Rating.Hard);
    expect(deriveRating({ exerciseType: "multiple_choice", wrongAttempts: 0, responseTimeMs: 16000 })).toBe(Rating.Hard);
  });
});

describe("matchTypedAnswer", () => {
  it.each([
    ["latency", "latency", "exact"],
    ["  Latency ", "latency", "exact"],
    ["latancy", "latency", "near"],
    ["deploys", "deploy", "near"],
    ["deployed", "deploy", "near"],
    ["dep", "deploy", "wrong"],
    ["lat", "lot", "wrong"],
    ["", "deploy", "wrong"],
  ])("%s vs %s -> %s", (input, target, expected) => {
    expect(matchTypedAnswer(input, target)).toBe(expected);
  });
});

describe("matchTypedAnswer leniency", () => {
  it("treats contractions and curly quotes as the same plain word", () => {
    expect(matchTypedAnswer("do not", "don't")).toBe("exact");
    expect(matchTypedAnswer("don’t", "don't")).toBe("exact");
  });

  it("keeps symbols strict", () => {
    expect(matchTypedAnswer("c", "c++")).toBe("wrong");
  });

  it("accepts the whole context sentence", () => {
    const sentence = "We deploy every Friday.";
    expect(matchTypedAnswer("we deploy every friday", "deploy", sentence)).toBe("exact");
    expect(matchTypedAnswer("we ship every friday", "deploy", sentence)).toBe("wrong");
  });
});

describe("fillPromptBlanks", () => {
  it("fills brackets, hinted blanks and several blanks in order", () => {
    expect(fillPromptBlanks("She [not work] on Sunday.", "doesn't work")).toBe("She doesn't work on Sunday.");
    expect(fillPromptBlanks("It usually _____ (take) five minutes.", "takes")).toBe("It usually takes five minutes.");
    expect(fillPromptBlanks("Send me _____ link to _____ docs.", "the / the")).toBe("Send me the link to the docs.");
    expect(fillPromptBlanks("Send me _____ link to _____ docs.", "the")).toBeNull();
    expect(fillPromptBlanks("Rewrite this sentence.", "x")).toBeNull();
  });
});

describe("isGrammarAnswerCorrect", () => {
  const ex = { type: "conjugation", promptEn: "She [not work] on Sunday.", correctAnswer: "doesn't work" };

  it.each([
    "doesn't work",
    "does not work",
    "she does not work on sunday",
    "She doesn’t work on Sunday.",
  ])("accepts %s", (input) => {
    expect(isGrammarAnswerCorrect(input, ex)).toBe(true);
  });

  it.each(["", "don't work", "she do not work on sunday", "she does not works on sunday"])("rejects %s", (input) => {
    expect(isGrammarAnswerCorrect(input, ex)).toBe(false);
  });

  it("does not treat error-spotting tokens as blanks", () => {
    const spot = { type: "error_spotting", promptEn: "My team [lead] [don't] [approve] code.", correctAnswer: "don't", errorWord: "don't" };
    expect(isGrammarAnswerCorrect("don't", spot)).toBe(true);
    expect(isGrammarAnswerCorrect("My team don't don't don't code", spot)).toBe(false);
  });
});

describe("buildReviewSession", () => {
  it("puts due reviews first, limits new cards by the daily budget and spreads them out", async () => {
    await freshServices();
    saveStudyLimits({ newCardsPerDay: 10, maxSessionSize: 30 });
    const reviews = Array.from({ length: 6 }, (_, i) => makeWord(`r${i}`, { srs: reviewSrs(2, i + 2) }));
    const fresh = Array.from({ length: 15 }, (_, i) => makeWord(`n${i}`, { createdDaysAgo: i }));

    const session = buildReviewSession([...fresh, ...reviews], 4);
    const ids = session.map((w) => w.id);

    expect(ids.filter((id) => id.startsWith("n"))).toHaveLength(6); // 10 - 4 already introduced today
    expect(ids.filter((id) => id.startsWith("r"))).toHaveLength(6);
    expect(ids.indexOf("n14")).toBeGreaterThan(-1); // oldest new word is introduced first
    expect(ids[0].startsWith("r")).toBe(true);
  });

  it("caps the session size", async () => {
    await freshServices();
    saveStudyLimits({ newCardsPerDay: 50, maxSessionSize: 5 });
    const words = Array.from({ length: 20 }, (_, i) => makeWord(`r${i}`, { srs: reviewSrs(2, 3) }));
    expect(buildReviewSession(words, 0)).toHaveLength(5);
  });

  it("excludes words still waiting for AI analysis", async () => {
    await freshServices();
    const pending = makeWord("pending", { meaning_vn: "Đang phân tích nghĩa & cấu trúc ngữ pháp..." });
    const ready = makeWord("ready");
    expect(buildReviewSession([pending, ready], 0).map((w) => w.id)).toEqual(["ready"]);
  });
});

describe("smartSortReviewQueue", () => {
  it("orders the most forgotten word first", async () => {
    await freshServices();
    const fading = makeWord("fading", { srs: reviewSrs(2, 20) });
    const fresh = makeWord("fresh", { srs: reviewSrs(30, 1) });
    expect(smartSortReviewQueue([fresh, fading])[0].id).toBe("fading");
  });

  it("avoids three words in a row from the same topic when an alternative exists", async () => {
    await freshServices();
    const words = [
      ...["a1", "a2", "a3", "a4"].map((id) => makeWord(id, { topic: "A", srs: reviewSrs(2, 10) })),
      makeWord("b1", { topic: "B", srs: reviewSrs(30, 1) }),
    ];
    const topics = smartSortReviewQueue(words).map((w) => w.topic).join("");
    expect(topics).not.toContain("AAA");
  });
});

describe("text helpers", () => {
  it("escapes regex metacharacters", () => {
    expect(() => new RegExp(escapeRegExp("(re)try c++ .net"))).not.toThrow();
  });

  it("masks only the first occurrence, including inflections and special characters", () => {
    expect(maskWordInSentence("We deployed it and deployed again.", "deploy")).toBe("We ______ it and deployed again.");
    expect(maskWordInSentence("I write c++ code.", "c++")).toBe("I write ______ code.");
    expect(maskWordInSentence("Nothing here.", "deploy")).toBeNull();
  });

  it("normalizes contractions, quotes and spacing", () => {
    expect(normalizeTypedText("It  didn’t crash")).toBe(normalizeTypedText("it did not crash"));
  });

  it.each([
    ["doesn't", "does not"],
    ["does not", "doesn't"],
    ["He doesn't  like it", "he does not like it"],
    ["can't", "cannot"],
    ["won't", "will not"],
    ["They’re ready", "they are ready"],
    ["didn't crash", "did not crash."],
  ])("treats %s and %s as the same typed answer", (a, b) => {
    expect(normalizeTypedText(a)).toBe(normalizeTypedText(b));
  });

  it("lists equivalent contracted/full answer forms", () => {
    expect(contractionVariants("does not")).toEqual(["doesn't"]);
    expect(contractionVariants("didn't crash")).toEqual(["did not crash"]);
    expect(contractionVariants("Doesn't work")).toEqual(["Does not work"]);
    expect(contractionVariants("works")).toEqual([]);
    for (const v of contractionVariants("can't")) expect(normalizeTypedText(v)).toBe(normalizeTypedText("can't"));
  });

  it("builds context-match pairs without leaking the answer", async () => {
    await freshServices();
    const mk = (word: string, sentence: string, meaning: string) =>
      makeWord(word, { meaning_vn: meaning, examples: [{ id: word, word_id: word, sentence_en: sentence, grammar_analysis: "" }] });
    const pairs = prepareContextMatch(mk("cache", "We cache the result.", "bộ nhớ đệm"), [
      mk("queue", "Jobs wait in a queue.", "hàng đợi"),
      mk("mutex", "Lock the mutex first.", "khóa"),
      mk("c++", "The engine is written in c++ today.", "ngôn ngữ"),
    ]);
    expect(pairs.length).toBeGreaterThanOrEqual(3);
    for (const p of pairs) {
      expect(p.maskedSentence).toContain("______");
      expect(p.maskedSentence.toLowerCase()).not.toContain(p.word.toLowerCase());
    }
  });
});

describe("new-card budget", () => {
  it("counts first reviews today but not practice-only answers", async () => {
    const { db, smart, srs } = await freshServices();
    const studied = await db.insertEnrichedWord({ word: "shard", meaning_vn: "phân mảnh", synonyms: [], antonyms: [], examples: [] });
    const practiced = await db.insertEnrichedWord({ word: "replica", meaning_vn: "bản sao", synonyms: [], antonyms: [], examples: [] });

    await srs.recordReview(studied, Rating.Good);
    const log = (wordId: string, isScheduled: boolean) =>
      smart.saveReviewLog({
        wordId,
        exerciseType: "flip",
        responseTimeMs: 1000,
        isCorrect: true,
        wrongAttempts: 0,
        rating: Rating.Good,
        xpEarned: 0,
        timestamp: new Date().toISOString(),
        isScheduled,
      });
    await log(studied, true);
    await log(practiced, false);

    expect(await smart.getNewCardsIntroducedToday()).toEqual({ recognition: 1, production: 0 });
  });
});

describe("prepareSentenceBuilder", () => {
  it("never slices sentences > 10 words and provides all tokens needed for full sentence", () => {
    const longSentence = "Developers should omit sensitive credentials from production log outputs to prevent security leaks.";
    const meaningVn = "Các lập trình viên nên lược bỏ thông tin xác thực nhạy cảm khỏi log môi trường production để ngăn chặn rò rỉ bảo mật.";
    const word = makeWord("omit", {
      meaning_vn: "lược bỏ",
      examples: [
        {
          id: "ex-1",
          word_id: "omit",
          sentence_en: longSentence,
          sentence_vn: meaningVn,
          grammar_analysis: "",
        },
      ],
    });

    const data = prepareSentenceBuilder(word);
    expect(data).not.toBeNull();
    if (!data) return;

    // Sentence must not be truncated
    expect(data.fullSentence).toBe(longSentence);
    expect(data.meaningVN).toBe(meaningVn);

    // Number of tokens must exactly match the number of words in the full sentence (13 words)
    const rawWords = longSentence.split(/\s+/).filter(Boolean);
    expect(data.tokens).toHaveLength(rawWords.length);

    // All original words must be present in tokens
    const tokenTexts = data.tokens.map((t) => t.text).sort();
    const expectedTexts = [...rawWords].sort();
    expect(tokenTexts).toEqual(expectedTexts);

    // Tokens must be reconstructed and normalized to match full sentence
    const reconstructed = rawWords.join(" ");
    expect(normalizeTypedText(reconstructed)).toBe(normalizeTypedText(data.fullSentence));
  });

  it("handles 18-word example sentences completely without dropping any words", () => {
    const sentence18 = "He decided to omit the painful details of the car accident when recounting the story to his parents.";
    const word = makeWord("omit", {
      examples: [
        {
          id: "ex-2",
          word_id: "omit",
          sentence_en: sentence18,
          sentence_vn: "Anh ấy quyết định không đề cập đến những chi tiết đau lòng...",
          grammar_analysis: "",
        },
      ],
    });

    const data = prepareSentenceBuilder(word);
    expect(data).not.toBeNull();
    expect(data?.tokens).toHaveLength(18);
    expect(data?.fullSentence).toBe(sentence18);
  });

  it("prefers concise examples if multiple examples are available", () => {
    const word = makeWord("release", {
      examples: [
        {
          id: "ex-long",
          word_id: "release",
          sentence_en: "The DevOps team configured the CI/CD pipeline to release the hotfix directly to production after automated checks pass.",
          sentence_vn: "Dài",
          grammar_analysis: "",
        },
        {
          id: "ex-short",
          word_id: "release",
          sentence_en: "We release updates weekly.",
          sentence_vn: "Chúng tôi phát hành cập nhật hàng tuần.",
          grammar_analysis: "",
        },
      ],
    });

    const data = prepareSentenceBuilder(word);
    expect(data).not.toBeNull();
    // Should prefer the concise 4-word sentence
    expect(data?.fullSentence).toBe("We release updates weekly.");
    expect(data?.tokens).toHaveLength(4);
  });

  it("returns null when sentence is too short (< 3 words) or has no examples", () => {
    expect(prepareSentenceBuilder(makeWord("test", { examples: [] }))).toBeNull();
    expect(
      prepareSentenceBuilder(
        makeWord("test", {
          examples: [{ id: "1", word_id: "test", sentence_en: "Hi there", grammar_analysis: "" }],
        })
      )
    ).toBeNull();
  });
});
