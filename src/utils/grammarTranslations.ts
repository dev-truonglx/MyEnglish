/**
 * Grammar instruction and exercise type translations for Vietnamese learners.
 */

export const EXERCISE_TYPE_LABELS: Record<string, string> = {
  verb_form: "Chia động từ",
  choose: "Trắc nghiệm chọn đáp án",
  fill_blank: "Điền vào chỗ trống",
  rewrite: "Viết lại câu",
  combine: "Nối câu",
  question: "Đặt câu hỏi",
  tag: "Câu hỏi đuôi",
  word_form: "Dạng của từ",
  correct: "Tìm và sửa lỗi sai",
  error_spotting: "Tìm và sửa lỗi sai",
  identify: "Xác định thành phần câu",
  translate: "Dịch câu",
  complete: "Hoàn thành câu",
  write: "Viết câu",
};

export function getExerciseTypeLabel(type: string): string {
  return EXERCISE_TYPE_LABELS[type] || "Luyện tập";
}

const TENSE_TRANSLATIONS: Array<[RegExp, string]> = [
  // Present
  [/\bthe simple present tense\b/gi, "thì Hiện tại đơn"],
  [/\bsimple present\b/gi, "thì Hiện tại đơn"],
  [/\bthe present continuous tense\b/gi, "thì Hiện tại tiếp diễn"],
  [/\bpresent continuous\b/gi, "thì Hiện tại tiếp diễn"],
  [/\bthe present perfect continuous\b/gi, "thì Hiện tại hoàn thành tiếp diễn"],
  [/\bpresent perfect continuous\b/gi, "thì Hiện tại hoàn thành tiếp diễn"],
  [/\bthe present perfect\b/gi, "thì Hiện tại hoàn thành"],
  [/\bpresent perfect\b/gi, "thì Hiện tại hoàn thành"],
  [/\bpresent tenses\b/gi, "các thì Hiện tại"],

  // Past
  [/\bthe simple past tense\b/gi, "thì Quá khứ đơn"],
  [/\bsimple past\b/gi, "thì Quá khứ đơn"],
  [/\bthe past continuous tense\b/gi, "thì Quá khứ tiếp diễn"],
  [/\bpast continuous\b/gi, "thì Quá khứ tiếp diễn"],
  [/\bthe past perfect continuous\b/gi, "thì Quá khứ hoàn thành tiếp diễn"],
  [/\bpast perfect continuous\b/gi, "thì Quá khứ hoàn thành tiếp diễn"],
  [/\bthe past perfect\b/gi, "thì Quá khứ hoàn thành"],
  [/\bpast perfect\b/gi, "thì Quá khứ hoàn thành"],
  [/\bpast tenses\b/gi, "các thì Quá khứ"],

  // Future
  [/\bthe simple future tense\b/gi, "thì Tương lai đơn"],
  [/\bsimple future\b/gi, "thì Tương lai đơn"],
  [/\bfuture simple\b/gi, "thì Tương lai đơn"],
  [/\bthe future continuous tense\b/gi, "thì Tương lai tiếp diễn"],
  [/\bfuture continuous\b/gi, "thì Tương lai tiếp diễn"],
  [/\bthe future perfect continuous\b/gi, "thì Tương lai hoàn thành tiếp diễn"],
  [/\bfuture perfect continuous\b/gi, "thì Tương lai hoàn thành tiếp diễn"],
  [/\bthe future perfect\b/gi, "thì Tương lai hoàn thành"],
  [/\bfuture perfect\b/gi, "thì Tương lai hoàn thành"],
  [/\bfuture tenses\b/gi, "các thì Tương lai"],

  // Other grammar concepts
  [/\badverbial clauses? of time\b/gi, "mệnh đề trạng ngữ chỉ thời gian"],
  [/\bconditional sentences?\b/gi, "câu điều kiện"],
  [/\bpassive voice\b/gi, "câu bị động"],
  [/\brelative clauses?\b/gi, "mệnh đề quan hệ"],
  [/\btag questions?\b/gi, "câu hỏi đuôi"],
  [/\breported speech\b/gi, "câu gián tiếp"],
];

const INSTRUCTION_PREFIX_TRANSLATIONS: Array<[RegExp, string]> = [
  [/^supply the correct verb forms?\b[:.]?/i, "Chia dạng đúng của động từ:"],
  [/^give the right forms? of the verbs? in brackets\b[:.]?/i, "Cho dạng đúng của động từ trong ngoặc:"],
  [/^give the right forms? of the verbs?\b[:.]?/i, "Cho dạng đúng của động từ:"],
  [/^put the verbs? in (brackets|parentheses)\b[:.]?/i, "Chia động từ trong ngoặc:"],
  [/^choose the correct forms? of the verbs? in (brackets|parentheses)\b[:.]?/i, "Chọn dạng đúng của động từ trong ngoặc:"],
  [/^choose the correct forms? of the verbs?\b[:.]?/i, "Chọn dạng đúng của động từ:"],
  [/^choose the (best|correct) answers?\b[:.]?/i, "Chọn đáp án đúng nhất:"],
  [/^complete each of the following sentences with\b[:.]?/i, "Hoàn thành mỗi câu sau với:"],
  [/^complete the following sentences\b[:.]?/i, "Hoàn thành các câu sau:"],
  [/^rewrite the following sentences\b[:.]?/i, "Viết lại các câu sau:"],
  [/^rewrite each sentence\b[:.]?/i, "Viết lại từng câu:"],
  [/^combine the sentences\b[:.]?/i, "Nối các câu sau:"],
  [/^make questions for the underlined words?\b[:.]?/i, "Đặt câu hỏi cho từ gạch chân:"],
  [/^find and correct the errors?\b[:.]?/i, "Tìm và sửa lỗi sai trong câu:"],
];

/**
 * Translate book instructions into natural Vietnamese.
 */
export function translateInstructionToVn(instruction: string): string {
  if (!instruction || !instruction.trim()) return "";
  let text = instruction.trim();

  // Try matching prefix
  for (const [pattern, vnPrefix] of INSTRUCTION_PREFIX_TRANSLATIONS) {
    if (pattern.test(text)) {
      const rest = text.replace(pattern, "").trim();
      if (!rest) return vnPrefix.replace(/:$/, "");

      // Translate remainder (tenses and connectors)
      let translatedRest = rest;
      for (const [tensePattern, vnTense] of TENSE_TRANSLATIONS) {
        translatedRest = translatedRest.replace(tensePattern, vnTense);
      }
      translatedRest = translatedRest.replace(/\bor\b/gi, "hoặc");
      translatedRest = translatedRest.replace(/\band\b/gi, "và");

      return `${vnPrefix} ${translatedRest}`.trim();
    }
  }

  // Fallback: replace tenses in the entire string
  let translated = text;
  for (const [tensePattern, vnTense] of TENSE_TRANSLATIONS) {
    translated = translated.replace(tensePattern, vnTense);
  }
  translated = translated.replace(/\bor\b/gi, "hoặc");
  translated = translated.replace(/\band\b/gi, "và");

  return translated;
}
