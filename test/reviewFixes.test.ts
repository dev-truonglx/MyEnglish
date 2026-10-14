import { describe, it, expect, afterEach } from "vitest";
import { Rating } from "ts-fsrs";
import { freshServices, makeWord, DAY_MS } from "./helpers";
import type { WordDetail } from "@/types/database";

const input = (word: string) => ({
  word,
  meaning_vn: "nghĩa của " + word,
  synonyms: [],
  antonyms: [],
  examples: [{ sentence_en: `The ${word} works.`, grammar_analysis: "S + V" }],
});

const past = (d: number) => new Date(Date.now() - d * DAY_MS).toISOString();

async function services() {
  const base = await freshServices();
  const recorder = await import("@/services/reviewRecorder");
  const cards = await import("@/services/cards");
  const optimizer = await import("@/services/fsrsOptimizer");
  return { ...base, recorder, cards, optimizer };
}

async function insertReviewWord(db: Awaited<ReturnType<typeof services>>["db"], name: string) {
  const conn = await db.getDatabase();
  const id = await db.insertEnrichedWord(input(name));
  for (const table of ["srs_reviews", "srs_production"]) {
    await conn.execute(
      `INSERT OR REPLACE INTO ${table} (word_id, next_review_date, stability, difficulty, reps, lapses, state, last_review, scheduled_days)
       VALUES ($1, $2, 4, 5, 3, 0, 2, $3, 4)`,
      [id, past(1), past(5)]
    );
  }
  return { id, conn };
}

describe("creditRecognition reads the stored recognition row", () => {
  const answerProduction = async (s: Awaited<ReturnType<typeof services>>, id: string) => {
    const [word] = await s.db.getWordsByIds([id]);
    // The card is a snapshot taken at session build: recognition is Review and due
    const card = s.cards.toCard(word, "production");
    return { card, answer: () => s.recorder.recordCardAnswer({
      card,
      exerciseType: "spelling",
      rating: Rating.Good,
      wrongAttempts: 0,
      responseTimeMs: 4000,
      scheduled: true,
      countsForDailyGoal: true,
    }) };
  };

  it("does not credit a recognition card the popup already graded (now Relearning)", async () => {
    const s = await services();
    const { id, conn } = await insertReviewWord(s.db, "buffer");
    const { answer } = await answerProduction(s, id);
    // The popup window graded the recognition card after the snapshot: Again -> Relearning, due in minutes
    await conn.execute(
      `UPDATE srs_reviews SET state = 3, lapses = 1, last_review = $1, next_review_date = $2 WHERE word_id = $3`,
      [new Date().toISOString(), new Date(Date.now() + 5 * 60000).toISOString(), id]
    );
    const res = await answer();
    expect(res.result?.direction).toBe("production");
    expect(res.implicit).toBeNull();
    const logs = await conn.select<Array<{ is_scheduled: number }>>(
      `SELECT is_scheduled FROM review_logs WHERE word_id = $1 AND direction = 'recognition'`,
      [id]
    );
    expect(logs).toHaveLength(0);
    const rows = await conn.select<Array<{ state: number; reps: number }>>(`SELECT state, reps FROM srs_reviews WHERE word_id = $1`, [id]);
    expect(rows[0]).toEqual({ state: 3, reps: 3 });
  });

  it("does not credit a recognition card that is no longer due in the stored row", async () => {
    const s = await services();
    const { id, conn } = await insertReviewWord(s.db, "socket");
    const { answer } = await answerProduction(s, id);
    await conn.execute(`UPDATE srs_reviews SET next_review_date = $1, last_review = $2 WHERE word_id = $3`, [
      new Date(Date.now() + 8 * DAY_MS).toISOString(),
      new Date().toISOString(),
      id,
    ]);
    expect((await answer()).implicit).toBeNull();
  });

  it("still credits it when the stored row is due", async () => {
    const s = await services();
    const { id } = await insertReviewWord(s.db, "kernel");
    const { answer } = await answerProduction(s, id);
    expect((await answer()).implicit).not.toBeNull();
  });
});

describe("comeback session: reviews keep today's share, new cards come on top", () => {
  it("a small share still gets its reviews when the plan adds new cards", async () => {
    const { smart, srs } = await freshServices();
    srs.saveStudyLimits({ newCardsPerDay: 10, maxSessionSize: 30 });
    const review = (id: string) =>
      makeWord(id, { srs: { state: 2, reps: 3, stability: 5, difficulty: 5, scheduled_days: 5, last_review: past(20), next_review_date: past(15) } });
    const words = [...Array.from({ length: 12 }, (_, i) => review(`r${i}`)), makeWord("n1"), makeWord("n2"), makeWord("n3")];
    const session = smart.buildReviewSession(words, { recognition: 0, production: 0 }, new Date(), { maxCards: 4, comebackNewCards: 3 });
    const isNew = (c: { id: string }) => c.id.startsWith("n");
    expect(session.filter((c) => !isNew(c))).toHaveLength(4);
    expect(session.filter(isNew)).toHaveLength(3);
  });
});

