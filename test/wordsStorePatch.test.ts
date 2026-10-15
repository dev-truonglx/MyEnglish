import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WordDetail } from "@/types/database";

const db = vi.hoisted(() => ({
  all: [] as unknown[],
  byIds: [] as unknown[],
  pendingAll: [] as Array<(w: unknown[]) => void>,
  holdAll: false,
}));
vi.mock("@/services/db", () => ({
  getAllWords: vi.fn(() =>
    db.holdAll ? new Promise((resolve) => db.pendingAll.push(resolve)) : Promise.resolve(db.all)
  ),
  getWordsByIds: vi.fn((ids: string[]) =>
    Promise.resolve((db.byIds as WordDetail[]).filter((w) => ids.includes(w.id)))
  ),
}));

import { useWordsStore } from "@/stores/wordsStore";
import { getAllWords } from "@/services/db";

const word = (id: string, reps = 0) => ({ id, word: id, srs: { reps } }) as unknown as WordDetail;

describe("wordsStore.refreshWordsByIds", () => {
  beforeEach(async () => {
    vi.mocked(getAllWords).mockClear();
    db.holdAll = false;
    db.pendingAll.length = 0;
    useWordsStore.getState().reset();
    db.all = [word("c"), word("b"), word("a")];
    await useWordsStore.getState().refreshWords();
    vi.mocked(getAllWords).mockClear();
  });

  it("patches the changed words in place without a full reload", async () => {
    db.byIds = [word("b", 3)];
    await useWordsStore.getState().refreshWordsByIds(["b"]);
    const words = useWordsStore.getState().words;
    expect(words.map((w) => w.id)).toEqual(["c", "b", "a"]);
    expect(words[1].srs.reps).toBe(3);
    expect(getAllWords).not.toHaveBeenCalled();
  });

  it("drops a word that no longer exists and keeps the inspector in sync", async () => {
    useWordsStore.getState().setSelectedWord(word("a"));
    db.byIds = [word("a", 2)];
    await useWordsStore.getState().refreshWordsByIds(["a", "c"]);
    expect(useWordsStore.getState().words.map((w) => w.id)).toEqual(["b", "a"]);
    expect(useWordsStore.getState().selectedWord?.srs.reps).toBe(2);
  });

  it("falls back to a full reload for a word not in the list yet", async () => {
    db.byIds = [word("d")];
    db.all = [word("d"), word("c"), word("b"), word("a")];
    await useWordsStore.getState().refreshWordsByIds(["d"]);
    expect(getAllWords).toHaveBeenCalledTimes(1);
    expect(useWordsStore.getState().words.map((w) => w.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("does a full reload while an older full reload is still loading", async () => {
    db.holdAll = true;
    const older = useWordsStore.getState().refreshWords();
    db.byIds = [word("b", 5)];
    const patch = useWordsStore.getState().refreshWordsByIds(["b"]);
    // The older full reload (read before the change) answers first, then the newer one
    db.pendingAll[0]([word("c"), word("b", 0), word("a")]);
    db.pendingAll[1]?.([word("c"), word("b", 5), word("a")]);
    await Promise.all([older, patch]);
    expect(useWordsStore.getState().words[1].srs.reps).toBe(5);
  });
});
