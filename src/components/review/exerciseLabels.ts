import type { ExerciseType } from "@/services/smartReview";

/** Vietnamese name of each exercise type, shown to the learner (never the internal code name) */
export const EXERCISE_LABEL_VN: Record<ExerciseType, string> = {
  flip: "Thẻ lật",
  multiple_choice: "Trắc nghiệm",
  cloze: "Điền từ vào câu",
  spelling: "Gõ lại từ",
  listening: "Nghe và chọn nghĩa",
  context_match: "Nối từ với câu",
  meaning_match: "Nối từ với nghĩa",
  reverse_cloze: "Chọn từ cho câu",
  sentence_builder: "Xếp câu",
  free_writing: "Tự viết câu (AI chấm)",
  letter_tiles: "Xếp chữ cái",
};
