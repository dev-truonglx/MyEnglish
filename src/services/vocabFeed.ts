/**
 * Which words of the deck (vocabCatalog.ts) the learner meets next, and when they enter `words`.
 *
 *  - Levels: the learner studies A1, or A1 + the next levels (always contiguous from A1).
 *  - Order: the chosen levels are mixed, lower levels more often (weights k…1: A1+A2 = 2:1,
 *    A1–B1 = 3:2:1), counted since the levels were chosen. Within a level, the IT words come first, then
 *    the deck's study order (frequency).
 *  - Words enter `words` a few at a time: a buffer of unstudied words a little larger than the daily
 *    new-word budget. The scheduler then works as before (one budget for new cards, oldest first), and
 *    `words` never holds thousands of New cards that would all count as due.
 */
import { addUserContextExample, getDatabase, getWordsByIds, insertCatalogWords, type CatalogWordInput } from "./db";
import type { WordDetail } from "@/types/database";
import { getStudyLimits } from "./srs";
import { persistKeyNow } from "./storageBackup";
import { markWordKnown } from "./reviewRecorder";
import {
  CATALOG_LEVEL_COUNTS,
  STUDY_LEVELS,
  ensureCatalogSeeded,
  findCatalogWord,
  getCatalogEntries,
  rowToEntry,
  type CatalogEntry,
  type StudyLevel,
} from "./vocabCatalog";

const LEVELS_KEY = "myenglish_study_levels_v1";
/** Unstudied words kept in `words` beyond the daily new-word budget */
export const BUFFER_EXTRA = 5;

interface LevelsSetting {
  levels: StudyLevel[];
  /** Words drawn per level since these levels were chosen (keeps the mix ratio across top-ups) */
  drawn: Partial<Record<StudyLevel, number>>;
}

/** Contiguous from A1 up to the highest level given ([] or unknown -> A1 only) */
export function normalizeStudyLevels(levels: readonly string[]): StudyLevel[] {
  const top = Math.max(0, ...levels.map((l) => STUDY_LEVELS.indexOf(l as StudyLevel)));
  return STUDY_LEVELS.slice(0, top + 1);
}

/** Levels suggested for a self-assessed / placement level: start at A1, up to that level */
export function defaultStudyLevelsFor(level: string | null | undefined): StudyLevel[] {
  return normalizeStudyLevels(level && (STUDY_LEVELS as readonly string[]).includes(level) ? [level] : ["A1"]);
}

function readSetting(): LevelsSetting | null {
  try {
    const raw = JSON.parse(localStorage.getItem(LEVELS_KEY) || "null");
    if (raw && Array.isArray(raw.levels)) return { levels: normalizeStudyLevels(raw.levels), drawn: raw.drawn ?? {} };
  } catch {}
  return null;
}

function writeSetting(s: LevelsSetting): void {
  try {
    localStorage.setItem(LEVELS_KEY, JSON.stringify(s));
    persistKeyNow(LEVELS_KEY);
  } catch {}
}

export function hasChosenStudyLevels(): boolean {
  return readSetting() !== null;
}

export function getStudyLevels(): StudyLevel[] {
  return readSetting()?.levels ?? ["A1"];
}

/** Save the levels; a different choice restarts the mix count. Returns the normalized levels. */
export function setStudyLevels(levels: readonly string[]): StudyLevel[] {
  const next = normalizeStudyLevels(levels);
  const current = readSetting();
  const same = current && current.levels.join() === next.join();
  writeSetting({ levels: next, drawn: same ? current.drawn : {} });
  try {
    window.dispatchEvent(new CustomEvent("myenglish-study-levels-changed"));
  } catch {}
  return next;
}

/** Mix weights: the lowest chosen level k, the next k-1, … the highest 1 */
export function levelWeights(levels: readonly StudyLevel[]): Map<StudyLevel, number> {
  return new Map(levels.map((l, i) => [l, levels.length - i]));
}

/**
 * The levels of the next `n` words: each time the level furthest below its share (drawn / weight),
 * lower level on ties, skipping levels with nothing left. `drawn` and `available` are updated.
 */
export function pickLevelSequence(
  levels: readonly StudyLevel[],
  drawn: Partial<Record<StudyLevel, number>>,
  available: Partial<Record<StudyLevel, number>>,
  n: number
): StudyLevel[] {
  const weights = levelWeights(levels);
  const out: StudyLevel[] = [];
  for (let i = 0; i < n; i++) {
    let best: StudyLevel | null = null;
    let bestScore = Infinity;
    for (const l of levels) {
      if ((available[l] ?? 0) <= 0) continue;
      const score = (drawn[l] ?? 0) / (weights.get(l) ?? 1);
      if (score < bestScore) {
        best = l;
        bestScore = score;
      }
    }
    if (!best) break;
    out.push(best);
    drawn[best] = (drawn[best] ?? 0) + 1;
    available[best] = (available[best] ?? 0) - 1;
  }
  return out;
}

