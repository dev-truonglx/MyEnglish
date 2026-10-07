import Database from "@tauri-apps/plugin-sql";
import type { Word, WordExample, SRSReview, CreateWordInput, WordDetail } from "@/types/database";
import { initReviewLogsTable } from "./smartReview";
import { logTerminal } from "./logger";

const DB_PATH = "sqlite:myenglish.db";
const SCHEMA_VERSION = 9;
let dbInstance: Database | null = null;
let initPromise: Promise<Database> | null = null;

/** Columns selected for Word records */
export const WORD_COLUMNS = [
  "id",
  "word",
  "phonetic",
  "part_of_speech",
  "meaning_vn",
  "image_url",
  "synonyms",
  "antonyms",
  "collocations",
  "code_snippet",
  "topic",
  "cefr_level",
  "suspended",
  "created_at",
].join(", ");

/** Columns selected for WordExample records */
export const EXAMPLE_COLUMNS = [
  "id",
  "word_id",
  "sentence_en",
  "sentence_vn",
  "grammar_analysis",
  "source",
].join(", ");

/** Columns selected for SRSReview records */
export const SRS_COLUMNS = [
  "word_id",
  "ease_factor",
  "interval",
  "repetitions",
  "next_review_date",
  "stability",
  "difficulty",
  "elapsed_days",
  "scheduled_days",
  "reps",
  "lapses",
  "state",
  "last_review",
  "learning_steps",
].join(", ");

/**
 * Initialize and get the database connection singleton.
 */
export async function getDatabase(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }
  if (initPromise) {
    return initPromise;
  }
  initPromise = (async () => {
    try {
      const db = await Database.load(DB_PATH);
      dbInstance = db;
      await initSchema(db);
      return db;
    } catch (err) {
      dbInstance = null;
      initPromise = null;
      console.error("Database initialization failed:", err);
      throw err;
    }
  })();
  return initPromise;
}

/**
 * Creates required tables and indexes if they don't exist.
 */
