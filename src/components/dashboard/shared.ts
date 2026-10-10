import type { WordDetail } from "@/types/database";

export type DashboardTab =
  | "today"
  | "library"
  | "capture"
  | "reading"
  | "writing"
  | "review"
  | "analytics"
  | "guide"
  | "grammar"
  | "pronunciation";
export type FilterMode = "all" | "due" | "mastered" | "leech";
export type ViewMode = "gallery" | "table";

/**
 * Scrolling page container shared by every dashboard tab, so all screens have the same width:
 * full width up to 1152px (max-w-6xl), centered, 24px padding.
 */
export const PAGE_CONTAINER = "flex-1 overflow-y-auto p-6 max-w-6xl mx-auto w-full";

export const GALLERY_PAGE_SIZE = 60;
export const DUE_LIST_LIMIT = 50;

/** Single-pass library aggregates computed by MainDashboard */
export interface LibraryStats {
  dueWords: WordDetail[];
  learnedCount: number;
  leechCount: number;
  perTopic: Record<string, { total: number; due: number }>;
}

/** Text-To-Speech Pronunciation (module-level, so its identity is stable for memoized cards) */
export { handleSpeak } from "../review/speech";
