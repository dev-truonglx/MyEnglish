/**
 * Course content from Supabase (migration 0008): the Oxford deck (`catalog_words`) and the grammar book
 * (`grammar_content`), rebuilt into exactly the shape of src/data/vocabCatalog.json / grammarCatalog.json.
 * The app only loads these when its SQLite copy is missing or older (vocabCatalog.ts, grammarBook.ts).
 */
import { getSupabase } from "@/services/supabase";

const PAGE = 1000;

async function readAll<T>(table: string, columns: string): Promise<T[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase is not configured");
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(columns).order("idx").range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

async function readMeta(key: string): Promise<Record<string, unknown> | null> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase is not configured");
  const { data, error } = await sb.from("catalog_meta").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(`catalog_meta: ${error.message}`);
  return (data?.value as Record<string, unknown>) ?? null;
}

export async function fetchVocabCatalog(): Promise<Record<string, unknown>> {
  const [meta, rows] = await Promise.all([readMeta("vocab"), readAll<{ data: unknown }>("catalog_words", "data")]);
  if (!meta || rows.length === 0) throw new Error("The vocabulary deck has not been uploaded (scripts/web/upload-content.mjs)");
  const { count: _count, ...head } = meta;
  return { ...head, words: rows.map((r) => r.data) };
}

/** An empty book when it is hidden, not uploaded, or unauthenticated: grammarBook.ts then seeds nothing and tries again later */
export async function fetchGrammarCatalog(): Promise<Record<string, unknown>> {
  try {
    const meta = await readMeta("grammar");
    if (!meta || meta.enabled === false) return { version: 0, totalFiles: 0, files: [] };
    const rows = await readAll<{ data: unknown }>("grammar_content", "data");
    return { version: meta.version, totalFiles: rows.length, files: rows.map((r) => r.data) };
  } catch (err) {
    console.info("fetchGrammarCatalog: fallback to local grammar catalog", err instanceof Error ? `(${err.message})` : err);
    return { version: 0, totalFiles: 0, files: [] };
  }
}
