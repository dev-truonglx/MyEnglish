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
  // Early wins: reachable in the first days, so a beginner sees progress before any word is "mastered"
  {
    id: "first_session",
    title: "Buổi Học Đầu Tiên",
    description: "Hoàn thành phiên học đầu tiên",
    emoji: "🚀",
    category: "learning",
    xpBonus: 30,
    targetValue: 1,
  },
  {
    id: "streak_3",
    title: "Ba Ngày Liền",
    description: "Học 3 ngày liên tiếp (1 câu mỗi ngày là đủ)",
    emoji: "🌱",
    category: "streak",
    xpBonus: 60,
    targetValue: 3,
  },
  {
    id: "remembered_10",
    title: "Mười Từ Qua Đêm",
    description: "10 từ đã nhớ lại được ở lần ôn sau (qua ít nhất một đêm)",
    emoji: "🌙",
    category: "learning",
    xpBonus: 60,
    targetValue: 10,
  },
  {
    id: "pronunciation_1",
    title: "Tai Nghe Đầu Tiên",
    description: "Hoàn thành bài phát âm đầu tiên",
    emoji: "👂",
    category: "learning",
    xpBonus: 40,
    targetValue: 1,
  },
  {
    id: "first_word",
    title: "Bước Chân Đầu Tiên",
    description: "Nhớ chắc từ đầu tiên (giữ được trong trí nhớ ít nhất 21 ngày)",
    emoji: "🌟",
    category: "learning",
    xpBonus: 50,
    targetValue: 1,
  },
  {
    id: "vocab_50",
    title: "Trí Nhớ Vững",
    description: "Nhớ chắc 50 từ (ổn định ít nhất 21 ngày)",
    emoji: "📖",
    category: "learning",
    xpBonus: 100,
    targetValue: 50,
  },
  {
    id: "vocab_200",
    title: "Bách Khoa Toàn Thư",
    description: "Nhớ chắc 200 từ (ổn định ít nhất 21 ngày)",
    emoji: "📚",
    category: "learning",
    xpBonus: 250,
    targetValue: 200,
  },
  {
    id: "vocab_500",
    title: "Lexicon Master",
    description: "Nhớ chắc 500 từ (ổn định ít nhất 21 ngày)",
    emoji: "🏛️",
    category: "learning",
    xpBonus: 500,
    targetValue: 500,
  },
  {
    id: "first_try_50",
    title: "Bền Bỉ",
    description: "Tổng cộng 50 lần nhớ đúng ngay lần đầu (không cần liên tiếp)",
    emoji: "🎯",
    category: "mastery",
    xpBonus: 150,
    targetValue: 50,
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
    title: "Không Bỏ Cuộc",
    description: "Nhớ được 3 từ trước đây hay quên",
    emoji: "🗡️",
    category: "mastery",
    xpBonus: 150,
    targetValue: 3,
  },
  {
    id: "on_target",
    title: "Đúng Nhịp Trí Nhớ",
    description: "Một tuần có tỉ lệ nhớ thật đạt mục tiêu (ít nhất 30 lượt ôn đúng lịch)",
    emoji: "🧠",
    category: "mastery",
    xpBonus: 150,
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
];

interface StoredAchievement {
  unlockedAt: string;
}

