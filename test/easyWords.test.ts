import { describe, it, expect } from "vitest";
import {
  KNOWN_CHECK_MAX_DAYS,
  KNOWN_CHECK_MIN_DAYS,
  easyStatesFromEvents,
  isLevelSampled,
  knownCheckDays,
  levelQuota,
  levelStatsFromEvents,
  levelStatus,
  nextKnownCheckAt,
  pickKnownChecks,
  type EasyEventRow,
  type LevelCheckStats,
} from "@/services/easyWords";
import { classifyKnownWords, filterKnown } from "@/services/knownWords";
import { freshServices, makeWord, DAY_MS } from "./helpers";

const NOW = Date.now();
const ago = (d: number) => new Date(NOW - d * DAY_MS).toISOString();
const ev = (word_id: string | null, type: string, daysAgo: number, meta: Record<string, unknown> | null = null, level?: string): EasyEventRow => ({
  word_id,
  type,
  at: ago(daysAgo),
  meta: meta ? JSON.stringify(meta) : null,
  cefr_level: level ?? null,
});

describe("Đã biết: each word's state from its events", () => {
  it("a mark sets aside, a right check moves the next one, a wrong check sends it back, 'back' withdraws it", () => {
    const states = easyStatesFromEvents([
      // given out of order: sorted by time
      ev("ok", "easy_check", 10, { ok: true }),
      ev("ok", "easy_skip", 100),
      ev("missed", "easy_skip", 100),
      ev("missed", "easy_check", 5, { ok: false }),
      ev("back", "easy_skip", 50),
      ev("back", "easy_back", 40),
      ev("again", "easy_skip", 90),
      ev("again", "easy_back", 80),
      ev("again", "easy_skip", 20),
      ev("lonely", "easy_check", 3, { ok: true }),
    ]);
    expect(states.get("ok")).toEqual({ markedAt: ago(100), lastAt: ago(10), passedChecks: 1, parked: true, failedAt: null });
    expect(states.get("missed")).toMatchObject({ parked: false, failedAt: ago(5) });
    expect(states.has("back")).toBe(false);
    expect(states.get("again")).toMatchObject({ markedAt: ago(20), passedChecks: 0, parked: true });
    // A check with no mark before it sets nothing aside
    expect(states.has("lonely")).toBe(false);
  });
});

describe("Đã biết: when a word is checked again", () => {
  it("months apart, twice as far after each further right answer, never beyond the learner's maximum interval", () => {
    for (const id of ["a", "b", "word-123", "zzz"]) {
      const base = knownCheckDays(id, 0, 3650);
      expect(base).toBeGreaterThanOrEqual(KNOWN_CHECK_MIN_DAYS);
      expect(base).toBeLessThanOrEqual(KNOWN_CHECK_MAX_DAYS);
      expect(knownCheckDays(id, 1, 3650)).toBe(base);
      expect(knownCheckDays(id, 2, 3650)).toBe(base * 2);
      expect(knownCheckDays(id, 3, 3650)).toBe(base * 4);
      expect(knownCheckDays(id, 10, 200)).toBe(200);
      expect(knownCheckDays(id, 1, 30)).toBe(30);
    }
  });

  it("a never-checked word: the next day when its level is sampled, else after its first interval", () => {
    const state = { markedAt: ago(10), lastAt: ago(10), passedChecks: 0, parked: true, failedAt: null };
    expect(nextKnownCheckAt("a", state, true, 365)).toBe(ago(9));
    expect(nextKnownCheckAt("a", state, false, 365)).toBe(new Date(NOW - 10 * DAY_MS + knownCheckDays("a", 0, 365) * DAY_MS).toISOString());
    const checked = { ...state, lastAt: ago(3), passedChecks: 2 };
    expect(nextKnownCheckAt("a", checked, true, 365)).toBe(new Date(NOW - 3 * DAY_MS + knownCheckDays("a", 2, 365) * DAY_MS).toISOString());
  });
});

