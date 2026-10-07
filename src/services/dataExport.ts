/**
 * Backup / restore of the learner's data as a JSON file (everything: words, examples, both card
 * schedules, review history, grammar progress, settings) and a CSV word list readable in Excel.
 * Files are written by the native `export_backup` command into the Downloads folder.
 */
import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "./db";
import { backupLocalStorageToDb } from "./storageBackup";

const EXPORT_TABLES = [
  "words",
  "examples",
  "srs_reviews",
  "srs_production",
  "review_logs",
  "grammar_progress",
  "grammar_custom_exercises",
  "mistakes",
  "app_kv",
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
  mistakes: "id",
  app_kv: "key",
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
  skippedExistingWords: number;
}

export function parseBackup(text: string): BackupFile {
  const parsed = JSON.parse(text);
  if (!parsed || parsed.app !== "MyEnglish" || typeof parsed.tables !== "object") {
    throw new Error("Không phải file sao lưu MyEnglish");
  }
  return parsed as BackupFile;
}

/**
 * Merge a backup into the current data. Nothing existing is overwritten: a word already in the library
 * (same text) keeps its own progress, and its rows from the backup are skipped; other rows are added
 * when their key is new. Rows are written parent-first, so an interrupted import never leaves a card
 * without its word.
 */
export async function importBackup(backup: BackupFile): Promise<ImportReport> {
  const db = await getDatabase();
  const report: ImportReport = { inserted: {}, skippedExistingWords: 0 };

  const existingWords = await db.select<Array<{ id: string; word: string }>>(`SELECT id, word FROM words;`);
  const existingText = new Set(existingWords.map((w) => w.word.trim().toLowerCase()));
  const skipWordIds = new Set<string>();
  for (const w of backup.tables.words ?? []) {
    if (existingText.has(String(w.word ?? "").trim().toLowerCase())) {
      skipWordIds.add(String(w.id));
      report.skippedExistingWords++;
    }
  }

  for (const table of EXPORT_TABLES) {
    const rows = backup.tables[table] ?? [];
    if (rows.length === 0) continue;
    const info = await db.select<Array<{ name: string }>>(`PRAGMA table_info(${table});`);
    const allowed = new Set(info.map((c) => c.name));
    let count = 0;
    for (const row of rows) {
      // A mistake only points to a word for reference: it is kept even when that word is skipped
      const wordRef = table === "words" ? row.id : table === "mistakes" ? undefined : row.word_id;
      if (wordRef !== undefined && skipWordIds.has(String(wordRef))) continue;
      if (row[PRIMARY_KEY[table]] == null) continue;
      const cols = Object.keys(row).filter((c) => allowed.has(c));
      if (cols.length === 0) continue;
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const res = await db
        .execute(`INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders});`, cols.map((c) => row[c] ?? null))
        .catch((err) => {
          console.warn(`Import ${table} row failed:`, err);
          return null;
        });
      if (res && res.rowsAffected > 0) count++;
    }
    report.inserted[table] = count;
  }
  return report;
}
