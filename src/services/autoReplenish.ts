import type { WordDetail } from "@/types/database";
import type { GrammarLevel } from "@/types/grammar";
import { GRAMMAR_LESSONS } from "@/data/grammarData";
import { getAllGrammarProgress, saveCustomGrammarExercises } from "./grammarService";
import { assessUserProficiency } from "./userProficiency";
import { generateVocabularyRecommendationsAI, generateGrammarExercisesWithGemini, type VocabularyRecommendation } from "./ai";
import { pipeline } from "./pipeline";
import { triggerDesktopNotification } from "./srs";
import { calculateStreakAndGoal } from "./streak";
import { getTodayReviewCount } from "./smartReview";

const AUTO_REPLENISH_SETTINGS_KEY = "myenglish_auto_replenish_settings_v1";

export interface AutoReplenishSummary {
  date: string;
  timestamp: number;
  level: GrammarLevel;
  words: string[];
  grammarTopic?: string;
  questionCount?: number;
}

export interface AutoReplenishSettings {
  enabled: boolean;
  wordsPerBatch: number;              // 3 or 5
  minDaysWithoutNewWords: number;      // e.g. 2 days
  autoGenerateGrammar: boolean;
  lastReplenishDate: string | null;   // YYYY-MM-DD
  lastReplenishSummary: AutoReplenishSummary | null;
}

export const DEFAULT_AUTO_REPLENISH_SETTINGS: AutoReplenishSettings = {
  enabled: true,
  wordsPerBatch: 3,
  minDaysWithoutNewWords: 2,
  autoGenerateGrammar: true,
  lastReplenishDate: null,
  lastReplenishSummary: null,
};

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getAutoReplenishSettings(): AutoReplenishSettings {
  try {
    const raw = localStorage.getItem(AUTO_REPLENISH_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_AUTO_REPLENISH_SETTINGS };
    return { ...DEFAULT_AUTO_REPLENISH_SETTINGS, ...JSON.parse(raw) };
  } catch (err) {
    console.warn("Failed to load auto-replenish settings:", err);
    return { ...DEFAULT_AUTO_REPLENISH_SETTINGS };
  }
}

export function saveAutoReplenishSettings(partial: Partial<AutoReplenishSettings>): AutoReplenishSettings {
  try {
    const current = getAutoReplenishSettings();
    const updated: AutoReplenishSettings = {
      ...current,
      ...partial,
    };
    localStorage.setItem(AUTO_REPLENISH_SETTINGS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("myenglish-auto-replenish-settings-updated", { detail: updated }));
    return updated;
  } catch (err) {
    console.warn("Failed to save auto-replenish settings:", err);
    return { ...DEFAULT_AUTO_REPLENISH_SETTINGS, ...partial };
  }
}

export interface EligibilityResult {
  isEligible: boolean;
  reason: string;
  effectiveLevel: GrammarLevel;
  daysSinceLastNewWord: number;
  streak: number;
  unlearnedNewWordsCount: number;
}

/**
 * Check if the user meets all criteria for auto-replenishing vocabulary & grammar:
 * 1. User has been learning consistently (streak >= 1 or has reviewed today or due words are 0)
 * 2. User has NOT added any new words for >= minDaysWithoutNewWords (or new words pool is depleted)
 * 3. Has NOT already auto-replenished today
 */
