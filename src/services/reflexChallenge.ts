/**
 * Service for the Reflex Challenge (Ramp Up Challenge):
 * High-speed, 3-tier survival time-attack challenge inspired by Duolingo.
 *
 * CRITICAL ARCHITECTURAL GUARANTEE:
 * This mode is strictly an isolated speed-practice mode.
 * It NEVER modifies or recalculates FSRS scheduling, stability, difficulty,
 * or due dates for words. It only awards XP and tracks local speed metrics.
 */

import type { WordDetail } from "@/types/database";
import type { CatalogEntry } from "./vocabCatalog";
import { getConciseMeaning } from "./meaningText";
import { awardXP, isLeechWord, isKnownOnly, isWordKnown } from "./smartReview";
import { isRememberedLong, isLearning } from "./wordStatus";
import { logLearningEvent } from "./learningEvents";
import { getLocalDateString } from "./streak";
import { shuffle } from "@/lib/utils";

export type WordCategory = "leech" | "learning" | "remembered_long" | "known" | "catalog";

export const WORD_CATEGORY_LABELS: Record<WordCategory, string> = {
  leech: "Hay quên 🗡️",
  learning: "Đang học 📖",
  remembered_long: "Nhớ lâu 🧠",
  known: "Đã biết ✨",
  catalog: "Từ vựng chung 🌐",
};

export type ReflexTier = 1 | 2 | 3;

export interface ReflexTierConfig {
  tier: ReflexTier;
  targetCount: number;
  xpReward: number;
  label: string;
}

export const REFLEX_CONFIG = {
  INITIAL_TIME_SECONDS: 105,
  SECOND_CHANCE_SECONDS: 15,
  SECOND_CHANCE_PENALTY: 0.5, // 50% XP reduction on the tier where second chance was used
  PERFECT_BONUS_XP: 10,
  TIERS: [
    { tier: 1, targetCount: 10, xpReward: 15, label: "Chặng 1: Khởi động" },
    { tier: 2, targetCount: 12, xpReward: 25, label: "Chặng 2: Tăng tốc" },
    { tier: 3, targetCount: 15, xpReward: 40, label: "Chặng 3: Chạm đỉnh" },
  ] as const satisfies readonly ReflexTierConfig[],
};

export type QuestionType = "true_false" | "choice";

export interface ReflexQuestion {
  id: string;
  wordId: string;
  word: string;
  phonetic?: string | null;
  partOfSpeech?: string | null;
  type: QuestionType;
  tier: ReflexTier;
  direction: "en_to_vn" | "vn_to_en";
  prompt: string;
  targetMeaning: string;
  /** 3 or 4 options for multiple-choice questions */
  options?: string[];
  /** 0-indexed correct option */
  correctIndex?: number;
  /** For True/False questions */
  isTrue?: boolean;
  displayedPair?: { word: string; meaning: string };
  category?: WordCategory;
}

export interface ReflexAnswerRecord {
  questionId: string;
  word: string;
  phonetic?: string | null;
  prompt: string;
  type: QuestionType;
  direction: "en_to_vn" | "vn_to_en";
  isCorrect: boolean;
  userAnswer: string;
  correctAnswer: string;
  responseTimeMs: number;
  category?: WordCategory;
}

export interface ReflexSummary {
  tiersCleared: number; // 0..3
  totalXP: number;
  baseXP: number;
  bonusXP: number;
  perfectBonus: boolean;
  secondChanceUsed: boolean;
  secondChanceTier: ReflexTier | null;
  totalAnswered: number;
  totalCorrect: number;
  totalWrong: number;
  accuracy: number;
  avgResponseTimeMs: number;
  speedTitle: string;
  wrongWords: Array<{ word: string; meaning: string }>;
  answers: ReflexAnswerRecord[];
}

