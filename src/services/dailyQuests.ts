/**
 * Daily quests ("Nhiệm vụ hôm nay"): three small goals per local day, picked once from a pool with a seed of
 * the date and a bias toward skills the learner has left alone, then kept for the day. Progress is read from
 * what the app already records (review logs, learning events, grammar progress). With all three done, the
 * learner opens a chest once: a little XP (capped, the leaderboard stays fair) and sometimes a streak freeze.
 */
import type { WordDetail } from "@/types/database";
import { getDatabase } from "./db";
import { getLearningEventsSince } from "./learningEvents";
import { getReviewLogsSince } from "./progress";
import { awardXP } from "./smartReview";
import { addBonusFreeze, getLocalDateString, MAX_FREEZES } from "./streak";
import { persistKeyNow } from "./storageBackup";
import { loadForgottenWords } from "./forgottenWords";
import { getAllGrammarProgress, initGrammarStorage } from "./grammarService";
import { getTodayGrammarPlan } from "./grammarPath";
import { loadPronunciationLessons } from "./pronunciation";
import { isReflexPracticedToday } from "./reflexChallenge";

export const QUESTS_KEY = "myenglish_daily_quests_v1";
export const QUESTS_EVENT = "myenglish-quests-updated";
export const QUESTS_PER_DAY = 3;
/** The chest's XP is one of these, never more than CHEST_XP_MAX a day */
export const CHEST_XP_CHOICES = [20, 25, 30] as const;
export const CHEST_XP_MAX = 30;
/** Share of days whose chest also holds a streak freeze (while the stock is below MAX_FREEZES) */
export const CHEST_FREEZE_CHANCE = 0.25;
/** A skill left alone this many days always gets a quest */
export const NEGLECT_FORCE_DAYS = 3;
/** Days of neglect counted in a skill's weight at most (and for a skill never practised) */
export const NEGLECT_MAX_DAYS = 14;
/** Days of learning events read for "last practised" */
const HISTORY_DAYS = 30;

export type QuestId = "first_try" | "new_words" | "focus" | "forgotten" | "grammar" | "pronunciation" | "reflex";
/** Skills whose last practice day steers the pick */
export type SkillId = "focus" | "grammar" | "pronunciation";
const SKILLS: readonly SkillId[] = ["focus", "grammar", "pronunciation"];

export interface Quest {
  id: QuestId;
  target: number;
}

export interface ChestReward {
  xp: number;
  freeze: boolean;
}

export interface DailyQuestState {
  day: string;
  quests: Quest[];
  claimed: boolean;
  reward?: ChestReward;
}

/** What decides which quests can be offered today */
export interface QuestPickContext {
  dailyGoal: number;
  /**
   * Graded answers possible today: cards still to do (reviews + new cards) plus first-try answers already given.
   * Unknown: the target only follows the daily goal.
   */
  gradableToday?: number;
  /** New words still allowed today */
  newAllowed: number;
  /** Anything ever studied (a focus session needs cards) */
  hasStudied: boolean;
  /** Words often forgotten right now */
  forgottenCount: number;
  grammarAvailable: boolean;
  pronunciationAvailable: boolean;
  reflexAvailable?: boolean;
  /** Last local day each skill was practised, if ever */
  lastDone: Partial<Record<SkillId, string>>;
}

/** Today's counts, one per quest */
export type QuestFacts = Record<QuestId, number>;

export const EMPTY_FACTS: QuestFacts = { first_try: 0, new_words: 0, focus: 0, forgotten: 0, grammar: 0, pronunciation: 0, reflex: 0 };