describe("Đã biết: checking a level", () => {
  it("50% or less: relearn; 90% or more: accepted; between: checked more; under 10 answers: still verifying", () => {
    expect(levelStatus(5, 10)).toBe("relearn");
    expect(levelStatus(9, 10)).toBe("accepted");
    expect(levelStatus(6, 10)).toBe("checking");
    expect(levelStatus(7, 10)).toBe("checking");
    expect(levelStatus(8, 9)).toBe("verifying");
  });

  it("counts each level's last 20 checks since the level was last sent back", () => {
    const rows: EasyEventRow[] = [];
    // C1: 4 wrong long ago, then 20 right: only the last 20 count
    for (let i = 0; i < 4; i++) rows.push(ev(`c${i}`, "easy_check", 50 - i, { ok: false }, "C1"));
    for (let i = 0; i < 20; i++) rows.push(ev(`d${i}`, "easy_check", 40 - i, { ok: true }, "C1"));
    // B1: 6 wrong, then the level was sent back, then 2 right
    for (let i = 0; i < 6; i++) rows.push(ev(`b${i}`, "easy_check", 30 - i, { ok: false }, "B1"));
    rows.push(ev(null, "easy_level_reset", 20, { level: "B1", sent: 40, correct: 0, total: 6 }));
    rows.push(ev("b9", "easy_check", 10, { ok: true }, "B1"), ev("b8", "easy_check", 9, { ok: true }, "B1"));
    const stats = levelStatsFromEvents(rows);
    expect(stats.get("C1")).toMatchObject({ correct: 20, total: 20, status: "accepted", resetAt: null });
    expect(stats.get("B1")).toMatchObject({ correct: 2, total: 2, status: "verifying", resetAt: ago(20) });
  });

  it("higher levels and doubtful levels get more checks; a big claim is sampled right away", () => {
    const checking = { level: "A2", correct: 7, total: 10, status: "checking" } as LevelCheckStats;
    expect(levelQuota("A1", undefined)).toBe(2);
    expect(levelQuota("C1", undefined)).toBe(3);
    expect(levelQuota("A2", checking)).toBe(5);
    expect(isLevelSampled(undefined, 25)).toBe(true);
    expect(isLevelSampled(undefined, 3)).toBe(false);
    expect(isLevelSampled(checking, 3)).toBe(true);
    expect(isLevelSampled({ ...checking, status: "accepted" }, 500)).toBe(false);
  });
});

