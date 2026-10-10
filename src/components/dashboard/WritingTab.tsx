import { useEffect, useMemo, useState } from "react";
import { BookMarked, Loader2, NotebookPen, Play, Sparkles, Trash2 } from "lucide-react";
import { useWordsStore } from "@/stores/wordsStore";
import { correctWritingWithAI, type WritingFeedback } from "@/services/ai";
import {
  CATEGORY_LESSON,
  deleteMistake,
  getDueMistakes,
  getMistakeSummary,
  listMistakes,
  recordStandupUse,
  saveMistakes,
  standupUsedToday,
  MISTAKE_CATEGORY_LABEL,
  STANDUP_PER_DAY,
  type Mistake,
  type MistakeSummary,
} from "@/services/mistakes";
import { recordDailyActivity } from "@/services/streak";
import { getActiveCefrLevel } from "@/services/pipeline";
import { bankStatus } from "@/services/reading";
import { PAGE_CONTAINER } from "./shared";
import MistakeReview from "./MistakeReview";

const DRAFT_KEY = "myenglish_standup_draft_v1";

interface WritingTabProps {
  onOpenGrammarLesson: (lessonId: string) => void;
}

/** Writing: a daily standup corrected by AI, and the notebook of the learner's own mistakes */
export default function WritingTab({ onOpenGrammarLesson }: WritingTabProps) {
  const words = useWordsStore((s) => s.words);
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);
  const [saved, setSaved] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState(() => standupUsedToday());
  const [summary, setSummary] = useState<MistakeSummary | null>(null);
  const [recent, setRecent] = useState<Mistake[]>([]);
  const [reviewing, setReviewing] = useState<Mistake[] | null>(null);
  const [reviewResult, setReviewResult] = useState<string | null>(null);

  const reload = () => {
    getMistakeSummary().then(setSummary).catch(() => {});
    listMistakes(12).then(setRecent).catch(() => {});
  };
  useEffect(reload, []);

  // A few words being learned, to try using them in today's update (output practice)
  const suggestions = useMemo(
    () =>
      words
        .filter((w) => bankStatus(w) === "learning" && !/\s/.test(w.word))
        .sort(() => Math.random() - 0.5)
        .slice(0, 4),
    // Picked once per visit, not on every word refresh
    []
  );

  const updateText = (v: string) => {
    setText(v);
    try {
      localStorage.setItem(DRAFT_KEY, v);
    } catch {}
  };

  const len = text.trim().length;
  const canSend = !busy && len >= 10 && len <= 600 && used < STANDUP_PER_DAY;

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const fb = await correctWritingWithAI(text.trim(), await getActiveCefrLevel());
      recordStandupUse();
      setUsed(standupUsedToday());
      recordDailyActivity(1);
      setFeedback(fb);
      const res = await saveMistakes(
        fb.corrections.map((c) => ({ wrong: c.wrong, right: c.right, whyVn: c.whyVn, category: c.category, sentence: c.sentence })),
        { source: "standup" }
      );
      setSaved(res.added + res.repeated);
      reload();
    } catch (err) {
      setError(
        `Không sửa được bằng AI: ${err instanceof Error ? err.message : String(err)}. Cần cài Gemini CLI (xem tab Settings).`
      );
    } finally {
      setBusy(false);
    }
  };

  const startReview = async () => {
    setReviewResult(null);
    const due = await getDueMistakes();
    if (due.length > 0) setReviewing(due);
  };

  return (
    <div className={`${PAGE_CONTAINER} space-y-6`}>
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center justify-center gap-2">
          <NotebookPen className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          Viết và sửa lỗi
        </h2>
        <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-lg mx-auto">
          Viết vài câu về công việc hôm nay như khi báo cáo standup. AI sửa từng lỗi, và mỗi lỗi được lưu vào Sổ lỗi để bạn
          ôn lại cho đến khi không còn sai nữa.
        </p>
      </div>

      {/* Daily standup */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900 dark:text-white">Standup hôm nay</span>
          <span className="text-[11px] font-mono text-slate-400">
            {used}/{STANDUP_PER_DAY} lượt sửa hôm nay
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Hôm qua bạn làm gì, hôm nay làm gì, có gì đang bị chặn? 2–4 câu là đủ.
        </p>
        {suggestions.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500 dark:text-zinc-400">
            <span>Thử dùng từ đang học:</span>
            {suggestions.map((w) => (
              <span key={w.id} title={w.meaning_vn} className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 font-mono">
                {w.word}
              </span>
            ))}
          </div>
        )}
        <textarea
          value={text}
          onChange={(e) => updateText(e.target.value)}
          rows={4}
          placeholder="Yesterday I fixed the login bug. Today I am working on the payment API. No blockers."
          className="w-full p-3 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm text-slate-800 dark:text-zinc-200 leading-relaxed focus:outline-none focus:border-cyan-500 resize-y"
        />
        <div className="flex items-center justify-between">
          <span className={`text-[11px] ${len > 600 ? "text-rose-500" : "text-slate-400"}`}>{len}/600 ký tự</span>
          <button
            onClick={send}
            disabled={!canSend}
            className="inline-flex items-center gap-2 py-2.5 px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 !text-white text-xs font-semibold disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {busy ? "AI đang sửa…" : used >= STANDUP_PER_DAY ? "Hết lượt hôm nay" : "Nhờ AI sửa"}
          </button>
        </div>
        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

        {feedback && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-3 text-xs text-slate-700 dark:text-zinc-300">
            <div className="flex items-center justify-between">
              <span className="font-semibold">
                {feedback.corrections.length === 0 ? "Không có lỗi nào 🎉" : `${feedback.corrections.length} lỗi cần sửa`}
              </span>
              <span className="font-mono text-slate-400">Điểm {feedback.score}/100</span>
            </div>
            {feedback.explanationVn && <p>{feedback.explanationVn}</p>}
            {feedback.corrections.length > 0 && (
              <ul className="space-y-1.5">
                {feedback.corrections.map((c, i) => (
                  <li key={i} className="flex flex-col gap-0.5">
                    <span>
                      <span className="line-through text-rose-600 dark:text-rose-400">{c.wrong}</span> →{" "}
                      <strong className="text-emerald-700 dark:text-emerald-400">{c.right}</strong>
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                        {MISTAKE_CATEGORY_LABEL[c.category]}
                      </span>
                    </span>
                    {c.whyVn && <span className="text-slate-500 dark:text-zinc-400">{c.whyVn}</span>}
                  </li>
                ))}
              </ul>
            )}
            {feedback.betterVersion && (
              <p>
                Bản viết tự nhiên hơn: <em>{feedback.betterVersion}</em>
              </p>
            )}
            {saved > 0 && <p className="text-cyan-700 dark:text-cyan-400">Đã lưu {saved} lỗi vào Sổ lỗi. Ngày mai bạn sẽ được hỏi lại.</p>}
          </div>
        )}
      </div>

      {/* Mistake notebook */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <BookMarked className="w-4 h-4 text-rose-500" />
            Sổ lỗi của bạn
          </span>
          {summary && summary.due > 0 && !reviewing && (
            <button
              onClick={startReview}
              className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 !text-white text-xs font-semibold shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              Ôn {summary.due} lỗi đến hạn
            </button>
          )}
        </div>

        {reviewing ? (
          <MistakeReview
            mistakes={reviewing}
            onDone={({ reviewed, correct }) => {
              setReviewing(null);
              setReviewResult(`Xong ${reviewed} lỗi, sửa đúng ${correct}. Lỗi còn sai sẽ quay lại sớm hơn.`);
              reload();
            }}
          />
        ) : !summary || summary.total === 0 ? (
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Chưa có lỗi nào. Lỗi từ bài standup ở trên và từ bài "Tự viết câu" trong phiên ôn sẽ được lưu ở đây.
          </p>
        ) : (
          <>
            {reviewResult && <p className="text-xs text-emerald-700 dark:text-emerald-400">{reviewResult}</p>}
            <div className="space-y-1.5">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                {summary.total} lỗi đã lưu · {summary.due} cần ôn hôm nay · Bạn hay sai nhất:
              </div>
              {summary.byCategory.slice(0, 4).map(({ category, count }) => {
                const lesson = CATEGORY_LESSON[category];
                const max = summary.byCategory[0].count;
                return (
                  <div key={category} className="flex items-center gap-3 text-xs">
                    <span className="w-48 shrink-0 text-slate-700 dark:text-zinc-300">{MISTAKE_CATEGORY_LABEL[category]}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-rose-400/80" style={{ width: `${Math.round((count / max) * 100)}%` }} />
                    </div>
                    <span className="w-6 text-right font-mono text-slate-500">{count}</span>
                    {lesson ? (
                      <button onClick={() => onOpenGrammarLesson(lesson.id)} className="w-28 text-left text-[11px] text-cyan-700 dark:text-cyan-400 hover:underline truncate">
                        Bài: {lesson.title}
                      </button>
                    ) : (
                      <span className="w-28" />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-zinc-800">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Gần đây</div>
              {recent.map((m) => (
                <div key={m.id} className="group flex items-start justify-between gap-3 text-xs">
                  <span className="text-slate-700 dark:text-zinc-300">
                    <span className="line-through text-rose-600/80 dark:text-rose-400/80">{m.wrong_text}</span> →{" "}
                    <strong>{m.right_text}</strong>
                    {m.occurrences > 1 && <span className="ml-1.5 text-[10px] text-rose-500">sai {m.occurrences} lần</span>}
                  </span>
                  <button
                    onClick={() => deleteMistake(m.id).then(reload)}
                    title="Xóa khỏi sổ (AI sửa sai, hoặc không cần ôn)"
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
