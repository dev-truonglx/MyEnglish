/**
 * Learner-facing progress: the week in numbers, the weekly topic challenge and the summary shown
 * at the end of a popup session. Pure functions take the data in; the loaders read SQLite.
 */
import type { CardDirection, WordDetail } from "@/types/database";
import { getDatabase } from "./db";
import { getFSRSSettings, getStudyLimits } from "./srs";
import { awardXP } from "./smartReview";

/** A word counts as "nhớ chắc" (known for the long run) from this stability, in days */
export const MASTERED_STABILITY_DAYS = 21;

/** Retention needs this many review answers before it means anything (colours, advice) */
export const MIN_RETENTION_SAMPLE = 20;

/**
 * The word had at least one real answer: a word only marked "Đã biết" (its single log is 'known', which
 * `stats` leaves out) is not counted as studied in levels, coverage or statistics. Words without `stats`
 * (built in memory) count as reviewed.
 */
export function hasRealReview(w: WordDetail): boolean {
  return (w.stats?.totalAttempts ?? 1) > 0;
}

export interface ProgressLog {
  wordId: string;
  rating: number; // FSRS grade, 1 = Again (forgotten)
  isScheduled: boolean; // first answer of a due card (updates FSRS); false = practice / retry
  timestamp: string;
  direction?: CardDirection;
  /** FSRS state of the card just before the answer (2 = Review); null for logs written before v7 */
  stateBefore?: number | null;
  /** Retrievability FSRS predicted at the answer; null for new cards and old logs */
  rPredicted?: number | null;
  stabilityBefore?: number | null;
  responseTimeMs?: number;
}

