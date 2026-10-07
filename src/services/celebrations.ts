/**
 * Praise for the moments that matter for memory (not for speed or volume):
 *  - a word reaching long-term memory (stability crossed 21 days)
 *  - a fading word remembered just in time (the most valuable kind of review)
 */
import type { CardDirection } from "@/types/database";

export interface Celebration {
  kind: "mastered" | "rescued";
  title: string;
  detail: string;
}

export function celebrationFor(r: {
  mastered: boolean;
  rescued: boolean;
  direction: CardDirection;
  word: string;
}): Celebration | null {
  if (r.mastered) {
    return r.direction === "production"
      ? {
          kind: "mastered",
          title: `🎉 Giờ bạn tự nhớ ra “${r.word}” được hơn 3 tuần`,
          detail: "Từ này đã vào trí nhớ dài hạn — dùng được khi nói và viết.",
        }
      : {
          kind: "mastered",
          title: `🎉 “${r.word}” đã vào trí nhớ dài hạn`,
          detail: "Lần gặp lại tiếp theo là sau ít nhất 3 tuần.",
        };
  }
  if (r.rescued) {
    return {
      kind: "rescued",
      title: "🧠 Cứu kịp lúc!",
      detail: `“${r.word}” đang phai dần — nhớ lại đúng lúc này là lượt ôn giá trị nhất cho trí nhớ.`,
    };
  }
  return null;
}
