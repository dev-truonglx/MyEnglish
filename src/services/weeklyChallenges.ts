/**
 * Weekly challenges ("Thử thách tuần"): three goals a week, one per difficulty tier, picked once per week from
 * a pool of kinds with a seed of the week, then kept until Monday. A tier pays more XP for a bigger target, and
 * targets follow the learner: they start from last week's own figure for that kind (a fixed floor when there is
 * none), so "Khó" is hard for this learner, not for everyone. Targets also stay within what the week can hold
 * for this learner (roomFor: the daily plan, the days left, the words near long-term memory...), so a 5-minute
 * plan is never asked for a 15-minute week. All three done adds a bonus.
 * Progress is read from what the app already records: review logs, the daily activity log, learning events
 * (focus sessions, words reaching long-term memory, pronunciation lessons) and grammar progress.
 */
import type { WordDetail } from "@/types/database";
import { getDatabase } from "./db";
import { getLearningEventsSince } from "./learningEvents";
import { getReviewLogsSince, pickChallengeTopic, startOfWeek, weekKey, type ProgressLog } from "./progress";
import { awardXP, isSuspended, MATURE_STABILITY_DAYS } from "./smartReview";
import { getStudyLimits } from "./srs";
import { getFocusSettings } from "./focusSettings";
import { getActivityLogs, getDailyGoal, getLocalDateString } from "./streak";
import { persistKeyNow } from "./storageBackup";
import { seededRandom } from "./dailyQuests";
import { loadForgottenWords } from "./forgottenWords";
import { getAllGrammarProgress, initGrammarStorage } from "./grammarService";
import { getTodayGrammarPlan } from "./grammarPath";
import { loadPronunciationLessons } from "./pronunciation";

export const WEEKLY_KEY = "myenglish_weekly_challenges_v1";
export const WEEKLY_EVENT = "myenglish-weekly-challenges-updated";

export type Tier = "easy" | "medium" | "hard";
export const TIERS: readonly Tier[] = ["easy", "medium", "hard"];
export const TIER_LABEL: Record<Tier, string> = { easy: "Dễ", medium: "Vừa", hard: "Khó" };
export const TIER_XP: Record<Tier, number> = { easy: 30, medium: 60, hard: 100 };
/** Extra XP once all three are done */
export const ALL_DONE_BONUS_XP = 50;

export type ChallengeKind =
  | "level_correct"
  | "review_correct"
  | "active_days"
  | "goal_days"
  | "new_words"
  | "focus"
  | "mastered"
  | "forgotten"
  | "grammar"
  | "pronunciation";

interface KindDef {
  /** Targets when there is no history, and the least a tier asks */
  floor: Record<Tier, number>;
  /** The most a tier may ask (a week has 7 days, a level so many words...) */
  cap: number;
}

/** Last week's figure times this sets the target of a tier (when above the floor) */
export const TIER_FACTOR: Record<Tier, number> = { easy: 0.6, medium: 1, hard: 1.4 };

export const KINDS: Record<ChallengeKind, KindDef> = {
  level_correct: { floor: { easy: 10, medium: 20, hard: 30 }, cap: 60 },
  review_correct: { floor: { easy: 40, medium: 80, hard: 140 }, cap: 400 },
  active_days: { floor: { easy: 3, medium: 5, hard: 7 }, cap: 7 },
  goal_days: { floor: { easy: 2, medium: 4, hard: 6 }, cap: 7 },
  new_words: { floor: { easy: 10, medium: 20, hard: 35 }, cap: 80 },
  focus: { floor: { easy: 2, medium: 4, hard: 7 }, cap: 14 },
  mastered: { floor: { easy: 3, medium: 6, hard: 12 }, cap: 40 },
  forgotten: { floor: { easy: 3, medium: 6, hard: 10 }, cap: 30 },
  grammar: { floor: { easy: 1, medium: 3, hard: 5 }, cap: 10 },
  pronunciation: { floor: { easy: 1, medium: 2, hard: 4 }, cap: 8 },
};

export interface WeeklyChallenge {
  kind: ChallengeKind;
  tier: Tier;
  target: number;
  /** level_correct: the level (or topic) */
  topic?: string;
}

export interface WeeklyState {
  week: string;
  challenges: WeeklyChallenge[];
  /** Kinds whose XP was given */
  rewarded: ChallengeKind[];
  bonusRewarded: boolean;
}