describe("Đã biết: picking a session's checks", () => {
  const newSrs = { state: 0, reps: 0 } as const;
  const words = [
    ...Array.from({ length: 25 }, (_, i) => makeWord(`c1-${i}`, { cefr_level: "C1", suspended: 1, srs: newSrs })),
    ...Array.from({ length: 25 }, (_, i) => makeWord(`a1-${i}`, { cefr_level: "A1", suspended: 1, srs: newSrs })),
    // A few B1 words marked one by one: not sampled, they wait for their timed check
    ...Array.from({ length: 3 }, (_, i) => makeWord(`b1-${i}`, { cefr_level: "B1", suspended: 1, srs: newSrs })),
    makeWord("b1-old", { cefr_level: "B1", suspended: 1, srs: newSrs }),
    // Marked during reviews with an FSRS history: checked only once FSRS has it due
    makeWord("b2-notdue", { cefr_level: "B2", suspended: 1, srs: { state: 2, reps: 6, stability: 40, last_review: ago(10), next_review_date: ago(-30) } }),
    makeWord("b2-due", { cefr_level: "B2", suspended: 1, srs: { state: 2, reps: 6, stability: 40, last_review: ago(200), next_review_date: ago(100) } }),
    // Marked today: not before tomorrow
    makeWord("c1-today", { cefr_level: "C1", suspended: 1, srs: newSrs }),
    // Resumed on another machine (not suspended any more): back on the schedule, never checked
    makeWord("a1-resumed", { cefr_level: "A1", suspended: 0, srs: newSrs }),
  ];
  const states = easyStatesFromEvents([
    ...words.filter((w) => !["b1-old", "b2-notdue", "b2-due", "c1-today"].includes(w.id)).map((w) => ev(w.id, "easy_skip", 2)),
    ev("b1-old", "easy_skip", 200),
    ev("b2-notdue", "easy_skip", 200),
    ev("b2-due", "easy_skip", 200),
    ev("c1-today", "easy_skip", 0),
  ]);
  const ids = (picked: Array<{ id: string }>) => picked.map((w) => w.id);
  const levelOfId = (id: string) => id.split("-")[0];

  it("a few per level, higher levels first, only words whose check has come", () => {
    const picked = ids(pickKnownChecks(words, states, new Map(), new Date(NOW), () => 0.5, 50));
    const perLevel = picked.reduce<Record<string, number>>((acc, id) => ({ ...acc, [levelOfId(id)]: (acc[levelOfId(id)] ?? 0) + 1 }), {});
    expect(perLevel).toEqual({ c1: 3, b2: 1, b1: 1, a1: 2 });
    expect(picked).toContain("b2-due");
    expect(picked).toContain("b1-old");
    expect(picked).not.toContain("c1-today");
    expect(picked).not.toContain("a1-resumed");
    // Higher levels come first
    expect(picked.map(levelOfId)).toEqual(["c1", "c1", "c1", "b2", "b1", "a1", "a1"]);
  });

  it("a level answered badly is asked more; the session's total keeps the higher levels", () => {
    const levels = new Map([["A1", { level: "A1", correct: 6, total: 10, status: "checking", resetAt: null } as LevelCheckStats]]);
    const picked = ids(pickKnownChecks(words, states, levels, new Date(NOW), () => 0.5, 50));
    expect(picked.filter((id) => id.startsWith("a1-"))).toHaveLength(5);
    expect(ids(pickKnownChecks(words, states, new Map(), new Date(NOW), () => 0.5, 4)).map(levelOfId)).toEqual(["c1", "c1", "c1", "b2"]);
  });

  it("drawn at random within a level", () => {
    const seen = new Set<string>();
    for (const r of [0, 0.3, 0.6, 0.99]) for (const id of ids(pickKnownChecks(words, states, new Map(), new Date(NOW), () => r, 3))) seen.add(id);
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe("Đã biết list", () => {
  it("marks set aside are waiting or confirmed by their checks, a missed check is failed, old marks keep their way", () => {
    const words = [
      makeWord("new", { suspended: 1, cefr_level: "B1" }),
      makeWord("passed", { suspended: 1, cefr_level: "B1" }),
      makeWord("missed", { suspended: 0, cefr_level: "B1" }),
      makeWord("legacy", { srs: { state: 2, reps: 1, lapses: 0, stability: 60, last_review: ago(2), next_review_date: ago(-50) } }),
      // Suspended for another reason (a leech): not a known word
      makeWord("leech", { suspended: 1, srs: { state: 2, reps: 9, lapses: 6, stability: 2, last_review: ago(5) } }),
    ];
    const easy = easyStatesFromEvents([
      ev("new", "easy_skip", 3),
      ev("passed", "easy_skip", 90),
      ev("passed", "easy_check", 10, { ok: true }),
      ev("missed", "easy_skip", 30),
      ev("missed", "easy_check", 5, { ok: false }),
    ]);
    const byId = Object.fromEntries(classifyKnownWords(words, new Map(), easy).map((e) => [e.word.id, e]));
    expect(byId.new).toMatchObject({ status: "waiting", markedAt: ago(3), checkAt: null, passedChecks: 0 });
    expect(byId.passed).toMatchObject({ status: "confirmed", passedChecks: 1 });
    expect(byId.passed.checkAt).toBe(nextKnownCheckAt("passed", easy.get("passed")!, false));
    expect(byId.missed).toMatchObject({ status: "failed", markedAt: ago(30) });
    expect(byId.legacy).toMatchObject({ status: "waiting", legacy: true });
    expect(byId.leech).toBeUndefined();

    const entries = Object.values(byId);
    const base = { level: "all", result: "all" as const, query: "", sort: "check" as const };
    expect(filterKnown(entries, { ...base, view: "waiting" }).map((e) => e.word.id).sort()).toEqual(["legacy", "new"]);
    expect(filterKnown(entries, { ...base, view: "checked" }).map((e) => e.word.id).sort()).toEqual(["missed", "passed"]);
  });
});

describe("Đã biết never touches FSRS", () => {
  const input = (word: string) => ({
    word,
    meaning_vn: "nghĩa",
    synonyms: [],
    antonyms: [],
    examples: [{ sentence_en: `The ${word} works.`, grammar_analysis: "S + V" }],
  });

  it("a word with a history: cards, review logs and training data stay; it leaves the queue and comes back on a missed check", async () => {
    const { db } = await freshServices();
    const known = await import("@/services/easyWords");
    const optimizer = await import("@/services/fsrsOptimizer");
    const conn = await db.getDatabase();
    const id = await db.insertEnrichedWord(input("cache"));
    await conn.execute(
      `UPDATE srs_reviews SET state = 2, reps = 5, lapses = 0, stability = 30, difficulty = 4, last_review = $1, next_review_date = $2 WHERE word_id = $3`,
      [ago(40), ago(10), id]
    );
    const insertLog = (daysAgo: number) =>
      conn.execute(
        `INSERT INTO review_logs (id, word_id, exercise_type, response_time_ms, is_correct, wrong_attempts, rating, xp_earned, timestamp, is_scheduled, direction)
         VALUES ($1, $2, 'multiple_choice', 1000, 1, 0, 3, 0, $3, 1, 'recognition')`,
        [crypto.randomUUID(), id, ago(daysAgo)]
      );
    await insertLog(70);
    await insertLog(40);
    const card = async () => (await conn.select<Array<Record<string, unknown>>>(`SELECT * FROM srs_reviews WHERE word_id = $1`, [id]))[0];
    const logs = async () => conn.select<Array<Record<string, unknown>>>(`SELECT * FROM review_logs ORDER BY id`);
    const cardBefore = await card();
    const logsBefore = await logs();
    const trainingBefore = await optimizer.loadTrainingItems();
    expect((await db.getDueWordsFromDb()).map((w) => w.id)).toContain(id);

    await known.markWordEasy(id);
    expect(await card()).toEqual(cardBefore);
    expect(await logs()).toEqual(logsBefore);
    expect(await optimizer.loadTrainingItems()).toEqual(trainingBefore);
    expect((await db.getDueWordsFromDb()).map((w) => w.id)).not.toContain(id);
    const [w] = await db.getWordsByIds([id]);
    expect(known.isSetAsideEasy(w, await known.loadEasyStates())).toBe(true);

    expect((await known.recordKnownCheck(w, true)).relearned).toBe(0);
    expect((await known.loadEasyStates()).get(id)?.passedChecks).toBe(1);
    expect((await db.getDueWordsFromDb()).map((w) => w.id)).not.toContain(id);
    await known.recordKnownCheck(w, false);
    expect((await known.loadEasyStates()).get(id)?.parked).toBe(false);
    expect((await db.getDueWordsFromDb()).map((w) => w.id)).toContain(id);
    expect(await card()).toEqual(cardBefore);
    expect(await logs()).toEqual(logsBefore);
  });

  it("a level answered half wrong: its unconfirmed words go back to learning, the confirmed ones stay", async () => {
    const { db } = await freshServices();
    const known = await import("@/services/easyWords");
    const conn = await db.getDatabase();
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) ids.push(await db.insertEnrichedWord(input(`word${i}`)));
    await conn.execute(`UPDATE words SET cefr_level = 'C1'`);
    expect(await known.markWordsEasyBatch(ids, new Date(NOW - 3 * DAY_MS))).toBe(30);
    expect(await known.markWordsEasyBatch(ids)).toBe(0);
    expect(await db.getDueWordsFromDb()).toEqual([]);

    const byId = new Map((await db.getWordsByIds(ids)).map((w) => [w.id, w]));
    const words = ids.map((id) => byId.get(id)!);
    const answers = [true, true, true, true, true, false, false, false, false, false];
    const outcomes = [];
    for (const [i, ok] of answers.entries()) outcomes.push(await known.recordKnownCheck(words[i], ok));
    expect(outcomes[8]).toMatchObject({ relearned: 0, stats: { status: "verifying", total: 9 } });
    // The 10th answer brings C1 to 5/10: the 20 words never checked go back with the 5 missed ones
    expect(outcomes[9]).toMatchObject({ level: "C1", relearned: 20, stats: { correct: 5, total: 10, status: "relearn" } });

    const states = await known.loadEasyStates();
    expect([...states.values()].filter((s) => s.parked)).toHaveLength(5);
    expect((await db.getDueWordsFromDb()).map((w) => w.id).sort()).toEqual(ids.slice(5).sort());
    expect(known.levelStatsFromEvents(await known.loadKnownEvents()).get("C1")).toMatchObject({ total: 0, status: "verifying" });
    // Nothing reached FSRS or the review logs
    const cards = await conn.select<Array<{ n: number }>>(`SELECT COUNT(*) AS n FROM srs_reviews WHERE COALESCE(reps, 0) > 0 OR COALESCE(state, 0) != 0`);
    expect(Number(cards[0].n)).toBe(0);
    const logs = await conn.select<Array<{ n: number }>>(`SELECT COUNT(*) AS n FROM review_logs`);
    expect(Number(logs[0].n)).toBe(0);
  });

  it("a session gets its checks after the first card, as unsuspended check cards; none when nothing is marked", async () => {
    const { db } = await freshServices();
    const known = await import("@/services/easyWords");
    const cards = await import("@/services/cards");
    const conn = await db.getDatabase();
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) ids.push(await db.insertEnrichedWord(input(`word${i}`)));
    const [first, second] = await db.getWordsByIds([await db.insertEnrichedWord(input("alpha")), await db.insertEnrichedWord(input("beta"))]);
    const session = [cards.toCard(first, "recognition"), cards.toCard(second, "recognition")];
    expect(await known.addKnownChecks(session, await db.getAllWords())).toEqual(session);

    await conn.execute(`UPDATE words SET cefr_level = 'C1' WHERE id IN (${ids.map((_, i) => `$${i + 1}`).join(", ")})`, ids);
    await known.markWordsEasyBatch(ids, new Date(NOW - 3 * DAY_MS));
    const out = await known.addKnownChecks(session, await db.getAllWords(), new Date(), () => 0.99);
    expect(out).toHaveLength(5);
    expect(out[0]).toBe(session[0]);
    const checks = out.filter((c) => c.easyCheck);
    expect(checks).toHaveLength(3);
    for (const c of checks) expect(c).toMatchObject({ suspended: 0, direction: "recognition" });
  });

  it("a new word marked after its introduction leaves its place in the day's new words", async () => {
    const { db, smart } = await freshServices();
    const known = await import("@/services/easyWords");
    const recorder = await import("@/services/reviewRecorder");
    const a = await db.insertEnrichedWord(input("queue"));
    const [card] = await db.getWordsByIds([a]);
    await recorder.recordIntro({ ...card, direction: "recognition", srsRecognition: card.srs });
    expect((await smart.getNewCardsIntroducedToday()).recognition).toBe(1);
    await known.markWordEasy(a);
    expect((await smart.getNewCardsIntroducedToday()).recognition).toBe(0);
  });

  it("undo and resuming by hand send it back; resuming a word never marked logs nothing", async () => {
    const { db } = await freshServices();
    const known = await import("@/services/easyWords");
    const recorder = await import("@/services/reviewRecorder");
    const conn = await db.getDatabase();
    const a = await db.insertEnrichedWord(input("queue"));
    const b = await db.insertEnrichedWord(input("stack"));

    await known.markWordEasy(a);
    await known.unmarkWordEasy(a);
    expect((await known.loadEasyStates()).has(a)).toBe(false);
    expect((await db.getWordsByIds([a]))[0].suspended ?? 0).toBe(0);

    // Resumed from the word's page: the mark ends, so a later suspension (a leech) is not taken for one
    await known.markWordEasy(a);
    await recorder.setWordSuspended(a, false);
    await known.releaseEasyMark(a);
    await recorder.setWordSuspended(a, true);
    expect((await known.loadEasyStates()).has(a)).toBe(false);

    const count = async () =>
      (await conn.select<Array<{ n: number }>>(`SELECT COUNT(*) AS n FROM learning_events WHERE word_id = $1`, [b]))[0].n;
    await known.releaseEasyMark(b);
    expect(await count()).toBe(0);
  });
});
