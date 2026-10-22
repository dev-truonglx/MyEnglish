import { Rating } from "ts-fsrs";
import {
  calculateRetrievability,
  calculateUrgencyScore,
  generateMultipleChoiceQuestion,
  isBuriedBySibling,
  isNewCard,
  isSuspended,
  needsRelearnIntro,
} from "./smartReview";
import { getWordsByIds, isPlaceholderMeaning } from "./db";
import { getDueCards, toCard } from "./cards";
import { checkAndUnlockAchievements, recordFirstTryCorrect } from "./achievements";
import { popupAnswerRating } from "./popupSession";
import { recordCardAnswer, schedulingDecision } from "./reviewRecorder";
import { celebrationFor } from "./celebrations";
import { minutesFor, type ComebackStatus } from "./comeback";
import type { ReminderMoment } from "./reminderMoments";
import type { WordDetail, CardDirection, ReviewCard } from "@/types/database";
import { invoke } from "@tauri-apps/api/core";
import { shuffle } from "@/lib/utils";

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
  /** Streak freezes in stock: only mentioned when there really is one */
  freezes?: number;
  /** When the reminder shows: picks the day's wording (default: now). The branch still follows `hour`. */
  now?: Date;
  /** Due words already studied whose recall chance fell under FADING_RETRIEVABILITY (countFadingWords) */
  fadingCount?: number;
  /** New words the daily budget still allows today */
  newToday?: number;
  /** Daily quests not done yet today */
  questsLeft?: number;
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

// ─── Reminder copy ───────────────────────────────────────────────────────────
// Each branch has several wordings so a daily reminder doesn't read the same every day. The day's wording is
// chosen from the local date (copyVariantIndex): stable within a day, never the same two days in a row.

/** What a reminder's wording may mention */
export interface ReminderCopyFacts {
  dueCount: number;
  streak: number;
  freezes: number;
  todayCount: number;
  dailyGoal: number;
  /** 0: unknown or none, the wording then says something else */
  fadingCount: number;
  newToday: number;
  questsLeft: number;
}

export interface ReminderCopy {
  title: string;
  message: string;
}

export type ReminderBranch =
  | "many_skips"
  | "evening"
  | "skipped"
  | "backlog"
  | "lunch"
  | "work_end"
  | "default"
  | `moment_${ReminderMoment}`;

type Variant = (f: ReminderCopyFacts) => ReminderCopy;

// Honest time estimates (~15 s per card), never "1 minute" for a pile of 19 cards
const dueMinutes = (f: ReminderCopyFacts) => minutesFor(Math.max(1, f.dueCount));
/** A moment asks for a short round: at most 10 cards */
const roundMinutes = (f: ReminderCopyFacts) => minutesFor(Math.min(Math.max(1, f.dueCount), 10));
const goalLeft = (f: ReminderCopyFacts) => Math.max(0, f.dailyGoal - f.todayCount);

/** A moment keeps its title (it says why now); only the message varies */
const momentVariants = (title: string, messages: Array<(f: ReminderCopyFacts, minutes: number) => string>): Variant[] =>
  messages.map((say) => (f) => ({ title, message: say(f, roundMinutes(f)) }));

const MOMENT_QUIZ: Record<ReminderMoment, boolean> = {
  morning: false,
  back: false,
  after_share: true,
  after_fullscreen: true,
  anchor_lunch: false,
  anchor_evening: false,
};