export async function initSchema(db: Database): Promise<void> {
  // Check current schema version
  const versionRows = await db.select<{ user_version: number }[]>(`PRAGMA user_version;`);
  const currentVersion = versionRows[0]?.user_version ?? 0;
  if (currentVersion >= SCHEMA_VERSION) {
    await repairMissingSrsRows(db);
    return;
  }

  // 1. Words table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS words (
      id TEXT PRIMARY KEY,
      word TEXT NOT NULL,
      phonetic TEXT,
      part_of_speech TEXT,
      meaning_vn TEXT NOT NULL,
      image_url TEXT,
      synonyms TEXT,
      antonyms TEXT,
      collocations TEXT,
      code_snippet TEXT,
      topic TEXT DEFAULT 'General Tech',
      cefr_level TEXT,
      suspended INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Examples table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS examples (
      id TEXT PRIMARY KEY,
      word_id TEXT NOT NULL,
      sentence_en TEXT NOT NULL,
      sentence_vn TEXT,
      grammar_analysis TEXT NOT NULL,
      source TEXT,
      FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
    );
  `);

  // 3. Spaced Repetition (SRS) table - Supports FSRS & Legacy SM-2
  await db.execute(`
    CREATE TABLE IF NOT EXISTS srs_reviews (
      word_id TEXT PRIMARY KEY,
      ease_factor REAL DEFAULT 2.5,
      interval INTEGER DEFAULT 0,
      repetitions INTEGER DEFAULT 0,
      next_review_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      stability REAL DEFAULT 0,
      difficulty REAL DEFAULT 0,
      elapsed_days INTEGER DEFAULT 0,
      scheduled_days INTEGER DEFAULT 0,
      reps INTEGER DEFAULT 0,
      lapses INTEGER DEFAULT 0,
      state INTEGER DEFAULT 0,
      last_review TIMESTAMP,
      learning_steps INTEGER DEFAULT 0,
      FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
    );
  `);

  // 4. Grammar Progress & SRS table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS grammar_progress (
      lesson_id TEXT PRIMARY KEY,
      diagnostic_status TEXT DEFAULT 'unattempted',
      score INTEGER DEFAULT 0,
      mastery INTEGER DEFAULT 0,
      reps INTEGER DEFAULT 0,
      lapses INTEGER DEFAULT 0,
      last_attempt_date TIMESTAMP,
      next_review_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      streak INTEGER DEFAULT 0,
      first_try_bonus INTEGER DEFAULT 0,
      stability REAL DEFAULT 0,
      difficulty REAL DEFAULT 0,
      fsrs_state INTEGER DEFAULT 0,
      last_review TIMESTAMP
    );
  `);

  // 5. Grammar Custom / AI Generated Exercises table (for permanent persistence)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS grammar_custom_exercises (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL,
      type TEXT NOT NULL,
      prompt_en TEXT NOT NULL,
      prompt_vn TEXT,
      hint TEXT,
      options TEXT,
      correct_answer TEXT NOT NULL,
      error_word TEXT,
      explanation TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  try {
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_grammar_custom_ex_lesson ON grammar_custom_exercises(lesson_id);`);
  } catch {}

  // 6. Key-value backup for settings/XP/streak that live in localStorage
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await runMigrations(db);
  await repairMissingSrsRows(db);

  // Initialize review_logs table for response time & exercise type tracking
  await initReviewLogsTable(db);
}

/** Repair words left without an SRS row (e.g. a write failed halfway); otherwise they would never become due */
async function repairMissingSrsRows(db: Database): Promise<void> {
  try {
    await db.execute(`
      INSERT INTO srs_reviews (word_id, next_review_date)
      SELECT id, created_at FROM words WHERE id NOT IN (SELECT word_id FROM srs_reviews);
    `);
  } catch (e) {
    console.warn("SRS row repair notice:", e);
  }
}

/**
 * Versioned migrations tracked with PRAGMA user_version so they run exactly once.
 */
async function runMigrations(db: Database): Promise<void> {
  const versionRows = await db.select<{ user_version: number }[]>(`PRAGMA user_version;`);
  const version = versionRows[0]?.user_version ?? 0;

  // Expected, harmless failures of idempotent steps (re-running ALTER/CREATE on an upgraded file)
  const isBenign = (err: unknown) => /duplicate column name|already exists/i.test(String(err));
  let failures = 0;
  const tryExec = async (sql: string) => {
    try {
      await db.execute(sql);
    } catch (err) {
      if (isBenign(err)) return;
      failures++;
      console.error(`[DB] Migration step failed: ${sql.trim().split("\n")[0].slice(0, 120)}`, err);
      logTerminal("DB", `Migration step failed: ${String(err)}`);
    }
  };

  if (version < 1) {
    // Columns added over time (errors mean the column already exists)
    await tryExec(`ALTER TABLE words ADD COLUMN phonetic TEXT;`);
    await tryExec(`ALTER TABLE words ADD COLUMN part_of_speech TEXT;`);
    await tryExec(`ALTER TABLE words ADD COLUMN collocations TEXT;`);
    await tryExec(`ALTER TABLE words ADD COLUMN code_snippet TEXT;`);
    await tryExec(`ALTER TABLE words ADD COLUMN topic TEXT DEFAULT 'General Tech';`);
    await tryExec(`ALTER TABLE examples ADD COLUMN sentence_vn TEXT;`);

    // FSRS columns
    await tryExec(`ALTER TABLE srs_reviews ADD COLUMN stability REAL DEFAULT 0;`);
    await tryExec(`ALTER TABLE srs_reviews ADD COLUMN difficulty REAL DEFAULT 0;`);
    await tryExec(`ALTER TABLE srs_reviews ADD COLUMN elapsed_days INTEGER DEFAULT 0;`);
    await tryExec(`ALTER TABLE srs_reviews ADD COLUMN scheduled_days INTEGER DEFAULT 0;`);
    await tryExec(`ALTER TABLE srs_reviews ADD COLUMN reps INTEGER DEFAULT 0;`);
    await tryExec(`ALTER TABLE srs_reviews ADD COLUMN lapses INTEGER DEFAULT 0;`);
    await tryExec(`ALTER TABLE srs_reviews ADD COLUMN state INTEGER DEFAULT 0;`);
    await tryExec(`ALTER TABLE srs_reviews ADD COLUMN last_review TIMESTAMP;`);

    // Migrate legacy SM-2 rows to initial FSRS state
    try {
      await db.execute(`
        UPDATE srs_reviews
        SET
          stability = CASE WHEN interval > 0 THEN CAST(interval AS REAL) ELSE 1.0 END,
          difficulty = 5.0,
          reps = repetitions,
          scheduled_days = interval,
          state = 2
        WHERE (stability IS NULL OR stability = 0) AND repetitions > 0;
      `);
    } catch (e) {
      console.warn("FSRS legacy data migration notice:", e);
    }

    // Deduplicate words, keeping the copy with the most review progress
    try {
      await db.execute(`
        DELETE FROM words WHERE id NOT IN (
          SELECT id FROM (
            SELECT w.id, ROW_NUMBER() OVER (
              PARTITION BY LOWER(TRIM(w.word))
              ORDER BY COALESCE(s.reps, 0) DESC, w.created_at DESC
            ) as rn
            FROM words w LEFT JOIN srs_reviews s ON s.word_id = w.id
          ) WHERE rn = 1
        );
      `);
      await db.execute(`DELETE FROM examples WHERE word_id NOT IN (SELECT id FROM words);`);
      await db.execute(`DELETE FROM srs_reviews WHERE word_id NOT IN (SELECT id FROM words);`);
    } catch (e) {
      console.warn("Deduplication notice:", e);
    }

    await tryExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_words_word_unique ON words(LOWER(TRIM(word)));`);
    await tryExec(`CREATE INDEX IF NOT EXISTS idx_words_word ON words(word);`);
    await tryExec(`CREATE INDEX IF NOT EXISTS idx_words_topic ON words(topic);`);
    await tryExec(`CREATE INDEX IF NOT EXISTS idx_examples_word_id ON examples(word_id);`);
    await tryExec(`CREATE INDEX IF NOT EXISTS idx_srs_reviews_next_date ON srs_reviews(next_review_date);`);
  }

  if (version < 2) {
    // ts-fsrs v5 needs the current learning step persisted, otherwise Learning cards never graduate
    await tryExec(`ALTER TABLE srs_reviews ADD COLUMN learning_steps INTEGER DEFAULT 0;`);

    // Normalize SQLite CURRENT_TIMESTAMP values ("YYYY-MM-DD HH:MM:SS", UTC) to ISO so that
    // string comparisons in SQL and `new Date()` parsing in JS agree.
    await tryExec(`UPDATE srs_reviews SET next_review_date = REPLACE(next_review_date, ' ', 'T') || 'Z' WHERE next_review_date NOT LIKE '%T%';`);
    await tryExec(`UPDATE words SET created_at = REPLACE(created_at, ' ', 'T') || 'Z' WHERE created_at NOT LIKE '%T%';`);
  }

  if (version < 3) {
    // 1 = scheduled FSRS review, 0 = practice outside the schedule, NULL = logged before this column existed.
    // Only rows with is_scheduled = 1 are valid training data for the FSRS optimizer.
    await initReviewLogsTable(db);
    await tryExec(`ALTER TABLE review_logs ADD COLUMN is_scheduled INTEGER;`);
  }

  if (version < 4) {
    // Production cards (recall the English word) get their own FSRS schedule, separate from recognition.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS srs_production (
        word_id TEXT PRIMARY KEY,
        ease_factor REAL DEFAULT 2.5,
        interval INTEGER DEFAULT 0,
        repetitions INTEGER DEFAULT 0,
        next_review_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        stability REAL DEFAULT 0,
        difficulty REAL DEFAULT 0,
        elapsed_days INTEGER DEFAULT 0,
        scheduled_days INTEGER DEFAULT 0,
        reps INTEGER DEFAULT 0,
        lapses INTEGER DEFAULT 0,
        state INTEGER DEFAULT 0,
        last_review TIMESTAMP,
        learning_steps INTEGER DEFAULT 0,
        FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
      );
    `);
    await tryExec(`CREATE INDEX IF NOT EXISTS idx_srs_production_next_date ON srs_production(next_review_date);`);

    // Seed production cards for words already known by recognition. Recall is harder than recognition,
    // so start from half the stability and half the interval (never later than the recognition due date).
    await tryExec(`
      INSERT OR IGNORE INTO srs_production (
        word_id, ease_factor, interval, repetitions, next_review_date, stability, difficulty,
        elapsed_days, scheduled_days, reps, lapses, state, last_review, learning_steps
      )
      SELECT
        word_id, 2.5, MAX(1, scheduled_days / 2), reps,
        MIN(
          next_review_date,
          strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(last_review, next_review_date), '+' || MAX(1, scheduled_days / 2) || ' days')
        ),
        stability * 0.5, difficulty, 0, MAX(1, scheduled_days / 2), reps, 0, 2, last_review, 0
      FROM srs_reviews
      WHERE state = 2 AND stability > 0;
    `);

    // NULL for rows logged before directions existed (treated as recognition)
    await initReviewLogsTable(db);
    await tryExec(`ALTER TABLE review_logs ADD COLUMN direction TEXT;`);
  }

  if (version < 5) {
    // CEFR level of the term (from AI enrichment), used to keep content and assessment level-accurate
    await tryExec(`ALTER TABLE words ADD COLUMN cefr_level TEXT;`);
  }

  if (version < 6) {
    // The v1 dedupe deleted words without their review logs; drop those orphans
    await initReviewLogsTable(db);
    await tryExec(`DELETE FROM review_logs WHERE word_id NOT IN (SELECT id FROM words);`);
  }

  if (version < 7) {
    // Memory state of the card just before each answer: true retention (answers to cards in Review state),
    // calibration (predicted R vs remembered) and clean training data for the FSRS optimizer
    await initReviewLogsTable(db);
    await tryExec(`ALTER TABLE review_logs ADD COLUMN state_before INTEGER;`);
    await tryExec(`ALTER TABLE review_logs ADD COLUMN stability_before REAL;`);
    await tryExec(`ALTER TABLE review_logs ADD COLUMN difficulty_before REAL;`);
    await tryExec(`ALTER TABLE review_logs ADD COLUMN r_predicted REAL;`);
    await tryExec(`ALTER TABLE review_logs ADD COLUMN elapsed_days_before REAL;`);
    await tryExec(`CREATE INDEX IF NOT EXISTS idx_review_logs_sched_time ON review_logs(is_scheduled, timestamp);`);
    // One meaning of "correct" everywhere: not graded Again (Hard is a pass in FSRS)
    await tryExec(`UPDATE review_logs SET is_correct = CASE WHEN rating > 1 THEN 1 ELSE 0 END WHERE rating BETWEEN 1 AND 4;`);
    // Leech action "suspend" / suspended by hand: left out of every session
    await tryExec(`ALTER TABLE words ADD COLUMN suspended INTEGER DEFAULT 0;`);
    // "user_context" = the sentence the learner met the word in
    await tryExec(`ALTER TABLE examples ADD COLUMN source TEXT;`);
  }
  if (version < 8) {
    // Learning moments and reminder outcomes: words reaching long-term memory, and what happened to each
    // reminder (shown / opened / snoozed / ignored) and session, to see and tune study habits
    await tryExec(`
      CREATE TABLE IF NOT EXISTS learning_events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        word_id TEXT,
        direction TEXT,
        at TIMESTAMP NOT NULL,
        meta TEXT
      );
    `);
    await tryExec(`CREATE INDEX IF NOT EXISTS idx_learning_events_type_at ON learning_events(type, at);`);
  }
  if (version < 9) {
    // The learner's own mistakes (from AI-corrected writing), reviewed as cards with their own FSRS schedule
    await tryExec(`
      CREATE TABLE IF NOT EXISTS mistakes (
        id TEXT PRIMARY KEY,
        wrong_text TEXT NOT NULL,
        right_text TEXT NOT NULL,
        why_vn TEXT,
        category TEXT,
        sentence TEXT,
        source TEXT NOT NULL,
        word_id TEXT,
        occurrences INTEGER DEFAULT 1,
        created_at TIMESTAMP NOT NULL,
        stability REAL DEFAULT 0,
        difficulty REAL DEFAULT 0,
        state INTEGER DEFAULT 0,
        reps INTEGER DEFAULT 0,
        lapses INTEGER DEFAULT 0,
        last_review TIMESTAMP,
        next_review_date TIMESTAMP NOT NULL,
        scheduled_days INTEGER DEFAULT 0,
        learning_steps INTEGER DEFAULT 0
      );
    `);
    await tryExec(`CREATE INDEX IF NOT EXISTS idx_mistakes_due ON mistakes(next_review_date);`);
  }

  // Every block is idempotent: when a step failed unexpectedly, user_version stays put so the failed
  // steps are retried on the next launch (later blocks still run, so new columns always exist)
  if (version < SCHEMA_VERSION) {
    if (failures === 0) await db.execute(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    else console.error(`[DB] ${failures} migration step(s) failed; schema version kept at ${version}, retrying next launch`);
  }
}

/**
 * Predefined topic categories for software engineering and English learning
 */
export const PREDEFINED_TOPICS = [
  "System Design",
  "Database & Storage",
  "Concurrency & Async",
  "Networking & APIs",
  "Security & Auth",
  "DevOps & Cloud",
  "Frontend & UI",
  "Backend & Microservices",
  "Data Structures & Algorithms",
  "Architecture & Patterns",
  "Testing & QA",
  "General Tech",
  "Everyday Life",
] as const;

/**
 * Health check to verify tables and count items
 */
export async function getDatabaseStatus(): Promise<{
  connected: boolean;
  wordCount: number;
  tables: string[];
}> {
  try {
    const db = await getDatabase();
    const tablesResult = await db.select<{ name: string }[]>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`
    );
    const countResult = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM words;`
    );

    return {
      connected: true,
      wordCount: countResult[0]?.count ?? 0,
      tables: tablesResult.map((t) => t.name),
    };
  } catch (error) {
    console.error("Failed to check database status:", error);
    return {
      connected: false,
      wordCount: 0,
      tables: [],
    };
  }
}

/**
 * Insert or update a fully enriched word with examples and initial SRS record.
 * Guarantees NO duplicate words in the database (Upsert behavior).
 */
export async function insertEnrichedWord(input: CreateWordInput): Promise<string> {
  const cleanWord = input.word.trim().toLowerCase();
  logTerminal("DB", `Bắt đầu lưu vào SQLite: "${cleanWord}"...`);
  try {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const topic = input.topic?.trim() || "General Tech";

  // 1. Check if word already exists in SQLite
  const existingList = await db.select<Word[]>(
    `SELECT ${WORD_COLUMNS} FROM words WHERE LOWER(TRIM(word)) = $1 LIMIT 1;`,
    [cleanWord]
  );

  let wordId: string;

  if (existingList.length > 0) {
    // Word exists: UPDATE instead of creating a duplicate row
    wordId = existingList[0].id;
    try {
      await db.execute(
        `UPDATE words 
         SET phonetic = COALESCE($1, phonetic),
             part_of_speech = COALESCE($2, part_of_speech),
             meaning_vn = $3,
             synonyms = $4,
             antonyms = $5,
             collocations = COALESCE($6, collocations),
             code_snippet = COALESCE($7, code_snippet),
             topic = COALESCE($8, topic, 'General Tech')
         WHERE id = $9;`,
        [
          input.phonetic || null,
          input.part_of_speech || null,
          input.meaning_vn,
          JSON.stringify(input.synonyms || []),
          JSON.stringify(input.antonyms || []),
          input.collocations ? JSON.stringify(input.collocations) : null,
          input.code_snippet || null,
          input.topic || null,
          wordId,
        ]
      );
    } catch {
      await db.execute(
        `UPDATE words 
         SET meaning_vn = $1,
             synonyms = $2,
             antonyms = $3,
             topic = COALESCE($4, topic, 'General Tech')
         WHERE id = $5;`,
        [
          input.meaning_vn,
          JSON.stringify(input.synonyms || []),
          JSON.stringify(input.antonyms || []),
          input.topic || null,
          wordId,
        ]
      );
    }

  } else {
    // New word: INSERT
    wordId = crypto.randomUUID();
    try {
      await db.execute(
        `INSERT INTO words (id, word, phonetic, part_of_speech, meaning_vn, image_url, synonyms, antonyms, collocations, code_snippet, topic, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          wordId,
          cleanWord,
          input.phonetic || null,
          input.part_of_speech || null,
          input.meaning_vn,
          input.image_url || null,
          JSON.stringify(input.synonyms || []),
          JSON.stringify(input.antonyms || []),
          input.collocations ? JSON.stringify(input.collocations) : null,
          input.code_snippet || null,
          topic,
          now,
        ]
      );
    } catch {
      await db.execute(
        `INSERT INTO words (id, word, meaning_vn, image_url, synonyms, antonyms, topic, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          wordId,
          cleanWord,
          input.meaning_vn,
          input.image_url || null,
          JSON.stringify(input.synonyms || []),
          JSON.stringify(input.antonyms || []),
          topic,
          now,
        ]
      );
    }

    // Insert initial SRS review record for new word (FSRS compatible)
    await db.execute(
      `INSERT INTO srs_reviews (word_id, ease_factor, interval, repetitions, next_review_date, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state)
       VALUES ($1, 2.5, 0, 0, $2, 0, 0, 0, 0, 0, 0, 0)
       ON CONFLICT(word_id) DO NOTHING`,
      [wordId, now]
    );
  }

  // CEFR level of the term (kept when a re-enrichment doesn't report one)
  if (input.cefr_level) {
    await db.execute(`UPDATE words SET cefr_level = $1 WHERE id = $2;`, [input.cefr_level, wordId]);
  }

  // Insert the new examples first, then drop the old ones, so a failed insert never leaves the word empty
  const exampleIds: string[] = [];
  const validExamples = input.examples.filter((ex) => ex.sentence_en?.trim());
  if (validExamples.length > 0) {
    const params: unknown[] = [];
    const rows = validExamples.map((example, i) => {
      const exampleId = crypto.randomUUID();
      exampleIds.push(exampleId);
      params.push(exampleId, wordId, example.sentence_en, example.sentence_vn || null, example.grammar_analysis || "", example.source ?? null);
      const o = i * 6;
      return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6})`;
    });
    await db.execute(
      `INSERT INTO examples (id, word_id, sentence_en, sentence_vn, grammar_analysis, source) VALUES ${rows.join(", ")}`,
      params
    );
  }
  if (existingList.length > 0) {
    // Re-enrichment replaces AI examples; the learner's own sentences are always kept
    const keepPlaceholders = exampleIds.map((_, i) => `$${i + 2}`).join(", ");
    await db.execute(
      exampleIds.length > 0
        ? `DELETE FROM examples WHERE word_id = $1 AND id NOT IN (${keepPlaceholders}) AND COALESCE(source, '') != 'user_context';`
        : `DELETE FROM examples WHERE word_id = $1 AND COALESCE(source, '') != 'user_context';`,
      [wordId, ...exampleIds]
    );
  }

    logTerminal("DB", `Đã lưu thành công từ "${cleanWord}" vào SQLite (id: ${wordId}) ✓`);
    return wordId;
  } catch (err) {
    logTerminal("DB ERROR", `Lỗi lưu từ "${cleanWord}" vào SQLite: ${err}`);
    console.error(`Failed to insert word "${cleanWord}":`, err);
    throw err;
  }
}

