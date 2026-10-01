import type { WordDetail } from "@/types/database";
import type { GrammarLevel, GrammarLesson } from "@/types/grammar";
import { GRAMMAR_LESSONS } from "@/data/grammarData";
import { getAllGrammarProgress } from "./grammarService";
import { calculateRetrievability, getXPState } from "./smartReview";
import { calculateStreakAndGoal } from "./streak";
import { saveReminderSettings } from "./reminderSettings";

const PROFICIENCY_OVERRIDE_KEY = "myenglish_user_cefr_override_v1";

export interface LevelBreakdown {
  level: GrammarLevel;
  label: string;
  description: string;
  totalLessons: number;
  attemptedLessons: number;
  passedLessons: number;
  averageMastery: number; // 0 - 100%
  averageScore: number;   // 0 - 100%
  status: "locked" | "learning" | "mastered";
}

export interface UserProficiencyProfile {
  assessedLevel: GrammarLevel;        // Evaluated by algorithm
  effectiveLevel: GrammarLevel;       // Active level (override || assessed)
  userOverrideLevel: GrammarLevel | null;
  overallScore: number;               // 0 - 100 CEFR scale
  levelConfidence: "preliminary" | "moderate" | "high";
  nextLevel: GrammarLevel | null;
  progressToNextLevel: number;        // 0 - 100%
  
  // Factor breakdown
  grammarScore: number;               // 0 - 100
  vocabularyScore: number;            // 0 - 100
  habitScore: number;                 // 0 - 100
  
  // Specific stats
  levelBreakdown: Record<GrammarLevel, LevelBreakdown>;
  vocabularyStats: {
    totalWords: number;
    masteredWords: number;
    learningWords: number;
    avgRetrievability: number;        // 0 - 100%
  };
  learningStats: {
    streak: number;
    xpLevel: number;
    rank: string;
  };
  
  recommendations: string[];
}

export const CEFR_LEVEL_METADATA: Record<
  GrammarLevel,
  { label: string; titleVn: string; minScore: number; colorClass: string; badgeClass: string }
> = {
  A1: {
    label: "A1 - Starter",
    titleVn: "Sơ Cấp Cơ Bản",
    minScore: 0,
    colorClass: "from-emerald-500 to-emerald-600",
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
  },
  A2: {
    label: "A2 - Elementary",
    titleVn: "Sơ Cấp Nâng Cao",
    minScore: 25,
    colorClass: "from-teal-500 to-teal-600",
    badgeClass: "bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300 border-teal-300 dark:border-teal-800",
  },
  B1: {
    label: "B1 - Intermediate",
    titleVn: "Trung Cấp Tự Tin",
    minScore: 45,
    colorClass: "from-cyan-500 to-cyan-600",
    badgeClass: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/80 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800",
  },
  B2: {
    label: "B2 - Upper-Intermediate",
    titleVn: "Trung Cấp Cao Cấp",
    minScore: 70,
    colorClass: "from-blue-500 to-blue-600",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-300 dark:border-blue-800",
  },
  C1: {
    label: "C1 - Advanced",
    titleVn: "Chuyên Nghiệp Thành Thạo",
    minScore: 85,
    colorClass: "from-purple-500 to-purple-600",
    badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border-purple-300 dark:border-purple-800",
  },
};

const ALL_LEVELS: GrammarLevel[] = ["A1", "A2", "B1", "B2", "C1"];

/**
 * Get manual override level if set by user
 */
export function getUserOverrideLevel(): GrammarLevel | null {
  try {
    const raw = localStorage.getItem(PROFICIENCY_OVERRIDE_KEY);
    if (raw && ALL_LEVELS.includes(raw as GrammarLevel)) {
      return raw as GrammarLevel;
    }
  } catch (err) {
    console.warn("Failed to get proficiency override:", err);
  }
  return null;
}

/**
 * Set or clear user manual override level
 */
export function setUserOverrideLevel(level: GrammarLevel | null): void {
  try {
    if (level && ALL_LEVELS.includes(level)) {
      localStorage.setItem(PROFICIENCY_OVERRIDE_KEY, level);
    } else {
      localStorage.removeItem(PROFICIENCY_OVERRIDE_KEY);
    }
    window.dispatchEvent(new CustomEvent("myenglish-proficiency-updated"));
  } catch (err) {
    console.warn("Failed to save proficiency override:", err);
  }
}

