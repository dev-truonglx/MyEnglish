import { wordFormsPattern } from "@/services/smartReview";

/**
 * Helper to highlight the target word (and its inflections: "deployed", "wrote") inside an example
 * sentence. Whole words only, so "use" is not highlighted inside "because".
 */
export function highlightWord(text: string, targetWord: string) {
  if (!text || !targetWord.trim()) return text;
  // One capturing group: split() returns [text, match, text, match, ...]
  const parts = text.split(new RegExp(`(${wordFormsPattern(targetWord)})`, "gi"));
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span
        key={i}
        className="bg-cyan-100 text-cyan-800 dark:bg-cyan-500/25 dark:text-cyan-200 font-bold px-1.5 py-0.5 rounded border border-cyan-300/80 dark:border-cyan-500/40"
      >
        {part}
      </span>
    ) : (
      part
    )
  );
}
