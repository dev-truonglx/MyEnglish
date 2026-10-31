import type { WordDetail } from "@/types/database";
import { AI_VOCAB_ENABLED } from "@/services/features";

export type DashboardTab =
  | "today"
  | "library"
  | "known"
  | "capture"
  | "reading"
  | "writing"
  | "review"
  | "forgotten"
  | "analytics"
  | "guide"
  | "grammar"
  | "pronunciation"
  | "leaderboard"
  | "account";
export type ViewMode = "gallery" | "table";

/**
 * Scrolling page container shared by every dashboard tab, so all screens have the same width:
 * full width up to 1152px (max-w-6xl), centered, 24px padding.
 */
export const PAGE_CONTAINER = "flex-1 overflow-y-auto overflow-x-hidden p-6 max-w-6xl mx-auto w-full";

export const GALLERY_PAGE_SIZE = 60;
export const DUE_LIST_LIMIT = 50;

/** Single-pass library aggregates computed by MainDashboard */
export interface LibraryStats {
  dueWords: WordDetail[];
  /** "Đang học" / "Nhớ lâu" (services/wordStatus): the same two tiers on every screen */
  learningCount: number;
  rememberedLongCount: number;
  /** The part of rememberedLongCount only marked "Đã biết", not asked yet */
  rememberedKnownCount: number;
  leechCount: number;
  perTopic: Record<string, { total: number; due: number }>;
}

/**
 * Simple mode's sidebar: five entries (plus the account button at its bottom) instead of ten. An entry with several tabs opens its first tab, and
 * while one of its tabs is shown the header has a small bar to switch between them. Tab ids are unchanged
 * (other screens call setActiveTab("…")); every tab belongs to exactly one entry.
 */
export type NavGroupId = "today" | "vocab" | "grammar" | "practice" | "quick" | "settings" | "account";
export interface NavGroup {
  id: NavGroupId;
  label: string;
  tabs: Array<{ tab: DashboardTab; label: string }>;
}
export const SIMPLE_NAV_GROUPS: NavGroup[] = [
  {
    id: "today",
    label: "Hôm nay",
    tabs: [
      { tab: "today", label: "Hôm nay" },
      { tab: "analytics", label: "Tiến độ" },
    ],
  },
  {
    id: "vocab",
    label: "Từ vựng",
    tabs: [
      { tab: "review", label: "Ôn tập" },
      { tab: "library", label: "Từ đã học" },
      { tab: "known", label: "Đã biết" },
      { tab: "capture", label: AI_VOCAB_ENABLED ? "Thêm từ bằng AI" : "Lộ trình từ vựng" },
    ],
  },
  { id: "grammar", label: "Ngữ pháp", tabs: [{ tab: "grammar", label: "Ngữ pháp" }] },
  {
    id: "practice",
    label: "Luyện thêm",
    tabs: [
      { tab: "pronunciation", label: "Phát âm" },
      { tab: "reading", label: "Đọc" },
      { tab: "writing", label: "Viết" },
    ],
  },
  // Not in the list of entries either: the sidebar shows its tabs one by one in "Truy cập nhanh", under the list
  {
    id: "quick",
    label: "Truy cập nhanh",
    tabs: [
      { tab: "forgotten", label: "Từ hay quên" },
      { tab: "leaderboard", label: "Xếp hạng" },
    ],
  },
  { id: "settings", label: "Cài đặt", tabs: [{ tab: "guide", label: "Cài đặt" }] },
  // Not in the list of entries: the sidebar shows it at its bottom, next to the theme switcher
  { id: "account", label: "Tài khoản", tabs: [{ tab: "account", label: "Tài khoản" }] },
];

/** The simple-mode entry a tab belongs to */
export function navGroupOf(tab: DashboardTab): NavGroup {
  return SIMPLE_NAV_GROUPS.find((g) => g.tabs.some((t) => t.tab === tab)) ?? SIMPLE_NAV_GROUPS[0];
}

/** Text-To-Speech Pronunciation (module-level, so its identity is stable for memoized cards) */
export { handleSpeak } from "../review/speech";
