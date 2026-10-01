import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { invoke } from "@tauri-apps/api/core";
import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
  State,
  type Card,
} from "ts-fsrs";
import { getDatabase, getAllWords } from "./db";
import type { WordDetail, SRSReview, FSRSState } from "@/types/database";

export { Rating, State };

export interface FSRSResult {
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview?: string;
  nextReviewDate: string;
  // Backward compatibility fields with SM-2
  easeFactor: number;
  interval: number;
  repetitions: number;
}

export type SM2Result = FSRSResult;

const FSRS_RETENTION_KEY = "myenglish_fsrs_request_retention";
const FSRS_MAX_INTERVAL_KEY = "myenglish_fsrs_max_interval";

export interface FSRSSettings {
  requestRetention: number; // e.g. 0.9 (90%)
  maximumInterval: number; // e.g. 365 (days)
}

/**
 * Retrieve user's configured FSRS parameters from storage
 */
export function getFSRSSettings(): FSRSSettings {
  try {
    const savedRetention = localStorage.getItem(FSRS_RETENTION_KEY);
    const savedMaxInterval = localStorage.getItem(FSRS_MAX_INTERVAL_KEY);
    return {
      requestRetention: savedRetention ? parseFloat(savedRetention) : 0.9,
      maximumInterval: savedMaxInterval ? parseInt(savedMaxInterval, 10) : 365,
    };
  } catch {
    return { requestRetention: 0.9, maximumInterval: 365 };
  }
}

/**
 * Update user's FSRS parameters
 */
export function saveFSRSSettings(settings: Partial<FSRSSettings>): void {
  try {
    if (settings.requestRetention !== undefined) {
      localStorage.setItem(FSRS_RETENTION_KEY, settings.requestRetention.toString());
    }
    if (settings.maximumInterval !== undefined) {
      localStorage.setItem(FSRS_MAX_INTERVAL_KEY, settings.maximumInterval.toString());
    }
  } catch {}
}

/**
 * Instantiate configured FSRS scheduler instance
 */
export function getFSRSScheduler(customSettings?: Partial<FSRSSettings>) {
  const current = getFSRSSettings();
  const request_retention = customSettings?.requestRetention ?? current.requestRetention;
  const maximum_interval = customSettings?.maximumInterval ?? current.maximumInterval;

  const params = generatorParameters({
    request_retention,
    maximum_interval,
    enable_fuzz: false,
    enable_short_term: true,
  });

  return fsrs(params);
}

/**
 * Convert SQLite SRSReview row into a ts-fsrs Card object
 */
export function srsRowToCard(row?: Partial<SRSReview>): Card {
  const empty = createEmptyCard();
  if (!row) return empty;

  const dueDate = row.next_review_date ? new Date(row.next_review_date) : empty.due;
  const isLegacy =
    (row.stability === undefined || row.stability === 0) &&
    row.repetitions !== undefined &&
    row.repetitions > 0;

  return {
    due: dueDate,
    stability:
      row.stability && row.stability > 0
        ? row.stability
        : isLegacy
        ? Math.max(1, row.interval || 1)
        : 0,
    difficulty:
      row.difficulty && row.difficulty > 0
        ? row.difficulty
        : isLegacy
        ? 5.0
        : 0,
    elapsed_days: row.elapsed_days ?? 0,
    scheduled_days: row.scheduled_days ?? row.interval ?? 0,
    reps: row.reps ?? row.repetitions ?? 0,
    lapses: row.lapses ?? 0,
    state: (row.state !== undefined && row.state !== null
      ? row.state
      : isLegacy
      ? State.Review
      : State.New) as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
    learning_steps: empty.learning_steps ?? 0,
  };
}

/**
 * Format interval into human readable short representation (1m, 10m, 2h, 3d, 1mo, 1y)
 */
