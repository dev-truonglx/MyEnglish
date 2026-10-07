import { useEffect, useState } from "react";
import { Check, Layers, Loader2, Plus } from "lucide-react";
import type { StarterDeck } from "@/data/starterDecks";
import { getImportedDeckIds, importStarterDecks, loadStarterDecks } from "@/services/starterDecks";
import { getUserOverrideLevel } from "@/services/userProficiency";
import { useWordsStore } from "@/stores/wordsStore";

/** Capture tab: the ready-made decks (no AI needed), added in one click */
export default function StarterDecksPanel() {
  const refreshWords = useWordsStore((s) => s.refreshWords);
  const [decks, setDecks] = useState<StarterDeck[]>([]);
  const [imported, setImported] = useState<string[]>(getImportedDeckIds);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadStarterDecks().then(setDecks).catch(() => {});
  }, []);

  const add = async (deck: StarterDeck) => {
    setBusyId(deck.id);
    try {
      const { inserted, skipped } = await importStarterDecks([deck], getUserOverrideLevel());
      setImported(getImportedDeckIds());
      await refreshWords();
      setMessage(
        `Đã thêm ${inserted} từ của bộ "${deck.goal}"${skipped > 0 ? ` (${skipped} từ đã có trong sổ)` : ""}. Từ mới sẽ được giới thiệu dần theo hạn mức mỗi ngày.`
      );
    } catch (err) {
      setMessage(`Không thêm được bộ từ: ${err}`);
    } finally {
      setBusyId(null);
    }
  };

  if (decks.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
        <Layers className="w-3.5 h-3.5" />
        Bộ từ có sẵn (không cần AI)
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {decks.map((d) => {
          const done = imported.includes(d.id);
          return (
            <div
              key={d.id}
              className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 flex items-center justify-between gap-3 shadow-sm"
            >
              <div className="min-w-0">
                <span className="block text-xs font-semibold text-slate-900 dark:text-white">{d.title}</span>
                <span className="block text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                  {d.words.length} từ · {d.description}
                </span>
              </div>
              <button
                onClick={() => add(d)}
                disabled={done || busyId !== null}
                className="shrink-0 inline-flex items-center gap-1 py-1.5 px-2.5 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-zinc-700 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 disabled:opacity-50"
              >
                {busyId === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : done ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                {done ? "Đã thêm" : "Thêm"}
              </button>
            </div>
          );
        })}
      </div>
      {message && <p className="text-[11px] text-cyan-700 dark:text-cyan-300">{message}</p>}
    </div>
  );
}