export interface ReflexStats {
  timesPlayed: number;
  /** Best score of one run (the run's XP before the daily cap) */
  bestXP: number;
  bestTier: number;
  fastestAvgMs: number;
  lastPlayedAt: string | null;
  /** Local day of xpToday */
  xpDay: string | null;
  /** XP the challenge awarded on xpDay (at most REFLEX_DAILY_XP_MAX) */
  xpToday: number;
}

const STATS_STORAGE_KEY = "myenglish_reflex_stats_v1";

/**
 * XP the challenge can award per local day, all runs together. It drills meanings without touching the
 * schedule: unlimited replays (up to 90 XP each) out-earned a day of real reviews on the leaderboard.
 */
export const REFLEX_DAILY_XP_MAX = 40;

const EMPTY_STATS: ReflexStats = { timesPlayed: 0, bestXP: 0, bestTier: 0, fastestAvgMs: 0, lastPlayedAt: null, xpDay: null, xpToday: 0 };

/**
 * Calculates XP earned based on completed tiers and whether second chance was used.
 */
export function calculateReflexXP(
  tiersCleared: number,
  secondChanceTier: ReflexTier | null,
  isPerfect: boolean
): { totalXP: number; baseXP: number; perfectBonus: number; tierBreakdown: number[] } {
  let baseXP = 0;
  const tierBreakdown: number[] = [];

  for (let t = 1; t <= Math.min(tiersCleared, 3); t++) {
    const config = REFLEX_CONFIG.TIERS.find((c) => c.tier === t);
    if (!config) continue;

    let tierXP: number = config.xpReward;
    if (secondChanceTier === t) {
      // 50% penalty for using second chance on this tier
      tierXP = Math.round(tierXP * REFLEX_CONFIG.SECOND_CHANCE_PENALTY);
    }
    tierBreakdown.push(tierXP);
    baseXP += tierXP;
  }

  const perfectBonus = isPerfect && tiersCleared === 3 ? REFLEX_CONFIG.PERFECT_BONUS_XP : 0;
  const totalXP = baseXP + perfectBonus;

  return { totalXP, baseXP, perfectBonus, tierBreakdown };
}

/**
 * Speed tier title based on average reaction time per question.
 */
export function speedRating(avgTimeMs: number): { title: string; color: string } {
  if (avgTimeMs <= 0) return { title: "Bền bỉ 🏃", color: "text-slate-500" };
  if (avgTimeMs < 1600) return { title: "Tia chớp ⚡", color: "text-amber-500" };
  if (avgTimeMs < 2400) return { title: "Nhanh như gió 🌪️", color: "text-cyan-500" };
  if (avgTimeMs < 3400) return { title: "Vững vàng 🛡️", color: "text-emerald-500" };
  return { title: "Bền bỉ 🏃", color: "text-blue-500" };
}

interface CandidateItem {
  id: string;
  word: string;
  meaning: string;
  phonetic?: string | null;
  pos?: string | null;
  category: WordCategory;
  recentlyReviewed?: boolean;
}

/**
 * Classifies a user word into one of the 4 core learner memory categories:
 * - Leech (Từ hay quên)
 * - Remembered Long (Từ nhớ lâu dài, stability >= 21)
 * - Known (Từ đã biết)
 * - Learning (Từ đang học)
 */
export function classifyWord(w: WordDetail): WordCategory {
  if (isLeechWord(w) || (w.stats?.wrongCount ?? 0) > 1 || (w.srs?.lapses ?? 0) > 1) {
    return "leech";
  }
  if (isRememberedLong(w)) {
    return "remembered_long";
  }
  if (isKnownOnly(w.srs) || isWordKnown(w)) {
    return "known";
  }
  if (isLearning(w)) {
    return "learning";
  }
  return (w.srs?.stability ?? 0) >= 21 ? "remembered_long" : "learning";
}

/** The word was introduced or answered at least once */
function wasMet(w: WordDetail): boolean {
  return (w.srs?.reps ?? 0) > 0 || (w.srs?.state ?? 0) > 0 || !!w.srs?.last_review || (w.srsProduction?.reps ?? 0) > 0;
}

