/**
 * Backup / restore of the learner's data as a JSON file (everything: words, examples, both card
 * schedules, review history, grammar progress, settings) and a CSV word list readable in Excel.
 * Files are written by the native `export_backup` command into the Downloads folder.
 */
import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "./db";
import { backupLocalStorageToDb } from "./storageBackup";
import { resetPushCursors } from "./sync/state";

const EXPORT_TABLES = [
  "words",
  "examples",
  "srs_reviews",
  "srs_production",
  "review_logs",
  "grammar_progress",
  "grammar_custom_exercises",
  "grammar_exercise_imports",
  "mistakes",
  "app_kv",
  "grammar_book_chapters",
  "grammar_book_lessons",
  "grammar_book_sets",
  "grammar_book_items",
] as const;
type ExportTable = (typeof EXPORT_TABLES)[number];

/** Primary key of each table (rows whose key already exists are never overwritten on import) */
const PRIMARY_KEY: Record<ExportTable, string> = {
  words: "id",
  examples: "id",
  srs_reviews: "word_id",
  srs_production: "word_id",
  review_logs: "id",
  grammar_progress: "lesson_id",
  grammar_custom_exercises: "id",
  grammar_exercise_imports: "id",
  mistakes: "id",
  app_kv: "key",
  grammar_book_chapters: "id",
  grammar_book_lessons: "id",
  grammar_book_sets: "id",
  grammar_book_items: "id",
};

