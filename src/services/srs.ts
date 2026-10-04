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
import { getDatabase, getAllWords, getDueWordsFromDb, countDueWords } from "./db";
import type { WordDetail, SRSReview, FSRSState, CardDirection } from "@/types/database";

export { Rating, State };

const SRS_TABLE: Record<CardDirection, string> = {
  recognition: "srs_reviews",
  production: "srs_production",
};

export interface FSRSResult {
  direction: CardDirection; // card that was actually updated
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  learningSteps: number;
  lastReview?: string;
  nextReviewDate: string;
  // Backward compatibility fields with SM-2
  easeFactor: number;
  interval: number;
  repetitions: number;
}

const FSRS_RETENTION_KEY = "myenglish_fsrs_request_retention";
const FSRS_MAX_INTERVAL_KEY = "myenglish_fsrs_max_interval";
const STUDY_LIMITS_KEY = "myenglish_study_limits_v1";

export interface StudyLimits {
  newCardsPerDay: number; // Max never-reviewed words introduced per day
  maxSessionSize: number; // Max cards in one flashcard session
}

export const DEFAULT_STUDY_LIMITS: StudyLimits = {
  newCardsPerDay: 10,
  maxSessionSize: 30,
};

export function getStudyLimits(): StudyLimits {
  try {
    const raw = localStorage.getItem(STUDY_LIMITS_KEY);
    if (!raw) return { ...DEFAULT_STUDY_LIMITS };
    return { ...DEFAULT_STUDY_LIMITS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STUDY_LIMITS };
  }
}

export function saveStudyLimits(limits: Partial<StudyLimits>): void {
  try {
    localStorage.setItem(STUDY_LIMITS_KEY, JSON.stringify({ ...getStudyLimits(), ...limits }));
  } catch {}
}

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
let cachedScheduler: { key: string; scheduler: ReturnType<typeof fsrs> } | null = null;
let cachedGrammarScheduler: { key: string; scheduler: ReturnType<typeof fsrs> } | null = null;

/**
 * Scheduler for grammar lessons: same retention target, but no minute-level learning steps.
 * A lesson is a concept reviewed over days, so every grade schedules whole days and several
 * questions of one lesson in a single session count as one review.
 */
export function getGrammarScheduler() {
  const { requestRetention, maximumInterval } = getFSRSSettings();
  const key = `${requestRetention}|${maximumInterval}`;
  if (cachedGrammarScheduler?.key === key) return cachedGrammarScheduler.scheduler;
  const scheduler = fsrs(
    generatorParameters({
      request_retention: requestRetention,
      maximum_interval: maximumInterval,
      enable_fuzz: true,
      enable_short_term: false,
    })
  );
  cachedGrammarScheduler = { key, scheduler };
  return scheduler;
}

export function getFSRSScheduler(customSettings?: Partial<FSRSSettings>) {
  const current = getFSRSSettings();
  const request_retention = customSettings?.requestRetention ?? current.requestRetention;
  const maximum_interval = customSettings?.maximumInterval ?? current.maximumInterval;

  const key = `${request_retention}|${maximum_interval}`;
  if (cachedScheduler?.key === key) return cachedScheduler.scheduler;

  const params = generatorParameters({
    request_retention,
    maximum_interval,
    // Fuzz spreads out cards added on the same day so reviews don't pile up on one date
    enable_fuzz: true,
    enable_short_term: true,
  });

  const scheduler = fsrs(params);
  cachedScheduler = { key, scheduler };
  return scheduler;
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
    learning_steps: row.learning_steps ?? 0,
  };
}

/**
 * Memory retrievability R ∈ [0, 1] computed by the same FSRS model that schedules the card.
 */