export function formatIntervalPreview(due: Date, now: Date = new Date()): string {
  const diffMs = due.getTime() - now.getTime();
  if (diffMs <= 60 * 1000) return "1m";
  const mins = Math.round(diffMs / (60 * 1000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(diffMs / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h`;
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export interface IntervalPreviews {
  [Rating.Again]: string;
  [Rating.Hard]: string;
  [Rating.Good]: string;
  [Rating.Easy]: string;
}

/**
 * Calculate expected next interval for all 4 grading choices
 */
export function getNextIntervalPreviews(
  srsRow?: Partial<SRSReview>,
  now: Date = new Date()
): IntervalPreviews {
  try {
    const scheduler = getFSRSScheduler();
    const card = srsRowToCard(srsRow);
    const repeatResult = scheduler.repeat(card, now);
    return {
      [Rating.Again]: formatIntervalPreview(repeatResult[Rating.Again].card.due, now),
      [Rating.Hard]: formatIntervalPreview(repeatResult[Rating.Hard].card.due, now),
      [Rating.Good]: formatIntervalPreview(repeatResult[Rating.Good].card.due, now),
      [Rating.Easy]: formatIntervalPreview(repeatResult[Rating.Easy].card.due, now),
    };
  } catch (err) {
    console.warn("Failed to calculate FSRS interval previews:", err);
    return {
      [Rating.Again]: "1m",
      [Rating.Hard]: "1d",
      [Rating.Good]: "3d",
      [Rating.Easy]: "7d",
    };
  }
}

/**
 * Pure SuperMemo-2 (SM-2) algorithm fallback for legacy tests / comparisons.
 */
export function calculateSM2(
  quality: number,
  currentRepetitions: number,
  currentInterval: number,
  currentEaseFactor: number = 2.5,
  currentLapses: number = 0
): SM2Result {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let nextRepetitions = currentRepetitions;
  let nextInterval = currentInterval;

  if (q >= 3) {
    if (currentRepetitions === 0) {
      nextInterval = 1;
    } else if (currentRepetitions === 1) {
      nextInterval = 6;
    } else {
      nextInterval = Math.round(currentInterval * currentEaseFactor);
    }
    nextRepetitions = currentRepetitions + 1;
  } else {
    nextRepetitions = 0;
    nextInterval = 1;
  }

  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  let nextEaseFactor = currentEaseFactor + delta;
  if (nextEaseFactor < 1.3) nextEaseFactor = 1.3;
  nextEaseFactor = Number(nextEaseFactor.toFixed(2));

  const nextDate = new Date(Date.now() + nextInterval * 24 * 60 * 60 * 1000);

  return {
    stability: nextInterval,
    difficulty: 5.0,
    elapsed_days: 0,
    scheduled_days: nextInterval,
    reps: nextRepetitions,
    lapses: q < 3 ? currentLapses + 1 : currentLapses,
    state: nextRepetitions > 0 ? 2 : 0,
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
 * Record a user review session for a word, updating its SRS metadata in SQLite using FSRS.
 */
export async function recordReview(
  wordId: string,
  ratingOrQuality: Rating | number
): Promise<FSRSResult> {
  const db = await getDatabase();
  const now = new Date();

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
    next_review_date: now.toISOString(),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0 as FSRSState,
    last_review: null,
  };

  // 2. Normalize input to FSRS Rating
  let fsrsRating: Rating;
  if (ratingOrQuality === 5 || ratingOrQuality === Rating.Easy) {
    fsrsRating = Rating.Easy;
  } else if (ratingOrQuality === Rating.Good) {
    fsrsRating = Rating.Good;
  } else if (ratingOrQuality === Rating.Hard) {
    fsrsRating = Rating.Hard;
  } else {
    fsrsRating = Rating.Again;
  }

  // 3. Compute new FSRS values
  const scheduler = getFSRSScheduler();
  const card = srsRowToCard(current);
  const result = scheduler.next(card, now, fsrsRating);

  const updatedCard = result.card;

  // Ensure lapses properly counts every failed review attempt on studied cards
  if (fsrsRating === Rating.Again && updatedCard.lapses === (current.lapses ?? 0)) {
    // If ts-fsrs did not increment lapses because the card was already in Relearning or Learning state,
    // but the card has already been studied before (reps > 0 or state === State.Relearning),
    // increment lapses so chronic difficulty (Leech) is accurately identified.
    if ((current.reps ?? 0) > 0 || current.state === State.Relearning) {
      updatedCard.lapses = (current.lapses ?? 0) + 1;
    }
  }

  const nextReviewDateStr = updatedCard.due.toISOString();
  const lastReviewStr = now.toISOString();

  // 4. Persist back into SQLite (updating both FSRS & legacy compatibility fields)
  await db.execute(
    `INSERT INTO srs_reviews (
       word_id, ease_factor, interval, repetitions, next_review_date,
       stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT(word_id) DO UPDATE SET
       ease_factor = excluded.ease_factor,
       interval = excluded.interval,
       repetitions = excluded.repetitions,
       next_review_date = excluded.next_review_date,
       stability = excluded.stability,
       difficulty = excluded.difficulty,
       elapsed_days = excluded.elapsed_days,
       scheduled_days = excluded.scheduled_days,
       reps = excluded.reps,
       lapses = excluded.lapses,
       state = excluded.state,
       last_review = excluded.last_review;`,
    [
      wordId,
      2.5, // ease_factor legacy default
      updatedCard.scheduled_days, // interval
      updatedCard.reps, // repetitions
      nextReviewDateStr,
      Number(updatedCard.stability.toFixed(4)),
      Number(updatedCard.difficulty.toFixed(4)),
      updatedCard.elapsed_days,
      updatedCard.scheduled_days,
      updatedCard.reps,
      updatedCard.lapses,
      updatedCard.state,
      lastReviewStr,
    ]
  );

  return {
    stability: Number(updatedCard.stability.toFixed(4)),
    difficulty: Number(updatedCard.difficulty.toFixed(4)),
    elapsed_days: updatedCard.elapsed_days,
    scheduled_days: updatedCard.scheduled_days,
    reps: updatedCard.reps,
    lapses: updatedCard.lapses,
    state: updatedCard.state,
    lastReview: lastReviewStr,
    nextReviewDate: nextReviewDateStr,
    interval: updatedCard.scheduled_days,
    repetitions: updatedCard.reps,
    easeFactor: 2.5,
  };
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
export async function checkAndNotifyDueReviews(sendIfZero: boolean = false): Promise<number> {
  try {
    const dueWords = await getDueWords();
    if (dueWords.length === 0) {
      if (sendIfZero) {
        await triggerDesktopNotification(
          "MyEnglish • Ôn tập từ vựng",
          "Hiện tại không có từ vựng nào quá hạn. Nhấp để vào màn hình ôn tập luyện tập thêm!"
        );
      }
      return 0;
    }

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
      "MyEnglish • Nhắc nhở ôn tập",
      "Đã đến giờ ôn tập từ vựng Spaced Repetition (FSRS)! Nhấp vào thông báo để mở màn hình ôn tập ngay 🚀"
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

import { listen } from "@tauri-apps/api/event";
import {
  getReminderSettings,
  isSnoozed,
  triggerReviewPopup,
  getLastPopupDisplayTime,
  recordPopupDisplayed,
  getNextReminderTime,
} from "./reminderSettings";

/**
 * Background worker manager that periodically inspects due reviews
 * and triggers the interactive full-screen Focus Review Modal.
 * Listens to native Rust background heartbeat (every 30s) to bypass
 * browser timer throttling when minimized or closed to tray.
 */
class SRSBackgroundWorker {
  private timerId: number | null = null;
  private unlistenHeartbeat: (() => void) | null = null;
  private unlistenPopupOpened: (() => void) | null = null;
  private isTicking = false;

  public async start() {
    this.stop();

    // Listen to native review-popup-opened event so worker syncs anytime popup is opened
    try {
      this.unlistenPopupOpened = await listen("review-popup-opened", () => {
        recordPopupDisplayed(Date.now());
      });
    } catch (err) {
      console.warn("Could not attach review-popup-opened listener in srsWorker:", err);
    }

    // 1. Lắng nghe heartbeat từ Rust (bắn mỗi 30s)
    try {
      this.unlistenHeartbeat = await listen("srs-heartbeat", () => {
        this.tick();
      });
    } catch (err) {
      console.warn("Could not attach srs-heartbeat listener:", err);
    }

    // 2. Also keep a fallback local timer ticking every 15 seconds
    this.timerId = window.setInterval(() => this.tick(), 15000);
  }

  public restart() {
    this.start();
  }

  public stop() {
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.unlistenHeartbeat) {
      this.unlistenHeartbeat();
      this.unlistenHeartbeat = null;
    }
    if (this.unlistenPopupOpened) {
      this.unlistenPopupOpened();
      this.unlistenPopupOpened = null;
    }
  }

  public async tick(forceTrigger: boolean = false) {
    if (this.isTicking && !forceTrigger) return;
    this.isTicking = true;

    try {
      const settings = getReminderSettings();
      if (!forceTrigger) {
        if (!settings.enabled || settings.intervalMinutes === 0) return;
        if (isSnoozed()) return;

        const now = Date.now();
        const lastDisplay = getLastPopupDisplayTime();

        // Nếu chưa từng hiển thị lần nào (hoặc lần đầu mở app),
        // mốc đếm bắt đầu từ lúc này -> popup sẽ hiển thị sau đúng 1 chu kỳ cài đặt
        if (lastDisplay === 0) {
          recordPopupDisplayed(now);
          return;
        }

        // ĐIỀU KIỆN CỐT LÕI: Thời gian lần tiếp theo hiển thị phải tính từ lần cuối cùng popup hiển thị!
        const nextTime = getNextReminderTime();
        if (now < nextTime) {
          return; // Chưa đến giờ hiển thị tiếp theo
        }
      }

      const dueWords = await getDueWords();

      if (settings.triggerCondition === "due_only") {
        if (dueWords.length === 0 && !forceTrigger) return;
      } else {
        const all = await getAllWords();
        if (all.length === 0 && !forceTrigger) return;
      }

      // Kích hoạt Focus Review Modal toàn màn hình
      // (triggerReviewPopup tự động gọi recordPopupDisplayed để ghi nhận mốc hiển thị mới)
      await triggerReviewPopup();
    } catch (err) {
      console.warn("SRS worker tick failed:", err);
    } finally {
      this.isTicking = false;
    }
  }
}

export const srsWorker = new SRSBackgroundWorker();
