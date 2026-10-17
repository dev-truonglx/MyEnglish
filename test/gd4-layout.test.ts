import { describe, it, expect } from "vitest";
import { countWordStatus, isLearning, isRememberedLong, wordStatus, WORD_STATUS_LABELS } from "@/services/wordStatus";
import { SIMPLE_NAV_GROUPS, navGroupOf, type DashboardTab } from "@/components/dashboard/shared";
import { makeWord, reviewSrs } from "./helpers";

/** "Đã biết" from a tap only: Review after one rep, no lapse, never reviewed for real */
const knownOnlySrs = { state: 2 as const, reps: 1, lapses: 0, stability: 25 };

describe("one definition of 'đã thuộc': Đang học / Nhớ lâu (U9)", () => {
  const unseen = makeWord("unseen"); // a deck word still waiting in the buffer
  const learning = makeWord("learning", { srs: { state: 1, reps: 1, stability: 0.5, last_review: new Date().toISOString() } });
  const young = makeWord("young", { srs: reviewSrs(6, 2) });
  const relearning = makeWord("relearning", { srs: { state: 3, reps: 6, lapses: 2, stability: 30 } });
  const long = makeWord("long", { srs: reviewSrs(21, 10) });
  const tapOnly = makeWord("tap-only", { srs: knownOnlySrs });

  it("isRememberedLong: recognition card in Review with stability >= 21 days, confirmed by a real review", () => {
    expect(isRememberedLong(long)).toBe(true);
    expect(isRememberedLong(young)).toBe(false);
    expect(isRememberedLong(relearning)).toBe(false); // forgotten: back to learning, whatever its stability
    expect(isRememberedLong(tapOnly)).toBe(false);
    expect(isRememberedLong(unseen)).toBe(false);
  });

  it("isLearning: met at least once, not remembered for the long run; words never met or only tapped are not", () => {
    expect(isLearning(learning)).toBe(true);
    expect(isLearning(young)).toBe(true);
    expect(isLearning(relearning)).toBe(true);
    expect(isLearning(long)).toBe(false);
    expect(isLearning(unseen)).toBe(false);
    expect(isLearning(tapOnly)).toBe(false);
  });

  it("a review card is judged on its recognition card, not on the production card in srs", () => {
    const card = { ...long, srs: { ...long.srs, state: 1 as const, stability: 1 }, srsRecognition: long.srs };
    expect(isRememberedLong(card)).toBe(true);
    expect(isLearning(card)).toBe(false);
  });

  it("wordStatus and the shared labels", () => {
    expect([unseen, learning, long, tapOnly].map(wordStatus)).toEqual(["new", "learning", "remembered_long", "known_only"]);
    expect(WORD_STATUS_LABELS.learning).toBe("Đang học");
    expect(WORD_STATUS_LABELS.remembered_long).toBe("Nhớ lâu");
  });

  it("countWordStatus puts every word in at most one tier", () => {
    expect(countWordStatus([unseen, learning, young, relearning, long, tapOnly])).toEqual({ learning: 3, rememberedLong: 1 });
    expect(countWordStatus([])).toEqual({ learning: 0, rememberedLong: 0 });
  });
});

describe("simple mode's five sidebar entries (U15)", () => {
  const ALL_TABS: DashboardTab[] = [
    "today", "library", "known", "capture", "reading", "writing", "review", "forgotten", "analytics", "guide", "grammar", "pronunciation", "leaderboard", "account",
  ];

  it("has five entries in order, and every tab belongs to exactly one", () => {
    expect(SIMPLE_NAV_GROUPS.map((g) => g.label)).toEqual(["Hôm nay", "Từ vựng", "Ngữ pháp", "Luyện thêm", "Truy cập nhanh", "Cài đặt", "Tài khoản"]);
    const tabs = SIMPLE_NAV_GROUPS.flatMap((g) => g.tabs.map((t) => t.tab));
    expect([...tabs].sort()).toEqual([...ALL_TABS].sort());
  });

  it("Từ vựng opens Ôn tập first and holds the library and the vocabulary path; Luyện thêm opens Phát âm", () => {
    expect(navGroupOf("library").id).toBe("vocab");
    expect(navGroupOf("capture").id).toBe("vocab");
    // Quick access: both tabs one click away, and a bar to switch between them
    expect(navGroupOf("forgotten").id).toBe("quick");
    expect(navGroupOf("leaderboard").tabs.map((t) => t.tab)).toEqual(["forgotten", "leaderboard"]);
    expect(navGroupOf("review").tabs[0].tab).toBe("review");
    expect(navGroupOf("writing").tabs.map((t) => t.tab)).toEqual(["pronunciation", "reading", "writing"]);
    expect(navGroupOf("analytics").id).toBe("today");
  });
});