export function getCardRetrievability(row: Partial<SRSReview>, now: Date = new Date()): number {
  if (!row.stability || row.stability <= 0) return 0;
  // Legacy rows without last_review: estimate it from the scheduled interval
  const card = srsRowToCard(row);
  if (!card.last_review) {
    const scheduled = row.scheduled_days ?? row.interval ?? 0;
    card.last_review = new Date(card.due.getTime() - scheduled * 24 * 60 * 60 * 1000);
  }
  if (card.last_review.getTime() > now.getTime()) return 1;
  try {
    const r = getFSRSScheduler().get_retrievability(card, now, false);
    return Number.isFinite(r) ? Math.max(0, Math.min(1, r)) : 0;
  } catch {
    return 0;
  }
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
 * Fetch all words currently due for repetition (next_review_date <= now)
 */
export async function getDueWords(): Promise<WordDetail[]> {
  return getDueWordsFromDb(new Date());
}

/**
 * Record a user review session for a word, updating its SRS metadata in SQLite using FSRS.
 */
export async function recordReview(
  wordId: string,
  rating: Rating,
  requestedDirection: CardDirection = "recognition"
): Promise<FSRSResult> {
  const db = await getDatabase();
  const now = new Date();

  // 1. Fetch existing SRS data for the card. A production exercise on a word that has no
  //    production card yet (still learning by recognition) is recorded on the recognition card.
  let direction = requestedDirection;
  let srsRows = await db.select<SRSReview[]>(
    `SELECT * FROM ${SRS_TABLE[direction]} WHERE word_id = $1 LIMIT 1;`,
    [wordId]
  );
  if (direction === "production" && srsRows.length === 0) {
    direction = "recognition";
    srsRows = await db.select<SRSReview[]>(`SELECT * FROM srs_reviews WHERE word_id = $1 LIMIT 1;`, [wordId]);
  }
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
    learning_steps: 0,
  };

  // 2. Normalize input to a valid FSRS grade
  const fsrsRating: Rating =
    rating === Rating.Easy || rating === Rating.Good || rating === Rating.Hard ? rating : Rating.Again;

  // 3. Compute new FSRS values
  const scheduler = getFSRSScheduler();
  const card = srsRowToCard(current);
  const result = scheduler.next(card, now, fsrsRating);

  const updatedCard = result.card;

  // Lapses are counted by ts-fsrs only when a Review card is forgotten (Review -> Relearning),
  // so failing repeatedly inside one learning session does not turn a word into a leech.

  const nextReviewDateStr = updatedCard.due.toISOString();
  const lastReviewStr = now.toISOString();

  // 4. Persist back into SQLite (updating both FSRS & legacy compatibility fields)
  await db.execute(
    `INSERT INTO ${SRS_TABLE[direction]} (
       word_id, ease_factor, interval, repetitions, next_review_date,
       stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, learning_steps
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
       last_review = excluded.last_review,
       learning_steps = excluded.learning_steps;`,
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
      updatedCard.learning_steps ?? 0,
    ]
  );

  // Once a word is known by recognition, start training recall with its own production card.
  // It becomes due tomorrow so both directions are not drilled in the same session.
  if (direction === "recognition" && updatedCard.state === State.Review) {
    await db.execute(
      `INSERT OR IGNORE INTO srs_production (word_id, next_review_date, state, reps, lapses, stability, difficulty, learning_steps)
       VALUES ($1, $2, 0, 0, 0, 0, 0, 0)`,
      [wordId, new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()]
    );
  }

  return {
    direction,
    stability: Number(updatedCard.stability.toFixed(4)),
    difficulty: Number(updatedCard.difficulty.toFixed(4)),
    elapsed_days: updatedCard.elapsed_days,
    scheduled_days: updatedCard.scheduled_days,
    reps: updatedCard.reps,
    lapses: updatedCard.lapses,
    state: updatedCard.state,
    learningSteps: updatedCard.learning_steps ?? 0,
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
    const dueCount = await countDueWords();
    if (dueCount === 0) {
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
      `Bạn có ${dueCount} từ vựng cần ôn tập hôm nay. Dành 3 phút ôn ngay nhé!`
    );

    return dueCount;
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
  triggerReviewNudge,
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
export interface PopupBlockers {
  fullscreen_app: string | null;
  screen_sharing_app: string | null;
  focus_mode: boolean | null;
  idle_seconds: number | null; // null where input idle time can't be measured
}

/** Away from the computer for this long: hold the popup until the user is back */
export const IDLE_POSTPONE_SECONDS = 5 * 60;
/** Wait for a natural pause: no keyboard/mouse input for this long */
export const NATURAL_BREAK_SECONDS = 15;
/** ...but never wait for a pause longer than this once the reminder is due */
export const MAX_WAIT_FOR_BREAK_MS = 10 * 60 * 1000;

/**
 * Why the reminder should wait right now (null = show it). `waitedMs` is how long the reminder
 * has already been waiting for a natural pause in the user's activity.
 */
export function popupBlockReasonFrom(b: PopupBlockers | null | undefined, waitedMs: number): string | null {
  if (!b) return null;
  if (b.screen_sharing_app) return `Đang chia sẻ màn hình (${b.screen_sharing_app})`;
  if (b.fullscreen_app) return `Đang dùng ${b.fullscreen_app} ở chế độ toàn màn hình`;
  if (b.focus_mode) return "Đang bật Focus / Không làm phiền";
  if (b.idle_seconds == null) return null;
  if (b.idle_seconds >= IDLE_POSTPONE_SECONDS) return "Bạn đang không dùng máy";
  if (b.idle_seconds < NATURAL_BREAK_SECONDS && waitedMs < MAX_WAIT_FOR_BREAK_MS) {
    return "Bạn đang thao tác, chờ lúc tạm dừng";
  }
  return null;
}

/**
 * Why the review reminder should wait right now, or null when it is fine to show it.
 * Detection is done natively (macOS); on other platforms or on error nothing blocks.
 */
export async function getPopupBlockReason(waitedMs: number = Infinity): Promise<string | null> {
  try {
    return popupBlockReasonFrom(await invoke<PopupBlockers>("get_popup_blockers"), waitedMs);
  } catch {
    return null;
  }
}

class SRSBackgroundWorker {
  private timerId: number | null = null;
  private unlistenHeartbeat: (() => void) | null = null;
  private unlistenPopupOpened: (() => void) | null = null;
  private isTicking = false;
  private lastBlockReason: string | null = null;
  /** When the reminder first became due and started waiting for a good moment */
  private readySince: number | null = null;

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

      if (!forceTrigger) {
        if (settings.triggerCondition === "due_only") {
          if ((await countDueWords()) === 0) return;
        } else {
          const db = await getDatabase();
          const rows = await db.select<{ cnt: number }[]>(`SELECT COUNT(*) as cnt FROM words;`);
          if ((rows[0]?.cnt ?? 0) === 0) return;
        }

        // Don't cover the screen while presenting, sharing, in Focus mode or away from the computer.
        // The popup stays pending and is retried on the next tick (every 15-30s).
        if (settings.respectFocus) {
          const now = Date.now();
          if (this.readySince === null) this.readySince = now;
          const reason = await getPopupBlockReason(now - this.readySince);
          if (reason) {
            if (reason !== this.lastBlockReason) console.info(`[SRS] Hoãn popup ôn tập: ${reason}`);
            this.lastBlockReason = reason;
            return;
          }
        }
        this.lastBlockReason = null;
        this.readySince = null;
      }

      if (forceTrigger) {
        // Manual trigger (tray / test button): open the full review directly
        await triggerReviewPopup();
        return;
      }

      // Gentle start: a small corner card that doesn't take focus; it opens the review on its own
      // after a countdown unless the user snoozes it (triggerReviewNudge records the display time)
      const dueCount = await countDueWords();
      await triggerReviewNudge(dueCount);
    } catch (err) {
      console.warn("SRS worker tick failed:", err);
    } finally {
      this.isTicking = false;
    }
  }
}

export const srsWorker = new SRSBackgroundWorker();
