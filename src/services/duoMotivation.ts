import { Rating } from "ts-fsrs";
import {
  calculateUrgencyScore,
  generateMultipleChoiceQuestion,
  saveReviewLog,
  calculateXPReward,
  awardXP,
  cleanMeaningForOption,
} from "./smartReview";
import { isPlaceholderMeaning } from "./db";
import { recordReview } from "./srs";
import { recordDailyActivity } from "./streak";
import { getDueCards, practiceCards } from "./cards";
import { checkAndUnlockAchievements } from "./achievements";
import type { WordDetail, CardDirection, ReviewCard } from "@/types/database";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

export type DuoToneLevel =
  | "level_1_encouraging"
  | "level_2_playful_guilt"
  | "level_3_streak_fomo"
  | "level_4_drama_resignation";

export type DuoMascotMood = "happy" | "pleading" | "alarm" | "dramatic";

export interface MicroQuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface MicroQuizQuestion {
  wordId: string;
  word: string;
  direction: CardDirection;
  promptTitle?: string;
  phonetic?: string;
  partOfSpeech?: string;
  targetMeaning: string;
  options: MicroQuizOption[];
}

export interface DuoMotivationState {
  tone: DuoToneLevel;
  title: string;
  message: string;
  mascotMood: DuoMascotMood;
  isMicroQuizPreferred: boolean;
}

export interface MotivationEvaluationParams {
  dueCount: number;
  consecutiveSkips: number;
  streak: number;
  todayCount: number;
  dailyGoal: number;
  hour: number;
}

const CONSECUTIVE_SKIPS_KEY = "myenglish_duo_consecutive_skips_v1";

/**
 * Get the consecutive skip/snooze count from storage
 */
