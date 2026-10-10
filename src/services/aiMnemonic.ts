/**
 * AI Mnemonic Memory Hook Service — Phase 5
 * Generates vivid visual associations and memory aids for difficult/leech words.
 */

import type { WordDetail } from "@/types/database";
import { isPlaceholderMeaning } from "./db";

const MNEMONIC_STORAGE_KEY = "myenglish_mnemonics_v1";

// Legacy entries are plain strings; new ones remember the meaning they were generated from
type StoredEntry = string | { text: string; meaning: string };

interface StoredMnemonics {
  [wordId: string]: StoredEntry;
}

function readMap(): StoredMnemonics {
  try {
    const raw = localStorage.getItem(MNEMONIC_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Cached mnemonic for a word. Pass the word's current meaning to drop entries
 * generated from a different (e.g. placeholder) meaning.
 */
export function getStoredMnemonic(wordId: string, currentMeaning?: string): string | null {
  const entry = readMap()[wordId];
  if (!entry) return null;
  if (typeof entry === "string") {
    // Legacy entry: meaning unknown, so only trust it when no meaning check is requested
    return currentMeaning === undefined ? entry : null;
  }
  if (currentMeaning !== undefined && entry.meaning !== currentMeaning) return null;
  return entry.text || null;
}

export function saveMnemonic(wordId: string, mnemonic: string, meaning: string = ""): void {
  try {
    const map = readMap();
    map[wordId] = { text: mnemonic, meaning };
    localStorage.setItem(MNEMONIC_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

function removeMnemonic(wordId: string): void {
  try {
    const map = readMap();
    if (!(wordId in map)) return;
    delete map[wordId];
    localStorage.setItem(MNEMONIC_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * Generate a smart Vietnamese memory hook / association for a word.
 * Combines sound-alike phonetic cues and vivid contextual imagery.
 */
export async function generateSmartMnemonic(word: WordDetail): Promise<string> {
  const existing = getStoredMnemonic(word.id, word.meaning_vn);
  if (existing) return existing;
  // Stale entry (meaning changed since generation) must not be served again
  removeMnemonic(word.id);

  // Algorithmic memory association generator
  const target = word.word.toLowerCase();
  const meaning = word.meaning_vn.split(/[;\n]/)[0].trim();

  let hook = "";

  // Hand-written hooks for a few common developer words. They explain the meaning through word parts or a
  // picture, never through a Vietnamese spelling of the sound ("La-ten-xì" taught a wrong pronunciation).
  const PRESET_MNEMONICS: Record<string, string> = {
    ephemeral: "💡 Như một tin nhắn tự xóa: chỉ tồn tại trong thời gian ngắn rồi biến mất (tạm thời, chóng qua).",
    resilience: "💡 Như dây chun: kéo căng hay bị lỗi thì vẫn tự hồi phục về trạng thái ban đầu.",
    scalability: "💡 \"scale\" = mở rộng quy mô: hệ thống thêm máy để phục vụ thêm hàng triệu người dùng.",
    latency: "💡 Thời gian chờ giữa lúc bấm và lúc có phản hồi: càng thấp càng nhanh (low latency).",
    concurrency: "💡 \"con\" (cùng) + \"current\" (đang chạy): nhiều việc chạy cùng lúc.",
    idempotent: "💡 Bấm nút thanh toán 1 lần hay 5 lần thì kết quả vẫn như 1 lần: gọi lại không làm thay đổi thêm.",
    immutable: "💡 \"im-\" (không) + \"mutable\" (thay đổi được) = không thay đổi được.",
    redundancy: "💡 Như lốp dự phòng: thêm một bản sao để khi cái chính hỏng thì cái phụ thay thế ngay.",
    throughput: "💡 \"through\" (xuyên qua) + \"put\" (đặt vào): lượng dữ liệu đi qua hệ thống mỗi giây.",
    middleware: "💡 \"middle\" (ở giữa): lớp đứng giữa, xử lý request trước khi nó tới phần chính.",
    debounce: "💡 Như thang máy đợi mọi người vào hết rồi mới đóng cửa: đợi người dùng ngừng gõ rồi mới chạy.",
    throttle: "💡 Như van nước: dù mở hết cỡ, mỗi giây cũng chỉ cho chảy một lượng nhất định.",
  };

  if (PRESET_MNEMONICS[target]) {
    hook = PRESET_MNEMONICS[target];
  } else {
    const example = word.examples?.[0]?.sentence_en;
    hook = example
      ? `💡 Đọc to câu ví dụ hai lần: "${example}". Rồi tự đặt một câu của riêng bạn với "${word.word}" (${meaning}).`
      : `💡 Tự đặt một câu ngắn về công việc của bạn với "${word.word}" (${meaning}) và đọc to lên.`;
  }

  // Don't cache hooks built from a placeholder meaning; regenerate once the word is enriched
  if (!isPlaceholderMeaning(word.meaning_vn)) {
    saveMnemonic(word.id, hook, word.meaning_vn);
  }
  return hook;
}