/** Prefixes of the temporary meanings written while a word waits for (or failed) AI enrichment */
export const PLACEHOLDER_MEANING_PREFIXES = ["Đang phân tích nghĩa", "Chờ phân tích"] as const;

/**
 * True when the stored meaning is only a pipeline placeholder (word not enriched yet).
 */
export function isPlaceholderMeaning(meaning: string | null | undefined): boolean {
  const m = (meaning || "").trim();
  if (!m) return true;
  return PLACEHOLDER_MEANING_PREFIXES.some((p) => m.startsWith(p));
}

/**
 * Insert a word only if it does not exist yet. Never modifies an existing row.
 */
export async function insertWordIfAbsent(input: CreateWordInput): Promise<{ id: string; inserted: boolean }> {
  const cleanWord = input.word.trim().toLowerCase();
  const db = await getDatabase();
  const existing = await db.select<{ id: string }[]>(
    `SELECT id FROM words WHERE LOWER(TRIM(word)) = $1 LIMIT 1;`,
    [cleanWord]
  );
  if (existing.length > 0) {
    return { id: existing[0].id, inserted: false };
  }
  try {
    const id = await insertEnrichedWord(input);
    return { id, inserted: true };
  } catch (err) {
    // Lost a race with another insert (unique index): treat as existing
    const again = await db.select<{ id: string }[]>(
      `SELECT id FROM words WHERE LOWER(TRIM(word)) = $1 LIMIT 1;`,
      [cleanWord]
    );
    if (again.length > 0) return { id: again[0].id, inserted: false };
    throw err;
  }
}

