import { describe, it, expect } from "vitest";
import { analyzeText, baseCandidates, suggestedBase } from "@/services/reading";
import { makeWord } from "./helpers";

const words = [
  makeWord("deploy", { srs: { state: 2, stability: 40, reps: 6 } }), // mastered
  makeWord("dependency", { srs: { state: 2, stability: 5, reps: 3 } }), // learning
  makeWord("follow up", { srs: { state: 1, stability: 1, reps: 1 } }), // learning phrase
  makeWord("idempotent"), // added, never studied
];

const TEXT =
  "We deployed the new build yesterday. Two dependencies were outdated, so I'll follow up with the infra team.\n" +
  "The PUT endpoint must be idempotent. Check the JSON payload and the useState hook before retrying.";

describe("reading analysis", () => {
  const a = analyzeText(TEXT, words);
  const tokenOf = (text: string) => a.segments.find((s) => s.text === text)?.token;

  it("finds bank words in any inflected form, and phrases as one unit", () => {
    expect(tokenOf("deployed")).toMatchObject({ kind: "bank", status: "mastered" });
    expect(tokenOf("dependencies")).toMatchObject({ kind: "bank", status: "learning" });
    expect(tokenOf("follow up")).toMatchObject({ kind: "bank", status: "learning" });
    expect(tokenOf("idempotent")).toMatchObject({ kind: "bank", status: "new" });
    expect(a.bankHits.map((h) => h.word.word)).toEqual(["dependency", "follow up", "idempotent", "deploy"]);
  });

  it("keeps the sentence each word appears in", () => {
    expect(a.bankHits.find((h) => h.word.word === "dependency")!.sentence).toBe(
      "Two dependencies were outdated, so I'll follow up with the infra team."
    );
  });

  it("suggests uncommon words, not common words, acronyms or code identifiers", () => {
    const bases = a.candidates.map((c) => c.base);
    expect(bases).toContain("outdated");
    expect(bases).toContain("endpoint");
    expect(bases).toContain("payload");
    expect(bases).toContain("retrying");
    for (const notVocab of ["the", "new", "build", "yesterday", "json", "put", "usestate", "check", "team", "i'll"]) {
      expect(bases).not.toContain(notVocab);
    }
    expect(tokenOf("JSON")).toMatchObject({ kind: "common" });
    expect(tokenOf("useState")).toMatchObject({ kind: "common" });
  });

  it("rebuilds the original text exactly", () => {
    expect(a.segments.map((s) => s.text).join("")).toBe(TEXT);
  });

  it("base forms", () => {
    expect(baseCandidates("queries")).toContain("query");
    expect(baseCandidates("stopped")).toContain("stop");
    expect(baseCandidates("configured")).toContain("configure");
    expect(baseCandidates("longer")).toContain("long");
    expect(baseCandidates("easier")).toContain("easy");
    expect(baseCandidates("bigger")).toContain("big");
    expect(baseCandidates("quickly")).toContain("quick");
    expect(suggestedBase("dependencies")).toBe("dependency");
    expect(suggestedBase("endpoints")).toBe("endpoint");
    expect(suggestedBase("status")).toBe("status");
    expect(suggestedBase("retrying")).toBe("retrying");
  });
});
