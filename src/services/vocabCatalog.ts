/**
 * The vocabulary deck: the Anki deck "5000 Từ vựng Tiếng Anh (Oxford 5000, A1–C1)", converted by
 * scripts/wordlists/build_catalog_from_anki.py into src/data/vocabCatalog.json and copied into SQLite
 * (`vocab_catalog`) once per catalog version. It is the only source of words: words, levels and IPA from
 * the Oxford 3000/5000; Vietnamese meanings and examples from the deck's author.
 * Words reach the learner through vocabFeed.ts, a few at a time.
 */
import type { WordDetail } from "@/types/database";
import { getDatabase } from "./db";

export const STUDY_LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
export type StudyLevel = (typeof STUDY_LEVELS)[number];

/** Must match `version` in vocabCatalog.json: a new version is copied into SQLite on the next launch */
export const CATALOG_VERSION = 1;

/** Words per level in the deck (checked against the JSON by a test) */
export const CATALOG_LEVEL_COUNTS: Record<StudyLevel, number> = { A1: 911, A2: 808, B1: 697, B2: 1302, C1: 1286 };

export interface CatalogExample {
  en: string;
  vi: string;
  /** The form(s) of the word the sentence uses */
  focus: string[];
}

export interface CatalogEntry {
  /** The word itself, case kept ("May" and "may" are two entries) */
  id: string;
  word: string;
  cefr: StudyLevel;
  list: 3000 | 5000;
  /** The deck's study order: Oxford 3000 first, then by level, then by frequency */
  order: number;
  freq: number;
  /** One of the IT words picked from the Oxford 3000 (learnt first within its level) */
  it: boolean;
  pos: string;
  /** Short combined meaning, shown on cards and as options */
  vn: string;
  senses: Array<{ pos: string; vn: string }>;
  ipaUs: string[];
  ipaUk: string[];
  /** Other spellings (colour -> color) */
  variants: string[];
  /** Irregular forms (went, children) */
  irregular: string[];
  examples: CatalogExample[];
}

interface CatalogFile {
  version: number;
  words: CatalogEntry[];
}

export function loadCatalogFile(): Promise<CatalogFile> {
  return import("@/data/vocabCatalog.json").then((m) => m.default as unknown as CatalogFile);
}

const SEED_BATCH = 200;

/**
 * Copy the bundled deck into SQLite when it is missing or older than CATALOG_VERSION. Cheap otherwise
 * (one query). Safe to call from several places: concurrent calls share one run.
 */
let seeding: Promise<void> | null = null;
export function ensureCatalogSeeded(load: () => Promise<CatalogFile> = loadCatalogFile): Promise<void> {
  seeding ??= seedCatalog(load).finally(() => {
    seeding = null;
  });
  return seeding;
}