/**
 * Words still holding a placeholder meaning (pending or failed enrichment).
 */
export async function getPlaceholderWords(): Promise<{ id: string; word: string; meaning_vn: string }[]> {
  const db = await getDatabase();
  const clauses = PLACEHOLDER_MEANING_PREFIXES.map((_, i) => `meaning_vn LIKE $${i + 1}`).join(" OR ");
  return db.select<{ id: string; word: string; meaning_vn: string }[]>(
    `SELECT id, word, meaning_vn FROM words WHERE TRIM(COALESCE(meaning_vn, '')) = '' OR ${clauses};`,
    PLACEHOLDER_MEANING_PREFIXES.map((p) => `${p}%`)
  );
}

/**
 * Replace the meaning of a word only while it still holds a placeholder (never touches enriched words).
 */
export async function replacePlaceholderMeaning(word: string, meaning: string): Promise<void> {
  const db = await getDatabase();
  const clauses = PLACEHOLDER_MEANING_PREFIXES.map((_, i) => `meaning_vn LIKE $${i + 3}`).join(" OR ");
  await db.execute(
    `UPDATE words SET meaning_vn = $1 WHERE LOWER(TRIM(word)) = $2 AND (TRIM(COALESCE(meaning_vn, '')) = '' OR ${clauses});`,
    [meaning, word.trim().toLowerCase(), ...PLACEHOLDER_MEANING_PREFIXES.map((p) => `${p}%`)]
  );
}