export function toCatalogWordInput(e: CatalogEntry, createdAt: string): CatalogWordInput {
  const key = e.word.toLowerCase();
  const forms = [...new Set([...e.irregular, ...e.examples.flatMap((x) => x.focus)])].filter((f) => f.toLowerCase() !== key);
  return {
    catalogId: e.id,
    word: e.word,
    phonetic: e.ipaUs[0] ?? e.ipaUk[0] ?? null,
    partOfSpeech: e.pos,
    meaningVn: e.vn,
    cefr: e.cefr,
    variants: e.variants,
    forms,
    examples: e.examples,
    createdAt,
  };
}

/** Deck words not in `words` yet, per level */
async function availableByLevel(levels: readonly StudyLevel[]): Promise<Partial<Record<StudyLevel, number>>> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ cefr: StudyLevel; n: number }>>(
    `SELECT cefr, COUNT(*) AS n FROM vocab_catalog c
     WHERE cefr IN (${levels.map((_, i) => `$${i + 1}`).join(", ")})
       AND NOT EXISTS (SELECT 1 FROM words w WHERE w.catalog_id = c.id)
     GROUP BY cefr`,
    [...levels]
  );
  return Object.fromEntries(rows.map((r) => [r.cefr, Number(r.n)]));
}

/** Words of the deck in `words` that were never studied, shown or marked (the buffer) */
export async function countWaitingWords(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ n: number }>>(
    `SELECT COUNT(*) AS n FROM words w JOIN srs_reviews s ON s.word_id = w.id
     WHERE w.catalog_id IS NOT NULL AND COALESCE(s.reps, 0) = 0 AND COALESCE(s.state, 0) = 0
       AND COALESCE(w.suspended, 0) = 0 AND NOT EXISTS (SELECT 1 FROM review_logs r WHERE r.word_id = w.id)`
  );
  return Number(rows[0]?.n ?? 0);
}

async function nextIdsOfLevel(level: StudyLevel, limit: number): Promise<string[]> {
  if (limit <= 0) return [];
  const db = await getDatabase();
  const rows = await db.select<Array<{ id: string }>>(
    `SELECT id FROM vocab_catalog c
     WHERE cefr = $1 AND NOT EXISTS (SELECT 1 FROM words w WHERE w.catalog_id = c.id)
     ORDER BY it DESC, study_order LIMIT $2`,
    [level, limit]
  );
  return rows.map((r) => r.id);
}

export interface TopUpResult {
  added: number;
  /** Nothing left to introduce in the chosen levels (time to open the next level) */
  exhausted: boolean;
}

/**
 * Keep the buffer of unstudied words at the daily new-word budget + BUFFER_EXTRA, adding the next words of
 * the chosen levels. Cheap when the buffer is full (one count). New words get creation times just before
 * now, after the words already waiting, so they are introduced in this order.
 */
let topping: Promise<TopUpResult> | null = null;
export function topUpNewWords(options: { target?: number; now?: Date } = {}): Promise<TopUpResult> {
  topping ??= doTopUp(options).finally(() => {
    topping = null;
  });
  return topping;
}

async function doTopUp({ target, now = new Date() }: { target?: number; now?: Date }): Promise<TopUpResult> {
  // Nothing is added before the learner has chosen their levels (onboarding / migration screen)
  const setting = readSetting();
  if (!setting) return { added: 0, exhausted: false };
  await ensureCatalogSeeded();
  const goal = target ?? getStudyLimits().newCardsPerDay + BUFFER_EXTRA;
  const need = goal - (await countWaitingWords());
  const available = await availableByLevel(setting.levels);
  const left = Object.values(available).reduce((a, b) => a + (b ?? 0), 0);
  if (need <= 0 || left === 0) return { added: 0, exhausted: left === 0 };

  const sequence = pickLevelSequence(setting.levels, setting.drawn, { ...available }, need);
  const queues = new Map<StudyLevel, string[]>();
  for (const level of new Set(sequence)) {
    queues.set(level, await nextIdsOfLevel(level, sequence.filter((l) => l === level).length));
  }
  const ids = sequence.map((l) => queues.get(l)?.shift()).filter((id): id is string => Boolean(id));
  const entries = await getCatalogEntries(ids);
  const base = now.getTime() - entries.length;
  await insertCatalogWords(entries.map((e, i) => toCatalogWordInput(e, new Date(base + i).toISOString())));
  writeSetting(setting);
  return { added: entries.length, exhausted: left - entries.length <= 0 };
}

