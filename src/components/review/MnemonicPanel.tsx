import { useState, useEffect } from "react";
import { Lightbulb, Loader2, Sparkles } from "lucide-react";
import type { WordDetail } from "@/types/database";
import { generateSmartMnemonic, getStoredMnemonic, saveMnemonic } from "@/services/aiMnemonic";
import { generateMemoryAidWithAI, type MemoryAid } from "@/services/ai";
import { addUserContextExample } from "@/services/db";
import { getActiveCefrLevel } from "@/services/pipeline";

/** AI Mnemonic Memory Hook for Leech / Challenging Words (generated on demand for leeches / 2+ lapses) */
export default function MnemonicPanel({
  currentWord,
  wordIsLeech,
}: {
  currentWord: WordDetail;
  wordIsLeech: boolean;
}) {
  const [mnemonic, setMnemonic] = useState<string | null>(() => getStoredMnemonic(currentWord.id, currentWord.meaning_vn));
  const [loadingMnemonic, setLoadingMnemonic] = useState(false);
  const [aid, setAid] = useState<MemoryAid | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "error">("idle");

  // A word forgotten again and again needs new hooks (new situations, a tip, the word it is confused
  // with), not a harder exercise. The new sentences become examples for the next reviews.
  const makeMemoryAid = async () => {
    setAiState("loading");
    try {
      const result = await generateMemoryAidWithAI(currentWord.word, currentWord.meaning_vn, await getActiveCefrLevel());
      for (const ex of result.examples) {
        await addUserContextExample(currentWord.id, ex.sentence_en, ex.sentence_vn, "ai_memory_aid").catch(() => false);
      }
      if (result.tipVn) {
        saveMnemonic(currentWord.id, `💡 ${result.tipVn}`, currentWord.meaning_vn);
        setMnemonic(`💡 ${result.tipVn}`);
      }
      setAid(result);
      setAiState("idle");
    } catch {
      setAiState("error");
    }
  };

  useEffect(() => {
    let mounted = true;
    const existing = getStoredMnemonic(currentWord.id, currentWord.meaning_vn);
    if (existing) {
      setMnemonic(existing);
    } else if (wordIsLeech || (currentWord.srs?.lapses ?? 0) >= 2) {
      setLoadingMnemonic(true);
      generateSmartMnemonic(currentWord)
        .then((m) => {
          if (mounted) setMnemonic(m);
        })
        .finally(() => {
          if (mounted) setLoadingMnemonic(false);
        });
    } else {
      setMnemonic(null);
    }
    return () => {
      mounted = false;
    };
  }, [currentWord.id, wordIsLeech]);

  if (!(wordIsLeech || mnemonic || (currentWord.srs?.lapses ?? 0) >= 2)) return null;

  return (
    <div className="p-3 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300/80 dark:border-amber-700/60 text-xs text-amber-900 dark:text-amber-200 space-y-1 animate-in fade-in">
      <div className="flex items-center justify-between font-mono">
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          {wordIsLeech ? "Mẹo ghi nhớ · từ hay quên" : "Mẹo ghi nhớ"}
        </span>
        {wordIsLeech && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 font-bold border border-rose-200 dark:border-rose-800">
            {currentWord.srs.lapses} lần quên
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed font-sans font-medium text-amber-950 dark:text-amber-100">
        {loadingMnemonic ? "Đang tạo liên tưởng ghi nhớ..." : (mnemonic || "💡 Nhấn để tạo mẹo ghi nhớ cho từ này.")}
      </p>
      {aid && (
        <div className="space-y-1 pt-1 font-sans">
          {aid.examples.map((ex) => (
            <p key={ex.sentence_en} className="text-xs">
              • <span className="font-medium">{ex.sentence_en}</span>{" "}
              <span className="text-amber-700/80 dark:text-amber-300/70">({ex.sentence_vn})</span>
            </p>
          ))}
          {aid.confusable && (
            <p className="text-xs">
              ⚠️ Hay nhầm với <b>{aid.confusable.word}</b>: {aid.confusable.differenceVn}
            </p>
          )}
          <p className="text-[11px] text-amber-700/80 dark:text-amber-300/70">Các câu mới đã được thêm làm ví dụ cho những lần ôn sau.</p>
        </div>
      )}
      {!aid && (wordIsLeech || (currentWord.srs?.lapses ?? 0) >= 2) && (
        <button
          onClick={makeMemoryAid}
          disabled={aiState === "loading"}
          className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-lg bg-white/80 dark:bg-zinc-900/60 border border-amber-300 dark:border-amber-700 text-[11px] font-semibold font-sans disabled:opacity-60"
        >
          {aiState === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {aiState === "loading" ? "Đang tạo…" : aiState === "error" ? "AI chưa trả lời được, thử lại" : "Tạo câu ví dụ & mẹo nhớ mới bằng AI"}
        </button>
      )}
    </div>
  );
}