function defaultSrsFor(word: Word): SRSReview {
  return {
    word_id: word.id,
    ease_factor: 2.5,
    interval: 0,
    repetitions: 0,
    next_review_date: word.created_at,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    last_review: null,
    learning_steps: 0,
  };
}

/**
 * Attach examples and SRS rows to a list of words using 2 batched queries instead of 2 per word.
 */
async function hydrateWords(db: Database, words: Word[], wordFilterSql: string, params: unknown[]): Promise<WordDetail[]> {
  if (words.length === 0) return [];
  const [examples, srsRows, productionRows, logStats] = await Promise.all([
    db.select<WordExample[]>(`SELECT ${EXAMPLE_COLUMNS} FROM examples WHERE word_id IN (${wordFilterSql});`, params),
    db.select<SRSReview[]>(`SELECT ${SRS_COLUMNS} FROM srs_reviews WHERE word_id IN (${wordFilterSql});`, params),
    db.select<SRSReview[]>(`SELECT ${SRS_COLUMNS} FROM srs_production WHERE word_id IN (${wordFilterSql});`, params),
    db.select<Array<{ word_id: string; total: number; correct: number; wrong: number }>>(
      `SELECT word_id, COUNT(*) as total,
              SUM(CASE WHEN rating > 1 THEN 1 ELSE 0 END) as correct,
              SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as wrong
       FROM review_logs WHERE word_id IN (${wordFilterSql}) AND exercise_type != 'intro' GROUP BY word_id;`,
      params
    ).catch(() => []),
  ]);

  const examplesByWord = new Map<string, WordExample[]>();
  for (const ex of examples) {
    const list = examplesByWord.get(ex.word_id);
    if (list) list.push(ex);
    else examplesByWord.set(ex.word_id, [ex]);
  }
  const srsByWord = new Map(srsRows.map((row) => [row.word_id, row]));
  const productionByWord = new Map(productionRows.map((row) => [row.word_id, row]));
  const logStatsByWord = new Map((logStats || []).map((row) => [row.word_id, row]));

  return words.map((word) => {
    const srs = srsByWord.get(word.id) ?? defaultSrsFor(word);
    const prodSrs = productionByWord.get(word.id) ?? null;
    const logStat = logStatsByWord.get(word.id);

    const baseReps = (srs.reps ?? srs.repetitions ?? 0) + (prodSrs?.reps ?? prodSrs?.repetitions ?? 0);
    const baseLapses = (srs.lapses ?? 0) + (prodSrs?.lapses ?? 0);

    let totalAttempts = 0;
    let correctCount = 0;
    let wrongCount = 0;

    if (logStat && logStat.total > 0) {
      totalAttempts = Number(logStat.total);
      correctCount = Number(logStat.correct || 0);
      wrongCount = Number(logStat.wrong || 0);
    } else if (baseReps > 0 || baseLapses > 0) {
      totalAttempts = Math.max(baseReps, baseLapses);
      wrongCount = baseLapses;
      correctCount = Math.max(0, totalAttempts - wrongCount);
    }

    const accuracy = totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0;

    return {
      ...word,
      examples: examplesByWord.get(word.id) ?? [],
      srs,
      srsProduction: prodSrs,
      stats: {
        totalAttempts,
        correctCount,
        wrongCount,
        accuracy,
      },
    };
  });
}

