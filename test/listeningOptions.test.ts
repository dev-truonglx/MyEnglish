import { describe, it, expect, vi } from "vitest";
import catalogFile from "@/data/vocabCatalog.json";
import type { CatalogEntry } from "@/services/vocabCatalog";
import { ipaPhonemes, phonemeEditDistance, soundDistance } from "@/services/phoneticSimilarity";
import {
  generateListeningQuestion,
  sameWordFamily,
  MAX_SOUND_ALIKE_DISTANCE,
  type SoundAlikeWord,
} from "@/services/smartReview";
import { makeWord, reviewSrs, freshServices } from "./helpers";

const entries = catalogFile.words as unknown as CatalogEntry[];
/** The deck as loadCatalogSoundPool builds it */
const DECK_POOL: SoundAlikeWord[] = entries.map((e) => ({
  id: `catalog:${e.id}`,
  word: e.word,
  meaning_vn: e.vn,
  synonyms: "[]",
  phonetic: e.ipaUs[0] ?? e.ipaUk[0] ?? null,
  part_of_speech: e.pos,
  cefr_level: e.cefr,
  catalog_id: e.id,
}));

/** A learner's word made from a deck entry, known well (not young) unless `young` */
function learnerWord(id: string, young = false) {
  const e = entries.find((x) => x.id === id)!;
  return makeWord(`w-${id}`, {
    word: e.word,
    meaning_vn: e.vn,
    phonetic: e.ipaUs[0],
    part_of_speech: e.pos,
    cefr_level: e.cefr,
    catalog_id: e.id,
    srs: young ? { state: 1, stability: 0.5, reps: 1 } : reviewSrs(20, 5),
  });
}

const distance = (a: string, b: string) => soundDistance(ipaPhonemes(a), ipaPhonemes(b));

describe("phonetic similarity", () => {
  it("reads multi-character sounds and the stressed syllable", () => {
    expect(ipaPhonemes("/ˈtʃiːp/").units).toEqual(["tʃ", "iː", "p"]);
    const banana = ipaPhonemes("/bəˈnænə/");
    expect(banana.units).toEqual(["b", "ə", "n", "æ", "n", "ə"]);
    expect(banana.vowels).toBe(3);
    expect(banana.stress).toBe(1);
  });

  it("makes hard-to-hear swaps cheaper than unrelated ones", () => {
    expect(phonemeEditDistance(["ʃ", "ɪ", "p"], ["ʃ", "iː", "p"])).toBeLessThan(phonemeEditDistance(["ʃ", "ɪ", "p"], ["ʃ", "ɑ", "p"]));
    expect(distance("/ʃɪp/", "/ʃiːp/")).toBeLessThan(distance("/ʃɪp/", "/tɪp/"));
    expect(distance("/θɪŋk/", "/sɪŋk/")).toBeLessThan(distance("/θɪŋk/", "/pɪŋk/"));
  });

  it("finds minimal pairs close and unrelated words far", () => {
    expect(distance("/ʃɪp/", "/ʃiːp/")).toBeLessThan(0.15);
    expect(distance("/bəˈnænə/", "/ˈbænər/")).toBeLessThan(MAX_SOUND_ALIKE_DISTANCE);
    expect(distance("/bəˈnænə/", "/ˈpaɪplaɪn/")).toBeGreaterThan(MAX_SOUND_ALIKE_DISTANCE);
    expect(distance("", "/ʃɪp/")).toBe(Infinity);
  });
});

describe("sameWordFamily", () => {
  it("links inflections, derivations and negations", () => {
    expect(sameWordFamily("think", "thinking")).toBe(true);
    expect(sameWordFamily("deploy", "deployment")).toBe(true);
    expect(sameWordFamily("make", "making")).toBe(true);
    expect(sameWordFamily("happy", "unhappy")).toBe(true);
    expect(sameWordFamily("go", "went")).toBe(true);
  });

  it("keeps words that only start alike", () => {
    expect(sameWordFamily("app", "apple")).toBe(false);
    expect(sameWordFamily("ship", "sheep")).toBe(false);
    expect(sameWordFamily("ban", "banana")).toBe(false);
  });
});