// ─── Seeded randomness ───────────────────────────────────────────────────────

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: small, fast and the same on every machine */
export function seededRandom(seed: string): () => number {
  let a = hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Picking ─────────────────────────────────────────────────────────────────

/** Whole days from `from` to `to` ("YYYY-MM-DD") */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** Days since the skill was last practised, capped (a skill never practised counts as the cap) */
export function neglectDays(skill: SkillId, day: string, lastDone: QuestPickContext["lastDone"]): number {
  const last = lastDone[skill];
  if (!last) return NEGLECT_MAX_DAYS;
  return Math.max(0, Math.min(NEGLECT_MAX_DAYS, daysBetween(last, day)));
}

/** Least first-try answers worth a quest: fewer cards today and the quest is left out */
export const FIRST_TRY_MIN_TARGET = 3;
/** Share of today's gradable cards the first-try quest asks for (a few misses still let it be done) */
export const FIRST_TRY_SHARE = 0.8;

/**
 * Target of "Đúng ngay lần đầu": the daily goal + 5 (8 to 20), but never more than FIRST_TRY_SHARE of the cards
 * that can be graded today. Only graded answers count, so with few cards due a fixed 20 could not be done.
 * Null when today has too few cards for the quest.
 */
export function firstTryTarget(ctx: Pick<QuestPickContext, "dailyGoal" | "gradableToday">): number | null {
  const byGoal = Math.max(8, Math.min(20, ctx.dailyGoal + 5));
  const target = ctx.gradableToday == null ? byGoal : Math.min(byGoal, Math.floor(ctx.gradableToday * FIRST_TRY_SHARE));
  return target >= FIRST_TRY_MIN_TARGET ? target : null;
}

/** Every quest that makes sense today, with its target */
export function availableQuests(ctx: QuestPickContext): Quest[] {
  const out: Quest[] = [];
  const firstTry = firstTryTarget(ctx);
  if (firstTry != null) out.push({ id: "first_try", target: firstTry });
  if (ctx.newAllowed >= 3) out.push({ id: "new_words", target: Math.min(5, ctx.newAllowed) });
  if (ctx.hasStudied) out.push({ id: "focus", target: 1 });
  if (ctx.forgottenCount > 0) out.push({ id: "forgotten", target: Math.min(3, ctx.forgottenCount) });
  if (ctx.grammarAvailable) out.push({ id: "grammar", target: 1 });
  if (ctx.pronunciationAvailable) out.push({ id: "pronunciation", target: 1 });
  if (ctx.reflexAvailable) out.push({ id: "reflex", target: 1 });
  return out;
}

const isSkill = (id: QuestId): id is SkillId => (SKILLS as readonly QuestId[]).includes(id);

/**
 * Today's quests: one vocabulary quest (when today has enough cards for one), then the skill left alone longest
 * (3+ days) for sure, then a draw weighted by neglect. Same day and same context → same quests.
 */
export function pickDailyQuests(day: string, ctx: QuestPickContext): Quest[] {
  const rng = seededRandom(`quests:${day}`);
  const pool = availableQuests(ctx);
  const picked: Quest[] = [];
  const take = (q: Quest) => {
    picked.push(q);
    pool.splice(pool.indexOf(q), 1);
  };

  // A day with too few cards for either vocabulary quest takes the others
  const vocab = pool.filter((q) => q.id === "first_try" || q.id === "new_words");
  if (vocab.length > 0) take(vocab[Math.floor(rng() * vocab.length)]);

  const weight = (q: Quest): number => {
    if (isSkill(q.id)) return 1 + neglectDays(q.id, day, ctx.lastDone);
    if (q.id === "forgotten") return 1 + Math.min(NEGLECT_MAX_DAYS - 1, ctx.forgottenCount);
    if (q.id === "reflex") return 2;
    return 1; // the other vocabulary quest
  };

  // The most neglected skill; ties broken by the seed
  const skills = pool.filter((q) => isSkill(q.id)).map((q) => ({ q, days: neglectDays(q.id as SkillId, day, ctx.lastDone), r: rng() }));
  skills.sort((a, b) => b.days - a.days || a.r - b.r);
  if (skills[0] && skills[0].days >= NEGLECT_FORCE_DAYS) take(skills[0].q);

  while (picked.length < QUESTS_PER_DAY && pool.length > 0) {
    const total = pool.reduce((s, q) => s + weight(q), 0);
    let r = rng() * total;
    const next = pool.find((q) => (r -= weight(q)) < 0) ?? pool[pool.length - 1];
    take(next);
  }
  return picked;
}

// ─── Progress ────────────────────────────────────────────────────────────────

export function questProgress(q: Quest, facts: QuestFacts): number {
  return Math.min(q.target, Math.max(0, facts[q.id] ?? 0));
}

export function allQuestsDone(quests: readonly Quest[], facts: QuestFacts): boolean {
  return quests.length > 0 && quests.every((q) => questProgress(q, facts) >= q.target);
}

export function questTitle(q: Quest): string {
  switch (q.id) {
    case "first_try":
      return `Đúng ngay lần đầu ${q.target} câu`;
    case "new_words":
      return `Học ${q.target} từ mới`;
    case "focus":
      return "Hoàn thành 1 phiên tập trung";
    case "forgotten":
      return `Ôn ${q.target} từ hay quên`;
    case "grammar":
      return "Làm 1 bài ngữ pháp";
    case "pronunciation":
      return "Làm 1 bài phát âm";
    case "reflex":
      return "Tham gia 1 lượt luyện phản xạ";
  }
}

// ─── Chest ───────────────────────────────────────────────────────────────────

/** What today's chest holds: fixed by the day, a freeze only while the stock has room */
export function chestReward(day: string, freezesAvailable: number): ChestReward {
  const rng = seededRandom(`chest:${day}`);
  const xp = Math.min(CHEST_XP_MAX, CHEST_XP_CHOICES[Math.floor(rng() * CHEST_XP_CHOICES.length)]);
  const freeze = rng() < CHEST_FREEZE_CHANCE && freezesAvailable < MAX_FREEZES;
  return { xp, freeze };
}

// ─── Storage ─────────────────────────────────────────────────────────────────

// No reading quest any more (removed 2026-10-17): a stored "reading" quest is dropped when read, and
// ensureQuestState fills its place
const QUEST_IDS: readonly QuestId[] = ["first_try", "new_words", "focus", "forgotten", "grammar", "pronunciation", "reflex"];

export function parseQuestState(raw: string | null): DailyQuestState | null {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v.day !== "string" || !Array.isArray(v.quests)) return null;
    const quests = (v.quests as Quest[]).filter(
      (q) => q && QUEST_IDS.includes(q.id) && Number.isFinite(q.target) && q.target > 0
    );
    if (quests.length === 0) return null;
    const reward = v.reward && Number.isFinite(v.reward.xp) ? { xp: Math.min(CHEST_XP_MAX, v.reward.xp), freeze: !!v.reward.freeze } : undefined;
    return { day: v.day, quests, claimed: !!v.claimed, ...(reward ? { reward } : {}) };
  } catch {
    return null;
  }
}

