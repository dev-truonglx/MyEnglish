/**
 * Praise for the moments that matter for memory (not for speed or volume):
 *  - a word reaching long-term memory (stability crossed 21 days)
 *  - a fading word remembered just in time (the most valuable kind of review)
 *  - early on, words remembered after a night: the first one, then round numbers. Long-term memory takes 3
 *    weeks, so a first week had nothing to celebrate
 * The wording varies (by word) so the same line does not come back every time.
 */
import type { CardDirection } from "@/types/database";

export interface Celebration {
  kind: "mastered" | "rescued" | "overnight";
  title: string;
  detail: string;
}

/** Counts of words remembered after a night that are celebrated */
export const OVERNIGHT_MILESTONES = [1, 10, 25, 50, 100, 250, 500, 1000];

const OVERNIGHT_COUNT_KEY = "myenglish_overnight_recalls_v1";

/** One more young word remembered after a night (see isFirstOvernightRecall); returns the new count */
export function countOvernightRecall(): number {
  try {
    const next = (Number(localStorage.getItem(OVERNIGHT_COUNT_KEY)) || 0) + 1;
    localStorage.setItem(OVERNIGHT_COUNT_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
}

/** Stable small number from a word, to pick a wording */
function pick<T>(items: readonly T[], seed: string | number): T {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return items[h % items.length];
}

const MASTERED_DETAILS = [
  "Lần gặp lại tiếp theo là sau ít nhất 3 tuần.",
  "Từ này giờ nằm trong trí nhớ dài hạn, vài tuần nữa mới cần ôn.",
  "Thêm một từ bạn sẽ nhận ra ngay khi đọc tài liệu.",
];
const MASTERED_RECALL_DETAILS = [
  "Từ này đã vào trí nhớ dài hạn — dùng được khi nói và viết.",
  "Giờ bạn có thể dùng từ này khi viết comment, email hay nói trong họp.",
];
const RESCUED = [
  { title: "🧠 Cứu kịp lúc!", detail: (w: string) => `“${w}” đang phai dần — nhớ lại đúng lúc này là lượt ôn giá trị nhất cho trí nhớ.` },
  { title: "🧠 Giữ lại được rồi!", detail: (w: string) => `“${w}” suýt quên mà bạn vẫn nhớ ra: lần ôn này làm trí nhớ chắc thêm nhiều nhất.` },
  { title: "🧠 Nhớ ra đúng lúc!", detail: (w: string) => `“${w}” đã mờ đi khá nhiều — nhớ lại được lúc này là rất đáng giá.` },
];

export function celebrationFor(r: {
  mastered: boolean;
  rescued: boolean;
  direction: CardDirection;
  word: string;
  /** Words remembered after a night so far, this one included (null: this answer is not one) */
  overnightCount?: number | null;
}): Celebration | null {
  if (r.mastered) {
    return r.direction === "production"
      ? {
          kind: "mastered",
          title: `🎉 Giờ bạn tự nhớ ra “${r.word}” được hơn 3 tuần`,
          detail: pick(MASTERED_RECALL_DETAILS, r.word),
        }
      : {
          kind: "mastered",
          title: `🎉 “${r.word}” đã vào trí nhớ dài hạn`,
          detail: pick(MASTERED_DETAILS, r.word),
        };
  }
  if (r.rescued) {
    const line = pick(RESCUED, r.word);
    return { kind: "rescued", title: line.title, detail: line.detail(r.word) };
  }
  const n = r.overnightCount ?? 0;
  if (n > 0 && OVERNIGHT_MILESTONES.includes(n)) {
    return n === 1
      ? {
          kind: "overnight",
          title: "🌙 Lần đầu nhớ qua đêm!",
          detail: `Ngủ một đêm mà vẫn nhớ “${r.word}”: từ đã bắt đầu vào trí nhớ thật, không chỉ là vừa đọc xong.`,
        }
      : {
          kind: "overnight",
          title: `🌙 Từ thứ ${n} nhớ được qua đêm`,
          detail: `“${r.word}” vừa góp thêm vào. Mỗi từ nhớ qua đêm là một bước vào trí nhớ dài hạn.`,
        };
  }
  return null;
}

/** Short praise for a right answer, varied (by `seed`, e.g. the answer count) so it does not read the same each time */
export const PRAISE_WORDS = ["Chính xác!", "Đúng rồi!", "Chuẩn luôn!", "Tốt lắm!", "Nhớ tốt đấy!", "Tuyệt!"] as const;

export function praiseWord(seed: number): string {
  return PRAISE_WORDS[Math.abs(Math.floor(seed)) % PRAISE_WORDS.length];
}
