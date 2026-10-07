import { describe, it, expect } from "vitest";
import { Rating } from "ts-fsrs";
import { parseWritingFeedback } from "@/services/ai";
import { applyCorrections, gradeMistakeAnswer, mistakePrompt } from "@/services/mistakes";
import { freshServices, DAY_MS } from "./helpers";

describe("writing feedback parsing", () => {
  it("keeps real corrections, maps unknown categories to other", () => {
    const fb = parseWritingFeedback(
      JSON.stringify({
        score: "72.4",
        corrections: [
          { wrong: "I fix", right: "I fixed", sentence: "Yesterday I fixed the bug.", category: "tense", why_vn: "Hôm qua → quá khứ" },
          { wrong: "a API", right: "an API", category: "Articles??", why_vn: "" },
          { wrong: "same", right: "Same" }, // no-op
          { wrong: "", right: "x" },
        ],
        better_version: "Yesterday I fixed the login bug.",
      })
    );
    expect(fb.score).toBe(72);
    expect(fb.corrections).toHaveLength(2);
    expect(fb.corrections[0]).toMatchObject({ category: "tense", sentence: "Yesterday I fixed the bug." });
    expect(fb.corrections[1].category).toBe("other");
  });
});

describe("mistake cards", () => {
  it("puts the mistake back into the corrected sentence", () => {
    expect(mistakePrompt({ sentence: "Yesterday I fixed the login bug.", right_text: "I fixed", wrong_text: "I fix" })).toEqual({
      before: "Yesterday ",
      wrong: "I fix",
      after: " the login bug.",
    });
    expect(mistakePrompt({ sentence: null, right_text: "x", wrong_text: "y" })).toBeNull();
  });

  it("applies corrections to the learner's text", () => {
    expect(applyCorrections("Yesterday I fix a API bug", [{ wrong: "I fix", right: "I fixed" }, { wrong: "a API", right: "an API" }])).toBe(
      "Yesterday I fixed an API bug"
    );
  });

  it("only the exact fix is right: a different ending is the mistake itself", () => {
    expect(gradeMistakeAnswer("I fixed", "I fixed")).toBe(Rating.Good);
    expect(gradeMistakeAnswer("i fixed.", "I fixed")).toBe(Rating.Good);
    expect(gradeMistakeAnswer("I fix", "I fixed")).toBe(Rating.Again);
    expect(gradeMistakeAnswer("", "I fixed")).toBe(Rating.Again);
  });

  it("saves, dedupes a repeated mistake (due again now), schedules reviews in days", async () => {
    await freshServices();
    const mistakes = await import("@/services/mistakes");
    const now = new Date();
    const first = await mistakes.saveMistakes(
      [
        { wrong: "I fix", right: "I fixed", category: "tense", sentence: "Yesterday I fixed the bug." },
        { wrong: "a API", right: "an API", category: "article" },
      ],
      { source: "standup" },
      now
    );
    expect(first).toEqual({ added: 2, repeated: 0 });
    // Not due right after being corrected: first review the next day
    expect(await mistakes.getDueMistakes(now)).toHaveLength(0);
    expect(await mistakes.getDueMistakes(new Date(now.getTime() + DAY_MS))).toHaveLength(2);

    const again = await mistakes.saveMistakes([{ wrong: "I Fix", right: "I fixed" }], { source: "free_writing" }, now);
    expect(again).toEqual({ added: 0, repeated: 1 });
    const due = await mistakes.getDueMistakes(new Date(now.getTime() + 1000));
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ wrong_text: "I fix", occurrences: 2 });

    const summary = await mistakes.getMistakeSummary(new Date(now.getTime() + 1000));
    expect(summary).toMatchObject({ total: 2, due: 1 });
    expect(summary.byCategory[0]).toEqual({ category: "tense", count: 2 });

    const reviewed = await mistakes.recordMistakeReview(due[0], Rating.Good, now);
    expect(new Date(reviewed.next_review_date).getTime() - now.getTime()).toBeGreaterThan(DAY_MS / 2);
    expect(await mistakes.getDueMistakes(new Date(now.getTime() + 1000))).toHaveLength(0);
  });
});
