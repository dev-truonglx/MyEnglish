import Database from "@tauri-apps/plugin-sql";
import type { Word, WordExample, SRSReview, CreateWordInput, WordDetail } from "@/types/database";
import { initReviewLogsTable, registerWordForms } from "./smartReview";
import { logTerminal } from "./logger";
import { INTRO_READY_MS, nextLocalDayStart } from "./cards";

const DB_PATH = "sqlite:myenglish.db";
const SCHEMA_VERSION = 12;
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
  "catalog_id",
  "variants",
  "forms",
].join(", ");

/** Columns selected for WordExample records */
export const EXAMPLE_COLUMNS = [
  "id",
  "word_id",
  "sentence_en",
  "sentence_vn",
  "grammar_analysis",
  "source",
  "focus",
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

  // 6. Grammar Book tables (Chapters, Lessons, Exercise Sets, Items)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS grammar_book_chapters (
      id TEXT PRIMARY KEY,
      chapter_id TEXT,
      ord INTEGER,
      data TEXT
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS grammar_book_lessons (
      id TEXT PRIMARY KEY,
      chapter_id TEXT,
      ord INTEGER,
      data TEXT
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS grammar_book_sets (
      id TEXT PRIMARY KEY,
      chapter_id TEXT,
      ord INTEGER,
      data TEXT
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS grammar_book_items (
      id TEXT PRIMARY KEY,
      chapter_id TEXT,
      ord INTEGER,
      data TEXT
    );
  `);
  try {
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_grammar_book_lessons_ch ON grammar_book_lessons(chapter_id, ord);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_grammar_book_sets_ch ON grammar_book_sets(chapter_id, ord);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_grammar_book_items_ch ON grammar_book_items(chapter_id, ord);`);
  } catch {}

  // 7. Key-value backup for settings/XP/streak that live in localStorage
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

/** Repair words left without an SRS row (e.g. a write failed halfway) or stuck in Learning from old letter_tiles Hard grading */
async function repairMissingSrsRows(db: Database): Promise<void> {
  try {
    await db.execute(`
      INSERT INTO srs_reviews (word_id, next_review_date)
      SELECT id, created_at FROM words WHERE id NOT IN (SELECT word_id FROM srs_reviews);
    `);
    await db.execute(`
      UPDATE srs_reviews
      SET last_review = (
            SELECT timestamp FROM review_logs
            WHERE word_id = srs_reviews.word_id AND exercise_type = 'intro'
            ORDER BY timestamp DESC LIMIT 1
          )
      WHERE last_review IS NULL
        AND word_id IN (
          SELECT DISTINCT word_id FROM review_logs WHERE exercise_type = 'intro'
        );
    `);
    // One-time fix for cards stuck by the old letter_tiles grading. Must not run on every window open:
    // it would also promote genuine Learning/Relearning cards (e.g. a fresh lapse) to Review +3 days.
    const done = await db.select<{ value: string }[]>(
      `SELECT value FROM app_kv WHERE key = 'repair_stuck_learning_v1';`
    );
    if (done.length > 0) return;
    for (const table of ["srs_reviews", "srs_production"]) {
      await db.execute(`
        UPDATE ${table}
        SET state = 2,
            stability = MAX(COALESCE(stability, 0), 3.0),
            difficulty = CASE WHEN difficulty > 8.0 THEN 5.0 ELSE difficulty END,
            scheduled_days = MAX(COALESCE(scheduled_days, 0), 3),
            interval = MAX(COALESCE(interval, 0), 3),
            learning_steps = 0,
            next_review_date = CASE
              WHEN state IN (1, 3) THEN strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(last_review, CURRENT_TIMESTAMP), '+3 days')
              ELSE next_review_date
            END
        WHERE reps >= 4
          AND COALESCE(stability, 0) < 2.0
          AND (state IN (1, 3) OR (state = 2 AND lapses = 0 AND difficulty > 8.0));
      `);
    }
    await db.execute(
      `INSERT OR REPLACE INTO app_kv (key, value) VALUES ('repair_stuck_learning_v1', '1');`
    );
  } catch (e) {
    console.warn("SRS row repair notice:", e);
  }
}

/** The tables that hold the imported grammar book (one JSON row per chapter / lesson / set / item) */
export async function createGrammarBookTables(exec: (sql: string) => Promise<unknown>): Promise<void> {
  for (const table of ["grammar_book_chapters", "grammar_book_lessons", "grammar_book_sets", "grammar_book_items"]) {
    await exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, chapter_id TEXT, ord INTEGER, data TEXT);`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_${table}_ch ON ${table}(chapter_id, ord);`);
  }
  await exec(`
    CREATE TABLE IF NOT EXISTS grammar_exercise_imports (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      chapter_id TEXT NOT NULL,
      lesson_id TEXT,
      title TEXT NOT NULL,
      item_count INTEGER NOT NULL,
      item_ids TEXT NOT NULL,
      set_ids TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      status TEXT DEFAULT 'active'
    );
  `);
  await exec(`CREATE INDEX IF NOT EXISTS idx_grammar_imports_ch ON grammar_exercise_imports(chapter_id, timestamp);`);
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

  // Record each finished block, so a failure in a later block can't re-run earlier ones that are
  // not safe to repeat (the v1 dedupe would delete deck words such as "May" next to "may")
  const checkpoint = async (reached: number) => {
    if (failures === 0 && version < reached) await db.execute(`PRAGMA user_version = ${reached};`);
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

    // Deduplicate words, keeping the copy with the most review progress. Deck words are keyed by
    // catalog_id ("May" and "may" are both in the deck) when this block runs on a newer file.
    const wordCols = await db.select<{ name: string }[]>(`PRAGMA table_info(words);`);
    const hasCatalogId = wordCols.some((c) => c.name === "catalog_id");
    try {
      const dedupeKey = hasCatalogId
        ? "COALESCE(w.catalog_id, LOWER(TRIM(w.word)))"
        : "LOWER(TRIM(w.word))";
      await db.execute(`
        DELETE FROM words WHERE id NOT IN (
          SELECT id FROM (
            SELECT w.id, ROW_NUMBER() OVER (
              PARTITION BY ${dedupeKey}
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

    // Superseded in v10 by per-catalog uniqueness; creating it on a file that already has deck words
    // would fail (case variants) and keep the schema version stuck
    if (!hasCatalogId) {
      await tryExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_words_word_unique ON words(LOWER(TRIM(word)));`);
    }
    await tryExec(`CREATE INDEX IF NOT EXISTS idx_words_word ON words(word);`);
    await tryExec(`CREATE INDEX IF NOT EXISTS idx_words_topic ON words(topic);`);
    await tryExec(`CREATE INDEX IF NOT EXISTS idx_examples_word_id ON examples(word_id);`);
    await tryExec(`CREATE INDEX IF NOT EXISTS idx_srs_reviews_next_date ON srs_reviews(next_review_date);`);
  }

  await checkpoint(1);
  if (version < 2) {
    // ts-fsrs v5 needs the current learning step persisted, otherwise Learning cards never graduate
    await tryExec(`ALTER TABLE srs_reviews ADD COLUMN learning_steps INTEGER DEFAULT 0;`);

    // Normalize SQLite CURRENT_TIMESTAMP values ("YYYY-MM-DD HH:MM:SS", UTC) to ISO so that
    // string comparisons in SQL and `new Date()` parsing in JS agree.
    await tryExec(`UPDATE srs_reviews SET next_review_date = REPLACE(next_review_date, ' ', 'T') || 'Z' WHERE next_review_date NOT LIKE '%T%';`);
    await tryExec(`UPDATE words SET created_at = REPLACE(created_at, ' ', 'T') || 'Z' WHERE created_at NOT LIKE '%T%';`);
  }

  await checkpoint(2);
  if (version < 3) {
    // 1 = scheduled FSRS review, 0 = practice outside the schedule, NULL = logged before this column existed.
    // Only rows with is_scheduled = 1 are valid training data for the FSRS optimizer.
    await initReviewLogsTable(db);
    await tryExec(`ALTER TABLE review_logs ADD COLUMN is_scheduled INTEGER;`);
  }

  await checkpoint(3);
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

  await checkpoint(4);
  if (version < 5) {
    // CEFR level of the term (from AI enrichment), used to keep content and assessment level-accurate
    await tryExec(`ALTER TABLE words ADD COLUMN cefr_level TEXT;`);
  }

  await checkpoint(5);
  if (version < 6) {
    // The v1 dedupe deleted words without their review logs; drop those orphans
    await initReviewLogsTable(db);
    await tryExec(`DELETE FROM review_logs WHERE word_id NOT IN (SELECT id FROM words);`);
  }

  await checkpoint(6);
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
  await checkpoint(7);
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
  await checkpoint(8);
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

  await checkpoint(9);
  if (version < 10) {
    // Vocabulary comes from the bundled Oxford 5000 deck (vocab_catalog). `words` holds the words met or
    // waiting to be introduced, each linked to its catalog entry.
    await tryExec(`
      CREATE TABLE IF NOT EXISTS vocab_catalog (
        id TEXT PRIMARY KEY,
        word TEXT NOT NULL,
        cefr TEXT NOT NULL,
        list INTEGER,
        study_order INTEGER NOT NULL,
        freq INTEGER,
        it INTEGER DEFAULT 0,
        pos TEXT,
        vn TEXT NOT NULL,
        data TEXT NOT NULL
      );
    `);
    await tryExec(`CREATE INDEX IF NOT EXISTS idx_vocab_catalog_pick ON vocab_catalog(cefr, it, study_order);`);
    await tryExec(`CREATE INDEX IF NOT EXISTS idx_vocab_catalog_word ON vocab_catalog(word COLLATE NOCASE);`);
    await tryExec(`CREATE TABLE IF NOT EXISTS vocab_catalog_meta (key TEXT PRIMARY KEY, value TEXT);`);
    await tryExec(`ALTER TABLE words ADD COLUMN catalog_id TEXT;`);
    // Spelling variants (colour -> color) and the deck's other forms (went, children, the forms its examples use)
    await tryExec(`ALTER TABLE words ADD COLUMN variants TEXT;`);
    await tryExec(`ALTER TABLE words ADD COLUMN forms TEXT;`);
    // The exact form of the word an example uses ("is" for "be"), to blank it in cloze exercises
    await tryExec(`ALTER TABLE examples ADD COLUMN focus TEXT;`);
    // "may"/"May", "march"/"March", "it"/"IT" are different words of the deck: one row per catalog entry
    await tryExec(`DROP INDEX IF EXISTS idx_words_word_unique;`);
    await tryExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_words_catalog ON words(catalog_id) WHERE catalog_id IS NOT NULL;`);
    await tryExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_words_free_unique ON words(LOWER(TRIM(word))) WHERE catalog_id IS NULL;`);
  }

  await checkpoint(10);
  if (version < 11) {
    // Schema v11: Grammar book chapters, lessons, exercise sets, items
    await tryExec(`
      CREATE TABLE IF NOT EXISTS grammar_book_chapters (
        id TEXT PRIMARY KEY,
        chapter_id TEXT,
        ord INTEGER,
        data TEXT
      );
    `);
    await tryExec(`
      CREATE TABLE IF NOT EXISTS grammar_book_lessons (
        id TEXT PRIMARY KEY,
        chapter_id TEXT,
        ord INTEGER,
        data TEXT
      );
    `);
    await tryExec(`
      CREATE TABLE IF NOT EXISTS grammar_book_sets (
        id TEXT PRIMARY KEY,
        chapter_id TEXT,
        ord INTEGER,
        data TEXT
      );
    `);
    await tryExec(`
      CREATE TABLE IF NOT EXISTS grammar_book_items (
        id TEXT PRIMARY KEY,
        chapter_id TEXT,
        ord INTEGER,
        data TEXT
      );
    `);
    await tryExec(`CREATE INDEX IF NOT EXISTS idx_grammar_book_lessons_ch ON grammar_book_lessons(chapter_id, ord);`);
    await tryExec(`CREATE INDEX IF NOT EXISTS idx_grammar_book_sets_ch ON grammar_book_sets(chapter_id, ord);`);
    await tryExec(`CREATE INDEX IF NOT EXISTS idx_grammar_book_items_ch ON grammar_book_items(chapter_id, ord);`);
  }

  await checkpoint(11);
  if (version < 12) {
    // Schema v12: some databases reached v11 from an early build that had not created the grammar book
    // tables yet; create them (no-op where they exist)
    await createGrammarBookTables(tryExec);
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
      // "known" rows (a word marked as already known) are no attempt, but show the word has a history.
      // Only answers that moved the schedule (or legacy rows) count: extra practice (is_scheduled = 0) and
      // recognition credited from a recall answer (2) are no attempt of their own (S18).
      `SELECT word_id, SUM(CASE WHEN exercise_type != 'known' THEN 1 ELSE 0 END) as total,
              SUM(CASE WHEN exercise_type != 'known' AND rating > 1 THEN 1 ELSE 0 END) as correct,
              SUM(CASE WHEN exercise_type != 'known' AND rating = 1 THEN 1 ELSE 0 END) as wrong
       FROM review_logs WHERE word_id IN (${wordFilterSql}) AND exercise_type != 'intro'
         AND (is_scheduled IS NULL OR is_scheduled = 1 OR exercise_type = 'known') GROUP BY word_id;`,
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

  for (const word of words) {
    if (word.forms || word.variants) registerWordForms(word.word, parseJsonList(word.forms), parseJsonList(word.variants));
  }

  return words.map((word) => {
    const srs = srsByWord.get(word.id) ?? defaultSrsFor(word);
    const prodSrs = productionByWord.get(word.id) ?? null;
    const logStat = logStatsByWord.get(word.id);

    const baseReps = (srs.reps ?? srs.repetitions ?? 0) + (prodSrs?.reps ?? prodSrs?.repetitions ?? 0);
    const baseLapses = (srs.lapses ?? 0) + (prodSrs?.lapses ?? 0);

    let totalAttempts = 0;
    let correctCount = 0;
    let wrongCount = 0;

    if (logStat) {
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

function parseJsonList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** A word of the bundled deck as stored in `words` (the catalog side is in vocabCatalog.ts) */
export interface CatalogWordInput {
  catalogId: string;
  word: string;
  phonetic: string | null;
  partOfSpeech: string;
  meaningVn: string;
  cefr: string;
  variants: string[];
  forms: string[];
  examples: Array<{ en: string; vi: string; focus: string[] }>;
  /** Also the recognition card's due date: new cards are introduced oldest first */
  createdAt: string;
}

const CATALOG_INSERT_BATCH = 50;

/**
 * Add words of the deck with a few multi-row statements per batch (words, their recognition card, their
 * examples) instead of several round trips per word. A catalog entry already in `words` is left as is.
 * Returns catalog id -> word id for every item (new or already there), and the catalog ids this call
 * really created: the main window, the popup and the tray refresh can top up at the same time, so after the
 * `words` insert the rows are read back and only the ones carrying the generated id (not another window's)
 * get a card and examples.
 */
export async function insertCatalogWordsReport(
  items: CatalogWordInput[]
): Promise<{ ids: Map<string, string>; created: string[] }> {
  const result = new Map<string, string>();
  const created: string[] = [];
  if (items.length === 0) return { ids: result, created };
  const db = await getDatabase();
  const placeholders = (n: number) => Array.from({ length: n }, (_, i) => `$${i + 1}`).join(", ");
  for (let start = 0; start < items.length; start += CATALOG_INSERT_BATCH) {
    const batch = items.slice(start, start + CATALOG_INSERT_BATCH);
    const ids = batch.map((i) => i.catalogId);
    const existing = await db.select<Array<{ id: string; catalog_id: string }>>(
      `SELECT id, catalog_id FROM words WHERE catalog_id IN (${placeholders(ids.length)})`,
      ids
    );
    existing.forEach((r) => result.set(r.catalog_id, r.id));
    const fresh = batch.filter((i) => !result.has(i.catalogId));
    if (fresh.length === 0) continue;

    const wordRows: unknown[] = [];
    const generated = new Map<string, string>();
    for (const item of fresh) {
      const id = crypto.randomUUID();
      generated.set(item.catalogId, id);
      wordRows.push(
        id, item.word, item.phonetic, item.partOfSpeech, item.meaningVn, "[]", "[]", "[]", item.cefr, item.cefr,
        item.createdAt, item.catalogId, JSON.stringify(item.variants), JSON.stringify(item.forms)
      );
    }
    const values = (rows: unknown[], width: number) =>
      Array.from({ length: rows.length / width }, (_, r) =>
        `(${Array.from({ length: width }, (_, c) => `$${r * width + c + 1}`).join(", ")})`
      ).join(", ");
    await db.execute(
      `INSERT OR IGNORE INTO words (id, word, phonetic, part_of_speech, meaning_vn, synonyms, antonyms, collocations,
         topic, cefr_level, created_at, catalog_id, variants, forms)
       VALUES ${values(wordRows, 14)}`,
      wordRows
    );
    // Another window may have inserted the same words first: keep only the rows this call created
    const freshIds = fresh.map((i) => i.catalogId);
    const stored = await db.select<Array<{ id: string; catalog_id: string }>>(
      `SELECT id, catalog_id FROM words WHERE catalog_id IN (${placeholders(freshIds.length)})`,
      freshIds
    );
    const storedBy = new Map(stored.map((r) => [r.catalog_id, r.id]));

    const srsRows: unknown[] = [];
    const exampleRows: unknown[] = [];
    for (const item of fresh) {
      const real = storedBy.get(item.catalogId);
      if (!real) continue;
      result.set(item.catalogId, real);
      if (real !== generated.get(item.catalogId)) continue;
      created.push(item.catalogId);
      srsRows.push(real, item.createdAt);
      for (const ex of item.examples) {
        exampleRows.push(crypto.randomUUID(), real, ex.en, ex.vi, "", "catalog", JSON.stringify(ex.focus));
      }
    }
    if (srsRows.length > 0) {
      await db.execute(`INSERT OR IGNORE INTO srs_reviews (word_id, next_review_date) VALUES ${values(srsRows, 2)}`, srsRows);
    }
    for (let e = 0; e < exampleRows.length; e += 7 * 100) {
      const chunk = exampleRows.slice(e, e + 7 * 100);
      await db.execute(
        `INSERT INTO examples (id, word_id, sentence_en, sentence_vn, grammar_analysis, source, focus) VALUES ${values(chunk, 7)}`,
        chunk
      );
    }
  }
  return { ids: result, created };
}

export async function insertCatalogWords(items: CatalogWordInput[]): Promise<Map<string, string>> {
  return (await insertCatalogWordsReport(items)).ids;
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
 * SQL form of cards.isDueSrs on a schedule table (alias): a Review card on a schedule of a day or more is due
 * for its whole due day (local time), any other card to the minute. `$1` = now, `$2` = start of the next
 * local day (ISO strings, as next_review_date is stored).
 */
function dueCardSql(alias: string): string {
  return `(${alias}.next_review_date <= $1
    OR (COALESCE(${alias}.state, 0) = 2 AND COALESCE(${alias}.scheduled_days, ${alias}.interval, 0) >= 1
        AND ${alias}.next_review_date < $2))`;
}

/** Parameters of dueCardSql */
function dueParams(now: Date): [string, string] {
  return [now.toISOString(), new Date(nextLocalDayStart(now)).toISOString()];
}

/**
 * Fetch only words with a card due now, by the same rule as cards.isDueSrs (uses idx_srs_reviews_next_date).
 */
export async function getDueWordsFromDb(now: Date = new Date()): Promise<WordDetail[]> {
  const db = await getDatabase();
  // A new card whose introduction is at least INTRO_READY_MS old is due even if its quiz was postponed
  const params = [...dueParams(now), new Date(now.getTime() - INTRO_READY_MS).toISOString()];
  const introduced = (alias: string) =>
    `(COALESCE(${alias}.state, 0) = 0 AND COALESCE(${alias}.reps, 0) = 0 AND ${alias}.last_review IS NOT NULL
      AND ${alias}.last_review <= $3)`;
  // A word is due when either of its cards is due. Words without an SRS row are treated as new
  // and due (same as getAllWords' default).
  const dueFilter = `SELECT s.word_id FROM srs_reviews s WHERE ${dueCardSql("s")} OR ${introduced("s")}
    UNION SELECT p.word_id FROM srs_production p WHERE ${dueCardSql("p")} OR ${introduced("p")}
    UNION SELECT id FROM words WHERE id NOT IN (SELECT word_id FROM srs_reviews)`;
  const words = await db.select<Word[]>(
    `SELECT ${WORD_COLUMNS} FROM words WHERE id IN (${dueFilter}) AND COALESCE(suspended, 0) = 0 ORDER BY created_at DESC;`,
    params
  );
  return hydrateWords(db, words, dueFilter, params);
}

/**
 * Save the sentence the learner met a word in as one of its examples (source "user_context").
 * Context exercises show it first: the learner's own context is the strongest memory hook.
 * Duplicates are ignored. Returns whether it was saved.
 */
export async function addUserContextExample(
  wordId: string,
  sentence: string,
  sentenceVn?: string | null,
  source: "user_context" | "ai_memory_aid" = "user_context"
): Promise<boolean> {
  const clean = sentence.replace(/\s+/g, " ").trim();
  if (clean.length < 8 || clean.length > 400) return false;
  const db = await getDatabase();
  const existing = await db.select<Array<{ id: string }>>(
    `SELECT id FROM examples WHERE word_id = $1 AND LOWER(TRIM(sentence_en)) = LOWER($2) LIMIT 1;`,
    [wordId, clean]
  );
  if (existing.length > 0) return false;
  await db.execute(
    `INSERT INTO examples (id, word_id, sentence_en, sentence_vn, grammar_analysis, source) VALUES ($1, $2, $3, $4, '', $5)`,
    [crypto.randomUUID(), wordId, clean, sentenceVn ?? null, source]
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
  // Same due rule as cards.isDueSrs: a review card is due for its whole due day (dueCardSql)
  const rows = await db.select<Array<{ reviews: number; new_waiting: number; new_recall_waiting: number }>>(
    `SELECT
       (SELECT COUNT(*) FROM (
          SELECT s.word_id FROM srs_reviews s JOIN words w ON w.id = s.word_id
          WHERE ${dueCardSql("s")} AND COALESCE(s.reps, 0) > 0 AND COALESCE(w.suspended, 0) = 0
          UNION ALL
          SELECT p.word_id FROM srs_production p JOIN words w ON w.id = p.word_id
          WHERE ${dueCardSql("p")} AND COALESCE(p.reps, 0) > 0 AND COALESCE(w.suspended, 0) = 0
       )) AS reviews,
       (SELECT COUNT(*) FROM words w LEFT JOIN srs_reviews s ON s.word_id = w.id
          WHERE COALESCE(s.reps, 0) = 0 AND COALESCE(w.suspended, 0) = 0
            AND (s.next_review_date IS NULL OR ${dueCardSql("s")})) AS new_waiting,
       (SELECT COUNT(*) FROM srs_production p JOIN words w ON w.id = p.word_id
          WHERE COALESCE(p.reps, 0) = 0 AND COALESCE(w.suspended, 0) = 0 AND ${dueCardSql("p")}) AS new_recall_waiting`,
    dueParams(now)
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
