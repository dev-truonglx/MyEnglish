/**
 * "Đã biết": words the learner said they already know, with their checks:
 *  - waiting: not checked yet
 *  - confirmed: a check was answered right
 *  - failed: a check was missed: the word is learned again like a normal one
 * Marks are kept as services/easyWords describes (the word set aside, FSRS untouched, checked now and then at
 * random). Words marked before that (markWordKnown, `legacy`) kept their own way: a Review card with a stability
 * of KNOWN_STABILITY_MIN_DAYS to KNOWN_STABILITY_MAX_DAYS, and one real review when it falls due (waiting while
 * isKnownOnly, then confirmed or failed by its lapses); "Kiểm tra ngay" moves that review to now. Their mark is
 * not undone: sync keeps the card with more reviews, so a card put back to New would come back from another
 * machine.
 */
import type { WordDetail } from "@/types/database";
import { getDatabase } from "./db";
import { isKnownOnly } from "./smartReview";
import { isRememberedLong } from "./wordStatus";
import { notifyWordsChanged } from "./reviewRecorder";
import { CEFR_LEVELS, isSetAsideEasy, levelOf, NO_LEVEL, nextKnownCheckAt, type EasyState } from "./easyWords";

export { CEFR_LEVELS, levelOf, NO_LEVEL };

export type KnownStatus = "waiting" | "confirmed" | "failed";

export interface KnownEntry {
  word: WordDetail;
  status: KnownStatus;
  /** When the learner marked it */
  markedAt: string | null;
  /** The next check, when it has a date (a legacy mark's review, a confirmed word's next check); null: at random */
  checkAt: string | null;
  /** Confirmed and stable for the long run */
  rememberedLong: boolean;
  /** Marked before marks set words aside (an FSRS schedule of its own, see the top of this file) */
  legacy?: boolean;
  /** Set aside: checks answered right since the mark */
  passedChecks?: number;
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
export function classifyKnownWords(
  words: readonly WordDetail[],
  marks: ReadonlyMap<string, string>,
  easy: ReadonlyMap<string, EasyState> = new Map()
): KnownEntry[] {
  const out: KnownEntry[] = [];
  for (const w of words) {
    const markedAt = marks.get(w.id) ?? null;
    const set = easy.get(w.id);
    if (set && isSetAsideEasy(w, easy)) {
      const passed = set.passedChecks;
      out.push({
        word: w,
        status: passed > 0 ? "confirmed" : "waiting",
        markedAt: set.markedAt,
        checkAt: passed > 0 ? nextKnownCheckAt(w.id, set, false) : null,
        rememberedLong: false,
        passedChecks: passed,
      });
    } else if (set && !set.parked && set.failedAt) {
      out.push({ word: w, status: "failed", markedAt: set.markedAt, checkAt: null, rememberedLong: false, passedChecks: set.passedChecks });
    } else if (isKnownOnly(w.srs)) {
      out.push({ word: w, status: "waiting", markedAt: markedAt ?? w.srs.last_review ?? null, checkAt: w.srs.next_review_date ?? null, rememberedLong: false, legacy: true });
    } else if (markedAt && (w.srs.reps ?? 0) > 1) {
      out.push({
        word: w,
        status: (w.srs.lapses ?? 0) > 0 ? "failed" : "confirmed",
        markedAt,
        checkAt: null,
        rememberedLong: isRememberedLong(w),
        legacy: true,
      });
    }
  }
  // Waiting: the soonest check first (dated ones, then those asked at random); checked: the latest mark first
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