/**
 * "Learn this early": a deck word goes to the front of the new words (added if needed). A word already
 * studied is left alone. Does not count in the level mix.
 */
export async function learnEarly(entryId: string, now: Date = new Date()): Promise<"added" | "moved" | "studied"> {
  await ensureCatalogSeeded();
  const db = await getDatabase();
  const firstWaiting = await db.select<Array<{ first: string | null }>>(
    `SELECT MIN(s.next_review_date) AS first FROM words w JOIN srs_reviews s ON s.word_id = w.id
     WHERE COALESCE(s.reps, 0) = 0 AND COALESCE(s.state, 0) = 0`
  );
  const firstMs = firstWaiting[0]?.first ? Date.parse(firstWaiting[0].first) : now.getTime();
  const at = new Date(Math.min(firstMs, now.getTime()) - 1000).toISOString();

  const existing = await db.select<Array<{ id: string; reps: number | null; state: number | null }>>(
    `SELECT w.id, s.reps, s.state FROM words w LEFT JOIN srs_reviews s ON s.word_id = w.id WHERE w.catalog_id = $1`,
    [entryId]
  );
  if (existing[0]) {
    const { id, reps, state } = existing[0];
    if ((reps ?? 0) > 0 || (state ?? 0) !== 0) return "studied";
    await db.execute(`UPDATE words SET created_at = $1, suspended = 0 WHERE id = $2`, [at, id]);
    await db.execute(`UPDATE srs_reviews SET next_review_date = $1 WHERE word_id = $2`, [at, id]);
    return "moved";
  }
  const [entry] = await getCatalogEntries([entryId]);
  if (!entry) return "studied";
  await insertCatalogWords([toCatalogWordInput(entry, at)]);
  return "added";
}

/** Change the levels: unstarted words of levels no longer chosen leave the buffer, which is refilled */
export async function changeStudyLevels(levels: readonly string[]): Promise<StudyLevel[]> {
  const next = setStudyLevels(levels);
  const db = await getDatabase();
  const filter = `SELECT w.id FROM words w JOIN srs_reviews s ON s.word_id = w.id
    WHERE w.catalog_id IS NOT NULL AND w.cefr_level NOT IN (${next.map((_, i) => `$${i + 1}`).join(", ")})
      AND COALESCE(s.reps, 0) = 0 AND COALESCE(s.state, 0) = 0
      AND NOT EXISTS (SELECT 1 FROM review_logs r WHERE r.word_id = w.id)`;
  const ids = (await db.select<Array<{ id: string }>>(filter, [...next])).map((r) => r.id);
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const ph = chunk.map((_, j) => `$${j + 1}`).join(", ");
    for (const table of ["examples", "srs_reviews", "srs_production"]) {
      await db.execute(`DELETE FROM ${table} WHERE word_id IN (${ph})`, chunk);
    }
    await db.execute(`DELETE FROM words WHERE id IN (${ph})`, chunk);
  }
  await topUpNewWords();
  return next;
}

export interface LevelProgress {
  level: StudyLevel;
  total: number;
  /** Studied at least once (including words marked as known) */
  met: number;
  /** In long-term memory: Review state with at least a week of stability, after a real review (not just marked) */
  remembered: number;
  /** Marked "already known" */
  known: number;
}

export async function loadLevelProgress(): Promise<LevelProgress[]> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ level: string; met: number; remembered: number; known: number }>>(
    `SELECT w.cefr_level AS level,
            SUM(CASE WHEN COALESCE(s.reps, 0) > 0 THEN 1 ELSE 0 END) AS met,
            SUM(CASE WHEN s.state = 2 AND COALESCE(s.stability, 0) >= 7 AND EXISTS (
                  SELECT 1 FROM review_logs r WHERE r.word_id = w.id AND r.exercise_type NOT IN ('known', 'intro')
                ) THEN 1 ELSE 0 END) AS remembered,
            SUM(CASE WHEN k.word_id IS NOT NULL THEN 1 ELSE 0 END) AS known
     FROM words w JOIN srs_reviews s ON s.word_id = w.id
     LEFT JOIN (SELECT DISTINCT word_id FROM review_logs WHERE exercise_type = 'known') k ON k.word_id = w.id
     WHERE w.catalog_id IS NOT NULL
     GROUP BY w.cefr_level`
  );
  const byLevel = new Map(rows.map((r) => [r.level, r]));
  return STUDY_LEVELS.map((level) => {
    const r = byLevel.get(level);
    return {
      level,
      total: CATALOG_LEVEL_COUNTS[level],
      met: Number(r?.met ?? 0),
      remembered: Number(r?.remembered ?? 0),
      known: Number(r?.known ?? 0),
    };
  });
}

