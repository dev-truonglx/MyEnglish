import { describe, it, expect } from "vitest";
import {
  includesFoundationGrammar,
  isBeginner,
  isSimpleMode,
  productionUnlockDays,
  setFoundationMode,
  setSimpleMode,
} from "@/services/learnerProfile";
import { setUserOverrideLevel } from "@/services/userProficiency";
import { analyzeText } from "@/services/reading";
import { FUNCTION_WORDS } from "@/data/commonWords";
import { dueAnchor, markAnchorFired, ANCHOR_WINDOW_MS } from "@/services/reminderMoments";
import { applyLevelChoice } from "@/services/onboarding";
import { getPronunciationProgress, nextPronunciationLesson, recordPronunciationQuiz } from "@/services/pronunciation";
import { PRONUNCIATION_LESSONS } from "@/data/pronunciation";
import { parseMemoryAid } from "@/services/ai";
import { formatIntervalPreview } from "@/services/srs";
import { checkAndUnlockAchievements, getFirstTryTotal, recordFirstTryCorrect } from "@/services/achievements";
import { multipleChoiceDirection } from "@/services/smartReview";
import { makeWord, reviewSrs } from "./helpers";

describe("learner profile", () => {
  it("simple mode is on for beginners unless the learner chose otherwise", () => {
    expect(isBeginner()).toBe(true); // no level chosen
    expect(isSimpleMode()).toBe(true);
    setUserOverrideLevel("B2");
    expect(isSimpleMode()).toBe(false);
    setSimpleMode(true);
    expect(isSimpleMode()).toBe(true);
  });

  it("A0 (mất gốc) = A1 content with foundation mode: foundation grammar, recall after 7 days", () => {
    expect(applyLevelChoice("A0")).toBe("A1");
    expect(productionUnlockDays()).toBe(7);
    expect(includesFoundationGrammar()).toBe(true);
    applyLevelChoice("B1");
    expect(productionUnlockDays()).toBe(3);
    expect(includesFoundationGrammar()).toBe(false);
    setFoundationMode(true);
    expect(includesFoundationGrammar()).toBe(true);
  });
});

describe("reading for a beginner", () => {
  it("only function words count as known, so everyday words are offered to learn", () => {
    const text = "The build failed because the test needs a new file.";
    const normal = analyzeText(text, []).candidates.map((c) => c.base);
    const beginner = analyzeText(text, [], FUNCTION_WORDS).candidates.map((c) => c.base);
    expect(normal).not.toContain("because");
    expect(beginner).toEqual(expect.arrayContaining(["because", "build", "needs".replace(/s$/, ""), "new", "file"]));
    expect(beginner).not.toContain("the");
  });
});

describe("study-time anchors", () => {
  it("fires once a day within the window after the chosen time", () => {
    const at = (h: number, m: number) => new Date(2026, 9, 12, h, m);
    expect(dueAnchor(at(12, 0), ["after_lunch"])).toBeNull();
    expect(dueAnchor(at(13, 20), ["after_lunch"])).toBe("after_lunch");
    expect(dueAnchor(new Date(at(13, 15).getTime() + ANCHOR_WINDOW_MS + 60_000), ["after_lunch"])).toBeNull();
    markAnchorFired("after_lunch", at(13, 20));
    expect(dueAnchor(at(13, 40), ["after_lunch"])).toBeNull();
    expect(dueAnchor(at(17, 45), ["after_lunch", "end_of_day"])).toBe("end_of_day");
    expect(dueAnchor(new Date(2026, 9, 13, 13, 20), ["after_lunch"])).toBe("after_lunch"); // next day
  });
});

describe("pronunciation progress", () => {
  it("a lesson is done once its quiz reaches 80%, the best score is kept", () => {
    const [first, second] = [...PRONUNCIATION_LESSONS].sort((a, b) => a.order - b.order);
    expect(nextPronunciationLesson(PRONUNCIATION_LESSONS)?.id).toBe(first.id);
    expect(recordPronunciationQuiz(first.id, 3, 8)).toBe(false);
    expect(recordPronunciationQuiz(first.id, 7, 8)).toBe(true);
    recordPronunciationQuiz(first.id, 2, 8);
    expect(getPronunciationProgress()[first.id]).toMatchObject({ best: 7, total: 8, attempts: 3 });
    expect(nextPronunciationLesson(PRONUNCIATION_LESSONS)?.id).toBe(second.id);
  });
});

describe("AI memory aid", () => {
  it("keeps only examples that contain the word, and a real confusable", () => {
    const raw = JSON.stringify({
      examples: [
        { sentence_en: "We deployed the app on Friday.", sentence_vn: "Chúng tôi triển khai app vào thứ Sáu." },
        { sentence_en: "We shipped it yesterday.", sentence_vn: "Hôm qua chúng tôi đưa nó lên." },
      ],
      tip_vn: "Deploy = đưa code ra chạy thật.",
      confusable: { word: "employ", difference_vn: "employ là thuê người." },
    });
    const aid = parseMemoryAid(raw, "deploy");
    expect(aid.examples.map((e) => e.sentence_en)).toEqual(["We deployed the app on Friday."]);
    expect(aid.confusable?.word).toBe("employ");
    expect(parseMemoryAid(JSON.stringify({ examples: [], tip_vn: "x", confusable: { word: "deploy" } }), "deploy").confusable).toBeNull();
  });
});

describe("beginner-friendly display and rewards", () => {
  it("intervals in Vietnamese words (1m was read as one month)", () => {
    const now = new Date(2026, 9, 12, 9, 0);
    expect(formatIntervalPreview(new Date(now.getTime() + 10 * 60_000), now)).toBe("10 phút");
    expect(formatIntervalPreview(new Date(now.getTime() + 3 * 86_400_000), now)).toBe("3 ngày");
    expect(formatIntervalPreview(new Date(now.getTime() + 60 * 86_400_000), now)).toBe("2 tháng");
  });

  it("early badges: first session and 3-day streak; first-try answers add up", () => {
    const unlocked = checkAndUnlockAchievements({ sessionCompleted: true, currentStreak: 3 }).map((b) => b.id);
    expect(unlocked).toEqual(expect.arrayContaining(["first_session", "streak_3"]));
    expect(unlocked).not.toContain("night_owl");
    for (let i = 0; i < 3; i++) recordFirstTryCorrect();
    expect(getFirstTryTotal()).toBe(3);
  });

  it("multiple-choice direction is deterministic: young cards English -> Vietnamese", () => {
    const young = makeWord("cache", { srs: reviewSrs(1, 1) });
    expect(multipleChoiceDirection(young)).toBe("en_to_vn");
    const mature = (reps: number) => makeWord("cache", { srs: { ...reviewSrs(10, 1), reps } as never });
    expect([0, 1, 2, 3, 4, 5].map((r) => multipleChoiceDirection(mature(r)))).toEqual([
      "en_to_vn", "en_to_vn", "vn_to_en", "en_to_vn", "en_to_vn", "vn_to_en",
    ]);
  });
});
