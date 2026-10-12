import type { WordDetail } from "@/types/database";
import type { GrammarLevel } from "@/types/grammar";
import { getAllGrammarProgress, isLessonMastered } from "./grammarService";
import { getEffectiveLessonIds } from "./grammarPath";
import { calculateRetrievability, getXPState, isWordKnown } from "./smartReview";
import { calculateStreakAndGoal } from "./streak";
import { isPlaceholderMeaning } from "./db";
import { normalizeCefr } from "./cefr";
import { LEVEL_OVERRIDE_KEY } from "./learnerProfile";
import { CATALOG_LEVEL_COUNTS } from "./vocabCatalog";
import { hasRealReview } from "./progress";

const PROFICIENCY_OVERRIDE_KEY = LEVEL_OVERRIDE_KEY;
/**
 * Known words of a level needed to complete that level: 80% of the deck's words of that level.
 * A function, read at call time (the deck module sits in an import cycle).
 */
const LEVEL_VOCAB_SHARE = 0.8;
function levelVocabTarget(level: GrammarLevel): number {
  return Math.round(CATALOG_LEVEL_COUNTS[level] * LEVEL_VOCAB_SHARE);
}


/**
 * One CEFR level on the card. Grammar comes from the learner's own book, whose lessons have no CEFR level,
 * so a level is measured by its vocabulary only.
 */
export interface LevelBreakdown {
  level: GrammarLevel;
  label: string;
  description: string;
  /** Known words of the level vs the target, 0 - 100% */
  vocabPercent: number;
  /** "mastered": below the active level (chosen or assessed) or its vocabulary complete */
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
  /** Known words of each level vs the target needed to complete it (untagged words fill gaps bottom-up) */
  levelVocab: Record<GrammarLevel, { known: number; target: number }>;
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

  const LEVEL_DESCRIPTIONS: Record<GrammarLevel, string> = {
    A1: "Thì cơ bản, cấu trúc câu đơn & từ vựng nhập môn",
    A2: "Quá khứ tiếp diễn, câu so sánh & ngữ cảnh hàng ngày",
    B1: "Hiện tại hoàn thành, câu điều kiện 1 & 2, bị động",
    B2: "Điều kiện hỗn hợp, bị động nâng cao, mệnh đề phân từ",
    C1: "Đảo ngữ, câu chẻ, văn phong kỹ thuật & học thuật cao cấp",
  };

  // 1. Grammar: share of the lessons on the learner's path that are mastered
  const selectedLessonIds = getEffectiveLessonIds();
  let selectedMastered = 0;
  let grammarAttempted = 0;
  for (const id of selectedLessonIds) {
    const prog = grammarProgressMap[id];
    if (prog) {
      if ((prog.reps ?? 0) > 0 || (prog.score ?? 0) > 0 || prog.diagnosticStatus !== "unattempted") grammarAttempted++;
      if (isLessonMastered(prog)) selectedMastered++;
    }
  }
  const grammarScore = selectedLessonIds.length > 0
    ? Math.round((selectedMastered / selectedLessonIds.length) * 100)
    : 0;

  // 2. Analyze Vocabulary & FSRS Retention
  // Only words actually studied (reviewed at least once, not pending AI analysis) count; a word only marked
  // "Đã biết" counts once a real review has confirmed it
  const studiedWords = words.filter(
    (w) => (w.srs.reps ?? 0) > 0 && hasRealReview(w) && !isPlaceholderMeaning(w.meaning_vn)
  );
  const totalWords = studiedWords.length;
  let masteredWords = 0;
  let learningWords = 0;
  let totalRetrievability = 0;

  for (const w of studiedWords) {
    const srs = w.srs;
    const R = calculateRetrievability(srs);
    totalRetrievability += R;

    // FSRS mastery: card in Review state with stability >= 21 days
    if (srs.state === 2 && (srs.stability ?? 0) >= 21) {
      masteredWords++;
    } else {
      learningWords++;
    }
  }

  const avgRetrievability = totalWords > 0 ? Math.round((totalRetrievability / totalWords) * 100) : 0;