/** Monday 00:00 (local) of the week containing `now` */
export function startOfWeek(now: Date = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function weekKey(now: Date = new Date()): string {
  const d = startOfWeek(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The stats screen opens several cards at once, each wanting the logs of a week, two weeks or a month */
const SHARED_LOG_DAYS = 30;
let loadingLogs: { since: number; promise: Promise<ProgressLog[]> } | null = null;

/**
 * Logs since `since`. Calls made while a load is in flight share it: a call within the last 30 days loads
 * all 30 once and each caller takes its own slice (nothing is cached after the load settles, so a log
 * written a moment later is always seen).
 */
export async function getReviewLogsSince(since: Date): Promise<ProgressLog[]> {
  const from = since.getTime();
  const sinceIso = since.toISOString();
  if (!loadingLogs || loadingLogs.since > from) {
    // At least the last 30 days; a caller asking for more loads what it needs
    const start = Math.min(from, Date.now() - SHARED_LOG_DAYS * 24 * 60 * 60 * 1000);
    const entry: { since: number; promise: Promise<ProgressLog[]> } = {
      since: start,
      promise: queryReviewLogsSince(new Date(start)).finally(() => {
        if (loadingLogs === entry) loadingLogs = null;
      }),
    };
    loadingLogs = entry;
  }
  const logs = await loadingLogs.promise;
  return logs.filter((l) => l.timestamp >= sinceIso);
}

async function queryReviewLogsSince(since: Date): Promise<ProgressLog[]> {
  const db = await getDatabase();
  // Introductions, words marked "Đã biết" and implicit credits (is_scheduled = 2) are not answers the learner gave
  const rows = await db.select<
    Array<{
      word_id: string;
      rating: number;
      is_scheduled: number | null;
      timestamp: string;
      direction: string | null;
      state_before: number | null;
      r_predicted: number | null;
      stability_before: number | null;
      response_time_ms: number | null;
    }>
  >(
    `SELECT word_id, rating, is_scheduled, timestamp, direction, state_before, r_predicted, stability_before, response_time_ms
     FROM review_logs
     WHERE timestamp >= $1 AND exercise_type NOT IN ('intro', 'known') AND COALESCE(is_scheduled, 1) != 2
     ORDER BY timestamp`,
    [since.toISOString()]
  );
  return rows.map((r) => ({
    wordId: r.word_id,
    rating: r.rating,
    isScheduled: r.is_scheduled === null || r.is_scheduled === 1,
    timestamp: r.timestamp,
    direction: (r.direction as CardDirection) || "recognition",
    stateBefore: r.state_before,
    rPredicted: r.r_predicted,
    stabilityBefore: r.stability_before,
    responseTimeMs: r.response_time_ms ?? 0,
  }));
}

// ─── True retention & calibration ────────────────────────────────────────────

/** Scheduled answers to cards that were in Review state: the only answers comparable to the target retention */
export function reviewStateAnswers(logs: ProgressLog[]): ProgressLog[] {
  return logs.filter((l) => l.isScheduled && l.stateBefore === 2);
}

function passRate(logs: ProgressLog[]): number | null {
  return logs.length > 0 ? logs.filter((l) => l.rating > 1).length / logs.length : null;
}

export interface RetentionStats {
  /** Share of Review-state cards remembered (not Again) — what FSRS aims at `targetRetention` */
  trueRetention: number | null;
  count: number;
  recognition: { retention: number | null; count: number };
  production: { retention: number | null; count: number };
  /** Young (stability < 21 days) vs mature cards: young ones usually reveal a too-optimistic first interval */
  young: { retention: number | null; count: number };
  mature: { retention: number | null; count: number };
  targetRetention: number;
}

export function computeRetention(logs: ProgressLog[], targetRetention: number): RetentionStats {
  const review = reviewStateAnswers(logs);
  const pick = (f: (l: ProgressLog) => boolean) => {
    const sub = review.filter(f);
    return { retention: passRate(sub), count: sub.length };
  };
  return {
    trueRetention: passRate(review),
    count: review.length,
    recognition: pick((l) => (l.direction ?? "recognition") === "recognition"),
    production: pick((l) => l.direction === "production"),
    young: pick((l) => (l.stabilityBefore ?? 0) < MASTERED_STABILITY_DAYS),
    mature: pick((l) => (l.stabilityBefore ?? 0) >= MASTERED_STABILITY_DAYS),
    targetRetention,
  };
}

export interface CalibrationBin {
  /** Bin label, e.g. "85–90%" */
  label: string;
  from: number;
  to: number;
  count: number;
  /** Mean predicted retrievability of the answers in the bin */
  predicted: number;
  /** Share actually remembered */
  actual: number;
}

const CALIBRATION_EDGES = [0, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0001];

/**
 * Predicted vs actual recall, grouped by the retrievability FSRS predicted. When the model fits this
 * learner, "actual" follows "predicted" in every bin; actual consistently below predicted means the
 * intervals are too long for this learner (and the reverse), which the optimizer would correct.
 */
export function computeCalibration(logs: ProgressLog[]): CalibrationBin[] {
  const review = reviewStateAnswers(logs).filter((l) => l.rPredicted != null);
  const bins: CalibrationBin[] = [];
  for (let i = 0; i < CALIBRATION_EDGES.length - 1; i++) {
    const from = CALIBRATION_EDGES[i];
    const to = CALIBRATION_EDGES[i + 1];
    const inBin = review.filter((l) => (l.rPredicted as number) >= from && (l.rPredicted as number) < to);
    if (inBin.length === 0) continue;
    const pct = (x: number) => Math.round(Math.min(1, x) * 100);
    bins.push({
      label: i === 0 ? `< ${pct(to)}%` : to > 1 ? `≥ ${pct(from)}%` : `${pct(from)}–${pct(to)}%`,
      from,
      to: Math.min(1, to),
      count: inBin.length,
      predicted: inBin.reduce((sum, l) => sum + (l.rPredicted as number), 0) / inBin.length,
      actual: inBin.filter((l) => l.rating > 1).length / inBin.length,
    });
  }
  return bins;
}

export interface LearningInsights {
  retention: RetentionStats;
  calibration: CalibrationBin[];
  /** Minutes spent answering per active day over the period (answer time only: intros, grammar, sound not counted) */
  minutesPerActiveDay: number;
  activeDays: number;
  days: number;
}

export async function loadLearningInsights(days: number = 30, now: Date = new Date()): Promise<LearningInsights> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const logs = await getReviewLogsSince(since);
  const activeDays = new Set(logs.map((l) => new Date(l.timestamp).toDateString())).size;
  const totalMs = logs.reduce((sum, l) => sum + Math.min(l.responseTimeMs ?? 0, 120000), 0);
  return {
    retention: computeRetention(logs, getFSRSSettings().requestRetention),
    calibration: computeCalibration(logs),
    minutesPerActiveDay: activeDays > 0 ? totalMs / 60000 / activeDays : 0,
    activeDays,
    days,
  };
}

// ─── Workload forecast ───────────────────────────────────────────────────────

export interface ForecastDay {
  date: string; // YYYY-MM-DD local
  reviews: number;
}

export interface WorkloadForecast {
  days: ForecastDay[];
  /** Reviews already due (overdue included) today */
  dueNow: number;
  /** Average of the next 7 days, today (with its overdue pile) included */
  averagePerDay: number;
  /** Average of the 7 days after today: the regular load, without a pile left by a break */
  upcomingPerDay: number;
  maxSessionSize: number;
  newCardsPerDay: number;
  /** The regular load (upcomingPerDay) is above one session a day: adding new words will make it worse */
  overloaded: boolean;
}

function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Bucket review due dates (studied cards, both directions) into local days; overdue counts for today. */
export function bucketForecast(dueDates: string[], horizonDays: number, now: Date = new Date()): ForecastDay[] {
  const days: ForecastDay[] = [];
  const index = new Map<string, number>();
  for (let i = 0; i < horizonDays; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    index.set(localKey(d), days.length);
    days.push({ date: localKey(d), reviews: 0 });
  }
  const todayKey = days[0]?.date;
  for (const iso of dueDates) {
    const due = new Date(iso);
    if (isNaN(due.getTime())) continue;
    const key = due.getTime() <= now.getTime() ? todayKey : localKey(due);
    const i = key ? index.get(key) : undefined;
    if (i !== undefined) days[i].reviews++;
  }
  return days;
}

/** Reviews due per day for the next `horizonDays` days (new words excluded: they start when introduced). */
export async function loadWorkloadForecast(horizonDays: number = 30, now: Date = new Date()): Promise<WorkloadForecast> {
  const db = await getDatabase();
  const until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + horizonDays).toISOString();
  const rows = await db.select<Array<{ next_review_date: string }>>(
    `SELECT s.next_review_date FROM srs_reviews s JOIN words w ON w.id = s.word_id
       WHERE COALESCE(s.reps, 0) > 0 AND COALESCE(w.suspended, 0) = 0 AND s.next_review_date < $1
     UNION ALL
     SELECT p.next_review_date FROM srs_production p JOIN words w ON w.id = p.word_id
       WHERE COALESCE(p.reps, 0) > 0 AND COALESCE(w.suspended, 0) = 0 AND p.next_review_date < $1`,
    [until]
  );
  const days = bucketForecast(rows.map((r) => r.next_review_date), horizonDays, now);
  const limits = getStudyLimits();
  const average = (list: ForecastDay[]) => (list.length > 0 ? list.reduce((sum, d) => sum + d.reviews, 0) / list.length : 0);
  const averagePerDay = average(days.slice(0, 7));
  // Overdue reviews all land on today: after a break they would read as a lasting overload
  const upcomingPerDay = average(days.slice(1, 8));
  return {
    days,
    dueNow: days[0]?.reviews ?? 0,
    averagePerDay,
    upcomingPerDay,
    maxSessionSize: limits.maxSessionSize,
    newCardsPerDay: limits.newCardsPerDay,
    overloaded: upcomingPerDay > limits.maxSessionSize,
  };
}

// ─── Week in numbers ─────────────────────────────────────────────────────────

export interface WeeklySummary {
  answers: number; // every answer this week, practice included
  wordsStudied: number; // distinct words
  activeDays: number;
  /** Share of Review-state cards remembered this week (scheduled answers not graded Again); null = no data */
  retention: number | null;
  /** Number of answers the retention is computed from */
  reviewAnswers: number;
  targetRetention: number;
  masteredWords: number; // stability >= MASTERED_STABILITY_DAYS now, after a real review
}

export function summarizeWeek(logs: ProgressLog[], words: WordDetail[], targetRetention: number): WeeklySummary {
  const scheduled = logs.filter((l) => l.isScheduled);
  const days = new Set(
    logs.map((l) => {
      const d = new Date(l.timestamp);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );
  return {
    answers: logs.length,
    wordsStudied: new Set(logs.map((l) => l.wordId)).size,
    activeDays: days.size,
    // True retention: scheduled answers to cards in Review state (new / learning cards are not
    // comparable with the target). Logs written before v7 have no state and fall back to all scheduled.
    retention: (() => {
      const review = reviewStateAnswers(logs);
      const base = review.length > 0 ? review : scheduled.filter((l) => l.stateBefore == null);
      return base.length > 0 ? base.filter((l) => l.rating > 1).length / base.length : null;
    })(),
    reviewAnswers: reviewStateAnswers(logs).length || scheduled.filter((l) => l.stateBefore == null).length,
    targetRetention,
    masteredWords: words.filter((w) => (w.srs.stability ?? 0) >= MASTERED_STABILITY_DAYS && hasRealReview(w)).length,
  };
}

export async function loadWeeklySummary(words: WordDetail[], now: Date = new Date()): Promise<WeeklySummary> {
  const logs = await getReviewLogsSince(startOfWeek(now));
  return summarizeWeek(logs, words, getFSRSSettings().requestRetention);
}

// ─── Weekly topic challenge ──────────────────────────────────────────────────

const CHALLENGE_KEY = "myenglish_topic_challenge_v1";
export const CHALLENGE_XP = 50;
const CHALLENGE_MIN_WORDS = 3;

export interface TopicChallenge {
  week: string;
  topic: string;
  target: number; // correct answers on words of the topic this week
  progress: number;
  completed: boolean;
  rewarded: boolean;
}

interface StoredChallenge {
  week: string;
  topic: string;
  rewarded: boolean;
}

function topicName(w: WordDetail): string {
  return (w.topic || "General Tech").trim();
}

/** Topic with the most words not yet mastered (at least CHALLENGE_MIN_WORDS words); ties by name */
export function pickChallengeTopic(words: WordDetail[]): string | null {
  const open = new Map<string, number>();
  const total = new Map<string, number>();
  for (const w of words) {
    const t = topicName(w);
    total.set(t, (total.get(t) ?? 0) + 1);
    if ((w.srs.stability ?? 0) < MASTERED_STABILITY_DAYS) open.set(t, (open.get(t) ?? 0) + 1);
  }
  const candidates = Array.from(open.entries())
    .filter(([t, n]) => n > 0 && (total.get(t) ?? 0) >= CHALLENGE_MIN_WORDS)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return candidates[0]?.[0] ?? null;
}

/** About two correct answers per word of the topic, between 10 and 30 */
export function challengeTarget(topicWordCount: number): number {
  return Math.max(10, Math.min(30, topicWordCount * 2));
}

/**
 * This week's challenge: "answer N questions right on topic X". The topic is chosen once per week
 * (kept in localStorage) so it does not change while the learner works on it.
 */
export function getTopicChallenge(words: WordDetail[], weekLogs: ProgressLog[], now: Date = new Date()): TopicChallenge | null {
  const week = weekKey(now);
  let stored: StoredChallenge | null = null;
  try {
    const raw = JSON.parse(localStorage.getItem(CHALLENGE_KEY) || "null");
    if (raw && raw.week === week && typeof raw.topic === "string") stored = raw;
  } catch {}

  const topicWords = (t: string) => words.filter((w) => topicName(w) === t);
  if (!stored || topicWords(stored.topic).length === 0) {
    const topic = pickChallengeTopic(words);
    if (!topic) return null;
    stored = { week, topic, rewarded: false };
    try {
      localStorage.setItem(CHALLENGE_KEY, JSON.stringify(stored));
    } catch {}
  }

  const ids = new Set(topicWords(stored.topic).map((w) => w.id));
  const target = challengeTarget(ids.size);
  // Scheduled answers only: practice can't be crammed into the challenge in one sitting
  const progress = weekLogs.filter((l) => l.isScheduled && ids.has(l.wordId) && l.rating > 1).length;
  return { week, topic: stored.topic, target, progress: Math.min(progress, target), completed: progress >= target, rewarded: stored.rewarded };
}

/** Award the challenge XP once per week. Returns true when it was awarded by this call. */
export function claimTopicChallengeReward(challenge: TopicChallenge): boolean {
  if (!challenge.completed || challenge.rewarded) return false;
  try {
    const raw = JSON.parse(localStorage.getItem(CHALLENGE_KEY) || "null");
    if (!raw || raw.week !== challenge.week || raw.rewarded) return false;
    localStorage.setItem(CHALLENGE_KEY, JSON.stringify({ ...raw, rewarded: true }));
  } catch {
    return false;
  }
  awardXP(CHALLENGE_XP);
  return true;
}

// ─── Popup session summary ───────────────────────────────────────────────────

export interface SessionResult {
  key: string;
  label: string; // word or grammar lesson
  correct: boolean; // first answer
  nextReview: string | null; // when the schedule changed (ISO)
  /** The answer took the word into long-term memory, or rescued a fading one */
  milestone?: "mastered" | "rescued" | null;
}

export interface SessionSummary {
  total: number;
  correct: number;
  /** Wrong first, then soonest review first; `again` is "10 phút" / "3 ngày" (empty when not scheduled) */
  items: Array<SessionResult & { again: string }>;
}

/** "10 phút", "3 giờ", "4 ngày", "2 tháng", "1.5 năm" until `due` */
export function formatAgain(due: Date, now: Date = new Date()): string {
  const mins = Math.max(1, Math.round((due.getTime() - now.getTime()) / 60000));
  if (mins < 60) return `${mins} phút`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ngày`;
  if (days < 365) return `${Math.round(days / 30)} tháng`;
  return `${(days / 365).toFixed(1)} năm`;
}

export function summarizeSession(results: SessionResult[], now: Date = new Date()): SessionSummary {
  const items = results
    .map((r) => ({ ...r, again: r.nextReview ? formatAgain(new Date(r.nextReview), now) : "" }))
    .sort(
      (a, b) =>
        Number(a.correct) - Number(b.correct) ||
        (a.nextReview ? new Date(a.nextReview).getTime() : Infinity) - (b.nextReview ? new Date(b.nextReview).getTime() : Infinity)
    );
  return { total: results.length, correct: results.filter((r) => r.correct).length, items };
}

// ─── Today screen: level ETA, last week, the daily goal ──────────────────────

/**
 * New words a learner really gets per day: the daily budget is shared with new recall cards
 * (splitNewCardBudget), so after the first week about half of it goes to new words.
 */
export function estimateNewWordsPerDay(newCardsPerDay: number): number {
  return Math.max(1, Math.ceil(Math.max(0, newCardsPerDay) / 2));
}

/**
 * Days until every word of a level has been met, at `wordsPerDay` new words a day of which the level gets
 * `share` (its part of the level mix). 0 = every word met.
 */
export function levelEtaDays(remaining: number, wordsPerDay: number, share: number = 1): number {
  if (remaining <= 0) return 0;
  const rate = Math.max(0.1, wordsPerDay * Math.min(1, Math.max(0.01, share)));
  return Math.ceil(remaining / rate);
}

/** A "mastered" learning event (a card crossing MATURE_STABILITY_DAYS), as learningEvents stores it */
export interface MasteredEvent {
  at: string;
  wordId?: string | null;
  direction?: CardDirection | null;
}

export interface LastWeekSummary {
  /** Monday of last week (YYYY-MM-DD) */
  week: string;
  /** Words whose recognition card reached long-term memory ("Nhớ lâu") last week */
  rememberedLong: number;
  /** The same, the week before */
  rememberedLongBefore: number;
  /** Days of last week with any study (0–7) */
  activeDays: number;
  /** Share of Review-state answers remembered; null below MIN_RETENTION_SAMPLE answers */
  retention: number | null;
  reviewAnswers: number;
  /** One piece of advice */
  suggestion: string;
}

/** Words (recognition cards, one per word) that reached long-term memory in [from, to) */
function rememberedLongBetween(events: MasteredEvent[], from: Date, to: Date): number {
  const ids = new Set<string>();
  for (const e of events) {
    if ((e.direction ?? "recognition") !== "recognition") continue;
    const t = new Date(e.at).getTime();
    if (t >= from.getTime() && t < to.getTime()) ids.add(e.wordId ?? e.at);
  }
  return ids.size;
}

/** The single piece of advice of the weekly summary */
export function weeklySuggestion(s: { activeDays: number; retention: number | null; targetRetention: number }): string {
  if (s.activeDays <= 3) {
    return "Thử chọn một giờ học cố định, ví dụ sau bữa trưa: mỗi ngày 5 phút đều đặn giữ từ tốt hơn học dồn một buổi.";
  }
  if (s.retention !== null && s.retention < s.targetRetention - 0.1) {
    return "Tuần qua nhớ hơi vất vả, chuyện rất bình thường. Vài ngày tới cứ ôn trước, học ít từ mới hơn một chút là từ sẽ chắc lại.";
  }
  if (s.activeDays >= 6 && (s.retention === null || s.retention >= s.targetRetention - 0.03)) {
    return "Nhịp học rất đều! Nếu thấy nhẹ, bạn có thể tăng thêm vài từ mới mỗi ngày.";
  }
  return "Giữ nhịp này nhé: ngày nào cũng một chút là đủ để từ vào trí nhớ dài hạn.";
}

/**
 * Last week (Monday to Sunday before the current week) in a few real numbers: words that reached long-term
 * memory (and the week before, to compare), days studied, true retention when there are enough answers.
 * null when nothing was studied last week.
 */
export function summarizeLastWeek(input: {
  mastered: MasteredEvent[];
  logs: ProgressLog[];
  /** Answers per local day ("YYYY-MM-DD" -> count), as the streak keeps them */
  activity: Record<string, number>;
  targetRetention: number;
  now?: Date;
}): LastWeekSummary | null {
  const now = input.now ?? new Date();
  const thisWeek = startOfWeek(now);
  const lastWeek = new Date(thisWeek.getFullYear(), thisWeek.getMonth(), thisWeek.getDate() - 7);
  const weekBefore = new Date(thisWeek.getFullYear(), thisWeek.getMonth(), thisWeek.getDate() - 14);

  let activeDays = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(lastWeek.getFullYear(), lastWeek.getMonth(), lastWeek.getDate() + i);
    if ((input.activity[localKey(d)] ?? 0) > 0) activeDays++;
  }
  const lastLogs = input.logs.filter((l) => {
    const t = new Date(l.timestamp).getTime();
    return t >= lastWeek.getTime() && t < thisWeek.getTime();
  });
  const rememberedLong = rememberedLongBetween(input.mastered, lastWeek, thisWeek);
  if (activeDays === 0 && lastLogs.length === 0 && rememberedLong === 0) return null;

  const review = reviewStateAnswers(lastLogs);
  const retention = review.length >= MIN_RETENTION_SAMPLE ? passRate(review) : null;
  return {
    week: localKey(lastWeek),
    rememberedLong,
    rememberedLongBefore: rememberedLongBetween(input.mastered, weekBefore, lastWeek),
    activeDays,
    retention,
    reviewAnswers: review.length,
    suggestion: weeklySuggestion({ activeDays, retention, targetRetention: input.targetRetention }),
  };
}

export async function loadLastWeekSummary(now: Date = new Date()): Promise<LastWeekSummary | null> {
  const thisWeek = startOfWeek(now);
  const weekBefore = new Date(thisWeek.getFullYear(), thisWeek.getMonth(), thisWeek.getDate() - 14);
  const lastWeek = new Date(thisWeek.getFullYear(), thisWeek.getMonth(), thisWeek.getDate() - 7);
  const [{ getLearningEventsSince }, { getActivityLogs }] = await Promise.all([import("./learningEvents"), import("./streak")]);
  const [mastered, logs] = await Promise.all([getLearningEventsSince(weekBefore, ["mastered"]), getReviewLogsSince(lastWeek)]);
  return summarizeLastWeek({
    mastered,
    logs,
    activity: getActivityLogs(),
    targetRetention: getFSRSSettings().requestRetention,
    now,
  });
}

/**
 * Confetti at the end of a session only when this session made the daily goal reached for the first time
 * today: not for every session, not for an extra card once the goal was already met.
 */
export function shouldCelebrateDailyGoal(s: {
  reachedAtStart: boolean;
  reachedNow: boolean;
  /** Local day (YYYY-MM-DD) of the last celebration, if any */
  celebratedOn: string | null;
  today: string;
}): boolean {
  return s.reachedNow && !s.reachedAtStart && s.celebratedOn !== s.today;
}
