import { describe, it, expect } from "vitest";
import { Rating } from "ts-fsrs";
import { buildPopupChoices, needsIntro, popupAnswerRating } from "@/services/popupSession";
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
    [true, "multiple_choice", 16000, false, Rating.Hard],
    [true, "spelling", 5000, true, Rating.Hard],
    [true, "spelling", 5000, false, Rating.Good],
    [true, "spelling", 21000, false, Rating.Hard],
  ] as const)("correct=%s %s %ims nearMiss=%s -> %i", (correct, type, ms, near, expected) => {
    expect(popupAnswerRating(correct, type, ms, near)).toBe(expected);
  });

  it("never grades Easy automatically", () => {
    expect(popupAnswerRating(true, "multiple_choice", 300)).toBe(Rating.Good);
  });
});

describe("#6 ignored reminders back off", () => {
  it("doubles the snooze, capped by the reminder interval", () => {
    expect([0, 1, 2, 3, 4].map((n) => ignoredNudgeSnoozeMinutes(n, 10, 60))).toEqual([10, 20, 40, 60, 60]);
    expect(ignoredNudgeSnoozeMinutes(5, 10, 0)).toBe(10); // reminders disabled: plain snooze
    expect(ignoredNudgeSnoozeMinutes(50, 5, 30)).toBe(30); // no overflow on long streaks
  });

  it("grows while ignored and resets once the user answers", () => {
    saveReminderSettings({ snoozeMinutes: 10, intervalMinutes: 30 });
    const t0 = Date.now();
    expect(snoozeIgnoredNudge()).toBe(10);
    expect(snoozeIgnoredNudge()).toBe(20);
    expect(snoozeIgnoredNudge()).toBe(30);
    expect(getIgnoredNudgeCount()).toBe(3);
    const until = getReminderSettings().snoozedUntil!;
    expect(until - t0).toBeGreaterThanOrEqual(30 * 60 * 1000);
    expect(until - t0).toBeLessThan(31 * 60 * 1000);

    resetIgnoredNudges();
    expect(getIgnoredNudgeCount()).toBe(0);
    expect(snoozeIgnoredNudge()).toBe(10);
  });
});
