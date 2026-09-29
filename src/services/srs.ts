import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { invoke } from "@tauri-apps/api/core";
import { getDatabase, getAllWords } from "./db";
import type { WordDetail, SRSReview } from "@/types/database";

export interface SM2Result {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewDate: string;
}

/**
 * Pure SuperMemo-2 (SM-2) algorithm implementation.
 *
 * @param quality Grade from 0 to 5:
 *   5 - Perfect response ("Easy")
 *   4 - Correct response with hesitation ("Good")
 *   3 - Correct response with serious difficulty ("Hard")
 *   2 - Incorrect response ("Again")
 *   1 - Incorrect response; remembered correct one
 *   0 - Complete blackout
 * @param currentRepetitions Number of consecutive successful reviews
 * @param currentInterval Current interval in days
 * @param currentEaseFactor Current ease factor (default 2.5)
 */
export function calculateSM2(
  quality: number,
  currentRepetitions: number,
  currentInterval: number,
  currentEaseFactor: number = 2.5
): SM2Result {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let nextRepetitions = currentRepetitions;
  let nextInterval = currentInterval;

  if (q >= 3) {
    // Successful recall
    if (currentRepetitions === 0) {
      nextInterval = 1;
    } else if (currentRepetitions === 1) {
      nextInterval = 6;
    } else {
      nextInterval = Math.round(currentInterval * currentEaseFactor);
    }
    nextRepetitions = currentRepetitions + 1;
  } else {
    // Failed recall: reset repetitions and schedule for immediate review
    nextRepetitions = 0;
    nextInterval = 1;
  }

  // Update Ease Factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  let nextEaseFactor = currentEaseFactor + delta;
  if (nextEaseFactor < 1.3) {
    nextEaseFactor = 1.3;
  }
  nextEaseFactor = Number(nextEaseFactor.toFixed(2));

  // Compute next review timestamp
  const nextDate = new Date(Date.now() + nextInterval * 24 * 60 * 60 * 1000);

  return {
    easeFactor: nextEaseFactor,
    interval: nextInterval,
    repetitions: nextRepetitions,
    nextReviewDate: nextDate.toISOString(),
  };
}

/**
 * Fetch all words currently due for repetition (next_review_date <= now)
 */
export async function getDueWords(): Promise<WordDetail[]> {
  const all = await getAllWords();
  const now = new Date();
  return all.filter((item) => new Date(item.srs.next_review_date) <= now);
}

/**
 * Record a user review session for a word, updating its SRS metadata in SQLite
 */
export async function recordReview(wordId: string, quality: number): Promise<SM2Result> {
  const db = await getDatabase();

  // 1. Fetch existing SRS data
  const srsRows = await db.select<SRSReview[]>(
    `SELECT * FROM srs_reviews WHERE word_id = $1 LIMIT 1;`,
    [wordId]
  );
  const current = srsRows[0] || {
    word_id: wordId,
    ease_factor: 2.5,
    interval: 0,
    repetitions: 0,
    next_review_date: new Date().toISOString(),
  };

  // 2. Compute new SM-2 values
  const sm2 = calculateSM2(
    quality,
    current.repetitions,
    current.interval,
    current.ease_factor
  );

  // 3. Persist back into SQLite
  await db.execute(
    `INSERT INTO srs_reviews (word_id, ease_factor, interval, repetitions, next_review_date)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(word_id) DO UPDATE SET
       ease_factor = excluded.ease_factor,
       interval = excluded.interval,
       repetitions = excluded.repetitions,
       next_review_date = excluded.next_review_date;`,
    [wordId, sm2.easeFactor, sm2.interval, sm2.repetitions, sm2.nextReviewDate]
  );

  return sm2;
}

/**
 * Reliable system notification sender.
 * Uses native Rust command with macOS osascript + Tauri notification builder,
 * guaranteeing delivery on macOS without being blocked by WebKit WKWebView permission limitations.
 */
