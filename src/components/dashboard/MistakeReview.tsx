import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Lightbulb, XCircle } from "lucide-react";
import { Rating, type Grade } from "ts-fsrs";
import {
  gradeMistakeAnswer,
  mistakePrompt,
  recordMistakeReview,
  MISTAKE_CATEGORY_LABEL,
  type Mistake,
} from "@/services/mistakes";
import { recordDailyActivity } from "@/services/streak";

interface MistakeReviewProps {
  mistakes: Mistake[];
  onDone: (stats: { reviewed: number; correct: number }) => void;
}

/** "Fix what you once wrote": the learner's sentence with the mistake put back, retype the right part */
export default function MistakeReview({ mistakes, onDone }: MistakeReviewProps) {
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<Grade | null>(null);
  const [hint, setHint] = useState(false);
  const [stats, setStats] = useState({ reviewed: 0, correct: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const m = mistakes[index];

  useEffect(() => {
    setInput("");
    setResult(null);
    setHint(false);
    inputRef.current?.focus();
  }, [index]);

  if (!m) return null;
  const prompt = mistakePrompt(m);

  const check = () => {
    if (result !== null) return;
    setResult(gradeMistakeAnswer(input, m.right_text));
  };

  const next = async (grade: Grade) => {
    await recordMistakeReview(m, grade).catch((err) => console.warn("Mistake review not saved:", err));
    recordDailyActivity(1);
    const s = { reviewed: stats.reviewed + 1, correct: stats.correct + (grade === Rating.Again ? 0 : 1) };
    setStats(s);
    if (index + 1 >= mistakes.length) onDone(s);
    else setIndex(index + 1);
  };

  const ok = result !== null && result !== Rating.Again;

  return (
    <div className="p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-4">
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
        <span className="font-semibold uppercase tracking-wider">Sửa lỗi bạn từng viết</span>
        <span className="font-mono">
          {index + 1} / {mistakes.length}
        </span>
      </div>

      <div className="text-base leading-relaxed text-slate-800 dark:text-zinc-200">
        {prompt ? (
          <>
            {prompt.before}
            <span className="px-1 rounded bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-semibold underline decoration-wavy decoration-rose-400">
              {prompt.wrong}
            </span>
            {prompt.after}
          </>
        ) : (
          <>
            Bạn từng viết:{" "}
            <span className="px-1 rounded bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-semibold">{m.wrong_text}</span>
          </>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (result === null) check();
          else if (ok) next(Rating.Good);
          else next(Rating.Again);
        }}
        className="space-y-2"
      >
        <label className="block text-xs text-slate-600 dark:text-zinc-400">Gõ lại phần tô đỏ cho đúng:</label>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={result !== null}
          autoFocus
          className="w-full p-3 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
          placeholder="Cách viết đúng…"
        />
        {result === null && (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setHint(true)}
              disabled={hint}
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-amber-600 disabled:text-amber-600"
            >
              <Lightbulb className="w-3.5 h-3.5" />
              {hint ? `Loại lỗi: ${MISTAKE_CATEGORY_LABEL[m.category ?? "other"]}` : "Gợi ý loại lỗi"}
            </button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setResult(Rating.Again)} className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200">
                Không nhớ
              </button>
              <button type="submit" disabled={!input.trim()} className="py-2 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 !text-white text-xs font-semibold disabled:opacity-40">
                Kiểm tra
              </button>
            </div>
          </div>
        )}
      </form>

      {result !== null && (
        <div className="space-y-3">
          <div
            className={`p-3 rounded-xl text-xs space-y-1 ${ok ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-200"}`}
          >
            <div className="flex items-center gap-1.5 font-semibold">
              {ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {ok ? "Đúng rồi!" : "Chưa đúng."} Cách viết đúng: <span className="font-mono">{m.right_text}</span>
            </div>
            {m.why_vn && <p>{m.why_vn}</p>}
            {m.sentence && <p className="italic opacity-80">{m.sentence}</p>}
          </div>
          <div className="flex items-center justify-end gap-2">
            {!ok && input.trim() && (
              <button
                onClick={() => next(Rating.Hard)}
                className="py-2 px-3 rounded-xl border border-slate-300 dark:border-zinc-700 text-xs text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                Tôi chỉ gõ nhầm
              </button>
            )}
            <button
              onClick={() => next(ok ? Rating.Good : Rating.Again)}
              autoFocus
              className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold"
            >
              Tiếp
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
