import { describe, it, expect } from "vitest";
import catalogFile from "@/data/vocabCatalog.json";
import { CATALOG_LEVEL_COUNTS, CATALOG_VERSION, STUDY_LEVELS, type CatalogEntry } from "@/services/vocabCatalog";
import { GRAMMAR_LESSONS } from "@/data/grammarData";
import { FOUNDATION_LESSONS } from "@/data/foundationGrammar";
import { PRONUNCIATION_LESSONS } from "@/data/pronunciation";
import { PLACEMENT_A0_VOCAB, PLACEMENT_GRAMMAR, PLACEMENT_LISTENING } from "@/data/placementBank";
import { COVERAGE_TEXTS } from "@/data/coverageCorpus";
import { fillPromptBlanks, isGrammarAnswerCorrect, maskWordInSentence, registerWordForms } from "@/services/smartReview";
import { buildPlacementBlock, placementStep, PLACEMENT_LEVELS } from "@/services/placement";
import { computeCoverage } from "@/services/coverage";
import { makeWord, reviewSrs } from "./helpers";

const words = (sentence: string) => sentence.trim().split(/\s+/).length;

describe("vocabulary deck (Oxford 5000, A1–C1)", () => {
  const words = catalogFile.words as unknown as CatalogEntry[];

  it("has 5,004 distinct words at levels A1–C1, with its source and version", () => {
    expect(catalogFile.version).toBe(CATALOG_VERSION);
    expect(catalogFile.source).toContain("ankiweb.net/shared/info/632690606");
    expect(words).toHaveLength(5004);
    expect(new Set(words.map((w) => w.id)).size).toBe(words.length);
    for (const level of STUDY_LEVELS) {
      expect(words.filter((w) => w.cefr === level).length, level).toBe(CATALOG_LEVEL_COUNTS[level]);
    }
  });

  it("every word has a meaning, IPA and at least one example with its translation", () => {
    for (const w of words) {
      expect(w.vn.trim().length, w.word).toBeGreaterThan(0);
      expect(w.senses.length, w.word).toBeGreaterThan(0);
      expect(w.examples.length, w.word).toBeGreaterThan(0);
      for (const ex of w.examples) expect(ex.vi.trim().length, `${w.word}: ${ex.en}`).toBeGreaterThan(0);
      const ipa = [...w.ipaUs, ...w.ipaUk];
      expect(ipa.length, w.word).toBeGreaterThan(0);
      for (const i of ipa) expect(i, w.word).toMatch(/^\/.+\/$/);
    }
  });

  it("the cloze can blank the word in nearly every example (with the deck's forms and spellings)", () => {
    let total = 0;
    let blankable = 0;
    const misses: string[] = [];
    for (const w of words) {
      registerWordForms(w.word, [...w.irregular, ...w.examples.flatMap((e) => e.focus)], w.variants);
      for (const ex of w.examples) {
        total++;
        if (maskWordInSentence(ex.en, w.word)) blankable++;
        else if (misses.length < 10) misses.push(`${w.word}: ${ex.en}`);
      }
    }
    expect(blankable / total, misses.join("\n")).toBeGreaterThan(0.98);
  });

  it("marks the IT words picked from the Oxford topics, learnt first within their level", () => {
    const it = words.filter((w) => w.it);
    expect(it.length).toBe(274);
    expect(it.every((w) => ["A1", "A2", "B1", "B2"].includes(w.cefr))).toBe(true);
    expect(it.map((w) => w.word)).toEqual(expect.arrayContaining(["computer", "file", "error", "update"]));
  });
});

describe("grammar lessons", () => {
  it("foundation lessons come first and are marked", () => {
    expect(FOUNDATION_LESSONS).toHaveLength(8);
    expect(GRAMMAR_LESSONS.slice(0, 8).every((l) => l.foundation && l.level === "A1" && l.order < 1)).toBe(true);
    expect(FOUNDATION_LESSONS.every((l) => l.vnContrast && l.vnContrast.points.length >= 3)).toBe(true);
  });

  it("every exercise id is unique", () => {
    const ids = GRAMMAR_LESSONS.flatMap((l) => [...l.diagnosticExercises, ...l.practiceExercises]).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every multiple-choice question has exactly one correct option, every blank is fillable", () => {
    for (const lesson of GRAMMAR_LESSONS) {
      for (const ex of [...lesson.diagnosticExercises, ...lesson.practiceExercises]) {
        const answers = Array.isArray(ex.correctAnswer) ? ex.correctAnswer : [ex.correctAnswer];
        expect(answers.length, ex.id).toBeGreaterThan(0);
        if (ex.type === "multiple_choice") {
          const correct = (ex.options ?? []).filter((o) => isGrammarAnswerCorrect(o, ex));
          expect(correct, `${ex.id}: ${ex.promptEn}`).toHaveLength(1);
          expect(new Set(ex.options).size, ex.id).toBe(ex.options?.length);
        }
        if (ex.type === "conjugation") {
          expect(fillPromptBlanks(ex.promptEn, answers[0]), `${ex.id}: ${ex.promptEn}`).not.toBeNull();
        }
        if (ex.type === "error_spotting") {
          expect(ex.errorWord, ex.id).toBeTruthy();
          expect(ex.options ?? [], ex.id).toContain(ex.errorWord);
        }
        for (const a of answers) expect(isGrammarAnswerCorrect(a, ex), `${ex.id}: ${a}`).toBe(true);
      }
    }
  });
});