/**
 * Perform comprehensive evaluation of user's CEFR proficiency level
 */
export function assessUserProficiency(words: WordDetail[]): UserProficiencyProfile {
  const grammarProgressMap = getAllGrammarProgress();
  const xpState = getXPState();
  const streakStats = calculateStreakAndGoal(words);
  const userOverrideLevel = getUserOverrideLevel();

  // 1. Analyze Grammar Performance by CEFR Level
  const levelBreakdown: Record<GrammarLevel, LevelBreakdown> = {
    A1: {
      level: "A1",
      label: "A1 - Starter",
      description: "Thì cơ bản, cấu trúc câu đơn & từ vựng nhập môn",
      totalLessons: 0,
      attemptedLessons: 0,
      passedLessons: 0,
      averageMastery: 0,
      averageScore: 0,
      status: "learning",
    },
    A2: {
      level: "A2",
      label: "A2 - Elementary",
      description: "Quá khứ tiếp diễn, câu so sánh & ngữ cảnh hàng ngày",
      totalLessons: 0,
      attemptedLessons: 0,
      passedLessons: 0,
      averageMastery: 0,
      averageScore: 0,
      status: "locked",
    },
    B1: {
      level: "B1",
      label: "B1 - Intermediate",
      description: "Hiện tại hoàn thành, câu điều kiện 1 & 2, bị động",
      totalLessons: 0,
      attemptedLessons: 0,
      passedLessons: 0,
      averageMastery: 0,
      averageScore: 0,
      status: "locked",
    },
    B2: {
      level: "B2",
      label: "B2 - Upper-Intermediate",
      description: "Điều kiện hỗn hợp, bị động nâng cao, mệnh đề phân từ",
      totalLessons: 0,
      attemptedLessons: 0,
      passedLessons: 0,
      averageMastery: 0,
      averageScore: 0,
      status: "locked",
    },
    C1: {
      level: "C1",
      label: "C1 - Advanced",
      description: "Đảo ngữ, câu chẻ, văn phong kỹ thuật & học thuật cao cấp",
      totalLessons: 0,
      attemptedLessons: 0,
      passedLessons: 0,
      averageMastery: 0,
      averageScore: 0,
      status: "locked",
    },
  };

  // Group lessons by level
  const lessonsByLevel: Record<GrammarLevel, GrammarLesson[]> = {
    A1: [],
    A2: [],
    B1: [],
    B2: [],
    C1: [],
  };

  for (const lesson of GRAMMAR_LESSONS) {
    if (lessonsByLevel[lesson.level]) {
      lessonsByLevel[lesson.level].push(lesson);
    }
  }

  let totalGrammarWeightSum = 0;
  let weightedGrammarPoints = 0;

  ALL_LEVELS.forEach((lvl, idx) => {
    const list = lessonsByLevel[lvl] || [];
    levelBreakdown[lvl].totalLessons = list.length;

    let sumMastery = 0;
    let sumScore = 0;
    let attempted = 0;
    let passed = 0;

    for (const l of list) {
      const prog = grammarProgressMap[l.id];
      if (prog && (prog.diagnosticStatus !== "unattempted" || prog.reps > 0 || prog.score > 0)) {
        attempted++;
        sumMastery += prog.mastery || 0;
        sumScore += prog.score || 0;
        if (
          prog.diagnosticStatus === "passed_first_try" ||
          prog.diagnosticStatus === "reviewed_and_passed" ||
          prog.score >= 70 ||
          prog.mastery >= 70
        ) {
          passed++;
        }
      }
    }

    const avgMastery = attempted > 0 ? Math.round(sumMastery / list.length) : 0;
    const avgScore = attempted > 0 ? Math.round(sumScore / attempted) : 0;
    levelBreakdown[lvl].attemptedLessons = attempted;
    levelBreakdown[lvl].passedLessons = passed;
    levelBreakdown[lvl].averageMastery = avgMastery;
    levelBreakdown[lvl].averageScore = avgScore;

    if (avgMastery >= 75 && passed >= Math.ceil(list.length * 0.6)) {
      levelBreakdown[lvl].status = "mastered";
    } else if (attempted > 0 || idx === 0) {
      levelBreakdown[lvl].status = "learning";
    } else {
      levelBreakdown[lvl].status = "locked";
    }

    // Weight factor: Higher levels give progressively more points toward CEFR score
    const levelMaxContribution = [20, 20, 25, 20, 15][idx];
    const completionRatio = list.length > 0 ? (passed * 0.6 + (avgMastery / 100) * list.length * 0.4) / list.length : 0;
    weightedGrammarPoints += completionRatio * levelMaxContribution;
    totalGrammarWeightSum += levelMaxContribution;
  });

  const grammarScore = Math.min(100, Math.round(weightedGrammarPoints));

  // 2. Analyze Vocabulary & FSRS Retention
  const totalWords = words.length;
  let masteredWords = 0;
  let learningWords = 0;
  let totalRetrievability = 0;

  for (const w of words) {
    const srs = w.srs;
    const R = calculateRetrievability(srs);
    totalRetrievability += R;

    if ((srs.stability && srs.stability >= 21) || (srs.repetitions && srs.repetitions >= 4)) {
      masteredWords++;
    } else if ((srs.state && srs.state > 0) || (srs.reps && srs.reps > 0)) {
      learningWords++;
    }
  }

  const avgRetrievability = totalWords > 0 ? Math.round((totalRetrievability / totalWords) * 100) : 0;

  // Vocabulary points scale based on word count & retention:
  // 30 words -> ~25 pts (A2 entry)
  // 100 words -> ~50 pts (B1 entry)
  // 250 words -> ~75 pts (B2 entry)
  // 500+ words -> 90-100 pts (C1)
  let vocabCountScore = 0;
  if (totalWords <= 30) {
    vocabCountScore = (totalWords / 30) * 25;
  } else if (totalWords <= 100) {
    vocabCountScore = 25 + ((totalWords - 30) / 70) * 25;
  } else if (totalWords <= 250) {
    vocabCountScore = 50 + ((totalWords - 100) / 150) * 25;
  } else if (totalWords <= 500) {
    vocabCountScore = 75 + ((totalWords - 250) / 250) * 15;
  } else {
    vocabCountScore = 90 + Math.min(10, ((totalWords - 500) / 500) * 10);
  }

  // Weight with retention and mastery ratio
  const retentionMultiplier = totalWords > 0 ? (avgRetrievability / 100) * 0.4 + (masteredWords / totalWords) * 0.6 : 0.5;
  const vocabularyScore = Math.min(100, Math.round(vocabCountScore * 0.7 + retentionMultiplier * vocabCountScore * 0.3));

  // 3. Learning Habit & Velocity Score
  const streakPts = Math.min(30, streakStats.currentStreak * 5); // 6+ days streak = 30 pts
  const xpPts = Math.min(50, (xpState.totalXP / 3000) * 50);     // 3000 XP = 50 pts
  const activeLearnerPts = streakStats.goalReached ? 20 : 10;
  const habitScore = Math.min(100, Math.round(streakPts + xpPts + activeLearnerPts));

  // 4. Overall Hybrid CEFR Score (0 - 100)
  // Trọng số: 45% Ngữ pháp, 35% Vốn từ vựng, 20% Thói quen & Phản xạ
  const overallScore = Math.min(
    100,
    Math.max(
      0,
      Math.round(grammarScore * 0.45 + vocabularyScore * 0.35 + habitScore * 0.20)
    )
  );

  // 5. Determine Assessed Level based on score + milestone thresholds
  let assessedLevel: GrammarLevel = "A1";
  if (overallScore >= 85) {
    assessedLevel = "C1";
  } else if (overallScore >= 70) {
    assessedLevel = "B2";
  } else if (overallScore >= 45) {
    assessedLevel = "B1";
  } else if (overallScore >= 25) {
    assessedLevel = "A2";
  } else {
    assessedLevel = "A1";
  }

  // Override logic: If user mastered majority of B1 grammar despite low total vocab count, grant at least B1
  if (levelBreakdown.B2.status === "mastered") {
    if (assessedLevel === "A1" || assessedLevel === "A2" || assessedLevel === "B1") {
      assessedLevel = "B2";
    }
  } else if (levelBreakdown.B1.status === "mastered") {
    if (assessedLevel === "A1" || assessedLevel === "A2") {
      assessedLevel = "B1";
    }
  } else if (levelBreakdown.A2.status === "mastered") {
    if (assessedLevel === "A1") {
      assessedLevel = "A2";
    }
  }

  const effectiveLevel: GrammarLevel = userOverrideLevel || assessedLevel;

  // Determine next level & progress towards it
  const currentIdx = ALL_LEVELS.indexOf(effectiveLevel);
  const nextLevel = currentIdx < ALL_LEVELS.length - 1 ? ALL_LEVELS[currentIdx + 1] : null;

  const currentLevelMin = CEFR_LEVEL_METADATA[effectiveLevel].minScore;
  const nextLevelMin = nextLevel ? CEFR_LEVEL_METADATA[nextLevel].minScore : 100;
  const span = Math.max(1, nextLevelMin - currentLevelMin);
  const progressToNextLevel = Math.min(
    100,
    Math.max(0, Math.round(((overallScore - currentLevelMin) / span) * 100))
  );

  // Confidence level
  let levelConfidence: "preliminary" | "moderate" | "high" = "preliminary";
  const totalGrammarAttempts = Object.values(levelBreakdown).reduce((acc, curr) => acc + curr.attemptedLessons, 0);
  if (totalGrammarAttempts >= 8 && totalWords >= 40) {
    levelConfidence = "high";
  } else if (totalGrammarAttempts >= 3 || totalWords >= 15) {
    levelConfidence = "moderate";
  }

  // Generate personalized actionable recommendations
  const recommendations: string[] = [];
  if (levelBreakdown[effectiveLevel].attemptedLessons < levelBreakdown[effectiveLevel].totalLessons) {
    recommendations.push(
      `Hoàn thành thêm các bài kiểm tra chẩn đoán ngữ pháp cấp độ ${effectiveLevel} để củng cố nền tảng.`
    );
  }
  if (totalWords < 50 && ["B1", "B2", "C1"].includes(effectiveLevel)) {
    recommendations.push(
      `Vốn từ vựng hiện tại (${totalWords} từ) còn khiêm tốn so với chuẩn ${effectiveLevel}. Hãy tận dụng tính năng tự động nạp từ mới.`
    );
  }
  if (avgRetrievability < 75 && totalWords > 10) {
    recommendations.push(
      `Khả năng nhớ lại trung bình đạt ${avgRetrievability}%. Hãy ưu tiên ôn tập các thẻ đến hạn để duy trì độ nhớ bền vững.`
    );
  }
  if (streakStats.currentStreak < 3) {
    recommendations.push(
      `Duy trì thói quen học mỗi ngày (chuỗi hiện tại: ${streakStats.currentStreak} ngày) để nâng cao phản xạ tiếng Anh tự nhiên.`
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      `Phong độ rất xuất sắc! Bạn đang duy trì tiến độ hoàn hảo ở cấp độ ${effectiveLevel}.`
    );
  }

  return {
    assessedLevel,
    effectiveLevel,
    userOverrideLevel,
    overallScore,
    levelConfidence,
    nextLevel,
    progressToNextLevel,
    grammarScore,
    vocabularyScore,
    habitScore,
    levelBreakdown,
    vocabularyStats: {
      totalWords,
      masteredWords,
      learningWords,
      avgRetrievability,
    },
    learningStats: {
      streak: streakStats.currentStreak,
      xpLevel: xpState.level,
      rank: xpState.rank,
    },
    recommendations,
  };
}

/**
 * Automatically sync evaluated proficiency level to reminder pop-up settings
 * so exercises appearing in pop-ups are always strictly calibrated to current level.
 */
export function syncProficiencyWithReminderSettings(level: GrammarLevel): void {
  try {
    // Configure pop-up to focus on current level plus foundational level if not A1
    const levelsToInclude: GrammarLevel[] = [level];
    if (level === "A2") levelsToInclude.unshift("A1");
    if (level === "B1") levelsToInclude.unshift("A2");
    if (level === "B2") levelsToInclude.unshift("B1");
    if (level === "C1") levelsToInclude.unshift("B2");

    saveReminderSettings({
      grammarLevels: levelsToInclude,
    });
  } catch (err) {
    console.warn("Failed to sync proficiency with reminder settings:", err);
  }
}
