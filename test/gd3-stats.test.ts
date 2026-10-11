import { describe, it, expect } from "vitest";
import { BADGE_DEFINITIONS, checkAndUnlockAchievements, countBadgeWords, getAchievements } from "@/services/achievements";
import { isKnownOnly } from "@/services/smartReview";
import { freshServices, makeWord, reviewSrs } from "./helpers";

/** "Đã biết" from a tap only: Review after one rep, no lapse, never reviewed for real */
const knownOnlySrs = { state: 2, reps: 1, lapses: 0, stability: 25 };

describe("badge counts leave out words only marked 'Đã biết' (S7)", () => {
  it("isKnownOnly matches the tap-only schedule, not a confirmed review", () => {
    expect(isKnownOnly(knownOnlySrs)).toBe(true);
    expect(isKnownOnly(reviewSrs(25, 5))).toBe(false);
  });

  it("counts only confirmed words as remembered and mastered", () => {
    const words = [
      makeWord("confirmed", { topic: "A1", srs: reviewSrs(30, 5) }),
      makeWord("young", { topic: "A1", srs: reviewSrs(5, 1) }),
      makeWord("tap-only", { topic: "A1", srs: knownOnlySrs }),
      makeWord("learning", { topic: "A2", srs: { state: 1, reps: 1, stability: 3 } }),
    ];
    expect(countBadgeWords(words)).toEqual({ rememberedWords: 2, masteredWords: 1, topicMasterCount: 1 });
  });

  it("topicMasterCount is the most mastered words in one level, not the number of levels", () => {
    const tenA1 = Array.from({ length: 10 }, (_, i) => makeWord(`a1-${i}`, { topic: "A1", srs: reviewSrs(30, 5) }));
    const twoA2 = Array.from({ length: 2 }, (_, i) => makeWord(`a2-${i}`, { topic: "A2", srs: reviewSrs(30, 5) }));
    const tapOnlyA2 = Array.from({ length: 20 }, (_, i) => makeWord(`k-${i}`, { topic: "A2", srs: knownOnlySrs }));
    const counts = countBadgeWords([...tenA1, ...twoA2, ...tapOnlyA2]);
    expect(counts.topicMasterCount).toBe(10);
    expect(counts.masteredWords).toBe(12);
  });

  it("'Mười Từ Qua Đêm' is not earned by ten tap-only words", () => {
    const tapOnly = Array.from({ length: 10 }, (_, i) => makeWord(`k-${i}`, { srs: knownOnlySrs }));
    expect(countBadgeWords(tapOnly).rememberedWords).toBe(0);
  });
});

describe("badge unlock state (S7)", () => {
  it("a full progress bar alone does not unlock a badge", async () => {
    await freshServices();
    const { getAchievements: fresh } = await import("@/services/achievements");
    const first = fresh({ masteredWords: 1 }).find((b) => b.id === "first_word");
    expect(first?.progress).toBe(100);
    expect(first?.isUnlocked).toBe(false);
  });

  it("isUnlocked is set once the badge is actually awarded and saved", async () => {
    await freshServices();
    const achievements = await import("@/services/achievements");
    const newly = achievements.checkAndUnlockAchievements({ masteredWords: 1 });
    expect(newly.map((b) => b.id)).toContain("first_word");
    expect(achievements.getAchievements({ masteredWords: 1 }).find((b) => b.id === "first_word")?.isUnlocked).toBe(true);
  });

  it("a level-up badge with no saved unlock stays locked at 100%", () => {
    const badge = getAchievements({ topicMasterCount: 10 }).find((b) => b.id === "topic_master");
    expect(badge?.progress).toBe(100);
    expect(badge?.isUnlocked).toBe(false);
  });

  it("'Mười Từ Qua Đêm' unlocks from confirmed remembered words only", async () => {
    await freshServices();
    const achievements = await import("@/services/achievements");
    const tapOnly = Array.from({ length: 10 }, (_, i) => makeWord(`k-${i}`, { srs: knownOnlySrs }));
    const none = checkAndUnlockAchievements({ rememberedWords: countBadgeWords(tapOnly).rememberedWords });
    expect(none.map((b) => b.id)).not.toContain("remembered_10");
    const confirmed = Array.from({ length: 10 }, (_, i) => makeWord(`c-${i}`, { srs: reviewSrs(5, 1) }));
    const got = achievements.checkAndUnlockAchievements({ rememberedWords: countBadgeWords(confirmed).rememberedWords });
    expect(got.map((b) => b.id)).toContain("remembered_10");
  });
});

describe("badge wording (S8)", () => {
  it("no badge calls a CEFR level a 'chủ đề'", () => {
    const texts = BADGE_DEFINITIONS.map((b) => `${b.title} ${b.description}`);
    expect(texts.filter((t) => /chủ đề/i.test(t))).toEqual([]);
    expect(BADGE_DEFINITIONS.find((b) => b.id === "topic_master")?.title).toBe("Chuyên Gia Cấp Độ");
  });
});

describe("vocabulary reset clears the picked-words key (vocabReset)", () => {
  it("removes myenglish_picked_words_v1 from localStorage and app_kv", async () => {
    const { db } = await freshServices();
    const conn = await db.getDatabase();
    localStorage.setItem("myenglish_picked_words_v1", JSON.stringify(["server"]));
    await conn.execute(`INSERT INTO app_kv (key, value, updated_at) VALUES ('myenglish_picked_words_v1', '[]', 'now')`);

    const reset = await import("@/services/vocabReset");
    await reset.resetVocabulary();

    expect(localStorage.getItem("myenglish_picked_words_v1")).toBeNull();
    expect(await conn.select(`SELECT * FROM app_kv WHERE key = 'myenglish_picked_words_v1'`)).toEqual([]);
  });
});
