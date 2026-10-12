import { describe, it, expect } from "vitest";
import { buildTiles, FIXED } from "@/components/exercises/LetterTilesExercise";

describe("LetterTilesExercise - buildTiles and slot verification", () => {
  it("generates exactly the same number of tiles as letters of the word (no extra distractor tiles)", () => {
    const word = "cat";
    const tiles = buildTiles(word);
    expect(tiles.length).toBe(3);
    const sortedChars = tiles.map((t) => t.ch).sort().join("");
    expect(sortedChars).toBe("act");
  });

  it("produces exact tile count for longer words", () => {
    const word = "developer";
    const tiles = buildTiles(word);
    expect(tiles.length).toBe(word.length);
    const sortedChars = tiles.map((t) => t.ch).sort().join("");
    expect(sortedChars).toBe([...word.toLowerCase()].sort().join(""));
  });

  it("filters out FIXED characters such as spaces, hyphens, and commas from tiles", () => {
    const wordWithSpace = "ice cream";
    const tiles = buildTiles(wordWithSpace);
    // 8 letters, 1 space
    expect(tiles.length).toBe(8);
    expect(tiles.every((t) => !FIXED.test(t.ch))).toBe(true);

    const wordWithHyphen = "well-known";
    const tilesHyphen = buildTiles(wordWithHyphen);
    // 9 letters, 1 hyphen
    expect(tilesHyphen.length).toBe(9);

    const wordWithComma = "a, an";
    const tilesComma = buildTiles(wordWithComma);
    // 'a', 'a', 'n' -> 3 letters
    expect(tilesComma.length).toBe(3);
  });

  it("properly shuffles letters when word has distinct letters", () => {
    const word = "computer";
    const tiles = buildTiles(word);
    expect(tiles.length).toBe(8);
    // It should not spell "computer" in original order if length > 1
    const spelled = tiles.map((t) => t.ch).join("");
    expect(spelled).not.toBe("computer");
  });

  it("handles repeated letters correctly without error", () => {
    const word = "area";
    const tiles = buildTiles(word);
    expect(tiles.length).toBe(4);
    const spelled = tiles.map((t) => t.ch).join("");
    expect(spelled).not.toBe("area");
  });
});