export async function checkAutoReplenishEligibility(words: WordDetail[]): Promise<EligibilityResult> {
  const settings = getAutoReplenishSettings();
  const profile = assessUserProficiency(words);
  const streakStats = calculateStreakAndGoal(words);
  const today = getTodayStr();

  // 1. Feature disabled check
  if (!settings.enabled) {
    return {
      isEligible: false,
      reason: "Tính năng tự động bổ sung đang tắt.",
      effectiveLevel: profile.effectiveLevel,
      daysSinceLastNewWord: 0,
      streak: streakStats.currentStreak,
      unlearnedNewWordsCount: 0,
    };
  }

  // 2. Already replenished today check
  if (settings.lastReplenishDate === today) {
    return {
      isEligible: false,
      reason: "Hôm nay hệ thống đã tự động bổ sung bài học mới rồi.",
      effectiveLevel: profile.effectiveLevel,
      daysSinceLastNewWord: 0,
      streak: streakStats.currentStreak,
      unlearnedNewWordsCount: 0,
    };
  }

  // 3. User activity check (Active learner)
  let todayReviews = 0;
  try {
    todayReviews = await getTodayReviewCount();
  } catch {}

  const isPracticingRegularly =
    streakStats.currentStreak >= 1 || todayReviews > 0 || streakStats.goalReached;

  if (!isPracticingRegularly && words.length > 5) {
    return {
      isEligible: false,
      reason: "Bạn cần hoàn thành ít nhất 1 buổi ôn tập hoặc duy trì chuỗi học để kích hoạt tự động.",
      effectiveLevel: profile.effectiveLevel,
      daysSinceLastNewWord: 0,
      streak: streakStats.currentStreak,
      unlearnedNewWordsCount: 0,
    };
  }

  // 4. Inactivity in adding new words check
  // Count how many words are in "New" state (state === 0 or no reps)
  const unlearnedNewWords = words.filter(
    (w) =>
      (w.srs.state === undefined || (w.srs.state as number) === 0) &&
      (!w.srs.reps || w.srs.reps === 0)
  );

  let newestCreatedAt = 0;
  for (const w of words) {
    const t = new Date(w.created_at).getTime();
    if (!isNaN(t) && t > newestCreatedAt) {
      newestCreatedAt = t;
    }
  }

  const msSinceLastNewWord = Date.now() - newestCreatedAt;
  const daysSinceLastNewWord = newestCreatedAt > 0 ? Math.floor(msSinceLastNewWord / (24 * 60 * 60 * 1000)) : 99;

  // Criteria: user has not added new words for >= configured days OR has 0 unlearned new words
  const isNoNewWordsAdded =
    daysSinceLastNewWord >= settings.minDaysWithoutNewWords || unlearnedNewWords.length === 0;

  if (!isNoNewWordsAdded) {
    return {
      isEligible: false,
      reason: `Bạn vẫn còn ${unlearnedNewWords.length} từ mới chưa học hoặc vừa thêm từ cách đây ${daysSinceLastNewWord} ngày.`,
      effectiveLevel: profile.effectiveLevel,
      daysSinceLastNewWord,
      streak: streakStats.currentStreak,
      unlearnedNewWordsCount: unlearnedNewWords.length,
    };
  }

  return {
    isEligible: true,
    reason: `Đủ điều kiện: Đã duy trì chuỗi học đều đặn và ${daysSinceLastNewWord} ngày chưa thêm từ mới.`,
    effectiveLevel: profile.effectiveLevel,
    daysSinceLastNewWord,
    streak: streakStats.currentStreak,
    unlearnedNewWordsCount: unlearnedNewWords.length,
  };
}

let isReplenishingInProgress = false;

/**
 * Execute smart auto-replenishment of vocabulary and grammar exercises
 */
