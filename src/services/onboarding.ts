/**
 * First run: goal -> level -> minutes per day, then the first session right away.
 * Shown once, only to a learner with no words yet (existing users are marked done silently).
 */
import { saveStudyLimits } from "./srs";
import { setDailyGoal } from "./streak";
import { saveReminderSettings, type ReminderInterval } from "./reminderSettings";
import type { ReminderAnchor } from "./reminderMoments";
import type { GrammarLevel } from "@/types/grammar";
import { setUserOverrideLevel, syncProficiencyWithReminderSettings } from "./userProficiency";
import { setFoundationMode } from "./learnerProfile";
import { persistKeyNow } from "./storageBackup";

const DONE_KEY = "myenglish_onboarding_done_v1";

export type DailyMinutes = 5 | 10 | 15;

export interface DailyPlan {
  minutes: DailyMinutes;
  /** New words per day: each one costs about 8–10 future reviews, so this stays low */
  newCardsPerDay: number;
  maxSessionSize: number;
  /** Answers per day (about 4 per minute, goal at ~75%) */
  dailyGoal: number;
  reminderInterval: ReminderInterval;
}

export const DAILY_PLANS: Record<DailyMinutes, DailyPlan> = {
  5: { minutes: 5, newCardsPerDay: 3, maxSessionSize: 20, dailyGoal: 15, reminderInterval: 60 },
  10: { minutes: 10, newCardsPerDay: 5, maxSessionSize: 30, dailyGoal: 30, reminderInterval: 45 },
  15: { minutes: 15, newCardsPerDay: 8, maxSessionSize: 40, dailyGoal: 45, reminderInterval: 30 },
};

/**
 * When the learner wants to study. Chosen study times ("after lunch") replace frequent clock reminders:
 * with at least one, the clock only reminds every 2 hours as a fallback.
 */
export interface StudyTimes {
  anchors: ReminderAnchor[];
  /** Also at natural breaks: back at the computer, a meeting or full-screen app just ended */
  transitions: boolean;
}

export function applyDailyPlan(
  minutes: DailyMinutes,
  reminders: boolean,
  times: StudyTimes = { anchors: [], transitions: true }
): DailyPlan {
  const plan = DAILY_PLANS[minutes];
  saveStudyLimits({ newCardsPerDay: plan.newCardsPerDay, maxSessionSize: plan.maxSessionSize });
  setDailyGoal(plan.dailyGoal);
  const interval: ReminderInterval = times.anchors.length > 0 ? 120 : plan.reminderInterval;
  saveReminderSettings({
    enabled: reminders,
    intervalMinutes: reminders ? interval : 0,
    anchors: reminders ? times.anchors : [],
    contextMoments: times.transitions,
  });
  return plan;
}

/** "A0" = mất gốc: studied as A1 content, with foundation mode on (foundation grammar first) */
export type LevelChoice = "A0" | GrammarLevel;

export function applyLevelChoice(choice: LevelChoice): GrammarLevel {
  const level: GrammarLevel = choice === "A0" ? "A1" : choice;
  setUserOverrideLevel(level);
  syncProficiencyWithReminderSettings(level);
  setFoundationMode(choice === "A0");
  return level;
}

export function isOnboardingDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return true; // storage unavailable: never block the app behind the first-run screen
  }
}

export function markOnboardingDone(): void {
  try {
    localStorage.setItem(DONE_KEY, "1");
    persistKeyNow(DONE_KEY);
  } catch {}
}

/** Show the first-run flow once the word list has loaded and is empty; learners with words skip it for good */
export function shouldShowOnboarding(wordCount: number, loading: boolean): boolean {
  if (loading || isOnboardingDone()) return false;
  if (wordCount > 0) {
    markOnboardingDone();
    return false;
  }
  return true;
}
