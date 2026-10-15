/**
 * Short Vietnamese meaning for prompts: the first sense of the AI's long explanation, with the English
 * word itself removed so the prompt never gives the answer away.
 */
import { escapeRegExp } from "./smartReview";
import { getExampleSenseMeaning, type ExampleSenseRef } from "@/utils/exerciseHints";

export { getExampleSenseMeaning, type ExampleSenseRef };

export function getConciseMeaning(
  meaning: string,
  targetWord?: string,
  example?: ExampleSenseRef | null
): string {
  if (!meaning) return "";
  let text = meaning.trim();

  // 0. Nếu có ví dụ (với sense_index hoặc sentence_vn) và từ có nhiều senses (;), lấy đúng sense ngữ cảnh
  if (example && text.includes(";")) {
    text = getExampleSenseMeaning(text, example);
  }

  // 1. Kiểm tra cấu trúc: "Thuật ngữ (word): giải thích..." -> Lấy ngay phần "Thuật ngữ" đầu tiên
  const colonIdx = text.indexOf(":");
  if (colonIdx > 0 && colonIdx < 60) {
    let head = text.substring(0, colonIdx).trim();
    if (/^Trong\b/i.test(head)) {
      // "Trong ngữ cảnh ...: nghĩa thực sự" -> Bỏ phần tiền tố trước dấu hai chấm
      text = text.substring(colonIdx + 1).trim();
    } else {
      if (targetWord) {
        head = head.replace(new RegExp(`\\s*\\([^)]*${escapeRegExp(targetWord)}[^)]*\\)`, "gi"), "");
        head = head.replace(new RegExp(`['"‘“\\[\\(]?${escapeRegExp(targetWord)}['"’”\\]\\)]?`, "gi"), "");
      }
      head = head.trim();
      if (head.length >= 3 && /[a-zà-ỹ]/i.test(head)) {
        return capitalize(head);
      }
    }
  }

  // 2. Nếu có cụm tóm tắt trong ngoặc ngay sau từ tiếng Anh, ví dụ: 'dashboard' (bảng điều khiển trực quan)
  if (targetWord) {
    const bracketRegex = new RegExp(`${escapeRegExp(targetWord)}['"’”]?\\s*\\(([^)]{3,40})\\)`, "i");
    const bracketMatch = text.match(bracketRegex);
    if (bracketMatch && bracketMatch[1]) {
      const cand = bracketMatch[1].trim();
      if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(cand)) {
        return capitalize(cand);
      }
    }
  }

  // 3. Xoá bỏ triệt để từ tiếng Anh mục tiêu và các biến thể trong nháy đơn/ngoặc (nếu còn nội dung tiếng Việt)
  if (targetWord) {
    const withoutTarget = text
      .replace(new RegExp(`['"‘“]${escapeRegExp(targetWord)}['"’”]?`, "gi"), "")
      .replace(new RegExp(`\\b${escapeRegExp(targetWord)}(?:s|es|ed|ing|d)?\\b`, "gi"), "");
    if (withoutTarget.replace(/[,:;\-–\s.()]+/g, "").length >= 2) {
      text = withoutTarget;
    }
  }

  // 4. Lọc bỏ các cụm từ mở đầu rườm rà (chỉ lọc ngữ cảnh AI, không lọc từ vựng bắt đầu bằng 'trong', 'làm')
  text = text.replace(/^Trong (?:ngữ cảnh|lĩnh vực|ngành|chuyên ngành|trường hợp|giao tiếp|văn cảnh)\b[^,.:;]*[,:;]\s*/gi, "");
  text = text.replace(/^(?:từ này|nó)?\s*(?:mang nghĩa là|có nghĩa là|dùng để chỉ|dùng để|là một(?=\s)|là(?=\s))\s*/gi, "");

  // 5. Xử lý mở đầu bằng ngoặc, ví dụ: "(bảng điều khiển trực quan) là..."
  const bracketLead = text.match(/^\(([^)]+)\)\s*(là|mang nghĩa là)?\s*/i);
  if (bracketLead) {
    text = bracketLead[1].trim() + (text.substring(bracketLead[0].length).trim() ? ": " + text.substring(bracketLead[0].length).trim() : "");
  }

  // 6. Xoá các cụm ví dụ trong ngoặc như "(ví dụ: ...)", "(ngược lại với...)", "(e.g...)"
  text = text.replace(/\s*\((?:ví dụ|vd|e\.g\.|đối lập|ngược lại)[^)]*\)/gi, "");

  // 7. Lấy câu hoặc mệnh đề nghĩa đầu tiên
  const sentences = text.split(/[.\n]/);
  let firstSentence = sentences[0]?.trim() || text;

  // Nếu có nhiều nghĩa phân tách bởi dấu chấm phẩy (;), ưu tiên lấy nghĩa (sense) đầu tiên
  if (firstSentence.includes(";")) {
    const clauses = firstSentence.split(";");
    if (clauses[0] && clauses[0].trim()) {
      firstSentence = clauses[0].trim();
    }
  }

  // Nếu câu vẫn quá dài (> 80 ký tự), lược bỏ phần chú thích ngoặc đơn ở cuối hoặc cắt theo dấu phẩy
  if (firstSentence.length > 80) {
    const withoutTrailingParen = firstSentence.replace(/\s*\([^)]+\)$/, "").trim();
    if (withoutTrailingParen.length >= 10) {
      firstSentence = withoutTrailingParen;
    }
    if (firstSentence.length > 80) {
      const firstComma = firstSentence.indexOf(",");
      if (firstComma > 25) {
        firstSentence = firstSentence.substring(0, firstComma).trim();
      }
    }
  }

  // 8. Dọn dẹp khoảng trắng và dấu câu thừa
  firstSentence = firstSentence.replace(/\s+/g, " ");
  firstSentence = firstSentence.replace(/^[,:;\-–\s.()]+/g, "");
  firstSentence = firstSentence.replace(/[,:;\-–\s.]+$/g, "");

  return capitalize(firstSentence);
}

function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

