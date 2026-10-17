import { describe, it, expect } from "vitest";
import {
  aggregateLogs,
  classifyWord,
  pickSessionWords,
  rankForgottenWords,
  wrongTrend,
  type LogRow,
} from "@/services/forgottenWords";
import { schedulingDecision } from "@/services/reviewRecorder";
import { getDueCards, practiceCards } from "@/services/cards";
import { freshServices, makeWord, DAY_MS } from "./helpers";

const now = new Date("2026-10-17T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
const row = (word_id: string, rating: number, daysAgo: number, exercise_type = "spelling"): LogRow => ({
  word_id,
  rating,
  exercise_type,
  timestamp: ago(daysAgo),
});
const settings = { threshold: 4, action: "highlight" as const, enabled: true };
const inStudy = (id: string, srs: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  makeWord(id, {
    srs: { state: 2, stability: 2, reps: 4, last_review: ago(1), next_review_date: ago(-2), scheduled_days: 3, ...srs },
    ...extra,
  });

describe("answer stats", () => {
  it("counts misses, the latest miss, the right answers since, and the exercise types missed", () => {
    const s = aggregateLogs([
      row("a", 3, 5),
      row("a", 1, 4, "listening"),
      row("a", 1, 3, "spelling"),
      row("a", 1, 2, "spelling"),
      row("a", 3, 1),
      row("a", 4, 0.5),
    ]).get("a")!;
    expect(s).toMatchObject({ wrong: 3, total: 6, rightSinceWrong: 2, wrongTypes: { listening: 1, spelling: 2 } });
    expect(s.lastWrongAt).toBe(new Date(ago(2)).getTime());
  });

  it("reads old SQLite timestamps (UTC, no T)", () => {
    const s = aggregateLogs([{ word_id: "a", rating: 1, exercise_type: "cloze", timestamp: "2026-10-15 08:00:00" }]).get("a")!;
    expect(s.lastWrongAt).toBe(Date.parse("2026-10-15T08:00:00Z"));
  });
});

describe("which words are hay quên", () => {
  it("two misses, or two lapses, or a leech", () => {
    const stats = aggregateLogs([row("w2", 1, 3), row("w2", 1, 2), row("w1", 1, 2)]);
    expect(classifyWord(inStudy("w2"), stats.get("w2")!, now, settings)?.status).toBe("active");
    expect(classifyWord(inStudy("w1"), stats.get("w1")!, now, settings)).toBeNull();
    expect(classifyWord(inStudy("lapsed", { lapses: 2 }), null, now, settings)?.status).toBe("active");
    expect(classifyWord(inStudy("leech", { lapses: 4 }), null, now, { ...settings, threshold: 4 })?.leech).toBe(true);
    expect(classifyWord(inStudy("fine"), null, now, settings)).toBeNull();
  });

  it("a production card's lapses count too", () => {
    const w = inStudy("p", {}, { srsProduction: { word_id: "p", state: 2, stability: 1, lapses: 3, reps: 5, next_review_date: ago(-1) } });
    expect(classifyWord(w, null, now, settings)?.lapses).toBe(3);
  });

  it("recovered: three right in a row since the last miss and every card at 7 days of stability", () => {
    const rows = [row("r", 1, 9), row("r", 1, 8), row("r", 3, 6), row("r", 3, 4), row("r", 3, 1)];
    const stats = aggregateLogs(rows).get("r")!;
    expect(classifyWord(inStudy("r", { stability: 9 }), stats, now, settings)?.status).toBe("recovered");
    // Still unstable: not yet
    expect(classifyWord(inStudy("r", { stability: 3 }), stats, now, settings)?.status).toBe("active");
    // Only two right since
    const two = aggregateLogs(rows.slice(0, 4)).get("r")!;
    expect(classifyWord(inStudy("r", { stability: 9 }), two, now, settings)?.status).toBe("active");
    // Old lapses and stable again, no miss in the window
    expect(classifyWord(inStudy("old", { lapses: 2, stability: 20 }), null, now, settings)?.status).toBe("recovered");
  });

  it("suspended words are apart", () => {
    const e = classifyWord(inStudy("s", { lapses: 5 }, { suspended: 1 }), null, now, settings);
    expect(e?.status).toBe("suspended");
  });

  it("names the exercise type missed most, once it is missed twice", () => {
    const stats = aggregateLogs([row("t", 1, 3, "listening"), row("t", 1, 2, "listening"), row("t", 1, 1, "cloze")]);
    expect(classifyWord(inStudy("t"), stats.get("t")!, now, settings)?.weakType).toBe("listening");
  });
});

describe("ranking and session", () => {
  it("more misses, recent misses and leeches come first", () => {
    const words = [inStudy("few"), inStudy("many"), inStudy("leech", { lapses: 4 })];
    const stats = aggregateLogs([
      row("few", 1, 20),
      row("few", 1, 19),
      row("many", 1, 3),
      row("many", 1, 2),
      row("many", 1, 1),
    ]);
    const { active } = rankForgottenWords(words, stats, now, settings);
    expect(active.map((e) => e.word.id)).toEqual(["many", "leech", "few"]);
  });

  it("the session puts due words first, then by score, at most the limit", () => {
    const words = [inStudy("notdue1", { lapses: 6 }), inStudy("due", { lapses: 2, next_review_date: ago(1) }), inStudy("notdue2", { lapses: 3 })];
    const { active } = rankForgottenWords(words, new Map(), now, { ...settings, enabled: false });
    expect(pickSessionWords(active, 2).map((w) => w.id)).toEqual(["due", "notdue1"]);
  });

  it("a word not due is practice only: its schedule is not touched", () => {
    const notDue = inStudy("n", { lapses: 3 });
    expect(getDueCards(notDue, now)).toHaveLength(0);
    const [card] = practiceCards([notDue]);
    expect(schedulingDecision({ card, exerciseType: "multiple_choice", now }).scheduled).toBe(false);
    expect(schedulingDecision({ card, exerciseType: "multiple_choice", now }).reason).toBe("not_due");
  });

  it("misses this week against the week before", () => {
    expect(wrongTrend([row("a", 1, 1), row("a", 1, 6), row("a", 3, 2), row("b", 1, 9), row("b", 1, 20)], now)).toEqual({
      wrongLast7: 2,
      wrongPrev7: 1,
    });
  });
});

describe("loading answers", () => {
  it("leaves out introductions, 'Đã biết', credited recognition and answers older than 30 days", async () => {
    const { db } = await freshServices();
    const { loadForgottenLogs } = await import("@/services/forgottenWords");
    const conn = await db.getDatabase();
    const id = await db.insertEnrichedWord({
      word: "cache",
      meaning_vn: "bộ nhớ đệm",
      synonyms: [],
      antonyms: [],
      examples: [{ sentence_en: "The cache works.", grammar_analysis: "S + V" }],
    });
    const insert = (n: number, type: string, rating: number, daysAgo: number, scheduled: number | null) =>
      conn.execute(
        `INSERT INTO review_logs (id, word_id, exercise_type, response_time_ms, is_correct, wrong_attempts, rating, xp_earned, timestamp, is_scheduled)
         VALUES ($1, $2, $3, 1000, $4, 0, $5, 0, $6, $7)`,
        [`log${n}`, id, type, rating > 1 ? 1 : 0, rating, new Date(Date.now() - daysAgo * DAY_MS).toISOString(), scheduled]
      );
    await insert(1, "spelling", 1, 2, 1);
    await insert(2, "multiple_choice", 1, 3, 0); // practice: counts
    await insert(3, "intro", 1, 1, 1);
    await insert(4, "known", 3, 1, 1);
    await insert(5, "spelling", 3, 1, 2); // credited from recall
    await insert(6, "spelling", 1, 40, 1); // too old
    const rows = await loadForgottenLogs();
    expect(rows.map((r) => r.exercise_type).sort()).toEqual(["multiple_choice", "spelling"]);
  });
});

describe("next review", () => {
  it("the earliest next review of the cards in study (a card not started has none)", () => {
    const w = inStudy("n", { lapses: 2, next_review_date: ago(-3) }, {
      srsProduction: { word_id: "n", state: 2, stability: 1, lapses: 2, reps: 3, next_review_date: ago(-1) },
    });
    const e = classifyWord(w, null, now, settings)!;
    expect(e.nextReview.earliest?.toISOString()).toBe(ago(-1));
    expect(e.nextReview.recognition?.toISOString()).toBe(ago(-3));
    const waiting = inStudy("m", { lapses: 2 }, { srsProduction: { word_id: "m", state: 0, reps: 0, next_review_date: ago(5) } });
    expect(classifyWord(waiting, null, now, settings)!.nextReview.production).toBeNull();
  });
});
