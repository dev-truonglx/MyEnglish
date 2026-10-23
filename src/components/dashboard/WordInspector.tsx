import { useEffect, useRef, useState, type ReactNode } from "react";
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
  Snail,
  Brain,
  Lightbulb,
  History,
  PauseCircle,
  PlayCircle,
  Link2,
  Info,
} from "lucide-react";
import { updateWordTopic, PREDEFINED_TOPICS } from "@/services/db";
import { parseTerms, parseCollocations, type SRSReview, type TermWithMeaning, type WordDetail } from "@/types/database";
import { useWordsStore } from "@/stores/wordsStore";
import { getCatalogEntries, type CatalogEntry } from "@/services/vocabCatalog";
import { pipeline } from "@/services/pipeline";
import { handleSpeak, type DashboardTab } from "./shared";
import { SLOW_RATE } from "../review/speech";
import { AI_VOCAB_ENABLED } from "@/services/features";
import { pullMessage, pullWordFromDeck } from "@/services/vocabFeed";
import { WORD_STATUS_LABELS, wordStatus } from "@/services/wordStatus";
import { calculateRetrievability, isLeechWord } from "@/services/smartReview";
import { setWordSuspended } from "@/services/reviewRecorder";
import { releaseEasyMark } from "@/services/easyWords";
import { generateSmartMnemonic, getStoredMnemonic } from "@/services/aiMnemonic";
import { formatNextReviewRelative } from "@/utils/reviewSchedule";
import ReviewTrajectoryModal from "../review/ReviewTrajectoryModal";

interface WordInspectorProps {
  requestDeleteWord: (wordId: string, wordText: string, e?: React.MouseEvent) => void;
  expandedTerms: Record<string, boolean>;
  toggleTermExpanded: (termKey: string, e?: React.MouseEvent) => void;
  copiedSnippet: boolean;
  handleCopyCode: (code: string) => void;
  setActiveTab: (tab: DashboardTab) => void;
  setMessage: (msg: string | null) => void;
}

const STATE_LABEL: Record<number, string> = { 0: "Chưa học", 1: "Đang học", 2: "Đang ôn", 3: "Học lại" };

function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  } catch {
    return [];
  }
}

const dateVn = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const inStudy = (s: Partial<SRSReview> | null | undefined): s is SRSReview => !!s && (s.state ?? 0) > 0;