/** This week's (or last week's) count per kind */
export type WeekFacts = Record<ChallengeKind, number>;
export const EMPTY_WEEK_FACTS: WeekFacts = {
  level_correct: 0,
  review_correct: 0,
  active_days: 0,
  goal_days: 0,
  new_words: 0,
  focus: 0,
  mastered: 0,
  forgotten: 0,
  grammar: 0,
  pronunciation: 0,
};

/** The learner's daily plan (onboarding DAILY_PLANS or Settings), which bounds what a week can hold */
export interface WeeklyPlan {
  /** Daily new-card budget (getStudyLimits) */
  newCardsPerDay: number;
  /** Answers a day that make the daily goal */
  dailyGoal: number;
  /** Length of a focus session (minutes) */
  focusMinutes: number;
}

export interface PickContext {
  /** Level of the level challenge (pickChallengeTopic), null: none possible */
  topic: string | null;
  /** Words in "Từ hay quên" now (0: no forgotten challenge) */
  forgottenCount: number;
  grammarAvailable: boolean;
  pronunciationAvailable: boolean;
  /** Anything studied ever (a focus session or words to master need cards) */
  hasStudied: boolean;
  /** Last week's figures, null for a learner without one */
  lastWeek: WeekFacts | null;
  plan: WeeklyPlan;
  /** Cards one right answer away from long-term memory and due this week (countNearMastered) */
  nearMastered: number;
  /** Days of the week left when picking, today included (Monday 7 ... Sunday 1); default 7 */
  daysLeft?: number;
}

// ─── Targets and picking ─────────────────────────────────────────────────────

/** Share of the new-card budget a week's new words may take: the budget is shared with new recall cards
 *  (progress.estimateNewWordsPerDay), so about half to two thirds of it are new words */
export const NEW_WORDS_SHARE = 0.6;
/** Share of the daily goal's answers that are right first answers on due cards (the rest: wrong answers,
 *  repeats in the same session, practice) */
export const RIGHT_ANSWER_SHARE = 0.6;
/** The plans set the daily goal at 3 answers per planned minute (onboarding DAILY_PLANS: 5 min = 15 answers) */
const GOAL_ANSWERS_PER_MINUTE = 3;
/** Share of the near-mastered cards one week can take over the line: a Hard answer or a lapse doesn't */
export const MASTERED_SHARE = 0.7;
/** From this stability (days) one right answer can carry a card past MATURE_STABILITY_DAYS */
export const NEAR_MASTERED_STABILITY_DAYS = 10;

/**
 * The most this learner can do of `kind` in what is left of the week: the plan's daily budget times the days
 * left, the words close to long-term memory, the words in "Từ hay quên"... Infinity: nothing limits it but
 * the kind's cap. For the answer-based kinds last week's own figure still sets "Khó" as before when it beats
 * the plan (the learner showed they have the time); not for new words: new words beyond the plan add reviews
 * the plan has no time for.
 */
export function roomFor(kind: ChallengeKind, ctx: PickContext): number {
  const days = Math.min(7, Math.max(1, Math.round(ctx.daysLeft ?? 7)));
  // Rounded as targetFor rounds it, so "Khó" from last week is not cut by one
  const proven = Math.round(Math.max(0, ctx.lastWeek?.[kind] ?? 0) * TIER_FACTOR.hard);
  const { newCardsPerDay, dailyGoal, focusMinutes } = ctx.plan;
  // Whole units, without a product like 35 × 0.6 landing just under 21
  const whole = (x: number) => Math.floor(x + 1e-9);
  const perWeek = (planned: number) => whole((Math.max(proven, planned) * days) / 7);
  switch (kind) {
    case "new_words":
      return whole(Math.max(0, newCardsPerDay) * days * NEW_WORDS_SHARE);
    case "review_correct":
    case "level_correct":
      return perWeek(dailyGoal * 7 * RIGHT_ANSWER_SHARE);
    case "active_days":
    case "goal_days":
      return days;
    case "focus":
      return perWeek(((dailyGoal / GOAL_ANSWERS_PER_MINUTE) * 7) / Math.max(1, focusMinutes));
    case "mastered":
      return whole(Math.max(0, ctx.nearMastered) * MASTERED_SHARE);
    case "forgotten":
      return Math.max(0, ctx.forgottenCount);
    default:
      return Infinity;
  }
}

