import { Rating } from "ts-fsrs";
import { calculateUrgencyScore, generateMultipleChoiceQuestion } from "./smartReview";
import { recordReview } from "./srs";
import { recordDailyActivity } from "./streak";
import type { WordDetail } from "@/types/database";
import { invoke } from "@tauri-apps/api/core";

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
 * Algorithm: Select the single most urgent word for Micro-Quiz using FSRS urgency scoring
 */
export function selectMicroQuizQuestion(
  dueWords: WordDetail[],
  allWords: WordDetail[],
  now: Date = new Date()
): MicroQuizQuestion | null {
  if (allWords.length === 0) return null;

  // 1. Prioritize words from dueWords; if none are due, use all words
  const candidatePool = dueWords.length > 0 ? dueWords : allWords;

  // 2. Score urgency for all candidates using the FSRS urgency algorithm
  const scored = candidatePool
    .filter((w) => w.word && w.meaning_vn)
    .map((w) => ({
      word: w,
      score: calculateUrgencyScore(w, now).urgencyScore,
    }));

  if (scored.length === 0) return null;

  // Sort highest urgency first
  scored.sort((a, b) => b.score - a.score);
  const target = scored[0].word;

  // 3. Generate 3 multiple choice options (1 correct, 2 plausible distractors)
  const mcq = generateMultipleChoiceQuestion(target, allWords, "en_to_vn");
  // Limit to 3 options for clean compact desktop notification/nudge
  const compactOptions = mcq.options.slice(0, 3);

  // Ensure correct option is always present in compact options
  if (!compactOptions.some((o) => o.isCorrect)) {
    const correctOpt = mcq.options.find((o) => o.isCorrect);
    if (correctOpt) {
      compactOptions[compactOptions.length - 1] = correctOpt;
    }
  }

  return {
    wordId: target.id,
    word: target.word,
    phonetic: target.phonetic || undefined,
    partOfSpeech: target.part_of_speech || undefined,
    targetMeaning: target.meaning_vn,
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
}

/**
 * Algorithm: Evaluate user's Micro-Quiz response, record FSRS memory parameters, and update Streak
 */
export async function evaluateMicroQuizAnswer(params: {
  wordId: string;
  selectedChoiceId: string;
  options: MicroQuizOption[];
  targetMeaning: string;
  responseTimeMs: number;
}): Promise<MicroQuizEvaluationResult> {
  const { wordId, selectedChoiceId, options, targetMeaning, responseTimeMs } = params;
  const picked = options.find((o) => o.id === selectedChoiceId);
  const isCorrect = picked ? picked.isCorrect : false;

  // 1. Algorithmic Rating derivation (FSRS scale 1-4)
  let rating: Rating;
  let ratingLabel: "Again" | "Hard" | "Good" | "Easy";

  if (!isCorrect) {
    rating = Rating.Again;
    ratingLabel = "Again";
  } else if (responseTimeMs < 3500) {
    // Fast, confident answer
    rating = Rating.Easy;
    ratingLabel = "Easy";
  } else if (responseTimeMs < 8000) {
    // Normal correct answer
    rating = Rating.Good;
    ratingLabel = "Good";
  } else {
    // Hesitant answer (> 8s)
    rating = Rating.Hard;
    ratingLabel = "Hard";
  }

  // 2. Persist to SQLite using FSRS algorithm
  await recordReview(wordId, rating, "recognition");

  // 3. Update Streak & daily activity
  recordDailyActivity(1);

  // 4. Reset consecutive skips because user interacted positively
  resetConsecutiveSkipCount();

  return {
    isCorrect,
    rating,
    ratingLabel,
    correctMeaning: targetMeaning,
    responseTimeMs,
    streakUpdated: true,
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
