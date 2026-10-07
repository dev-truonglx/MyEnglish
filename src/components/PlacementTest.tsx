import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { GrammarLevel } from "@/types/grammar";
import { buildPlacementQuestions, placementLevel, PLACEMENT_PASS } from "@/services/placement";

const DONT_KNOW = "Tôi không biết";

/**
 * 25-question vocabulary placement (5 per level, easiest first). Stops early once a level is clearly
 * failed, so a beginner answers only a few questions. "I don't know" is offered to discourage guessing.
 */
export default function PlacementTest({ onDone, onClose }: { onDone: (level: GrammarLevel) => void; onClose: () => void }) {
  const questions = useMemo(() => buildPlacementQuestions(), []);
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState<Partial<Record<GrammarLevel, number>>>({});
  const [wrong, setWrong] = useState<Partial<Record<GrammarLevel, number>>>({});
  const [result, setResult] = useState<GrammarLevel | null>(null);

  const q = questions[index];

  const answer = (choice: string) => {
    if (!q || result) return;
    const ok = choice === q.answer;
    const nextCorrect = { ...correct, [q.level]: (correct[q.level] ?? 0) + (ok ? 1 : 0) };
    const nextWrong = { ...wrong, [q.level]: (wrong[q.level] ?? 0) + (ok ? 0 : 1) };
    setCorrect(nextCorrect);
    setWrong(nextWrong);
    // A level is failed as soon as more than (5 - PASS) answers are wrong: no need to go further
    const failed = (nextWrong[q.level] ?? 0) > 5 - PLACEMENT_PASS;
    if (failed || index + 1 >= questions.length) {
      setResult(placementLevel(nextCorrect));
    } else {
      setIndex(index + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Kiểm tra trình độ từ vựng</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        {!result && q ? (
          <>
            <div className="text-[11px] text-slate-500 dark:text-zinc-400">
              Câu {index + 1} · mức {q.level} · chọn nghĩa đúng, hoặc "Tôi không biết" nếu không chắc
            </div>
            <div className="text-2xl font-bold font-mono text-center text-slate-900 dark:text-white py-2">{q.word}</div>
            <div className="grid gap-2">
              {[...q.options, DONT_KNOW].map((opt) => (
                <button
                  key={opt}
                  onClick={() => answer(opt)}
                  className={`w-full p-3 rounded-xl border text-left text-sm transition-colors ${
                    opt === DONT_KNOW
                      ? "border-dashed border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400"
                      : "border-slate-200 dark:border-zinc-800 hover:border-cyan-400 text-slate-800 dark:text-zinc-200"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </>
        ) : result ? (
          <div className="space-y-3 text-sm text-slate-700 dark:text-zinc-300">
            <p>
              Trình độ phù hợp để học: <strong className="text-cyan-600 dark:text-cyan-400">{result}</strong>. Từ gợi ý, câu ví dụ và bài ngữ pháp
              sẽ theo mức này (kèm một ít từ khó hơn một bậc).
            </p>
            <button
              onClick={() => onDone(result)}
              className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
            >
              Dùng trình độ {result}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
