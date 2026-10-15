import { describe, it, expect } from "vitest";
import { Rating } from "ts-fsrs";
import type { CatalogEntry } from "@/services/vocabCatalog";
import type { PulledRow, SyncRow, SyncTransport, XpRow } from "@/services/sync/types";
import { mergeKv, SYNCED_KV, wordKey } from "@/services/sync/keys";
import { initialLedger, mergeXp, BASE_DAY } from "@/services/sync/xpLedger";
import { freshServices } from "./helpers";

function entry(word: string, order: number): CatalogEntry {
  return {
    id: word, word, cefr: "A1", list: 3000, order, freq: order, it: false, pos: "noun", vn: `nghĩa của ${word}`,
    senses: [{ pos: "noun", vn: `nghĩa của ${word}` }], ipaUs: [`/${word}/`], ipaUk: [`/${word}/`],
    variants: [], irregular: [],
    examples: [{ en: `I see the ${word} here.`, vi: "Tôi thấy nó.", focus: [word], senseIndex: 0 }],
  };
}
const DECK = ["apple", "banana", "cherry", "date"].map((w, i) => entry(w, i + 1));

/** Progress of a row as the server derives it: the review count of cards, lessons and mistakes */
const progOf = (r: { kind: string; data: Record<string, unknown> }) =>
  ["card", "grammar", "mistake"].includes(r.kind) ? Number(r.data.reps ?? 0) : 0;

/** The server side of the account: more progress wins, the later `ts` breaks a tie; logs and events only added */
function fakeServer() {
  const rows = new Map<string, PulledRow>();
  const xp = new Map<string, XpRow>();
  const profiles: Array<{ level: number; streak: number }> = [];
  let clock = 0;
  const pushed: SyncRow[] = [];
  const xpSince: Array<string | null | undefined> = [];
  const server = { epoch: 0 };
  const stamp = () => new Date(Date.UTC(2026, 0, 1) + ++clock * 1000).toISOString();
  const transport = (): SyncTransport => ({
    async push(batch) {
      for (const r of batch) {
        pushed.push(r);
        const id = `${r.kind}|${r.key}`;
        const cur = rows.get(id);
        if (cur && (r.kind === "log" || r.kind === "event")) continue;
        if (cur && (progOf(cur) > progOf(r) || (progOf(cur) === progOf(r) && cur.ts >= r.ts))) continue;
        rows.set(id, { ...r, updated_at: stamp() });
      }
    },
    async pull(since, limit) {
      return [...rows.values()].filter((r) => r.updated_at > since).sort((a, b) => a.updated_at.localeCompare(b.updated_at)).slice(0, limit);
    },
    async pushXp(batch) {
      for (const r of batch) {
        const id = `${r.device_id}|${r.day}`;
        const cur = xp.get(id);
        if (r.day === BASE_DAY && cur) continue;
        xp.set(id, { ...r, xp: Math.max(r.xp, cur?.xp ?? 0), updated_at: stamp() } as XpRow);
      }
    },
    async pullXp(since) {
      xpSince.push(since);
      const all = [...xp.values()] as Array<XpRow & { updated_at: string }>;
      return since ? all.filter((r) => r.updated_at > since) : all;
    },
    async pushProfile(s) {
      profiles.push(s);
    },
    async getEpoch() {
      return server.epoch;
    },
  });
  return { rows, xp, profiles, pushed, transport, xpSince, server };
}

/** A fresh machine: new database, new localStorage, the deck seeded */
async function device() {
  const services = await freshServices();
  (globalThis.localStorage as Storage).clear();
  const catalog = await import("@/services/vocabCatalog");
  await catalog.ensureCatalogSeeded(async () => ({ version: catalog.CATALOG_VERSION, words: DECK }));
  const feed = await import("@/services/vocabFeed");
  const recorder = await import("@/services/reviewRecorder");
  const engine = await import("@/services/sync/engine");
  const state = await import("@/services/sync/state");
  const conn = await services.db.getDatabase();
  return { ...services, catalog, feed, recorder, engine, state, conn };
}
type Device = Awaited<ReturnType<typeof device>>;

async function addDeckWord(d: Device, word: string) {
  const [e] = await d.catalog.getCatalogEntries([word]);
  const ids = await d.db.insertCatalogWords([d.feed.toCatalogWordInput(e, new Date(Date.now() - 86400000).toISOString())]);
  return ids.get(word)!;
}