export interface BackupFile {
  app: "MyEnglish";
  format: 1;
  exportedAt: string;
  tables: Partial<Record<ExportTable, Array<Record<string, unknown>>>>;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function buildBackup(): Promise<BackupFile> {
  // Settings / XP / streak live in localStorage: mirror them into app_kv first so they are included
  await backupLocalStorageToDb().catch(() => {});
  const db = await getDatabase();
  const tables: BackupFile["tables"] = {};
  for (const t of EXPORT_TABLES) {
    tables[t] = await db.select<Array<Record<string, unknown>>>(`SELECT * FROM ${t};`).catch(() => []);
  }
  return { app: "MyEnglish", format: 1, exportedAt: new Date().toISOString(), tables };
}

/** Full JSON backup into Downloads. Returns the path written. */
export async function exportBackupJson(): Promise<string> {
  const backup = await buildBackup();
  return invoke<string>("export_backup", { contents: JSON.stringify(backup), fileName: `myenglish-backup-${stamp()}.json` });
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Word list with meaning, topic, level and schedule, for Excel / Google Sheets. */
export async function exportWordsCsv(): Promise<string> {
  const db = await getDatabase();
  const rows = await db.select<Array<Record<string, unknown>>>(
    `SELECT w.word, w.phonetic, w.part_of_speech, w.meaning_vn, w.topic, w.cefr_level,
            s.state, ROUND(s.stability, 1) AS stability, s.lapses, s.next_review_date,
            p.next_review_date AS recall_next_review, w.created_at
     FROM words w LEFT JOIN srs_reviews s ON s.word_id = w.id LEFT JOIN srs_production p ON p.word_id = w.id
     ORDER BY w.created_at`
  );
  const header = ["word", "phonetic", "part_of_speech", "meaning_vn", "topic", "cefr_level", "state", "stability", "lapses", "next_review_date", "recall_next_review", "created_at"];
  // BOM so Excel opens UTF-8 Vietnamese text correctly
  const csv = "﻿" + [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(","))].join("\r\n");
  return invoke<string>("export_backup", { contents: csv, fileName: `myenglish-words-${stamp()}.csv` });
}

export interface ImportReport {
  inserted: Record<string, number>;
  /** Backup words left out because the library already has them (with progress of their own) */
  skippedExistingWords: number;
  /** Words of the library that were still untouched buffer words, replaced by the backup's version with its progress */
  replacedUntouchedWords: number;
}

export function parseBackup(text: string): BackupFile {
  const parsed = JSON.parse(text);
  if (!parsed || parsed.app !== "MyEnglish" || typeof parsed.tables !== "object") {
    throw new Error("Không phải file sao lưu MyEnglish");
  }
  return parsed as BackupFile;
}

/** Rows per multi-row INSERT; the variable limit of SQLite is 32766 */
const IMPORT_MAX_ROWS = 500;
const IMPORT_MAX_VARS = 30000;

/** Child tables of a word (rows keyed by word_id) */
const WORD_CHILD_TABLES = ["examples", "srs_reviews", "srs_production", "review_logs"] as const;

/** Whether the backup holds real progress for the word: a started card or a log other than the intro card */
function wordIdsWithProgress(backup: BackupFile): Set<string> {
  const ids = new Set<string>();
  for (const table of ["srs_reviews", "srs_production"] as const) {
    for (const r of backup.tables[table] ?? []) {
      if (Number(r.reps ?? 0) > 0 || Number(r.state ?? 0) !== 0) ids.add(String(r.word_id));
    }
  }
  for (const r of backup.tables.review_logs ?? []) {
    if (r.exercise_type !== "intro") ids.add(String(r.word_id));
  }
  return ids;
}

/**
 * Merge a backup into the current data. Progress already in the library is never overwritten: a word the
 * library has (same catalog entry, or same text for words outside the deck) keeps its own progress and the
 * backup's rows for it are skipped. The exception is a word that is still an untouched buffer word (no
 * review, no log but its intro card) when the backup has progress for it (a reset, or a new machine that
 * already topped up its buffer): it is replaced by the backup's version. Other rows are added when their
 * key is new. Rows are written parent-first in multi-row statements, so an interrupted import never leaves
 * a card without its word and a real backup costs hundreds of statements, not tens of thousands.
 */
export async function importBackup(backup: BackupFile): Promise<ImportReport> {
  const db = await getDatabase();
  const report: ImportReport = { inserted: {}, skippedExistingWords: 0, replacedUntouchedWords: 0 };

  const existingWords = await db.select<Array<{ id: string; word: string; catalog_id: string | null; untouched: number }>>(
    `SELECT w.id, w.word, w.catalog_id,
            CASE WHEN COALESCE(s.reps, 0) = 0 AND COALESCE(s.state, 0) = 0
                  AND COALESCE(p.reps, 0) = 0 AND COALESCE(p.state, 0) = 0
                  AND NOT EXISTS (SELECT 1 FROM review_logs r WHERE r.word_id = w.id AND r.exercise_type != 'intro')
                 THEN 1 ELSE 0 END AS untouched
     FROM words w LEFT JOIN srs_reviews s ON s.word_id = w.id LEFT JOIN srs_production p ON p.word_id = w.id;`
  );
  const textKey = (w: unknown) => String(w ?? "").trim().toLowerCase();
  const byCatalog = new Map<string, (typeof existingWords)[number]>();
  const byText = new Map<string, (typeof existingWords)[number]>();
  const freeByText = new Map<string, (typeof existingWords)[number]>();
  for (const w of existingWords) {
    if (w.catalog_id) byCatalog.set(w.catalog_id, w);
    if (!byText.has(textKey(w.word))) byText.set(textKey(w.word), w);
    if (!w.catalog_id && !freeByText.has(textKey(w.word))) freeByText.set(textKey(w.word), w);
  }

  const withProgress = wordIdsWithProgress(backup);
  const skipWordIds = new Set<string>();
  const replaceIds = new Set<string>();
  for (const w of backup.tables.words ?? []) {
    // Deck words are the same word when their catalog id is ("may" and "May" are two); others by their text
    const match = w.catalog_id
      ? (byCatalog.get(String(w.catalog_id)) ?? freeByText.get(textKey(w.word)))
      : byText.get(textKey(w.word));
    if (!match) continue;
    if (match.untouched === 1 && withProgress.has(String(w.id)) && !replaceIds.has(match.id)) {
      replaceIds.add(match.id);
      report.replacedUntouchedWords++;
      continue;
    }
    skipWordIds.add(String(w.id));
    report.skippedExistingWords++;
  }
  // The untouched copies go first (their backup rows are written below); nothing else of theirs is lost
  const replaceList = [...replaceIds];
  for (let i = 0; i < replaceList.length; i += IMPORT_MAX_ROWS) {
    const chunk = replaceList.slice(i, i + IMPORT_MAX_ROWS);
    const ph = chunk.map((_, j) => `$${j + 1}`).join(", ");
    for (const table of WORD_CHILD_TABLES) await db.execute(`DELETE FROM ${table} WHERE word_id IN (${ph})`, chunk);
    await db.execute(`DELETE FROM words WHERE id IN (${ph})`, chunk);
  }

  for (const table of EXPORT_TABLES) {
    const rows = backup.tables[table] ?? [];
    if (rows.length === 0) continue;
    const info = await db.select<Array<{ name: string }>>(`PRAGMA table_info(${table});`);
    const allowed = new Set(info.map((c) => c.name));

    // Rows to write, grouped by the columns they carry (all rows of a table normally share them)
    const groups = new Map<string, { cols: string[]; rows: Array<Record<string, unknown>> }>();
    for (const row of rows) {
      // A mistake only points to a word for reference: it is kept even when that word is skipped
      const wordRef = table === "words" ? row.id : table === "mistakes" ? undefined : row.word_id;
      if (wordRef !== undefined && skipWordIds.has(String(wordRef))) continue;
      if (row[PRIMARY_KEY[table]] == null) continue;
      const cols = Object.keys(row).filter((c) => allowed.has(c));
      if (cols.length === 0) continue;
      const key = cols.join(",");
      const group = groups.get(key) ?? { cols, rows: [] };
      group.rows.push(row);
      groups.set(key, group);
    }

    let count = 0;
    const insert = async (cols: string[], batch: Array<Record<string, unknown>>) => {
      const width = cols.length;
      const values = batch.map((_, r) => `(${cols.map((_, c) => `$${r * width + c + 1}`).join(", ")})`).join(", ");
      const res = await db.execute(
        `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES ${values};`,
        batch.flatMap((row) => cols.map((c) => row[c] ?? null))
      );
      return res.rowsAffected;
    };
    for (const { cols, rows: groupRows } of groups.values()) {
      const size = Math.max(1, Math.min(IMPORT_MAX_ROWS, Math.floor(IMPORT_MAX_VARS / cols.length)));
      for (let i = 0; i < groupRows.length; i += size) {
        const batch = groupRows.slice(i, i + size);
        try {
          count += await insert(cols, batch);
        } catch (err) {
          // One bad row must not lose the rows around it: retry this batch row by row
          console.warn(`Import ${table} batch failed, retrying row by row:`, err);
          for (const row of batch) {
            count += await insert(cols, [row]).catch((e) => {
              console.warn(`Import ${table} row failed:`, e);
              return 0;
            });
          }
        }
      }
    }
    report.inserted[table] = count;
  }
  // Rows from a backup are older than the cloud sync's cursors: have the next pass send them
  await resetPushCursors().catch(() => {});
  return report;
}
