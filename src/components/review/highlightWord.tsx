/**
 * Helper to highlight the target word inside an example sentence
 */
export function highlightWord(text: string, targetWord: string) {
  if (!text || !targetWord) return text;
  const escaped = targetWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    part.toLowerCase() === targetWord.toLowerCase() ? (
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
