import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LetterTilesExercise from "@/components/exercises/LetterTilesExercise";
import SentenceBuilderExercise from "@/components/exercises/SentenceBuilderExercise";
import ContextMatchExercise from "@/components/exercises/ContextMatchExercise";
import MeaningMatchExercise from "@/components/exercises/MeaningMatchExercise";
import type { WordDetail } from "@/types/database";

const dummyWord: WordDetail = {
  id: 1,
  word: "develop",
  meaning_vn: "phát triển",
  phonetic: "/dɪˈveləp/",
  part_of_speech: "verb",
  examples: [
    {
      id: "ex-1",
      sentence_en: "They develop new software applications.",
      sentence_vn: "Họ phát triển các ứng dụng phần mềm mới.",
    },
  ],
  srs: { reps: 1, state: 1, stability: 2, difficulty: 5, due: new Date().toISOString() },
} as any;

const dummyWords: WordDetail[] = [
  dummyWord,
  {
    id: 2,
    word: "create",
    meaning_vn: "tạo ra",
    examples: [
      {
        id: "ex-2",
        sentence_en: "Scientists create innovative solutions.",
        sentence_vn: "Các nhà khoa học tạo ra các giải pháp đột phá.",
      },
    ],
    srs: { reps: 1, state: 1, stability: 2, difficulty: 5, due: new Date().toISOString() },
  } as any,
  {
    id: 3,
    word: "design",
    meaning_vn: "thiết kế",
    examples: [
      {
        id: "ex-3",
        sentence_en: "Engineers design modern systems.",
        sentence_vn: "Các kỹ sư thiết kế những hệ thống hiện đại.",
      },
    ],
    srs: { reps: 1, state: 1, stability: 2, difficulty: 5, due: new Date().toISOString() },
  } as any,
];

describe("Exercise Skip / Không nhớ support", () => {
  it("LetterTilesExercise provides 'Không nhớ' button", () => {
    const html = renderToStaticMarkup(
      createElement(LetterTilesExercise, {
        word: dummyWord,
        onComplete: () => {},
        onSpeak: () => {},
      })
    );
    expect(html).toContain("Không nhớ");
  });

  it("SentenceBuilderExercise provides 'Không nhớ' button", () => {
    const html = renderToStaticMarkup(
      createElement(SentenceBuilderExercise, {
        word: dummyWord,
        onComplete: () => {},
        onSpeak: () => {},
        onFallback: () => {},
      })
    );
    expect(html).toContain("Không nhớ");
  });

  it("ContextMatchExercise provides 'Không nhớ' button", () => {
    const html = renderToStaticMarkup(
      createElement(ContextMatchExercise, {
        word: dummyWord,
        allWords: dummyWords,
        onComplete: () => {},
        onSpeak: () => {},
        onFallback: () => {},
      })
    );
    expect(html).toContain("Không nhớ");
  });

  it("MeaningMatchExercise provides 'Không nhớ' button", () => {
    const html = renderToStaticMarkup(
      createElement(MeaningMatchExercise, {
        word: dummyWord,
        allWords: dummyWords,
        onComplete: () => {},
        onSpeak: () => {},
        onFallback: () => {},
      })
    );
    expect(html).toContain("Không nhớ");
  });
});
