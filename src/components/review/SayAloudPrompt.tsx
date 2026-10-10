import { useState } from "react";
import { Mic, Snail, Volume2 } from "lucide-react";
import { logLearningEvent } from "@/services/learningEvents";
import { handleSpeak, SLOW_RATE } from "./speech";

/**
 * On a new word's introduction: listen, then say the word aloud and rate yourself. Saying a word links its
 * sound to its spelling and meaning (production effect); never graded, logged as a "say_aloud" event.
 */
export default function SayAloudPrompt({ word, wordId }: { word: string; wordId: string }) {
  const [rated, setRated] = useState<boolean | null>(null);
  const rate = (ok: boolean) => {
    setRated(ok);
    logLearningEvent("say_aloud", { wordId, meta: { ok, surface: "intro" } });
  };
  if (rated !== null) {
    return (
      <div className="text-center text-[11px] text-emerald-700 dark:text-emerald-400">
        {rated ? "Tốt lắm! Đọc to giúp nhớ từ lâu hơn." : "Không sao, nghe chậm thêm vài lần là quen."}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-600 dark:text-zinc-400">
      <Mic className="w-3.5 h-3.5 text-emerald-600" />
      <span>Nghe rồi đọc to theo 2 lần:</span>
      <button onClick={() => handleSpeak(word)} className="p-1 rounded-md border border-slate-200 dark:border-zinc-700" title="Nghe">
        <Volume2 className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => handleSpeak(word, SLOW_RATE)} className="p-1 rounded-md border border-slate-200 dark:border-zinc-700" title="Nghe chậm">
        <Snail className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => rate(true)} className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-semibold">
        Đọc được
      </button>
      <button onClick={() => rate(false)} className="px-2 py-0.5 rounded-md border border-slate-300 dark:border-zinc-700">
        Chưa chắc
      </button>
    </div>
  );
}