export function getAchievements(context?: {
  rememberedWords?: number;
  totalWords?: number;
  masteredWords?: number;
  weekOnTarget?: boolean;
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
        currentValue = ctx.masteredWords || 0;
        break;
      case "on_target":
        currentValue = ctx.weekOnTarget ? 1 : 0;
        break;
      case "streak_7":
      case "streak_30":
        currentValue = ctx.currentStreak || 0;
        break;
      case "first_try_50":
        currentValue = getFirstTryTotal();
        break;
      case "streak_3":
        currentValue = ctx.currentStreak || 0;
        break;
      case "remembered_10":
        currentValue = ctx.rememberedWords || 0;
        break;
      case "leech_slayer":
        currentValue = ctx.leechesSlain || 0;
        break;
      case "topic_master":
        currentValue = ctx.topicMasterCount || 0;
        break;
      case "first_session":
      case "pronunciation_1":
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

export interface AchievementCheckContext {
  totalWords?: number;        // whole collection size (not just this session)
  masteredWords?: number;     // words with recognition stability >= 21 days
  weekOnTarget?: boolean;     // this week's true retention reached the target (enough reviews)
  currentStreak?: number;     // real day streak
  consecutiveCorrect?: number;
  sessionReviewCount?: number;
  leechesSlain?: number;
  responseTimeMs?: number;
  isCorrect?: boolean;
  topicMasterCount?: number;  // max mastered words within a single topic
  /** Words whose recognition card graduated to Review (remembered at a later review) */
  rememberedWords?: number;
  /** A study session was completed */
  sessionCompleted?: boolean;
  /** A pronunciation lesson was passed */
  pronunciationPassed?: boolean;
}

const FIRST_TRY_KEY = "myenglish_first_try_total_v1";

/** Scheduled answers remembered on the first try, in total (the "Bền Bỉ" badge) */
export function getFirstTryTotal(): number {
  try {
    const n = Number(localStorage.getItem(FIRST_TRY_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function recordFirstTryCorrect(): number {
  const next = getFirstTryTotal() + 1;
  try {
    localStorage.setItem(FIRST_TRY_KEY, String(next));
  } catch {}
  return next;
}

function readStoredAchievements(): Record<string, StoredAchievement> {
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

/**
 * Check achievements against current activity and trigger unlock if met
 */
export function checkAndUnlockAchievements(context: AchievementCheckContext = {}): AchievementBadge[] {
  const stored = readStoredAchievements();
  const currentHour = new Date().getHours();
  const candidateIds: string[] = [];

  const evaluateBadge = (id: string, condition: boolean) => {
    if (condition && !stored[id] && !candidateIds.includes(id)) {
      candidateIds.push(id);
    }
  };

  // Evaluate conditions
  // Badges reward what was remembered, not how many words were added or how fast answers came
  if (context.masteredWords !== undefined) {
    evaluateBadge("first_word", context.masteredWords >= 1);
    evaluateBadge("vocab_50", context.masteredWords >= 50);
    evaluateBadge("vocab_200", context.masteredWords >= 200);
    evaluateBadge("vocab_500", context.masteredWords >= 500);
  }
  if (context.weekOnTarget) evaluateBadge("on_target", true);

  if (context.sessionCompleted) evaluateBadge("first_session", true);
  if (context.pronunciationPassed) evaluateBadge("pronunciation_1", true);
  if (context.rememberedWords !== undefined) evaluateBadge("remembered_10", context.rememberedWords >= 10);
  evaluateBadge("first_try_50", getFirstTryTotal() >= 50);

  if (context.currentStreak !== undefined) {
    evaluateBadge("streak_3", context.currentStreak >= 3);
    evaluateBadge("streak_7", context.currentStreak >= 7);
    evaluateBadge("streak_30", context.currentStreak >= 30);
  }

  if (context.leechesSlain !== undefined) {
    evaluateBadge("leech_slayer", context.leechesSlain >= 3);
  }

  if (context.topicMasterCount !== undefined) {
    evaluateBadge("topic_master", context.topicMasterCount >= 10);
  }

  // Time based (no badge for studying late at night: sleep helps memory more)
  if (context.sessionReviewCount && context.sessionReviewCount >= 1) {
    if (currentHour >= 4 && currentHour < 7) {
      evaluateBadge("early_bird", true);
    }
  }

  if (candidateIds.length === 0) return [];

  // Re-read right before writing so another window's unlock isn't duplicated or clobbered
  const latest = readStoredAchievements();
  const newlyUnlocked: AchievementBadge[] = [];
  const unlockedAt = new Date().toISOString();
  for (const id of candidateIds) {
    if (latest[id]) continue;
    const def = BADGE_DEFINITIONS.find((b) => b.id === id);
    if (!def) continue;
    latest[id] = { unlockedAt };
    newlyUnlocked.push({
      ...def,
      isUnlocked: true,
      unlockedAt,
      currentValue: def.targetValue,
      progress: 100,
    });
  }

  if (newlyUnlocked.length === 0) return [];

  // Persist first; only award XP once the unlock is safely stored
  try {
    localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(latest));
  } catch (err) {
    console.warn("Failed to persist achievements:", err);
    return [];
  }

  for (const badge of newlyUnlocked) {
    awardXP(badge.xpBonus);
  }

  try {
    triggerConfetti(2500);
    window.dispatchEvent(
      new CustomEvent("myenglish-badge-unlocked", {
        detail: { badges: newlyUnlocked },
      })
    );
  } catch {}

  return newlyUnlocked;
}