/**
 * The tier's target for this learner: last week's figure scaled by the tier, never under the floor, never over
 * `room` (roomFor). A room smaller than the "Khó" floor shrinks all floors with it, so tiers stay apart.
 */
export function targetFor(kind: ChallengeKind, tier: Tier, lastWeek: number | null, room: number = Infinity): number {
  const def = KINDS[kind];
  const ceiling = Math.min(def.cap, Math.max(1, Math.floor(room)));
  const floor = Math.max(1, Math.round(def.floor[tier] * Math.min(1, ceiling / def.floor.hard)));
  const scaled = lastWeek && lastWeek > 0 ? Math.round(lastWeek * TIER_FACTOR[tier]) : 0;
  return Math.min(ceiling, Math.max(floor, scaled));
}

export function availableKinds(ctx: PickContext): ChallengeKind[] {
  const out: ChallengeKind[] = ["review_correct", "active_days", "goal_days", "new_words"];
  if (ctx.topic) out.push("level_correct");
  if (ctx.hasStudied) out.push("focus", "mastered");
  if (ctx.forgottenCount > 0) out.push("forgotten");
  if (ctx.grammarAvailable) out.push("grammar");
  if (ctx.pronunciationAvailable) out.push("pronunciation");
  // Not even one possible this week (e.g. no word near long-term memory yet): not offered
  return out.filter((k) => roomFor(k, ctx) >= 1);
}

/** Kinds that measure the same habit: never two of them in one week */
const SAME_HABIT: ChallengeKind[][] = [["active_days", "goal_days"], ["review_correct", "level_correct"]];

/**
 * Three challenges, one per tier, from three different kinds (and not two of the same habit). Same week and
 * context → same challenges.
 */
export function pickWeeklyChallenges(week: string, ctx: PickContext): WeeklyChallenge[] {
  const rng = seededRandom(`weekly:${week}`);
  const pool = availableKinds(ctx);
  const picked: ChallengeKind[] = [];
  while (picked.length < TIERS.length && pool.length > 0) {
    const kind = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    if (picked.some((p) => SAME_HABIT.some((g) => g.includes(p) && g.includes(kind)))) continue;
    picked.push(kind);
  }
  // Tiers in a seeded order, so a kind is not always the easy one
  const tiers = [...TIERS];
  for (let i = tiers.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tiers[i], tiers[j]] = [tiers[j], tiers[i]];
  }
  return picked.map((kind, i) => {
    const tier = tiers[i];
    return {
      kind,
      tier,
      target: targetFor(kind, tier, ctx.lastWeek ? ctx.lastWeek[kind] : null, roomFor(kind, ctx)),
      ...(kind === "level_correct" && ctx.topic ? { topic: ctx.topic } : {}),
    };
  });
}

export function challengeTitle(c: WeeklyChallenge): string {
  switch (c.kind) {
    case "level_correct":
      return `Trả lời đúng ${c.target} câu cấp độ ${c.topic ?? ""}`.trim();
    case "review_correct":
      return `Ôn đúng ${c.target} thẻ đến hạn`;
    case "active_days":
      return `Học ${c.target} ngày trong tuần`;
    case "goal_days":
      return `Đạt mục tiêu ngày ${c.target} lần`;
    case "new_words":
      return `Học ${c.target} từ mới`;
    case "focus":
      return `Hoàn thành ${c.target} phiên tập trung`;
    case "mastered":
      return `Đưa ${c.target} từ vào trí nhớ dài hạn`;
    case "forgotten":
      return `Nhớ lại ${c.target} từ hay quên`;
    case "grammar":
      return `Làm ${c.target} bài ngữ pháp`;
    case "pronunciation":
      return `Hoàn thành ${c.target} bài phát âm`;
  }
}

export interface DescribeContext {
  /** Answers a day that make the daily goal */
  dailyGoal: number;
  /** Last week's figure for this kind (null: no history) */
  lastWeek: number | null;
}