async function seedCatalog(load: () => Promise<CatalogFile>): Promise<void> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ value: string }>>(`SELECT value FROM vocab_catalog_meta WHERE key = 'version'`);
  if (Number(rows[0]?.value) === CATALOG_VERSION) return;

  const file = await load();
  await db.execute(`DELETE FROM vocab_catalog`);
  for (let start = 0; start < file.words.length; start += SEED_BATCH) {
    const batch = file.words.slice(start, start + SEED_BATCH);
    const params: unknown[] = [];
    const values = batch.map((w, i) => {
      const { id, word, cefr, list, order, freq, it, pos, vn, ...data } = w;
      params.push(id, word, cefr, list, order, freq, it ? 1 : 0, pos, vn, JSON.stringify(data));
      return `(${Array.from({ length: 10 }, (_, c) => `$${i * 10 + c + 1}`).join(", ")})`;
    });
    await db.execute(
      `INSERT OR REPLACE INTO vocab_catalog (id, word, cefr, list, study_order, freq, it, pos, vn, data) VALUES ${values.join(", ")}`,
      params
    );
  }
  await db.execute(
    `INSERT INTO vocab_catalog_meta (key, value) VALUES ('version', $1)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(file.version)]
  );
}

interface CatalogRow {
  id: string;
  word: string;
  cefr: string;
  list: number;
  study_order: number;
  freq: number;
  it: number;
  pos: string;
  vn: string;
  data: string;
}

export function rowToEntry(row: CatalogRow): CatalogEntry {
  const data = JSON.parse(row.data) as Omit<CatalogEntry, "id" | "word" | "cefr" | "list" | "order" | "freq" | "it" | "pos" | "vn">;
  return {
    id: row.id,
    word: row.word,
    cefr: row.cefr as StudyLevel,
    list: row.list === 5000 ? 5000 : 3000,
    order: row.study_order,
    freq: row.freq,
    it: row.it === 1,
    pos: row.pos,
    vn: row.vn,
    ...data,
  };
}

const ENTRY_COLUMNS = "id, word, cefr, list, study_order, freq, it, pos, vn, data";

export async function getCatalogEntries(ids: string[]): Promise<CatalogEntry[]> {
  if (ids.length === 0) return [];
  const db = await getDatabase();
  const out: CatalogEntry[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = await db.select<CatalogRow[]>(
      `SELECT ${ENTRY_COLUMNS} FROM vocab_catalog WHERE id IN (${chunk.map((_, j) => `$${j + 1}`).join(", ")})`,
      chunk
    );
    out.push(...rows.map(rowToEntry));
  }
  const order = new Map(ids.map((id, i) => [id, i]));
  return out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/**
 * Entries whose word (or another spelling) is `text`, ignoring case: "may" finds both "may" and "May",
 * the lower-case one first. Also finds a word from a form like "colors" or "went" when given `lemmas`.
 */
export async function findCatalogWord(text: string, lemmas: string[] = []): Promise<CatalogEntry[]> {
  const db = await getDatabase();
  const keys = [...new Set([text, ...lemmas].map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (keys.length === 0) return [];
  const rows = await db.select<CatalogRow[]>(
    `SELECT ${ENTRY_COLUMNS} FROM vocab_catalog
     WHERE LOWER(word) IN (${keys.map((_, i) => `$${i + 1}`).join(", ")})
     ORDER BY CASE WHEN word = LOWER(word) THEN 0 ELSE 1 END, study_order`,
    keys
  );
  if (rows.length > 0) return rows.map(rowToEntry);
  // Other spellings and irregular forms live in the JSON data: a LIKE prefilter keeps this cheap
  const like = await db.select<CatalogRow[]>(
    `SELECT ${ENTRY_COLUMNS} FROM vocab_catalog WHERE data LIKE $1 LIMIT 20`,
    [`%"${keys[0].replace(/[%_"]/g, "")}"%`]
  );
  return like
    .map(rowToEntry)
    .filter((e) => [...e.variants, ...e.irregular].some((f) => keys.includes(f.toLowerCase())));
}

/** Words starting with `prefix` (search box), deck order */
export async function searchCatalog(prefix: string, limit = 40): Promise<CatalogEntry[]> {
  const q = prefix.trim().toLowerCase();
  if (!q) return [];
  const db = await getDatabase();
  const rows = await db.select<CatalogRow[]>(
    `SELECT ${ENTRY_COLUMNS} FROM vocab_catalog WHERE LOWER(word) LIKE $1 ORDER BY LENGTH(word), study_order LIMIT $2`,
    [`${q.replace(/[%_]/g, "")}%`, limit]
  );
  return rows.map(rowToEntry);
}

/**
 * Plausible wrong options for multiple choice, from the deck: words of the given levels the learner has
 * not met yet (met words are already in the session's pool). Light objects: only what option building reads.
 */
export async function loadCatalogDistractors(levels: readonly string[], limit = 1200): Promise<WordDetail[]> {
  if (levels.length === 0) return [];
  const db = await getDatabase();
  const rows = await db.select<Array<{ id: string; word: string; cefr: string; pos: string; vn: string }>>(
    `SELECT id, word, cefr, pos, vn FROM vocab_catalog c
     WHERE cefr IN (${levels.map((_, i) => `$${i + 1}`).join(", ")})
       AND NOT EXISTS (SELECT 1 FROM words w WHERE w.catalog_id = c.id)
     ORDER BY study_order LIMIT ${Math.max(1, Math.floor(limit))}`,
    [...levels]
  );
  const now = new Date().toISOString();
  return rows.map((r) => ({
    id: `catalog:${r.id}`,
    word: r.word,
    meaning_vn: r.vn,
    part_of_speech: r.pos,
    topic: r.cefr,
    cefr_level: r.cefr,
    image_url: null,
    synonyms: "[]",
    antonyms: "[]",
    created_at: now,
    catalog_id: r.id,
    examples: [],
    srs: { word_id: `catalog:${r.id}`, ease_factor: 2.5, interval: 0, repetitions: 0, next_review_date: now, state: 0, reps: 0 },
  }));
}
