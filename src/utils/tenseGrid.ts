/**
 * Placing tense lessons in the classic table: rows present / past / future, columns simple / continuous /
 * perfect / perfect continuous ("near future" = be going to, beside the future row). Read from the
 * lesson's English title, so it works with whatever lesson ids the imported book uses.
 */

export type TenseTime = "present" | "past" | "future";
export type TenseAspect = "simple" | "continuous" | "perfect" | "perfect_continuous";

export type TenseCell = { time: TenseTime; aspect: TenseAspect } | { time: "future"; aspect: "near" };

export const TENSE_ROWS: Array<{ time: TenseTime; label: string }> = [
  { time: "present", label: "Hiện tại" },
  { time: "past", label: "Quá khứ" },
  { time: "future", label: "Tương lai" },
];

export const TENSE_COLUMNS: Array<{ aspect: TenseAspect; label: string }> = [
  { aspect: "simple", label: "Đơn" },
  { aspect: "continuous", label: "Tiếp diễn" },
  { aspect: "perfect", label: "Hoàn thành" },
  { aspect: "perfect_continuous", label: "Hoàn thành tiếp diễn" },
];

/** The cell of a tense lesson from its English title, or null when the title is not a tense */
export function tenseCell(title: string): TenseCell | null {
  const t = title.toLowerCase();
  if (/\bnear\s+future\b|\bbe\s+going\s+to\b/.test(t)) return { time: "future", aspect: "near" };
  const time = /\bpresent\b/.test(t) ? "present" : /\bpast\b/.test(t) ? "past" : /\bfuture\b/.test(t) ? "future" : null;
  if (!time) return null;
  const continuous = /\b(continuous|progressive)\b/.test(t);
  const perfect = /\bperfect\b/.test(t);
  const aspect: TenseAspect = perfect && continuous ? "perfect_continuous" : perfect ? "perfect" : continuous ? "continuous" : "simple";
  return { time, aspect };
}

/**
 * The table for a chapter's lessons, or null when the chapter is not a tense chapter (fewer than 75% of
 * its lessons are tenses, or two lessons claim the same cell). Lessons that are not tenses are returned
 * in `others`, to be shown after the table.
 */
export function buildTenseGrid<L extends { id: string; title: string }>(
  lessons: L[]
): { cells: Map<string, L>; near: L | null; others: L[] } | null {
  if (lessons.length < 4) return null;
  const cells = new Map<string, L>();
  let near: L | null = null;
  const others: L[] = [];
  for (const l of lessons) {
    const cell = tenseCell(l.title);
    if (!cell) {
      others.push(l);
      continue;
    }
    if (cell.aspect === "near") {
      if (near) return null;
      near = l;
      continue;
    }
    const key = `${cell.time}:${cell.aspect}`;
    if (cells.has(key)) return null;
    cells.set(key, l);
  }
  const placed = cells.size + (near ? 1 : 0);
  return placed / lessons.length >= 0.75 ? { cells, near, others } : null;
}
