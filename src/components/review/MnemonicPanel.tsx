import { useState, useEffect } from "react";
import { Lightbulb } from "lucide-react";
import type { WordDetail } from "@/types/database";
import { generateSmartMnemonic, getStoredMnemonic } from "@/services/aiMnemonic";

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
          {wordIsLeech ? "Mẹo ghi nhớ AI (Đặc trị Leech)" : "Mẹo ghi nhớ AI"}
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
    </div>
  );
}