describe("pronunciation lessons", () => {
  it("8 lessons in order, each quiz answer offered exactly once", () => {
    expect(PRONUNCIATION_LESSONS.map((l) => l.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const l of PRONUNCIATION_LESSONS) {
      expect(l.quiz.length, l.id).toBeGreaterThanOrEqual(6);
      for (const q of l.quiz) {
        expect(q.options.filter((o) => o === q.answer), `${l.id}: ${q.say}`).toHaveLength(1);
        expect(new Set(q.options).size).toBe(q.options.length);
        expect(q.say.trim().length).toBeGreaterThan(0);
      }
      for (const e of l.examples) expect(e.ipa, e.text).toMatch(/^\/.+\/$/);
    }
  });
});

describe("adaptive placement", () => {
  it("every item bank question has exactly one correct option", () => {
    for (const level of PLACEMENT_LEVELS) {
      expect(PLACEMENT_GRAMMAR[level].length).toBeGreaterThanOrEqual(3);
      expect(PLACEMENT_LISTENING[level].length).toBeGreaterThanOrEqual(2);
      for (const g of PLACEMENT_GRAMMAR[level]) {
        expect(g.sentence.match(/_{3,}/g), g.sentence).toHaveLength(1);
        expect(g.options.filter((o) => o === g.answer), g.sentence).toHaveLength(1);
      }
      for (const l of PLACEMENT_LISTENING[level]) expect(l.options.filter((o) => o === l.answer), l.say).toHaveLength(1);
    }
    expect(PLACEMENT_A0_VOCAB.length).toBeGreaterThanOrEqual(3);
  });

  it("builds a block of a word, a grammar gap and a listening item (A0: three easy words)", () => {
    const bank = { grammar: PLACEMENT_GRAMMAR, listening: PLACEMENT_LISTENING, a0: PLACEMENT_A0_VOCAB };
    expect(buildPlacementBlock("B1", bank).map((q) => q.kind)).toEqual(["vocab", "grammar", "listening"]);
    const a0 = buildPlacementBlock("A0", bank);
    expect(a0.map((q) => q.kind)).toEqual(["vocab", "vocab", "vocab"]);
    for (const q of [...a0, ...buildPlacementBlock("A2", bank)]) expect(q.options).toContain(q.answer);
  });

  it("moves one level at a time from A2 and tells an absolute beginner apart", () => {
    expect(placementStep("A2", true)).toEqual({ next: "B1" });
    expect(placementStep("B1", false)).toEqual({ result: "B1" });
    expect(placementStep("C1", true)).toEqual({ result: "C1" });
    expect(placementStep("A2", false)).toEqual({ next: "A1" });
    expect(placementStep("A1", true)).toEqual({ result: "A2" });
    expect(placementStep("A1", false)).toEqual({ next: "A0" });
    expect(placementStep("A0", true)).toEqual({ result: "A1" });
    expect(placementStep("A0", false)).toEqual({ result: "A0" });
  });
});

describe("coverage of typical IT texts", () => {
  it("has 6 texts and grows as words are remembered", () => {
    expect(COVERAGE_TEXTS).toHaveLength(6);
    const none = computeCoverage([], COVERAGE_TEXTS);
    expect(none.percent).toBeGreaterThan(20); // function words (the, is, to…)
    expect(none.percent).toBeLessThan(70);
    const known = ["request", "file", "test", "bug", "change", "user", "code", "version", "error", "update"].map((w) =>
      makeWord(w, { srs: reviewSrs(5, 1) })
    );
    expect(computeCoverage(known, COVERAGE_TEXTS).percent).toBeGreaterThan(none.percent);
  });
});
