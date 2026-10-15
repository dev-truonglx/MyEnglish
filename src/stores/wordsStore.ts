import { create } from "zustand";
import { getAllWords, getWordsByIds } from "@/services/db";
import type { WordDetail } from "@/types/database";

type Updater<T> = T | ((prev: T) => T);

interface WordsStoreState {
  words: WordDetail[];
  loading: boolean;
  selectedWordId: string | null;
  /**
   * Inspector snapshot of the selected word. Kept as an object (not derived from `words`)
   * so a word that disappears from a refresh keeps showing until the user closes it,
   * exactly like the previous component-local state.
   */
  selectedWord: WordDetail | null;

  setWords: (next: Updater<WordDetail[]>) => void;
  setSelectedWord: (next: Updater<WordDetail | null>) => void;
  /**
   * Load words from SQLite. showLoading toggles the global spinner (initial load / manual refresh only).
   * A newer refresh started meanwhile wins: older responses are dropped.
   */
  refreshWords: (opts?: { showLoading?: boolean }) => Promise<void>;
  /**
   * Reload only these words (a review or an introduction changed them) and patch them into the list.
   * Falls back to a full refresh for a word not in the list yet (keeps the list order) or while a full
   * refresh is loading (its older result would overwrite the patch).
   */
  refreshWordsByIds: (ids: string[]) => Promise<void>;
  /** Back to the initial state (a freshly mounted dashboard); in-flight refreshes are discarded */
  reset: () => void;
}

let refreshSeq = 0;
// Full refreshes still loading
let fullRefreshesInFlight = 0;
// Bumped by reset(): refreshes started before it must not touch the new state at all
let generation = 0;

const initialState = {
  words: [] as WordDetail[],
  loading: true,
  selectedWordId: null as string | null,
  selectedWord: null as WordDetail | null,
};

export const useWordsStore = create<WordsStoreState>((set, get) => ({
  ...initialState,

  setWords: (next) =>
    set((state) => ({ words: typeof next === "function" ? next(state.words) : next })),

  setSelectedWord: (next) =>
    set((state) => {
      const selectedWord = typeof next === "function" ? next(state.selectedWord) : next;
      return { selectedWord, selectedWordId: selectedWord?.id ?? null };
    }),

  refreshWords: async (opts = {}) => {
    const seq = ++refreshSeq;
    const gen = generation;
    if (opts.showLoading) set({ loading: true });
    fullRefreshesInFlight++;
    try {
      const list = await getAllWords();
      // A newer refresh started meanwhile: don't let this older response overwrite it
      if (seq !== refreshSeq) return;
      // Keep the inspector in sync with the latest data
      const prev = get().selectedWord;
      const selectedWord = prev ? list.find((w) => w.id === prev.id) ?? prev : prev;
      set({ words: list, selectedWord, selectedWordId: selectedWord?.id ?? null });
    } catch (err) {
      console.error("Failed to fetch words:", err);
    } finally {
      fullRefreshesInFlight--;
      // Only the latest refresh ends the loading state: a superseded one would show the still-empty list as
      // "no words" (empty Today, onboarding) while the newer refresh is loading
      if (gen === generation && seq === refreshSeq) set({ loading: false });
    }
  },

  refreshWordsByIds: async (ids) => {
    if (ids.length === 0) return;
    if (fullRefreshesInFlight > 0) return get().refreshWords();
    // A full refresh started meanwhile reads the change too, and its result must not be overwritten
    const seq = refreshSeq;
    const gen = generation;
    let fresh;
    try {
      fresh = await getWordsByIds(ids);
    } catch (err) {
      console.warn("Failed to reload changed words:", err);
      return get().refreshWords();
    }
    if (seq !== refreshSeq || gen !== generation) return;
    const current = get().words;
    const known = new Set(current.map((w) => w.id));
    if (fresh.some((w) => !known.has(w.id))) return get().refreshWords();
    const byId = new Map(fresh.map((w) => [w.id, w]));
    // Asked for but not found: deleted
    const gone = new Set(ids.filter((id) => !byId.has(id)));
    const words = current.filter((w) => !gone.has(w.id)).map((w) => byId.get(w.id) ?? w);
    const prev = get().selectedWord;
    const selectedWord = prev ? byId.get(prev.id) ?? prev : prev;
    set({ words, selectedWord, selectedWordId: selectedWord?.id ?? null });
  },

  reset: () => {
    refreshSeq++;
    generation++;
    set({ ...initialState });
  },
}));
