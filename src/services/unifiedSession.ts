/**
 * Unified cross-tab session synchronization service.
 * Keeps active tab, review session (current card / sentence / stats), and screen position
 * completely synchronized across all tabs in both Web and Chrome Extension.
 */
import type { DashboardTab } from "@/components/dashboard/shared";
import type { CardDirection, ReviewCard, WordDetail } from "@/types/database";
import { toCard } from "./cards";

export const UNIFIED_SESSION_KEY = "myenglish_unified_session_v1";
const SESSION_STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

// Unique identifier for this browser tab context
const LOCAL_TAB_ID =
  typeof window !== "undefined"
    ? Math.random().toString(36).slice(2) + Date.now().toString(36)
    : "server";

export function getTabId(): string {
  return LOCAL_TAB_ID;
}

export interface ReviewSessionSnapshot {
  sessionId: number;
  practiceMode: boolean;
  focusMinutes?: number;
  cards: Array<{ wordId: string; direction: CardDirection }>;
  currentIndex: number;
  sessionStats?: {
    firstTryCorrect: number;
    retryCorrect: number;
    revealedCount: number;
    skippedCount: number;
    totalWrongAttempts: number;
    totalXPEarned: number;
  };
}

export interface UnifiedSessionData {
  version: 1;
  updatedAt: number;
  tabId: string;
  action?: "tab_change" | "review_start" | "review_card" | "review_exit" | "grammar_change" | "init";
  activeTab: DashboardTab;
  isReviewing: boolean;
  review?: ReviewSessionSnapshot | null;
  grammarLessonId?: string | null;
  searchQuery?: string;
  selectedWordId?: string | null;
}

const defaultSession: UnifiedSessionData = {
  version: 1,
  updatedAt: 0,
  tabId: LOCAL_TAB_ID,
  activeTab: "today",
  isReviewing: false,
  review: null,
  grammarLessonId: null,
  searchQuery: "",
  selectedWordId: null,
};

export function getUnifiedSession(): UnifiedSessionData {
  if (typeof window === "undefined" || !window.localStorage) return defaultSession;
  try {
    const raw = localStorage.getItem(UNIFIED_SESSION_KEY);
    if (!raw) return defaultSession;
    const data = JSON.parse(raw) as UnifiedSessionData;
    if (!data || data.version !== 1) return defaultSession;
    // Check staleness of in-progress review
    if (data.isReviewing && data.updatedAt && Date.now() - data.updatedAt > SESSION_STALE_MS) {
      data.isReviewing = false;
      data.review = null;
    }
    return data;
  } catch {
    return defaultSession;
  }
}

export function saveUnifiedSession(patch: Partial<UnifiedSessionData>): UnifiedSessionData {
  if (typeof window === "undefined" || !window.localStorage) return defaultSession;
  try {
    const current = getUnifiedSession();
    const updated: UnifiedSessionData = {
      ...current,
      ...patch,
      tabId: patch.tabId ?? LOCAL_TAB_ID,
      updatedAt: Date.now(),
    };
    localStorage.setItem(UNIFIED_SESSION_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return defaultSession;
  }
}

export function updateReviewCardIndex(
  currentIndex: number,
  sessionStats?: ReviewSessionSnapshot["sessionStats"]
): void {
  const current = getUnifiedSession();
  if (!current.review) return;
  saveUnifiedSession({
    action: "review_card",
    review: {
      ...current.review,
      currentIndex,
      sessionStats: sessionStats ?? current.review.sessionStats,
    },
  });
}

export function clearReviewSession(targetTab: DashboardTab = "today"): void {
  saveUnifiedSession({
    action: "review_exit",
    isReviewing: false,
    review: null,
    activeTab: targetTab,
  });
}

/** Reconstructs full ReviewCard[] objects from saved wordId + direction list */
export function reconstructReviewCards(
  savedCards: Array<{ wordId: string; direction: CardDirection }>,
  allWords: WordDetail[]
): ReviewCard[] {
  if (!savedCards || savedCards.length === 0) return [];
  const byId = new Map<string, WordDetail>(allWords.map((w) => [String(w.id), w]));
  const result: ReviewCard[] = [];
  for (const item of savedCards) {
    const word = byId.get(String(item.wordId));
    if (word) {
      result.push(toCard(word, item.direction));
    }
  }
  return result;
}