/**
 * Fetch all words with their examples and SRS metadata
 */
export async function getAllWords(): Promise<WordDetail[]> {
  const db = await getDatabase();
  const words = await db.select<Word[]>(`SELECT ${WORD_COLUMNS} FROM words ORDER BY created_at DESC;`);
  return hydrateWords(db, words, `SELECT id FROM words`, []);
}

/**
 * Fetch only words whose next review is due (uses idx_srs_reviews_next_date).
 */
export async function getDueWordsFromDb(now: Date = new Date()): Promise<WordDetail[]> {
  const db = await getDatabase();
  const nowIso = now.toISOString();
  // A word is due when either of its cards is due. Words without an SRS row are treated as new
  // and due (same as getAllWords' default).
  const dueFilter = `SELECT word_id FROM srs_reviews WHERE next_review_date <= $1
    UNION SELECT word_id FROM srs_production WHERE next_review_date <= $1
    UNION SELECT id FROM words WHERE id NOT IN (SELECT word_id FROM srs_reviews)`;
  const words = await db.select<Word[]>(
    `SELECT ${WORD_COLUMNS} FROM words WHERE id IN (${dueFilter}) AND COALESCE(suspended, 0) = 0 ORDER BY created_at DESC;`,
    [nowIso]
  );
  return hydrateWords(db, words, dueFilter, [nowIso]);
}

