import type { GrammarLevel } from "@/types/grammar";
import { tenseCell, type TenseCell } from "@/utils/tenseGrid";

/** A tense a CEFR level expects the learner to use */
export interface LevelTense {
  cell: TenseCell;
  name: string;
  /** The form, short */
  form: string;
  /** What it is used for at this level */
  use: string;
  example: string;
}

const t = (time: TenseCell["time"], aspect: TenseCell["aspect"], name: string, form: string, use: string, example: string): LevelTense =>
  ({ cell: { time, aspect } as TenseCell, name, form, use, example });

/**
 * The tenses introduced at each level, after the usual CEFR syllabus (English Profile, Cambridge course books).
 * Each level adds to the ones below it; a tense met again at a higher level is listed where it is first expected.
 */
export const LEVEL_TENSES: Record<GrammarLevel, LevelTense[]> = {
  A1: [
    t("present", "simple", "Hiện tại đơn", "S + V(s/es)", "Thói quen, sự thật, lịch cố định", "We deploy every Friday."),
    t("present", "continuous", "Hiện tại tiếp diễn", "S + am/is/are + V-ing", "Việc đang diễn ra lúc nói", "I'm fixing a bug right now."),
  ],
  A2: [
    t("past", "simple", "Quá khứ đơn", "S + V2/V-ed", "Việc đã xong trong quá khứ, có thời điểm rõ", "The build failed yesterday."),
    t("past", "continuous", "Quá khứ tiếp diễn", "S + was/were + V-ing", "Việc đang diễn ra thì bị việc khác xen vào", "I was testing when the server crashed."),
    t("future", "simple", "Tương lai đơn", "S + will + V", "Quyết định tức thời, dự đoán, hứa hẹn", "I'll check the logs."),
    t("future", "near", "Tương lai gần", "S + am/is/are going to + V", "Kế hoạch đã định, dự đoán có dấu hiệu", "We're going to release v2 next week."),
    t("present", "perfect", "Hiện tại hoàn thành", "S + have/has + V3", "Trải nghiệm, việc vừa xong còn ảnh hưởng đến hiện tại", "I've already merged the PR."),
  ],
  B1: [
    t("present", "perfect_continuous", "Hiện tại hoàn thành tiếp diễn", "S + have/has been + V-ing", "Việc kéo dài từ quá khứ đến giờ, nhấn mạnh quá trình", "I've been debugging this for two hours."),
    t("past", "perfect", "Quá khứ hoàn thành", "S + had + V3", "Việc xảy ra trước một việc khác trong quá khứ", "The tests had passed before we deployed."),
    t("future", "continuous", "Tương lai tiếp diễn", "S + will be + V-ing", "Việc đang diễn ra tại một thời điểm trong tương lai", "I'll be presenting the demo at 3 pm."),
  ],
  B2: [
    t("past", "perfect_continuous", "Quá khứ hoàn thành tiếp diễn", "S + had been + V-ing", "Việc kéo dài đến trước một mốc trong quá khứ", "We had been waiting for an hour when the fix arrived."),
    t("future", "perfect", "Tương lai hoàn thành", "S + will have + V3", "Việc sẽ xong trước một mốc trong tương lai", "We'll have finished the migration by Monday."),
    t("future", "perfect_continuous", "Tương lai hoàn thành tiếp diễn", "S + will have been + V-ing", "Việc sẽ kéo dài được bao lâu tính đến một mốc tương lai", "By June, I'll have been working here for a year."),
  ],
  C1: [],
};

/** At C1 no new tense comes in: what changes is how freely they are combined */
export const C1_TENSE_NOTE =
  "Không có thì mới: dùng linh hoạt cả 13 thì, phối hợp thì trong câu phức và câu tường thuật, dùng thì quá khứ để nói giả định hoặc lịch sự (I was wondering if…).";

/** Lesson of the imported book that teaches a tense, matched by the lesson's English title */
export function matchTenseLessons<L extends { id: string; title: string }>(tenses: LevelTense[], lessons: L[]): Map<LevelTense, L> {
  const out = new Map<LevelTense, L>();
  for (const tense of tenses) {
    const lesson = lessons.find((l) => {
      const cell = tenseCell(l.title);
      return !!cell && cell.time === tense.cell.time && cell.aspect === tense.cell.aspect;
    });
    if (lesson) out.set(tense, lesson);
  }
  return out;
}