const COPY: Record<ReminderBranch, Variant[]> = {
  // Skipped 3+ times: no pressure at all, only the smallest step (one question) or "later is fine"
  many_skips: [
    (f) => ({
      title: "Chỉ 1 câu khi bạn rảnh tay",
      message: `${f.dueCount > 0 ? `Có ${f.dueCount} thẻ đang chờ. ` : ""}Một câu trắc nghiệm ~10 giây cũng giúp giữ trí nhớ — hoặc cứ hoãn nếu đang bận.`,
    }),
    () => ({ title: "Ôn ngắn, lúc nào cũng được", message: "Ôn muộn vài giờ không sao: app tự xếp lại lịch theo lúc bạn ôn." }),
    () => ({ title: "Bận thì cứ hoãn nhé", message: "Xong việc rồi quay lại cũng được. Lúc đó 1 câu ngay trong thẻ này là đủ." }),
    (f) =>
      f.fadingCount > 0
        ? { title: `${f.fadingCount} từ đang phai dần`, message: "Trả lời 1 câu là kéo lại được một từ, không cần mở cả phiên học." }
        : { title: "Một câu cũng được tính", message: "Mỗi câu trả lời đều cộng vào tiến độ hôm nay, kể cả khi chỉ làm 1 câu." },
    () => ({ title: "Giữa hai việc ☕", message: "Đang chờ build hay chờ họp? 1 câu ~10 giây vừa khít khoảng trống đó." }),
  ],

  // Late in the day, goal not reached. A streak is kept by one answer, so once today has one it is safe.
  evening: [
    (f) => {
      if (f.streak <= 0) return { title: "Bắt đầu chuỗi hôm nay", message: "Chỉ 1 câu là có ngày học đầu tiên của chuỗi." };
      if (f.todayCount > 0) {
        return { title: `Chuỗi ${f.streak} ngày`, message: `Hôm nay: ${f.todayCount}/${f.dailyGoal}. Chuỗi đã được giữ, thêm vài câu là đạt mục tiêu.` };
      }
      return {
        title: `Chuỗi ${f.streak} ngày`,
        message: `Hôm nay: 0/${f.dailyGoal}. Chỉ 1 câu là giữ được chuỗi${f.freezes > 0 ? ` (bạn còn ${f.freezes} lượt đóng băng nếu cần).` : "."}`,
      };
    },
    (f) => ({ title: "Trước khi kết thúc ngày", message: `Mục tiêu hôm nay: ${f.todayCount}/${f.dailyGoal} câu. Ôn ~2 phút nếu bạn muốn giữ nhịp.` }),
    (f) => ({
      title: "Ôn nhẹ buổi tối 🌙",
      message:
        f.fadingCount > 0
          ? `${f.fadingCount} từ đang sắp quên. Ôn chúng tối nay, ngủ một giấc là nhớ chắc hơn.`
          : "Vài từ buổi tối, ngủ một giấc là nhớ chắc hơn.",
    }),
    (f) =>
      f.questsLeft > 0
        ? { title: "Nhiệm vụ hôm nay 🎯", message: `Còn ${f.questsLeft} nhiệm vụ hôm nay. Làm nhanh một cái trước khi nghỉ?` }
        : f.todayCount > 0
        ? { title: "Một chút nữa thôi", message: `Còn ${goalLeft(f)} câu nữa là đạt mục tiêu ${f.dailyGoal} câu hôm nay.` }
        : { title: "Một câu cho hôm nay", message: "Trả lời 1 câu ngay trong thẻ này là hôm nay đã có ngày học." },
    (f) =>
      f.streak > 0
        ? { title: `${f.streak} ngày liên tiếp rồi 🔥`, message: "Giữ nhịp bằng một vòng ôn ~2 phút trước khi nghỉ." }
        : { title: "Khép lại ngày học", message: "Một vòng ôn ~2 phút trước khi nghỉ, mai lại tiếp." },
  ],

  // Skipped once or twice: a lighter ask, never guilt
  skipped: [
    (f) => ({
      title: "Khi nào rảnh tay",
      message:
        f.dueCount > 0
          ? `${f.dueCount} thẻ đang chờ, khoảng ${dueMinutes(f)} phút. Hoặc thử 1 câu nhanh ngay đây.`
          : "Thử 1 câu nhanh ngay đây, ~10 giây là xong.",
    }),
    () => ({ title: "Một câu nhanh?", message: "Một câu trắc nghiệm ~10 giây, rồi quay lại việc đang làm." }),
    () => ({ title: "Đang chờ build? ⏳", message: "Tranh thủ lúc chờ: 1 câu ôn nhanh ngay trong thẻ này." }),
    (f) =>
      f.fadingCount > 0
        ? { title: `${f.fadingCount} từ sắp quên`, message: "Ôn đúng lúc sắp quên là nhớ lâu nhất. 1 câu nhanh nhé?" }
        : { title: "Không vội đâu", message: "Thẻ sẽ quay lại sau. Còn nếu đang rảnh, 1 câu ~10 giây thôi." },
    (f) => ({
      title: "Tiến độ hôm nay",
      message:
        f.todayCount > 0
          ? `Hôm nay bạn đã làm ${f.todayCount}/${f.dailyGoal} câu. Thêm 1 câu nhanh không?`
          : "Một câu ~10 giây là hôm nay đã có tiến độ.",
    }),
  ],

  // 20+ due: relief, the pile does not have to go at once
  backlog: [
    (f) => ({
      title: "Ôn dần, mỗi lần vài từ",
      message: `Có ${f.dueCount} từ đang chờ, không cần ôn hết một lúc. Vài câu bây giờ là đã nhẹ đi rồi.`,
    }),
    (f) => ({ title: "Từng chút một", message: `${f.dueCount} từ đang chờ nhưng không cần làm hết hôm nay. App hỏi trước những từ cần ôn gấp nhất.` }),
    (f) =>
      f.fadingCount > 0
        ? { title: "Cứu từ sắp quên trước", message: `Trong ${f.dueCount} từ đang chờ có ${f.fadingCount} từ sắp quên. Ôn chúng trước là lời nhất.` }
        : { title: "Một vòng ngắn là đủ", message: `Ôn 10 từ (~${minutesFor(10)} phút) là ${f.dueCount} từ đang chờ đã vơi đi một phần.` },
    () => ({ title: "Không cần bù hết", message: "Ôn muộn thì lịch ôn tự điều chỉnh theo lúc bạn ôn. Cứ vài câu mỗi lần là được." }),
    (f) =>
      f.todayCount > 0
        ? { title: "Đang vơi dần 👍", message: `Hôm nay đã ôn ${f.todayCount} câu. Thêm vài câu nữa là nhẹ hẳn.` }
        : { title: "Bắt đầu từ 1 câu", message: `${f.dueCount} từ nghe thì nhiều, nhưng 1 câu ~10 giây là đã bắt đầu rồi.` },
  ],

  lunch: [
    () => ({
      title: "Tráng miệng bằng tiếng Anh nhé! 🍜",
      message: "Ăn trưa no chưa bạn? Khởi động não nhẹ nhàng với vài từ vựng rồi nghỉ trưa nào!",
    }),
    (f) => ({
      title: "Nghỉ trưa 🍱",
      message:
        f.dueCount > 0
          ? `${f.dueCount} từ đang chờ, khoảng ${dueMinutes(f)} phút: vừa đủ trước giờ nghỉ trưa.`
          : "Vài từ vựng trước giờ nghỉ trưa, nhẹ nhàng thôi.",
    }),
    () => ({ title: "Cà phê trưa ☕", message: "Một ly cà phê, vài từ vựng, rồi buổi chiều làm việc tỉnh táo hơn." }),
    (f) =>
      f.streak > 0
        ? { title: `Chuỗi ${f.streak} ngày 🔥`, message: "Ôn vài từ giờ trưa để giữ nhịp nhé." }
        : { title: "Giờ trưa thảnh thơi", message: "Ôn vài từ giờ trưa, tối về khỏi phải lo." },
    (f) =>
      f.newToday > 0
        ? { title: "Từ mới hôm nay ✨", message: `Còn ${f.newToday} từ mới hôm nay. Giờ trưa làm quen 1–2 từ nhé?` }
        : f.fadingCount > 0
        ? { title: `${f.fadingCount} từ sắp quên`, message: "Ôn vài từ giờ trưa để giữ chúng lại." }
        : { title: "Trưa nay học gì? 🍜", message: "Vài câu ôn nhẹ sau bữa trưa giúp đầu óc tỉnh lại cho buổi chiều." },
  ],

  work_end: [
    () => ({ title: "Gập task xả hơi thôi! 🎯", message: "Kết thúc ngày làm việc rồi. Nạp nhanh vài từ vựng để giữ nhịp tiến bộ mỗi ngày!" }),
    () => ({ title: "Commit xong chưa? ✅", message: "Push code xong thì ôn vài từ rồi hẵng tắt máy nhé." }),
    (f) =>
      f.todayCount >= f.dailyGoal
        ? { title: "Đã đạt mục tiêu 🎉", message: `Hôm nay bạn làm ${f.todayCount} câu rồi. Ôn thêm vài từ nếu còn sức nhé.` }
        : f.todayCount > 0
        ? { title: "Sắp đạt mục tiêu", message: `Hôm nay: ${f.todayCount}/${f.dailyGoal} câu. Còn ${goalLeft(f)} câu nữa trước khi về.` }
        : {
            title: "Một vòng trước khi về",
            message:
              f.dueCount > 0
                ? `${f.dueCount} từ đang chờ, khoảng ${dueMinutes(f)} phút. Xong là tắt máy thảnh thơi.`
                : "Vài phút ôn từ trước khi về là đủ giữ nhịp.",
          },
    () => ({ title: "Hết giờ làm 🌇", message: "Vài phút tiếng Anh để khép lại ngày làm việc, mai lại tiếp." }),
    (f) =>
      f.questsLeft > 0
        ? { title: "Nhiệm vụ hôm nay 🎯", message: `Còn ${f.questsLeft} nhiệm vụ hôm nay. Làm một cái trước khi về?` }
        : f.fadingCount > 0
        ? { title: `${f.fadingCount} từ sắp quên`, message: "Ôn chúng trước khi về để không trôi mất qua đêm." }
        : { title: "Trước khi rời máy", message: "Ôn vài từ rồi tắt máy, một ngày làm việc trọn vẹn." },
  ],

  default: [
    (f) => ({
      title: "Đến giờ ôn tập rồi bạn ơi! 🦉",
      message: f.dueCount > 0 ? `Có ${f.dueCount} từ cần bạn điểm danh, khoảng ${dueMinutes(f)} phút.` : "Ôn nhanh vài câu để ghi nhớ sâu nào!",
    }),
    (f) => ({
      title: "Giải lao một chút? ☕",
      message:
        f.dueCount > 0
          ? `Đứng dậy vươn vai, rồi ôn ${f.dueCount} từ trong khoảng ${dueMinutes(f)} phút.`
          : "Đứng dậy vươn vai, rồi ôn vài từ cho đầu óc thư giãn.",
    }),
    () => ({ title: "Chờ CI chạy? ⏳", message: "Tranh thủ lúc chờ build hay deploy: vài câu ôn là vừa." }),
    (f) =>
      f.fadingCount > 0
        ? { title: `${f.fadingCount} từ sắp quên`, message: "Ôn ngay lúc này là đúng thời điểm: chúng đang bắt đầu phai." }
        : f.streak > 0
        ? { title: `Chuỗi ${f.streak} ngày 🔥`, message: "Vài câu ôn nhẹ để giữ nhịp, chẳng mất bao lâu." }
        : { title: "Vài phút cho tiếng Anh", message: "Đều đặn mỗi ngày một ít là cách nhớ từ lâu nhất." },
    (f) =>
      f.questsLeft > 0
        ? { title: "Nhiệm vụ hôm nay 🎯", message: `Còn ${f.questsLeft} nhiệm vụ hôm nay chưa xong. Vài câu ôn là tiến thêm một bước.` }
        : f.newToday > 0
        ? { title: "Có từ mới hôm nay ✨", message: `Hôm nay còn ${f.newToday} từ mới chờ bạn làm quen.` }
        : { title: "Ôn đúng lúc", message: "Từ được hỏi lại đúng lúc bạn sắp quên, nên ôn bây giờ là nhớ lâu nhất." },
  ],

  // A natural transition: say why now, keep it short and optional
  moment_morning: momentVariants("Chào buổi sáng ☀️", [
    (_, m) => `Khởi động ngày mới với vài thẻ (~${m} phút) trước khi vào việc?`,
    (_, m) => `Ôn ~${m} phút trước khi mở email và Slack nhé?`,
    (_, m) => `Một ly cà phê, vài thẻ (~${m} phút), rồi bắt đầu ngày làm việc.`,
    (f, m) =>
      f.newToday > 0
        ? `Hôm nay có ${f.newToday} từ mới chờ bạn. Ôn vài thẻ (~${m} phút) rồi làm quen từ mới nhé?`
        : f.streak > 0
        ? `Giữ chuỗi ${f.streak} ngày bằng vài thẻ buổi sáng (~${m} phút).`
        : `Đầu óc buổi sáng còn tươi: vài thẻ (~${m} phút) trước khi vào việc.`,
  ]),
  moment_back: momentVariants("Chào mừng quay lại máy 👋", [
    (_, m) => `Trước khi vào việc tiếp: ôn nhanh vài thẻ, khoảng ${m} phút.`,
    (_, m) => `Vừa nghỉ xong, khởi động lại bằng vài thẻ (~${m} phút) nhé?`,
    (f, m) => `${f.dueCount} thẻ đang chờ. Ôn ~${m} phút rồi quay lại việc.`,
    (f, m) =>
      f.fadingCount > 0
        ? `Có ${f.fadingCount} từ sắp quên: ôn ngay bây giờ (~${m} phút) là vừa kịp.`
        : `Một vòng ôn ngắn (~${m} phút) trước khi mở lại editor?`,
  ]),
  moment_after_share: momentVariants("Vừa trình bày xong?", [
    () => "Nghỉ tay một chút với 1 câu ôn nhanh rồi quay lại việc.",
    () => "Thả lỏng sau buổi họp với 1 câu trắc nghiệm ~10 giây.",
    () => "Đổi gió một chút: 1 câu tiếng Anh ngay trong thẻ này.",
    (f) => (f.streak > 0 ? `1 câu nhanh cho chuỗi ${f.streak} ngày, rồi làm tiếp việc của bạn.` : "Một câu ~10 giây, rồi làm tiếp việc của bạn."),
  ]),
  moment_after_fullscreen: momentVariants("Vừa xong một việc?", [
    () => "Tranh thủ 1 câu ôn trước khi bắt đầu việc tiếp theo.",
    () => "Xong việc rồi! 1 câu trắc nghiệm ~10 giây để chuyển nhịp.",
    () => "Giữa hai việc: 1 câu ôn nhanh ngay trong thẻ này.",
    (f) => (f.fadingCount > 0 ? `Có ${f.fadingCount} từ sắp quên. Kéo lại một từ bằng 1 câu nhanh?` : "Nghỉ mắt một chút với 1 câu tiếng Anh nhé."),
  ]),
  moment_anchor_lunch: momentVariants("Giờ học sau bữa trưa 🍜", [
    (_, m) => `Như bạn đã hẹn: vài thẻ (~${m} phút) rồi quay lại làm việc.`,
    (_, m) => `Đúng hẹn sau bữa trưa: ôn ~${m} phút cho tỉnh táo.`,
    (_, m) => `Vài thẻ (~${m} phút) trước khi bắt đầu buổi chiều nhé.`,
    (f, m) =>
      f.streak > 0 ? `Giờ hẹn quen thuộc: ôn ~${m} phút, giữ nhịp chuỗi ${f.streak} ngày.` : `Giờ hẹn quen thuộc: ôn ~${m} phút rồi nghỉ trưa.`,
  ]),
  moment_anchor_evening: momentVariants("Trước khi rời máy 🌇", [
    (_, m) => `Như bạn đã hẹn: ôn ~${m} phút để khép lại ngày học.`,
    (_, m) => `Ôn ~${m} phút rồi tắt máy, mai lại tiếp.`,
    (f, m) =>
      f.todayCount >= f.dailyGoal
        ? `Hôm nay đã đạt mục tiêu 🎉. Ôn thêm ~${m} phút nếu bạn muốn.`
        : `Hôm nay: ${f.todayCount}/${f.dailyGoal} câu. Ôn ~${m} phút trước khi về nhé.`,
    (f, m) =>
      f.questsLeft > 0 ? `Còn ${f.questsLeft} nhiệm vụ hôm nay — làm nốt trước khi rời máy?` : `Đúng giờ hẹn: vài thẻ (~${m} phút) là xong ngày học.`,
  ]),
};

