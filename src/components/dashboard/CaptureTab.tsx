import type { FormEvent } from "react";
import {
  BookOpen,
  Sparkles,
  Volume2,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Code2,
  Copy,
  Terminal,
  Layers,
  Tag,
  RotateCw,
} from "lucide-react";
import { pipeline, type PipelineItem } from "@/services/pipeline";
import { parseTerms, parseCollocations } from "@/types/database";
import { useWordsStore } from "@/stores/wordsStore";
import { PAGE_CONTAINER, handleSpeak, type DashboardTab } from "./shared";

interface CaptureTabProps {
  inputWord: string;
  setInputWord: (value: string) => void;
  setMessage: (msg: string | null) => void;
  pipelineQueue: PipelineItem[];
  expandedQueueItems: Record<string, boolean>;
  toggleQueueItemExpand: (wordKey: string, e?: React.MouseEvent) => void;
  expandedTerms: Record<string, boolean>;
  toggleTermExpanded: (termKey: string, e?: React.MouseEvent) => void;
  copiedSnippet: boolean;
  handleCopyCode: (code: string) => void;
  setActiveTab: (tab: DashboardTab) => void;
}

/** TAB 2: QUICK CAPTURE & AI PIPELINE */
export default function CaptureTab({
  inputWord,
  setInputWord,
  setMessage,
  pipelineQueue,
  expandedQueueItems,
  toggleQueueItemExpand,
  expandedTerms,
  toggleTermExpanded,
  copiedSnippet,
  handleCopyCode,
  setActiveTab,
}: CaptureTabProps) {
  const words = useWordsStore((s) => s.words);
  const setSelectedWord = useWordsStore((s) => s.setSelectedWord);

  // Submit word manually
  const handleCaptureSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clean = inputWord.trim();
    if (!clean) return;

    setMessage(`Analyzing "${clean}" with Gemini CLI...`);
    setInputWord("");
    pipeline.enqueue(clean);
  };

  return (
    <div className={`${PAGE_CONTAINER} space-y-8`}>
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">AI Vocabulary Enrichment</h2>
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Input any English word. Gemini CLI will automatically break down the Vietnamese meaning, tech context, and 3 code examples with grammar analysis.
        </p>
      </div>

      {/* Input Card */}
      <form onSubmit={handleCaptureSubmit} className="space-y-4">
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-2.5 md:p-3 shadow-xl shadow-slate-200/50 dark:shadow-cyan-950/30 backdrop-blur-md flex items-center gap-3 transition-all focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/20">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
            <Terminal className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={inputWord}
            onChange={(e) => setInputWord(e.target.value)}
            placeholder="Nhập từ tiếng Anh (e.g. idempotent, telemetry, volatile, sanitize)..."
            className="flex-1 bg-transparent px-1 py-2 text-sm md:text-base text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none font-mono"
            autoFocus
          />
          <button
            type="submit"
            disabled={!inputWord.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold shadow-md shadow-cyan-500/25 transition-all disabled:opacity-40 disabled:pointer-events-none shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>Phân tích & Lưu</span>
          </button>
        </div>

        {/* Sample Suggestions */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-zinc-400 flex-wrap">
          <span>Gợi ý mẫu:</span>
          {["idempotent", "concurrency", "telemetry", "deterministic", "throughput"].map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => {
                setInputWord(term);
                pipeline.enqueue(term);
              }}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 font-mono text-[11px] transition-colors shadow-sm"
            >
              {term}
            </button>
          ))}
        </div>
      </form>

      {/* Live Pipeline Queue */}
      {pipelineQueue.length > 0 && (
        <div className="space-y-3 pt-4">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
            Hàng đợi phân tích AI
          </h3>
          <div className="space-y-3">
            {pipelineQueue.map((item, idx) => {
              const enrichedData =
                item.result ||
                (() => {
                  const match = words.find(
                    (w) =>
                      (item.wordId && w.id === item.wordId) ||
                      w.word.toLowerCase() === item.word.toLowerCase()
                  );
                  if (!match) return null;
                  return {
                    phonetic: match.phonetic || undefined,
                    part_of_speech: match.part_of_speech || undefined,
                    topic: match.topic || undefined,
                    meaning_vn: match.meaning_vn,
                    collocations: parseCollocations(match.collocations),
                    code_snippet: match.code_snippet || undefined,
                    synonyms: parseTerms(match.synonyms),
                    antonyms: parseTerms(match.antonyms),
                    examples: match.examples.map((ex) => ({
                      sentence_en: ex.sentence_en,
                      sentence_vn: ex.sentence_vn,
                      grammar_analysis: ex.grammar_analysis,
                    })),
                  };
                })();

              const isExpanded = !!expandedQueueItems[item.word];
              const matchingWord = words.find(
                (w) =>
                  (item.wordId && w.id === item.wordId) ||
                  w.word.toLowerCase() === item.word.toLowerCase()
              );

              // MẶC ĐỊNH THU GỌN KHI ĐÃ HOÀN TẤT SINH TỪ (Chỉ mở ra khi user click)
              if (!isExpanded && enrichedData && item.status !== "analyzing") {
                return (
                  <div
                    key={idx}
                    onClick={(e) => toggleQueueItemExpand(item.word, e)}
                    className="relative rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 space-y-2 shadow-sm hover:border-slate-300 dark:hover:border-zinc-700 transition-all pr-14 cursor-pointer select-none"
                  >
                    {/* Nút xổ ra luôn cố định ở góc trên phải */}
                    <button
                      type="button"
                      onClick={(e) => toggleQueueItemExpand(item.word, e)}
                      title="Bấm để mở rộng chi tiết"
                      className="absolute top-3.5 right-3.5 p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors z-10 shadow-sm"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>

                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono text-base font-bold text-slate-900 dark:text-white capitalize">
                          {item.word}
                        </span>
                        {enrichedData.phonetic && (
                          <span className="text-xs font-mono text-cyan-700 dark:text-cyan-400">
                            {enrichedData.phonetic}
                          </span>
                        )}
                        {enrichedData.part_of_speech && (
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-semibold">
                            {enrichedData.part_of_speech}
                          </span>
                        )}
                        {enrichedData.topic && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-100 dark:bg-cyan-950/70 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/60 flex items-center gap-1">
                            <Tag className="w-2.5 h-2.5 text-cyan-600 dark:text-cyan-400" />
                            <span>{enrichedData.topic}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSpeak(item.word);
                          }}
                          title="Phát âm từ này"
                          className="p-1 rounded-lg bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-500/10 dark:hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/30 transition-colors"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                        {matchingWord && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedWord(matchingWord);
                              setActiveTab("library");
                            }}
                            title="Xem chi tiết trong Thư viện"
                            className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-300 dark:border-zinc-700 text-[11px] font-medium flex items-center gap-1 shadow-sm"
                          >
                            <BookOpen className="w-3 h-3 text-cyan-500" />
                            <span>Thư viện</span>
                          </button>
                        )}
                        <span className="text-xs font-mono px-2.5 py-0.5 rounded-full border bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300">
                          Saved to Library ✓
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-zinc-300">
                      <span className="text-cyan-700 dark:text-cyan-400 font-medium">Nghĩa: </span>
                      {enrichedData.meaning_vn}
                    </p>
                  </div>
                );
              }

              return (
                <div
                  key={idx}
                  className="relative rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-5 shadow-sm transition-all pr-14"
                >
                  {/* Nút thu gọn thẻ luôn cố định ở góc trên phải */}
                  {enrichedData && (
                    <button
                      type="button"
                      onClick={(e) => toggleQueueItemExpand(item.word, e)}
                      title="Bấm để thu gọn thẻ"
                      className="absolute top-4 right-4 p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors z-10 shadow-sm"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                  )}

                  {/* Header Bar */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800/80 flex-wrap gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono text-xl font-black text-slate-900 dark:text-white capitalize tracking-tight">
                        {item.word}
                      </span>
                      {enrichedData?.phonetic && (
                        <span className="text-xs font-mono text-cyan-700 dark:text-cyan-400">
                          {enrichedData.phonetic}
                        </span>
                      )}
                      {enrichedData?.part_of_speech && (
                        <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-semibold">
                          {enrichedData.part_of_speech}
                        </span>
                      )}
                      {enrichedData?.topic && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-100 dark:bg-cyan-950/70 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/60 shadow-sm flex items-center gap-1">
                          <Tag className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                          <span>{enrichedData.topic}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {enrichedData && (
                        <button
                          type="button"
                          onClick={() => handleSpeak(item.word)}
                          title="Phát âm từ này"
                          className="px-2.5 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-500/10 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/30 transition-colors flex items-center gap-1 text-xs font-medium shadow-sm"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Phát âm</span>
                        </button>
                      )}

                      {matchingWord && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedWord(matchingWord);
                            setActiveTab("library");
                          }}
                          title="Xem chi tiết đầy đủ trong Thư viện"
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-300 dark:border-zinc-700 transition-colors flex items-center gap-1 text-xs font-medium shadow-sm"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-cyan-500" />
                          <span>Thư viện</span>
                        </button>
                      )}

                      <span
                        className={`text-xs font-mono px-2.5 py-0.5 rounded-full border ${item.status === "analyzing"
                          ? "bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 animate-pulse"
                          : item.status === "completed"
                            ? "bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300"
                            : "bg-rose-100 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-300"
                          }`}
                      >
                        {item.status === "analyzing" && "Analyzing with Gemini..."}
                        {item.status === "completed" && "Saved to Library ✓"}
                        {item.status === "failed" && "Failed"}
                        {item.status === "pending" && "Queued"}
                      </span>

                      {item.status === "failed" && (
                        <button
                          type="button"
                          onClick={() => pipeline.retry(item.word)}
                          title="Thử lại phân tích AI"
                          className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 transition-colors flex items-center gap-1 text-xs font-medium shadow-sm"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Thử lại</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Analyzing Banner */}
                  {item.status === "analyzing" && (
                    <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs">
                      <Sparkles className="w-4 h-4 animate-spin text-amber-500 shrink-0" />
                      <span>Gemini AI đang phân tích nghĩa, phát âm, từ đồng nghĩa, trái nghĩa và cấu trúc ví dụ...</span>
                    </div>
                  )}

                  {item.error && <p className="text-xs text-rose-400">{item.error}</p>}

                  {/* Complete Analysis Breakdown */}
                  {enrichedData && (
                    <div className="space-y-5 animate-in fade-in duration-200">
                      {/* 1. Vietnamese Meaning Card */}
                      <div className="p-3.5 rounded-2xl bg-slate-100/80 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 space-y-1.5 shadow-sm">
                        <div className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-400 font-mono text-[11px] font-semibold uppercase tracking-wider">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Ý nghĩa Tiếng Việt (Chuyên ngành & Đời sống)</span>
                        </div>
                        <p className="text-sm text-slate-800 dark:text-zinc-200 font-normal leading-relaxed">
                          {enrichedData.meaning_vn}
                        </p>
                      </div>

                      {/* 2. Collocations */}
                      {enrichedData.collocations && enrichedData.collocations.length > 0 && (
                        <div className="p-3.5 rounded-2xl bg-slate-100/80 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 space-y-2">
                          <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5" />
                            Cụm từ thường gặp (Collocations):
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {enrichedData.collocations.map((c, cIdx) => (
                              <span
                                key={cIdx}
                                className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700/70 text-slate-800 dark:text-zinc-200 font-mono text-xs hover:border-cyan-500/50 transition-colors"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 3. Synonyms Section */}
                      {enrichedData.synonyms && enrichedData.synonyms.length > 0 && (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              Từ đồng nghĩa (Synonyms):
                            </span>
                            <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-500">
                              {enrichedData.synonyms.length} từ • click để xem phân tích
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-2.5">
                            {enrichedData.synonyms.map((s, sIdx) => {
                              const termKey = `queue-${item.word}-syn-${s.word}`;
                              const isExpanded = !!expandedTerms[termKey];
                              const hasExamples = s.examples && s.examples.length > 0;

                              return (
                                <div
                                  key={sIdx}
                                  className={`rounded-2xl border transition-all overflow-hidden ${isExpanded
                                    ? "bg-emerald-50/40 dark:bg-zinc-900 border-emerald-400 dark:border-emerald-500/60 shadow-md shadow-emerald-500/5 ring-1 ring-emerald-500/20"
                                    : "bg-slate-50 dark:bg-zinc-900/80 border-slate-200 dark:border-zinc-800 hover:border-emerald-400 dark:hover:border-emerald-500/40 hover:bg-slate-50/90 dark:hover:bg-zinc-900"
                                    }`}
                                >
                                  {/* Synonym Header */}
                                  <div
                                    onClick={(e) => toggleTermExpanded(termKey, e)}
                                    className="p-3.5 cursor-pointer flex items-start justify-between gap-2 select-none"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">
                                          {s.word}
                                        </span>
                                        {s.phonetic && (
                                          <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400/90 bg-emerald-100/70 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50 px-1.5 py-0.2 rounded">
                                            {s.phonetic}
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={(e) => handleSpeak(s.word, e)}
                                          title="Phát âm"
                                          className="text-slate-400 hover:text-emerald-600 dark:text-zinc-500 dark:hover:text-emerald-400 p-0.5 rounded transition-colors"
                                        >
                                          <Volume2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                      {s.meaning_vn && (
                                        <p className="text-xs text-slate-600 dark:text-zinc-300 mt-1 leading-snug">
                                          {s.meaning_vn}
                                        </p>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0 text-slate-400 dark:text-zinc-400">
                                      {hasExamples ? (
                                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 font-medium">
                                          {s.examples!.length} câu ví dụ
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400">
                                          Chi tiết
                                        </span>
                                      )}
                                      <div className="p-1 rounded text-slate-400 group-hover:text-slate-700 dark:text-zinc-400 dark:group-hover:text-white transition-colors">
                                        {isExpanded ? (
                                          <ChevronUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                        ) : (
                                          <ChevronDown className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Synonym Body */}
                                  {isExpanded && (
                                    <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-200 dark:border-zinc-800/80 space-y-3 animate-in slide-in-from-top-2 duration-150">
                                      {hasExamples ? (
                                        <div className="space-y-3 pt-2">
                                          {s.examples!.map((ex, exIdx) => (
                                            <div
                                              key={exIdx}
                                              className="p-3 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/90 space-y-2.5 text-xs shadow-sm"
                                            >
                                              <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-start gap-2">
                                                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold text-[11px] shrink-0 mt-0.5">
                                                    #{exIdx + 1}
                                                  </span>
                                                  <p className="text-xs font-semibold text-slate-900 dark:text-white leading-relaxed">
                                                    "{ex.sentence_en}"
                                                  </p>
                                                </div>
                                                <button
                                                  type="button"
                                                  onClick={(e) => handleSpeak(ex.sentence_en, e)}
                                                  title="Nghe câu"
                                                  className="text-slate-400 hover:text-emerald-600 dark:text-zinc-500 dark:hover:text-emerald-400 p-0.5 rounded shrink-0"
                                                >
                                                  <Volume2 className="w-3.5 h-3.5" />
                                                </button>
                                              </div>

                                              {ex.meaning_vn && (
                                                <div className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/40 text-[11px] text-cyan-900 dark:text-cyan-200 leading-relaxed">
                                                  <span className="font-bold text-cyan-700 dark:text-cyan-400 block mb-0.5">
                                                    📖 Ý nghĩa của câu:
                                                  </span>
                                                  {ex.meaning_vn}
                                                </div>
                                              )}

                                              {ex.structure && (
                                                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-[11px] text-emerald-900 dark:text-emerald-200 font-mono leading-relaxed">
                                                  <span className="font-bold text-emerald-700 dark:text-emerald-400 block mb-0.5 font-sans">
                                                    🧩 Cấu trúc câu:
                                                  </span>
                                                  {ex.structure}
                                                </div>
                                              )}

                                              {ex.why_used && (
                                                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                                                  <span className="font-bold text-amber-700 dark:text-amber-400 block mb-0.5">
                                                    💡 Giải thích lý do dùng cấu trúc:
                                                  </span>
                                                  {ex.why_used}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="py-2.5 text-[11px] text-slate-500 dark:text-zinc-500 italic text-center">
                                          Từ này đã được tự động lưu vào thư viện từ vựng.
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 4. Antonyms Section */}
                      {enrichedData.antonyms && enrichedData.antonyms.length > 0 && (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-rose-500" />
                              Từ trái nghĩa (Antonyms):
                            </span>
                            <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-500">
                              {enrichedData.antonyms.length} từ • click để xem phân tích
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-2.5">
                            {enrichedData.antonyms.map((a, aIdx) => {
                              const termKey = `queue-${item.word}-ant-${a.word}`;
                              const isExpanded = !!expandedTerms[termKey];
                              const hasExamples = a.examples && a.examples.length > 0;

                              return (
                                <div
                                  key={aIdx}
                                  className={`rounded-2xl border transition-all overflow-hidden ${isExpanded
                                    ? "bg-rose-50/40 dark:bg-zinc-900 border-rose-400 dark:border-rose-500/60 shadow-md shadow-rose-500/5 ring-1 ring-rose-500/20"
                                    : "bg-slate-50 dark:bg-zinc-900/80 border-slate-200 dark:border-zinc-800 hover:border-rose-400 dark:hover:border-rose-500/40 hover:bg-slate-50/90 dark:hover:bg-zinc-900"
                                    }`}
                                >
                                  {/* Antonym Header */}
                                  <div
                                    onClick={(e) => toggleTermExpanded(termKey, e)}
                                    className="p-3.5 cursor-pointer flex items-start justify-between gap-2 select-none"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-sm font-bold text-rose-700 dark:text-rose-300">
                                          {a.word}
                                        </span>
                                        {a.phonetic && (
                                          <span className="text-[10px] font-mono text-rose-700 dark:text-rose-400/90 bg-rose-100/70 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/50 px-1.5 py-0.2 rounded">
                                            {a.phonetic}
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={(e) => handleSpeak(a.word, e)}
                                          title="Phát âm"
                                          className="text-slate-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 p-0.5 rounded transition-colors"
                                        >
                                          <Volume2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                      {a.meaning_vn && (
                                        <p className="text-xs text-slate-600 dark:text-zinc-300 mt-1 leading-snug">
                                          {a.meaning_vn}
                                        </p>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0 text-slate-400 dark:text-zinc-400">
                                      {hasExamples ? (
                                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/90 text-rose-800 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 font-medium">
                                          {a.examples!.length} câu ví dụ
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400">
                                          Chi tiết
                                        </span>
                                      )}
                                      <div className="p-1 rounded text-slate-400 group-hover:text-slate-700 dark:text-zinc-400 dark:group-hover:text-white transition-colors">
                                        {isExpanded ? (
                                          <ChevronUp className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                                        ) : (
                                          <ChevronDown className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Antonym Body */}
                                  {isExpanded && (
                                    <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-200 dark:border-zinc-800/80 space-y-3 animate-in slide-in-from-top-2 duration-150">
                                      {hasExamples ? (
                                        <div className="space-y-3 pt-2">
                                          {a.examples!.map((ex, exIdx) => (
                                            <div
                                              key={exIdx}
                                              className="p-3 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/90 space-y-2.5 text-xs shadow-sm"
                                            >
                                              <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-start gap-2">
                                                  <span className="font-mono text-rose-600 dark:text-rose-400 font-bold text-[11px] shrink-0 mt-0.5">
                                                    #{exIdx + 1}
                                                  </span>
                                                  <p className="text-xs font-semibold text-slate-900 dark:text-white leading-relaxed">
                                                    "{ex.sentence_en}"
                                                  </p>
                                                </div>
                                                <button
                                                  type="button"
                                                  onClick={(e) => handleSpeak(ex.sentence_en, e)}
                                                  title="Nghe câu"
                                                  className="text-slate-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 p-0.5 rounded shrink-0"
                                                >
                                                  <Volume2 className="w-3.5 h-3.5" />
                                                </button>
                                              </div>

                                              {ex.meaning_vn && (
                                                <div className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/40 text-[11px] text-cyan-900 dark:text-cyan-200 leading-relaxed">
                                                  <span className="font-bold text-cyan-700 dark:text-cyan-400 block mb-0.5">
                                                    📖 Ý nghĩa của câu:
                                                  </span>
                                                  {ex.meaning_vn}
                                                </div>
                                              )}

                                              {ex.structure && (
                                                <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-[11px] text-rose-900 dark:text-rose-200 font-mono leading-relaxed">
                                                  <span className="font-bold text-rose-700 dark:text-rose-400 block mb-0.5 font-sans">
                                                    🧩 Cấu trúc câu:
                                                  </span>
                                                  {ex.structure}
                                                </div>
                                              )}

                                              {ex.why_used && (
                                                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                                                  <span className="font-bold text-amber-700 dark:text-amber-400 block mb-0.5">
                                                    💡 Giải thích lý do dùng cấu trúc:
                                                  </span>
                                                  {ex.why_used}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="py-2.5 text-[11px] text-slate-500 dark:text-zinc-500 italic text-center">
                                          Từ này đã được tự động lưu vào thư viện từ vựng.
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 5. Code Snippet with Terminal Styling */}
                      {enrichedData.code_snippet && (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                              <Terminal className="w-4 h-4" />
                              Đoạn mã ngữ cảnh (Code Snippet):
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyCode(enrichedData.code_snippet!)}
                              className="text-[11px] font-mono text-slate-600 hover:text-cyan-600 dark:text-zinc-400 dark:hover:text-cyan-300 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 transition-colors shadow-sm"
                            >
                              {copiedSnippet ? (
                                <>
                                  <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Đã sao chép</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Sao chép mã</span>
                                </>
                              )}
                            </button>
                          </div>
                          <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-[#0d1117] overflow-hidden shadow-xl">
                            <div className="bg-zinc-900/90 px-4 py-2 border-b border-zinc-800 flex items-center justify-between select-none">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                                <span className="ml-2 text-[10px] font-mono text-zinc-500">example.ts</span>
                              </div>
                              <span className="text-[10px] font-mono text-zinc-500">Developer Context</span>
                            </div>
                            <pre className="p-4 text-xs font-mono text-zinc-200 overflow-x-auto leading-relaxed selection:bg-cyan-500/30 whitespace-pre">
                              <code>{enrichedData.code_snippet}</code>
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* 6. Context Examples with Grammar & Syntax Analysis */}
                      {enrichedData.examples && enrichedData.examples.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                              <Code2 className="w-4 h-4" />
                              Ví dụ & Phân tích cú pháp:
                            </span>
                            <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-500">
                              {enrichedData.examples.length} câu ví dụ
                            </span>
                          </div>

                          <div className="space-y-3.5">
                            {enrichedData.examples.map((ex, exIdx) => (
                              <div
                                key={exIdx}
                                className="rounded-2xl bg-slate-50 dark:bg-zinc-950 p-4 border border-slate-200 dark:border-zinc-800/90 space-y-3 shadow-sm"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-start gap-2">
                                    <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold text-xs shrink-0 mt-0.5">
                                      #{exIdx + 1}
                                    </span>
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed">
                                      {ex.sentence_en}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleSpeak(ex.sentence_en)}
                                    title="Nghe cả câu"
                                    className="text-slate-400 hover:text-cyan-600 dark:text-zinc-500 dark:hover:text-cyan-400 p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-900 transition-colors shrink-0"
                                  >
                                    <Volume2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                {ex.sentence_vn && (
                                  <div className="p-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/50 text-xs text-cyan-950 dark:text-cyan-200 leading-relaxed">
                                    <span className="font-semibold text-cyan-700 dark:text-cyan-400">Dịch nghĩa: </span>
                                    {ex.sentence_vn}
                                  </div>
                                )}

                                {ex.grammar_analysis && (
                                  <div className="space-y-1.5 pt-1 border-t border-slate-200 dark:border-zinc-900">
                                    <span className="text-[11px] font-mono uppercase tracking-wider text-amber-700 dark:text-amber-400 font-bold block">
                                      Phân tích cú pháp (Grammar / Syntax):
                                    </span>
                                    <div className="p-3 rounded-xl bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 text-xs font-mono text-slate-800 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap shadow-inner">
                                      {ex.grammar_analysis}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
