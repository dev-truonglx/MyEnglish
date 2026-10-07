/**
 * Sổ lỗi: the learner's own mistakes, taken from AI-corrected writing (free-writing exercise, daily
 * standup). Each one becomes a small card ("fix what you once wrote") with its own FSRS schedule, days
 * based like grammar. Making the same mistake again brings the card back at once.
 */
import { Rating, type Grade } from "ts-fsrs";
import { getDatabase } from "./db";
import { getGrammarScheduler, srsRowToCard } from "./srs";
import { normalizeTypedText } from "./smartReview";
import type { MistakeCategory } from "./ai";

export interface Mistake {
  id: string;
  wrong_text: string;
  right_text: string;
  why_vn: string | null;
  category: MistakeCategory | null;
  /** The corrected sentence the mistake was in */
  sentence: string | null;
  source: MistakeSource;
  word_id: string | null;
  occurrences: number;
  created_at: string;
  stability: number;
  difficulty: number;
  state: number;
  reps: number;
  lapses: number;
  last_review: string | null;
  next_review_date: string;
  scheduled_days: number;
  learning_steps: number;
}

export type MistakeSource = "free_writing" | "standup";

export interface NewMistake {
  wrong: string;
  right: string;
  whyVn?: string;
  category?: MistakeCategory | null;
  sentence?: string | null;
}

export const MISTAKE_CATEGORY_LABEL: Record<MistakeCategory, string> = {
  article: "Mạo từ (a / an / the)",
  tense: "Thì của động từ",
  word_form: "Dạng từ (danh / động / tính từ)",
  preposition: "Giới từ",
  agreement: "Hòa hợp chủ ngữ và động từ",
  word_choice: "Chọn từ",
  spelling: "Chính tả",
  word_order: "Trật tự từ",
  other: "Khác",
};

/** Grammar lesson that covers a category, when the app has one (ids from src/data/grammarData.ts) */
export const CATEGORY_LESSON: Partial<Record<MistakeCategory, { id: string; title: string }>> = {
  article: { id: "a1-nouns-articles", title: "Mạo từ" },
  tense: { id: "a1-past-simple", title: "Quá khứ đơn" },
  agreement: { id: "a1-present-simple", title: "Hiện tại đơn" },
};

/** First review of a new mistake: the next day (the correction was just read) */
const FIRST_REVIEW_DELAY_MS = 20 * 60 * 60 * 1000;

const sameText = (a: string, b: string) => normalizeTypedText(a) === normalizeTypedText(b);

/**
 * Save the corrections of one piece of writing. A mistake already in the notebook is counted again and
 * made due now (the learner repeated it); returns how many were new.
 */
export async function saveMistakes(
  items: NewMistake[],
  opts: { source: MistakeSource; wordId?: string | null },
  now: Date = new Date()
): Promise<{ added: number; repeated: number }> {
  const db = await getDatabase();
  const existing = await db.select<Array<Pick<Mistake, "id" | "wrong_text" | "right_text">>>(
    `SELECT id, wrong_text, right_text FROM mistakes`
  );
  let added = 0;
  let repeated = 0;
  for (const m of items) {
    const wrong = m.wrong.trim();
    const right = m.right.trim();
    if (!wrong || !right || sameText(wrong, right)) continue;
    const same = existing.find((e) => sameText(e.wrong_text, wrong) && sameText(e.right_text, right));
    if (same) {
      await db.execute(
        `UPDATE mistakes SET occurrences = occurrences + 1, next_review_date = $1 WHERE id = $2`,
        [now.toISOString(), same.id]
      );
      repeated++;
      continue;
    }
    const id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO mistakes (id, wrong_text, right_text, why_vn, category, sentence, source, word_id, created_at, next_review_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        wrong,
        right,
        m.whyVn?.trim() || null,
        m.category ?? null,
        m.sentence?.trim() || null,
        opts.source,
        opts.wordId ?? null,
        now.toISOString(),
        new Date(now.getTime() + FIRST_REVIEW_DELAY_MS).toISOString(),
      ]
    );
    existing.push({ id, wrong_text: wrong, right_text: right });
    added++;
  }
  return { added, repeated };
}

export async function getDueMistakes(now: Date = new Date(), limit = 20): Promise<Mistake[]> {
  const db = await getDatabase();
  return db.select<Mistake[]>(
    `SELECT * FROM mistakes WHERE next_review_date <= $1 ORDER BY occurrences DESC, next_review_date ASC LIMIT $2`,
    [now.toISOString(), limit]
  );
}

export interface MistakeSummary {
  total: number;
  due: number;
  /** Categories by how often the learner made them (occurrences), most frequent first */
  byCategory: Array<{ category: MistakeCategory; count: number }>;
}