/** Cooldown window (3 hours) so words just reviewed in a study session are deprioritized in Reflex Challenge */
export const RECENT_REFLEX_COOLDOWN_MS = 3 * 60 * 60 * 1000;

function wasReviewedRecentlyForReflex(w: WordDetail, nowMs: number = Date.now()): boolean {
  const recLast = w.srs?.last_review ? new Date(w.srs.last_review).getTime() : 0;
  const prodLast = w.srsProduction?.last_review ? new Date(w.srsProduction.last_review).getTime() : 0;
  const latest = Math.max(
    Number.isFinite(recLast) ? recLast : 0,
    Number.isFinite(prodLast) ? prodLast : 0
  );
  return latest > 0 && nowMs - latest <= RECENT_REFLEX_COOLDOWN_MS;
}

/**
 * Shuffle a list of words while keeping words not reviewed in the last 3 hours ahead of recently reviewed ones.
 */
function shufflePreferringFresh<T>(items: readonly T[], isRecent: (item: T) => boolean): T[] {
  const fresh: T[] = [];
  const recent: T[] = [];
  for (const item of items) {
    if (isRecent(item)) recent.push(item);
    else fresh.push(item);
  }
  return [...shuffle(fresh), ...shuffle(recent)];
}

/** How many of the learner's words one run is built from: 37 targets plus enough same-POS distractors. */
export const REFLEX_SAMPLE_SIZE = 160;

/**
 * A random sample of the learner's words for one run, so building the deck stays cheap with thousands of words
 * (a whole level marked "Đã biết" adds every word of it). Each met category gets an equal share first, the
 * rest of the met words fill what a small category leaves, and words never met only top it up.
 * Words not reviewed in the last 3 hours are prioritized ahead of recently reviewed words within each category.
 */
export function sampleReflexWords(
  words: readonly WordDetail[],
  limit = REFLEX_SAMPLE_SIZE,
  now: Date = new Date()
): WordDetail[] {
  const nowMs = now.getTime();
  if (words.length <= limit) return [...words];
  const met: Record<Exclude<WordCategory, "catalog">, WordDetail[]> = { leech: [], learning: [], remembered_long: [], known: [] };
  const unmet: WordDetail[] = [];
  for (const w of words) {
    if (!wasMet(w)) unmet.push(w);
    else met[classifyWord(w) as Exclude<WordCategory, "catalog">].push(w);
  }
  const share = Math.ceil(limit / 4);
  const picked: WordDetail[] = [];
  const leftover: WordDetail[] = [];
  for (const list of Object.values(met)) {
    const mixed = shufflePreferringFresh(list, (w) => wasReviewedRecentlyForReflex(w, nowMs));
    picked.push(...mixed.slice(0, share));
    leftover.push(...mixed.slice(share));
  }
  if (picked.length > limit) {
    return shufflePreferringFresh(picked, (w) => wasReviewedRecentlyForReflex(w, nowMs)).slice(0, limit);
  }
  picked.push(
    ...shufflePreferringFresh(leftover, (w) => wasReviewedRecentlyForReflex(w, nowMs)).slice(0, limit - picked.length)
  );
  picked.push(...shuffle(unmet).slice(0, limit - picked.length));
  return picked;
}

/**
 * Normalizes words from user database and optional catalog fallback into a unified candidate pool.
 */
