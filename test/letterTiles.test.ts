import { describe, it, expect } from "vitest";
import { buildTiles, FIXED } from "@/components/exercises/LetterTilesExercise";

describe("LetterTilesExercise - buildTiles and slot verification", () => {
  it("generates tiles containing word letters plus 3 to 4 distractor letters", () => {
    const word = "cat";
    const tiles = buildTiles(word);
    // 3 letters of "cat" + 3 or 4 distractor letters = 6 or 7 tiles
    expect(tiles.length).toBeGreaterThanOrEqual(6);
    expect(tiles.length).toBeLessThanOrEqual(7);

    // Target word letters must all be present
    const tileChars = tiles.map((t) => t.ch);
    for (const char of ["c", "a", "t"]) {
      expect(tileChars).toContain(char);
    }

    // Distractor letters should be letters not in "cat"
    const distractors = tileChars.filter((c) => !["c", "a", "t"].includes(c));
    expect(distractors.length).toBeGreaterThanOrEqual(3);
    expect(distractors.length).toBeLessThanOrEqual(4);
  });

  it("supports explicit distractor count of 3 or 4", () => {
    const word = "cat";
    const tiles3 = buildTiles(word, Math.random, 3);
    expect(tiles3.length).toBe(6);

    const tiles4 = buildTiles(word, Math.random, 4);
    expect(tiles4.length).toBe(7);

    const longWord = "developer";
    const longTiles3 = buildTiles(longWord, Math.random, 3);
    expect(longTiles3.length).toBe(longWord.length + 3);

    const longTiles4 = buildTiles(longWord, Math.random, 4);
    expect(longTiles4.length).toBe(longWord.length + 4);
  });

  it("filters out FIXED characters such as spaces, hyphens, and commas from tiles while adding 3-4 distractors", () => {
    const wordWithSpace = "ice cream";
    const tiles = buildTiles(wordWithSpace, Math.random, 3);
    // 8 letters + 3 distractors = 11 tiles (space is not a tile)
    expect(tiles.length).toBe(11);
    expect(tiles.every((t) => !FIXED.test(t.ch))).toBe(true);

    const wordWithHyphen = "well-known";
    const tilesHyphen = buildTiles(wordWithHyphen, Math.random, 4);
    // 9 letters + 4 distractors = 13 tiles (hyphen is not a tile)
    expect(tilesHyphen.length).toBe(13);
    expect(tilesHyphen.every((t) => !FIXED.test(t.ch))).toBe(true);

    const wordWithComma = "a, an";
    const tilesComma = buildTiles(wordWithComma, Math.random, 3);
    // 'a', 'a', 'n' -> 3 letters + 3 distractors = 6 tiles
    expect(tilesComma.length).toBe(6);
    expect(tilesComma.every((t) => !FIXED.test(t.ch))).toBe(true);
  });

  it("verifies slot count strictly matches word letter count while tile pool has 3-4 distractors", () => {
    const target = "computer";
    const slots = [...target.toLowerCase()];
    const letterCount = slots.filter((c) => !FIXED.test(c)).length;
    const tiles = buildTiles(target);

    // Number of slots for user to fill is exactly the letter count of the word
    expect(letterCount).toBe(8);
    // Number of available tiles contains the word letters plus 3-4 distractors
    expect(tiles.length).toBeGreaterThanOrEqual(letterCount + 3);
    expect(tiles.length).toBeLessThanOrEqual(letterCount + 4);
  });

  it("properly shuffles letters so tiles do not spell the target word in order at the beginning", () => {
    const word = "computer";
    const tiles = buildTiles(word, Math.random, 3);
    const spelledAtStart = tiles.slice(0, word.length).map((t) => t.ch).join("");
    expect(spelledAtStart).not.toBe("computer");
  });

  it("handles repeated letters correctly with distractors", () => {
    const word = "area";
    const tiles = buildTiles(word, Math.random, 3);
    expect(tiles.length).toBe(7); // 4 letters + 3 distractors
    const aCount = tiles.filter((t) => t.ch === "a").length;
    expect(aCount).toBeGreaterThanOrEqual(2);
    expect(tiles.map((t) => t.ch)).toContain("r");
    expect(tiles.map((t) => t.ch)).toContain("e");
  });

  it("renders LetterTilesExercise initially in building state without auto-completing", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const LetterTilesExercise = (await import("@/components/exercises/LetterTilesExercise")).default;

    let completed = false;
    const html = renderToStaticMarkup(
      createElement(LetterTilesExercise, {
        word: { id: 1, word: "cat", meaning_vn: "con mèo" } as any,
        onComplete: () => {
          completed = true;
        },
        onSpeak: () => {},
      })
    );

    expect(completed).toBe(false);
    expect(html).toContain("Làm lại");
    expect(html).toContain("Không nhớ");
    expect(html).toContain("Con mèo");

    // Even when hideHints is true (e.g. FocusReviewModal), "Không nhớ" must still be visible
    const htmlNoHints = renderToStaticMarkup(
      createElement(LetterTilesExercise, {
        word: { id: 1, word: "cat", meaning_vn: "con mèo" } as any,
        hideHints: true,
        onComplete: () => {},
        onSpeak: () => {},
      })
    );
    expect(htmlNoHints).toContain("Không nhớ");
  });

  it("decomposes Vietnamese Telex characters accurately", async () => {
    const { decomposeVietnameseChar } = await import("@/components/exercises/LetterTilesExercise");

    // "their": i + r -> ỉ
    expect(decomposeVietnameseChar("ỉ")).toEqual({ base: "i", telexKeys: ["r"] });
    expect(decomposeVietnameseChar("Ỉ")).toEqual({ base: "i", telexKeys: ["r"] });

    // "this": i + s -> í
    expect(decomposeVietnameseChar("í")).toEqual({ base: "i", telexKeys: ["s"] });

    // "of": o + f -> ò
    expect(decomposeVietnameseChar("ò")).toEqual({ base: "o", telexKeys: ["f"] });

    // "how": o + w -> ơ
    expect(decomposeVietnameseChar("ơ")).toEqual({ base: "o", telexKeys: ["w"] });

    // "see": e + e -> ê
    expect(decomposeVietnameseChar("ê")).toEqual({ base: "e", telexKeys: ["e"] });

    // "book": o + o -> ô
    expect(decomposeVietnameseChar("ô")).toEqual({ base: "o", telexKeys: ["o"] });

    // "add": d + d -> đ
    expect(decomposeVietnameseChar("đ")).toEqual({ base: "d", telexKeys: ["d"] });

    // Plain English letters must return null
    expect(decomposeVietnameseChar("a")).toBeNull();
    expect(decomposeVietnameseChar("r")).toBeNull();
    expect(decomposeVietnameseChar("i")).toBeNull();
    expect(decomposeVietnameseChar("z")).toBeNull();
  });
});