  // Per-level vocabulary: words tagged with their CEFR level that the learner reliably recognises
  // (recognition card in Review with >= 7 days stability). Untagged words (added before tagging)
  // fill the remaining gaps from the lowest level up, so the result changes smoothly as tags arrive.
  const isKnown = (w: WordDetail) => isWordKnown(w);
  const knownByLevel: Record<GrammarLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };
  let taggedKnown = 0;
  let totalKnown = 0;
  for (const w of studiedWords) {
    if (!isKnown(w)) continue;
    totalKnown++;
    const lvl = normalizeCefr(w.cefr_level);
    if (lvl) {
      // C2 words count toward C1, the highest level the app teaches
      knownByLevel[lvl === "C2" ? "C1" : lvl]++;
      taggedKnown++;
    }
  }
  let untaggedKnown = totalKnown - taggedKnown;
  const levelVocab = {} as Record<GrammarLevel, { known: number; target: number }>;
  for (const lvl of ALL_LEVELS) {
    const target = levelVocabTarget(lvl);
    const fill = Math.min(untaggedKnown, Math.max(0, target - knownByLevel[lvl]));
    untaggedKnown -= fill;
    levelVocab[lvl] = { known: knownByLevel[lvl] + fill, target };
  }
  const vocabPercent = (lvl: GrammarLevel) =>
    Math.min(100, Math.round((levelVocab[lvl].known / levelVocab[lvl].target) * 100));
  const vocabularyScore = Math.round(ALL_LEVELS.reduce((sum, lvl) => sum + vocabPercent(lvl), 0) / ALL_LEVELS.length);

  // 3. Learning Habit & Velocity Score
  const streakPts = Math.min(30, streakStats.currentStreak * 5); // 6+ days streak = 30 pts
  const xpPts = Math.min(50, (xpState.totalXP / 3000) * 50);     // 3000 XP = 50 pts
  const activeLearnerPts = streakStats.goalReached ? 20 : 10;
  const habitScore = Math.min(100, Math.round(streakPts + xpPts + activeLearnerPts));

  // 4. Assessed level = the first level the learner has not completed yet.
  // A level is completed when enough of its vocabulary is known (LEVEL_VOCAB_SHARE of its words).
  // Grammar and habit (streak/XP) are shown separately and never change the level.
  const isLevelCompleted = (lvl: GrammarLevel) => vocabPercent(lvl) >= 100;

  const assessedLevel: GrammarLevel = ALL_LEVELS.find((lvl) => !isLevelCompleted(lvl)) ?? "C1";
  const assessedProgress = vocabPercent(assessedLevel);

  // Overall 0-100 score on the same scale as CEFR_LEVEL_METADATA.minScore (for display)
  const levelMin = CEFR_LEVEL_METADATA[assessedLevel].minScore;
  const assessedIdx = ALL_LEVELS.indexOf(assessedLevel);
  const levelMax = assessedIdx < ALL_LEVELS.length - 1 ? CEFR_LEVEL_METADATA[ALL_LEVELS[assessedIdx + 1]].minScore : 100;
  const overallScore = Math.round(levelMin + ((levelMax - levelMin) * assessedProgress) / 100);

  const effectiveLevel: GrammarLevel = userOverrideLevel || assessedLevel;

  // Determine next level & progress towards it
  const currentIdx = ALL_LEVELS.indexOf(effectiveLevel);
  const nextLevel = currentIdx < ALL_LEVELS.length - 1 ? ALL_LEVELS[currentIdx + 1] : null;

  // Progress inside the active level: based on level vocabulary
  const progressToNextLevel = vocabPercent(effectiveLevel);

  // Per level: levels below the active one count as passed (the learner chose or reached a higher level)
  const levelBreakdown = {} as Record<GrammarLevel, LevelBreakdown>;
  for (const [i, lvl] of ALL_LEVELS.entries()) {
    const done = i < currentIdx || isLevelCompleted(lvl);
    levelBreakdown[lvl] = {
      level: lvl,
      label: CEFR_LEVEL_METADATA[lvl].label,
      description: LEVEL_DESCRIPTIONS[lvl],
      vocabPercent: vocabPercent(lvl),
      status: done ? "mastered" : i === currentIdx ? "learning" : "locked",
    };
  }

  // Confidence level: how much the learner has practised (grammar lessons tried on their path, words studied)
  let levelConfidence: "preliminary" | "moderate" | "high" = "preliminary";
  if (grammarAttempted >= 8 && totalWords >= 40) {
    levelConfidence = "high";
  } else if (grammarAttempted >= 3 || totalWords >= 15) {
    levelConfidence = "moderate";
  }

  // Generate personalized actionable recommendations
  const recommendations: string[] = [];
  if (selectedLessonIds.length > 0 && selectedMastered < selectedLessonIds.length) {
    recommendations.push(
      `Bạn đã nắm vững ${selectedMastered}/${selectedLessonIds.length} bài ngữ pháp trong lộ trình. Ôn các bài đến hạn để nhớ lâu hơn.`
    );
  }
  if (vocabPercent(effectiveLevel) < 100) {
    const { known, target } = levelVocab[effectiveLevel];
    recommendations.push(
      `Bạn đã thuộc ${known}/${target} từ cấp độ ${effectiveLevel}. Mỗi ngày học vài từ mới và ôn đúng hạn để tiến gần mục tiêu.`
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
    levelVocab,
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
 * Deprecated: Pop-up grammar review is now automatically managed by studied lessons in Grammar Hub.
 * Kept for backward compatibility.
 */
export function syncProficiencyWithReminderSettings(_level: GrammarLevel): void {
  // No-op: grammar is automatically interleaved based on studied lessons
}
