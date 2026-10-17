/**
 * "Từ hay quên": the words the learner keeps getting wrong, from their answers of the last FORGOTTEN_WINDOW_DAYS
 * days (review_logs) and the FSRS lapses of both cards.
 *  - hay quên: wrong at least MIN_WRONG times in the window, or forgotten (lapses) MIN_LAPSES times, or a leech
 *  - đã nhớ lại: one of those, now answered right RECOVERED_RIGHT_IN_A_ROW times since the last miss with every
 *    card in study at RECOVERED_STABILITY_DAYS of stability (and no longer a leech)
 *  - suspended words are listed apart
 * Practice answers count (a miss in practice is still forgetting); introductions, "Đã biết" and recognition
 * credited from a recall answer (is_scheduled = 2) are no answers.
 */
import type { WordDetail, SRSReview } from "@/types/database";
import { getDatabase } from "./db";
import { isWordDue } from "./cards";
import { calculateRetrievability, getLeechSettings, isLeechWord, type LeechSettings } from "./smartReview";
import { toIso } from "./sync/keys";

export const FORGOTTEN_WINDOW_DAYS = 30;
export const MIN_WRONG = 2;
export const MIN_LAPSES = 2;
export const RECOVERED_RIGHT_IN_A_ROW = 3;
export const RECOVERED_STABILITY_DAYS = 7;
/** Most words in one "Ôn từ hay quên" session (the highest scores) */
export const FORGOTTEN_SESSION_MAX = 15;

const DAY_MS = 24 * 3600 * 1000;

export interface LogRow {
  word_id: string;
  exercise_type: string;
  rating: number;
  timestamp: string;
}

export interface WordLogStats {
  wrong: number;
  total: number;
  lastWrongAt: number | null;
  /** Right answers in a row since the last miss (all right answers when never missed) */
  rightSinceWrong: number;
  /** Misses per exercise type */
  wrongTypes: Record<string, number>;
}

const time = (ts: string) => new Date(toIso(ts) ?? ts).getTime();

/** Per-word stats of answers in time order */
export function aggregateLogs(rows: readonly LogRow[]): Map<string, WordLogStats> {
  const sorted = [...rows].sort((a, b) => time(a.timestamp) - time(b.timestamp));
  const out = new Map<string, WordLogStats>();
  for (const r of sorted) {
    const s = out.get(r.word_id) ?? { wrong: 0, total: 0, lastWrongAt: null, rightSinceWrong: 0, wrongTypes: {} };
    s.total++;
    if (r.rating === 1) {
      s.wrong++;
      s.lastWrongAt = time(r.timestamp);
      s.rightSinceWrong = 0;
      s.wrongTypes[r.exercise_type] = (s.wrongTypes[r.exercise_type] || 0) + 1;
    } else {
      s.rightSinceWrong++;
    }
    out.set(r.word_id, s);
  }
  return out;
}

export type ForgottenStatus = "active" | "recovered" | "suspended";

export interface ForgottenEntry {
  word: WordDetail;
  stats: WordLogStats | null;
  lapses: number;
  leech: boolean;
  /** Lowest chance of remembering among the word's cards in study (null: none in study) */
  retrievability: number | null;
  score: number;
  status: ForgottenStatus;
  dueNow: boolean;
  /** Next review of each card in study (recognition, production), and the earliest of them */
  nextReview: { recognition: Date | null; production: Date | null; earliest: Date | null };
  /** The exercise type missed most often, when one stands out */
  weakType: string | null;
}

function studiedCards(word: WordDetail): Array<Partial<SRSReview>> {
  return [word.srs, word.srsProduction].filter((s): s is SRSReview => !!s && (s.state ?? 0) > 0);
}

