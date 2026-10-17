/**
 * Local rows that changed since the last push, as SyncRows. Each collector pages through its table with a
 * keyset (time, id) so a first sync of a long history never holds it all in memory. Changes are found by
 * time (last_review, timestamp...), never by a dirty flag: rows written by a pull are older than the cursor.
 */
import { getDatabase } from "../db";
import { EPOCH, isFreeWordKey, SYNCED_KV, toIso, wordKey } from "./keys";
import { getSyncState, setSyncState } from "./state";
import type { SyncKind, SyncRow } from "./types";

type Db = Awaited<ReturnType<typeof getDatabase>>;
type Row = Record<string, unknown> & { _ts: string; _id: string };

export const PUSH_BATCH = 500;

/**
 * Rows whose `ts` is after `since`, in pages of PUSH_BATCH ordered by (ts, id). `select` lists the columns,
 * `from` the tables, `where` extra conditions (all aliased by the caller).
 */
async function* keyset(
  db: Db,
  opts: { select: string; from: string; ts: string; id: string; where?: string; since: string }
): AsyncGenerator<Row[]> {
  const { select, from, ts, id, where = "1=1", since } = opts;
  let last: { ts: string; id: string } | null = null;
  for (;;) {
    const cursor = last
      ? // `ts >= $1` first: a range the time index can serve (an OR alone makes SQLite scan the table)
        { sql: `AND ${ts} >= $1 AND (${ts} > $1 OR ${id} > $2)`, params: [last.ts, last.id] }
      : { sql: `AND ${ts} > $1`, params: [since] };
    const rows: Row[] = await db.select<Row[]>(
      `SELECT ${select}, ${ts} AS _ts, ${id} AS _id FROM ${from} WHERE ${where} ${cursor.sql} ORDER BY ${ts}, ${id} LIMIT ${PUSH_BATCH}`,
      cursor.params
    );
    if (rows.length === 0) return;
    yield rows;
    if (rows.length < PUSH_BATCH) return;
    const tail = rows[rows.length - 1];
    last = { ts: tail._ts, id: tail._id };
  }
}

