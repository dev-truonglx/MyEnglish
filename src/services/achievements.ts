/**
 * Gamification & Achievement Badges System — Phase 3
 */

import { awardXP } from "./smartReview";
import { triggerConfetti } from "@/utils/confetti";

export interface AchievementBadge {
  id: string;
  title: string;
  description: string;
  emoji: string;
  category: "learning" | "streak" | "speed" | "mastery";
  xpBonus: number;
  isUnlocked: boolean;
  unlockedAt?: string;
  currentValue: number;
  targetValue: number;
  progress: number; // 0..100
}

const ACHIEVEMENTS_STORAGE_KEY = "myenglish_achievements_v1";

export const BADGE_DEFINITIONS: Array<{
  id: string;
  title: string;
  description: string;
  emoji: string;
  category: "learning" | "streak" | "speed" | "mastery";
  xpBonus: number;
  targetValue: number;
}> = [
  {
    id: "first_word",
    title: "Bước Chân Đầu Tiên",
    description: "Thêm từ vựng đầu tiên vào bộ sưu tập",
    emoji: "🌟",
    category: "learning",
    xpBonus: 50,
    targetValue: 1,
  },
  {
    id: "vocab_50",
    title: "Nhà Sưu Tầm",
    description: "Bộ sưu tập đạt 50 từ vựng",
    emoji: "📖",
    category: "learning",
    xpBonus: 100,
    targetValue: 50,
  },
  {
    id: "vocab_200",
    title: "Bách Khoa Toàn Thư",
    description: "Bộ sưu tập đạt 200 từ vựng",
    emoji: "📚",
    category: "learning",
    xpBonus: 250,
    targetValue: 200,
  },
  {
    id: "vocab_500",
    title: "Lexicon Master",
    description: "Bộ sưu tập đạt mốc 500 từ vựng",
    emoji: "🏛️",
    category: "learning",
    xpBonus: 500,
    targetValue: 500,
  },
  {
    id: "perfect_10",
    title: "Xạ Thủ Trí Nhớ",
    description: "10 câu trả lời đúng ngay lần đầu liên tiếp trong 1 phiên",
    emoji: "🎯",
    category: "speed",
    xpBonus: 150,
    targetValue: 10,
  },
  {
    id: "streak_7",
    title: "Chiến Binh Streak",
    description: "Duy trì chuỗi học 7 ngày liên tiếp",
    emoji: "🔥",
    category: "streak",
    xpBonus: 200,
    targetValue: 7,
  },
  {
    id: "streak_30",
    title: "Huyền Thoại Bền Bỉ",
    description: "Duy trì chuỗi học 30 ngày liên tiếp",
    emoji: "💎",
    category: "streak",
    xpBonus: 600,
    targetValue: 30,
  },
  {
    id: "night_owl",
    title: "Cú Đêm Luyện Công",
    description: "Hoàn thành phiên ôn tập sau 22:00 đêm",
    emoji: "🦉",
    category: "learning",
    xpBonus: 75,
    targetValue: 1,
  },
  {
    id: "early_bird",
    title: "Chim Sớm Cần Mẫn",
    description: "Hoàn thành phiên ôn tập trước 07:00 sáng",
    emoji: "🐦",
    category: "learning",
    xpBonus: 75,
    targetValue: 1,
  },
  {
    id: "leech_slayer",
    title: "Dũng Sĩ Diệt Leech",
    description: "Khắc phục và ôn thành công 3 từ Leech (từ khó hay quên)",
    emoji: "🗡️",
    category: "mastery",
    xpBonus: 150,
    targetValue: 3,
  },
  {
    id: "speed_demon",
    title: "Phản Xạ Siêu Tốc",
    description: "Trả lời đúng trong dưới 3 giây",
    emoji: "⚡",
    category: "speed",
    xpBonus: 80,
    targetValue: 1,
  },
  {
    id: "topic_master",
    title: "Chuyên Gia Chủ Đề",
    description: "Làm chủ ít nhất 10 từ trong một chủ đề chuyên môn",
    emoji: "🎓",
    category: "mastery",
    xpBonus: 200,
    targetValue: 10,
  },
  {
    id: "marathon_50",
    title: "Marathon Runner",
    description: "Ôn tập 50 lượt từ trong một phiên duy nhất",
    emoji: "🏃",
    category: "learning",
    xpBonus: 300,
    targetValue: 50,
  },
];

interface StoredAchievement {
  unlockedAt: string;
}