export function readQuestState(day: string): DailyQuestState | null {
  try {
    const s = parseQuestState(localStorage.getItem(QUESTS_KEY));
    return s && s.day === day ? s : null;
  } catch {
    return null;
  }
}

function writeQuestState(state: DailyQuestState): void {
  try {
    localStorage.setItem(QUESTS_KEY, JSON.stringify(state));
    persistKeyNow(QUESTS_KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent(QUESTS_EVENT));
}

/** Today's quests, picked and saved on first call of the day (or as another machine already picked them) */
export function ensureQuestState(day: string, ctx: QuestPickContext): DailyQuestState {
  const stored = readQuestState(day);
  if (stored && (stored.claimed || stored.quests.length >= QUESTS_PER_DAY)) return stored;
  if (stored) {
    // A quest that no longer exists was dropped: today's others stay, the gap is filled from today's pick
    const have = new Set(stored.quests.map((q) => q.id));
    const extra = [...pickDailyQuests(day, ctx), ...availableQuests(ctx)].filter((q, i, all) => !have.has(q.id) && all.findIndex((x) => x.id === q.id) === i);
    const filled: DailyQuestState = { ...stored, quests: [...stored.quests, ...extra.slice(0, QUESTS_PER_DAY - stored.quests.length)] };
    writeQuestState(filled);
    return filled;
  }
  const state: DailyQuestState = { day, quests: pickDailyQuests(day, ctx), claimed: false };
  writeQuestState(state);
  return state;
}

/**
 * Open today's chest: once a day, only with every quest done. Awards the XP and maybe a bonus freeze.
 * Returns the reward, or null when nothing was opened by this call.
 */
export function claimChest(day: string, facts: QuestFacts, freezesAvailable: number): ChestReward | null {
  const state = readQuestState(day);
  if (!state || state.claimed || !allQuestsDone(state.quests, facts)) return null;
  const reward = chestReward(day, freezesAvailable);
  writeQuestState({ ...state, claimed: true, reward });
  awardXP(reward.xp);
  if (reward.freeze) addBonusFreeze(day);
  return reward;
}

// ─── Loading what the app recorded ───────────────────────────────────────────

function startOfLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

const dayOf = (iso: string) => getLocalDateString(new Date(iso));

export interface QuestData {
  facts: QuestFacts;
  /** Context for the pick, minus what the caller knows (goal, new words allowed, words studied) */
  lastDone: QuestPickContext["lastDone"];
  forgottenCount: number;
  grammarAvailable: boolean;
  pronunciationAvailable: boolean;
}

/** Today's counts and the history the pick needs. Each source fails alone (a missing one counts as zero). */
export async function loadQuestData(words: readonly WordDetail[], now: Date = new Date()): Promise<QuestData> {
  const today = getLocalDateString(now);
  const dayStart = startOfLocalDay(now);
  const facts: QuestFacts = { ...EMPTY_FACTS };
  const lastDone: QuestPickContext["lastDone"] = {};
  const mark = (skill: SkillId, day: string) => {
    if (day <= today && (!lastDone[skill] || day > lastDone[skill]!)) lastDone[skill] = day;
  };

  const [logs, intros, events, forgotten, grammarAvailable, pronunciationAvailable] = await Promise.all([
    getReviewLogsSince(dayStart).catch(() => []),
    getDatabase()
      .then((db) =>
        db.select<Array<{ n: number }>>(
          `SELECT COUNT(DISTINCT word_id) AS n FROM review_logs
           WHERE exercise_type = 'intro' AND timestamp >= $1 AND COALESCE(state_before, 0) = 0`,
          [dayStart.toISOString()]
        )
      )
      .then((rows) => Number(rows[0]?.n) || 0)
      .catch(() => 0),
    getLearningEventsSince(new Date(dayStart.getTime() - HISTORY_DAYS * 86400000), ["focus_completed", "pronunciation_quiz"]).catch(
      () => []
    ),
    loadForgottenWords(words, now).catch(() => null),
    initGrammarStorage()
      .then(() => getTodayGrammarPlan(now))
      .then((p) => p.pathLength > 0)
      .catch(() => false),
    loadPronunciationLessons()
      .then((l) => l.length > 0)
      .catch(() => false),
  ]);

  facts.first_try = logs.filter((l) => l.isScheduled && l.rating > 1).length;
  facts.new_words = intros;

  for (const e of events) {
    const d = dayOf(e.at);
    const skill: SkillId = e.type === "focus_completed" ? "focus" : "pronunciation";
    mark(skill, d);
    if (d === today) facts[skill]++;
  }

  for (const p of Object.values(getAllGrammarProgress())) {
    if (!p.lastAttemptDate) continue;
    const d = dayOf(p.lastAttemptDate);
    mark("grammar", d);
    if (d === today) facts.grammar++;
  }

  let forgottenCount = 0;
  if (forgotten) {
    forgottenCount = forgotten.active.length;
    const ids = new Set([...forgotten.active, ...forgotten.recovered].map((e) => e.word.id));
    facts.forgotten = new Set(logs.filter((l) => l.rating > 1 && ids.has(l.wordId)).map((l) => l.wordId)).size;
  }

  facts.reflex = isReflexPracticedToday(now) ? 1 : 0;

  return { facts, lastDone, forgottenCount, grammarAvailable, pronunciationAvailable };
}