function strip(row: Row, ...drop: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "_ts" || k === "_id" || drop.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

const sqlString = (v: string) => `'${v.replace(/'/g, "''")}'`;

const keyOf = (row: Row) => wordKey({ catalog_id: row.catalog_id as string | null, word: String(row.word ?? "") });

/** Words: the deck entry's own state (suspended, when it was queued) or a free word's full content */
async function* collectWords(db: Db, since: string): AsyncGenerator<SyncRow[]> {
  const own = "COALESCE(w.updated_at, w.created_at)";
  const pages = keyset(db, {
    select: `w.id, w.word, w.catalog_id, w.phonetic, w.part_of_speech, w.meaning_vn, w.synonyms, w.antonyms,
             w.collocations, w.code_snippet, w.topic, w.cefr_level, w.suspended, w.created_at, w.updated_at,
             w.variants, w.forms, ${own} AS own_ts`,
    from: `words w LEFT JOIN srs_reviews sr ON sr.word_id = w.id LEFT JOIN srs_production sp ON sp.word_id = w.id`,
    // changed itself, or a card changed (the word row is pushed with the first studied card)
    ts: `MAX(${own}, COALESCE(sr.last_review, ''), COALESCE(sp.last_review, ''))`,
    id: "w.id",
    // Only words changed since the cursor are joined and sorted (the cards through idx_srs_*_last_review),
    // not the whole word list at every pass. `since` is ours (an ISO time), quoted for SQL.
    where: `(w.catalog_id IS NULL OR w.suspended = 1 OR w.updated_at IS NOT NULL
             OR sr.last_review IS NOT NULL OR sp.last_review IS NOT NULL)
            AND (${own} > ${sqlString(since)}
                 OR w.id IN (SELECT word_id FROM srs_reviews WHERE last_review > ${sqlString(since)}
                             UNION SELECT word_id FROM srs_production WHERE last_review > ${sqlString(since)}))`,
    since,
  });
  for await (const page of pages) {
    const freeWordIds = page.filter((r) => isFreeWordKey(keyOf(r))).map((r) => String(r.id));
    const examplesByWord = new Map<string, Array<Record<string, unknown>>>();
    if (freeWordIds.length > 0) {
      const exRows = await db.select<Array<Record<string, unknown>>>(
        `SELECT word_id, id, sentence_en, sentence_vn, grammar_analysis, source, focus, sense_index
         FROM examples WHERE word_id IN (${freeWordIds.map((_, i) => `$${i + 1}`).join(", ")})`,
        freeWordIds
      );
      for (const ex of exRows) {
        const wid = String(ex.word_id);
        const { word_id: _, ...rest } = ex;
        const list = examplesByWord.get(wid);
        if (list) list.push(rest);
        else examplesByWord.set(wid, [rest]);
      }
    }
    const out: SyncRow[] = [];
    for (const r of page) {
      const key = keyOf(r);
      const data: Record<string, unknown> = {
        word: r.word,
        catalog_id: r.catalog_id ?? null,
        created_at: toIso(r.created_at as string),
        suspended: r.suspended ? 1 : 0,
      };
      if (isFreeWordKey(key)) {
        for (const c of ["phonetic", "part_of_speech", "meaning_vn", "synonyms", "antonyms", "collocations", "code_snippet", "topic", "cefr_level", "variants", "forms"]) {
          data[c] = r[c] ?? null;
        }
        data.examples = examplesByWord.get(String(r.id)) ?? [];
      }
      out.push({ kind: "word", key, data, ts: toIso(r.own_ts as string) ?? EPOCH });
    }
    yield out;
  }
}

export const CARD_COLUMNS = [
  "ease_factor", "interval", "repetitions", "next_review_date", "stability", "difficulty", "elapsed_days",
  "scheduled_days", "reps", "lapses", "state", "last_review", "learning_steps",
] as const;

/** Both FSRS cards of a word: recognition ("r", srs_reviews) and recall ("p", srs_production) */
async function* collectCards(db: Db, since: string): AsyncGenerator<SyncRow[]> {
  for (const [dir, table] of [["r", "srs_reviews"], ["p", "srs_production"]] as const) {
    const pages = keyset(db, {
      select: `${CARD_COLUMNS.map((c) => `s.${c}`).join(", ")}, w.catalog_id, w.word`,
      from: `${table} s JOIN words w ON w.id = s.word_id`,
      ts: "s.last_review",
      id: "s.word_id",
      since,
    });
    for await (const page of pages) {
      yield page.map((r) => {
        const wk = keyOf(r);
        return { kind: "card" as const, key: `${dir}:${wk}`, data: { dir, wk, ...strip(r, "catalog_id", "word") }, ts: toIso(r._ts) ?? EPOCH };
      });
    }
  }
}

export const LOG_COLUMNS = [
  "id", "exercise_type", "response_time_ms", "is_correct", "wrong_attempts", "rating", "xp_earned", "timestamp",
  "is_scheduled", "direction", "state_before", "stability_before", "difficulty_before", "r_predicted", "elapsed_days_before",
] as const;

async function* collectLogs(db: Db, since: string): AsyncGenerator<SyncRow[]> {
  const pages = keyset(db, {
    select: `${LOG_COLUMNS.map((c) => `l.${c}`).join(", ")}, w.catalog_id, w.word`,
    from: "review_logs l JOIN words w ON w.id = l.word_id",
    ts: "l.timestamp",
    id: "l.id",
    since,
  });
  for await (const page of pages) {
    yield page.map((r) => ({
      kind: "log" as const,
      key: String(r.id),
      data: { wk: keyOf(r), ...strip(r, "catalog_id", "word") },
      ts: toIso(r._ts) ?? EPOCH,
    }));
  }
}

async function* collectEvents(db: Db, since: string): AsyncGenerator<SyncRow[]> {
  const pages = keyset(db, {
    select: "e.id, e.type, e.direction, e.at, e.meta, w.catalog_id, w.word",
    from: "learning_events e LEFT JOIN words w ON w.id = e.word_id",
    ts: "e.at",
    id: "e.id",
    since,
  });
  for await (const page of pages) {
    yield page.map((r) => ({
      kind: "event" as const,
      key: String(r.id),
      data: { wk: r.word ? keyOf(r) : null, ...strip(r, "catalog_id", "word") },
      ts: toIso(r._ts) ?? EPOCH,
    }));
  }
}

export const MISTAKE_COLUMNS = [
  "id", "wrong_text", "right_text", "why_vn", "category", "sentence", "source", "occurrences", "created_at",
  "stability", "difficulty", "state", "reps", "lapses", "last_review", "next_review_date", "scheduled_days", "learning_steps",
] as const;

/** The learner's own mistakes. Those taken from the grammar book's exercises quote the book: they stay local. */
async function* collectMistakes(db: Db, since: string): AsyncGenerator<SyncRow[]> {
  const pages = keyset(db, {
    select: `${MISTAKE_COLUMNS.map((c) => `m.${c}`).join(", ")}, w.catalog_id, w.word`,
    from: "mistakes m LEFT JOIN words w ON w.id = m.word_id",
    ts: "COALESCE(m.last_review, m.created_at)",
    id: "m.id",
    where: "m.source != 'grammar'",
    since,
  });
  for await (const page of pages) {
    yield page.map((r) => ({
      kind: "mistake" as const,
      key: String(r.id),
      data: { wk: r.word ? keyOf(r) : null, ...strip(r, "catalog_id", "word") },
      ts: toIso(r._ts) ?? EPOCH,
    }));
  }
}

export const GRAMMAR_COLUMNS = [
  "lesson_id", "diagnostic_status", "score", "mastery", "reps", "lapses", "last_attempt_date", "next_review_date",
  "streak", "first_try_bonus", "stability", "difficulty", "fsrs_state", "last_review",
] as const;

/** Scores and memory state per lesson id: no text of the book */
async function* collectGrammar(db: Db, since: string): AsyncGenerator<SyncRow[]> {
  const pages = keyset(db, {
    select: GRAMMAR_COLUMNS.join(", "),
    from: "grammar_progress",
    ts: "MAX(COALESCE(last_review, ''), COALESCE(last_attempt_date, ''))",
    id: "lesson_id",
    since,
  });
  for await (const page of pages) {
    yield page.map((r) => ({ kind: "grammar" as const, key: String(r.lesson_id), data: strip(r), ts: toIso(r._ts) ?? EPOCH }));
  }
}

/** Words deleted here: a word row marked `deleted`, newer than the word, so the account drops it everywhere */
async function* collectTombstones(db: Db, since: string): AsyncGenerator<SyncRow[]> {
  const pages = keyset(db, { select: "t.key", from: "sync_tombstones t", ts: "t.at", id: "t.key", where: "t.kind = 'word'", since });
  for await (const page of pages) {
    yield page.map((r) => ({ kind: "word" as const, key: String(r.key), data: { deleted: 1 }, ts: toIso(r._ts) ?? EPOCH }));
  }
}

/** `cursor`: the push cursor's name when it is not the kind (two collectors of one kind) */
export const COLLECTORS: Array<{ kind: SyncKind; cursor?: string; collect: (db: Db, since: string) => AsyncGenerator<SyncRow[]> }> = [
  { kind: "word", collect: collectWords },
  { kind: "word", cursor: "tombstone", collect: collectTombstones },
  { kind: "card", collect: collectCards },
  { kind: "log", collect: collectLogs },
  { kind: "event", collect: collectEvents },
  { kind: "mistake", collect: collectMistakes },
  { kind: "grammar", collect: collectGrammar },
];

export interface KvMeta {
  /** Value last seen on this machine */
  v: string;
  /** When it changed here (EPOCH for a value that was there before the first sync) */
  at: string;
  /** Change time already pushed */
  pushedAt?: string;
}

export const kvMetaKey = (key: string) => `kv:${key}`;

export async function readKvMeta(key: string): Promise<KvMeta | null> {
  const raw = await getSyncState(kvMetaKey(key));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as KvMeta;
  } catch {
    return null;
  }
}

