/**
 * Applies rows pulled from the account to the local database. Every step is idempotent (a page can be applied
 * twice, a push of our own comes back in the next pull) and merges instead of overwriting: a card, lesson or
 * mistake is replaced only by a row with more progress (more reviews), the later change breaking a tie; logs and
 * events are only ever added. Deck words that this machine does not
 * have yet are created from its copy of the Oxford deck (`vocab_catalog`), as the deck's own top-up does.
 * A word deleted on some machine (a tombstone: word row with `deleted`) is deleted here too, and its older
 * cards, logs and mistakes are not applied (they would bring it back).
 *
 * One ApplyContext serves a whole pull: the word index is read once, not once per page.
 */
import { deleteWordRows, getDatabase, insertCatalogWords } from "../db";
import { getCatalogEntries } from "../vocabCatalog";
import { toCatalogWordInput } from "../vocabFeed";
import { applySyncedGrammarProgress } from "../grammarService";
import { ensureKeyColumn, mistakeKey } from "../mistakes";
import type { GrammarProgress } from "@/types/grammar";
import { CARD_COLUMNS, LOG_COLUMNS, MISTAKE_COLUMNS, readKvMeta, writeKvMeta } from "./collect";
import { EPOCH, isFreeWordKey, isSyncedKvKey, mergeKv, SYNCED_KV, toIso, wordKey } from "./keys";
import type { SyncRow } from "./types";

type Db = Awaited<ReturnType<typeof getDatabase>>;
type Data = Record<string, unknown>;

const values = (rows: number, width: number) =>
  Array.from({ length: rows }, (_, r) => `(${Array.from({ length: width }, (_, c) => `$${r * width + c + 1}`).join(", ")})`).join(", ");

const str = (v: unknown): string | null => (v == null ? null : String(v));

/** What applyRows knows of this machine's words, kept across the pages of one pull */
export interface ApplyContext {
  /** word key -> local word */
  index: Map<string, LocalWord>;
  /** word key -> time it was deleted (here or on another machine) */
  deleted: Map<string, string>;
  /** Some row changed local words: the caller tells the windows once the pull is done */
  wordsChanged: boolean;
}

interface LocalWord {
  id: string;
  /** Time of the word row's own last change */
  ts: string;
  suspended: number;
  created_at: string | null;
}

export async function createApplyContext(): Promise<ApplyContext> {
  const db = await getDatabase();
  const [words, tombstones] = await Promise.all([
    db.select<Array<{ id: string; word: string; catalog_id: string | null; suspended: number | null; created_at: string | null; updated_at: string | null }>>(
      `SELECT id, word, catalog_id, suspended, created_at, updated_at FROM words`
    ),
    db.select<Array<{ key: string; at: string }>>(`SELECT key, at FROM sync_tombstones WHERE kind = 'word'`).catch(() => []),
  ]);
  const index = new Map<string, LocalWord>();
  for (const w of words) {
    index.set(wordKey(w), {
      id: w.id,
      ts: toIso(w.updated_at ?? w.created_at) ?? EPOCH,
      suspended: Number(w.suspended) ? 1 : 0,
      created_at: w.created_at,
    });
  }
  return { index, deleted: new Map(tombstones.map((t) => [t.key, t.at])), wordsChanged: false };
}

/** The row belongs to a word deleted after it was written: applying it would bring the word back */
function isOfDeletedWord(ctx: ApplyContext, key: string | null | undefined, ts: string): boolean {
  if (!key) return false;
  const at = ctx.deleted.get(key);
  return at !== undefined && ts <= at;
}

export interface ApplyResult {
  /** Rows that changed local data */
  applied: number;
  /** Rows that could not be placed yet (their word is unknown): retried once the whole pull is in */
  deferred: SyncRow[];
}

