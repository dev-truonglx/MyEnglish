import { useEffect, useState } from "react";
import { Snail, Volume2, X } from "lucide-react";
import {
  BLOCK_PASS,
  buildPlacementBlock,
  placementStep,
  START_LEVEL,
  type AdaptiveQuestion,
  type PlacementBlockLevel,
} from "@/services/placement";
import { PLACEMENT_A0_VOCAB, PLACEMENT_GRAMMAR, PLACEMENT_LISTENING } from "@/data/placementBank";
import type { LevelChoice } from "@/services/onboarding";
import { handleSpeak, SLOW_RATE } from "./review/speech";

const DONT_KNOW = "Tôi không biết";
const BANK = { grammar: PLACEMENT_GRAMMAR, listening: PLACEMENT_LISTENING, a0: PLACEMENT_A0_VOCAB };
const KIND_LABEL: Record<AdaptiveQuestion["kind"], string> = { vocab: "Từ vựng", grammar: "Ngữ pháp", listening: "Nghe" };

const RESULT_TEXT: Record<PlacementBlockLevel, string> = {
  A0: "Mất gốc (A0): bắt đầu từ các từ A1 của bộ Oxford (từ IT trước), phát âm và ngữ pháp cơ bản. Đi chậm mà chắc.",
  A1: "A1: bạn biết những từ cơ bản nhất. Học tiếp các từ A1 và ngữ pháp nền để đọc được câu ngắn.",
  A2: "A2: bạn hiểu câu ngắn, quen thuộc. Học trộn từ A1 và A2; từ nào đã biết thì bấm “Đã biết” để bỏ qua.",
  B1: "B1: bạn đọc được tài liệu đơn giản. Học từ chuyên ngành và ngữ pháp trung cấp.",
  B2: "B2: bạn đọc tài liệu khá tốt. Tập trung từ chuyên sâu, viết và diễn đạt tự nhiên.",
  C1: "C1: trình độ cao. Tập trung sắc thái, văn phong và từ hiếm.",
};

/**
 * Adaptive placement: blocks of 3 questions (a word, a grammar gap, a listening item) starting at A2,
 * one level up after a passed block, one down after a failed one; below A1 a block of very easy words
 * tells an absolute beginner (A0) apart. Usually 6–12 questions. "Tôi không biết" discourages guessing.
 */
export default function PlacementTest({ onDone, onClose }: { onDone: (level: LevelChoice) => void; onClose: () => void }) {
  const [block, setBlock] = useState<AdaptiveQuestion[]>(() => buildPlacementBlock(START_LEVEL, BANK));
  const [index, setIndex] = useState(0);
  const [correctInBlock, setCorrectInBlock] = useState(0);
  const [asked, setAsked] = useState(0);
  const [result, setResult] = useState<PlacementBlockLevel | null>(null);
  const q = block[index];

  useEffect(() => {
    if (q?.kind === "listening" && q.say) {
      const t = setTimeout(() => handleSpeak(q.say!), 300);
      return () => clearTimeout(t);
    }
  }, [q]);

  const answer = (choice: string) => {
    if (!q || result) return;
    const correct = correctInBlock + (choice === q.answer ? 1 : 0);
    setAsked((n) => n + 1);
    if (index + 1 < block.length) {
      setCorrectInBlock(correct);
      setIndex(index + 1);
      return;
    }
    const step = placementStep(q.level, correct >= Math.min(BLOCK_PASS, block.length));
    if ("result" in step) {
      setResult(step.result);
    } else {
      setBlock(buildPlacementBlock(step.next, BANK));
      setIndex(0);
      setCorrectInBlock(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Kiểm tra trình độ</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        {!result && q ? (
          <>
            <div className="text-[11px] text-slate-500 dark:text-zinc-400">
              Câu {asked + 1} · {KIND_LABEL[q.kind]} · Không chắc thì chọn "Tôi không biết", đừng đoán.
            </div>
            {q.kind === "listening" ? (
              <div className="flex items-center justify-center gap-2 py-2">
                <button onClick={() => handleSpeak(q.say!)} className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm font-semibold inline-flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4" /> Nghe lại
                </button>
                <button onClick={() => handleSpeak(q.say!, SLOW_RATE)} className="px-3 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 text-sm inline-flex items-center gap-1.5">
                  <Snail className="w-4 h-4" /> Chậm
                </button>
              </div>
            ) : (
              <div className={`text-center text-slate-900 dark:text-white py-2 ${q.kind === "vocab" ? "text-2xl font-bold font-mono" : "text-base font-semibold"}`}>
                {q.prompt}
              </div>
            )}
            <p className="text-xs text-slate-600 dark:text-zinc-400 text-center">{q.question}</p>
            <div className="grid gap-2">
              {[...q.options, DONT_KNOW].map((opt) => (
                <button
                  key={opt}
                  onClick={() => answer(opt)}
                  className={`w-full p-3 rounded-xl border text-left text-sm transition-colors ${opt === DONT_KNOW
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
            <p>{RESULT_TEXT[result]}</p>
            <p className="text-xs text-slate-500 dark:text-zinc-400">Có thể đổi trình độ bất cứ lúc nào trong phần Cài đặt.</p>
            <button onClick={() => onDone(result)} className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold">
              Học theo trình độ này
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