export function getConsecutiveSkipCount(): number {
  try {
    const raw = localStorage.getItem(CONSECUTIVE_SKIPS_KEY);
    const n = parseInt(raw || "0", 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Increment the consecutive skip count when user skips, snoozes or ignores
 */
export function incrementConsecutiveSkipCount(): number {
  const current = getConsecutiveSkipCount();
  const next = current + 1;
  try {
    localStorage.setItem(CONSECUTIVE_SKIPS_KEY, String(next));
  } catch {}
  return next;
}

/**
 * Reset consecutive skip count to 0 (called whenever user reviews or completes a quiz)
 */
export function resetConsecutiveSkipCount(): void {
  try {
    localStorage.removeItem(CONSECUTIVE_SKIPS_KEY);
  } catch {}
}

/**
 * Algorithm: Determine user's psychological state and select Duolingo-style messaging tone
 */
export function evaluateMotivationState(params: MotivationEvaluationParams): DuoMotivationState {
  const { dueCount, consecutiveSkips, streak, todayCount, dailyGoal, hour } = params;
  const isGoalReached = todayCount >= dailyGoal;
  const isLateEvening = hour >= 20 || hour < 4;
  const isLunchTime = hour >= 11 && hour <= 13;
  const isWorkEnd = hour >= 17 && hour <= 19;

  // 1. Level 4: Extreme drama & resignation (user skipped >= 3 times)
  if (consecutiveSkips >= 3) {
    const dramaMessages = [
      {
        title: "Tôi ổn mà... thật đấy 🥀",
        message: "Từ vựng đang ngồi khóc một góc trong cơ sở dữ liệu. Nhưng thôi, bạn bận thì mình tự học vậy...",
      },
      {
        title: "Cú xanh giận rồi đấy! 🪦",
        message: "Bạn đã lướt qua tôi 3 lần liên tiếp. Chỉ đúng 1 từ duy nhất thôi mà bạn cũng tiếc sao?",
      },
      {
        title: "Lời nhắn cuối cùng hôm nay 🥺",
        message: "Nếu bạn không ôn, những từ này sẽ bay màu khỏi não bạn mãi mãi. Bấm 1 cái cứu chúng đi!",
      },
    ];
    const picked = dramaMessages[consecutiveSkips % dramaMessages.length];
    return {
      tone: "level_4_drama_resignation",
      title: picked.title,
      message: picked.message,
      mascotMood: "dramatic",
      isMicroQuizPreferred: true, // Auto trigger micro-quiz to reduce friction
    };
  }

  // 2. Level 3: Streak FOMO & Urgent Save (Late evening or high streak at risk)
  if (!isGoalReached && (isLateEvening || (streak > 0 && hour >= 19))) {
    const fomoMessages = [
      {
        title: `🔥 Cứu Streak ${streak > 0 ? streak : 1} ngày!`,
        message: `Chỉ còn vài tiếng nữa là hết ngày! Hoàn thành nốt mục tiêu để không bị đóng băng chuỗi nhé!`,
      },
      {
        title: "Báo động đỏ trước giờ ngủ 🚨",
        message: `Mục tiêu hôm nay: ${todayCount}/${dailyGoal} từ. Làm nhanh 1 câu để bảo vệ chuỗi học!`,
      },
    ];
    const picked = fomoMessages[consecutiveSkips % fomoMessages.length];
    return {
      tone: "level_3_streak_fomo",
      title: picked.title,
      message: picked.message,
      mascotMood: "alarm",
      isMicroQuizPreferred: true,
    };
  }

  // 3. Level 2: Playful guilt (skipped 1-2 times)
  if (consecutiveSkips >= 1) {
    const guiltMessages = [
      {
        title: "Lại bấm Hoãn nữa à? 👀",
        message: "Đừng để từ vựng bơ vơ quá lâu! 30 giây thôi là xong ngay mà.",
      },
      {
        title: "Tiếng Anh nhớ bạn rồi đó! 🥺",
        message: "Biết bạn bận, vậy làm đúng 1 câu trắc nghiệm nhanh 10 giây này thôi nhé?",
      },
      {
        title: "Deadline dí quá hả bạn ơi? 🏃",
        message: "Nghỉ tay 1 chút, kiểm tra nhanh trí nhớ với 1 từ vựng này rồi làm tiếp nha!",
      },
    ];
    const picked = guiltMessages[(consecutiveSkips - 1) % guiltMessages.length];
    return {
      tone: "level_2_playful_guilt",
      title: picked.title,
      message: picked.message,
      mascotMood: "pleading",
      isMicroQuizPreferred: consecutiveSkips >= 2 || dueCount > 15,
    };
  }

  // 4. Backlog Relief: Large backlog of due words (> 20 words)
  if (dueCount >= 20) {
    return {
      tone: "level_1_encouraging",
      title: `⚡ Cứu hộ khẩn cấp (${dueCount} từ)`,
      message: "Đừng sợ số lượng nhiều! Chỉ cần 1 phút lướt nhanh vài từ quan trọng nhất là nhẹ gánh ngay.",
      mascotMood: "alarm",
      isMicroQuizPreferred: false,
    };
  }

  // 5. Smart Timing context messages (Level 1)
  if (isLunchTime) {
    return {
      tone: "level_1_encouraging",
      title: "Tráng miệng bằng tiếng Anh nhé! 🍜",
      message: "Ăn trưa no chưa bạn? Khởi động não nhẹ nhàng với vài từ vựng rồi nghỉ trưa nào!",
      mascotMood: "happy",
      isMicroQuizPreferred: false,
    };
  }

  if (isWorkEnd) {
    return {
      tone: "level_1_encouraging",
      title: "Gập task xả hơi thôi! 🎯",
      message: "Kết thúc ngày làm việc rồi. Nạp nhanh vài từ vựng để giữ nhịp tiến bộ mỗi ngày!",
      mascotMood: "happy",
      isMicroQuizPreferred: false,
    };
  }

  // Default Level 1 encouraging
  return {
    tone: "level_1_encouraging",
    title: "Đến giờ ôn tập rồi bạn ơi! 🦉",
    message: dueCount > 0 ? `Có ${dueCount} từ cần bạn điểm danh. 1 phút là xong!` : "Ôn nhanh vài câu để ghi nhớ sâu nào!",
    mascotMood: "happy",
    isMicroQuizPreferred: false,
  };
}

/**
 * Algorithm: Select the single most urgent card for Micro-Quiz using FSRS urgency scoring
 * Supports both recognition (en_to_vn) and production (vn_to_en) cards.
 * Avoids picking cards that were reviewed very recently (cooldown).
 * Uses weighted selection among top candidate cards to avoid repeating the exact same word.
 */
export function selectMicroQuizQuestion(
  dueWords: WordDetail[],
  allWords: WordDetail[],
  now: Date = new Date()
): MicroQuizQuestion | null {
  if (allWords.length === 0) return null;

  // 1. Gather candidate cards: prioritize cards that are actually due
  const dueCards = dueWords
    .filter((w) => !isPlaceholderMeaning(w.meaning_vn))
    .flatMap((w) => getDueCards(w, now));

  const candidatePool: ReviewCard[] =
    dueCards.length > 0
      ? dueCards
      : practiceCards(allWords.filter((w) => !isPlaceholderMeaning(w.meaning_vn)));

  if (candidatePool.length === 0) return null;

  // 2. Cooldown filter: deprioritize cards reviewed in the last 45 minutes
  const RECENT_COOLDOWN_MS = 45 * 60 * 1000;
  const nonRecentCandidates = candidatePool.filter((c) => {
    const lastRev = c.srs?.last_review;
    if (!lastRev) return true;
    return now.getTime() - new Date(lastRev).getTime() > RECENT_COOLDOWN_MS;
  });

  // If all cards were reviewed recently, fall back to candidatePool
  const activeCandidates = nonRecentCandidates.length > 0 ? nonRecentCandidates : candidatePool;

  // 3. Score urgency for all candidates using the FSRS urgency algorithm
  const scored = activeCandidates.map((c) => ({
    card: c,
    score: calculateUrgencyScore(c, now).urgencyScore,
  }));

  // Sort highest urgency first
  scored.sort((a, b) => b.score - a.score);

  // 4. To avoid locking into a single word endlessly, take top K candidates and pick with weighted probability
  const topK = scored.slice(0, Math.min(5, scored.length));
  let targetCard: ReviewCard;

  if (topK.length === 1) {
    targetCard = topK[0].card;
  } else {
    // Weighted selection: higher urgency score has higher probability
    const minScore = Math.min(...topK.map((item) => item.score));
    const shiftedWeights = topK.map((item) => Math.max(1, Math.round(item.score - minScore + 5)));
    const totalWeight = shiftedWeights.reduce((sum, w) => sum + w, 0);
    let rand = Math.random() * totalWeight;
    let chosenIdx = 0;
    for (let i = 0; i < topK.length; i++) {
      rand -= shiftedWeights[i];
      if (rand <= 0) {
        chosenIdx = i;
        break;
      }
    }
    targetCard = topK[chosenIdx].card;
  }

  // 5. Generate multiple choice question according to card direction
  const isProduction = targetCard.direction === "production";
  const promptType = isProduction ? "vn_to_en" : "en_to_vn";
  const mcq = generateMultipleChoiceQuestion(targetCard, allWords, promptType);

  // Limit to 3 options for clean compact desktop notification/nudge
  const compactOptions = mcq.options.slice(0, 3);

  // Ensure correct option is always present in compact options
  if (!compactOptions.some((o) => o.isCorrect)) {
    const correctOpt = mcq.options.find((o) => o.isCorrect);
    if (correctOpt) {
      compactOptions[compactOptions.length - 1] = correctOpt;
    }
  }

  const promptTitle = isProduction
    ? cleanMeaningForOption(targetCard.meaning_vn)
    : targetCard.word;

  return {
    wordId: targetCard.id,
    word: targetCard.word,
    direction: targetCard.direction,
    promptTitle,
    phonetic: isProduction ? undefined : targetCard.phonetic || undefined,
    partOfSpeech: targetCard.part_of_speech || undefined,
    targetMeaning: targetCard.meaning_vn,
    options: compactOptions.map((o) => ({
      id: o.id,
      text: o.text,
      isCorrect: o.isCorrect,
    })),
  };
}

export interface MicroQuizEvaluationResult {
  isCorrect: boolean;
  rating: Rating;
  ratingLabel: "Again" | "Hard" | "Good" | "Easy";
  correctMeaning: string;
  responseTimeMs: number;
  streakUpdated: boolean;
  xpEarned?: number;
}

/**
 * Algorithm: Evaluate user's Micro-Quiz response, record FSRS memory parameters,
 * persist review log, award XP, update Streak, check achievements, and notify all windows.
 */
export async function evaluateMicroQuizAnswer(params: {
  wordId: string;
  selectedChoiceId: string;
  options: MicroQuizOption[];
  targetMeaning: string;
  responseTimeMs: number;
  direction?: CardDirection;
}): Promise<MicroQuizEvaluationResult> {
  const { wordId, selectedChoiceId, options, targetMeaning, responseTimeMs } = params;
  const direction: CardDirection = params.direction || "recognition";
  const picked = options.find((o) => o.id === selectedChoiceId);
  const isCorrect = picked ? picked.isCorrect : false;
  const wrongAttempts = isCorrect ? 0 : 1;

  // 1. Algorithmic Rating derivation (FSRS scale 1-4 based on accuracy and response time)
  let rating: Rating;
  let ratingLabel: "Again" | "Hard" | "Good" | "Easy";

  if (!isCorrect) {
    rating = Rating.Again;
    ratingLabel = "Again";
  } else if (responseTimeMs < 3500) {
    rating = Rating.Easy;
    ratingLabel = "Easy";
  } else if (responseTimeMs < 8000) {
    rating = Rating.Good;
    ratingLabel = "Good";
  } else {
    rating = Rating.Hard;
    ratingLabel = "Hard";
  }

  // 2. Persist to SQLite using FSRS algorithm with the exact card direction
  const srsResult = await recordReview(wordId, rating, direction);

  // 3. Calculate and award XP reward (identical to Dashboard & Popup)
  const xpReward = calculateXPReward(
    rating,
    "multiple_choice",
    wrongAttempts,
    responseTimeMs,
    false,
    isCorrect
  );
  if (xpReward.totalXP > 0) {
    awardXP(xpReward.totalXP);
  }

  // 4. Record review log in SQLite (identical to Dashboard & Popup)
  await saveReviewLog({
    wordId,
    exerciseType: "multiple_choice",
    responseTimeMs,
    isCorrect,
    wrongAttempts,
    rating,
    xpEarned: xpReward.totalXP,
    timestamp: new Date().toISOString(),
    isScheduled: true,
    direction: srsResult.direction || direction,
  }).catch((err) => console.warn("Failed to save micro-quiz review log:", err));

  // 5. Update Streak & daily activity
  recordDailyActivity(1);

  // 6. Reset consecutive skips because user interacted positively
  resetConsecutiveSkipCount();

  // 7. Check and unlock achievements
  checkAndUnlockAchievements({
    consecutiveCorrect: isCorrect ? 1 : 0,
    sessionReviewCount: 1,
    leechesSlain: 0,
    responseTimeMs,
    isCorrect,
  });

  // 8. Emit words-changed event to sync all windows (Dashboard, Popup, Tray)
  try {
    await emit("words-changed");
  } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("words-changed"));
  }

  return {
    isCorrect,
    rating,
    ratingLabel,
    correctMeaning: targetMeaning,
    responseTimeMs,
    streakUpdated: true,
    xpEarned: xpReward.totalXP,
  };
}

/**
 * Send native desktop notification with Duolingo-style copy
 */
export async function sendDuoDesktopNotification(
  motivation: DuoMotivationState,
  dueCount: number
): Promise<boolean> {
  try {
    const title = motivation.title;
    const body = `${motivation.message} (${dueCount} từ cần ôn)`;
    return await invoke<boolean>("send_desktop_notification", { title, body });
  } catch (err) {
    console.warn("Failed to send Duo desktop notification:", err);
    return false;
  }
}
