/**
 * Import of the ready-made decks (src/data/starterDecks.ts): no AI needed, so a new learner has real
 * words to study in the first minute.
 */
import type { CreateWordInput } from "@/types/database";
import type { StarterDeck, StarterWord } from "@/data/starterDecks";
import { getDatabase, insertWordIfAbsent } from "./db";
import { cefrRank, normalizeCefr } from "./cefr";
import { persistKeyNow } from "./storageBackup";

const IMPORTED_KEY = "myenglish_starter_decks_v1";

export async function loadStarterDecks(): Promise<StarterDeck[]> {
  return (await import("@/data/starterDecks")).STARTER_DECKS;
}

export function starterWordToInput(w: StarterWord, deck: Pick<StarterDeck, "topic">): CreateWordInput {
  return {
    word: w.word,
    phonetic: w.ipa,
    part_of_speech: w.pos,
    meaning_vn: w.vn,
    synonyms: [],
    antonyms: [],
    collocations: w.coll ?? [],
    topic: deck.topic,
    cefr_level: w.cefr,
    examples: [{ sentence_en: w.en, sentence_vn: w.enVn, grammar_analysis: "", source: "starter" }],
  };
}

/**
 * Learning order across the chosen decks: words at the learner's level and one above first (the "i+1"
 * zone), then the closest levels; decks are interleaved so every goal gets words from day one.
 */
export function orderStarterWords(
  decks: StarterDeck[],
  learnerLevel: string | null
): Array<{ word: StarterWord; deck: StarterDeck }> {
  const level = normalizeCefr(learnerLevel);
  const target = level ? cefrRank(level) + 0.5 : 2.5; // unknown level: around B1/B2
  const all = decks.flatMap((deck) => deck.words.map((word, index) => ({ word, deck, index })));
  const distance = (w: StarterWord) => Math.abs(cefrRank(w.cefr) - target);
  return all
    .sort(
      (a, b) =>
        distance(a.word) - distance(b.word) ||
        cefrRank(a.word.cefr) - cefrRank(b.word.cefr) ||
        a.index - b.index
    )
    .map(({ word, deck }) => ({ word, deck }));
}

export function getImportedDeckIds(): string[] {
  try {
    const raw = localStorage.getItem(IMPORTED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function markImported(ids: string[]): void {
  try {
    const all = Array.from(new Set([...getImportedDeckIds(), ...ids]));
    localStorage.setItem(IMPORTED_KEY, JSON.stringify(all));
    persistKeyNow(IMPORTED_KEY);
  } catch {}
}

/**
 * Add the decks' words (existing words are left untouched). New words are introduced oldest first,
 * so creation times are spaced to follow `orderStarterWords` exactly.
 */
export async function importStarterDecks(
  decks: StarterDeck[],
  learnerLevel: string | null
): Promise<{ inserted: number; skipped: number }> {
  const ordered = orderStarterWords(decks, learnerLevel);
  const db = await getDatabase();
  const start = Date.now() - ordered.length * 1000;
  let inserted = 0;
  for (const [i, { word, deck }] of ordered.entries()) {
    const res = await insertWordIfAbsent(starterWordToInput(word, deck));
    if (!res.inserted) continue;
    inserted++;
    const at = new Date(start + i * 1000).toISOString();
    await db.execute(`UPDATE words SET created_at = $1 WHERE id = $2`, [at, res.id]);
    await db.execute(`UPDATE srs_reviews SET next_review_date = $1 WHERE word_id = $2 AND state = 0`, [at, res.id]);
  }
  markImported(decks.map((d) => d.id));
  return { inserted, skipped: ordered.length - inserted };
}
