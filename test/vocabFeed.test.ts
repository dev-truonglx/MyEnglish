import { describe, it, expect } from "vitest";
import { Rating } from "ts-fsrs";
import type { CatalogEntry, StudyLevel } from "@/services/vocabCatalog";
import { defaultStudyLevelsFor, normalizeStudyLevels, pickLevelSequence } from "@/services/vocabFeed";
import { freshServices } from "./helpers";

function entry(word: string, cefr: StudyLevel, order: number, extra: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: word,
    word,
    cefr,
    list: 3000,
    order,
    freq: order,
    it: false,
    pos: "noun",
    vn: `nghĩa của ${word}`,
    senses: [{ pos: "noun", vn: `nghĩa của ${word}` }],
    ipaUs: [`/${word}/`],
    ipaUk: [`/${word}/`],
    variants: [],
    irregular: [],
    examples: [{ en: `I see the ${word} here.`, vi: "Tôi thấy nó ở đây.", focus: [word] }],
    ...extra,
  };
}

// A small deck: 10 A1 words (two IT words late in the frequency order), 10 A2, 5 B1, and "may"/"May"
const DECK: CatalogEntry[] = [
  ...Array.from({ length: 8 }, (_, i) => entry(`aone${i}`, "A1", i + 1)),
  entry("server", "A1", 50, { it: true }),
  entry("laptop", "A1", 60, { it: true }),
  ...Array.from({ length: 10 }, (_, i) => entry(`atwo${i}`, "A2", 100 + i)),
  ...Array.from({ length: 5 }, (_, i) => entry(`bone${i}`, "B1", 200 + i)),
  entry("colour", "B1", 300, { variants: ["color"] }),
  entry("may", "A2", 400, { pos: "modal verb" }),
  entry("May", "A2", 401),
];

async function setup(newCardsPerDay = 10) {
  const services = await freshServices();
  const catalog = await import("@/services/vocabCatalog");
  await catalog.ensureCatalogSeeded(async () => ({ version: catalog.CATALOG_VERSION, words: DECK }));
  services.srs.saveStudyLimits({ newCardsPerDay, maxSessionSize: 30 });
  const feed = await import("@/services/vocabFeed");
  const recorder = await import("@/services/reviewRecorder");
  return { ...services, catalog, feed, recorder };
}

/** Words in `words` in the order they will be introduced */
async function introductionOrder(db: Awaited<ReturnType<typeof setup>>["db"]) {
  const words = await db.getAllWords();
  return words
    .filter((w) => (w.srs.reps ?? 0) === 0)
    .sort((a, b) => a.srs.next_review_date.localeCompare(b.srs.next_review_date) || a.created_at.localeCompare(b.created_at));
}

describe("study levels", () => {
  it("always start at A1 and stay contiguous", () => {
    expect(normalizeStudyLevels(["B1"])).toEqual(["A1", "A2", "B1"]);
    expect(normalizeStudyLevels(["A1", "B2"])).toEqual(["A1", "A2", "B1", "B2"]);
    expect(normalizeStudyLevels([])).toEqual(["A1"]);
    expect(defaultStudyLevelsFor("B2")).toEqual(["A1", "A2", "B1", "B2"]);
    expect(defaultStudyLevelsFor(null)).toEqual(["A1"]);
  });

  it("mixes levels k:…:1, lower levels more often, skipping levels with nothing left", () => {
    const count = (seq: string[]) => seq.reduce<Record<string, number>>((m, l) => ({ ...m, [l]: (m[l] ?? 0) + 1 }), {});
    expect(count(pickLevelSequence(["A1", "A2"], {}, { A1: 99, A2: 99 }, 6))).toEqual({ A1: 4, A2: 2 });
    expect(count(pickLevelSequence(["A1", "A2", "B1"], {}, { A1: 99, A2: 99, B1: 99 }, 12))).toEqual({ A1: 6, A2: 4, B1: 2 });
    expect(pickLevelSequence(["A1", "A2"], {}, { A1: 0, A2: 3 }, 5)).toEqual(["A2", "A2", "A2"]);
    // One word at a time keeps the ratio (the counts carry over between top-ups)
    const drawn = {};
    const oneByOne = Array.from({ length: 6 }, () => pickLevelSequence(["A1", "A2"], drawn, { A1: 99, A2: 99 }, 1)[0]);
    expect(oneByOne).toEqual(["A1", "A2", "A1", "A1", "A2", "A1"]);
  });
});

