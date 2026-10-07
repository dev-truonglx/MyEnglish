import { describe, it, expect } from "vitest";
import { STARTER_DECKS } from "@/data/starterDecks";
import { orderStarterWords } from "@/services/starterDecks";
import { applyDailyPlan, DAILY_PLANS, isOnboardingDone, shouldShowOnboarding } from "@/services/onboarding";
import { getStudyLimits } from "@/services/srs";
import { getDailyGoal } from "@/services/streak";
import { getReminderSettings } from "@/services/reminderSettings";
import { maskWordInSentence } from "@/services/smartReview";
import { CEFR_LEVELS } from "@/services/cefr";
import { freshServices } from "./helpers";

describe("starter decks data", () => {
  const all = STARTER_DECKS.flatMap((d) => d.words.map((w) => ({ ...w, deck: d.id })));

  it("has no duplicate word across decks", () => {
    const seen = new Set<string>();
    for (const w of all) {
      expect(seen.has(w.word.toLowerCase()), w.word).toBe(false);
      seen.add(w.word.toLowerCase());
    }
  });

  it("every word is complete and its example can be blanked for cloze", () => {
    for (const w of all) {
      expect(w.ipa, w.word).toMatch(/^\/.+\/$/);
      expect(w.vn.trim().length, w.word).toBeGreaterThan(0);
      expect(w.enVn.trim().length, w.word).toBeGreaterThan(0);
      expect(CEFR_LEVELS).toContain(w.cefr);
      expect(maskWordInSentence(w.en, w.word), `${w.word}: "${w.en}"`).not.toBeNull();
    }
  });

  it("has unique deck ids and topics", () => {
    expect(new Set(STARTER_DECKS.map((d) => d.id)).size).toBe(STARTER_DECKS.length);
    expect(new Set(STARTER_DECKS.map((d) => d.topic)).size).toBe(STARTER_DECKS.length);
  });
});

describe("starter word order", () => {
  it("starts with the learner's level and one above, interleaving the chosen decks", () => {
    const [docs, meetings] = STARTER_DECKS;
    const ordered = orderStarterWords([docs, meetings], "B1");
    const firstTen = ordered.slice(0, 10);
    expect(firstTen.every((x) => x.word.cefr === "B1" || x.word.cefr === "B2")).toBe(true);
    expect(new Set(firstTen.map((x) => x.deck.id)).size).toBe(2);
    expect(ordered).toHaveLength(docs.words.length + meetings.words.length);
  });

  it("a beginner gets the easiest words first", () => {
    const ordered = orderStarterWords(STARTER_DECKS, "A1");
    expect(["A1", "A2"]).toContain(ordered[0].word.cefr);
    expect(ordered[ordered.length - 1].word.cefr).toBe("C1");
  });
});

describe("importStarterDecks", () => {
  it("adds the words with example, topic and level, in learning order, and skips words already there", async () => {
    const { db } = await freshServices();
    const starter = await import("@/services/starterDecks");
    const deck = STARTER_DECKS.find((d) => d.id === "code-review")!;
    await db.insertEnrichedWord({ word: "typo", meaning_vn: "lỗi chính tả (của tôi)", synonyms: [], antonyms: [], examples: [] });

    const res = await starter.importStarterDecks([deck], "B2");
    expect(res).toEqual({ inserted: deck.words.length - 1, skipped: 1 });

    const words = await db.getAllWords();
    const refactor = words.find((w) => w.word === "refactor")!;
    expect(refactor.topic).toBe("Code Review");
    expect(refactor.cefr_level).toBe("C1");
    expect(refactor.phonetic).toBe("/riːˈfæktər/");
    expect(refactor.examples[0]).toMatchObject({ sentence_vn: expect.stringContaining("tái cấu trúc"), source: "starter" });
    expect(words.find((w) => w.word === "typo")!.meaning_vn).toBe("lỗi chính tả (của tôi)"); // untouched

    // New words come out oldest first: creation order follows the learning order
    const expected = starter.orderStarterWords([deck], "B2").map((x) => x.word.word).filter((w) => w !== "typo");
    const byCreation = words.filter((w) => w.topic === "Code Review").sort((a, b) => a.created_at.localeCompare(b.created_at));
    expect(byCreation.map((w) => w.word)).toEqual(expected);
    expect(starter.getImportedDeckIds()).toEqual(["code-review"]);

    expect(await starter.importStarterDecks([deck], "B2")).toEqual({ inserted: 0, skipped: deck.words.length });
  });
});

describe("onboarding", () => {
  it("is shown once to a learner without words; learners with words skip it for good", () => {
    expect(shouldShowOnboarding(0, true)).toBe(false); // still loading
    expect(shouldShowOnboarding(0, false)).toBe(true);
    expect(shouldShowOnboarding(12, false)).toBe(false);
    expect(isOnboardingDone()).toBe(true);
    expect(shouldShowOnboarding(0, false)).toBe(false);
  });

  it("the minutes per day set new words, session size, daily goal and reminders", () => {
    applyDailyPlan(5, true);
    expect(getStudyLimits()).toEqual({ newCardsPerDay: 3, maxSessionSize: 20 });
    expect(getDailyGoal()).toBe(DAILY_PLANS[5].dailyGoal);
    expect(getReminderSettings()).toMatchObject({ enabled: true, intervalMinutes: 60 });
    applyDailyPlan(15, false);
    expect(getStudyLimits().newCardsPerDay).toBe(8);
    expect(getReminderSettings()).toMatchObject({ enabled: false, intervalMinutes: 0 });
  });
});
