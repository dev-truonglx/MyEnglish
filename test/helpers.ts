import { vi } from "vitest";
import type { WordDetail, SRSReview } from "@/types/database";

/**
 * Re-import services with fresh module state, so every test gets a new in-memory database
 * (db.ts keeps a singleton connection) and a new FSRS scheduler cache.
 */
export async function freshServices() {
  vi.resetModules();
  const db = await import("@/services/db");
  const srs = await import("@/services/srs");
  const smart = await import("@/services/smartReview");
  await db.getDatabase();
  return { db, srs, smart };
}

const DAY = 24 * 60 * 60 * 1000;

/** Build an in-memory WordDetail for pure-function tests. */
export function makeWord(
  id: string,
  opts: Partial<Omit<WordDetail, "srs">> & { srs?: Partial<SRSReview>; createdDaysAgo?: number } = {}
): WordDetail {
  const { srs, createdDaysAgo = 1, ...rest } = opts;
  return {
    id,
    word: id,
    meaning_vn: "nghĩa",
    image_url: null,
    synonyms: "[]",
    antonyms: "[]",
    topic: "General Tech",
    created_at: new Date(Date.now() - createdDaysAgo * DAY).toISOString(),
    examples: [],
    ...rest,
    srs: {
      word_id: id,
      ease_factor: 2.5,
      interval: 0,
      repetitions: 0,
      next_review_date: new Date(Date.now() - 1000).toISOString(),
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null,
      learning_steps: 0,
      ...srs,
    },
  };
}

/** A card in Review state last seen `daysAgo` days ago with the given stability. */
export function reviewSrs(stability: number, daysAgo: number, extra: Partial<SRSReview> = {}): Partial<SRSReview> {
  return {
    state: 2,
    reps: 3,
    stability,
    difficulty: 5,
    scheduled_days: Math.round(stability),
    last_review: new Date(Date.now() - daysAgo * DAY).toISOString(),
    next_review_date: new Date(Date.now() - (daysAgo - stability) * DAY).toISOString(),
    ...extra,
  };
}

export const DAY_MS = DAY;