export const REMINDER_BRANCHES = Object.keys(COPY) as ReminderBranch[];

/** Every wording of a branch for these facts (tests, previews) */
export function reminderVariants(branch: ReminderBranch, facts: ReminderCopyFacts): ReminderCopy[] {
  return COPY[branch].map((v) => v(facts));
}

/** Days since 1970-01-01 of the local date: the wording changes at local midnight */
export function localDayNumber(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/**
 * 0..n-1 in an order seeded by `seed` (FNV-1a + mulberry32, as dailyQuests' seededRandom; kept here so the
 * reminder window doesn't load the quest module for ten lines)
 */
function seededOrder(seed: string, n: number): number[] {
  let a = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) a = Math.imul(a ^ seed.charCodeAt(i), 0x01000193);
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Which of a branch's `n` wordings to use on `day` (localDayNumber). Each block of n days shows every wording
 * once in a seeded order, and a block never starts with the wording that ended the previous one: the same day
 * always reads the same, two days in a row never do. `shift` (the skip count) moves to another wording within
 * the day, so a reminder shown again after a skip doesn't repeat itself either.
 */
export function copyVariantIndex(branch: string, day: number, n: number, shift: number = 0): number {
  if (n <= 1) return 0;
  const s = Math.max(0, Math.floor(shift));
  if (n === 2) return (((day + s) % 2) + 2) % 2;
  const block = Math.floor(day / n);
  const order = seededOrder(`${branch}:${block}`, n);
  // Only positions 0 and 1 ever move, so the previous block's last day is its raw last entry (n >= 3)
  const previousLast = seededOrder(`${branch}:${block - 1}`, n)[n - 1];
  if (order[0] === previousLast) [order[0], order[1]] = [order[1], order[0]];
  return (order[day - block * n] + s) % n;
}

/**
 * Algorithm: Determine user's psychological state and select Duolingo-style messaging tone
 */
export function evaluateMotivationState(params: MotivationEvaluationParams): DuoMotivationState {
  const { dueCount, consecutiveSkips, streak, todayCount, dailyGoal, hour, comeback, freezes = 0, now = new Date() } = params;
  const facts: ReminderCopyFacts = {
    dueCount,
    streak,
    freezes,
    todayCount,
    dailyGoal,
    fadingCount: Math.max(0, params.fadingCount ?? 0),
    newToday: Math.max(0, params.newToday ?? 0),
    questsLeft: Math.max(0, params.questsLeft ?? 0),
  };
  const say = (branch: ReminderBranch): ReminderCopy => {
    const variants = COPY[branch];
    return variants[copyVariantIndex(branch, localDayNumber(now), variants.length, consecutiveSkips)](facts);
  };

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
    return {
      tone: "level_1_encouraging",
      ...say(`moment_${params.moment}`),
      mascotMood: "happy",
      isMicroQuizPreferred: MOMENT_QUIZ[params.moment],
    };
  }

  const isGoalReached = todayCount >= dailyGoal;
  const isLateEvening = hour >= 20 || hour < 4;
  const isLunchTime = hour >= 11 && hour <= 13;
  const isWorkEnd = hour >= 17 && hour <= 19;

  // 1. Skipped 3+ times: the gentlest ask, and the micro-quiz to make it one click
  if (consecutiveSkips >= 3) {
    return { tone: "level_4_drama_resignation", ...say("many_skips"), mascotMood: "happy", isMicroQuizPreferred: true };
  }

  // 2. Late evening (or a streak at risk after 19h) with the goal not reached
  if (!isGoalReached && (isLateEvening || (streak > 0 && hour >= 19))) {
    return { tone: "level_3_streak_fomo", ...say("evening"), mascotMood: "alarm", isMicroQuizPreferred: true };
  }

  // 3. Skipped 1-2 times
  if (consecutiveSkips >= 1) {
    return {
      tone: "level_2_playful_guilt",
      ...say("skipped"),
      mascotMood: "happy",
      isMicroQuizPreferred: consecutiveSkips >= 2 || dueCount > 15,
    };
  }

  // 4. Large backlog (20+ due): relief
  if (dueCount >= 20) {
    return { tone: "level_1_encouraging", ...say("backlog"), mascotMood: "happy", isMicroQuizPreferred: false };
  }

  // 5. Time of day
  if (isLunchTime) {
    return { tone: "level_1_encouraging", ...say("lunch"), mascotMood: "happy", isMicroQuizPreferred: false };
  }
  if (isWorkEnd) {
    return { tone: "level_1_encouraging", ...say("work_end"), mascotMood: "happy", isMicroQuizPreferred: false };
  }

  return { tone: "level_1_encouraging", ...say("default"), mascotMood: "happy", isMicroQuizPreferred: false };
}

