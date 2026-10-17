/**
 * "Đã biết": words the learner said they already know when they first met them (markWordKnown, or the
 * vocabulary path's markCatalogWordsKnown). Such a word gets a Review card due in KNOWN_CHECK_MIN_DAYS to
 * KNOWN_CHECK_MAX_DAYS days and one real review then confirms the claim:
 *  - waiting: not checked yet (isKnownOnly)
 *  - confirmed: the check was answered right; the word is learned like any other (Nhớ lâu once stable)
 *  - failed: the check was missed (a lapse): the word is learned again like a normal one
 * "Kiểm tra ngay" moves the check to now. Undoing the mark is not offered: sync keeps the card with more
 * reviews, so a card put back to New would come back from another machine.
 */
import type { WordDetail } from "@/types/database";
import { getDatabase } from "./db";
import { isKnownOnly } from "./smartReview";
import { isRememberedLong } from "./wordStatus";
import { notifyWordsChanged } from "./reviewRecorder";

export type KnownStatus = "waiting" | "confirmed" | "failed";

export interface KnownEntry {
  word: WordDetail;
  status: KnownStatus;
  /** When the learner marked it */
  markedAt: string | null;
  /** The check (waiting): when it is due */
  checkAt: string | null;
  /** Confirmed and stable for the long run */
  rememberedLong: boolean;
}

/** Word ids marked "Đã biết", with the time of the (latest) mark */
export async function loadKnownMarks(): Promise<Map<string, string>> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ word_id: string; at: string }>>(
    `SELECT word_id, MAX(timestamp) AS at FROM review_logs WHERE exercise_type = 'known' GROUP BY word_id`
  );
  return new Map(rows.map((r) => [r.word_id, r.at]));
}

/**
 * Every word marked "Đã biết": a word still only marked counts even without its log row (marked on another
 * machine before logs synced), a checked one needs the mark in its logs.
 */
export function classifyKnownWords(words: readonly WordDetail[], marks: ReadonlyMap<string, string>): KnownEntry[] {
  const out: KnownEntry[] = [];
  for (const w of words) {
    const markedAt = marks.get(w.id) ?? null;
    if (isKnownOnly(w.srs)) {
      out.push({ word: w, status: "waiting", markedAt: markedAt ?? w.srs.last_review ?? null, checkAt: w.srs.next_review_date ?? null, rememberedLong: false });
    } else if (markedAt && (w.srs.reps ?? 0) > 1) {
      out.push({
        word: w,
        status: (w.srs.lapses ?? 0) > 0 ? "failed" : "confirmed",
        markedAt,
        checkAt: null,
        rememberedLong: isRememberedLong(w),
      });
    }
  }
  // Waiting: the soonest check first; checked: the latest mark first
  return out.sort((a, b) =>
    a.status === "waiting" && b.status === "waiting"
      ? (a.checkAt ?? "").localeCompare(b.checkAt ?? "")
      : (b.markedAt ?? "").localeCompare(a.markedAt ?? "")
  );
}

/**
 * Check now: the known-only cards of these words become due, so the next session asks them as real reviews
 * (a right answer confirms the word, a miss sends it back to learning). Returns how many were moved.
 */
export async function checkKnownNow(wordIds: readonly string[], now: Date = new Date()): Promise<number> {
  if (wordIds.length === 0) return 0;
  const db = await getDatabase();
  let moved = 0;
  for (let i = 0; i < wordIds.length; i += 400) {
    const chunk = wordIds.slice(i, i + 400);
    const res = await db.execute(
      `UPDATE srs_reviews SET next_review_date = $1, last_review = $1
       WHERE word_id IN (${chunk.map((_, k) => `$${k + 2}`).join(", ")})
         AND state = 2 AND reps = 1 AND COALESCE(lapses, 0) = 0`,
      [now.toISOString(), ...chunk]
    );
    moved += res.rowsAffected;
  }
  if (moved > 0) notifyWordsChanged([...wordIds]);
  return moved;
}

// ─── Filters, order and pages of the list ────────────────────────────────────

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
/** A word with no CEFR level (added by hand) */
export const NO_LEVEL = "Khác";

/** The word's CEFR level: its own tag, else the deck's level kept in `topic` */
export function levelOf(w: WordDetail): string {
  const tag = (w.cefr_level || w.topic || "").trim().toUpperCase();
  return (CEFR_LEVELS as readonly string[]).includes(tag) ? tag : NO_LEVEL;
}

export type KnownResultFilter = "all" | "confirmed" | "remembered" | "failed";
export type KnownSort = "check" | "marked" | "az";

export interface KnownFilter {
  view: "waiting" | "checked";
  level: string; // "all" or a level
  result: KnownResultFilter;
  query: string;
  sort: KnownSort;
}

/** Levels present in a list, in CEFR order, with their counts */
export function levelCounts(entries: readonly KnownEntry[]): Array<{ level: string; count: number }> {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(levelOf(e.word), (counts.get(levelOf(e.word)) ?? 0) + 1);
  return [...CEFR_LEVELS, NO_LEVEL].filter((l) => counts.has(l)).map((level) => ({ level, count: counts.get(level)! }));
}

export function filterKnown(entries: readonly KnownEntry[], f: KnownFilter): KnownEntry[] {
  const q = f.query.trim().toLowerCase();
  const out = entries.filter((e) => {
    if (f.view === "waiting" ? e.status !== "waiting" : e.status === "waiting") return false;
    if (f.level !== "all" && levelOf(e.word) !== f.level) return false;
    if (f.view === "checked" && f.result !== "all") {
      if (f.result === "failed" && e.status !== "failed") return false;
      if (f.result === "confirmed" && e.status !== "confirmed") return false;
      if (f.result === "remembered" && !(e.status === "confirmed" && e.rememberedLong)) return false;
    }
    return !q || e.word.word.toLowerCase().includes(q) || e.word.meaning_vn.toLowerCase().includes(q);
  });
  const byWord = (a: KnownEntry, b: KnownEntry) => a.word.word.localeCompare(b.word.word);
  if (f.sort === "az") return out.sort(byWord);
  if (f.sort === "marked") return out.sort((a, b) => (b.markedAt ?? "").localeCompare(a.markedAt ?? "") || byWord(a, b));
  // "check": the soonest check first (checked words have none: latest mark first)
  return out.sort((a, b) =>
    a.checkAt && b.checkAt ? a.checkAt.localeCompare(b.checkAt) || byWord(a, b) : (b.markedAt ?? "").localeCompare(a.markedAt ?? "") || byWord(a, b)
  );
}

/** One page of a list (pages from 1; a page past the end shows the last one) */
export function pageOf<T>(items: readonly T[], page: number, size: number): { items: T[]; page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * size;
  const slice = items.slice(start, start + size);
  return { items: slice, page: p, pages, from: items.length ? start + 1 : 0, to: start + slice.length };
}

/** Page numbers to show: first, last, and two around the current one, with gaps as null */
export function pageButtons(page: number, pages: number): Array<number | null> {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: Array<number | null> = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}