describe("feeding words from the deck", () => {
  it("adds nothing before the levels are chosen, then keeps a buffer of budget + 5, IT words first", async () => {
    const { feed, db } = await setup(4);
    expect(await feed.topUpNewWords()).toEqual({ added: 0, exhausted: false });

    feed.setStudyLevels(["A1"]);
    expect(await feed.topUpNewWords()).toEqual({ added: 9, exhausted: false });
    const order = await introductionOrder(db);
    expect(order.map((w) => w.word).slice(0, 3)).toEqual(["server", "laptop", "aone0"]);
    expect(order[0]).toMatchObject({ topic: "A1", cefr_level: "A1", catalog_id: "server", phonetic: "/server/" });
    expect(order[0].examples[0]).toMatchObject({ sentence_vn: "Tôi thấy nó ở đây.", source: "catalog" });

    // Full buffer: nothing to add
    expect((await feed.topUpNewWords()).added).toBe(0);
    // Two words studied: two more come in; then the level runs out
    await db.getDatabase();
    const srs = await import("@/services/srs");
    await srs.recordReview(order[0].id, Rating.Good);
    await srs.recordReview(order[1].id, Rating.Good);
    expect(await feed.topUpNewWords()).toEqual({ added: 1, exhausted: true });
  });

  it("mixes the chosen levels 2:1 and drops unstarted words of a level no longer chosen", async () => {
    const { feed, db } = await setup(4);
    feed.setStudyLevels(["A1", "A2"]);
    await feed.topUpNewWords();
    const levels = (await introductionOrder(db)).map((w) => w.cefr_level);
    expect(levels).toEqual(["A1", "A2", "A1", "A1", "A2", "A1", "A1", "A2", "A1"]);

    await feed.changeStudyLevels(["A1"]);
    const after = await introductionOrder(db);
    expect(after.every((w) => w.cefr_level === "A1")).toBe(true);
    expect(after).toHaveLength(9);
  });

  it("finds a word ignoring case (lower case first) and by another spelling", async () => {
    const { catalog } = await setup();
    expect((await catalog.findCatalogWord("may")).map((e) => e.id)).toEqual(["may", "May"]);
    expect((await catalog.findCatalogWord("color")).map((e) => e.id)).toEqual(["colour"]);
    expect(await catalog.findCatalogWord("deploy")).toEqual([]);
  });

  it("learns a word early: first of the new words, even from a level not chosen", async () => {
    const { feed, db } = await setup(4);
    feed.setStudyLevels(["A1"]);
    await feed.topUpNewWords();
    expect(await feed.learnEarly("colour")).toBe("added");
    expect((await introductionOrder(db))[0].word).toBe("colour");
    expect(await feed.learnEarly("aone5")).toBe("moved");
    expect((await introductionOrder(db))[0].word).toBe("aone5");
    expect((await feed.pullWordFromDeck("deploy")).status).toBe("not_in_deck");
  });

  it("accepts the deck's other spellings and forms once the word is loaded", async () => {
    const { feed, db, smart } = await setup();
    await feed.learnEarly("colour");
    await db.getAllWords();
    expect(smart.matchTypedAnswer("color", "colour")).toBe("exact");
    expect(smart.maskWordInSentence("Pick two colors.", "colour")).toBe("Pick two ______.");
  });

  it("offers unseen deck words of the chosen levels as wrong options", async () => {
    const { feed, catalog } = await setup(4);
    feed.setStudyLevels(["A1"]);
    await feed.topUpNewWords();
    const pool = await catalog.loadCatalogDistractors(["A1"]);
    expect(pool.map((w) => w.word)).toEqual(["aone7"]); // the other A1 words are already in the buffer
    expect(pool[0]).toMatchObject({ meaning_vn: "nghĩa của aone7", topic: "A1" });
  });
});