/** The word's entry, or null when it is not a word the learner keeps forgetting */
export function classifyWord(
  word: WordDetail,
  stats: WordLogStats | null,
  now: Date = new Date(),
  settings: LeechSettings = getLeechSettings()
): ForgottenEntry | null {
  const lapses = Math.max(word.srs?.lapses ?? 0, word.srsProduction?.lapses ?? 0);
  const leech = isLeechWord(word, settings);
  const wrong = stats?.wrong ?? 0;
  if (wrong < MIN_WRONG && lapses < MIN_LAPSES && !leech) return null;

  const cards = studiedCards(word);
  const retrievability = cards.length > 0 ? Math.min(...cards.map((c) => calculateRetrievability(c, now))) : null;
  const weakestStability = cards.length > 0 ? Math.min(...cards.map((c) => c.stability ?? 0)) : 0;
  const recentWrong = stats?.lastWrongAt != null && now.getTime() - stats.lastWrongAt <= 3 * DAY_MS;
  const score =
    wrong * 2 + lapses + (leech ? 3 : 0) + (retrievability != null && retrievability < 0.7 ? 2 : 0) + (recentWrong ? 2 : 0);

  const settled = !leech && cards.length > 0 && weakestStability >= RECOVERED_STABILITY_DAYS;
  const rightAgain = !stats || stats.lastWrongAt == null || stats.rightSinceWrong >= RECOVERED_RIGHT_IN_A_ROW;
  const status: ForgottenStatus = word.suspended ? "suspended" : settled && rightAgain ? "recovered" : "active";

  let weakType: string | null = null;
  if (stats) {
    const [top] = Object.entries(stats.wrongTypes).sort((a, b) => b[1] - a[1]);
    if (top && top[1] >= 2) weakType = top[0];
  }
  const nextOf = (s: Partial<SRSReview> | null | undefined) =>
    s && (s.state ?? 0) > 0 && s.next_review_date ? new Date(s.next_review_date) : null;
  const recognition = nextOf(word.srs);
  const production = nextOf(word.srsProduction);
  const times = [recognition, production].filter((d): d is Date => !!d && Number.isFinite(d.getTime()));
  const earliest = times.length > 0 ? new Date(Math.min(...times.map((d) => d.getTime()))) : null;
  return {
    word,
    stats,
    lapses,
    leech,
    retrievability,
    score,
    status,
    dueNow: isWordDue(word, now),
    nextReview: { recognition, production, earliest },
    weakType,
  };
}

export interface ForgottenWords {
  active: ForgottenEntry[];
  recovered: ForgottenEntry[];
  suspended: ForgottenEntry[];
  /** Misses in the last 7 days, and in the 7 days before */
  wrongLast7: number;
  wrongPrev7: number;
}

/** Every word sorted into its group: active by score, recovered by the latest miss */
export function rankForgottenWords(
  words: readonly WordDetail[],
  stats: Map<string, WordLogStats>,
  now: Date = new Date(),
  settings: LeechSettings = getLeechSettings()
): Omit<ForgottenWords, "wrongLast7" | "wrongPrev7"> {
  const active: ForgottenEntry[] = [];
  const recovered: ForgottenEntry[] = [];
  const suspended: ForgottenEntry[] = [];
  for (const w of words) {
    const e = classifyWord(w, stats.get(w.id) ?? null, now, settings);
    if (!e) continue;
    (e.status === "active" ? active : e.status === "recovered" ? recovered : suspended).push(e);
  }
  active.sort((a, b) => b.score - a.score || (b.stats?.lastWrongAt ?? 0) - (a.stats?.lastWrongAt ?? 0));
  recovered.sort((a, b) => (b.stats?.lastWrongAt ?? 0) - (a.stats?.lastWrongAt ?? 0));
  suspended.sort((a, b) => a.word.word.localeCompare(b.word.word));
  return { active, recovered, suspended };
}

/** Misses in the last 7 days and the 7 days before */
export function wrongTrend(rows: readonly LogRow[], now: Date = new Date()): { wrongLast7: number; wrongPrev7: number } {
  const t = now.getTime();
  let wrongLast7 = 0;
  let wrongPrev7 = 0;
  for (const r of rows) {
    if (r.rating !== 1) continue;
    const age = t - time(r.timestamp);
    if (age < 0) continue;
    if (age < 7 * DAY_MS) wrongLast7++;
    else if (age < 14 * DAY_MS) wrongPrev7++;
  }
  return { wrongLast7, wrongPrev7 };
}

/** The words of an "Ôn từ hay quên" session: due ones first (they are graded), then by score */
export function pickSessionWords(active: readonly ForgottenEntry[], max: number = FORGOTTEN_SESSION_MAX): WordDetail[] {
  return [...active]
    .sort((a, b) => Number(b.dueNow) - Number(a.dueNow) || b.score - a.score)
    .slice(0, max)
    .map((e) => e.word);
}

export async function loadForgottenLogs(now: Date = new Date()): Promise<LogRow[]> {
  const db = await getDatabase();
  const since = new Date(now.getTime() - FORGOTTEN_WINDOW_DAYS * DAY_MS).toISOString();
  return db.select<LogRow[]>(
    `SELECT word_id, exercise_type, rating, timestamp FROM review_logs
     WHERE timestamp >= $1 AND exercise_type NOT IN ('intro', 'known') AND (is_scheduled IS NULL OR is_scheduled != 2)`,
    [since]
  );
}

export async function loadForgottenWords(words: readonly WordDetail[], now: Date = new Date()): Promise<ForgottenWords> {
  const rows = await loadForgottenLogs(now).catch(() => [] as LogRow[]);
  return { ...rankForgottenWords(words, aggregateLogs(rows), now), ...wrongTrend(rows, now) };
}
