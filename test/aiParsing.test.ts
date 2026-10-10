import { describe, it, expect } from "vitest";
import { parseGrammarExercises, parseSentenceGrade } from "@/services/ai";

describe("AI grammar questions", () => {
  const mc = (options: string[], correct: unknown) => ({
    type: "multiple_choice",
    prompt_en: "She _____ to work every day.",
    options,
    correct_answer: correct,
    explanation: "x",
  });

  it("keeps a multiple-choice question with exactly one correct, distinct option", () => {
    const [ex] = parseGrammarExercises([mc(["go", "goes", "going", "went"], "goes")]);
    expect(ex.correctAnswer).toBe("goes");
  });

  it("drops duplicate options and questions with no or several correct options", () => {
    expect(parseGrammarExercises([mc(["goes", "Goes", "go", "went"], "goes")])).toHaveLength(0);
    expect(parseGrammarExercises([mc(["go", "going", "went"], "goes")])).toHaveLength(0);
    expect(parseGrammarExercises([mc(["has", "have", "is"], ["has", "have"])])).toHaveLength(0);
  });

  it("keeps several accepted answers as a list instead of 'has,have'", () => {
    const [ex] = parseGrammarExercises([
      { type: "conjugation", prompt_en: "Our team _____ (have) a meeting now.", correct_answer: ["has", "have"] },
    ]);
    expect(ex.correctAnswer).toEqual(["has", "have"]);
    const [withAccepted] = parseGrammarExercises([
      {
        type: "conjugation",
        prompt_en: "She _____ (not work) on Sundays.",
        correct_answer: "does not work",
        accepted_answers: ["doesn't work"],
      },
    ]);
    expect(withAccepted.correctAnswer).toEqual(["does not work", "doesn't work"]);
  });

  it("needs a blank in conjugation questions", () => {
    expect(parseGrammarExercises([{ type: "conjugation", prompt_en: "She works here.", correct_answer: "works" }])).toHaveLength(0);
  });

  it("finds the wrong word as a whole word and builds the corrected sentence", () => {
    const [ex] = parseGrammarExercises([
      { type: "error_spotting", prompt_en: "He don't like bugs.", error_word: "don't", correct_answer: "doesn't" },
    ]);
    expect(ex.correctAnswer).toBe("don't");
    expect(ex.correctSentence).toBe("He doesn't like bugs.");
    // "is" only appears inside "This": not a word of the sentence
    expect(
      parseGrammarExercises([{ type: "error_spotting", prompt_en: "This are my files.", error_word: "is", correct_answer: "x" }])
    ).toHaveLength(0);
  });
});

describe("AI sentence grade", () => {
  it("refuses a grade without a numeric score instead of reading it as 0", () => {
    expect(() => parseSentenceGrade('{"correct":true,"score":"integer 0-100","uses_target_word":true}')).toThrow();
    expect(() => parseSentenceGrade('{"correct":true,"uses_target_word":true}')).toThrow();
  });

  it("checks that a single target word is really in the sentence", () => {
    const grade = '{"correct":true,"score":90,"uses_target_word":true}';
    expect(parseSentenceGrade(grade, "deploy", "We deployed it yesterday.").usesTargetWord).toBe(true);
    expect(parseSentenceGrade(grade, "deploy", "We shipped it yesterday.").usesTargetWord).toBe(false);
    const missing = '{"correct":true,"score":90}';
    expect(parseSentenceGrade(missing, "write", "She wrote the docs.").usesTargetWord).toBe(true);
    expect(parseSentenceGrade(missing).usesTargetWord).toBe(false);
  });
});