/**
 * Save the sentence the learner met a word in as one of its examples (source "user_context").
 * Context exercises show it first: the learner's own context is the strongest memory hook.
 * Duplicates are ignored. Returns whether it was saved.
 */
export async function addUserContextExample(wordId: string, sentence: string, sentenceVn?: string | null): Promise<boolean> {
  const clean = sentence.replace(/\s+/g, " ").trim();
  if (clean.length < 8 || clean.length > 400) return false;
  const db = await getDatabase();
  const existing = await db.select<Array<{ id: string }>>(
    `SELECT id FROM examples WHERE word_id = $1 AND LOWER(TRIM(sentence_en)) = LOWER($2) LIMIT 1;`,
    [wordId, clean]
  );
  if (existing.length > 0) return false;
  await db.execute(
    `INSERT INTO examples (id, word_id, sentence_en, sentence_vn, grammar_analysis, source) VALUES ($1, $2, $3, $4, '', 'user_context')`,
    [crypto.randomUUID(), wordId, clean, sentenceVn ?? null]
  );
  return true;
}

/** Words by id with examples and both schedules (e.g. to grade a card from another window). */
export async function getWordsByIds(ids: string[]): Promise<WordDetail[]> {
  if (ids.length === 0) return [];
  const db = await getDatabase();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  const filter = `SELECT id FROM words WHERE id IN (${placeholders})`;
  const words = await db.select<Word[]>(`SELECT ${WORD_COLUMNS} FROM words WHERE id IN (${placeholders});`, ids);
  return hydrateWords(db, words, filter, ids);
}