/** The next words of a level not studied yet (buffer words included), in introduction order: for skimming */
export async function nextUnstudiedEntries(level: StudyLevel, limit = 30): Promise<CatalogEntry[]> {
  await ensureCatalogSeeded();
  const db = await getDatabase();
  const rows = await db.select<Parameters<typeof rowToEntry>[0][]>(
    `SELECT c.id, c.word, c.cefr, c.list, c.study_order, c.freq, c.it, c.pos, c.vn, c.data
     FROM vocab_catalog c
     LEFT JOIN words w ON w.catalog_id = c.id
     LEFT JOIN srs_reviews s ON s.word_id = w.id
     WHERE c.cefr = $1 AND (w.id IS NULL OR (COALESCE(s.reps, 0) = 0 AND COALESCE(s.state, 0) = 0))
     ORDER BY c.it DESC, c.study_order LIMIT $2`,
    [level, limit]
  );
  return rows.map(rowToEntry);
}

/**
 * Words the learner already knows (skimming): added to `words` if needed, scheduled as Easy without a
 * quiz (see markWordKnown), then the buffer is refilled. Returns how many were marked.
 */
export async function markCatalogWordsKnown(entryIds: string[], now: Date = new Date()): Promise<number> {
  if (entryIds.length === 0) return 0;
  const entries = await getCatalogEntries(entryIds);
  const base = now.getTime() - entries.length;
  const ids = await insertCatalogWords(entries.map((e, i) => toCatalogWordInput(e, new Date(base + i).toISOString())));
  let marked = 0;
  for (const e of entries) {
    const wordId = ids.get(e.id);
    if (wordId && (await markWordKnown(wordId, now))) marked++;
  }
  await topUpNewWords({ now });
  return marked;
}

/**
 * The next word waiting to be introduced, skipping `excludeIds` (cards already in the session): replaces a
 * new word the learner marked as known during a session. Tops the buffer up first.
 */
export async function nextWaitingWord(excludeIds: string[]): Promise<WordDetail | null> {
  await topUpNewWords().catch(() => {});
  const db = await getDatabase();
  const params = [...excludeIds];
  const rows = await db.select<Array<{ id: string }>>(
    `SELECT w.id FROM words w JOIN srs_reviews s ON s.word_id = w.id
     WHERE w.catalog_id IS NOT NULL AND COALESCE(s.reps, 0) = 0 AND COALESCE(s.state, 0) = 0
       AND COALESCE(w.suspended, 0) = 0 AND NOT EXISTS (SELECT 1 FROM review_logs r WHERE r.word_id = w.id)
       ${params.length ? `AND w.id NOT IN (${params.map((_, i) => `$${i + 1}`).join(", ")})` : ""}
     ORDER BY s.next_review_date, w.created_at LIMIT 1`,
    params
  );
  if (!rows[0]) return null;
  return (await getWordsByIds([rows[0].id]))[0] ?? null;
}

/**
 * A word met outside the deck's order (Quick Input, reading a text, a related term): learnt early when
 * the deck has it, with the sentence it was met in kept as its first example.
 */
export async function pullWordFromDeck(
  text: string,
  context?: string | null
): Promise<{ status: "added" | "moved" | "studied" | "not_in_deck"; word: string }> {
  await ensureCatalogSeeded();
  const [entry] = await findCatalogWord(text);
  if (!entry) return { status: "not_in_deck", word: text.trim() };
  const status = await learnEarly(entry.id);
  if (context?.trim()) {
    const db = await getDatabase();
    const rows = await db.select<Array<{ id: string }>>(`SELECT id FROM words WHERE catalog_id = $1`, [entry.id]);
    if (rows[0]) await addUserContextExample(rows[0].id, context.trim()).catch(() => false);
  }
  return { status, word: entry.word };
}

export function pullMessage(r: { status: string; word: string }): string {
  if (r.status === "not_in_deck") return `"${r.word}" không có trong bộ 5.000 từ Oxford.`;
  if (r.status === "studied") return `"${r.word}" đã có trong sổ từ của bạn.`;
  return `"${r.word}" sẽ là từ mới tiếp theo bạn học.`;
}
