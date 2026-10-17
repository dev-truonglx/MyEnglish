import { describe, it, expect } from "vitest";
import { levelDetail } from "@/services/levelDetail";
import { makeWord } from "./helpers";

const now = new Date(2026, 9, 17, 15, 0);
const at = (days: number) => new Date(now.getTime() + days * 864e5).toISOString();
const studied = (id: string, level: string, stability: number, extra: Record<string, number> = {}) =>
  makeWord(id, {
    cefr_level: level,
    srs: { state: 2, reps: 4, repetitions: 4, stability, interval: Math.round(stability), last_review: at(-2), next_review_date: at(3), ...extra },
  });

describe("level detail (progress screen, CEFR level cards)", () => {
  const words = [
    studied("known", "A1", 10),
    studied("longterm", "A1", 30),
    studied("almost", "A1", 5),
    studied("shaky", "A1", 1, { lapses: 3 }),
    studied("due", "A1", 2, { lapses: 2 }),
    makeWord("fresh", { cefr_level: "A1" }),
    makeWord("marked", { cefr_level: "A1", srs: { state: 2, reps: 1, lapses: 0, stability: 60, next_review_date: at(7) } }),
    studied("other", "A2", 40),
  ];
  words[4].srs.next_review_date = at(-1);
  const d = levelDetail(words, "A1", now);

  it("counts the level's words by stage, as the level card counts known words", () => {
    expect(d).toMatchObject({ inLibrary: 7, met: 6, known: 2, longTerm: 1, learning: 3, markedKnown: 1, due: 1 });
  });

  it("lists the words closest to known first, and the most forgotten first", () => {
    expect(d.almostKnown.map((w) => w.word)).toEqual(["almost", "due", "shaky"]);
    expect(d.oftenForgotten.map((w) => `${w.word}:${w.lapses}`)).toEqual(["shaky:3", "due:2"]);
  });

  it("C2 words count toward C1", () => {
    expect(levelDetail([studied("rare", "C2", 12)], "C1", now).known).toBe(1);
  });
});

import { LEVEL_TENSES, matchTenseLessons } from "@/services/levelTenses";

describe("tenses of each level", () => {
  it("covers the 13 tenses of the book once, from A1 to B2", () => {
    const all = Object.values(LEVEL_TENSES).flat().map((x) => `${x.cell.time}:${x.cell.aspect}`);
    expect(all).toHaveLength(13);
    expect(new Set(all).size).toBe(13);
  });

  it("finds the book's lesson for a tense from its English title", () => {
    const lessons = [
      { id: "l1", title: "The Present Simple Tense" },
      { id: "l2", title: "The Present Continuous Tense" },
      { id: "l9", title: "Near Future" },
    ];
    expect([...matchTenseLessons(LEVEL_TENSES.A1, lessons).values()].map((l) => l.id)).toEqual(["l1", "l2"]);
    expect([...matchTenseLessons(LEVEL_TENSES.A2, lessons).values()].map((l) => l.id)).toEqual(["l9"]);
  });
});
