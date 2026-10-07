import { Rating } from "ts-fsrs";
import {
  calculateUrgencyScore,
  generateMultipleChoiceQuestion,
  isBuriedBySibling,
  isNewCard,
  isSuspended,
} from "./smartReview";
import { getWordsByIds, isPlaceholderMeaning } from "./db";
import { getDueCards, toCard } from "./cards";
import { checkAndUnlockAchievements } from "./achievements";
import { popupAnswerRating } from "./popupSession";
import { recordCardAnswer, schedulingDecision } from "./reviewRecorder";
import { celebrationFor } from "./celebrations";
import { minutesFor, type ComebackStatus } from "./comeback";
import type { ReminderMoment } from "./reminderMoments";
import type { WordDetail, CardDirection, ReviewCard } from "@/types/database";
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
  direction: CardDirection;
  /** A due card (the answer is a scheduled review) rather than practice */
  scheduled?: boolean;
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
  /** Back after a break: welcome and today's share only, never streak pressure or guilt */
  comeback?: ComebackStatus | null;
  /** Shown at a natural transition (back at the computer, screen share over...) */
  moment?: ReminderMoment | null;
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
  const { dueCount, consecutiveSkips, streak, todayCount, dailyGoal, hour, comeback } = params;

  // 0. Back after a break: the streak is gone and the pile is big, pressure here makes people quit
  if (comeback && !comeback.caughtUp && comeback.todayRemaining > 0) {
    const minutes = minutesFor(comeback.todayRemaining);
    const first = comeback.dayNumber === 1 && comeback.todayDone === 0;
    return {
      tone: "level_1_encouraging",
      title: first ? "Chào mừng bạn quay lại 👋" : `Kế hoạch quay lại · ngày ${comeback.dayNumber}`,
      message: first
        ? `Không cần ôn hết một lúc. Hôm nay chỉ ${comeback.todayRemaining} thẻ dễ quên nhất (~${minutes} phút).`
        : `Còn ${comeback.todayRemaining} thẻ của phần hôm nay (~${minutes} phút). Một câu nhanh ngay đây cũng được.`,
      mascotMood: "happy",
      isMicroQuizPreferred: true,
    };
  }

  // 0b. A natural transition: say why now, keep it short and optional
  if (params.moment && dueCount > 0) {
    const minutes = minutesFor(Math.min(dueCount, 10));
    const moments: Record<ReminderMoment, { title: string; message: string; quiz: boolean }> = {
      morning: {
        title: "Chào buổi sáng ☀️",
        message: `Khởi động ngày mới với vài thẻ (~${minutes} phút) trước khi vào việc?`,
        quiz: false,
      },
      back: {
        title: "Chào mừng quay lại máy 👋",
        message: `Trước khi vào việc tiếp: ôn nhanh vài thẻ, khoảng ${minutes} phút.`,
        quiz: false,
      },
      after_share: {
        title: "Vừa trình bày xong?",
        message: "Nghỉ tay một chút với 1 câu ôn nhanh rồi quay lại việc.",
        quiz: true,
      },
      after_fullscreen: {
        title: "Vừa xong một việc?",
        message: "Tranh thủ 1 câu ôn trước khi bắt đầu việc tiếp theo.",
        quiz: true,
      },
    };
    const m = moments[params.moment];
    return { tone: "level_1_encouraging", title: m.title, message: m.message, mascotMood: "happy", isMicroQuizPreferred: m.quiz };
  }

  const isGoalReached = todayCount >= dailyGoal;
  const isLateEvening = hour >= 20 || hour < 4;
  const isLunchTime = hour >= 11 && hour <= 13;
  const isWorkEnd = hour >= 17 && hour <= 19;

  // 1. Level 4: Extreme drama & resignation (user skipped >= 3 times)
  if (consecutiveSkips >= 3) {
    const dramaMessages = [
      {
        title: "Chỉ 1 câu khi bạn rảnh tay",
        message: `Có ${dueCount} thẻ đang chờ. Một câu trắc nghiệm ~10 giây cũng giúp giữ trí nhớ — hoặc cứ hoãn nếu đang bận.`,
      },
      {
        title: "Ôn ngắn, lúc nào cũng được",
        message: "Ôn muộn vài giờ không sao: FSRS sẽ tính lại lịch theo đúng lúc bạn ôn.",
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
        title: `Chuỗi ${streak > 0 ? streak : 1} ngày`,
        message: `Hôm nay: ${todayCount}/${dailyGoal}. Vài câu là giữ được chuỗi (và bạn còn lượt đóng băng nếu cần).`,
      },
      {
        title: "Trước khi kết thúc ngày",
        message: `Mục tiêu hôm nay: ${todayCount}/${dailyGoal} thẻ. Ôn ~2 phút nếu bạn muốn giữ nhịp.`,
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
        title: "Khi nào rảnh tay",
        message: `${dueCount} thẻ đang chờ, khoảng ${Math.max(1, Math.round(dueCount * 0.2))} phút. Hoặc thử 1 câu nhanh ngay đây.`,
      },
      {
        title: "Một câu nhanh?",
        message: "Một câu trắc nghiệm ~10 giây, rồi quay lại việc đang làm.",
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
 * The nudge's one-question quiz: "what does <English word> mean?" with 3 options. It is a recognition
 * question, so only recognition cards are asked:
 *  - a due recognition card that was already studied (never a brand-new word: it has not been introduced)
 *    -> the answer is a scheduled review, graded like the popup (never Easy)
 *  - nothing due -> a word studied before, as practice (logged, schedule untouched)
 * Cards reviewed in the last 45 minutes are avoided, and the pick is weighted among the top 5 so the
 * same word is not asked every time.
 */
export function selectMicroQuizQuestion(
  dueWords: WordDetail[],
  allWords: WordDetail[],
  now: Date = new Date()
): MicroQuizQuestion | null {
  if (allWords.length === 0) return null;
  const usable = (w: WordDetail) => !isPlaceholderMeaning(w.meaning_vn) && !isSuspended(w);

  const dueCards = dueWords
    .filter(usable)
    .flatMap((w) => getDueCards(w, now))
    .filter((c) => c.direction === "recognition" && !isNewCard(c) && !isBuriedBySibling(c, now));
  const scheduled = dueCards.length > 0;
  const candidatePool: ReviewCard[] = scheduled
    ? dueCards
    : allWords.filter((w) => usable(w) && (w.srs.reps ?? 0) > 0).map((w) => toCard(w, "recognition"));
  if (candidatePool.length === 0) return null;

  const RECENT_COOLDOWN_MS = 45 * 60 * 1000;
  const nonRecent = candidatePool.filter((c) => {
    const lastRev = c.srs?.last_review;
    return !lastRev || now.getTime() - new Date(lastRev).getTime() > RECENT_COOLDOWN_MS;
  });
  const active = nonRecent.length > 0 ? nonRecent : candidatePool;

  const scored = active
    .map((c) => ({ card: c, score: calculateUrgencyScore(c, now).urgencyScore }))
    .sort((a, b) => b.score - a.score);
  const topK = scored.slice(0, Math.min(5, scored.length));
  let targetCard = topK[0].card;
  if (topK.length > 1) {
    const total = topK.reduce((sum, _, i) => sum + (topK.length - i), 0);
    let rand = Math.random() * total;
    for (let i = 0; i < topK.length; i++) {
      rand -= topK.length - i;
      if (rand <= 0) {
        targetCard = topK[i].card;
        break;
      }
    }
  }

  const mcq = generateMultipleChoiceQuestion(targetCard, allWords, "en_to_vn");
  const correctOpt = mcq.options.find((o) => o.isCorrect);
  const compactOptions = [...mcq.options.filter((o) => !o.isCorrect).slice(0, 2), ...(correctOpt ? [correctOpt] : [])].sort(
    () => 0.5 - Math.random()
  );

  return {
    wordId: targetCard.id,
    word: targetCard.word,
    direction: "recognition",
    scheduled,
    promptTitle: targetCard.word,
    phonetic: targetCard.phonetic || undefined,
    partOfSpeech: targetCard.part_of_speech || undefined,
    targetMeaning: targetCard.meaning_vn,
    options: compactOptions.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
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
  /** The answer moved the word's schedule (false = practice) */
  scheduled?: boolean;
  /** Short praise when the word reached long-term memory or was remembered just before fading */
  praise?: string | null;
}

const RATING_LABEL: Record<number, MicroQuizEvaluationResult["ratingLabel"]> = {
  [Rating.Again]: "Again",
  [Rating.Hard]: "Hard",
  [Rating.Good]: "Good",
  [Rating.Easy]: "Easy",
};

/**
 * Grade the micro-quiz answer through the same path as the popup and flashcards (recordCardAnswer):
 * the schedule only moves when the recognition card is due; otherwise the answer is practice.
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
  const picked = options.find((o) => o.id === selectedChoiceId);
  const isCorrect = picked ? picked.isCorrect : false;
  const rating = popupAnswerRating(isCorrect, "multiple_choice", responseTimeMs);

  // Re-read the word: the nudge payload may be minutes old
  const [word] = await getWordsByIds([wordId]).catch(() => [] as WordDetail[]);
  let xpEarned = 0;
  let scheduled = false;
  let praise: string | null = null;
  if (word) {
    const card = toCard(word, "recognition");
    const decision = schedulingDecision({ card, exerciseType: "multiple_choice" });
    // Brand-new words are never graded from a 3-option guess
    scheduled = decision.scheduled && !isNewCard(card);
    const recorded = await recordCardAnswer({
      card,
      exerciseType: "multiple_choice",
      rating,
      wrongAttempts: isCorrect ? 0 : 1,
      responseTimeMs,
      scheduled,
      countsForDailyGoal: true,
    });
    xpEarned = recorded.xp.totalXP;
    praise = celebrationFor({ ...recorded, direction: "recognition", word: word.word })?.title ?? null;
  }

  resetConsecutiveSkipCount();
  if (scheduled) {
    checkAndUnlockAchievements({
      consecutiveCorrect: isCorrect ? 1 : 0,
      sessionReviewCount: 1,
      leechesSlain: 0,
      responseTimeMs,
      isCorrect,
    });
  }

  return {
    isCorrect,
    rating,
    ratingLabel: RATING_LABEL[rating],
    correctMeaning: targetMeaning,
    responseTimeMs,
    streakUpdated: true,
    xpEarned,
    scheduled,
    praise,
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
