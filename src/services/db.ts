import Database from "@tauri-apps/plugin-sql";
import type { Word, WordExample, SRSReview, CreateWordInput, WordDetail } from "@/types/database";

const DB_PATH = "sqlite:myenglish.db";
let dbInstance: Database | null = null;
let initPromise: Promise<Database> | null = null;

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
    const db = await Database.load(DB_PATH);
    await initSchema(db);
    dbInstance = db;
    return db;
  })();
  return initPromise;
}

/**
 * Creates required tables and indexes if they don't exist.
 */
export async function initSchema(db: Database): Promise<void> {
  // 1. Words table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS words (
      id TEXT PRIMARY KEY,
      word TEXT NOT NULL,
      phonetic TEXT,
      meaning_vn TEXT NOT NULL,
      image_url TEXT,
      synonyms TEXT,
      antonyms TEXT,
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
      FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
    );
  `);

  // 3. Spaced Repetition (SRS) table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS srs_reviews (
      word_id TEXT PRIMARY KEY,
      ease_factor REAL DEFAULT 2.5,
      interval INTEGER DEFAULT 0,
      repetitions INTEGER DEFAULT 0,
      next_review_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
    );
  `);

  // Safe migrations for existing databases
  try {
    await db.execute(`ALTER TABLE words ADD COLUMN phonetic TEXT;`);
  } catch {}
  try {
    await db.execute(`ALTER TABLE words ADD COLUMN part_of_speech TEXT;`);
  } catch {}
  try {
    await db.execute(`ALTER TABLE words ADD COLUMN collocations TEXT;`);
  } catch {}
  try {
    await db.execute(`ALTER TABLE words ADD COLUMN code_snippet TEXT;`);
  } catch {}
  try {
    await db.execute(`ALTER TABLE words ADD COLUMN topic TEXT DEFAULT 'General Tech';`);
  } catch {}
  try {
    await db.execute(`ALTER TABLE examples ADD COLUMN sentence_vn TEXT;`);
  } catch {}

  // Safe deduplication of any existing duplicates
  try {
    await db.execute(`
      DELETE FROM words WHERE id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(word)) ORDER BY created_at DESC) as rn
          FROM words
        ) WHERE rn = 1
      );
    `);
    await db.execute(`DELETE FROM examples WHERE word_id NOT IN (SELECT id FROM words);`);
    await db.execute(`DELETE FROM srs_reviews WHERE word_id NOT IN (SELECT id FROM words);`);
  } catch (e) {
    console.warn("Deduplication notice:", e);
  }

  // Unique index to prevent duplicate words from ever being saved
  try {
    await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_words_word_unique ON words(LOWER(TRIM(word)));`);
  } catch {}

  // Performance Indexes
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_words_word ON words(word);`);
  try {
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_words_topic ON words(topic);`);
  } catch {}
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_examples_word_id ON examples(word_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_srs_reviews_next_date ON srs_reviews(next_review_date);`);
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
  const db = await getDatabase();
  const cleanWord = input.word.trim().toLowerCase();
  const now = new Date().toISOString();
  const topic = input.topic?.trim() || "General Tech";

  // 1. Check if word already exists in SQLite
  const existingList = await db.select<Word[]>(
    `SELECT * FROM words WHERE LOWER(TRIM(word)) = $1 LIMIT 1;`,
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

    // Replace examples for the existing word
    await db.execute(`DELETE FROM examples WHERE word_id = $1;`, [wordId]);
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

    // Insert initial SRS review record for new word
    await db.execute(
      `INSERT INTO srs_reviews (word_id, ease_factor, interval, repetitions, next_review_date)
       VALUES ($1, 2.5, 0, 0, $2)
       ON CONFLICT(word_id) DO NOTHING`,
      [wordId, now]
    );
  }

  // Insert examples
  for (const example of input.examples) {
    const exampleId = crypto.randomUUID();
    try {
      await db.execute(
        `INSERT INTO examples (id, word_id, sentence_en, sentence_vn, grammar_analysis)
         VALUES ($1, $2, $3, $4, $5)`,
        [exampleId, wordId, example.sentence_en, example.sentence_vn || null, example.grammar_analysis]
      );
    } catch {
      await db.execute(
        `INSERT INTO examples (id, word_id, sentence_en, grammar_analysis)
         VALUES ($1, $2, $3, $4)`,
        [exampleId, wordId, example.sentence_en, example.grammar_analysis]
      );
    }
  }

  return wordId;
}

/**
 * Fetch all words with their examples and SRS metadata
 */
export async function getAllWords(): Promise<WordDetail[]> {
  const db = await getDatabase();
  const words = await db.select<Word[]>(`SELECT * FROM words ORDER BY created_at DESC;`);

  const results: WordDetail[] = [];
  for (const word of words) {
    const examples = await db.select<WordExample[]>(
      `SELECT * FROM examples WHERE word_id = $1;`,
      [word.id]
    );
    const srsList = await db.select<SRSReview[]>(
      `SELECT * FROM srs_reviews WHERE word_id = $1 LIMIT 1;`,
      [word.id]
    );
    const srs = srsList[0] || {
      word_id: word.id,
      ease_factor: 2.5,
      interval: 0,
      repetitions: 0,
      next_review_date: word.created_at,
    };

    results.push({
      ...word,
      examples,
      srs,
    });
  }

  return results;
}

/**
 * Delete a word and its associated examples and SRS records
 */
export async function deleteWord(wordId: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM srs_reviews WHERE word_id = $1;`, [wordId]);
  await db.execute(`DELETE FROM examples WHERE word_id = $1;`, [wordId]);
  await db.execute(`DELETE FROM words WHERE id = $1;`, [wordId]);
}

/**
 * Update the topic category for a specific word
 */
export async function updateWordTopic(wordId: string, topic: string): Promise<void> {
  const db = await getDatabase();
  const cleanTopic = topic.trim() || "General Tech";
  await db.execute(`UPDATE words SET topic = $1 WHERE id = $2;`, [cleanTopic, wordId]);
}