export function buildCandidatePool(
  words: readonly WordDetail[],
  catalogFallback: readonly CatalogEntry[] = []
): CandidateItem[] {
  const seenWords = new Set<string>();
  const candidates: CandidateItem[] = [];

  // 1. Add words from user's active database with their respective memory classification
  for (const w of words) {
    const rawWord = w.word?.trim();
    if (!rawWord || seenWords.has(rawWord.toLowerCase())) continue;
    const meaning = getConciseMeaning(w.meaning_vn || "", rawWord);
    if (!meaning || meaning.length < 2) continue;

    seenWords.add(rawWord.toLowerCase());
    candidates.push({
      id: w.id,
      word: rawWord,
      meaning,
      phonetic: w.phonetic,
      pos: w.part_of_speech,
      // A word still waiting in the deck (never introduced) is not being learnt: it only fills, like deck words
      category: wasMet(w) ? classifyWord(w) : "catalog",
      recentlyReviewed: wasReviewedRecentlyForReflex(w),
    });
  }

  // 2. If pool is small (< 40 words), supplement from catalog
  if (candidates.length < 40 && catalogFallback.length > 0) {
    for (const c of catalogFallback) {
      if (candidates.length >= 60) break;
      const rawWord = c.word?.trim();
      if (!rawWord || seenWords.has(rawWord.toLowerCase())) continue;
      const meaning = getConciseMeaning(c.vn || "", rawWord);
      if (!meaning || meaning.length < 2) continue;

      seenWords.add(rawWord.toLowerCase());
      candidates.push({
        id: `cat_${c.id}`,
        word: rawWord,
        meaning,
        phonetic: c.ipaUs?.[0] || c.ipaUk?.[0] || null,
        pos: c.pos,
        category: "catalog",
      });
    }
  }

  return candidates;
}

/**
 * Builds the complete deck of 37 reflex questions partitioned across all 3 tiers.
 *
 * Tier 1: 10 questions (6 True/False + 4 4-choice En->Vn)
 * Tier 2: 12 questions (6 4-choice En->Vn + 6 4-choice Vn->En)
 * Tier 3: 15 questions (15 4-choice high-speed with leech & learning priority)
 *
 * Ensures balanced representation of all 4 categories:
 * - Từ hay quên (Leech)
 * - Từ đang học (Learning)
 * - Từ nhớ lâu dài (Remembered Long)
 * - Từ đã biết (Known)
 */
