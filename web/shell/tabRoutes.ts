import type { DashboardTab } from "@/components/dashboard/shared";

/**
 * Slug mapping between dashboard tabs and web URL slugs.
 */
export const TAB_SLUGS = {
  today: "today",
  review: "review",
  library: "words",
  known: "known",
  forgotten: "forgotten",
  grammar: "grammar",
  pronunciation: "pronunciation",
  reading: "reading",
  writing: "writing",
  capture: "roadmap",
  analytics: "progress",
  guide: "settings",
  leaderboard: "leaderboard",
  account: "account",
} as const satisfies Record<DashboardTab, string>;

export type TabSlug = (typeof TAB_SLUGS)[DashboardTab];

/** Reverse map from URL slug to dashboard tab */
export const SLUG_TO_TAB: Record<string, DashboardTab> = Object.fromEntries(
  Object.entries(TAB_SLUGS).map(([tab, slug]) => [slug, tab as DashboardTab])
);

/**
 * Returns the DashboardTab corresponding to a URL pathname under base path (defaults to "/learn").
 * Base path alone ("/learn" or "/learn/") returns "today". Unknown routes return null.
 */
export function tabFromPath(pathname: string, base: string = "/learn"): DashboardTab | null {
  const cleanBase = base.replace(/\/+$/, "");
  const cleanPath = pathname.split(/[?#]/)[0].replace(/\/+$/, "");

  // Base path itself (e.g. "/learn" or "/learn/") maps to "today"
  if (cleanPath === cleanBase) {
    return "today";
  }

  const prefix = cleanBase + "/";
  if (!cleanPath.startsWith(prefix)) {
    return null;
  }

  const remainder = cleanPath.slice(prefix.length);
  if (remainder in SLUG_TO_TAB) {
    return SLUG_TO_TAB[remainder];
  }

  return null;
}

/**
 * Builds the URL path for a given tab under the specified base path (defaults to "/learn").
 */
export function pathForTab(tab: DashboardTab, base: string = "/learn"): string {
  const cleanBase = base.replace(/\/+$/, "");
  const slug = TAB_SLUGS[tab] ?? tab;
  return cleanBase ? `${cleanBase}/${slug}` : `/${slug}`;
}