describe("generateListeningQuestion", () => {
  const wrongWords = (target: ReturnType<typeof learnerWord>) =>
    generateListeningQuestion(target, DECK_POOL, []).options.filter((o) => !o.isCorrect).map((o) => o.word!);

  it("offers the deck words that sound most like the word heard", () => {
    for (let i = 0; i < 5; i++) {
      const wrong = wrongWords(learnerWord("ship"));
      expect(wrong).toHaveLength(3);
      // The closest sounds of the deck, whatever their level: sheep, chip, cheap, shop, shape ...
      for (const w of wrong) expect(distance("/ʃɪp/", DECK_POOL.find((p) => p.word === w)!.phonetic!)).toBeLessThan(0.3);
    }
  });

  it("never offers the same pronunciation, a form of the word, or itself", () => {
    for (let i = 0; i < 10; i++) {
      const light = wrongWords(learnerWord("light"));
      expect(light).not.toContain("light");
      // right and write are pronounced alike: at most one of them
      expect(light.filter((w) => w === "right" || w === "write").length).toBeLessThanOrEqual(1);
      expect(wrongWords(learnerWord("think"))).not.toContain("thinking");
    }
  });

  it("keeps the closest pairs for known cards", () => {
    const young = Array.from({ length: 10 }, () => wrongWords(learnerWord("ship", true))).flat();
    expect(young).not.toContain("sheep");
    const known = Array.from({ length: 10 }, () => wrongWords(learnerWord("ship"))).flat();
    expect(known).toContain("sheep");
  });

  it("gives every option its English word and IPA, the right one included", () => {
    const q = generateListeningQuestion(learnerWord("banana"), DECK_POOL, []);
    expect(q.options).toHaveLength(4);
    const right = q.options.find((o) => o.isCorrect)!;
    expect(right.word).toBe("banana");
    expect(right.phonetic).toBe("/bəˈnænə/");
    for (const o of q.options) expect(o.phonetic).toMatch(/^\/.+\/$/);
    expect(new Set(q.options.map((o) => o.text.toLowerCase())).size).toBe(4);
  });

  it("fills from the meaning-based options when no word sounds alike", () => {
    const odd = makeWord("odd", { word: "zzyzx", meaning_vn: "một từ lạ", phonetic: null });
    const pool = ["a", "b", "c", "d"].map((id) => makeWord(id, { word: `word${id}`, meaning_vn: `nghĩa ${id}` }));
    const q = generateListeningQuestion(odd, DECK_POOL, pool);
    expect(q.options).toHaveLength(4);
    expect(q.options.filter((o) => !o.isCorrect).every((o) => o.word?.startsWith("word"))).toBe(true);
  });
});

describe("loadCatalogSoundPool", () => {
  it("loads every deck word with its IPA from SQLite", async () => {
    await freshServices();
    const catalog = await import("@/services/vocabCatalog");
    const deck = entries.filter((e) => ["ship", "sheep", "chip", "banana"].includes(e.id));
    await catalog.ensureCatalogSeeded(async () => ({ version: catalog.CATALOG_VERSION, words: deck }));
    const pool = await catalog.loadCatalogSoundPool();
    expect(pool.map((w) => w.word).sort()).toEqual(["banana", "chip", "sheep", "ship"]);
    expect(pool.find((w) => w.word === "sheep")?.phonetic).toBe("/ʃiːp/");
    expect(catalog.catalogSoundPoolIfLoaded()).toBe(pool);
  });

  it("is released after a few minutes without a listening question, and reloads on the next one", async () => {
    await freshServices();
    const catalog = await import("@/services/vocabCatalog");
    const deck = entries.filter((e) => ["ship", "sheep"].includes(e.id));
    await catalog.ensureCatalogSeeded(async () => ({ version: catalog.CATALOG_VERSION, words: deck }));
    vi.useFakeTimers();
    try {
      await catalog.loadCatalogSoundPool();
      vi.advanceTimersByTime(catalog.SOUND_POOL_IDLE_MS - 1000);
      // Used again: kept for another full period
      expect(catalog.catalogSoundPoolIfLoaded()).not.toBeNull();
      vi.advanceTimersByTime(catalog.SOUND_POOL_IDLE_MS - 1000);
      expect(catalog.catalogSoundPoolIfLoaded()).not.toBeNull();
      vi.advanceTimersByTime(catalog.SOUND_POOL_IDLE_MS + 1);
      expect(catalog.catalogSoundPoolIfLoaded()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
    expect((await catalog.loadCatalogSoundPool()).map((w) => w.word).sort()).toEqual(["sheep", "ship"]);
  });
});