export function generateReflexQuestions(
  words: readonly WordDetail[],
  catalogFallback: readonly CatalogEntry[] = []
): ReflexQuestion[] {
  const pool = buildCandidatePool(sampleReflexWords(words), catalogFallback);
  if (pool.length === 0) return [];

  // Need at least 4 items for choices; if pool is very small, duplicate with unique IDs
  let workingPool = [...pool];
  while (workingPool.length < 16) {
    workingPool = workingPool.concat(
      pool.map((item, idx) => ({ ...item, id: `${item.id}_rep${idx}` }))
    );
  }

  // Categorize pool into distinct buckets, prioritizing words not reviewed in the last 3 hours
  const buckets: Record<WordCategory, CandidateItem[]> = {
    leech: shufflePreferringFresh(
      workingPool.filter((w) => w.category === "leech"),
      (w) => !!w.recentlyReviewed
    ),
    learning: shufflePreferringFresh(
      workingPool.filter((w) => w.category === "learning"),
      (w) => !!w.recentlyReviewed
    ),
    remembered_long: shufflePreferringFresh(
      workingPool.filter((w) => w.category === "remembered_long"),
      (w) => !!w.recentlyReviewed
    ),
    known: shufflePreferringFresh(
      workingPool.filter((w) => w.category === "known"),
      (w) => !!w.recentlyReviewed
    ),
    catalog: shuffle(workingPool.filter((w) => w.category === "catalog")),
  };

  const pointers: Record<WordCategory, number> = {
    leech: 0,
    learning: 0,
    remembered_long: 0,
    known: 0,
    catalog: 0,
  };

  const pickCandidate = (preferences: WordCategory[]): CandidateItem => {
    for (const cat of preferences) {
      const list = buckets[cat];
      if (list && list.length > 0) {
        const item = list[pointers[cat] % list.length];
        pointers[cat]++;
        return item;
      }
    }
    const all = workingPool;
    const item = all[pointers.learning % all.length];
    pointers.learning++;
    return item;
  };

  const questions: ReflexQuestion[] = [];

  // Helper to get distractors matching part of speech if possible
  const getDistractors = (target: CandidateItem, count: number, field: "meaning" | "word"): string[] => {
    const samePos = workingPool.filter(
      (w) => w.word !== target.word && (!target.pos || w.pos === target.pos)
    );
    const poolToUse = samePos.length >= count ? samePos : workingPool.filter((w) => w.word !== target.word);
    const shuffledPool = shuffle(poolToUse);
    const picked: string[] = [];
    const seen = new Set<string>([target[field].toLowerCase()]);

    for (const item of shuffledPool) {
      const val = item[field].trim();
      if (!val || seen.has(val.toLowerCase())) continue;
      seen.add(val.toLowerCase());
      picked.push(val);
      if (picked.length >= count) break;
    }
    return picked;
  };

  const TIER1_CATS: WordCategory[][] = [
    ["remembered_long", "learning", "known", "leech"],
    ["learning", "remembered_long", "known", "leech"],
    ["known", "learning", "remembered_long", "leech"],
    ["remembered_long", "learning", "leech", "known"],
    ["learning", "remembered_long", "known", "leech"],
    ["known", "learning", "remembered_long", "leech"],
    ["remembered_long", "learning", "leech", "known"],
    ["learning", "remembered_long", "known", "leech"],
    ["leech", "learning", "remembered_long", "known"],
    ["learning", "remembered_long", "known", "leech"],
  ];

  const TIER2_CATS: WordCategory[][] = [
    ["learning", "remembered_long", "leech", "known"],
    ["remembered_long", "learning", "leech", "known"],
    ["leech", "learning", "remembered_long", "known"],
    ["known", "learning", "remembered_long", "leech"],
    ["learning", "leech", "remembered_long", "known"],
    ["remembered_long", "learning", "known", "leech"],
    ["leech", "learning", "remembered_long", "known"],
    ["known", "remembered_long", "learning", "leech"],
    ["learning", "remembered_long", "leech", "known"],
    ["remembered_long", "learning", "leech", "known"],
    ["leech", "learning", "remembered_long", "known"],
    ["learning", "remembered_long", "known", "leech"],
  ];

  const TIER3_CATS: WordCategory[][] = [
    ["leech", "learning", "remembered_long", "known"],
    ["learning", "leech", "remembered_long", "known"],
    ["remembered_long", "learning", "leech", "known"],
    ["leech", "remembered_long", "learning", "known"],
    ["learning", "leech", "remembered_long", "known"],
    ["known", "learning", "remembered_long", "leech"],
    ["leech", "learning", "remembered_long", "known"],
    ["remembered_long", "leech", "learning", "known"],
    ["learning", "remembered_long", "leech", "known"],
    ["leech", "learning", "remembered_long", "known"],
    ["remembered_long", "learning", "leech", "known"],
    ["learning", "leech", "remembered_long", "known"],
    ["leech", "learning", "remembered_long", "known"],
    ["known", "remembered_long", "learning", "leech"],
    ["learning", "remembered_long", "leech", "known"],
  ];

  // -------------------------------------------------------------
  // TIER 1: 10 questions (6 True/False, 4 4-choice En->Vn)
  // -------------------------------------------------------------
  for (let i = 0; i < 10; i++) {
    const target = pickCandidate(TIER1_CATS[i % TIER1_CATS.length]);
    const isTrueFalse = i % 2 === 0 && i < 6; // 3 True/False, rest choice

    if (isTrueFalse) {
      const isActuallyTrue = Math.random() >= 0.5;
      let displayedMeaning = target.meaning;
      if (!isActuallyTrue) {
        const distractors = getDistractors(target, 1, "meaning");
        displayedMeaning = distractors[0] || "nghĩa khác";
      }

      questions.push({
        id: `t1_q${i + 1}`,
        wordId: target.id,
        word: target.word,
        phonetic: target.phonetic,
        partOfSpeech: target.pos,
        category: target.category,
        type: "true_false",
        tier: 1,
        direction: "en_to_vn",
        prompt: target.word,
        targetMeaning: target.meaning,
        isTrue: isActuallyTrue,
        displayedPair: {
          word: target.word,
          meaning: displayedMeaning,
        },
      });
    } else {
      // 4 options multiple choice (always 4 options for a balanced 2x2 grid)
      const distractors = getDistractors(target, 3, "meaning");
      const rawOptions = [target.meaning, ...distractors];
      const shuffledOptions = shuffle(rawOptions);
      const correctIndex = shuffledOptions.indexOf(target.meaning);

      questions.push({
        id: `t1_q${i + 1}`,
        wordId: target.id,
        word: target.word,
        phonetic: target.phonetic,
        partOfSpeech: target.pos,
        category: target.category,
        type: "choice",
        tier: 1,
        direction: "en_to_vn",
        prompt: target.word,
        targetMeaning: target.meaning,
        options: shuffledOptions,
        correctIndex,
      });
    }
  }

  // -------------------------------------------------------------
  // TIER 2: 12 questions (4 options, 50% En->Vn, 50% Vn->En)
  // -------------------------------------------------------------
  for (let i = 0; i < 12; i++) {
    const target = pickCandidate(TIER2_CATS[i % TIER2_CATS.length]);
    const isVnToEn = i % 2 === 1;

    if (isVnToEn) {
      const distractors = getDistractors(target, 3, "word");
      const rawOptions = [target.word, ...distractors];
      const shuffledOptions = shuffle(rawOptions);
      const correctIndex = shuffledOptions.indexOf(target.word);

      questions.push({
        id: `t2_q${i + 1}`,
        wordId: target.id,
        word: target.word,
        phonetic: target.phonetic,
        partOfSpeech: target.pos,
        category: target.category,
        type: "choice",
        tier: 2,
        direction: "vn_to_en",
        prompt: target.meaning,
        targetMeaning: target.meaning,
        options: shuffledOptions,
        correctIndex,
      });
    } else {
      const distractors = getDistractors(target, 3, "meaning");
      const rawOptions = [target.meaning, ...distractors];
      const shuffledOptions = shuffle(rawOptions);
      const correctIndex = shuffledOptions.indexOf(target.meaning);

      questions.push({
        id: `t2_q${i + 1}`,
        wordId: target.id,
        word: target.word,
        phonetic: target.phonetic,
        partOfSpeech: target.pos,
        category: target.category,
        type: "choice",
        tier: 2,
        direction: "en_to_vn",
        prompt: target.word,
        targetMeaning: target.meaning,
        options: shuffledOptions,
        correctIndex,
      });
    }
  }

  // -------------------------------------------------------------
  // TIER 3: 15 questions (4 options, fast paced with leech priority)
  // -------------------------------------------------------------
  for (let i = 0; i < 15; i++) {
    const target = pickCandidate(TIER3_CATS[i % TIER3_CATS.length]);
    const isVnToEn = i % 3 === 0;

    if (isVnToEn) {
      const distractors = getDistractors(target, 3, "word");
      const rawOptions = [target.word, ...distractors];
      const shuffledOptions = shuffle(rawOptions);
      const correctIndex = shuffledOptions.indexOf(target.word);

      questions.push({
        id: `t3_q${i + 1}`,
        wordId: target.id,
        word: target.word,
        phonetic: target.phonetic,
        partOfSpeech: target.pos,
        category: target.category,
        type: "choice",
        tier: 3,
        direction: "vn_to_en",
        prompt: target.meaning,
        targetMeaning: target.meaning,
        options: shuffledOptions,
        correctIndex,
      });
    } else {
      const distractors = getDistractors(target, 3, "meaning");
      const rawOptions = [target.meaning, ...distractors];
      const shuffledOptions = shuffle(rawOptions);
      const correctIndex = shuffledOptions.indexOf(target.meaning);

      questions.push({
        id: `t3_q${i + 1}`,
        wordId: target.id,
        word: target.word,
        phonetic: target.phonetic,
        partOfSpeech: target.pos,
        category: target.category,
        type: "choice",
        tier: 3,
        direction: "en_to_vn",
        prompt: target.word,
        targetMeaning: target.meaning,
        options: shuffledOptions,
        correctIndex,
      });
    }
  }

  return questions;
}