export function getAchievements(context?: {
  totalWords?: number;
  currentStreak?: number;
  consecutiveCorrect?: number;
  sessionReviewCount?: number;
  leechesSlain?: number;
  fastAnswers?: number;
  topicMasterCount?: number;
}): AchievementBadge[] {
  let stored: Record<string, StoredAchievement> = {};
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {}

  const ctx = context || {};

  return BADGE_DEFINITIONS.map((def) => {
    const isAlreadyUnlocked = Boolean(stored[def.id]);
    let currentValue = 0;

    switch (def.id) {
      case "first_word":
      case "vocab_50":
      case "vocab_200":
      case "vocab_500":
        currentValue = ctx.totalWords || 0;
        break;
      case "streak_7":
      case "streak_30":
        currentValue = ctx.currentStreak || 0;
        break;
      case "perfect_10":
        currentValue = ctx.consecutiveCorrect || 0;
        break;
      case "marathon_50":
        currentValue = ctx.sessionReviewCount || 0;
        break;
      case "leech_slayer":
        currentValue = ctx.leechesSlain || 0;
        break;
      case "speed_demon":
        currentValue = ctx.fastAnswers || 0;
        break;
      case "topic_master":
        currentValue = ctx.topicMasterCount || 0;
        break;
      case "night_owl":
      case "early_bird":
        currentValue = isAlreadyUnlocked ? 1 : 0;
        break;
      default:
        currentValue = isAlreadyUnlocked ? def.targetValue : 0;
    }

    if (isAlreadyUnlocked) {
      currentValue = Math.max(currentValue, def.targetValue);
    }

    const progress = Math.min(100, Math.round((currentValue / def.targetValue) * 100));

    return {
      ...def,
      isUnlocked: isAlreadyUnlocked || progress >= 100,
      unlockedAt: stored[def.id]?.unlockedAt,
      currentValue,
      progress,
    };
  });
}

/**
 * Check achievements against current activity and trigger unlock if met
 */
export function checkAndUnlockAchievements(context: {
  totalWords?: number;
  currentStreak?: number;
  consecutiveCorrect?: number;
  sessionReviewCount?: number;
  leechesSlain?: number;
  responseTimeMs?: number;
  isCorrect?: boolean;
  topicMasterCount?: number;
}): AchievementBadge[] {
  let stored: Record<string, StoredAchievement> = {};
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {}

  const currentHour = new Date().getHours();
  const newlyUnlocked: AchievementBadge[] = [];

  const evaluateBadge = (id: string, condition: boolean) => {
    if (condition && !stored[id]) {
      const def = BADGE_DEFINITIONS.find((b) => b.id === id);
      if (def) {
        stored[id] = { unlockedAt: new Date().toISOString() };
        awardXP(def.xpBonus);
        newlyUnlocked.push({
          ...def,
          isUnlocked: true,
          unlockedAt: stored[id].unlockedAt,
          currentValue: def.targetValue,
          progress: 100,
        });
      }
    }
  };

  // Evaluate conditions
  if (context.totalWords !== undefined) {
    evaluateBadge("first_word", context.totalWords >= 1);
    evaluateBadge("vocab_50", context.totalWords >= 50);
    evaluateBadge("vocab_200", context.totalWords >= 200);
    evaluateBadge("vocab_500", context.totalWords >= 500);
  }

  if (context.currentStreak !== undefined) {
    evaluateBadge("streak_7", context.currentStreak >= 7);
    evaluateBadge("streak_30", context.currentStreak >= 30);
  }

  if (context.consecutiveCorrect !== undefined) {
    evaluateBadge("perfect_10", context.consecutiveCorrect >= 10);
  }

  if (context.sessionReviewCount !== undefined) {
    evaluateBadge("marathon_50", context.sessionReviewCount >= 50);
  }

  if (context.leechesSlain !== undefined) {
    evaluateBadge("leech_slayer", context.leechesSlain >= 3);
  }

  if (context.topicMasterCount !== undefined) {
    evaluateBadge("topic_master", context.topicMasterCount >= 10);
  }

  if (context.isCorrect && context.responseTimeMs && context.responseTimeMs > 0 && context.responseTimeMs < 3000) {
    evaluateBadge("speed_demon", true);
  }

  // Time based
  if (context.sessionReviewCount && context.sessionReviewCount >= 1) {
    if (currentHour >= 22 || currentHour < 4) {
      evaluateBadge("night_owl", true);
    }
    if (currentHour >= 4 && currentHour < 7) {
      evaluateBadge("early_bird", true);
    }
  }

  if (newlyUnlocked.length > 0) {
    try {
      localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(stored));
      triggerConfetti(2500);

      // Dispatch event
      window.dispatchEvent(
        new CustomEvent("myenglish-badge-unlocked", {
          detail: { badges: newlyUnlocked },
        })
      );
    } catch {}
  }

  return newlyUnlocked;
}
