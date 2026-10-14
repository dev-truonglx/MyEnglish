import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WordDetail } from "@/types/database";

const pending: Array<(words: WordDetail[]) => void> = [];
vi.mock("@/services/db", () => ({
  getAllWords: vi.fn(() => new Promise<WordDetail[]>((resolve) => pending.push(resolve))),
}));

import { useWordsStore } from "@/stores/wordsStore";

const word = (id: string) => ({ id, word: id }) as unknown as WordDetail;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("wordsStore.refreshWords", () => {
  beforeEach(() => {
    pending.length = 0;
    useWordsStore.getState().reset();
  });

  it("a superseded loading refresh does not end the loading state", async () => {
    const { refreshWords } = useWordsStore.getState();
    const first = refreshWords({ showLoading: true });
    const second = refreshWords();
    // The older request answers first with nothing usable: the list is still empty and loading must stay on
    pending[0]([]);
    await first;
    expect(useWordsStore.getState().loading).toBe(true);
    expect(useWordsStore.getState().words).toEqual([]);
    // The latest one lands: words are in and loading ends
    pending[1]([word("a")]);
    await second;
    await flush();
    expect(useWordsStore.getState().loading).toBe(false);
    expect(useWordsStore.getState().words.map((w) => w.id)).toEqual(["a"]);
  });

  it("the latest refresh ends loading on its own", async () => {
    const refresh = useWordsStore.getState().refreshWords({ showLoading: true });
    pending[0]([word("x")]);
    await refresh;
    expect(useWordsStore.getState().loading).toBe(false);
  });
});