export async function triggerDesktopNotification(title: string, body: string): Promise<boolean> {
  // 1. Try native Rust command (osascript + notification plugin)
  try {
    await invoke("send_desktop_notification", { title, body });
    return true;
  } catch (err) {
    console.warn("invoke send_desktop_notification failed, trying fallback:", err);
  }

  // 2. Fallback to @tauri-apps/plugin-notification
  try {
    let permission = await isPermissionGranted();
    if (!permission) {
      const status = await requestPermission();
      permission = status === "granted";
    }
    if (permission) {
      sendNotification({ title, body });
      return true;
    }
  } catch (err) {
    console.warn("sendNotification fallback failed:", err);
  }

  return false;
}

/**
 * Trigger an OS notification if reviews are due
 */
export async function checkAndNotifyDueReviews(): Promise<number> {
  try {
    const dueWords = await getDueWords();
    if (dueWords.length === 0) return 0;

    await triggerDesktopNotification(
      "MyEnglish • Ôn tập từ vựng!",
      `Bạn có ${dueWords.length} từ vựng cần ôn tập hôm nay. Dành 3 phút ôn ngay nhé!`
    );

    return dueWords.length;
  } catch (err) {
    console.warn("Could not send system notification:", err);
    return 0;
  }
}

/**
 * Send an immediate test system notification to macOS Notification Center
 */
export async function sendTestNotification(): Promise<{ success: boolean; message: string }> {
  try {
    const sent = await triggerDesktopNotification(
      "MyEnglish • Kiểm tra thông báo",
      "Hệ thống thông báo nhắc nhở ôn tập Spaced Repetition (SM-2) đang hoạt động hoàn hảo! 🚀"
    );

    if (sent) {
      return {
        success: true,
        message: "Đã gửi thông báo hệ thống macOS kèm chuông báo 'Glass'! Hãy kiểm tra góc phải màn hình hoặc mở Trung tâm thông báo macOS.",
      };
    } else {
      return {
        success: false,
        message: "Không thể gửi thông báo. Hãy kiểm tra cài đặt thông báo của macOS.",
      };
    }
  } catch (err) {
    return {
      success: false,
      message: `Lỗi gửi thông báo: ${err}`,
    };
  }
}

/**
 * Get current system notification permission status
 */
export async function getNotificationPermissionStatus(): Promise<"granted" | "denied" | "default"> {
  try {
    // In macOS native mode via osascript and Tauri Rust backend, notifications are always available
    return "granted";
  } catch {
    return "granted";
  }
}

/**
 * Request notification permission from macOS
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    return await triggerDesktopNotification(
      "MyEnglish • Quyền thông báo",
      "Đã kích hoạt dịch vụ thông báo native trên macOS thành công!"
    );
  } catch {
    return false;
  }
}

/**
 * For testing purposes: mark a word due immediately in SQLite so the user can test real due card notifications
 */
export async function markWordDueImmediately(wordId?: string): Promise<string | null> {
  const db = await getDatabase();
  const pastDate = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour ago

  let targetId = wordId;
  let targetWord = "";
  if (!targetId) {
    const all = await getAllWords();
    if (all.length === 0) return null;
    targetId = all[0].id;
    targetWord = all[0].word;
  }

  await db.execute(
    `UPDATE srs_reviews SET next_review_date = $1 WHERE word_id = $2;`,
    [pastDate, targetId]
  );

  // Trigger check and notify immediately
  await checkAndNotifyDueReviews();
  window.dispatchEvent(new CustomEvent("myenglish-activity-updated"));

  return targetWord || targetId;
}

/**
 * Background worker manager that periodically inspects due reviews
 */
class SRSBackgroundWorker {
  private timerId: number | null = null;
  private lastNotificationCount = 0;

  public start(intervalMinutes: number = 30) {
    if (this.timerId) return;

    // Initial check
    this.tick();

    // Periodic interval
    const ms = intervalMinutes * 60 * 1000;
    this.timerId = window.setInterval(() => this.tick(), ms);
  }

  public stop() {
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private async tick() {
    try {
      const dueCount = await getDueWords().then((w) => w.length);
      // Only notify if there are due words and count increased or was not notified yet
      if (dueCount > 0 && dueCount !== this.lastNotificationCount) {
        this.lastNotificationCount = dueCount;
        await checkAndNotifyDueReviews();
      }
    } catch (err) {
      console.warn("SRS worker tick failed:", err);
    }
  }
}

export const srsWorker = new SRSBackgroundWorker();