export interface DueCounts {
  /** Cards already studied whose review is due (either direction) */
  reviews: number;
  /** Never-reviewed words waiting (not limited by the daily budget) */
  newWaiting: number;
  /** Recall cards unlocked but never answered (not limited by the daily budget) */
  newRecallWaiting: number;
}

/**
 * Due work split into reviews and new cards. Use this (with the daily new-card budget) for anything shown
 * to the learner: counting every new word as "due" made the number never reach 0.
 */
export async function countDueCards(now: Date = new Date()): Promise<DueCounts> {
  const db = await getDatabase();
  const nowIso = now.toISOString();
  const rows = await db.select<Array<{ reviews: number; new_waiting: number; new_recall_waiting: number }>>(
    `SELECT
       (SELECT COUNT(*) FROM (
          SELECT s.word_id FROM srs_reviews s JOIN words w ON w.id = s.word_id
          WHERE s.next_review_date <= $1 AND COALESCE(s.reps, 0) > 0 AND COALESCE(w.suspended, 0) = 0
          UNION ALL
          SELECT p.word_id FROM srs_production p JOIN words w ON w.id = p.word_id
          WHERE p.next_review_date <= $1 AND COALESCE(p.reps, 0) > 0 AND COALESCE(w.suspended, 0) = 0
       )) AS reviews,
       (SELECT COUNT(*) FROM words w LEFT JOIN srs_reviews s ON s.word_id = w.id
          WHERE COALESCE(s.reps, 0) = 0 AND COALESCE(w.suspended, 0) = 0
            AND (s.next_review_date IS NULL OR s.next_review_date <= $1)) AS new_waiting,
       (SELECT COUNT(*) FROM srs_production p JOIN words w ON w.id = p.word_id
          WHERE COALESCE(p.reps, 0) = 0 AND COALESCE(w.suspended, 0) = 0 AND p.next_review_date <= $1) AS new_recall_waiting`,
    [nowIso]
  );
  return {
    reviews: Number(rows[0]?.reviews ?? 0),
    newWaiting: Number(rows[0]?.new_waiting ?? 0),
    newRecallWaiting: Number(rows[0]?.new_recall_waiting ?? 0),
  };
}

/**
 * Count words with at least one due card, without loading them (includes new words).
 * Prefer countDueCards + the new-card budget for numbers shown to the learner.
 */
export async function countDueWords(now: Date = new Date()): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt FROM (
       SELECT word_id FROM srs_reviews WHERE next_review_date <= $1
       UNION SELECT word_id FROM srs_production WHERE next_review_date <= $1
       UNION SELECT id FROM words WHERE id NOT IN (SELECT word_id FROM srs_reviews)
     ) d JOIN words w ON w.id = d.word_id WHERE COALESCE(w.suspended, 0) = 0;`,
    [now.toISOString()]
  );
  return rows[0]?.cnt ?? 0;
}

/**
 * Delete a word and its associated examples and SRS records
 */
export async function deleteWord(wordId: string): Promise<void> {
  const db = await getDatabase();
  // Delete the parent row first so a partial failure never leaves a word without its SRS row
  await db.execute(`DELETE FROM words WHERE id = $1;`, [wordId]);
  await db.execute(`DELETE FROM srs_reviews WHERE word_id = $1;`, [wordId]);
  await db.execute(`DELETE FROM srs_production WHERE word_id = $1;`, [wordId]);
  await db.execute(`DELETE FROM examples WHERE word_id = $1;`, [wordId]);
  await db.execute(`DELETE FROM review_logs WHERE word_id = $1;`, [wordId]);
}

/**
 * Update the topic category for a specific word
 */
export async function updateWordTopic(wordId: string, topic: string): Promise<void> {
  const db = await getDatabase();
  const cleanTopic = topic.trim() || "General Tech";
  await db.execute(`UPDATE words SET topic = $1 WHERE id = $2;`, [cleanTopic, wordId]);
}
