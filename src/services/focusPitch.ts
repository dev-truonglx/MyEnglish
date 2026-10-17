/**
 * Why start a focus session now: one short line chosen from the learner's own situation (never tried, cards
 * waiting, done one already today, yesterday's session, what focus days did for coming back). Shown on the focus
 * card, and used to decide how loud the card is.
 */
import { getLocalDateString } from "./streak";
import { FOCUS_MIN_CARDS, FOCUS_XP_PER_MIN } from "./focusSession";
import { loadRetentionInsights, type RetentionInsights } from "./retention";

export interface FocusPitchInput {
  minutes: number;
  /** Cards due now (reviews + today's new words) */
  due: number;
  /** Completed sessions today, and active minutes in them */
  todaySessions: number;
  todayMinutes: number;
  yesterdayMinutes: number;
  /** Completed sessions ever (in the loaded window) */
  completedTotal: number;
  /** D1 after focus days minus D1 after other days, in points (null: not enough data) */
  returnLiftPoints: number | null;
  hour: number;
}

export interface FocusPitch {
  title: string;
  body: string;
  /** strong: the card is the hero of the page; calm: done today, a small card is enough */
  tone: "strong" | "calm";
  xp: number;
}

/** About how many cards fit in a minute of focus (an answer with its feedback takes ~30-40 s) */
const CARDS_PER_MIN = 1.5;

export function focusPitch(p: FocusPitchInput): FocusPitch {
  const xp = p.minutes * FOCUS_XP_PER_MIN;
  if (p.todaySessions > 0) {
    return {
      title: `Đã xong ${p.todaySessions} phiên hôm nay 🎯`,
      body: `${Math.round(p.todayMinutes)} phút học trọn vẹn. Thêm một phiên ${p.minutes} phút nữa để từ chắc hơn?`,
      tone: "calm",
      xp,
    };
  }
  if (p.completedTotal === 0) {
    return {
      title: `Thử học ${p.minutes} phút không bị làm phiền`,
      body: "App ẩn mọi thứ khác và tắt nhắc nhở trong lúc bạn học. Rời cửa sổ thì đồng hồ tự dừng.",
      tone: "strong",
      xp,
    };
  }
  if (p.returnLiftPoints != null && p.returnLiftPoints >= 10) {
    return {
      title: "Phiên tập trung đang có tác dụng",
      body: `Sau những ngày có phiên tập trung, bạn quay lại học hôm sau nhiều hơn ${Math.round(p.returnLiftPoints)}%.`,
      tone: "strong",
      xp,
    };
  }
  if (p.yesterdayMinutes > 0) {
    return {
      title: "Giữ nhịp như hôm qua",
      body: `Hôm qua bạn đã tập trung ${Math.round(p.yesterdayMinutes)} phút. Hôm nay thêm một phiên ${p.minutes} phút nhé!`,
      tone: "strong",
      xp,
    };
  }
  if (p.due >= FOCUS_MIN_CARDS) {
    const fit = Math.min(p.due, Math.round(p.minutes * CARDS_PER_MIN));
    return {
      title: `${p.due} thẻ đang chờ bạn`,
      body:
        fit < p.due
          ? `Một phiên ${p.minutes} phút xử lý được khoảng ${fit} thẻ, không bị gián đoạn.`
          : `Vừa đủ cho một phiên ${p.minutes} phút, không bị gián đoạn.`,
      tone: "strong",
      xp,
    };
  }
  return {
    title: p.hour >= 18 ? "Kết thúc ngày bằng vài phút tập trung" : `${p.minutes} phút, chỉ bạn và các thẻ từ`,
    body: "Không popup, không thông báo. Hết giờ thì làm nốt câu đang dở rồi dừng.",
    tone: "strong",
    xp,
  };
}

/** What focusPitch needs from storage (the retention numbers are loaded with it) */
export async function loadFocusPitchInput(
  minutes: number,
  due: number,
  now: Date = new Date()
): Promise<{ input: FocusPitchInput; insights: RetentionInsights }> {
  const insights = await loadRetentionInsights(now);
  const today = getLocalDateString(now);
  const yesterday = getLocalDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const t = insights.focus.byDay.get(today);
  const y = insights.focus.byDay.get(yesterday);
  const lift =
    insights.withFocus?.d1.rate != null && insights.withoutFocus?.d1.rate != null
      ? (insights.withFocus.d1.rate - insights.withoutFocus.d1.rate) * 100
      : null;
  return {
    insights,
    input: {
      minutes,
      due,
      todaySessions: t?.count ?? 0,
      todayMinutes: (t?.activeSec ?? 0) / 60,
      yesterdayMinutes: (y?.activeSec ?? 0) / 60,
      completedTotal: insights.focus.completed,
      returnLiftPoints: lift,
      hour: now.getHours(),
    },
  };
}