export async function getMistakeSummary(now: Date = new Date()): Promise<MistakeSummary> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ category: string | null; occurrences: number; next_review_date: string }>>(
    `SELECT category, occurrences, next_review_date FROM mistakes`
  );
  const counts = new Map<MistakeCategory, number>();
  let due = 0;
  for (const r of rows) {
    const c = (r.category || "other") as MistakeCategory;
    counts.set(c, (counts.get(c) ?? 0) + (r.occurrences || 1));
    if (new Date(r.next_review_date).getTime() <= now.getTime()) due++;
  }
  return {
    total: rows.length,
    due,
    byCategory: [...counts.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
  };
}

/** The learner's text with each correction applied (first occurrence, case-insensitive) */
export function applyCorrections(text: string, corrections: Array<{ wrong: string; right: string }>): string {
  let out = text;
  for (const c of corrections) {
    const i = c.wrong ? out.toLowerCase().indexOf(c.wrong.toLowerCase()) : -1;
    if (i >= 0) out = out.slice(0, i) + c.right + out.slice(i + c.wrong.length);
  }
  return out;
}

/** The learner's sentence with the mistake put back in, to be fixed (null when the sentence doesn't contain the fix) */
export function mistakePrompt(m: Pick<Mistake, "sentence" | "right_text" | "wrong_text">): { before: string; wrong: string; after: string } | null {
  if (!m.sentence) return null;
  const i = m.sentence.toLowerCase().indexOf(m.right_text.toLowerCase());
  if (i < 0) return null;
  return { before: m.sentence.slice(0, i), wrong: m.wrong_text, after: m.sentence.slice(i + m.right_text.length) };
}

/**
 * Typed fix -> grade: the same text (case, punctuation, contractions ignored) -> Good, anything else ->
 * Again. No "close enough": a different ending (fix / fixed) is often the very mistake being trained.
 * The review screen lets the learner turn a pure typo into Hard.
 */
export function gradeMistakeAnswer(input: string, right: string): Grade {
  return input.trim() && sameText(input, right) ? Rating.Good : Rating.Again;
}

export async function recordMistakeReview(m: Mistake, grade: Grade, now: Date = new Date()): Promise<Mistake> {
  const card = srsRowToCard({
    word_id: m.id,
    stability: m.stability,
    difficulty: m.difficulty,
    state: m.state,
    reps: m.reps,
    lapses: m.lapses,
    last_review: m.last_review,
    next_review_date: m.next_review_date,
    scheduled_days: m.scheduled_days,
    learning_steps: m.learning_steps,
  } as never);
  const next = getGrammarScheduler().next(card, now, grade).card;
  const updated: Mistake = {
    ...m,
    stability: next.stability,
    difficulty: next.difficulty,
    state: next.state,
    reps: next.reps,
    lapses: next.lapses,
    last_review: now.toISOString(),
    next_review_date: next.due.toISOString(),
    scheduled_days: next.scheduled_days,
    learning_steps: next.learning_steps,
  };
  const db = await getDatabase();
  await db.execute(
    `UPDATE mistakes SET stability = $1, difficulty = $2, state = $3, reps = $4, lapses = $5, last_review = $6,
       next_review_date = $7, scheduled_days = $8, learning_steps = $9 WHERE id = $10`,
    [
      updated.stability,
      updated.difficulty,
      updated.state,
      updated.reps,
      updated.lapses,
      updated.last_review,
      updated.next_review_date,
      updated.scheduled_days,
      updated.learning_steps,
      m.id,
    ]
  );
  return updated;
}

export async function deleteMistake(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM mistakes WHERE id = $1`, [id]);
}

export async function listMistakes(limit = 30): Promise<Mistake[]> {
  const db = await getDatabase();
  return db.select<Mistake[]>(`SELECT * FROM mistakes ORDER BY created_at DESC LIMIT $1`, [limit]);
}

// ─── Daily standup writing: a few sentences about today's work, corrected by AI ───

const STANDUP_KEY = "myenglish_standup_v1";
/** AI corrections per day (each takes 10–40 s of AI time) */
export const STANDUP_PER_DAY = 3;

function todayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

export function standupUsedToday(now: Date = new Date()): number {
  try {
    const raw = JSON.parse(localStorage.getItem(STANDUP_KEY) || "{}") as { day?: string; count?: number };
    return raw.day === todayKey(now) ? raw.count ?? 0 : 0;
  } catch {
    return 0;
  }
}

export function recordStandupUse(now: Date = new Date()): void {
  try {
    localStorage.setItem(STANDUP_KEY, JSON.stringify({ day: todayKey(now), count: standupUsedToday(now) + 1 }));
  } catch {}
}
