/**
 * Per-learner FSRS parameters. The 21 FSRS-6 weights are trained (Rust `fsrs` crate, the engine Anki
 * uses) on this learner's own scheduled reviews, so intervals follow how fast *they* forget instead of
 * the population default. Nothing is applied without the learner confirming it.
 */
import { invoke } from "@tauri-apps/api/core";
import { getDatabase } from "./db";

export const FSRS_WEIGHTS_KEY = "myenglish_fsrs_weights_v1";
export const FSRS_PARAM_COUNT = 21;
/** Below this, the defaults (trained on millions of reviews) are a better bet than a personal fit */
export const MIN_OPTIMIZER_REVIEWS = 400;
export const MIN_OPTIMIZER_CARDS = 50;

export interface StoredWeights {
  w: number[];
  computedAt: string;
  reviewCount: number;
  before: OptimizerMetrics;
  after: OptimizerMetrics;
}

export interface OptimizerMetrics {
  log_loss: number;
  rmse: number;
}

export interface OptimizerResult {
  parameters: number[];
  default_metrics: OptimizerMetrics;
  new_metrics: OptimizerMetrics;
  review_count: number;
  item_count: number;
}

export interface FsrsTrainingItem {
  reviews: Array<{ rating: number; deltaT: number }>;
}

export function isValidWeights(w: unknown): w is number[] {
  return Array.isArray(w) && w.length === FSRS_PARAM_COUNT && w.every((x) => typeof x === "number" && Number.isFinite(x));
}

/** Weights applied by the learner, or null to use the defaults */
export function getStoredWeights(): StoredWeights | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(FSRS_WEIGHTS_KEY) || "null");
    return parsed && isValidWeights(parsed.w) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveWeights(result: OptimizerResult): void {
  const stored: StoredWeights = {
    w: result.parameters,
    computedAt: new Date().toISOString(),
    reviewCount: result.review_count,
    before: result.default_metrics,
    after: result.new_metrics,
  };
  localStorage.setItem(FSRS_WEIGHTS_KEY, JSON.stringify(stored));
}

export function resetWeights(): void {
  try {
    localStorage.removeItem(FSRS_WEIGHTS_KEY);
  } catch {}
}

interface LogRow {
  word_id: string;
  direction: string | null;
  rating: number;
  timestamp: string;
}

function localDayNumber(iso: string): number {
  const d = new Date(iso);
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
}

/**
 * Turn review logs into one history per card (word + direction), oldest first, with whole local days
 * between reviews (0 for same-day reviews, as fsrs-rs expects). Only direct scheduled answers count:
 * practice, introductions, implicit credits and legacy logs (graded before the rating fix) are left out.
 */
export function buildTrainingItems(rows: LogRow[]): FsrsTrainingItem[] {
  const byCard = new Map<string, LogRow[]>();
  for (const r of rows) {
    if (r.rating < 1 || r.rating > 4) continue;
    const key = `${r.word_id}:${r.direction ?? "recognition"}`;
    const list = byCard.get(key) ?? [];
    list.push(r);
    byCard.set(key, list);
  }
  const items: FsrsTrainingItem[] = [];
  for (const list of byCard.values()) {
    list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    let prevDay: number | null = null;
    const reviews = list.map((r) => {
      const day = localDayNumber(r.timestamp);
      const deltaT = prevDay === null ? 0 : Math.max(0, day - prevDay);
      prevDay = day;
      return { rating: r.rating, deltaT };
    });
    if (reviews.length >= 2) items.push({ reviews });
  }
  return items;
}

export async function loadTrainingItems(): Promise<{ items: FsrsTrainingItem[]; reviewCount: number; cardCount: number }> {
  const db = await getDatabase();
  const rows = await db.select<LogRow[]>(
    `SELECT l.word_id, l.direction, l.rating, l.timestamp FROM review_logs l
     JOIN words w ON w.id = l.word_id
     WHERE l.is_scheduled = 1 AND l.exercise_type != 'intro'
     ORDER BY l.word_id, l.timestamp`
  );
  const items = buildTrainingItems(rows);
  return { items, reviewCount: items.reduce((n, i) => n + i.reviews.length, 0), cardCount: items.length };
}

/** Train personal parameters (runs natively, may take several seconds). Does not apply them. */
export async function computePersonalWeights(items: FsrsTrainingItem[]): Promise<OptimizerResult> {
  const result = await invoke<OptimizerResult>("compute_fsrs_parameters", { items });
  if (!isValidWeights(result?.parameters)) throw new Error("Bộ tối ưu trả về tham số không hợp lệ");
  return result;
}
