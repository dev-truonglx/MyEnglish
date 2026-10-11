/**
 * Pronunciation lessons (src/data/pronunciation.ts): progress per lesson, kept in localStorage. A lesson
 * counts as done once its listening quiz was passed (PASS_RATIO); quizzes are logged as learning events.
 * Pronunciation never touches the FSRS schedule: it is about hearing and saying, not recalling meaning.
 * It does count for the day: every quiz question or word said aloud is one answer toward the daily goal and
 * the streak, and the day of the last practice is kept so Today can tick "1 bài phát âm" off.
 */
import type { PronunciationLesson } from "@/types/pronunciation";
import { logLearningEvent } from "./learningEvents";
import { persistKeyNow } from "./storageBackup";
import { checkAndUnlockAchievements } from "./achievements";
import { getLocalDateString, recordDailyActivity } from "./streak";

const PROGRESS_KEY = "myenglish_pronunciation_v1";
/** Local day (YYYY-MM-DD) the learner last practised pronunciation */
const LAST_PRACTICE_DAY_KEY = "myenglish_pronunciation_last_day_v1";
export const PRONUNCIATION_PASS_RATIO = 0.8;

export interface PronunciationLessonProgress {
  best: number;
  total: number;
  attempts: number;
  /** First time the quiz was passed */
  passedAt?: string;
}

export type PronunciationProgress = Record<string, PronunciationLessonProgress>;

export async function loadPronunciationLessons(): Promise<PronunciationLesson[]> {
  const { PRONUNCIATION_LESSONS } = await import("@/data/pronunciation");
  return [...PRONUNCIATION_LESSONS].sort((a, b) => a.order - b.order);
}

export function getPronunciationProgress(): PronunciationProgress {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Remember today as a practice day and count `count` answers toward the daily goal and the streak */
function notePractice(count: number, now: Date): void {
  try {
    localStorage.setItem(LAST_PRACTICE_DAY_KEY, getLocalDateString(now));
    persistKeyNow(LAST_PRACTICE_DAY_KEY);
  } catch {}
  if (count > 0) recordDailyActivity(count);
}

/** The learner practised pronunciation today (a quiz finished or a word said aloud) */
export function pronunciationPracticedToday(now: Date = new Date()): boolean {
  try {
    return localStorage.getItem(LAST_PRACTICE_DAY_KEY) === getLocalDateString(now);
  } catch {
    return false;
  }
}

/** A word said aloud and self-rated ("Đọc to theo"): logged, never graded, counts as one answer today */
export function recordSayAloud(lessonId: string, text: string, ok: boolean, now: Date = new Date()): void {
  logLearningEvent("say_aloud", { meta: { lessonId, text, ok } });
  notePractice(1, now);
  try {
    window.dispatchEvent(new CustomEvent("myenglish-pronunciation-updated"));
  } catch {}
}

export function isLessonPassed(p: PronunciationLessonProgress | undefined): boolean {
  return !!p && p.total > 0 && p.best / p.total >= PRONUNCIATION_PASS_RATIO;
}

/** Save a finished quiz (the best score is kept) and return whether the lesson is now passed */
export function recordPronunciationQuiz(lessonId: string, correct: number, total: number, now: Date = new Date()): boolean {
  const all = getPronunciationProgress();
  const prev = all[lessonId];
  const next: PronunciationLessonProgress = {
    best: Math.max(prev?.best ?? 0, correct),
    total,
    attempts: (prev?.attempts ?? 0) + 1,
    passedAt: prev?.passedAt,
  };
  if (!next.passedAt && isLessonPassed(next)) next.passedAt = now.toISOString();
  all[lessonId] = next;
  // Each question answered is one sentence practised
  notePractice(total, now);
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
    persistKeyNow(PROGRESS_KEY);
    window.dispatchEvent(new CustomEvent("myenglish-pronunciation-updated"));
  } catch {}
  logLearningEvent("pronunciation_quiz", { meta: { lessonId, correct, total } });
  const passed = isLessonPassed(next);
  if (passed) checkAndUnlockAchievements({ pronunciationPassed: true });
  return passed;
}

/** The first lesson (in order) not passed yet; null when all are passed */
export function nextPronunciationLesson(
  lessons: PronunciationLesson[],
  progress: PronunciationProgress = getPronunciationProgress()
): PronunciationLesson | null {
  return lessons.find((l) => !isLessonPassed(progress[l.id])) ?? null;
}

export function passedLessonCount(progress: PronunciationProgress = getPronunciationProgress()): number {
  return Object.values(progress).filter(isLessonPassed).length;
}
