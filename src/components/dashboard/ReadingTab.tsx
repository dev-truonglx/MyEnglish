import { useMemo, useState } from "react";
import { BookOpenText, Check, Pencil, Plus, Quote, Sparkles, X } from "lucide-react";
import { useWordsStore } from "@/stores/wordsStore";
import { analyzeText, logEncounters, type BankStatus, type ReadingAnalysis } from "@/services/reading";
import { pipeline } from "@/services/pipeline";
import { addUserContextExample } from "@/services/db";
import { PAGE_CONTAINER } from "./shared";

const DRAFT_KEY = "myenglish_reading_draft_v1";
/** Long texts are cut so highlighting stays instant */
const MAX_CHARS = 20_000;
const MAX_CANDIDATES_SHOWN = 15;

const STATUS_STYLE: Record<BankStatus, string> = {
  mastered: "border-b-2 border-emerald-400/70 dark:border-emerald-500/60",
  learning: "bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-100 rounded px-0.5",
  new: "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-900 dark:text-cyan-100 rounded px-0.5",
};
const STATUS_LABEL: Record<BankStatus, string> = { mastered: "Đã thuộc", learning: "Đang học", new: "Mới thêm" };

function readDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(text: string): void {
  try {
    if (text) localStorage.setItem(DRAFT_KEY, text);
    else localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

/**
 * Reading mode: paste real text and see your words in it. Bank words open their details; unfamiliar words
 * are picked and added with the sentence they appear in; a learning word's sentence can be kept as an example.
 */
export default function ReadingTab() {
  const words = useWordsStore((s) => s.words);
  const setSelectedWord = useWordsStore((s) => s.setSelectedWord);
  const refreshWords = useWordsStore((s) => s.refreshWords);
  const [text, setText] = useState(readDraft);
  const [reading, setReading] = useState<string | null>(null);
  // base form -> sentence it was picked from
  const [picked, setPicked] = useState<Map<string, string>>(() => new Map());
  const [savedSentences, setSavedSentences] = useState<Set<string>>(() => new Set());
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const analysis: ReadingAnalysis | null = useMemo(
    () => (reading ? analyzeText(reading, words) : null),
    [reading, words]
  );

  const startReading = () => {
    const clean = text.slice(0, MAX_CHARS).trim();
    if (!clean) return;
    saveDraft(clean);
    setReading(clean);
    setPicked(new Map());
    setSavedSentences(new Set());
    const met = logEncounters(analyzeText(clean, words).bankHits);
    if (met > 0) {
      setMessage(`Bạn gặp lại ${met} từ đang học trong bài này. Gặp từ trong văn bản thật giúp bạn hiểu cách dùng của nó.`);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const togglePick = (base: string, sentence: string) =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(base)) next.delete(base);
      else next.set(base, sentence);
      return next;
    });

  const addPicked = async () => {
    setAdding(true);
    let accepted = 0;
    const refused: string[] = [];
    for (const [base, sentence] of picked) {
      const res = await pipeline.enqueue(base, { context: sentence });
      if (res.accepted) accepted++;
      else refused.push(base);
    }
    setAdding(false);
    setPicked(new Map());
    refreshWords();
    setMessage(
      `Đã thêm ${accepted} từ vào sổ, kèm câu bạn gặp chúng làm ví dụ. AI đang phân tích nghĩa (cần Claude hoặc Gemini CLI).` +
        (refused.length ? ` Không thêm được: ${refused.join(", ")}.` : "")
    );
  };

  const keepSentence = async (wordId: string, sentence: string) => {
    const ok = await addUserContextExample(wordId, sentence).catch(() => false);
    setSavedSentences((prev) => new Set(prev).add(wordId));
    if (ok) refreshWords();
    setMessage(ok ? "Đã lưu câu này làm ví dụ: bài điền từ sẽ dùng câu của bạn trước." : "Câu này đã có trong ví dụ của từ.");
    setTimeout(() => setMessage(null), 4000);
  };

  if (!analysis) {
    return (
      <div className={`${PAGE_CONTAINER} space-y-5`}>
        <div className="space-y-2 text-center">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center justify-center gap-2">
            <BookOpenText className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            Đọc với sổ từ của bạn
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-lg mx-auto">
            Dán một đoạn tài liệu, mô tả PR, email hay bài viết tiếng Anh. App tô màu những từ bạn đã thuộc và đang học, gợi ý
            từ lạ đáng học, và lưu câu bạn gặp chúng làm ví dụ.
          </p>
        </div>
        {message && (
          <div className="flex items-start justify-between gap-3 p-3 rounded-xl border border-cyan-200 dark:border-cyan-500/30 bg-cyan-50 dark:bg-cyan-500/10 text-xs text-cyan-900 dark:text-cyan-200">
            <span>{message}</span>
            <button onClick={() => setMessage(null)} className="shrink-0 opacity-60 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Dán văn bản tiếng Anh vào đây (⌘V)…"
          rows={14}
          className="w-full p-4 rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 text-sm text-slate-800 dark:text-zinc-200 leading-relaxed focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 resize-y"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400 dark:text-zinc-500">
            {text.length > MAX_CHARS ? `Chỉ đọc ${MAX_CHARS.toLocaleString()} ký tự đầu` : `${text.length.toLocaleString()} ký tự`}
          </span>
          <div className="flex items-center gap-2">
            {text && (
              <button
                onClick={() => {
                  setText("");
                  saveDraft("");
                }}
                className="py-2 px-3 rounded-xl text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Xóa
              </button>
            )}
            <button
              onClick={startReading}
              disabled={!text.trim()}
              className="inline-flex items-center gap-2 py-2.5 px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 !text-white text-xs font-semibold disabled:opacity-40"
            >
              <BookOpenText className="w-4 h-4" />
              Đọc
            </button>
          </div>
        </div>
      </div>
    );
  }

  const shownCandidates = analysis.candidates.slice(0, MAX_CANDIDATES_SHOWN);
  const counts = { mastered: 0, learning: 0, new: 0 } as Record<BankStatus, number>;
  for (const h of analysis.bankHits) counts[h.status]++;

  return (
    <div className={`${PAGE_CONTAINER} space-y-4`}>
      {message && (
        <div className="flex items-start justify-between gap-3 p-3 rounded-xl border border-cyan-200 dark:border-cyan-500/30 bg-cyan-50 dark:bg-cyan-500/10 text-xs text-cyan-900 dark:text-cyan-200">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="shrink-0 opacity-60 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-[11px] text-slate-600 dark:text-zinc-400 flex-wrap">
          <span className={STATUS_STYLE.mastered}>Đã thuộc ({counts.mastered})</span>
          <span className={STATUS_STYLE.learning}>Đang học ({counts.learning})</span>
          <span className={STATUS_STYLE.new}>Mới thêm ({counts.new})</span>
          <span className="border-b border-dotted border-slate-400">Từ lạ ({analysis.candidates.length})</span>
        </div>
        <button
          onClick={() => setReading(null)}
          className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
        >
          <Pencil className="w-3.5 h-3.5" />
          Sửa / dán bài khác
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 items-start">
        <article className="p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 text-[15px] leading-8 text-slate-800 dark:text-zinc-200 whitespace-pre-wrap break-words">
          {analysis.segments.map((seg, i) => {
            const t = seg.token;
            if (!t || t.kind === "common") {
              return <span key={i}>{seg.text}</span>;
            }
            if (t.kind === "bank") {
              return (
                <span
                  key={i}
                  onClick={() => setSelectedWord(t.word)}
                  title={`${STATUS_LABEL[t.status]}: ${t.word.meaning_vn}`}
                  className={`cursor-pointer ${STATUS_STYLE[t.status]}`}
                >
                  {seg.text}
                </span>
              );
            }
            const on = picked.has(t.base);
            return (
              <span
                key={i}
                onClick={() => togglePick(t.base, t.sentence)}
                title={on ? "Bỏ chọn" : `Chọn "${t.base}" để thêm vào sổ`}
                className={`cursor-pointer ${on ? "bg-violet-200 dark:bg-violet-500/30 rounded px-0.5" : "border-b border-dotted border-slate-400 dark:border-zinc-500 hover:bg-violet-50 dark:hover:bg-violet-500/10"}`}
              >
                {seg.text}
              </span>
            );
          })}
        </article>

        <aside className="space-y-4 lg:sticky lg:top-4">
          {picked.size > 0 && (
            <div className="p-3.5 rounded-xl border border-violet-300 dark:border-violet-500/40 bg-violet-50 dark:bg-violet-500/10 space-y-2.5">
              <div className="text-xs font-semibold text-violet-900 dark:text-violet-200">Đã chọn {picked.size} từ</div>
              <div className="flex flex-wrap gap-1.5">
                {[...picked.keys()].map((b) => (
                  <button
                    key={b}
                    onClick={() => togglePick(b, "")}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-zinc-900 border border-violet-200 dark:border-violet-500/30 text-[11px] font-mono text-violet-800 dark:text-violet-200"
                  >
                    {b}
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
              <button
                onClick={addPicked}
                disabled={adding}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 !text-white text-xs font-semibold disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm vào sổ kèm câu ví dụ
              </button>
            </div>
          )}

          {analysis.bankHits.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Từ của bạn trong bài</h3>
              {analysis.bankHits.map((h) => (
                <div key={h.word.id} className="p-2.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <button onClick={() => setSelectedWord(h.word)} className="text-xs font-bold text-slate-900 dark:text-white hover:underline text-left">
                      {h.word.word}
                      {h.count > 1 && <span className="ml-1 font-normal text-slate-400">×{h.count}</span>}
                    </button>
                    <span className={`text-[10px] ${STATUS_STYLE[h.status]}`}>{STATUS_LABEL[h.status]}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-1">{h.word.meaning_vn}</p>
                  {h.status !== "mastered" && h.sentence && (
                    <button
                      onClick={() => keepSentence(h.word.id, h.sentence)}
                      disabled={savedSentences.has(h.word.id)}
                      title={h.sentence}
                      className="inline-flex items-center gap-1 text-[10px] text-cyan-700 dark:text-cyan-400 hover:underline disabled:no-underline disabled:text-emerald-600"
                    >
                      {savedSentences.has(h.word.id) ? <Check className="w-3 h-3" /> : <Quote className="w-3 h-3" />}
                      {savedSentences.has(h.word.id) ? "Đã lưu câu" : "Lưu câu này làm ví dụ"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {shownCandidates.length > 0 && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                <Sparkles className="w-3 h-3" />
                Từ lạ có thể đáng học
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {shownCandidates.map((c) => {
                  const on = picked.has(c.base);
                  return (
                    <button
                      key={c.base}
                      onClick={() => togglePick(c.base, c.sentence)}
                      title={c.sentence}
                      className={`px-2 py-1 rounded-md border text-[11px] font-mono transition-colors ${on ? "bg-violet-600 border-violet-600 !text-white" : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:border-violet-400"}`}
                    >
                      {c.base}
                      {c.count > 1 && <span className="opacity-60"> ×{c.count}</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400 dark:text-zinc-500">
                Bấm vào từ trong bài hoặc ở đây để chọn. Danh sách chỉ loại các từ rất phổ biến, nên vẫn có thể có từ bạn đã biết.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