/** A titled block of the panel; `id` is the target of the section bar */
function Section({ id, icon, title, right, children }: { id: string; icon: ReactNode; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-2 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
          {icon}
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, sub, tone = "" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 min-w-0">
      <div className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">{label}</div>
      <div className={`text-base font-bold font-mono truncate ${tone || "text-slate-900 dark:text-white"}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">{sub}</div>}
    </div>
  );
}

/**
 * RIGHT SLIDE-OVER WORD DETAIL INSPECTOR (renders nothing when no word is selected). An overlay above the
 * page, so it never squeezes the main content; MainDashboard closes it on a tab change or a session start.
 * Everything known about the word, in order: how to say it, its meanings, examples, related words, a memory
 * hook, and its two memory cards (recognise the meaning / recall the word) with their schedules and history.
 */
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
  const allWords = useWordsStore((s) => s.words);
  const inDeck = (term: string) => allWords.some((w) => w.word.trim().toLowerCase() === term.trim().toLowerCase());
  const scrollRef = useRef<HTMLDivElement>(null);

  const [catalogEntry, setCatalogEntry] = useState<CatalogEntry | null>(null);
  useEffect(() => {
    let cancelled = false;
    setCatalogEntry(null);
    if (!selectedWord?.catalog_id) return;
    getCatalogEntries([selectedWord.catalog_id])
      .then(([e]) => !cancelled && setCatalogEntry(e ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedWord?.catalog_id]);

  // Memory hook: the saved one, or one made on request (algorithmic, no AI needed)
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  useEffect(() => {
    setMnemonic(selectedWord ? getStoredMnemonic(selectedWord.id, selectedWord.meaning_vn) : null);
    setShowHistory(false);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [selectedWord?.id]);

  /** Related terms are not added automatically (that bypassed the daily new-word limit); the learner chooses */
  const addRelatedTerm = (term: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!AI_VOCAB_ENABLED) {
      pullWordFromDeck(term)
        .then((r) => setMessage(pullMessage(r)))
        .catch(() => {});
      return;
    }
    pipeline.enqueue(term).then((res) =>
      setMessage(res.accepted ? `Đã thêm "${term}" vào sổ từ, AI đang phân tích...` : `Không thể thêm "${term}": ${res.reason}`)
    );
  };

  const patchWord = (id: string, patch: Partial<WordDetail>) => {
    setWords((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
    setSelectedWord((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  };

  const handleUpdateTopic = async (wordId: string, newTopic: string) => {
    const cleanTopic = newTopic.trim() || "General Tech";
    try {
      await updateWordTopic(wordId, cleanTopic);
      patchWord(wordId, { topic: cleanTopic });
      setMessage(`Đã cập nhật chủ đề sang "${cleanTopic}"!`);
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error("Failed to update topic:", err);
      setMessage(`Lỗi cập nhật chủ đề: ${err}`);
    }
  };

  const toggleSuspended = async (w: WordDetail) => {
    const on = !w.suspended;
    try {
      await setWordSuspended(w.id, on);
      // Resumed: a word set aside as too easy is no longer (a later suspension is not taken for one)
      if (!on) await releaseEasyMark(w.id).catch(() => {});
      patchWord(w.id, { suspended: on ? 1 : 0 });
      setMessage(on ? `Đã tạm ngưng "${w.word}": từ này không được hỏi lại cho đến khi bạn bật lại` : `Đã đưa "${w.word}" trở lại lịch ôn`);
    } catch (err) {
      setMessage(`Không đổi được trạng thái: ${err}`);
    }
  };

  if (!selectedWord) return null;
  const w = selectedWord;
  const status = wordStatus(w);
  const now = new Date();
  const leech = isLeechWord(w);
  const lapses = Math.max(w.srs?.lapses ?? 0, w.srsProduction?.lapses ?? 0);
  const studied = [w.srs, w.srsProduction].filter(inStudy);
  const recall = studied.length > 0 ? Math.min(...studied.map((s) => calculateRetrievability(s, now))) : null;
  const nextTimes = studied.map((s) => new Date(s.next_review_date).getTime()).filter(Number.isFinite);
  const nextAt = nextTimes.length > 0 ? new Date(Math.min(...nextTimes)) : null;
  const next = nextAt ? formatNextReviewRelative(nextAt, false, now) : null;
  const stats = w.stats;

  const ipaUs = catalogEntry?.ipaUs.length ? catalogEntry.ipaUs : w.phonetic ? [w.phonetic] : [];
  const ipaUk = catalogEntry?.ipaUk ?? [];
  const senses = catalogEntry?.senses ?? [];
  const posList = senses.length > 0 ? Array.from(new Set(senses.map((s) => s.pos))) : w.part_of_speech ? [w.part_of_speech] : [];
  const variants = Array.from(new Set([...(catalogEntry?.variants ?? []), ...parseList(w.variants)]));
  const forms = Array.from(new Set([...(catalogEntry?.irregular ?? []), ...parseList(w.forms)])).filter(
    (f) => f.toLowerCase() !== w.word.toLowerCase()
  );
  const colls = parseCollocations(w.collocations);
  const syns = parseTerms(w.synonyms);
  const ants = parseTerms(w.antonyms);
  const cefr = catalogEntry?.cefr ?? w.cefr_level ?? null;

  const nav: Array<[string, string]> = [
    ["wi-meaning", "Nghĩa"],
    ...(w.examples.length > 0 ? ([["wi-examples", `Ví dụ (${w.examples.length})`]] as Array<[string, string]>) : []),
    ...(colls.length + syns.length + ants.length > 0 ? ([["wi-related", "Từ liên quan"]] as Array<[string, string]>) : []),
    ["wi-mnemonic", "Mẹo nhớ"],
    ...(w.code_snippet ? ([["wi-code", "Đoạn mã"]] as Array<[string, string]>) : []),
    ["wi-memory", "Trí nhớ & lịch ôn"],
    ["wi-info", "Thông tin"],
  ];
  const jump = (id: string) => scrollRef.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={`Chi tiết từ ${w.word}`}>
      {/* Dimmed page behind: a click closes the panel */}
      <div
        aria-hidden="true"
        onClick={() => setSelectedWord(null)}
        className="absolute inset-0 bg-slate-900/25 dark:bg-black/55 animate-in fade-in duration-150"
      />
      <aside className="relative h-full w-full max-w-[640px] md:w-[580px] lg:w-[640px] border-l border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 flex flex-col animate-in slide-in-from-right duration-200 shadow-2xl">
        {/* ── Header: the word, how to say it, where it stands ── */}
        <div className="shrink-0 border-b border-slate-200 dark:border-zinc-800 bg-gradient-to-b from-cyan-50/70 to-white dark:from-cyan-950/20 dark:to-zinc-950">
          <div className="px-5 pt-4 pb-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                  <BookOpen className="w-3.5 h-3.5 text-cyan-500" /> Chi tiết từ vựng
                </div>
                <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight break-words select-text">{w.word}</h2>
                <div className="flex flex-wrap items-center gap-1.5">
                  {posList.map((p) => (
                    <span
                      key={p}
                      className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-semibold"
                    >
                      {p}
                    </span>
                  ))}
                  {cefr && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-cyan-100 dark:bg-cyan-950/70 text-cyan-800 dark:text-cyan-300">{cefr}</span>
                  )}
                  {catalogEntry && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                      Oxford {catalogEntry.list}
                    </span>
                  )}
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                    {WORD_STATUS_LABELS[status]}
                  </span>
                  {leech && <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-rose-600 text-white">Từ khó</span>}
                  {!!w.suspended && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">Đang tạm ngưng</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={(e) => requestDeleteWord(w.id, w.word, e)}
                  title="Xoá từ"
                  aria-label="Xoá từ"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedWord(null)}
                  aria-label="Đóng chi tiết từ vựng"
                  title="Đóng (Esc)"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Pronunciation: US and UK IPA, normal and slow */}
            <div className="flex flex-wrap items-center gap-2 text-xs select-text">
              {ipaUs.length > 0 && (
                <span className="font-mono text-slate-700 dark:text-zinc-200">
                  <span className="text-[10px] font-sans font-bold text-slate-400 dark:text-zinc-500 mr-1">US</span>
                  {ipaUs.join(", ")}
                </span>
              )}
              {ipaUk.length > 0 && ipaUk.join() !== ipaUs.join() && (
                <span className="font-mono text-slate-700 dark:text-zinc-200">
                  <span className="text-[10px] font-sans font-bold text-slate-400 dark:text-zinc-500 mr-1">UK</span>
                  {ipaUk.join(", ")}
                </span>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  onClick={() => handleSpeak(w.word)}
                  className="px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-semibold inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Volume2 className="w-3.5 h-3.5" /> Nghe
                </button>
                <button
                  onClick={() => handleSpeak(w.word, SLOW_RATE)}
                  title="Nghe chậm"
                  className="px-2.5 py-1.5 rounded-lg border border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 inline-flex items-center gap-1.5"
                >
                  <Snail className="w-3.5 h-3.5" /> Chậm
                </button>
              </div>
            </div>

            {/* Four numbers at a glance */}
            <div className="grid grid-cols-4 gap-2">
              <Stat
                label="Nhớ lúc này"
                value={recall == null ? "—" : `${Math.round(recall * 100)}%`}
                tone={
                  recall == null
                    ? ""
                    : recall >= 0.85
                      ? "text-emerald-600 dark:text-emerald-400"
                      : recall >= 0.7
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-rose-600 dark:text-rose-400"
                }
                sub={recall == null ? "chưa học" : "thẻ yếu hơn"}
              />
              <Stat
                label="Ôn tiếp"
                value={w.suspended ? "—" : next ? (next.diffMs <= 0 ? "Đến hạn" : next.shortLabel) : "—"}
                tone={next && next.diffMs <= 0 && !w.suspended ? "text-rose-600 dark:text-rose-400" : ""}
                sub={w.suspended ? "đang tạm ngưng" : nextAt ? dateVn(nextAt.toISOString()) : "chưa có lịch"}
              />
              <Stat
                label="Đúng / sai"
                value={stats && stats.totalAttempts > 0 ? `${stats.correctCount}/${stats.wrongCount}` : "—"}
                sub={stats && stats.totalAttempts > 0 ? `${stats.accuracy}% chính xác` : "chưa trả lời"}
              />
              <Stat label="Đã quên" value={`${lapses} lần`} tone={lapses >= 2 ? "text-rose-600 dark:text-rose-400" : ""} sub={leech ? "từ khó" : " "} />
            </div>
          </div>

          {/* Section bar: jump to any part of the panel */}
          <nav className="px-5 pb-2.5 flex flex-wrap gap-1" aria-label="Các phần chi tiết">
            {nav.map(([id, label]) => (
              <button
                key={id}
                onClick={() => jump(id)}
                className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-600 dark:text-zinc-300 bg-white/70 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors"
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Content: meanings, examples and messages can be selected and copied ── */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-5 space-y-7 select-text">
          {/* Meaning: the short one, then every sense of the dictionary entry */}
          <Section id="wi-meaning" icon={<Sparkles className="w-3.5 h-3.5 text-cyan-500" />} title="Nghĩa tiếng Việt">
            <p className="text-base text-slate-900 dark:text-zinc-100 leading-relaxed font-medium">{w.meaning_vn}</p>
            {senses.length > 1 && (
              <ol className="space-y-1.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-3">
                {senses.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-800 dark:text-zinc-200">
                    <span className="font-mono text-[11px] text-slate-400 dark:text-zinc-500 w-4 shrink-0 pt-0.5">{i + 1}.</span>
                    <span className="text-[11px] font-mono text-purple-700 dark:text-purple-300 shrink-0 pt-0.5 w-14">{s.pos}</span>
                    <span>{s.vn}</span>
                  </li>
                ))}
              </ol>
            )}
            {(forms.length > 0 || variants.length > 0) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-zinc-300">
                {forms.length > 0 && (
                  <span>
                    <span className="text-slate-400 dark:text-zinc-500">Dạng khác: </span>
                    <span className="font-mono">{forms.join(", ")}</span>
                  </span>
                )}
                {variants.length > 0 && (
                  <span>
                    <span className="text-slate-400 dark:text-zinc-500">Cách viết khác: </span>
                    <span className="font-mono">{variants.join(", ")}</span>
                  </span>
                )}
              </div>
            )}
          </Section>

          {/* Examples: sense, sentence, translation, grammar */}
          {w.examples.length > 0 && (
            <Section
              id="wi-examples"
              icon={<Code2 className="w-3.5 h-3.5 text-cyan-500" />}
              title="Câu ví dụ"
              right={<span className="text-[11px] text-slate-400 dark:text-zinc-500">{w.examples.length} câu</span>}
            >
              <div className="space-y-3">
                {w.examples.map((ex, idx) => {
                  const sense = ex.sense_index != null ? senses[ex.sense_index] : undefined;
                  const source =
                    ex.source === "user_context" ? "Câu bạn gặp" : ex.source === "catalog" ? "Oxford" : ex.source === "ai" || !ex.source ? "AI viết" : ex.source;
                  return (
                    <div key={ex.id || idx} className="rounded-xl bg-slate-50 dark:bg-zinc-900 p-3.5 border border-slate-200 dark:border-zinc-800 space-y-2">
                      <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                        <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">#{idx + 1}</span>
                        {sense && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300">
                            {sense.pos} · {sense.vn}
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">{source}</span>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed">{ex.sentence_en}</p>
                        <button
                          onClick={() => handleSpeak(ex.sentence_en)}
                          title="Nghe cả câu"
                          className="text-slate-400 hover:text-cyan-600 dark:text-zinc-500 dark:hover:text-cyan-400 p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 shrink-0"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {ex.sentence_vn && <p className="text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">{ex.sentence_vn}</p>}
                      {ex.grammar_analysis && ex.grammar_analysis.trim() && (
                        <div className="pt-2 border-t border-slate-200 dark:border-zinc-800">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">Phân tích câu</div>
                          <p className="text-xs font-mono text-slate-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">{ex.grammar_analysis}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => {
                  setSelectedWord(null);
                  setActiveTab("grammar");
                }}
                className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline inline-flex items-center gap-1"
              >
                <GraduationCap className="w-3 h-3" /> Mở trung tâm ngữ pháp
              </button>
            </Section>
          )}

          {/* Collocations, synonyms, antonyms */}
          {colls.length + syns.length + ants.length > 0 && (
            <Section id="wi-related" icon={<Link2 className="w-3.5 h-3.5 text-cyan-500" />} title="Từ liên quan">
              {colls.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-600 dark:text-zinc-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-500" /> Cụm từ thường gặp
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {colls.map((c, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/70 text-slate-800 dark:text-zinc-200 font-mono text-xs"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {syns.length > 0 && (
                <TermList
                  kind="syn"
                  title="Từ đồng nghĩa"
                  terms={syns}
                  expandedTerms={expandedTerms}
                  toggle={toggleTermExpanded}
                  inDeck={inDeck}
                  onAdd={addRelatedTerm}
                />
              )}
              {ants.length > 0 && (
                <TermList
                  kind="ant"
                  title="Từ trái nghĩa"
                  terms={ants}
                  expandedTerms={expandedTerms}
                  toggle={toggleTermExpanded}
                  inDeck={inDeck}
                  onAdd={addRelatedTerm}
                />
              )}
            </Section>
          )}

          {/* Memory hook */}
          <Section id="wi-mnemonic" icon={<Lightbulb className="w-3.5 h-3.5 text-amber-500" />} title="Mẹo nhớ">
            {mnemonic ? (
              <p className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-sm text-amber-900 dark:text-amber-100 leading-relaxed">
                {mnemonic}
              </p>
            ) : (
              <button
                onClick={() => {
                  const id = w.id;
                  generateSmartMnemonic(w).then((m) => useWordsStore.getState().selectedWord?.id === id && setMnemonic(m));
                }}
                className="px-3 py-2 rounded-xl border border-dashed border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-50 dark:hover:bg-amber-950/30"
              >
                Tạo mẹo nhớ cho từ này
              </button>
            )}
          </Section>

          {/* Code snippet (words added with one) */}
          {w.code_snippet && (
            <Section
              id="wi-code"
              icon={<Terminal className="w-3.5 h-3.5 text-cyan-500" />}
              title="Đoạn mã ngữ cảnh"
              right={
                <button
                  onClick={() => handleCopyCode(w.code_snippet!)}
                  className="text-[11px] text-slate-600 hover:text-cyan-600 dark:text-zinc-400 dark:hover:text-cyan-300 flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800"
                >
                  {copiedSnippet ? (
                    <>
                      <CheckCircle className="w-3 h-3 text-emerald-500" /> Đã sao chép
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Sao chép
                    </>
                  )}
                </button>
              }
            >
              <pre className="rounded-xl bg-[#0d1117] p-4 text-xs font-mono text-zinc-200 overflow-x-auto leading-relaxed whitespace-pre border border-zinc-800">
                <code>{w.code_snippet}</code>
              </pre>
            </Section>
          )}

          {/* The two memory cards and their schedules */}
          <Section
            id="wi-memory"
            icon={<Brain className="w-3.5 h-3.5 text-violet-500" />}
            title="Trí nhớ & lịch ôn"
            right={
              <button onClick={() => setShowHistory(true)} className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline inline-flex items-center gap-1">
                <History className="w-3 h-3" /> Lịch sử ôn
              </button>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <MemoryCard title="Nhận ra nghĩa" hint="Thấy từ tiếng Anh, chọn hoặc nhớ nghĩa" srs={w.srs} now={now} suspended={!!w.suspended} />
              <MemoryCard
                title="Tự nhớ ra từ"
                hint="Thấy nghĩa, tự gõ ra từ tiếng Anh"
                srs={w.srsProduction ?? null}
                now={now}
                suspended={!!w.suspended}
                emptyText="Chưa mở: thẻ này mở khi bạn nhận ra nghĩa vững (khoảng 3 ngày trở lên)."
              />
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500">
              Độ bền: số ngày trí nhớ còn giữ được ở mức tốt. Độ khó: 1 (dễ) đến 10 (khó). Nhớ lúc này: khả năng bạn còn nhớ ngay bây giờ.
            </p>
            <button
              onClick={() => toggleSuspended(w)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                w.suspended
                  ? "border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  : "border-slate-300 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
              }`}
            >
              {w.suspended ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
              {w.suspended ? "Ôn lại từ này" : "Tạm ngưng ôn từ này"}
            </button>
          </Section>

          {/* Where the word comes from */}
          <Section id="wi-info" icon={<Info className="w-3.5 h-3.5 text-slate-400" />} title="Thông tin">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              <dt className="text-slate-400 dark:text-zinc-500">Ngày thêm</dt>
              <dd className="text-slate-700 dark:text-zinc-200">{dateVn(w.created_at)}</dd>
              <dt className="text-slate-400 dark:text-zinc-500">Nguồn</dt>
              <dd className="text-slate-700 dark:text-zinc-200">{w.catalog_id ? `Bộ từ Oxford ${catalogEntry?.list ?? ""}`.trim() : "Bạn tự thêm"}</dd>
              {catalogEntry?.it && (
                <>
                  <dt className="text-slate-400 dark:text-zinc-500">Nhóm</dt>
                  <dd className="text-slate-700 dark:text-zinc-200">Từ hay dùng trong IT (được học trước)</dd>
                </>
              )}
              {stats && stats.totalAttempts > 0 && (
                <>
                  <dt className="text-slate-400 dark:text-zinc-500">Đã trả lời</dt>
                  <dd className="text-slate-700 dark:text-zinc-200">
                    {stats.totalAttempts} lần · {stats.correctCount} đúng · {stats.wrongCount} sai ({stats.accuracy}%)
                  </dd>
                </>
              )}
            </dl>
            {!w.catalog_id && (
              <div className="flex items-center gap-2 text-xs">
                <Tag className="w-3.5 h-3.5 text-cyan-500" />
                <span className="text-slate-500 dark:text-zinc-400">Chủ đề</span>
                <select
                  value={w.topic || "General Tech"}
                  onChange={(e) => handleUpdateTopic(w.id, e.target.value)}
                  className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg px-2 py-1 text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-cyan-500"
                >
                  {PREDEFINED_TOPICS.map((top) => (
                    <option key={top} value={top}>
                      {top}
                    </option>
                  ))}
                  {w.topic && !PREDEFINED_TOPICS.includes(w.topic as (typeof PREDEFINED_TOPICS)[number]) && <option value={w.topic}>{w.topic}</option>}
                </select>
              </div>
            )}
          </Section>
        </div>
      </aside>

      <ReviewTrajectoryModal isOpen={showHistory} onClose={() => setShowHistory(false)} word={w} />
    </div>
  );
}

/** One of the word's two memory cards: state, stability, difficulty, reviews, lapses, last and next review */
function MemoryCard({
  title,
  hint,
  srs,
  now,
  suspended,
  emptyText = "Chưa học",
}: {
  title: string;
  hint: string;
  srs: SRSReview | null;
  now: Date;
  suspended: boolean;
  emptyText?: string;
}) {
  const studied = inStudy(srs);
  const r = studied ? Math.round(calculateRetrievability(srs, now) * 100) : null;
  const next = studied ? formatNextReviewRelative(srs.next_review_date, false, now) : null;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900 dark:text-white">{title}</div>
          <div className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">{hint}</div>
        </div>
        {studied && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 shrink-0">
            {STATE_LABEL[srs.state ?? 0]}
          </span>
        )}
      </div>
      {!studied ? (
        <p className="text-xs text-slate-500 dark:text-zinc-400">{emptyText}</p>
      ) : (
        <>
          {r != null && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${r >= 85 ? "bg-emerald-500" : r >= 70 ? "bg-amber-500" : "bg-rose-500"}`}
                  style={{ width: `${r}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">nhớ {r}%</span>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <dt className="text-slate-400 dark:text-zinc-500">Độ bền</dt>
            <dd className="font-mono text-slate-800 dark:text-zinc-200 text-right">{(srs.stability ?? 0).toFixed(1)} ngày</dd>
            <dt className="text-slate-400 dark:text-zinc-500">Độ khó</dt>
            <dd className="font-mono text-slate-800 dark:text-zinc-200 text-right">{(srs.difficulty ?? 0).toFixed(1)}/10</dd>
            <dt className="text-slate-400 dark:text-zinc-500">Số lần ôn</dt>
            <dd className="font-mono text-slate-800 dark:text-zinc-200 text-right">{srs.reps ?? srs.repetitions ?? 0}</dd>
            <dt className="text-slate-400 dark:text-zinc-500">Số lần quên</dt>
            <dd className={`font-mono text-right ${(srs.lapses ?? 0) >= 2 ? "text-rose-600 dark:text-rose-400" : "text-slate-800 dark:text-zinc-200"}`}>
              {srs.lapses ?? 0}
            </dd>
            <dt className="text-slate-400 dark:text-zinc-500">Ôn gần nhất</dt>
            <dd className="text-slate-800 dark:text-zinc-200 text-right">{dateVn(srs.last_review)}</dd>
            <dt className="text-slate-400 dark:text-zinc-500">Ôn tiếp</dt>
            <dd className="text-right">
              {suspended ? (
                <span className="text-slate-400 dark:text-zinc-500">tạm ngưng</span>
              ) : next ? (
                <span title={next.exactDateStr} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${next.badgeClass.replace("animate-pulse", "")}`}>
                  {next.diffMs <= 0 ? next.label : `${next.label}`}
                </span>
              ) : (
                "—"
              )}
            </dd>
          </dl>
        </>
      )}
    </div>
  );
}

/** Synonyms or antonyms: each term with its IPA, meaning, a way to add it, and its example sentences on click */
function TermList({
  kind,
  title,
  terms,
  expandedTerms,
  toggle,
  inDeck,
  onAdd,
}: {
  kind: "syn" | "ant";
  title: string;
  terms: TermWithMeaning[];
  expandedTerms: Record<string, boolean>;
  toggle: (key: string, e?: React.MouseEvent) => void;
  inDeck: (term: string) => boolean;
  onAdd: (term: string, e?: React.MouseEvent) => void;
}) {
  const tone =
    kind === "syn"
      ? { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-400 dark:border-emerald-500/60" }
      : { dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-300", border: "border-rose-400 dark:border-rose-500/60" };
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-slate-600 dark:text-zinc-300 flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${tone.dot}`} /> {title} <span className="text-slate-400 dark:text-zinc-500 font-normal">({terms.length})</span>
      </div>
      <div className="space-y-1.5">
        {terms.map((t, idx) => {
          const key = `${kind}-${t.word}`;
          const open = !!expandedTerms[key];
          const examples = t.examples ?? [];
          return (
            <div
              key={idx}
              className={`rounded-xl border bg-slate-50 dark:bg-zinc-900 overflow-hidden ${open ? tone.border : "border-slate-200 dark:border-zinc-800"}`}
            >
              <div
                onClick={() => examples.length > 0 && toggle(key)}
                className={`px-3 py-2 flex items-start justify-between gap-2 ${examples.length > 0 ? "cursor-pointer" : ""}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-mono text-sm font-bold ${tone.text}`}>{t.word}</span>
                    {t.phonetic && <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">{t.phonetic}</span>}
                    <button
                      onClick={(e) => handleSpeak(t.word, e)}
                      title="Phát âm"
                      className="text-slate-400 hover:text-cyan-600 dark:text-zinc-500 dark:hover:text-cyan-400 p-0.5 rounded"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                    {inDeck(t.word) ? (
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500">đã có trong sổ</span>
                    ) : (
                      <button
                        onClick={(e) => onAdd(t.word, e)}
                        title="Thêm từ này vào sổ để học"
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-slate-300 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
                      >
                        + Thêm vào sổ
                      </button>
                    )}
                  </div>
                  {t.meaning_vn && <p className="text-xs text-slate-600 dark:text-zinc-300 mt-0.5">{t.meaning_vn}</p>}
                </div>
                {examples.length > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-zinc-500 shrink-0">
                    {examples.length} ví dụ
                    {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </span>
                )}
              </div>
              {open && examples.length > 0 && (
                <div className="px-3 pb-3 space-y-2 border-t border-slate-200 dark:border-zinc-800 pt-2">
                  {examples.map((ex, i) => (
                    <div key={i} className="text-xs space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-slate-900 dark:text-white">{ex.sentence_en}</p>
                        <button onClick={(e) => handleSpeak(ex.sentence_en, e)} title="Nghe câu" className="text-slate-400 hover:text-cyan-600 p-0.5 shrink-0">
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {ex.meaning_vn && <p className="text-slate-600 dark:text-zinc-300">{ex.meaning_vn}</p>}
                      {ex.structure && <p className="font-mono text-[11px] text-slate-500 dark:text-zinc-400">Cấu trúc: {ex.structure}</p>}
                      {ex.why_used && <p className="text-[11px] text-amber-700 dark:text-amber-400">Vì sao: {ex.why_used}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
