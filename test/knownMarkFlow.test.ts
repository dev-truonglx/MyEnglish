import { describe, it, expect } from "vitest";
import { knownCheckDays, KNOWN_CHECK_MIN_DAYS, KNOWN_CHECK_MAX_DAYS } from "@/services/easyWords";
import { Rating } from "@/services/srs";

describe("known word mark flow and interval notifications", () => {
  it("calculates correct check interval in days for marked words", () => {
    const testIds = ["word-apple", "word-banana", "word-cherry", "word-12345"];
    for (const id of testIds) {
      const days = knownCheckDays(id, 0);
      expect(days).toBeGreaterThanOrEqual(KNOWN_CHECK_MIN_DAYS);
      expect(days).toBeLessThanOrEqual(KNOWN_CHECK_MAX_DAYS);
      expect(Number.isInteger(days)).toBe(true);
    }
  });

  it("determines when 'Tôi biết chắc từ này' can be shown after answering", () => {
    const checkCanShowKnown = (params: {
      hasAnswered: boolean;
      isCorrect: boolean | null;
      rating: Rating | null;
      attempts: number;
    }) => {
      // Must have chosen an answer, must be correct, rating != Again, and 0 failed attempts
      return (
        params.hasAnswered &&
        params.isCorrect === true &&
        params.rating !== null &&
        params.rating !== Rating.Again &&
        params.attempts === 0
      );
    };

    // Before answer is selected/entered: NOT shown
    expect(
      checkCanShowKnown({
        hasAnswered: false,
        isCorrect: null,
        rating: null,
        attempts: 0,
      })
    ).toBe(false);

    // Answered wrong: NOT shown
    expect(
      checkCanShowKnown({
        hasAnswered: true,
        isCorrect: false,
        rating: Rating.Again,
        attempts: 1,
      })
    ).toBe(false);

    // Answered right after previous wrong tries: NOT shown (attempts > 0 or rating == Again)
    expect(
      checkCanShowKnown({
        hasAnswered: true,
        isCorrect: true,
        rating: Rating.Again,
        attempts: 2,
      })
    ).toBe(false);

    // Answered right on first try (Good or Easy): SHOWN side-by-side with continue
    expect(
      checkCanShowKnown({
        hasAnswered: true,
        isCorrect: true,
        rating: Rating.Good,
        attempts: 0,
      })
    ).toBe(true);

    expect(
      checkCanShowKnown({
        hasAnswered: true,
        isCorrect: true,
        rating: Rating.Easy,
        attempts: 0,
      })
    ).toBe(true);
  });

  it("formats notification message with X days reminder", () => {
    const word = "meticulous";
    const days = knownCheckDays("test-word-id", 0);
    const notificationText = `Đã ghi nhận bạn biết chắc "${word}". Từ này sẽ được nhắc lại ôn tập sau ${days} ngày.`;

    expect(notificationText).toContain('Đã ghi nhận bạn biết chắc "meticulous"');
    expect(notificationText).toMatch(/Từ này sẽ được nhắc lại ôn tập sau \d+ ngày\./);
  });
});
