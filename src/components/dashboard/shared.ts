import type { WordDetail } from "@/types/database";

export type DashboardTab = "library" | "capture" | "review" | "analytics" | "guide" | "grammar";
export type FilterMode = "all" | "due" | "mastered" | "leech";
export type ViewMode = "gallery" | "table";

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
export function handleSpeak(text: string, e?: React.MouseEvent) {
  if (e) e.stopPropagation();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }
}