/** Creates the deck words of `keys` this machine lacks. `createdAt` says when each was queued elsewhere. */
async function ensureCatalogWords(ctx: ApplyContext, createdAt: Map<string, string>): Promise<number> {
  const missing = [...createdAt.keys()].filter((k) => !isFreeWordKey(k) && !ctx.index.has(k));
  if (missing.length === 0) return 0;
  const entries = await getCatalogEntries(missing);
  if (entries.length === 0) return 0;
  const inputs = entries.map((e) => toCatalogWordInput(e, createdAt.get(e.id) ?? new Date().toISOString()));
  const ids = await insertCatalogWords(inputs);
  for (const input of inputs) {
    const id = ids.get(input.catalogId);
    if (id) ctx.index.set(input.catalogId, { id, ts: input.createdAt, suspended: 0, created_at: input.createdAt });
  }
  ctx.wordsChanged = true;
  return entries.length;
}

/** A word deleted on another machine: deleted here unless it changed here since */
async function applyDeletions(db: Db, rows: SyncRow[], ctx: ApplyContext): Promise<number> {
  let applied = 0;
  for (const row of rows) {
    const prev = ctx.deleted.get(row.key);
    if (prev === undefined || prev < row.ts) {
      ctx.deleted.set(row.key, row.ts);
      await db.execute(
        `INSERT INTO sync_tombstones (kind, key, at) VALUES ('word', $1, $2)
         ON CONFLICT(kind, key) DO UPDATE SET at = excluded.at WHERE excluded.at > sync_tombstones.at`,
        [row.key, row.ts]
      );
    }
    const local = ctx.index.get(row.key);
    if (!local || local.ts > row.ts) continue;
    await deleteWordRows(db, local.id);
    ctx.index.delete(row.key);
    ctx.wordsChanged = true;
    applied++;
  }
  return applied;
}

const WORD_FREE_COLUMNS = ["phonetic", "part_of_speech", "meaning_vn", "synonyms", "antonyms", "collocations", "code_snippet", "topic", "cefr_level", "variants", "forms"];

