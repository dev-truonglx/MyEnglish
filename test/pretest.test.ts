import { describe, it, expect } from "vitest";
import { buildPretest, isPretestEnabled, setPretestEnabled, shouldPretest } from "@/services/pretest";
import { toCard } from "@/services/cards";
import { makeWord } from "./helpers";

const example = (sentence_en: string) => [{ id: "e1", word_id: "x", sentence_en, sentence_vn: "Câu dịch.", grammar_analysis: "" }];

const pool = [
  makeWord("latency", { meaning_vn: "Độ trễ", topic: "Docs", examples: example("Latency went down.") as never }),
  makeWord("payload", { meaning_vn: "Dữ liệu gửi kèm", topic: "Docs" }),
  makeWord("threshold", { meaning_vn: "Ngưỡng", topic: "Docs" }),
  makeWord("rollback", { meaning_vn: "Hoàn tác phiên bản", topic: "Docs" }),
];

describe("pretest", () => {
  it("asks the meaning from a sentence with the word, 3 options and one right answer", () => {
    const q = buildPretest(pool[0], pool, () => 0.5);
    expect(q).not.toBeNull();
    expect(q!.sentence).toBe("Latency went down.");
    expect(q!.options).toHaveLength(3);
    expect(q!.options.filter((o) => o.isCorrect)).toEqual([{ text: "Độ trễ", isCorrect: true }]);
    expect(new Set(q!.options.map((o) => o.text)).size).toBe(3);
  });

  it("is skipped when there is no sentence to guess from", () => {
    expect(buildPretest(pool[1], pool)).toBeNull();
  });

  it("only for brand-new words, and can be turned off", () => {
    const fresh = toCard(makeWord("idempotent"), "recognition");
    const relearn = toCard(makeWord("cache", { srs: { state: 3, reps: 6, lapses: 5 } }), "recognition");
    expect(shouldPretest(fresh)).toBe(true);
    expect(shouldPretest(relearn)).toBe(false);
    setPretestEnabled(false);
    expect(isPretestEnabled()).toBe(false);
    expect(shouldPretest(fresh)).toBe(false);
  });
});
