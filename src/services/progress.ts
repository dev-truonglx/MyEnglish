/**
 * Learner-facing progress: the week in numbers, the weekly topic challenge and the summary shown
 * at the end of a popup session. Pure functions take the data in; the loaders read SQLite.
 */
import type { WordDetail } from "@/types/database";
import { getDatabase } from "./db";
import { getFSRSSettings } from "./srs";
import { awardXP } from "./smartReview";

/** A word counts as "nhớ chắc" (known for the long run) from this stability, in days */
export const MASTERED_STABILITY_DAYS = 21;

export interface ProgressLog {
  wordId: string;
  rating: number; // FSRS grade, 1 = Again (forgotten)
  isScheduled: boolean; // first answer of a due card (updates FSRS); false = practice / retry
  timestamp: string;
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

export async function getReviewLogsSince(since: Date): Promise<ProgressLog[]> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ word_id: string; rating: number; is_scheduled: number | null; timestamp: string }>>(
    `SELECT word_id, rating, is_scheduled, timestamp FROM review_logs WHERE timestamp >= $1 ORDER BY timestamp`,
    [since.toISOString()]
  );
  return rows.map((r) => ({
    wordId: r.word_id,
    rating: r.rating,
    isScheduled: r.is_scheduled === null || r.is_scheduled === 1,
    timestamp: r.timestamp,
  }));
}

// ─── Week in numbers ─────────────────────────────────────────────────────────

export interface WeeklySummary {
  answers: number; // every answer this week, practice included
  wordsStudied: number; // distinct words
  activeDays: number;
  /** Share of due cards remembered this week (scheduled answers not graded Again); null = no data */
  retention: number | null;
  targetRetention: number;
  masteredWords: number; // stability >= MASTERED_STABILITY_DAYS now
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
    retention: scheduled.length > 0 ? scheduled.filter((l) => l.rating > 1).length / scheduled.length : null,
    targetRetention,
    masteredWords: words.filter((w) => (w.srs.stability ?? 0) >= MASTERED_STABILITY_DAYS).length,
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
  const progress = weekLogs.filter((l) => ids.has(l.wordId) && l.rating > 1).length;
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
