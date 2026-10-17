import { create } from "zustand";
import { fetchMyGroups, fetchStanding, weekStart, type GroupInfo, type Standing } from "@/services/leaderboard";
import { useAuthStore } from "./authStore";
import type { SyncReport } from "@/services/sync/types";

const ENABLED_KEY = "myenglish_rank_widgets_v1";
const SCOPE_KEY = "myenglish_rank_scope_v1";
const CACHE_KEY = "myenglish_rank_cache_v1";
// Each fetch ranks the whole board on the server: not more often than this unless asked (sign-in, a new scope)
const MIN_REFRESH_MS = 2 * 60_000;
/** After a sync that moved no XP, the standing is still refreshed when it is this old (others' XP changes) */
const STALE_AFTER_MS = 10 * 60_000;

export interface CachedStanding extends Standing {
  userId: string;
  scope: string | null;
  fetchedAt: number;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** Which board the widgets follow: "all", a group id, or unset (= the first group when there is one) */
export function effectiveScope(pref: string | null, groups: GroupInfo[]): string | null {
  if (pref === "all") return null;
  if (pref && groups.some((g) => g.id === pref)) return pref;
  return groups[0]?.id ?? null;
}

interface StandingState {
  /** The learner's choice to see rank widgets (Today card, sidebar line, end of session) */
  enabled: boolean;
  scopePref: string | null;
  groups: GroupInfo[];
  standing: CachedStanding | null;
  /** The standing when the current review session began (the end-of-session screen compares with it) */
  baseline: CachedStanding | null;
  loading: boolean;
  error: boolean;

  setEnabled: (on: boolean) => void;
  setScope: (scope: string | null) => void;
  refreshGroups: () => Promise<void>;
  /** Fetch the standing (the cached one stays when the network fails). `force` skips the throttle. */
  refresh: (force?: boolean) => Promise<CachedStanding | null>;
  captureBaseline: () => void;
  clear: () => void;
}

export const useStandingStore = create<StandingState>((set, get) => ({
  enabled: read<boolean>(ENABLED_KEY) !== false,
  scopePref: read<string>(SCOPE_KEY),
  groups: [],
  standing: null,
  baseline: null,
  loading: false,
  error: false,

  setEnabled: (on) => {
    write(ENABLED_KEY, on);
    set({ enabled: on });
    if (on) void get().refresh(true);
  },

  setScope: (scope) => {
    const pref = scope === null ? "all" : scope;
    write(SCOPE_KEY, pref);
    set({ scopePref: pref });
    void get().refresh(true);
  },

  refreshGroups: async () => {
    if (!useAuthStore.getState().user) return;
    try {
      set({ groups: await fetchMyGroups() });
    } catch {
      // the groups of the last fetch stay
    }
  },

  refresh: async (force = false) => {
    const user = useAuthStore.getState().user;
    if (!user || !get().enabled) return null;
    const current = get().standing;
    if (!force && current && Date.now() - current.fetchedAt < MIN_REFRESH_MS) return current;
    set({ loading: true });
    try {
      if (get().groups.length === 0) await get().refreshGroups();
      const scope = effectiveScope(get().scopePref, get().groups);
      const s = await fetchStanding(scope);
      const next: CachedStanding | null = s ? { ...s, userId: user.id, scope, fetchedAt: Date.now() } : null;
      if (useAuthStore.getState().user?.id !== user.id) return null; // signed out meanwhile
      set({ standing: next, error: false });
      write(CACHE_KEY, next);
      return next;
    } catch {
      set({ error: true });
      return get().standing;
    } finally {
      set({ loading: false });
    }
  },

  captureBaseline: () => set({ baseline: get().standing }),

  clear: () => {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {}
    set({ standing: null, baseline: null, groups: [], error: false });
  },
}));

/**
 * Keeps the standing fresh: after sign-in, after every sync and when the week turns. The last known standing is
 * shown at once (marked by its age) while the network answers. Main window only. Returns a stop function.
 */
export function startStanding(): () => void {
  const hydrate = (userId: string | undefined) => {
    const cached = read<CachedStanding>(CACHE_KEY);
    // Last week's standing must not pass for this week's
    const sameWeek = !!cached && weekStart(new Date(cached.fetchedAt)).getTime() === weekStart().getTime();
    if (userId && cached && cached.userId === userId && sameWeek) useStandingStore.setState({ standing: cached });
  };
  const user = useAuthStore.getState().user;
  hydrate(user?.id);
  if (user) void useStandingStore.getState().refresh(true);

  // Only when XP moved (ours up, or others' pulled), or the standing has aged: every pass used to rank the board
  const onSynced = (e: Event) => {
    const report = (e as CustomEvent<SyncReport | undefined>).detail;
    const s = useStandingStore.getState().standing;
    const stale = !s || Date.now() - s.fetchedAt > STALE_AFTER_MS;
    if (stale || report?.xpPushed || report?.xpChanged) void useStandingStore.getState().refresh();
  };
  window.addEventListener("myenglish-sync-finished", onSynced);
  const unsubscribe = useAuthStore.subscribe((state, prev) => {
    if (state.user?.id === prev.user?.id) return;
    if (state.user) {
      hydrate(state.user.id);
      void useStandingStore.getState().refresh(true);
    } else {
      useStandingStore.getState().clear();
    }
  });
  // A new week starts on Monday: last week's standing must not be shown as this week's
  const timer = window.setInterval(() => {
    const s = useStandingStore.getState().standing;
    if (s && weekStart(new Date(s.fetchedAt)).getTime() !== weekStart().getTime()) void useStandingStore.getState().refresh(true);
  }, 15 * 60_000);
  return () => {
    window.removeEventListener("myenglish-sync-finished", onSynced);
    unsubscribe();
    window.clearInterval(timer);
  };
}