/**
 * Gets persisted reflex stats from localStorage.
 */
export function getReflexStats(): ReflexStats {
  try {
    const raw = localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) return { ...EMPTY_STATS };
    const parsed = JSON.parse(raw);
    return {
      timesPlayed: Number(parsed.timesPlayed) || 0,
      bestXP: Number(parsed.bestXP) || 0,
      bestTier: Number(parsed.bestTier) || 0,
      fastestAvgMs: Number(parsed.fastestAvgMs) || 0,
      lastPlayedAt: parsed.lastPlayedAt || null,
      xpDay: typeof parsed.xpDay === "string" ? parsed.xpDay : null,
      xpToday: Number(parsed.xpToday) || 0,
    };
  } catch {
    return { ...EMPTY_STATS };
  }
}

/** XP the challenge can still award today (see REFLEX_DAILY_XP_MAX) */
export function reflexXpLeftToday(now: Date = new Date(), stats: ReflexStats = getReflexStats()): number {
  const used = stats.xpDay === getLocalDateString(now) ? stats.xpToday : 0;
  return Math.max(0, REFLEX_DAILY_XP_MAX - used);
}

/**
 * Saves completed reflex session, updates personal bests, awards XP (within today's cap) and logs event.
 * Absolutely NO FSRS recalculation or scheduling is performed. Returns the XP actually awarded.
 */
