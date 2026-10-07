import { useState } from "react";
import { PenLine, Sparkles, CheckCircle2, AlertCircle, Lightbulb } from "lucide-react";
import { Rating } from "@/services/srs";
import type { WordDetail } from "@/types/database";
import { gradeSentenceWithAI, type SentenceGrade } from "@/services/ai";
import { ratingFromSentenceGrade, recordFreeWritingUse } from "@/services/smartReview";
import { getConciseMeaning } from "@/services/meaningText";
import { applyCorrections, saveMistakes } from "@/services/mistakes";

interface FreeWritingExerciseProps {
  word: WordDetail;
  level?: string;
  /** Rating is final (derived from the AI grade); attempts = 1 when the answer failed */
  onComplete: (isCorrect: boolean, attempts: number, rating: Rating) => void;
  onSpeak: (text: string) => void;
  /** AI unavailable: the session switches to a typed recall exercise instead */
  onFallback: () => void;
}

/**
 * Output practice for words known well: recall the English word from its meaning AND use it in a
 * sentence of your own. The AI checks meaning, grammar and collocation, and explains corrections.
 * Generating your own sentence is the strongest form of retrieval (generation effect).
 */
export default function FreeWritingExercise({ word, level, onComplete, onSpeak, onFallback }: FreeWritingExerciseProps) {
  const [sentence, setSentence] = useState("");
  const [grading, setGrading] = useState(false);
  const [grade, setGrade] = useState<SentenceGrade | null>(null);
  const [hintShown, setHintShown] = useState(false);
  const [rating, setRating] = useState<Rating | null>(null);
  const [savedMistakes, setSavedMistakes] = useState(0);

  const submit = async () => {
    if (grading || grade || sentence.trim().length < 3) return;
    setGrading(true);
    try {
      const g = await gradeSentenceWithAI(word.word, word.meaning_vn, sentence.trim(), level);
      recordFreeWritingUse();
      let r = ratingFromSentenceGrade(g);
      // The first letter was given: the word itself was not recalled unaided
      if (hintShown && r === Rating.Good) r = Rating.Hard;
      setGrade(g);
      setRating(r);
      onSpeak(word.word);
      // Each correction goes to the mistake notebook, to be fixed again later
      if (g.corrections.length > 0) {
        const corrected = applyCorrections(sentence.trim(), g.corrections);
        saveMistakes(
          g.corrections.map((c) => ({ wrong: c.wrong, right: c.right, whyVn: c.whyVn, sentence: corrected })),
          { source: "free_writing", wordId: word.id }
        )
          .then((res) => setSavedMistakes(res.added + res.repeated))
          .catch(() => {});
      }
    } catch (err) {
      console.warn("AI sentence grading failed, falling back:", err);
      onFallback();
    } finally {
      setGrading(false);
    }
  };

  const ok = rating !== null && rating >= Rating.Hard;

  return (
    <div className="w-full max-w-xl mx-auto space-y-4 animate-in fade-in duration-200">
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-3 shadow-sm">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200/50 dark:border-violet-800/40">
          <PenLine className="w-3 h-3" />
          <span>Tự viết câu (AI chấm)</span>
        </div>
        <p className="text-sm text-slate-700 dark:text-zinc-200">
          Viết <strong>một câu tiếng Anh</strong> dùng từ có nghĩa:
        </p>
        <p className="text-base font-semibold text-slate-900 dark:text-white">{getConciseMeaning(word.meaning_vn, word.word)}</p>
        {word.part_of_speech && <p className="text-[11px] text-slate-500 dark:text-zinc-400">({word.part_of_speech})</p>}
        {hintShown && (
          <p className="text-xs font-mono text-amber-700 dark:text-amber-300">
            Gợi ý: {word.word.charAt(0).toUpperCase()}
            {word.word.slice(1).replace(/[a-z]/gi, " _")}
          </p>
        )}
      </div>

      <textarea
        value={sentence}
        onChange={(e) => setSentence(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        disabled={grading || !!grade}
        maxLength={300}
        rows={3}
        autoFocus
        spellCheck={false}
        placeholder="Ví dụ: Our retry logic must be idempotent so that..."
        className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
      />

      {!grade ? (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setHintShown(true)}
            disabled={hintShown || grading}
            className="text-xs text-slate-400 hover:text-amber-600 inline-flex items-center gap-1 disabled:opacity-40"
          >
            <Lightbulb className="w-3.5 h-3.5" /> Gợi ý chữ cái đầu (tính là Khó)
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onComplete(false, 1, Rating.Again)}
              disabled={grading}
              className="px-3 py-2 rounded-xl text-xs text-slate-500 hover:text-rose-600"
            >
              Không nhớ ra từ
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={grading || sentence.trim().length < 3}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              {grading ? <Sparkles className="w-3.5 h-3.5 animate-spin" /> : null}
              {grading ? "AI đang chấm..." : "Chấm câu (Enter)"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className={`p-3 rounded-xl border text-xs space-y-2 ${
              ok
                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100"
                : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-100"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>
                Từ cần dùng: <strong>{word.word}</strong> · Điểm {grade.score}/100
                {!grade.usesTargetWord && " · Câu chưa dùng đúng từ này"}
              </span>
            </div>
            {grade.explanationVn && <p>{grade.explanationVn}</p>}
            {grade.corrections.length > 0 && (
              <ul className="space-y-1">
                {grade.corrections.map((c, i) => (
                  <li key={i}>
                    <span className="line-through opacity-70">{c.wrong}</span> → <strong>{c.right}</strong>
                    {c.whyVn ? ` — ${c.whyVn}` : ""}
                  </li>
                ))}
              </ul>
            )}
            {savedMistakes > 0 && <p className="opacity-80">Đã lưu {savedMistakes} lỗi vào Sổ lỗi (tab Viết) để ôn lại.</p>}
            {grade.betterVersion && (
              <p>
                Câu gợi ý: <em>{grade.betterVersion}</em>
              </p>
            )}
          </div>
          <button
            type="button"
            autoFocus
            onClick={() => onComplete(ok, ok ? 0 : 1, rating as Rating)}
            className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold"
          >
            Tiếp tục
          </button>
        </div>
      )}
    </div>
  );
}