/** Recall chance under which a due word reads as "sắp quên" (the Forgotten tab's amber band starts at 85%) */
export const FADING_RETRIEVABILITY = 0.85;

/**
 * Words with a studied card due whose recall chance fell under FADING_RETRIEVABILITY, for the reminder copy
 * (fadingCount). In memory only: the worker can pass the due list it already loads for the micro-quiz.
 */
export function countFadingWords(dueWords: readonly WordDetail[], now: Date = new Date()): number {
  return dueWords.filter(
    (w) =>
      !isSuspended(w) &&
      getDueCards(w, now).some((c) => !isNewCard(c) && calculateRetrievability(c.srs, now) < FADING_RETRIEVABILITY)
  ).length;
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
    // A leech set to "relearn" is shown its introduction again first (popup / sessions), never quizzed cold here
    .filter((c) => c.direction === "recognition" && !isNewCard(c) && !isBuriedBySibling(c, now) && !needsRelearnIntro(c));
  const scheduled = dueCards.length > 0;
  const candidatePool: ReviewCard[] = scheduled
    ? dueCards
    : allWords
        .filter((w) => usable(w) && (w.srs.reps ?? 0) > 0)
        .map((w) => toCard(w, "recognition"))
        .filter((c) => !needsRelearnIntro(c));
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
  // 3 options (not 4): the 400×230 reminder card has room for three full-width meanings
  const compactOptions = shuffle([...mcq.options.filter((o) => !o.isCorrect).slice(0, 2), ...(correctOpt ? [correctOpt] : [])]);

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
  /** The question came from the due list (selectMicroQuizQuestion): a fallback word (e.g. a recall card's
   *  buried sibling) is practice even if it is due */
  scheduledQuestion?: boolean;
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
    scheduled = decision.scheduled && !isNewCard(card) && params.scheduledQuestion !== false;
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
    // The recorder downgrades to practice a card graded since it was read
    scheduled = recorded.scheduled;
    praise = celebrationFor({ ...recorded, direction: "recognition", word: word.word })?.title ?? null;
  }

  resetConsecutiveSkipCount();
  if (scheduled) {
    // Same as the popup and flashcard sessions
    if (isCorrect && rating >= Rating.Good) recordFirstTryCorrect();
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