export function recordReflexCompletion(summary: ReflexSummary, now: Date = new Date()): number {
  // 1. Award XP if any was earned, within what today still allows
  const current = getReflexStats();
  const awarded = Math.min(Math.max(0, summary.totalXP), reflexXpLeftToday(now, current));
  if (awarded > 0) {
    awardXP(awarded);
  }

  // 2. Log learning event
  logLearningEvent("session_completed", {
    meta: {
      reflex: true,
      tiersCleared: summary.tiersCleared,
      totalXP: summary.totalXP,
      awardedXP: awarded,
      accuracy: summary.accuracy,
      avgResponseTimeMs: summary.avgResponseTimeMs,
      secondChanceUsed: summary.secondChanceUsed,
    },
  }).catch(() => {});

  // 3. Persist stats
  try {
    const today = getLocalDateString(now);
    const updated: ReflexStats = {
      timesPlayed: current.timesPlayed + 1,
      bestXP: Math.max(current.bestXP, summary.totalXP),
      bestTier: Math.max(current.bestTier, summary.tiersCleared),
      fastestAvgMs:
        summary.tiersCleared > 0
          ? current.fastestAvgMs > 0
            ? Math.min(current.fastestAvgMs, summary.avgResponseTimeMs)
            : summary.avgResponseTimeMs
          : current.fastestAvgMs,
      lastPlayedAt: now.toISOString(),
      xpDay: today,
      xpToday: (current.xpDay === today ? current.xpToday : 0) + awarded,
    };
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("myenglish-reflex-updated"));
    window.dispatchEvent(new CustomEvent("myenglish-activity-updated"));
    window.dispatchEvent(new CustomEvent("myenglish-quests-updated"));
  } catch {}
  return awarded;
}

/**
 * Checks whether the learner has completed at least one reflex challenge today.
 */
export function isReflexPracticedToday(now: Date = new Date()): boolean {
  try {
    const stats = getReflexStats();
    if (!stats.lastPlayedAt) return false;
    return getLocalDateString(now) === getLocalDateString(new Date(stats.lastPlayedAt));
  } catch {
    return false;
  }
}
