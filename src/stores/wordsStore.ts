import { create } from "zustand";
import { getAllWords } from "@/services/db";
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
  /** Back to the initial state (a freshly mounted dashboard); in-flight refreshes are discarded */
  reset: () => void;
}

let refreshSeq = 0;
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
      if (opts.showLoading && gen === generation) set({ loading: false });
    }
  },

  reset: () => {
    refreshSeq++;
    generation++;
    set({ ...initialState });
  },
}));
