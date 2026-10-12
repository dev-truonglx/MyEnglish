import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEFAULT_INITIAL_TENSE_IDS,
  GRAMMAR_TENSES_INIT_KEY,
  GRAMMAR_EXCLUDED_KEY,
  hasChosenInitialTenses,
  markInitialTensesDone,
  saveInitialTenses,
  getEffectiveLessonIds,
  getExcludedLessonIds,
  toggleLessonSelection,
  selectChapterLessons,
} from "@/services/grammarPath";
import { TENSE_OPTIONS } from "@/components/grammar/TenseSelectionPicker";

describe("Initial Tense Selection for beginners & update migration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defines Present Simple (ch01-l01) as the default initial tense", () => {
    expect(DEFAULT_INITIAL_TENSE_IDS).toEqual(["ch01-l01"]);
    const presentSimple = TENSE_OPTIONS.find((t) => t.id === "ch01-l01");
    expect(presentSimple).toBeDefined();
    expect(presentSimple?.titleVn).toBe("Thì hiện tại đơn");
    expect(presentSimple?.isDefault).toBe(true);
    expect(presentSimple?.recommendedBadge).toBeDefined();
  });

  it("contains all 13 tenses from chapter 1 in TENSE_OPTIONS", () => {
    expect(TENSE_OPTIONS).toHaveLength(13);
    const ids = TENSE_OPTIONS.map((t) => t.id);
    for (let i = 1; i <= 13; i++) {
      const id = `ch01-l${String(i).padStart(2, "0")}`;
      expect(ids).toContain(id);
    }
  });

  it("tracks whether user has initialized initial tenses", () => {
    expect(hasChosenInitialTenses()).toBe(false);
    markInitialTensesDone();
    expect(hasChosenInitialTenses()).toBe(true);
    expect(localStorage.getItem(GRAMMAR_TENSES_INIT_KEY)).toBe("1");
  });

  it("saves default Present Simple, excluding all other chapters and tenses", () => {
    const allKnown = [
      "ch01-l01",
      "ch01-l02",
      "ch01-l03",
      "ch01-l05",
      "ch02-l01",
      "ch02-l02",
      "ch03-l01",
    ];

    saveInitialTenses([...DEFAULT_INITIAL_TENSE_IDS]);
    expect(hasChosenInitialTenses()).toBe(true);

    const effective = getEffectiveLessonIds(allKnown);
    expect(effective).toEqual(["ch01-l01"]);

    const excluded = getExcludedLessonIds(allKnown);
    expect(excluded).toEqual(["ch01-l02", "ch01-l03", "ch01-l05", "ch02-l01", "ch02-l02", "ch03-l01"]);
  });

  it("allows selecting multiple tenses during setup", () => {
    const allKnown = [
      "ch01-l01",
      "ch01-l02",
      "ch01-l03",
      "ch01-l05",
      "ch02-l01",
      "ch03-l01",
    ];

    // User chooses both Present Simple and Past Simple
    saveInitialTenses(["ch01-l01", "ch01-l05"]);
    expect(hasChosenInitialTenses()).toBe(true);

    const effective = getEffectiveLessonIds(allKnown);
    expect(effective).toEqual(["ch01-l01", "ch01-l05"]);

    const excluded = getExcludedLessonIds(allKnown);
    expect(excluded).toContain("ch01-l02");
    expect(excluded).toContain("ch01-l03");
    expect(excluded).toContain("ch02-l01");
    expect(excluded).toContain("ch03-l01");
    expect(excluded).not.toContain("ch01-l01");
    expect(excluded).not.toContain("ch01-l05");
  });

  it("allows user to modify selection in grammar tab after init", async () => {
    const allKnown = [
      "ch01-l01",
      "ch01-l02",
      "ch01-l05",
      "ch02-l01",
      "ch02-l02",
    ];

    // 1. Initialized with Present Simple
    saveInitialTenses(["ch01-l01"]);
    expect(getEffectiveLessonIds(allKnown)).toEqual(["ch01-l01"]);

    // 2. In Grammar tab, user toggles Present Continuous (ch01-l02)
    // Mock getKnownLessonIds by passing allKnown or calling toggle
    const current = getEffectiveLessonIds(allKnown);
    expect(current).toEqual(["ch01-l01"]);

    // User adds ch01-l02 to their path
    saveInitialTenses(["ch01-l01", "ch01-l02"]);
    expect(getEffectiveLessonIds(allKnown)).toEqual(["ch01-l01", "ch01-l02"]);

    // 3. User selects entire chapter 2 in grammar tab
    const nextWithCh2 = [...getEffectiveLessonIds(allKnown), "ch02-l01", "ch02-l02"];
    saveInitialTenses(nextWithCh2);
    expect(getEffectiveLessonIds(allKnown)).toEqual(["ch01-l01", "ch01-l02", "ch02-l01", "ch02-l02"]);
  });
});