/** What counts toward the challenge and where to do it, for the tooltip of its name */
export function challengeHowTo(c: WeeklyChallenge, d: DescribeContext): string {
  switch (c.kind) {
    case "level_correct":
      return `Trả lời đúng ${c.target} lượt ôn của các từ cấp độ ${c.topic ?? ""}. Chỉ tính thẻ đến hạn trả lời mức "Khó" trở lên; luyện thêm và câu hỏi lại không tính. Cách nhanh: tab Ôn tập, bấm "Ôn" ở hàng ${c.topic ?? "cấp độ đó"}.`;
    case "review_correct":
      return `Trả lời đúng ${c.target} thẻ đến hạn. Chỉ tính lần trả lời đầu tiên của thẻ đến hạn, mức "Khó" trở lên; luyện thêm và câu hỏi lại không tính. Mỗi ngày bấm "Bắt đầu học" ở tab Hôm nay là đủ.`;
    case "active_days":
      return `Học vào ${c.target} ngày khác nhau: ngày nào có ít nhất 1 câu trả lời là được tính. Bận thì "Chỉ 1 phút" (3 thẻ) cũng đủ.`;
    case "goal_days":
      return `Đạt mục tiêu ngày (${d.dailyGoal} câu) vào ${c.target} ngày khác nhau. Mục tiêu ngày đổi được trong Cài đặt.`;
    case "new_words":
      return `Học ${c.target} từ mới: mỗi từ được tính khi bạn xem phần giới thiệu của nó lần đầu. Từ mới đến theo hạn mức mỗi ngày, nên cần học đều nhiều ngày; "Học thêm từ mới" ở tab Ôn tập lấy thêm vài từ.`;
    case "focus":
      return `Hoàn thành ${c.target} phiên tập trung. Phiên được tính khi chạy hết giờ, hết thẻ, hoặc bấm "Xong" sau 80% thời gian; thoát sớm không tính. Nút "Tập trung" ở tab Hôm nay hoặc Ôn tập.`;
    case "mastered":
      return `Đưa ${c.target} từ lên mốc "Nhớ lâu": từ được tính khi một lần ôn đúng đưa độ bền vượt 21 ngày. Từ đã ôn qua vài vòng dễ đạt mốc nhất, nên hãy ôn đúng hạn.`;
    case "forgotten":
      return `Trả lời đúng ít nhất 1 lần cho ${c.target} từ khác nhau trong mục "Từ hay quên" (tính cả luyện thêm). Mở "Từ hay quên" ở sidebar và bấm "Ôn N từ hay quên".`;
    case "grammar":
      return `Làm ${c.target} bài ngữ pháp khác nhau (học mới hoặc ôn lại); mỗi bài chỉ tính một lần trong tuần. Vào tab Ngữ pháp.`;
    case "pronunciation":
      return `Làm xong phần nghe và chọn của ${c.target} bài phát âm trong tab Phát âm; mỗi lần làm xong bài được tính một lần.`;
  }
}

/** What made a target smaller than the usual one (roomFor), for the note */
const ROOM_REASON: Partial<Record<ChallengeKind, string>> = {
  new_words: "hạn mức từ mới mỗi ngày của bạn",
  mastered: "số từ sắp đạt mốc \"Nhớ lâu\" trong tuần này",
  forgotten: "số từ trong mục \"Từ hay quên\"",
};

/** Why the target is this size: the tier, and last week's figure it was scaled from (or what bounded it) */
export function challengeDifficultyNote(c: WeeklyChallenge, d: DescribeContext): string {
  const pct = Math.round(TIER_FACTOR[c.tier] * 100);
  const tier = `Mức ${TIER_LABEL[c.tier]} (+${TIER_XP[c.tier]} XP)`;
  // Below the usual target: roomFor bounded it when the week was picked
  if (c.target < targetFor(c.kind, c.tier, d.lastWeek)) {
    return `${tier}: vừa sức với ${ROOM_REASON[c.kind] ?? "gói học mỗi ngày và số ngày còn lại trong tuần"}.`;
  }
  if (d.lastWeek == null || d.lastWeek <= 0) return `${tier}: chưa có kết quả tuần trước nên dùng mục tiêu mặc định.`;
  return `${tier}: khoảng ${pct}% kết quả tuần trước của bạn (${d.lastWeek}), không thấp hơn mức tối thiểu.`;
}

export function challengeProgress(c: WeeklyChallenge, facts: WeekFacts): number {
  return Math.min(c.target, Math.max(0, facts[c.kind] ?? 0));
}

export function isDone(c: WeeklyChallenge, facts: WeekFacts): boolean {
  return challengeProgress(c, facts) >= c.target;
}

// ─── Storage and rewards ─────────────────────────────────────────────────────

const KIND_IDS = Object.keys(KINDS) as ChallengeKind[];