export async function triggerAutoReplenish(
  words: WordDetail[],
  isManualTrigger: boolean = false
): Promise<{ success: boolean; message: string; summary?: AutoReplenishSummary }> {
  if (isReplenishingInProgress) {
    return { success: false, message: "Hệ thống đang trong quá trình sinh từ mới, vui lòng chờ." };
  }

  const settings = getAutoReplenishSettings();
  const profile = assessUserProficiency(words);
  const targetLevel = profile.effectiveLevel;

  // If automated trigger, verify eligibility first
  if (!isManualTrigger) {
    const eligibility = await checkAutoReplenishEligibility(words);
    if (!eligibility.isEligible) {
      return { success: false, message: eligibility.reason };
    }
  }

  isReplenishingInProgress = true;
  console.log(`[AutoReplenish] Bắt đầu tự động bổ sung nội dung cho cấp độ ${targetLevel}...`);

  try {
    const existingWordsList = words.map((w) => w.word.toLowerCase().trim());
    const countToGenerate = settings.wordsPerBatch || 3;

    // 1. Generate vocabulary recommendations from AI specifically for this CEFR level
    const recommendations: VocabularyRecommendation[] = await generateVocabularyRecommendationsAI(
      targetLevel,
      existingWordsList,
      "Software Engineering & Professional Work",
      countToGenerate
    );

    if (recommendations.length === 0) {
      throw new Error("Không nhận được từ vựng đề xuất từ AI.");
    }

    const addedWords: string[] = [];

    // 2. Enqueue all recommended words into processing pipeline
    for (const rec of recommendations) {
      await pipeline.enqueue(rec.word);
      addedWords.push(rec.word);
    }

    // 3. Auto-generate grammar exercises for user's weakest or unattempted topic at this level
    let grammarTopic: string | undefined;
    let questionsGenerated = 0;

    if (settings.autoGenerateGrammar) {
      try {
        const levelLessons = GRAMMAR_LESSONS.filter((l) => l.level === targetLevel);
        const grammarProgress = getAllGrammarProgress();

        // Sort lessons: prioritize unattempted or highest lapses
        const sortedLessons = [...levelLessons].sort((a, b) => {
          const progA = grammarProgress[a.id];
          const progB = grammarProgress[b.id];
          const lapsesA = progA?.lapses || 0;
          const lapsesB = progB?.lapses || 0;
          const attemptedA = progA && progA.diagnosticStatus !== "unattempted" ? 1 : 0;
          const attemptedB = progB && progB.diagnosticStatus !== "unattempted" ? 1 : 0;

          if (attemptedA !== attemptedB) return attemptedA - attemptedB; // Unattempted first
          return lapsesB - lapsesA; // Higher lapses first
        });

        const targetLesson = sortedLessons[0] || levelLessons[0];
        if (targetLesson) {
          grammarTopic = targetLesson.title;
          const exercises = await generateGrammarExercisesWithGemini(targetLesson.title, targetLesson.level);
          if (exercises.length > 0) {
            await saveCustomGrammarExercises(targetLesson.id, exercises);
            questionsGenerated = exercises.length;
          }
        }
      } catch (grammarErr) {
        console.warn("[AutoReplenish] Sinh bài tập ngữ pháp tự động gặp sự cố nhẹ (bỏ qua):", grammarErr);
      }
    }

    // 4. Record summary & update date
    const today = getTodayStr();
    const summary: AutoReplenishSummary = {
      date: today,
      timestamp: Date.now(),
      level: targetLevel,
      words: addedWords,
      grammarTopic,
      questionCount: questionsGenerated,
    };

    saveAutoReplenishSettings({
      lastReplenishDate: today,
      lastReplenishSummary: summary,
    });

    // 5. Send Desktop Notification
    const notifTitle = `🎉 MyEnglish: Bổ Sung Bài Học Cấp Độ ${targetLevel}`;
    const notifBody = questionsGenerated > 0
      ? `Đã thêm ${addedWords.length} từ vựng mới (${addedWords.join(", ")}) & ${questionsGenerated} câu hỏi ngữ pháp "${grammarTopic}" cho bạn!`
      : `Đã tự động thêm ${addedWords.length} từ vựng mới (${addedWords.join(", ")}) chuẩn CEFR ${targetLevel} cho bạn!`;

    triggerDesktopNotification(notifTitle, notifBody).catch(() => {});

    // 6. Dispatch Global Event
    window.dispatchEvent(
      new CustomEvent("myenglish-auto-replenish-triggered", {
        detail: summary,
      })
    );

    return {
      success: true,
      message: `Đã tự động bổ sung thành công ${addedWords.length} từ mới và bài tập cấp độ ${targetLevel}!`,
      summary,
    };
  } catch (err) {
    console.error("[AutoReplenish] Lỗi thực thi tự động bổ sung:", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "Đã xảy ra lỗi khi tự động bổ sung nội dung.",
    };
  } finally {
    isReplenishingInProgress = false;
  }
}