export const writeKvMeta = (key: string, meta: KvMeta) => setSyncState(kvMetaKey(key), JSON.stringify(meta));

/**
 * Allowlisted settings/progress keys that changed since they were last pushed. localStorage has no timestamps:
 * a change is dated by its backup in `app_kv` (written within a minute of the change, online or not), else by
 * now. Dating it by the sync made a machine that was offline for days beat newer changes made elsewhere.
 * A value first met is dated EPOCH: a remote value beats it. `commit` records what was pushed.
 */
export async function collectKv(now: Date = new Date()): Promise<{ rows: SyncRow[]; commit: () => Promise<void> }> {
  const rows: SyncRow[] = [];
  const pending: Array<[string, KvMeta]> = [];
  const backedUp = new Map<string, { value: string; at: string | null }>();
  try {
    const db = await getDatabase();
    const keys = Object.keys(SYNCED_KV);
    const found = await db.select<Array<{ key: string; value: string; updated_at: string | null }>>(
      `SELECT key, value, updated_at FROM app_kv WHERE key IN (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
      keys
    );
    for (const f of found) backedUp.set(f.key, { value: f.value, at: toIso(f.updated_at) });
  } catch {}
  for (const key of Object.keys(SYNCED_KV)) {
    let value: string | null = null;
    try {
      value = localStorage.getItem(key);
    } catch {
      continue;
    }
    if (value === null) continue;
    const prev = await readKvMeta(key);
    const backup = backedUp.get(key);
    // When it changed here: its backup's time when the backup holds this value (never later than now)
    // and after the change last seen (a value set back to an older one keeps an older backup time)
    const changedAt =
      backup && backup.value === value && backup.at && backup.at < now.toISOString() && (!prev || backup.at > prev.at)
        ? backup.at
        : now.toISOString();
    const meta: KvMeta =
      prev && prev.v === value ? prev : { v: value, at: prev ? changedAt : EPOCH, pushedAt: prev?.pushedAt };
    if (meta !== prev) await writeKvMeta(key, meta);
    if (meta.pushedAt !== undefined && meta.pushedAt >= meta.at) continue;
    rows.push({ kind: "kv", key, data: { v: value }, ts: meta.at });
    pending.push([key, { ...meta, pushedAt: meta.at }]);
  }
  return {
    rows,
    commit: async () => {
      for (const [key, meta] of pending) await writeKvMeta(key, meta);
    },
  };
}