export function parseWeeklyState(raw: string | null): WeeklyState | null {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v.week !== "string" || !Array.isArray(v.challenges)) return null;
    const challenges = (v.challenges as WeeklyChallenge[]).filter(
      (c) => c && KIND_IDS.includes(c.kind) && TIERS.includes(c.tier) && Number.isFinite(c.target) && c.target > 0
    );
    if (challenges.length === 0) return null;
    const rewarded = Array.isArray(v.rewarded) ? (v.rewarded as ChallengeKind[]).filter((k) => KIND_IDS.includes(k)) : [];
    return { week: v.week, challenges, rewarded, bonusRewarded: !!v.bonusRewarded };
  } catch {
    return null;
  }
}

export function readWeeklyState(week: string): WeeklyState | null {
  try {
    const s = parseWeeklyState(localStorage.getItem(WEEKLY_KEY));
    return s && s.week === week ? s : null;
  } catch {
    return null;
  }
}

function writeWeeklyState(state: WeeklyState): void {
  try {
    localStorage.setItem(WEEKLY_KEY, JSON.stringify(state));
    persistKeyNow(WEEKLY_KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent(WEEKLY_EVENT));
}

/** This week's challenges, picked and saved on the first call of the week (or as another machine picked them) */
export function ensureWeeklyState(week: string, ctx: PickContext): WeeklyState {
  const stored = readWeeklyState(week);
  if (stored) return stored;
  const state: WeeklyState = { week, challenges: pickWeeklyChallenges(week, ctx), rewarded: [], bonusRewarded: false };
  writeWeeklyState(state);
  return state;
}

export interface WeeklyReward {
  kinds: ChallengeKind[];
  bonus: boolean;
  xp: number;
}

/** Pays every challenge just done (and the bonus once all are), once each. Returns what was paid now. */
export function claimWeeklyRewards(week: string, facts: WeekFacts): WeeklyReward | null {
  const state = readWeeklyState(week);
  if (!state) return null;
  const kinds = state.challenges.filter((c) => isDone(c, facts) && !state.rewarded.includes(c.kind)).map((c) => c.kind);
  const allDone = state.challenges.every((c) => isDone(c, facts));
  const bonus = allDone && !state.bonusRewarded;
  if (kinds.length === 0 && !bonus) return null;
  const xp =
    state.challenges.filter((c) => kinds.includes(c.kind)).reduce((sum, c) => sum + TIER_XP[c.tier], 0) + (bonus ? ALL_DONE_BONUS_XP : 0);
  writeWeeklyState({ ...state, rewarded: [...state.rewarded, ...kinds], bonusRewarded: state.bonusRewarded || bonus });
  awardXP(xp);
  return { kinds, bonus, xp };
}

// ─── Reading what the app recorded ───────────────────────────────────────────

/** The figures of one week [from, to) from the records */
export function weekFactsFrom(input: {
  from: Date;
  to: Date;
  logs: readonly ProgressLog[];
  /** Ids of the words of the level challenge */
  topicWordIds: ReadonlySet<string>;
  /** Ids of the words often forgotten (active or recovered) */
  forgottenIds: ReadonlySet<string>;
  activity: Record<string, number>;
  dailyGoal: number;
  intros: number;
  events: ReadonlyArray<{ type: string; at: string }>;
  grammarAttempts: readonly string[];
}): WeekFacts {
  const fromIso = input.from.toISOString();
  const toIso = input.to.toISOString();
  const inWeek = (iso: string) => iso >= fromIso && iso < toIso;
  const logs = input.logs.filter((l) => inWeek(l.timestamp));
  const right = logs.filter((l) => l.isScheduled && l.rating > 1);
  const facts: WeekFacts = { ...EMPTY_WEEK_FACTS };
  facts.review_correct = right.length;
  facts.level_correct = right.filter((l) => input.topicWordIds.has(l.wordId)).length;
  facts.forgotten = new Set(logs.filter((l) => l.rating > 1 && input.forgottenIds.has(l.wordId)).map((l) => l.wordId)).size;
  const fromDay = getLocalDateString(input.from);
  const toDay = getLocalDateString(input.to);
  for (const [day, n] of Object.entries(input.activity)) {
    if (day < fromDay || day >= toDay || !(n > 0)) continue;
    facts.active_days++;
    if (n >= input.dailyGoal) facts.goal_days++;
  }
  facts.new_words = input.intros;
  for (const e of input.events) {
    if (!inWeek(e.at)) continue;
    if (e.type === "focus_completed") facts.focus++;
    else if (e.type === "mastered") facts.mastered++;
    else if (e.type === "pronunciation_quiz") facts.pronunciation++;
  }
  facts.grammar = input.grammarAttempts.filter((iso) => inWeek(iso)).length;
  return facts;
}

/**
 * Cards (both directions) with a stability from NEAR_MASTERED_STABILITY_DAYS up to long-term memory, due before
 * `weekEnd`: only a scheduled answer moves a schedule, so a card not due this week can't cross this week.
 */
export function countNearMastered(words: readonly WordDetail[], weekEnd: Date): number {
  const end = weekEnd.getTime();
  let n = 0;
  for (const w of words) {
    if (isSuspended(w)) continue;
    for (const srs of [w.srs, w.srsProduction]) {
      const s = srs?.stability ?? 0;
      if (srs && s >= NEAR_MASTERED_STABILITY_DAYS && s < MATURE_STABILITY_DAYS && Date.parse(srs.next_review_date) < end) n++;
    }
  }
  return n;
}

export interface WeeklyData {
  thisWeek: WeekFacts;
  lastWeek: WeekFacts | null;
  context: PickContext;
}

/** This week's and last week's figures, and what the pick needs. Each source fails alone. */
export async function loadWeeklyData(words: readonly WordDetail[], now: Date = new Date()): Promise<WeeklyData> {
  const start = startOfWeek(now);
  const prevStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  const week = weekKey(now);
  const stored = readWeeklyState(week);
  const topic = stored?.challenges.find((c) => c.kind === "level_correct")?.topic ?? pickChallengeTopic([...words]);

  const countIntros = (from: Date, to: Date) =>
    getDatabase()
      .then((db) =>
        db.select<Array<{ n: number }>>(
          `SELECT COUNT(DISTINCT word_id) AS n FROM review_logs
           WHERE exercise_type = 'intro' AND timestamp >= $1 AND timestamp < $2 AND COALESCE(state_before, 0) = 0`,
          [from.toISOString(), to.toISOString()]
        )
      )
      .then((rows) => Number(rows[0]?.n) || 0)
      .catch(() => 0);

  const [logs, introsNow, introsPrev, events, forgotten, grammarAvailable, pronunciationAvailable] = await Promise.all([
    getReviewLogsSince(prevStart).catch(() => [] as ProgressLog[]),
    countIntros(start, end),
    countIntros(prevStart, start),
    getLearningEventsSince(prevStart, ["focus_completed", "mastered", "pronunciation_quiz"]).catch(() => []),
    loadForgottenWords(words, now).catch(() => null),
    initGrammarStorage()
      .then(() => getTodayGrammarPlan(now))
      .then((p) => p.pathLength > 0)
      .catch(() => false),
    loadPronunciationLessons()
      .then((l) => l.length > 0)
      .catch(() => false),
  ]);

  const topicWordIds = new Set(topic ? words.filter((w) => (w.topic || "General Tech").trim() === topic).map((w) => w.id) : []);
  const forgottenIds = new Set(forgotten ? [...forgotten.active, ...forgotten.recovered].map((e) => e.word.id) : []);
  const grammarAttempts = Object.values(getAllGrammarProgress())
    .map((p) => p.lastAttemptDate)
    .filter((d): d is string => !!d);
  const dailyGoal = getDailyGoal();
  const common = { logs, topicWordIds, forgottenIds, activity: getActivityLogs(), dailyGoal, events, grammarAttempts };
  const thisWeek = weekFactsFrom({ ...common, from: start, to: end, intros: introsNow });
  const prev = weekFactsFrom({ ...common, from: prevStart, to: start, intros: introsPrev });
  // A week with nothing done is no history: the floors apply
  const lastWeek = Object.values(prev).some((n) => n > 0) ? prev : null;

  return {
    thisWeek,
    lastWeek,
    context: {
      topic,
      forgottenCount: forgotten ? forgotten.active.length : 0,
      grammarAvailable,
      pronunciationAvailable,
      hasStudied: words.some((w) => (w.srs?.reps ?? 0) > 0),
      lastWeek,
      plan: { newCardsPerDay: getStudyLimits().newCardsPerDay, dailyGoal, focusMinutes: getFocusSettings().minutes },
      nearMastered: countNearMastered(words, end),
      daysLeft: 7 - ((now.getDay() + 6) % 7),
    },
  };
}
