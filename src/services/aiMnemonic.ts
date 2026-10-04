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
  const firstLetter = target.charAt(0).toUpperCase();

  let hook = "";

  // Common high-frequency developer words with hand-crafted vivid mnemonics
  const PRESET_MNEMONICS: Record<string, string> = {
    ephemeral: '💡 Âm thanh giống "ép-phê-mờ": một hiệu ứng (ép phê) mờ ảo chỉ tồn tại chớp nhoáng, thoáng qua.',
    resilience: '💡 Liên tưởng "ri-zi-li-ừn" (như dây chun co giãn): kéo căng cỡ nào cũng tự bật hồi phục lại trạng thái ban đầu.',
    scalability: '💡 "Scale" (chiếc thang leo): hệ thống có thể bắc thêm nhiều bậc thang để tải hàng triệu người dùng cùng lúc.',
    latency: '💡 "La-ten-xì" (ngồi la cà đợi trà xì tin): mạng đi đường vòng nên bị trễ và đợi lâu.',
    concurrency: '💡 "Con-cơ-rần" (cùng rần rần chạy đua): nhiều luồng xử lý đồng thời cùng lúc mà không chờ đợi nhau.',
    idempotent: '💡 "Ai-đem-pô-tần": đem gửi request 1 lần hay 100 lần thì kết quả nhận về vẫn y nguyên một trạng thái.',
    immutable: '💡 "In-mút": đã đúc vào khuôn đá mút rồi thì không thể biến đổi (bất biến) được nữa.',
    redundancy: '💡 "Rê-đan-đần" (rê thêm đồ dự phòng): thêm server phụ để khi con chính chết thì con phụ lập tức thế chân.',
    throughput: '💡 "Through" (xuyên qua) + "Put" (đặt vào): lượng dữ liệu thực tế đẩy trôi chảy qua ống trong 1 giây.',
    middleware: '💡 "Middle" (ở giữa): người gác cổng đứng ở giữa đón gói tin request trước khi đưa vào tận phòng server.',
    debounce: '💡 "Đè-bounc-e" (đè nút lò xo): khi user gõ liên tục thì đợi buông tay ra mới chịu kích hoạt gọi hàm.',
    throttle: '💡 "Thợ-rốt-ga" (van tiết lưu): giới hạn xe chỉ được vặn ga 1 lần mỗi giây dù có nhấn liên tục.',
  };

  if (PRESET_MNEMONICS[target]) {
    hook = PRESET_MNEMONICS[target];
  } else {
    // Dynamic structured heuristic mnemonic
    hook = `💡 [Mẹo ghi nhớ]: Từ "${word.word}" mang nghĩa là "${meaning}". Hãy liên tưởng chữ "${firstLetter}" với hành động cốt lõi và đặt nó trong câu ví dụ: "${word.examples?.[0]?.sentence_en || word.word}".`;
  }

  // Don't cache hooks built from a placeholder meaning; regenerate once the word is enriched
  if (!isPlaceholderMeaning(word.meaning_vn)) {
    saveMnemonic(word.id, hook, word.meaning_vn);
  }
  return hook;
}