async function applyWords(db: Db, rows: SyncRow[], ctx: ApplyContext): Promise<number> {
  let applied = 0;
  const index = ctx.index;
  for (const row of rows) {
    const d = row.data;
    const found = index.get(row.key);
    const local = found?.id;
    if (!isFreeWordKey(row.key)) {
      if (!found) continue; // created from the deck below, with the other rows' times
      // Nothing to change (the usual case on a first pull: the word was just created from the deck)
      const suspended = Number(d.suspended) ? 1 : 0;
      const createdAt = str(d.created_at);
      if (found.ts >= row.ts || (found.suspended === suspended && (!createdAt || createdAt === found.created_at))) continue;
      const res = await db.execute(
        `UPDATE words SET suspended = $1, created_at = COALESCE($2, created_at), updated_at = $3
         WHERE id = $4 AND COALESCE(updated_at, created_at) < $3`,
        [suspended, createdAt, row.ts, local]
      );
      if (res.rowsAffected > 0) {
        index.set(row.key, { ...found, ts: row.ts, suspended, created_at: createdAt ?? found.created_at });
        ctx.wordsChanged = true;
        applied++;
      }
      continue;
    }
    if (local) {
      const sets = WORD_FREE_COLUMNS.map((c, i) => `${c} = $${i + 1}`).join(", ");
      const res = await db.execute(
        `UPDATE words SET ${sets}, suspended = $${WORD_FREE_COLUMNS.length + 1}, updated_at = $${WORD_FREE_COLUMNS.length + 2}
         WHERE id = $${WORD_FREE_COLUMNS.length + 3} AND COALESCE(updated_at, created_at) < $${WORD_FREE_COLUMNS.length + 2}`,
        [...WORD_FREE_COLUMNS.map((c) => d[c] ?? null), Number(d.suspended) ? 1 : 0, row.ts, local]
      );
      // Only a newer remote word brings its examples: from an older row they would resurrect examples
      // replaced (re-enrichment) or deleted here since
      if (res.rowsAffected > 0) {
        for (const ex of (d.examples as Data[] | undefined) ?? []) {
          await db.execute(
            `INSERT OR IGNORE INTO examples (id, word_id, sentence_en, sentence_vn, grammar_analysis, source, focus, sense_index)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [ex.id, local, ex.sentence_en, ex.sentence_vn ?? null, ex.grammar_analysis ?? "", ex.source ?? null, ex.focus ?? null, ex.sense_index ?? null]
          );
        }
        if (found) index.set(row.key, { ...found, ts: row.ts, suspended: Number(d.suspended) ? 1 : 0 });
        ctx.wordsChanged = true;
        applied++;
      }
      continue;
    }
    const id = crypto.randomUUID();
    const created = str(d.created_at) ?? row.ts;
    const res = await db.execute(
      `INSERT OR IGNORE INTO words (id, word, ${WORD_FREE_COLUMNS.join(", ")}, suspended, created_at, updated_at)
       VALUES ${values(1, WORD_FREE_COLUMNS.length + 5)}`,
      [id, d.word, ...WORD_FREE_COLUMNS.map((c) => d[c] ?? null), Number(d.suspended) ? 1 : 0, created, row.ts]
    );
    if (res.rowsAffected === 0) continue; // the same text was added here meanwhile: the next sync reconciles
    index.set(row.key, { id, ts: row.ts, suspended: Number(d.suspended) ? 1 : 0, created_at: created });
    ctx.wordsChanged = true;
    await db.execute(`INSERT OR IGNORE INTO srs_reviews (word_id, next_review_date) VALUES ($1, $2)`, [id, created]);
    for (const ex of (d.examples as Data[] | undefined) ?? []) {
      await db.execute(
        `INSERT OR IGNORE INTO examples (id, word_id, sentence_en, sentence_vn, grammar_analysis, source, focus, sense_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [ex.id, id, ex.sentence_en, ex.sentence_vn ?? null, ex.grammar_analysis ?? "", ex.source ?? null, ex.focus ?? null, ex.sense_index ?? null]
      );
    }
    applied++;
  }
  return applied;
}

/**
 * Multi-row upsert in chunks (SQLite allows ~32k parameters per statement): one statement per chunk instead
 * of one per row. `conflict` is the ON CONFLICT clause. Returns the rows inserted or updated.
 */
async function upsertMany(db: Db, table: string, cols: readonly string[], rows: unknown[][], conflict: string): Promise<number> {
  let applied = 0;
  const size = Math.max(1, Math.floor(30000 / cols.length / 2));
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const res = await db.execute(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES ${values(chunk.length, cols.length)} ${conflict}`,
      chunk.flat()
    );
    applied += res.rowsAffected;
  }
  return applied;
}

async function applyCards(db: Db, rows: SyncRow[], ctx: ApplyContext, deferred: SyncRow[]): Promise<number> {
  const byTable = new Map<string, unknown[][]>();
  const cols = CARD_COLUMNS as readonly string[];
  for (const row of rows) {
    const d = row.data;
    if (isOfDeletedWord(ctx, String(d.wk), row.ts)) continue;
    const wordId = ctx.index.get(String(d.wk))?.id;
    if (!wordId) {
      deferred.push(row);
      continue;
    }
    const table = d.dir === "p" ? "srs_production" : "srs_reviews";
    const list = byTable.get(table) ?? [];
    list.push([wordId, ...cols.map((c) => d[c] ?? null)]);
    byTable.set(table, list);
  }
  let applied = 0;
  for (const [table, list] of byTable) {
    applied += await upsertMany(
      db,
      table,
      ["word_id", ...cols],
      list,
      `ON CONFLICT(word_id) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}
       -- more reviews = more progress (reps only grows); the later review breaks a tie
       WHERE (COALESCE(${table}.reps, 0), COALESCE(${table}.last_review, '')) < (COALESCE(excluded.reps, 0), COALESCE(excluded.last_review, ''))`
    );
  }
  if (applied > 0) ctx.wordsChanged = true;
  return applied;
}

async function insertIgnore(db: Db, table: string, cols: readonly string[], rows: Data[]): Promise<number> {
  let applied = 0;
  const size = Math.max(1, Math.floor(30000 / cols.length / 2));
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const res = await db.execute(
      `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES ${values(chunk.length, cols.length)}`,
      chunk.flatMap((r) => cols.map((c) => r[c] ?? null))
    );
    applied += res.rowsAffected;
  }
  return applied;
}

async function applyLogs(db: Db, rows: SyncRow[], ctx: ApplyContext, deferred: SyncRow[]): Promise<number> {
  const ready: Data[] = [];
  for (const row of rows) {
    if (isOfDeletedWord(ctx, String(row.data.wk), row.ts)) continue;
    const wordId = ctx.index.get(String(row.data.wk))?.id;
    if (!wordId) {
      deferred.push(row);
      continue;
    }
    ready.push({ ...row.data, id: row.key, word_id: wordId });
  }
  return insertIgnore(db, "review_logs", ["word_id", ...LOG_COLUMNS], ready);
}

async function applyEvents(db: Db, rows: SyncRow[], ctx: ApplyContext): Promise<number> {
  const ready: Data[] = rows.map((r) => ({
    ...r.data,
    id: r.key,
    word_id: r.data.wk ? (ctx.index.get(String(r.data.wk))?.id ?? null) : null,
  }));
  return insertIgnore(db, "learning_events", ["id", "type", "word_id", "direction", "at", "meta"], ready);
}

async function applyMistakes(db: Db, rows: SyncRow[], ctx: ApplyContext): Promise<number> {
  const cols = [...(MISTAKE_COLUMNS as readonly string[]), "word_id", "norm_key"];
  const upd = cols.filter((c) => c !== "id" && c !== "created_at");
  const ready = rows
    .filter((row) => !isOfDeletedWord(ctx, row.data.wk ? String(row.data.wk) : null, row.ts))
    .map((row) => {
      const d: Data = {
        ...row.data,
        id: row.key,
        word_id: row.data.wk ? (ctx.index.get(String(row.data.wk))?.id ?? null) : null,
        norm_key: mistakeKey(String(row.data.wrong_text ?? ""), String(row.data.right_text ?? "")),
      };
      return d;
    });
  if (ready.length === 0) return 0;
  await ensureKeyColumn(db);
  // The same mistake noted on two machines has two ids: keep the one already here (the notebook dedupes by
  // norm_key when it saves a mistake)
  const keys = [...new Set(ready.map((d) => String(d.norm_key)))];
  const taken = new Map<string, string>();
  for (let i = 0; i < keys.length; i += 500) {
    const chunk = keys.slice(i, i + 500);
    const found = await db.select<Array<{ id: string; norm_key: string }>>(
      `SELECT id, norm_key FROM mistakes WHERE norm_key IN (${chunk.map((_, j) => `$${j + 1}`).join(", ")})`,
      chunk
    );
    for (const f of found) taken.set(f.norm_key, f.id);
  }
  const fresh = ready.filter((d) => {
    const other = taken.get(String(d.norm_key));
    return other === undefined || other === d.id;
  });
  return upsertMany(
    db,
    "mistakes",
    cols,
    fresh.map((d) => cols.map((c) => d[c] ?? null)),
    `ON CONFLICT(id) DO UPDATE SET ${upd.map((c) => `${c} = excluded.${c}`).join(", ")}
     WHERE (COALESCE(mistakes.reps, 0), COALESCE(mistakes.last_review, mistakes.created_at))
         < (COALESCE(excluded.reps, 0), COALESCE(excluded.last_review, excluded.created_at))`
  );
}

async function applyGrammar(rows: SyncRow[]): Promise<number> {
  const entries: GrammarProgress[] = rows.map(({ data: r }) => ({
    lessonId: String(r.lesson_id),
    diagnosticStatus: (r.diagnostic_status as GrammarProgress["diagnosticStatus"]) || "unattempted",
    score: Number(r.score) || 0,
    mastery: Number(r.mastery) || 0,
    reps: Number(r.reps) || 0,
    lapses: Number(r.lapses) || 0,
    lastAttemptDate: str(r.last_attempt_date) ?? undefined,
    nextReviewDate: str(r.next_review_date) ?? new Date().toISOString(),
    streak: Number(r.streak) || 0,
    firstTryBonusAwarded: !!Number(r.first_try_bonus),
    stability: r.stability == null ? undefined : Number(r.stability),
    difficulty: r.difficulty == null ? undefined : Number(r.difficulty),
    fsrsState: r.fsrs_state == null ? undefined : Number(r.fsrs_state),
    lastReview: str(r.last_review) ?? undefined,
  }));
  return applySyncedGrammarProgress(entries);
}

const KV_EVENTS: Record<string, string> = {
  myenglish_study_logs_v1: "myenglish-activity-updated",
  myenglish_daily_goal_v1: "myenglish-activity-updated",
  myenglish_bonus_freezes_v1: "myenglish-activity-updated",
  myenglish_daily_quests_v1: "myenglish-quests-updated",
  myenglish_weekly_challenges_v1: "myenglish-weekly-challenges-updated",
  myenglish_grammar_introduced_v1: "myenglish-grammar-updated",
  myenglish_grammar_intro_dates_v1: "myenglish-grammar-updated",
  myenglish_grammar_item_levels_v1: "myenglish-grammar-updated",
  myenglish_grammar_set_scores_v1: "myenglish-grammar-updated",
};

async function applyKv(rows: SyncRow[]): Promise<number> {
  let applied = 0;
  const events = new Set<string>();
  for (const row of rows) {
    if (!isSyncedKvKey(row.key)) continue; // never trust the server with a key outside the allowlist
    const remote = str(row.data.v);
    if (remote === null) continue;
    let local: string | null = null;
    try {
      local = localStorage.getItem(row.key);
    } catch {
      continue;
    }
    const meta = await readKvMeta(row.key);
    const merged = mergeKv(SYNCED_KV[row.key], local, remote, row.ts > (meta?.at ?? EPOCH));
    if (merged === null) continue;
    try {
      localStorage.setItem(row.key, merged);
    } catch {
      continue;
    }
    // A pure copy of the remote value is not a local change; a merge that differs from it is, and goes back up
    const copied = merged === remote;
    await writeKvMeta(row.key, {
      v: merged,
      at: copied ? row.ts : new Date().toISOString(),
      pushedAt: copied ? row.ts : meta?.pushedAt,
    });
    const ev = KV_EVENTS[row.key];
    if (ev) events.add(ev);
    applied++;
  }
  if (applied > 0) {
    events.add("myenglish-activity-updated");
    try {
      for (const ev of events) window.dispatchEvent(new CustomEvent(ev));
    } catch {}
  }
  return applied;
}

/**
 * Applies one page of pulled rows (deletions first, then words, then what refers to them). Cards, logs and
 * events of words this machine does not know yet are retried through `deferred` once more words exist.
 * Does not notify the windows: the caller does once, after the whole pull (`ctx.wordsChanged`).
 */
export async function applyRows(rows: SyncRow[], ctx?: ApplyContext): Promise<ApplyResult> {
  if (rows.length === 0) return { applied: 0, deferred: [] };
  const db = await getDatabase();
  const context = ctx ?? (await createApplyContext());
  const by = (kind: SyncRow["kind"]) => rows.filter((r) => r.kind === kind);
  const words = by("word");
  const deletions = words.filter((r) => Number(r.data.deleted) === 1);
  let applied = await applyDeletions(db, deletions, context);
  // A word row newer than its deletion is the word added again: it no longer counts as deleted
  const live = words.filter((r) => Number(r.data.deleted) !== 1 && !isOfDeletedWord(context, r.key, r.ts));

  // When each deck word this page refers to was queued elsewhere (its word row, else its first change)
  const createdAt = new Map<string, string>();
  const note = (key: string, at: string) => {
    if (!key || isFreeWordKey(key) || isOfDeletedWord(context, key, at)) return;
    const cur = createdAt.get(key);
    if (!cur || at < cur) createdAt.set(key, at);
  };
  for (const r of live) note(r.key, String(r.data.created_at ?? r.ts));
  for (const kind of ["card", "log", "event", "mistake"] as const) {
    for (const r of by(kind)) if (r.data.wk) note(String(r.data.wk), r.ts);
  }
  applied += await ensureCatalogWords(context, createdAt);
  const deferred: SyncRow[] = [];
  applied += await applyWords(db, live, context);
  applied += await applyCards(db, by("card"), context, deferred);
  applied += await applyLogs(db, by("log"), context, deferred);
  applied += await applyEvents(db, by("event"), context);
  applied += await applyMistakes(db, by("mistake"), context);
  applied += await applyGrammar(by("grammar"));
  applied += await applyKv(by("kv"));
  return { applied, deferred };
}