describe("words the learner already knows", () => {
  it("are scheduled as Easy outside the new-word budget, recall only after a real review", async () => {
    const { feed, db, smart, srs, recorder } = await setup(4);
    feed.setStudyLevels(["A1"]);
    await feed.topUpNewWords();
    const [first] = await introductionOrder(db);

    expect(await recorder.markWordKnown(first.id)).toBe(true);
    expect(await recorder.markWordKnown(first.id)).toBe(false); // already scheduled
    const known = (await db.getWordsByIds([first.id]))[0];
    expect(known.srs.state).toBe(2);
    expect(known.srs.stability).toBeGreaterThan(5);
    expect(known.srsProduction ?? null).toBeNull();
    expect(await smart.getNewCardsIntroducedToday()).toEqual({ recognition: 0, production: 0 });

    // Its first real review (here: answered now) opens recall practice; recognition stays outside the budget
    await srs.recordReview(first.id, Rating.Good);
    expect((await db.getWordsByIds([first.id]))[0].srsProduction).not.toBeNull();
    expect((await smart.getNewCardsIntroducedToday()).recognition).toBe(0);
    // …but its recall card is a new card that uses the budget like any other
    await srs.recordReview(first.id, Rating.Good, "production");
    await smart.saveReviewLog({
      wordId: first.id,
      exerciseType: "spelling",
      responseTimeMs: 3000,
      isCorrect: true,
      wrongAttempts: 0,
      rating: Rating.Good,
      xpEarned: 0,
      timestamp: new Date().toISOString(),
      isScheduled: true,
      direction: "production",
    });
    expect(await smart.getNewCardsIntroducedToday()).toEqual({ recognition: 0, production: 1 });
  });

  it("can be skimmed in bulk; progress counts them per level", async () => {
    const { feed } = await setup(4);
    feed.setStudyLevels(["A1", "A2"]);
    await feed.topUpNewWords();
    const next = await feed.nextUnstudiedEntries("A1", 30);
    expect(next.map((e) => e.word).slice(0, 2)).toEqual(["server", "laptop"]);
    expect(next).toHaveLength(10);

    expect(await feed.markCatalogWordsKnown(["server", "aone7", "atwo3"])).toBe(3);
    expect((await feed.nextUnstudiedEntries("A1", 30)).map((e) => e.word)).not.toContain("server");
    const progress = await feed.loadLevelProgress();
    expect(progress.find((p) => p.level === "A1")).toMatchObject({ met: 2, known: 2 });
    expect(progress.find((p) => p.level === "A2")).toMatchObject({ met: 1, known: 1 });
  });
});

describe("switching to the deck", () => {
  it("deletes the old words and their history, keeps grammar, XP and settings", async () => {
    const { db, srs } = await setup();
    const id = await db.insertEnrichedWord({ word: "legacy", meaning_vn: "cũ", synonyms: [], antonyms: [], examples: [] });
    await srs.recordReview(id, Rating.Good);
    localStorage.setItem("myenglish_mnemonics_v1", JSON.stringify({ [id]: "mẹo" }));
    localStorage.setItem("myenglish_xp_v1", "120");
    const conn = await db.getDatabase();
    await conn.execute(`INSERT INTO app_kv (key, value, updated_at) VALUES ('myenglish_mnemonics_v1', '{}', 'now')`);

    const reset = await import("@/services/vocabReset");
    expect(await reset.needsVocabMigration()).toBe(true);
    await reset.resetVocabulary();
    expect(await reset.needsVocabMigration()).toBe(false);
    expect(await db.getAllWords()).toEqual([]);
    expect(await conn.select(`SELECT * FROM review_logs`)).toEqual([]);
    expect(await conn.select(`SELECT * FROM app_kv WHERE key = 'myenglish_mnemonics_v1'`)).toEqual([]);
    expect(localStorage.getItem("myenglish_mnemonics_v1")).toBeNull();
    expect(localStorage.getItem("myenglish_xp_v1")).toBe("120");
    // The deck itself stays
    expect((await conn.select<Array<{ n: number }>>(`SELECT COUNT(*) AS n FROM vocab_catalog`))[0].n).toBe(DECK.length);
  });
});