async function review(d: Device, id: string, rating = Rating.Good) {
  await d.srs.recordReview(id, rating, "recognition");
  await d.smart.saveReviewLog({
    wordId: id, exerciseType: "flip", responseTimeMs: 1000, isCorrect: true, wrongAttempts: 0, rating, xpEarned: 10,
    timestamp: new Date().toISOString(), isScheduled: true, direction: "recognition",
  });
}

async function card(d: Device, wordKeyText: string) {
  const rows = await d.conn.select<Array<Record<string, unknown>>>(
    `SELECT s.* FROM srs_reviews s JOIN words w ON w.id = s.word_id WHERE w.catalog_id = $1`, [wordKeyText]);
  return rows[0];
}

describe("cloud sync", () => {
  it("moves cards, logs, XP and settings to a second machine, creating deck words from its own deck", async () => {
    const server = fakeServer();
    const a = await device();
    const id = await addDeckWord(a, "apple");
    await review(a, id);
    a.smart.awardXP(25);
    localStorage.setItem("myenglish_daily_goal_v1", "17");
    const cardA = await card(a, "apple");
    const report = await a.engine.syncNow(server.transport(), "user-1");
    expect(report.pushed).toBeGreaterThan(0);

    const b = await device();
    expect(await card(b, "apple")).toBeUndefined();
    await b.engine.syncNow(server.transport(), "user-1");
    const cardB = await card(b, "apple");
    expect(cardB).toBeDefined();
    expect(cardB.stability).toBe(cardA.stability);
    expect(cardB.last_review).toBe(cardA.last_review);
    const logs = await b.conn.select<Array<{ n: number }>>(`SELECT COUNT(*) AS n FROM review_logs`);
    expect(logs[0].n).toBe(1);
    expect(localStorage.getItem("myenglish_daily_goal_v1")).toBe("17");
    expect(b.smart.getXPState().totalXP).toBe(25);
  });

  it("is idempotent: a second pass pushes nothing and changes nothing", async () => {
    const server = fakeServer();
    const a = await device();
    await review(a, await addDeckWord(a, "banana"));
    await a.engine.syncNow(server.transport(), "user-1");
    const second = await a.engine.syncNow(server.transport(), "user-1");
    expect(second.pushed).toBe(0);
    expect(second.applied).toBe(0);
    const b = await device();
    await b.engine.syncNow(server.transport(), "user-1");
    const again = await b.engine.syncNow(server.transport(), "user-1");
    expect(again.pushed).toBe(0);
    expect(again.applied).toBe(0);
  });

  it("keeps the later review of a card when two machines changed it", async () => {
    const server = fakeServer();
    const a = await device();
    const idA = await addDeckWord(a, "cherry");
    await review(a, idA, Rating.Good);
    await a.engine.syncNow(server.transport(), "user-1");

    const b = await device();
    await b.engine.syncNow(server.transport(), "user-1");
    const idB = (await b.conn.select<Array<{ id: string }>>(`SELECT id FROM words WHERE catalog_id = 'cherry'`))[0].id;
    await new Promise((r) => setTimeout(r, 15));
    await review(b, idB, Rating.Easy);
    const later = await card(b, "cherry");
    await b.engine.syncNow(server.transport(), "user-1");

    await a.engine.syncNow(server.transport(), "user-1");
    const onA = await card(a, "cherry");
    expect(onA.last_review).toBe(later.last_review);
    expect(onA.stability).toBe(later.stability);
  });

  it("keeps the card that is further along even when the other machine reviewed later", async () => {
    const server = fakeServer();
    const a = await device();
    const idA = await addDeckWord(a, "date");
    await review(a, idA);
    await a.engine.syncNow(server.transport(), "user-1");

    const b = await device();
    await b.engine.syncNow(server.transport(), "user-1");
    const idB = (await b.conn.select<Array<{ id: string }>>(`SELECT id FROM words WHERE catalog_id = 'date'`))[0].id;

    // A studies the card twice more (3 reviews); B, which has not synced since, reviews it once, later (2 reviews)
    await review(a, idA);
    await review(a, idA);
    const ahead = await card(a, "date");
    await new Promise((r) => setTimeout(r, 15));
    await review(b, idB);
    const behindButLater = await card(b, "date");
    expect(Number(behindButLater.reps)).toBe(2);
    expect(String(behindButLater.last_review) > String(ahead.last_review)).toBe(true);

    await a.engine.syncNow(server.transport(), "user-1"); // A reaches the server first
    await b.engine.syncNow(server.transport(), "user-1"); // B's later but shorter history must not win

    for (const d of [a, b]) {
      const c = await card(d, "date");
      expect(Number(c.reps)).toBe(3);
      expect(c.last_review).toBe(ahead.last_review);
    }
    expect(server.rows.get("card|r:date")?.data.reps).toBe(3);
  });

  it("takes the later review when both machines are equally far along", async () => {
    const server = fakeServer();
    const a = await device();
    const idA = await addDeckWord(a, "apple");
    await review(a, idA);
    await a.engine.syncNow(server.transport(), "user-1");
    const b = await device();
    await b.engine.syncNow(server.transport(), "user-1");
    const idB = (await b.conn.select<Array<{ id: string }>>(`SELECT id FROM words WHERE catalog_id = 'apple'`))[0].id;
    await review(a, idA, Rating.Good);
    await new Promise((r) => setTimeout(r, 15));
    await review(b, idB, Rating.Easy);
    const later = await card(b, "apple");
    await a.engine.syncNow(server.transport(), "user-1");
    await b.engine.syncNow(server.transport(), "user-1");
    await a.engine.syncNow(server.transport(), "user-1");
    expect((await card(a, "apple")).last_review).toBe(later.last_review);
    expect(Number((await card(a, "apple")).reps)).toBe(2);
  });

  it("keeps the lesson with more reviews when two machines changed it", async () => {
    const server = fakeServer();
    const a = await device();
    const lesson = (reps: number, at: string) => [
      "ch01-l01", "passed", 80, 70, reps, 0, at, at, 1, 0, 3, 5, 2, at,
    ];
    const insert = `INSERT OR REPLACE INTO grammar_progress (lesson_id, diagnostic_status, score, mastery, reps, lapses, last_attempt_date,
      next_review_date, streak, first_try_bonus, stability, difficulty, fsrs_state, last_review) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`;
    await a.conn.execute(insert, lesson(5, "2026-10-10T10:00:00.000Z"));
    await a.engine.syncNow(server.transport(), "user-1");

    const b = await device();
    await b.conn.execute(insert, lesson(3, "2026-10-14T10:00:00.000Z")); // fewer reviews, later
    await b.engine.syncNow(server.transport(), "user-1");
    const row = (await b.conn.select<Array<{ reps: number }>>(`SELECT reps FROM grammar_progress WHERE lesson_id = 'ch01-l01'`))[0];
    expect(row.reps).toBe(5);
    expect(server.rows.get("grammar|ch01-l01")?.data.reps).toBe(5);
  });

  it("adds XP of two machines used on the same day instead of overwriting one", async () => {
    const server = fakeServer();
    const a = await device();
    a.smart.awardXP(100); // also covers XP earned before the ledger existed
    await a.engine.syncNow(server.transport(), "user-1");
    const b = await device();
    b.smart.awardXP(50);
    await b.engine.syncNow(server.transport(), "user-1");
    await a.engine.syncNow(server.transport(), "user-1");
    expect(a.smart.getXPState().totalXP).toBe(150);
    expect(b.smart.getXPState().totalXP).toBe(150);
    expect(a.smart.getXPState().todayXP).toBe(150);
    // XP earned after the sync keeps counting once
    a.smart.awardXP(10);
    await a.engine.syncNow(server.transport(), "user-1");
    await b.engine.syncNow(server.transport(), "user-1");
    expect(b.smart.getXPState().totalXP).toBe(160);
  });

  it("carries XP from before the ledger as an opening balance", async () => {
    const server = fakeServer();
    const a = await device();
    localStorage.setItem("myenglish_xp_v1", "500");
    localStorage.setItem("myenglish_xp_log_v1", JSON.stringify({ "2026-01-01": 120 }));
    await a.engine.syncNow(server.transport(), "user-1");
    const rows = [...server.xp.values()];
    expect(rows.find((r) => r.day === BASE_DAY)?.xp).toBe(380);
    expect(rows.find((r) => r.day === "2026-01-01")?.xp).toBe(120);
  });

  it("never sends the grammar book, secrets or machine settings", async () => {
    const server = fakeServer();
    const a = await device();
    for (const key of [
      "myenglish_gemini_api_key", "myenglish_custom_cli_path", "myenglish_grammar_hidden_items_v1",
      "myenglish_grammar_accepted_answers_v1", "myenglish_grammar_book_revision_v1", "myenglish_ui_scale_v1",
    ]) localStorage.setItem(key, "secret");
    localStorage.setItem("myenglish_daily_goal_v1", "12");
    await a.conn.execute(`INSERT INTO grammar_book_lessons (id, chapter_id, ord, data) VALUES ('l1', 'c1', 1, 'BOOK TEXT')`);
    await a.conn.execute(`INSERT INTO grammar_custom_exercises (id, lesson_id, type, prompt_en, correct_answer, explanation) VALUES ('e1','l1','mcq','BOOK PROMPT','x','y')`);
    await a.conn.execute(
      `INSERT INTO mistakes (id, wrong_text, right_text, source, created_at, next_review_date) VALUES ('m1','BOOK WRONG','BOOK RIGHT','grammar',$1,$1)`,
      [new Date().toISOString()]);
    await a.conn.execute(
      `INSERT INTO mistakes (id, wrong_text, right_text, source, created_at, next_review_date) VALUES ('m2','I goed','I went','free_writing',$1,$1)`,
      [new Date().toISOString()]);
    await a.engine.syncNow(server.transport(), "user-1");

    const kvKeys = server.pushed.filter((r) => r.kind === "kv").map((r) => r.key);
    expect(kvKeys).toEqual(["myenglish_daily_goal_v1"]);
    const all = JSON.stringify(server.pushed);
    for (const leaked of ["secret", "BOOK TEXT", "BOOK PROMPT", "BOOK WRONG"]) expect(all).not.toContain(leaked);
    expect(server.pushed.some((r) => r.kind === "mistake" && r.key === "m2")).toBe(true);
    expect(server.pushed.some((r) => r.kind === "mistake" && r.key === "m1")).toBe(false);
  });

  it("does not trust the server with keys outside the allowlist", async () => {
    const server = fakeServer();
    const b = await device();
    await server.transport().push([
      { kind: "kv", key: "myenglish_gemini_api_key", data: { v: "stolen" }, ts: new Date().toISOString() },
      { kind: "kv", key: "myenglish_daily_goal_v1", data: { v: "9" }, ts: new Date().toISOString() },
    ]);
    await b.engine.syncNow(server.transport(), "user-1");
    expect(localStorage.getItem("myenglish_gemini_api_key")).toBeNull();
    expect(localStorage.getItem("myenglish_daily_goal_v1")).toBe("9");
  });

  it("syncs a word the learner added with its examples and card", async () => {
    const server = fakeServer();
    const a = await device();
    const id = await a.db.insertEnrichedWord({
      word: "Idempotent", meaning_vn: "bất biến", synonyms: [], antonyms: [],
      examples: [{ sentence_en: "The call is idempotent.", grammar_analysis: "S + be + adj" }],
    });
    await review(a, id);
    await a.engine.syncNow(server.transport(), "user-1");

    const b = await device();
    await b.engine.syncNow(server.transport(), "user-1");
    const rows = await b.conn.select<Array<{ id: string; meaning_vn: string }>>(`SELECT id, meaning_vn FROM words WHERE LOWER(word) = 'idempotent'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].meaning_vn).toBe("bất biến");
    const ex = await b.conn.select<Array<{ sentence_en: string }>>(`SELECT sentence_en FROM examples WHERE word_id = $1`, [rows[0].id]);
    expect(ex[0].sentence_en).toBe("The call is idempotent.");
    const srs = await b.conn.select<Array<{ reps: number }>>(`SELECT reps FROM srs_reviews WHERE word_id = $1`, [rows[0].id]);
    expect(srs[0].reps).toBeGreaterThan(0);
  });

  it("refuses to mix a machine's data into another account without being told", async () => {
    const server = fakeServer();
    const a = await device();
    await a.engine.syncNow(server.transport(), "user-1");
    await expect(a.engine.syncNow(server.transport(), "user-2")).rejects.toThrow(a.engine.AccountMismatchError);
    await a.engine.adoptAccount("user-2");
    await expect(a.engine.syncNow(server.transport(), "user-2")).resolves.toBeDefined();
  });

  it("still asks after a sign-out: the next account does not silently receive this machine's data", async () => {
    const server = fakeServer();
    const a = await device();
    const id = await addDeckWord(a, "apple");
    await review(a, id);
    await a.engine.syncNow(server.transport(), "user-1");
    await a.engine.forgetAccount(); // user-1 signs out
    const other = fakeServer();
    await expect(a.engine.syncNow(other.transport(), "user-2")).rejects.toThrow(a.engine.AccountMismatchError);
    expect(other.pushed).toHaveLength(0);
    // The same account signing in again resumes incrementally: nothing new to push
    const before = server.pushed.length;
    await a.engine.syncNow(server.transport(), "user-1");
    expect(server.pushed.length).toBe(before);
  });

  it("keeps syncing progress when the server refuses this machine's XP (device limit)", async () => {
    const server = fakeServer();
    const a = await device();
    const id = await addDeckWord(a, "apple");
    await review(a, id);
    const transport = server.transport();
    transport.pushXp = async () => {
      throw new Error("device limit: this account already has XP from 10 devices");
    };
    const report = await a.engine.syncNow(transport, "user-1");
    expect(report.xpDeviceLimit).toBe(true);
    expect(server.pushed.some((r) => r.kind === "card")).toBe(true);
  });
});

describe("cloud sync: deletions, retries and lighter passes", () => {
  it("a word deleted on one machine is deleted on the others and does not come back", async () => {
    const server = fakeServer();
    const a = await device();
    const id = await addDeckWord(a, "apple");
    await review(a, id);
    await a.engine.syncNow(server.transport(), "user-1");

    const b = await device();
    await b.engine.syncNow(server.transport(), "user-1");
    expect(await card(b, "apple")).toBeDefined();

    await a.db.deleteWord(id);
    await a.engine.syncNow(server.transport(), "user-1");
    await b.engine.syncNow(server.transport(), "user-1");
    expect(await b.conn.select(`SELECT id FROM words WHERE catalog_id = 'apple'`)).toHaveLength(0);

    // A new machine pulls the old card and log too, but must not recreate the word from them
    const c = await device();
    await c.engine.syncNow(server.transport(), "user-1");
    expect(await c.conn.select(`SELECT id FROM words WHERE catalog_id = 'apple'`)).toHaveLength(0);
  });

  it("keeps rows of a word this machine cannot place for later passes", async () => {
    const server = fakeServer();
    await server.transport().push([
      { kind: "card", key: "r:zzz", data: { dir: "r", wk: "zzz", reps: 1, state: 2, last_review: "2026-01-02T00:00:00.000Z" }, ts: "2026-01-02T00:00:00.000Z" },
    ]);
    const b = await device();
    await b.engine.syncNow(server.transport(), "user-1");
    const kept = await b.state.getSyncState("pull:deferred");
    expect(JSON.parse(kept!)).toHaveLength(1);
  });

  it("shortens a word too large for the server instead of losing it, and skips a row with a bad time", () => {
    return device().then(({ engine }) => {
      const examples = Array.from({ length: 200 }, (_, i) => ({ id: `e${i}`, sentence_en: "x".repeat(200) }));
      const fitted = engine.fitRow({ kind: "word", key: "w:big", data: { word: "big", examples }, ts: "2026-01-01T00:00:00.000Z" });
      expect(fitted).not.toBeNull();
      expect((fitted!.data.examples as unknown[]).length).toBeGreaterThan(0);
      expect((fitted!.data.examples as unknown[]).length).toBeLessThan(200);
      expect(engine.fitRow({ kind: "card", key: "r:x", data: {}, ts: "not a time" })).toBeNull();
    });
  });

  it("stops before pushing when the account was reset from another machine", async () => {
    const server = fakeServer();
    const a = await device();
    await a.engine.syncNow(server.transport(), "user-1");
    server.server.epoch = 1; // "reset all data" elsewhere
    await expect(a.engine.syncNow(server.transport(), "user-1")).rejects.toThrow(a.engine.AccountResetElsewhereError);
    await a.engine.adoptAccount("user-1"); // the learner chose to keep this machine's progress
    await expect(a.engine.syncNow(server.transport(), "user-1")).resolves.toBeDefined();
  });

  it("reads only new XP rows and writes the profile only when it changed", async () => {
    const server = fakeServer();
    const a = await device();
    const id = await addDeckWord(a, "apple");
    await review(a, id);
    a.smart.awardXP(20);
    await a.engine.syncNow(server.transport(), "user-1");
    const profilesAfterFirst = server.profiles.length;
    await a.engine.syncNow(server.transport(), "user-1");
    expect(server.xpSince[0]).toBeNull();
    expect(server.xpSince[1]).toEqual(expect.any(String));
    expect(server.profiles.length).toBe(profilesAfterFirst);
  });

  it("dates a changed setting by its local backup, not by the sync", async () => {
    const server = fakeServer();
    const a = await device();
    localStorage.setItem("myenglish_daily_goal_v1", "10");
    await a.engine.syncNow(server.transport(), "user-1");
    localStorage.setItem("myenglish_daily_goal_v1", "25");
    const changedAt = new Date(Date.now() - 3 * 86400000).toISOString(); // backed up 3 days ago, offline since
    await a.conn.execute(
      `INSERT INTO app_kv (key, value, updated_at) VALUES ('myenglish_daily_goal_v1', '25', $1)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [changedAt]
    );
    await a.engine.syncNow(server.transport(), "user-1");
    const row = server.pushed.filter((r) => r.kind === "kv" && r.key === "myenglish_daily_goal_v1").pop();
    expect(row?.ts).toBe(changedAt);
  });
});

