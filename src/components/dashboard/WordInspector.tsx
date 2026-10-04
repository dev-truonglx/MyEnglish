import {
  BookOpen,
  Sparkles,
  Volume2,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  CheckCircle,
  Code2,
  Copy,
  Terminal,
  Layers,
  Tag,
  GraduationCap,
} from "lucide-react";
import { updateWordTopic, PREDEFINED_TOPICS } from "@/services/db";
import { parseTerms, parseCollocations } from "@/types/database";
import { useWordsStore } from "@/stores/wordsStore";
import { handleSpeak, type DashboardTab } from "./shared";

interface WordInspectorProps {
  requestDeleteWord: (wordId: string, wordText: string, e?: React.MouseEvent) => void;
  expandedTerms: Record<string, boolean>;
  toggleTermExpanded: (termKey: string, e?: React.MouseEvent) => void;
  copiedSnippet: boolean;
  handleCopyCode: (code: string) => void;
  setActiveTab: (tab: DashboardTab) => void;
  setMessage: (msg: string | null) => void;
}

/** RIGHT SLIDE-OVER WORD DETAIL INSPECTOR (renders nothing when no word is selected) */
export default function WordInspector({
  requestDeleteWord,
  expandedTerms,
  toggleTermExpanded,
  copiedSnippet,
  handleCopyCode,
  setActiveTab,
  setMessage,
}: WordInspectorProps) {
  const selectedWord = useWordsStore((s) => s.selectedWord);
  const setSelectedWord = useWordsStore((s) => s.setSelectedWord);
  const setWords = useWordsStore((s) => s.setWords);

  const handleUpdateTopic = async (wordId: string, newTopic: string) => {
    const cleanTopic = newTopic.trim() || "General Tech";
    try {
      await updateWordTopic(wordId, cleanTopic);
      setWords((prev) =>
        prev.map((w) => (w.id === wordId ? { ...w, topic: cleanTopic } : w))
      );
      if (selectedWord && selectedWord.id === wordId) {
        setSelectedWord((prev) => (prev ? { ...prev, topic: cleanTopic } : null));
      }
      setMessage(`Đã cập nhật chủ đề sang "${cleanTopic}"!`);
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error("Failed to update topic:", err);
      setMessage(`Lỗi cập nhật chủ đề: ${err}`);
    }
  };

  if (!selectedWord) return null;

  return (
    <aside className="w-full max-w-[540px] md:w-[500px] lg:w-[540px] xl:w-[580px] border-l border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950/95 backdrop-blur-2xl flex flex-col justify-between shrink-0 animate-in slide-in-from-right duration-200 z-30 shadow-2xl">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-semibold">
            Chi tiết từ vựng
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => requestDeleteWord(selectedWord.id, selectedWord.word, e)}
            title="Xoá từ"
            aria-label="Xoá từ"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSelectedWord(null)}
            aria-label="Đóng chi tiết từ vựng"
            title="Đóng"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Word & Pronunciation */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-3xl font-black text-slate-900 dark:text-white capitalize font-mono tracking-tight">
                  {selectedWord.word}
                </h2>
                {selectedWord.part_of_speech && (
                  <span className="text-xs font-mono uppercase px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-semibold">
                    {selectedWord.part_of_speech}
                  </span>
                )}
              </div>
              {selectedWord.phonetic && (
                <span className="text-sm font-mono text-cyan-700 dark:text-cyan-400 mt-1 inline-block">
                  {selectedWord.phonetic}
                </span>
              )}
            </div>
            <button
              onClick={() => handleSpeak(selectedWord.word)}
              className="px-3 py-2 rounded-xl bg-cyan-50 dark:bg-cyan-500/10 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/30 transition-colors flex items-center gap-2 text-xs font-medium shadow-sm"
            >
              <Volume2 className="w-4 h-4" />
              <span>Phát âm (US)</span>
            </button>
          </div>

          {/* Topic Classification & Reassignment */}
          <div className="p-3 rounded-2xl bg-slate-100/80 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
              <span className="text-xs font-mono text-slate-600 dark:text-zinc-400">Chủ đề:</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 dark:bg-cyan-950/70 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/60 shadow-sm">
                {selectedWord.topic || "General Tech"}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">Đổi:</span>
              <select
                value={selectedWord.topic || "General Tech"}
                onChange={(e) => handleUpdateTopic(selectedWord.id, e.target.value)}
                className="text-xs bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700/80 rounded-lg px-2.5 py-1 text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-cyan-500 cursor-pointer shadow-sm"
              >
                {PREDEFINED_TOPICS.map((top) => (
                  <option key={top} value={top}>
                    {top}
                  </option>
                ))}
                {selectedWord.topic &&
                  !PREDEFINED_TOPICS.includes(selectedWord.topic as any) && (
                    <option value={selectedWord.topic}>{selectedWord.topic}</option>
                  )}
              </select>
            </div>
          </div>

          {/* Vietnamese Meaning Card - Balanced readable font size */}
          <div className="p-3.5 rounded-2xl bg-slate-100/80 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 space-y-1.5 shadow-sm">
            <div className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-400 font-mono text-[11px] font-semibold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Ý nghĩa Tiếng Việt (Chuyên ngành & Đời sống)</span>
            </div>
            <p className="text-sm text-slate-800 dark:text-zinc-200 font-normal leading-relaxed">
              {selectedWord.meaning_vn}
            </p>
          </div>

          {/* Collocations Section */}
          {(() => {
            const colls = parseCollocations(selectedWord.collocations);
            if (colls.length === 0) return null;
            return (
              <div className="p-3.5 rounded-2xl bg-slate-100/80 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 space-y-2">
                <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Cụm từ thường gặp (Collocations):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {colls.map((c, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700/70 text-slate-800 dark:text-zinc-200 font-mono text-xs hover:border-cyan-500/50 transition-colors"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Synonyms & Antonyms with Click-to-Expand Sentences */}
        {(() => {
          const syns = parseTerms(selectedWord.synonyms);
          const ants = parseTerms(selectedWord.antonyms);

          return (
            <div className="space-y-5">
              {/* Synonyms Accordion */}
              {syns.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Từ đồng nghĩa (Synonyms):
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-500">
                      {syns.length} từ • click để xem phân tích
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    {syns.map((s, idx) => {
                      const isExpanded = !!expandedTerms[`syn-${s.word}`];
                      const hasExamples = s.examples && s.examples.length > 0;

                      return (
                        <div
                          key={idx}
                          className={`rounded-2xl border transition-all overflow-hidden ${isExpanded
                            ? "bg-emerald-50/40 dark:bg-zinc-900 border-emerald-400 dark:border-emerald-500/60 shadow-md shadow-emerald-500/5 ring-1 ring-emerald-500/20"
                            : "bg-slate-50 dark:bg-zinc-900/80 border-slate-200 dark:border-zinc-800 hover:border-emerald-400 dark:hover:border-emerald-500/40 hover:bg-slate-50/90 dark:hover:bg-zinc-900"
                            }`}
                        >
                          {/* Accordion Header */}
                          <div
                            onClick={() => toggleTermExpanded(`syn-${s.word}`)}
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

                          {/* Accordion Body: 2-3 Sentences with Structure & Why used */}
                          {isExpanded && (
                            <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-200 dark:border-zinc-800/80 space-y-3 animate-in slide-in-from-top-2 duration-150">
                              {hasExamples ? (
                                <div className="space-y-3 pt-2">
                                  {s.examples!.map((ex, exIdx) => (
                                    <div
                                      key={exIdx}
                                      className="p-3 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/90 space-y-2.5 text-xs shadow-sm"
                                    >
                                      {/* Câu tiếng Anh */}
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
                                          onClick={(e) => handleSpeak(ex.sentence_en, e)}
                                          title="Nghe câu"
                                          className="text-slate-400 hover:text-emerald-600 dark:text-zinc-500 dark:hover:text-emerald-400 p-0.5 rounded shrink-0"
                                        >
                                          <Volume2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>

                                      {/* 1. Ý nghĩa của câu */}
                                      {ex.meaning_vn && (
                                        <div className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/40 text-[11px] text-cyan-900 dark:text-cyan-200 leading-relaxed">
                                          <span className="font-bold text-cyan-700 dark:text-cyan-400 block mb-0.5">
                                            📖 Ý nghĩa của câu:
                                          </span>
                                          {ex.meaning_vn}
                                        </div>
                                      )}

                                      {/* 2. Cấu trúc câu */}
                                      {ex.structure && (
                                        <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-[11px] text-emerald-900 dark:text-emerald-200 font-mono leading-relaxed">
                                          <span className="font-bold text-emerald-700 dark:text-emerald-400 block mb-0.5 font-sans">
                                            🧩 Cấu trúc câu:
                                          </span>
                                          {ex.structure}
                                        </div>
                                      )}

                                      {/* 3. Giải thích vì sao lại dùng cấu trúc câu đó */}
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
                                  Từ này đã được tự động lưu vào thư viện từ vựng. Bạn có thể chọn từ này ở danh sách chính để xem toàn bộ thông tin chi tiết.
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

              {/* Antonyms Accordion */}
              {ants.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      Từ trái nghĩa (Antonyms):
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-500">
                      {ants.length} từ • click để xem phân tích
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    {ants.map((a, idx) => {
                      const isExpanded = !!expandedTerms[`ant-${a.word}`];
                      const hasExamples = a.examples && a.examples.length > 0;

                      return (
                        <div
                          key={idx}
                          className={`rounded-2xl border transition-all overflow-hidden ${isExpanded
                            ? "bg-rose-50/40 dark:bg-zinc-900 border-rose-400 dark:border-rose-500/60 shadow-md shadow-rose-500/5 ring-1 ring-rose-500/20"
                            : "bg-slate-50 dark:bg-zinc-900/80 border-slate-200 dark:border-zinc-800 hover:border-rose-400 dark:hover:border-rose-500/40 hover:bg-slate-50/90 dark:hover:bg-zinc-900"
                            }`}
                        >
                          {/* Accordion Header */}
                          <div
                            onClick={() => toggleTermExpanded(`ant-${a.word}`)}
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

                          {/* Accordion Body: 2-3 Sentences with Structure & Why used */}
                          {isExpanded && (
                            <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-200 dark:border-zinc-800/80 space-y-3 animate-in slide-in-from-top-2 duration-150">
                              {hasExamples ? (
                                <div className="space-y-3 pt-2">
                                  {a.examples!.map((ex, exIdx) => (
                                    <div
                                      key={exIdx}
                                      className="p-3 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/90 space-y-2.5 text-xs shadow-sm"
                                    >
                                      {/* Câu tiếng Anh */}
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
                                          onClick={(e) => handleSpeak(ex.sentence_en, e)}
                                          title="Nghe câu"
                                          className="text-slate-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 p-0.5 rounded shrink-0"
                                        >
                                          <Volume2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>

                                      {/* 1. Ý nghĩa của câu */}
                                      {ex.meaning_vn && (
                                        <div className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/40 text-[11px] text-cyan-900 dark:text-cyan-200 leading-relaxed">
                                          <span className="font-bold text-cyan-700 dark:text-cyan-400 block mb-0.5">
                                            📖 Ý nghĩa của câu:
                                          </span>
                                          {ex.meaning_vn}
                                        </div>
                                      )}

                                      {/* 2. Cấu trúc câu */}
                                      {ex.structure && (
                                        <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-[11px] text-rose-900 dark:text-rose-200 font-mono leading-relaxed">
                                          <span className="font-bold text-rose-700 dark:text-rose-400 block mb-0.5 font-sans">
                                            🧩 Cấu trúc câu:
                                          </span>
                                          {ex.structure}
                                        </div>
                                      )}

                                      {/* 3. Giải thích vì sao lại dùng cấu trúc câu đó */}
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
                                  Từ này đã được tự động lưu vào thư viện từ vựng. Bạn có thể chọn từ này ở danh sách chính để xem toàn bộ thông tin chi tiết.
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
        })()}

        {/* Realistic Code Snippet with Terminal Styling & Copy */}
        {selectedWord.code_snippet && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <Terminal className="w-4 h-4" />
                Đoạn mã ngữ cảnh (Code Snippet):
              </span>
              <button
                onClick={() => handleCopyCode(selectedWord.code_snippet!)}
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
              {/* macOS Terminal Titlebar */}
              <div className="bg-zinc-900/90 px-4 py-2 border-b border-zinc-800 flex items-center justify-between select-none">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 text-[10px] font-mono text-zinc-500">example.ts</span>
                </div>
                <span className="text-[10px] font-mono text-zinc-500">Developer Context</span>
              </div>
              {/* Monospace Code Body */}
              <pre className="p-4 text-xs font-mono text-zinc-200 overflow-x-auto leading-relaxed selection:bg-cyan-500/30 whitespace-pre">
                <code>{selectedWord.code_snippet}</code>
              </pre>
            </div>
          </div>
        )}

        {/* Coding Context Examples with Grammar & Syntax Analysis */}
        {selectedWord.examples.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <Code2 className="w-4 h-4" />
                Ví dụ & Phân tích cú pháp:
              </span>
              <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-500">
                {selectedWord.examples.length} câu ví dụ
              </span>
            </div>

            <div className="space-y-3.5">
              {selectedWord.examples.map((ex, idx) => (
                <div
                  key={ex.id || idx}
                  className="rounded-2xl bg-slate-50 dark:bg-zinc-950 p-4 border border-slate-200 dark:border-zinc-800/90 space-y-3 shadow-sm"
                >
                  {/* English sentence with pronounce button */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold text-xs shrink-0 mt-0.5">
                        #{idx + 1}
                      </span>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed">
                        {ex.sentence_en}
                      </p>
                    </div>
                    <button
                      onClick={() => handleSpeak(ex.sentence_en)}
                      title="Nghe cả câu"
                      className="text-slate-400 hover:text-cyan-600 dark:text-zinc-500 dark:hover:text-cyan-400 p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-900 transition-colors shrink-0"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Vietnamese translation */}
                  {ex.sentence_vn && (
                    <div className="p-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/50 text-xs text-cyan-950 dark:text-cyan-200 leading-relaxed">
                      <span className="font-semibold text-cyan-700 dark:text-cyan-400">Dịch nghĩa: </span>
                      {ex.sentence_vn}
                    </div>
                  )}

                  {/* Grammar & Syntax analysis */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-200 dark:border-zinc-900">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-amber-700 dark:text-amber-400 font-bold block">
                        Phân tích cú pháp (Grammar / Syntax):
                      </span>
                      <button
                        onClick={() => {
                          setSelectedWord(null);
                          setActiveTab("grammar");
                        }}
                        className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-sans font-medium"
                      >
                        <GraduationCap className="w-3 h-3" />
                        <span>Mở trung tâm ngữ pháp</span>
                      </button>
                    </div>
                    <div className="p-3 rounded-xl bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 text-xs font-mono text-slate-800 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap shadow-inner">
                      {ex.grammar_analysis}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SRS Review Metadata (FSRS) */}
        <div className="rounded-xl bg-slate-50 dark:bg-zinc-950 p-3.5 border border-slate-200 dark:border-zinc-800 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              Trí nhớ (FSRS)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/40 text-cyan-800 dark:text-cyan-300 font-mono font-medium">
              {selectedWord.srs.state === 2
                ? "Đã thuộc"
                : selectedWord.srs.state === 1
                  ? "Đang học"
                  : selectedWord.srs.state === 3
                    ? "Cần củng cố"
                    : "Từ mới"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm">
              <div className="font-bold text-slate-900 dark:text-white font-mono">
                {selectedWord.srs.stability && selectedWord.srs.stability > 0
                  ? `${selectedWord.srs.stability}d`
                  : `${selectedWord.srs.interval}d`}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-500">Độ bền (S)</div>
            </div>
            <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm">
              <div className="font-bold text-slate-900 dark:text-white font-mono">
                {selectedWord.srs.difficulty && selectedWord.srs.difficulty > 0
                  ? `${selectedWord.srs.difficulty}/10`
                  : "5.0/10"}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-500">Độ khó (D)</div>
            </div>
            <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm">
              <div className="font-bold text-slate-900 dark:text-white font-mono">
                {selectedWord.srs.repetitions}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-500">Số lần ôn</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
