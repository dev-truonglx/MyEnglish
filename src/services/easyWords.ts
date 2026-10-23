/**
 * "Đã biết": a word the learner already masters is set aside in one key press (a new word on its introduction,
 * any card in a review, a whole deck level at once), without touching FSRS. The word is suspended
 * (`words.suspended`, which every queue already leaves out and sync already carries) and the reason is kept as
 * learning events, never as review logs:
 *  - "easy_skip": marked "Đã biết". Its FSRS cards stay exactly as they were (a new word stays new, a word being
 *    learned keeps its history and due date), so the optimizer never sees a made-up review.
 *  - "easy_check" (meta.ok): now and then a few marked words are drawn at random into a session as a light
 *    multiple-choice check (pickKnownChecks). When is decided here, outside FSRS. A word never learned is asked as
 *    practice (FSRS is not told: the card stays new); a word with an FSRS history is asked as a real review of a
 *    card FSRS has due, so the memory it shows is not hidden from FSRS. Right: the word stays aside and its next
 *    check waits longer, never beyond the learner's maximum interval. Wrong: back to the normal schedule (a new
 *    word is learned again like any new word).
 *  - "easy_back": back to the normal schedule by hand (undo, the Đã biết tab, resuming the suspended word).
 *  - "easy_level_reset" (meta.level): a level whose checks went too badly was sent back to learning
 *    (relearnLevel); its check results count again from there.
 * A word is set aside while it is suspended and its latest such event is a mark or a right check.
 *
 * Checking a level: marking many words at once is a claim about a level, so each level's checks are counted
 * (levelStatsFromEvents, the last LEVEL_WINDOW answers). Each session asks a few words per level, more on higher
 * levels and on levels answered badly: at LEVEL_RELEARN_AT or below the level's unconfirmed words go back to
 * learning, from LEVEL_ACCEPT_AT up the claim is accepted and the checks only come now and then.
 */
import type { ReviewCard, WordDetail } from "@/types/database";
import { getDatabase } from "./db";
import { getCardSrs, isDueSrs, toCard } from "./cards";
import { logLearningEvent } from "./learningEvents";
import { getFSRSSettings } from "./srs";
import { notifyWordsChanged, setWordSuspended, wordIdHash } from "./reviewRecorder";

/** First timed check of a marked word (and the interval after its first right check): days, spread by word id */
export const KNOWN_CHECK_MIN_DAYS = 60;
export const KNOWN_CHECK_MAX_DAYS = 120;
/** A marked word is never checked the day it was marked (that would test short-term memory) */
export const KNOWN_SAMPLE_MIN_AGE_DAYS = 1;
/** When a marked word is first asked again at the earliest, said to the learner ("2–4 tháng") */
export const KNOWN_CHECK_LABEL = `${Math.round(KNOWN_CHECK_MIN_DAYS / 30)}–${Math.round(KNOWN_CHECK_MAX_DAYS / 30)} tháng`;

/** A level is judged on its last LEVEL_WINDOW checks, once it has at least LEVEL_MIN_CHECKS */
export const LEVEL_WINDOW = 20;
export const LEVEL_MIN_CHECKS = 10;
/** At or below this share right, the level's unconfirmed words go back to learning */
export const LEVEL_RELEARN_AT = 0.5;
/** From this share right, the level is accepted as known */
export const LEVEL_ACCEPT_AT = 0.9;
/** Below this many marked words a level is not sampled right away (a few words marked one by one wait their timer) */
export const LEVEL_SAMPLE_MIN_WORDS = 20;
/** Checks per session for each level (higher levels get more), and the extra on a level answered badly */
export const LEVEL_SESSION_QUOTA: Readonly<Record<string, number>> = { A1: 2, A2: 2, B1: 2, B2: 3, C1: 3, C2: 3 };
export const LEVEL_SESSION_QUOTA_DEFAULT = 2;
export const LEVEL_CHECKING_EXTRA = 3;
/** Most checks one session asks */
export const KNOWN_CHECKS_PER_SESSION = 15;

