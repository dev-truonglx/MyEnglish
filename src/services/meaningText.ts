/**
 * Short Vietnamese meaning for prompts: the first sense of the AI's long explanation, with the English
 * word itself removed so the prompt never gives the answer away.
 */
import { escapeRegExp } from "./smartReview";

export function getConciseMeaning(meaning: string, targetWord?: string): string {
  if (!meaning) return "";
  let text = meaning.trim();

  // 1. Kiểm tra cấu trúc: "Thuật ngữ (word): giải thích..." -> Lấy ngay phần "Thuật ngữ" đầu tiên
  const colonIdx = text.indexOf(":");
  if (colonIdx > 0 && colonIdx < 40) {
    let head = text.substring(0, colonIdx).trim();
    if (targetWord) {
      head = head.replace(new RegExp(`\\s*\\([^)]*${escapeRegExp(targetWord)}[^)]*\\)`, "gi"), "");
      head = head.replace(new RegExp(`['"‘“\\[\\(]?${escapeRegExp(targetWord)}['"’”\\]\\)]?`, "gi"), "");
    }
    head = head.trim();
    if (head.length >= 3 && /[a-zà-ỹ]/i.test(head)) {
      return capitalize(head);
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

  // 3. Xoá bỏ triệt để từ tiếng Anh mục tiêu và các biến thể trong nháy đơn/ngoặc
  if (targetWord) {
    text = text.replace(new RegExp(`['"‘“]${escapeRegExp(targetWord)}['"’”]?`, "gi"), "");
    text = text.replace(new RegExp(`\\b${escapeRegExp(targetWord)}(?:s|es|ed|ing|d)?\\b`, "gi"), "");
  }

  // 4. Lọc bỏ các cụm từ mở đầu rườm rà
  text = text.replace(/^(Trong [^,.:;]+[,:;]?\s*)/gi, "");
  text = text.replace(/^(Trong [^,.:;]+[,:;]?\s*)/gi, ""); // Chạy lại nếu có 2 mệnh đề lồng nhau
  text = text.replace(/^(từ này|nó)?\s*(mang nghĩa là|có nghĩa là|dùng để chỉ|dùng để|là một|là)\s*/gi, "");

  // 5. Xử lý mở đầu bằng ngoặc, ví dụ: "(bảng điều khiển trực quan) là..."
  const bracketLead = text.match(/^\(([^)]+)\)\s*(là|mang nghĩa là)?\s*/i);
  if (bracketLead) {
    text = bracketLead[1].trim() + (text.substring(bracketLead[0].length).trim() ? ": " + text.substring(bracketLead[0].length).trim() : "");
  }

  // 6. Xoá các cụm ví dụ trong ngoặc như "(ví dụ: ...)", "(ngược lại với...)", "(e.g...)"
  text = text.replace(/\s*\((?:ví dụ|vd|e\.g\.|đối lập|ngược lại)[^)]*\)/gi, "");

  // 7. Lấy câu hoặc mệnh đề đầu tiên
  const sentences = text.split(/[.\n]/);
  let firstSentence = sentences[0]?.trim() || text;

  // Nếu câu đầu tiên vẫn quá dài (> 80 ký tự), tìm mệnh đề cô đọng
  if (firstSentence.length > 80) {
    const parenSummary = firstSentence.match(/\(([^)]{3,45})\)$/);
    if (parenSummary && /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(parenSummary[1])) {
      firstSentence = parenSummary[1];
    } else {
      const clauses = firstSentence.split(";");
      if (clauses[0] && clauses[0].trim().length >= 15) {
        firstSentence = clauses[0].trim();
      } else {
        const firstComma = firstSentence.indexOf(",");
        if (firstComma > 25) {
          firstSentence = firstSentence.substring(0, firstComma).trim();
        }
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