describe("FSRS settings", () => {
  it("falls back to the defaults for stored values that are not sane numbers", async () => {
    const { srs } = await services();
    localStorage.setItem("myenglish_fsrs_request_retention", "abc");
    localStorage.setItem("myenglish_fsrs_max_interval", "NaN");
    expect(srs.getFSRSSettings()).toEqual({ requestRetention: 0.9, maximumInterval: 365 });
    localStorage.setItem("myenglish_fsrs_request_retention", "7");
    localStorage.setItem("myenglish_fsrs_max_interval", "-3");
    expect(srs.getFSRSSettings()).toEqual({ requestRetention: 0.9, maximumInterval: 365 });
  });

  it("a review still gets a valid due date with corrupt settings", async () => {
    const { db, srs } = await services();
    localStorage.setItem("myenglish_fsrs_request_retention", "oops");
    localStorage.setItem("myenglish_fsrs_max_interval", "x");
    const id = await db.insertEnrichedWord(input("latency"));
    const result = await srs.recordReview(id, Rating.Good);
    expect(Number.isNaN(new Date(result.nextReviewDate).getTime())).toBe(false);
  });

  it("reuses the scheduler while settings are unchanged and follows any change to storage", async () => {
    const { srs, optimizer } = await services();
    expect(srs.getFSRSScheduler()).toBe(srs.getFSRSScheduler());

    srs.saveFSRSSettings({ requestRetention: 0.85 });
    expect(srs.getFSRSSettings().requestRetention).toBe(0.85);

    // Written by the other window, a reset or a backup restore: no event needed
    localStorage.setItem("myenglish_fsrs_request_retention", "0.8");
    expect(srs.getFSRSSettings().requestRetention).toBe(0.8);

    optimizer.saveWeights({
      parameters: Array.from({ length: optimizer.FSRS_PARAM_COUNT }, () => 1),
      default_metrics: { log_loss: 1, rmse: 1 },
      new_metrics: { log_loss: 0.5, rmse: 0.5 },
      review_count: 500,
      item_count: 60,
    });
    expect(optimizer.getStoredWeights()).toBe(optimizer.getStoredWeights());
    localStorage.removeItem(optimizer.FSRS_WEIGHTS_KEY);
    expect(optimizer.getStoredWeights()).toBeNull();
  });

  it("stored weights follow saveWeights and resetWeights", async () => {
    const { srs, optimizer } = await services();
    const before = srs.getFSRSScheduler();
    expect(optimizer.getStoredWeights()).toBeNull();
    optimizer.saveWeights({
      parameters: Array.from({ length: optimizer.FSRS_PARAM_COUNT }, () => 1),
      default_metrics: { log_loss: 1, rmse: 1 },
      new_metrics: { log_loss: 0.5, rmse: 0.5 },
      review_count: 500,
      item_count: 60,
    });
    expect(optimizer.getStoredWeights()?.w).toHaveLength(optimizer.FSRS_PARAM_COUNT);
    expect(srs.getFSRSScheduler()).not.toBe(before);
    optimizer.resetWeights();
    expect(optimizer.getStoredWeights()).toBeNull();
  });
});

describe("worker tick guard", () => {
  it("a forced tick does not clear the guard of a normal tick", async () => {
    const { srs } = await services();
    const worker = srs.srsWorker as unknown as { isTicking: boolean; tick: (force?: boolean) => Promise<void> };
    worker.isTicking = true; // a normal tick is mid-await
    await worker.tick(true).catch(() => {});
    expect(worker.isTicking).toBe(true);
  });
});

describe("prepareMeaningMatch", () => {
  it("never shows the meaning of a word that was not introduced yet", async () => {
    const { smart } = await freshServices();
    const studied = (id: string) => makeWord(id, { meaning_vn: "nghĩa " + id, srs: { state: 2, reps: 3, last_review: past(2) } });
    const fresh = (id: string) => makeWord(id, { meaning_vn: "nghĩa " + id });
    const words: WordDetail[] = [studied("alpha"), studied("bravo"), studied("charlie"), fresh("delta"), fresh("echo")];
    for (let i = 0; i < 20; i++) {
      const pairs = smart.prepareMeaningMatch(words[0], words);
      expect(pairs.map((p) => p.wordId)).not.toContain("delta");
      expect(pairs.map((p) => p.wordId)).not.toContain("echo");
    }
  });
});

describe("interleaveTopics", () => {
  // The original O(n²) version, as the reference
  const reference = (ordered: WordDetail[]) => {
    const topicOf = (w: WordDetail) => (w.topic || "General Tech").toLowerCase();
    const result: WordDetail[] = [];
    const remaining = [...ordered];
    while (remaining.length > 0) {
      let chosen = 0;
      const n = result.length;
      if (n >= 2 && topicOf(result[n - 1]) === topicOf(result[n - 2])) {
        const blocked = topicOf(result[n - 1]);
        const alt = remaining.findIndex((w) => topicOf(w) !== blocked);
        if (alt !== -1) chosen = alt;
      }
      result.push(remaining.splice(chosen, 1)[0]);
    }
    return result;
  };

  it("gives the same order as taking from a shrinking array", async () => {
    const { smart } = await freshServices();
    for (let round = 0; round < 200; round++) {
      const topics = ["A", "B", "C", "d", "a"].slice(0, 1 + (round % 5));
      const n = Math.floor(Math.random() * 40);
      const words = Array.from({ length: n }, (_, i) =>
        makeWord(`w${i}`, { topic: Math.random() < 0.1 ? "" : topics[Math.floor(Math.random() * topics.length)] })
      );
      expect(smart.interleaveTopics(words).map((w) => w.id)).toEqual(reference(words).map((w) => w.id));
    }
  });
});

describe("optimizer day index", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("counts consecutive local days as 1 apart across a DST change", async () => {
    // London: local midnight is 00:00 UTC in winter and 23:00 UTC the day before in summer, where floor() breaks
    process.env.TZ = "Europe/London";
    const { optimizer } = await services();
    const rows = [];
    // Every day of March 2026 (DST starts on the 29th)
    for (let d = 1; d <= 31; d++) {
      rows.push({ word_id: "w", direction: "recognition", rating: 3, timestamp: new Date(2026, 2, d, 0, 30).toISOString() });
    }
    const [item] = optimizer.buildTrainingItems(rows);
    expect(item.reviews.slice(1).every((r) => r.deltaT === 1)).toBe(true);
  });
});