describe("sync merge rules", () => {
  it("identifies words by deck id, else by text", () => {
    expect(wordKey({ catalog_id: "May", word: "May" })).toBe("May");
    expect(wordKey({ catalog_id: null, word: "  Cache " })).toBe("w:cache");
  });

  it("merges settings and progress maps without losing either side", () => {
    expect(mergeKv("lww", "1", "2", true)).toBe("2");
    expect(mergeKv("lww", "1", "2", false)).toBeNull();
    expect(mergeKv("lww", null, "2", false)).toBe("2");
    expect(JSON.parse(mergeKv("maxMap", '{"a":3,"b":1}', '{"a":1,"b":5,"c":2}', false)!)).toEqual({ a: 3, b: 5, c: 2 });
    expect(JSON.parse(mergeKv("arrayUnion", '["x"]', '["y","x"]', false)!).sort()).toEqual(["x", "y"]);
    expect(JSON.parse(mergeKv("unionObj", '{"a":1}', '{"a":2,"b":3}', true)!)).toEqual({ a: 1, b: 3 });
    expect(
      JSON.parse(mergeKv("pronunciation", '{"l":{"best":2,"total":5,"attempts":3,"passedAt":"2026-02"}}', '{"l":{"best":4,"total":5,"attempts":1,"passedAt":"2026-01"}}', false)!).l
    ).toEqual({ best: 4, total: 5, attempts: 3, passedAt: "2026-01" });
  });

  it("only allowlisted keys exist, none of them the book or a secret", () => {
    for (const k of Object.keys(SYNCED_KV)) {
      expect(k).not.toMatch(/gemini|cli_path|hidden_items|accepted_answers|book_revision|ui_scale|theme/);
    }
  });

  it("merges ledgers: a device's own XP is counted once and the total never drops", () => {
    expect(initialLedger(500, { "2026-01-01": 120 })).toEqual({ "2026-01-01": 120, [BASE_DAY]: 380 });
    const own = { "2026-01-02": 30 };
    const remote: XpRow[] = [
      { device_id: "me", day: "2026-01-02", xp: 20 },
      { device_id: "other", day: "2026-01-02", xp: 70 },
      { device_id: "other", day: BASE_DAY, xp: 100 },
    ];
    const merged = mergeXp(remote, "me", own, { total: 30, log: { "2026-01-02": 30 } });
    expect(merged.total).toBe(200);
    expect(merged.log["2026-01-02"]).toBe(100);
    expect(mergeXp([], "me", own, { total: 999, log: {} }).total).toBe(999);
  });
});

describe("leaderboard periods", () => {
  it("weeks start on Monday and months on the 1st, in local dates", async () => {
    const { boardRange, weekStart } = await import("@/services/leaderboard");
    const wed = new Date(2026, 9, 14, 15, 0); // Wed 14 Oct 2026
    expect(weekStart(wed).getDate()).toBe(12);
    expect(boardRange("week", wed).from).toBe("2026-10-12");
    const sun = new Date(2026, 9, 18, 23, 0);
    expect(boardRange("week", sun).from).toBe("2026-10-12");
    const mon = new Date(2026, 9, 19, 0, 5);
    expect(boardRange("week", mon).from).toBe("2026-10-19");
    expect(boardRange("month", wed).from).toBe("2026-10-01");
    expect(boardRange("all", wed).from).toBeNull();
    expect(boardRange("streak", wed).from).toBeNull();
  });
});