const DAY_MS = 24 * 60 * 60 * 1000;
const KNOWN_EVENTS = ["easy_skip", "easy_check", "easy_back", "easy_level_reset"] as const;

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
/** A word with no CEFR level (added by hand) */
export const NO_LEVEL = "Khác";

/** The word's CEFR level: its own tag, else the deck's level kept in `topic` */
export function levelOf(w: { cefr_level?: string | null; topic?: string | null }): string {
  const tag = (w.cefr_level || w.topic || "").trim().toUpperCase();
  return (CEFR_LEVELS as readonly string[]).includes(tag) ? tag : NO_LEVEL;
}

export interface EasyState {
  /** Latest mark */
  markedAt: string;
  /** Latest mark or right check: the next timed check counts from it */
  lastAt: string;
  /** Right checks since the latest mark */
  passedChecks: number;
  /** Still set aside (false: its latest check was wrong, see failedAt) */
  parked: boolean;
  /** The check that sent it back to learning */
  failedAt: string | null;
}

export interface EasyEventRow {
  word_id: string | null;
  type: string;
  at: string;
  meta: string | null;
  /** The word's level fields (joined), for the level counts */
  cefr_level?: string | null;
  topic?: string | null;
}

function parseMeta(meta: string | null): Record<string, unknown> | null {
  try {
    const v = JSON.parse(meta ?? "null");
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

const byTime = (rows: readonly EasyEventRow[]) => [...rows].sort((a, b) => a.at.localeCompare(b.at));

/**
 * Each marked word's state from its events (stable sort: events at the same time keep their order). A word sent
 * back by hand is left out; one whose check was wrong stays, not parked, with failedAt.
 */
export function easyStatesFromEvents(rows: readonly EasyEventRow[]): Map<string, EasyState> {
  const out = new Map<string, EasyState>();
  for (const r of byTime(rows)) {
    if (!r.word_id) continue;
    const s = out.get(r.word_id);
    if (r.type === "easy_skip") {
      out.set(r.word_id, { markedAt: r.at, lastAt: r.at, passedChecks: 0, parked: true, failedAt: null });
    } else if (r.type === "easy_check" && s?.parked) {
      if (parseMeta(r.meta)?.ok === true) out.set(r.word_id, { ...s, lastAt: r.at, passedChecks: s.passedChecks + 1 });
      else out.set(r.word_id, { ...s, parked: false, failedAt: r.at });
    } else if (r.type === "easy_back") {
      out.delete(r.word_id);
    }
  }
  return out;
}

/** Set aside as "Đã biết": suspended, with a mark not withdrawn since */
export function isSetAsideEasy(word: Pick<WordDetail, "id" | "suspended">, states: ReadonlyMap<string, EasyState>): boolean {
  return !!word.suspended && states.get(word.id)?.parked === true;
}

export type LevelStatus = "verifying" | "checking" | "accepted" | "relearn";

export interface LevelCheckStats {
  level: string;
  /** Right answers among the last LEVEL_WINDOW checks since the level was last sent back */
  correct: number;
  total: number;
  status: LevelStatus;
  /** The level was last sent back to learning then */
  resetAt: string | null;
}

/** Where a level stands from its recent checks */
export function levelStatus(correct: number, total: number): LevelStatus {
  if (total < LEVEL_MIN_CHECKS) return "verifying";
  const share = correct / total;
  if (share <= LEVEL_RELEARN_AT) return "relearn";
  if (share >= LEVEL_ACCEPT_AT) return "accepted";
  return "checking";
}

/** Each level's recent checks (the level of the word checked), counted from the level's latest reset */
export function levelStatsFromEvents(rows: readonly EasyEventRow[]): Map<string, LevelCheckStats> {
  const checks = new Map<string, boolean[]>();
  const resets = new Map<string, string>();
  for (const r of byTime(rows)) {
    if (r.type === "easy_level_reset") {
      const level = parseMeta(r.meta)?.level;
      if (typeof level === "string") {
        resets.set(level, r.at);
        checks.set(level, []);
      }
    } else if (r.type === "easy_check" && r.word_id) {
      const level = levelOf(r);
      const list = checks.get(level) ?? [];
      list.push(parseMeta(r.meta)?.ok === true);
      checks.set(level, list);
    }
  }
  const out = new Map<string, LevelCheckStats>();
  for (const level of new Set([...checks.keys(), ...resets.keys()])) {
    const recent = (checks.get(level) ?? []).slice(-LEVEL_WINDOW);
    const correct = recent.filter(Boolean).length;
    out.set(level, { level, correct, total: recent.length, status: levelStatus(correct, recent.length), resetAt: resets.get(level) ?? null });
  }
  return out;
}

/**
 * Days from a check to the next timed one: KNOWN_CHECK_MIN_DAYS–KNOWN_CHECK_MAX_DAYS (by word id), doubling
 * after each further right answer, never beyond the learner's maximum interval (FSRS setting).
 */
export function knownCheckDays(wordId: string, passedChecks: number, maxInterval: number = getFSRSSettings().maximumInterval): number {
  const base = KNOWN_CHECK_MIN_DAYS + (wordIdHash(wordId) % (KNOWN_CHECK_MAX_DAYS - KNOWN_CHECK_MIN_DAYS + 1));
  return Math.max(1, Math.min(maxInterval, base * 2 ** Math.max(0, passedChecks - 1)));
}

/**
 * When the marked word may be checked next. Never checked: the day after the mark when its level is being
 * sampled (`sampling`), else after its first timed interval. Checked right: after knownCheckDays.
 */
export function nextKnownCheckAt(wordId: string, state: EasyState, sampling: boolean, maxInterval?: number): string {
  const from = new Date(state.lastAt).getTime();
  const days =
    state.passedChecks === 0 && sampling ? KNOWN_SAMPLE_MIN_AGE_DAYS : knownCheckDays(wordId, state.passedChecks, maxInterval);
  return new Date(from + days * DAY_MS).toISOString();
}

/** Whether a level's never-checked words are sampled right away: a big claim not yet accepted, or doubtful */
export function isLevelSampled(stats: LevelCheckStats | undefined, markedWords: number): boolean {
  const status = stats?.status ?? "verifying";
  return status === "checking" || status === "relearn" || (status === "verifying" && markedWords >= LEVEL_SAMPLE_MIN_WORDS);
}

/** Checks a session asks for a level */
export function levelQuota(level: string, stats: LevelCheckStats | undefined): number {
  const base = LEVEL_SESSION_QUOTA[level] ?? LEVEL_SESSION_QUOTA_DEFAULT;
  return base + (stats?.status === "checking" ? LEVEL_CHECKING_EXTRA : 0);
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The marked words one session checks: per level, up to levelQuota words whose check has come, drawn at random;
 * higher levels first when the session's total (KNOWN_CHECKS_PER_SESSION) runs out. A word with an FSRS history
 * is only checked once FSRS has its recognition card due (never a review FSRS did not ask for yet).
 */
export function pickKnownChecks(
  words: readonly WordDetail[],
  states: ReadonlyMap<string, EasyState>,
  levels: ReadonlyMap<string, LevelCheckStats>,
  now: Date = new Date(),
  random: () => number = Math.random,
  max: number = KNOWN_CHECKS_PER_SESSION
): WordDetail[] {
  const maxInterval = getFSRSSettings().maximumInterval;
  const marked = new Map<string, WordDetail[]>();
  const seen = new Set<string>();
  for (const w of words) {
    if (seen.has(w.id) || !isSetAsideEasy(w, states)) continue;
    seen.add(w.id);
    const level = levelOf(w);
    marked.set(level, [...(marked.get(level) ?? []), w]);
  }
  const rank = (l: string) => (CEFR_LEVELS as readonly string[]).indexOf(l);
  const order = [...marked.keys()].sort((a, b) => rank(b) - rank(a));
  const out: WordDetail[] = [];
  for (const level of order) {
    const list = marked.get(level)!;
    const stats = levels.get(level);
    const sampling = isLevelSampled(stats, list.length);
    const ready = list.filter(
      (w) =>
        new Date(nextKnownCheckAt(w.id, states.get(w.id)!, sampling, maxInterval)).getTime() <= now.getTime() &&
        isDueSrs(getCardSrs(w, "recognition"), now)
    );
    out.push(...shuffled(ready, random).slice(0, levelQuota(level, stats)));
    if (out.length >= max) break;
  }
  return out.slice(0, Math.max(0, max));
}

/** A check card for a marked word (in the session it is not suspended: the check is how it is asked) */
export function knownCheckCard(word: WordDetail): ReviewCard {
  return { ...toCard(word, "recognition"), suspended: 0, easyCheck: true };
}

/**
 * The session with this time's checks of marked words put in at random places after the first card (or alone,
 * when nothing else is due). Words already in the session are not checked.
 */
export async function addKnownChecks(
  session: readonly ReviewCard[],
  words: readonly WordDetail[],
  now: Date = new Date(),
  random: () => number = Math.random
): Promise<ReviewCard[]> {
  const rows = await loadKnownEvents();
  const inSession = new Set(session.map((c) => c.id));
  const picked = pickKnownChecks(
    words.filter((w) => !inSession.has(w.id)),
    easyStatesFromEvents(rows),
    levelStatsFromEvents(rows),
    now,
    random
  );
  const out = [...session];
  for (const w of picked) {
    const from = Math.min(1, out.length);
    out.splice(from + Math.floor(random() * (out.length - from + 1)), 0, knownCheckCard(w));
  }
  return out;
}

/** SQL condition: the word (alias of `words`) is set aside as "Đã biết" (a withdrawn mark also resumes the word) */
export function knownParkedSql(alias: string): string {
  return `(COALESCE(${alias}.suspended, 0) = 1 AND EXISTS (
    SELECT 1 FROM learning_events ke WHERE ke.word_id = ${alias}.id AND ke.type = 'easy_skip'))`;
}

/** Every "Đã biết" event, with the level fields of its word */
export async function loadKnownEvents(): Promise<EasyEventRow[]> {
  const db = await getDatabase();
  return db.select<EasyEventRow[]>(
    `SELECT e.word_id, e.type, e.at, e.meta, w.cefr_level, w.topic
     FROM learning_events e LEFT JOIN words w ON w.id = e.word_id
     WHERE e.type IN (${KNOWN_EVENTS.map((_, i) => `$${i + 1}`).join(", ")})
     ORDER BY e.at, e.rowid`,
    [...KNOWN_EVENTS]
  );
}

/** "Đã biết" states of every word, from learning_events */
export async function loadEasyStates(): Promise<Map<string, EasyState>> {
  return easyStatesFromEvents(await loadKnownEvents());
}

/** "Đã biết" for one word (its FSRS cards are left as they are) */
export async function markWordEasy(wordId: string, now: Date = new Date()): Promise<void> {
  await logLearningEvent("easy_skip", { wordId, at: now });
  await setWordSuspended(wordId, true);
  notifyWordsChanged([wordId]);
}

/** Events and suspensions of many words in a few statements. Words already set aside are skipped. */
export async function markWordsEasyBatch(wordIds: readonly string[], now: Date = new Date()): Promise<number> {
  const states = await loadEasyStates();
  const ids = [...new Set(wordIds)].filter((id) => !states.get(id)?.parked);
  await writeBatch(ids, "easy_skip", 1, now);
  return ids.length;
}

/** One event per word and the matching suspension, 200 words per statement */
async function writeBatch(wordIds: readonly string[], type: "easy_skip" | "easy_back", suspended: 0 | 1, now: Date): Promise<void> {
  const db = await getDatabase();
  const stamp = now.toISOString();
  for (let i = 0; i < wordIds.length; i += 200) {
    const chunk = wordIds.slice(i, i + 200);
    await db.execute(
      `INSERT INTO learning_events (id, type, word_id, direction, at, meta)
       VALUES ${chunk.map((_, k) => `($${2 * k + 3}, $2, $${2 * k + 4}, NULL, $1, NULL)`).join(", ")}`,
      [stamp, type, ...chunk.flatMap((id) => [crypto.randomUUID(), id])]
    );
    await db.execute(
      `UPDATE words SET suspended = $2, updated_at = $1 WHERE id IN (${chunk.map((_, k) => `$${k + 3}`).join(", ")})`,
      [stamp, suspended, ...chunk]
    );
  }
}

export interface KnownCheckOutcome {
  level: string;
  /** The level's counts after this answer (before a reset) */
  stats: LevelCheckStats;
  /** Words of the level sent back to learning because its checks went too badly (0: none) */
  relearned: number;
}

/**
 * The answer to a marked word's check (the answer itself was recorded as usual): right keeps it aside until a
 * later check, wrong sends it back to the normal schedule. When the level's checks fall to LEVEL_RELEARN_AT, the
 * level's unconfirmed words go back to learning too (relearnLevel).
 */
export async function recordKnownCheck(
  word: Pick<WordDetail, "id" | "cefr_level" | "topic">,
  ok: boolean,
  now: Date = new Date()
): Promise<KnownCheckOutcome> {
  await logLearningEvent("easy_check", { wordId: word.id, meta: { ok }, at: now });
  if (!ok) await setWordSuspended(word.id, false);
  const level = levelOf(word);
  const rows = await loadKnownEvents();
  const stats = levelStatsFromEvents(rows).get(level) ?? { level, correct: 0, total: 0, status: "verifying" as const, resetAt: null };
  const relearned = stats.status === "relearn" ? await relearnLevel(level, stats, rows, now) : 0;
  notifyWordsChanged(relearned > 0 ? undefined : [word.id]);
  return { level, stats, relearned };
}

/**
 * The level's checks went too badly: its marked words not confirmed by a right check go back to learning (a new
 * word is learned again from its introduction), and the level's counts start again. Returns how many went back.
 */
export async function relearnLevel(
  level: string,
  stats: Pick<LevelCheckStats, "correct" | "total">,
  rows?: readonly EasyEventRow[],
  now: Date = new Date()
): Promise<number> {
  const events = rows ?? (await loadKnownEvents());
  const levelById = new Map(events.filter((r) => r.word_id).map((r) => [r.word_id!, levelOf(r)]));
  const ids = [...easyStatesFromEvents(events).entries()]
    .filter(([id, s]) => s.parked && s.passedChecks === 0 && levelById.get(id) === level)
    .map(([id]) => id);
  await writeBatch(ids, "easy_back", 0, now);
  await logLearningEvent("easy_level_reset", { meta: { level, sent: ids.length, correct: stats.correct, total: stats.total }, at: now });
  return ids.length;
}

/** Back to the normal schedule (undo, or by hand from the Đã biết tab) */
export async function unmarkWordEasy(wordId: string, now: Date = new Date()): Promise<void> {
  await logLearningEvent("easy_back", { wordId, at: now });
  await setWordSuspended(wordId, false);
  notifyWordsChanged([wordId]);
}

/**
 * A suspended word resumed some other way (the word's own page): if it was marked "Đã biết", that ends too, so a
 * later suspension (by hand, or as a leech) is not taken for one.
 */
export async function releaseEasyMark(wordId: string, now: Date = new Date()): Promise<void> {
  const states = await loadEasyStates();
  if (states.get(wordId)?.parked) await logLearningEvent("easy_back", { wordId, at: now });
}

export interface LevelReset {
  level: string;
  at: string;
  /** Words sent back to learning */
  sent: number;
  correct: number;
  total: number;
}

/** Every level sent back to learning, latest first (the Đã biết tab's notice) */
export function levelResetsFromEvents(rows: readonly EasyEventRow[]): LevelReset[] {
  return byTime(rows)
    .filter((r) => r.type === "easy_level_reset")
    .flatMap((r) => {
      const meta = parseMeta(r.meta);
      return meta && typeof meta.level === "string"
        ? [{ level: meta.level, at: r.at, sent: Number(meta.sent ?? 0), correct: Number(meta.correct ?? 0), total: Number(meta.total ?? 0) }]
        : [];
    })
    .reverse();
}
