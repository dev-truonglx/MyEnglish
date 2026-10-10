import { useCallback, useEffect, useState } from "react";
import { Check, Eye, Layers, Loader2, Search, Volume2, Zap } from "lucide-react";
import {
  CATALOG_LEVEL_COUNTS,
  STUDY_LEVELS,
  ensureCatalogSeeded,
  searchCatalog,
  type CatalogEntry,
  type StudyLevel,
} from "@/services/vocabCatalog";
import {
  changeStudyLevels,
  getStudyLevels,
  learnEarly,
  loadLevelProgress,
  markCatalogWordsKnown,
  nextUnstudiedEntries,
  type LevelProgress,
} from "@/services/vocabFeed";
import { useWordsStore } from "@/stores/wordsStore";
import { PAGE_CONTAINER, handleSpeak } from "./shared";

const LEVEL_NAMES: Record<StudyLevel, string> = {
  A1: "Mới bắt đầu",
  A2: "Cơ bản",
  B1: "Trung cấp",
  B2: "Khá",
  C1: "Thành thạo",
};

/**
 * Levels to study: A1 is always on; choosing a level also takes every level below it (learning starts at
 * A1). The chosen levels are mixed, lower levels more often.
 */
export function LevelPicker({ value, onChange, disabled }: { value: StudyLevel[]; onChange: (levels: StudyLevel[]) => void; disabled?: boolean }) {
  const top = value.length - 1;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {STUDY_LEVELS.map((level, i) => {
        const on = i <= top;
        return (
          <button
            key={level}
            type="button"
            disabled={disabled}
            onClick={() => onChange(STUDY_LEVELS.slice(0, i === top && i > 0 ? i : i + 1))}
            className={`text-left p-3 rounded-xl border transition-all disabled:opacity-60 ${
              on
                ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-500/10 ring-1 ring-cyan-500"
                : "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"
            }`}
          >
            <span className="flex items-center justify-between">
              <span className="font-bold text-sm text-slate-900 dark:text-white">{level}</span>
              {on && <Check className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />}
            </span>
            <span className="block text-[11px] text-slate-500 dark:text-zinc-400">{LEVEL_NAMES[level]}</span>
            <span className="block text-[11px] font-mono text-slate-400 dark:text-zinc-500">{CATALOG_LEVEL_COUNTS[level]} từ</span>
          </button>
        );
      })}
    </div>
  );
}

export function mixDescription(levels: StudyLevel[]): string {
  if (levels.length === 1) return "Học các từ A1, từ IT trước, rồi theo độ phổ biến.";
  const ratio = levels.map((_, i) => levels.length - i).join(":");
  return `Từ mới trộn các cấp ${levels.join(", ")} theo tỉ lệ ${ratio} (cấp thấp nhiều hơn). Trong mỗi cấp, từ IT học trước.`;
}

function useLevelProgress() {
  const [progress, setProgress] = useState<LevelProgress[] | null>(null);
  const reload = useCallback(() => {
    loadLevelProgress().then(setProgress).catch(() => setProgress(null));
  }, []);
  useEffect(() => {
    reload();
    window.addEventListener("words-changed", reload);
    window.addEventListener("myenglish-study-levels-changed", reload);
    return () => {
      window.removeEventListener("words-changed", reload);
      window.removeEventListener("myenglish-study-levels-changed", reload);
    };
  }, [reload]);
  return { progress, reload };
}

function ProgressBars({ progress, levels }: { progress: LevelProgress[]; levels: StudyLevel[] }) {
  return (
    <div className="space-y-2.5">
      {progress
        .filter((p) => levels.includes(p.level))
        .map((p) => {
          const pct = (n: number) => `${Math.min(100, Math.round((n * 100) / Math.max(1, p.total)))}%`;
          return (
            <div key={p.level} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800 dark:text-zinc-200">
                  {p.level} · {LEVEL_NAMES[p.level]}
                </span>
                <span className="text-slate-500 dark:text-zinc-400">
                  {p.met}/{p.total} đã gặp · {p.remembered} nhớ lâu{p.known > 0 ? ` · ${p.known} đã biết` : ""}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-cyan-300 dark:bg-cyan-800" style={{ width: pct(p.met) }} />
                <div className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: pct(p.remembered) }} />
              </div>
            </div>
          );
        })}
    </div>
  );
}

/** The next level to open once the chosen ones have nothing left */
function finishedAll(progress: LevelProgress[], levels: StudyLevel[]): boolean {
  return levels.every((l) => {
    const p = progress.find((x) => x.level === l);
    return p ? p.met >= p.total : false;
  });
}

/** Today screen: progress of the chosen levels, and the next level once they are all met */
export function TodayLevelCard({ onOpen }: { onOpen: () => void }) {
  const { progress } = useLevelProgress();
  const levels = getStudyLevels();
  if (!progress) return null;
  const next = STUDY_LEVELS[levels.length];
  const done = finishedAll(progress, levels);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-zinc-200">
          <Layers className="w-4 h-4 text-cyan-500" /> Lộ trình từ vựng Oxford
        </span>
        <button onClick={onOpen} className="text-xs font-medium text-cyan-700 dark:text-cyan-300 hover:underline">
          Đổi cấp · Lướt từ đã biết
        </button>
      </div>
      <ProgressBars progress={progress} levels={levels} />
      {done && next && (
        <button
          onClick={() => changeStudyLevels([...levels, next])}
          className="w-full px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
        >
          Bạn đã học hết {levels.join(", ")} 🎉 Mở thêm {next}
        </button>
      )}
    </div>
  );
}

function Skim({ levels, onChanged }: { levels: StudyLevel[]; onChanged: () => void }) {
  const [level, setLevel] = useState<StudyLevel>(levels[0]);
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!levels.includes(level)) setLevel(levels[0]);
  }, [levels, level]);

  const load = useCallback(() => {
    setEntries(null);
    setPicked(new Set());
    setShown(new Set());
    nextUnstudiedEntries(level, 30).then(setEntries).catch(() => setEntries([]));
  }, [level]);
  useEffect(load, [load]);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const markKnown = async () => {
    setBusy(true);
    try {
      const n = await markCatalogWordsKnown([...picked]);
      setMessage(`Đã đánh dấu ${n} từ là đã biết. Mỗi từ sẽ được hỏi lại một lần sau khoảng một tuần để chắc chắn.`);
      onChanged();
      load();
    } catch (err) {
      setMessage(`Không đánh dấu được: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {levels.map((l) => (
          <button
            key={l}
            onClick={() => setLevel(l)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
              l === level
                ? "bg-cyan-600 text-white border-cyan-600"
                : "bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700"
            }`}
          >
            {l}
          </button>
        ))}
        {entries && entries.length > 0 && (
          <button
            onClick={() => setPicked(picked.size === entries.length ? new Set() : new Set(entries.map((e) => e.id)))}
            className="ml-auto text-xs font-medium text-cyan-700 dark:text-cyan-300 hover:underline"
          >
            {picked.size === entries.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
          </button>
        )}
      </div>
      {!entries ? (
        <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải…
        </p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-zinc-400">Bạn đã gặp hết các từ {level}.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {entries.map((e) => (
            <div
              key={e.id}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-sm ${
                picked.has(e.id)
                  ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                  : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
              }`}
            >
              <input
                type="checkbox"
                checked={picked.has(e.id)}
                onChange={() => setPicked((s) => toggle(s, e.id))}
                aria-label={`Đã biết ${e.word}`}
                className="accent-emerald-600"
              />
              <button onClick={() => handleSpeak(e.word)} title="Nghe" className="text-slate-400 hover:text-cyan-600">
                <Volume2 className="w-3.5 h-3.5" />
              </button>
              <span className="font-semibold text-slate-900 dark:text-white">{e.word}</span>
              <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 truncate">{e.ipaUs[0] ?? e.ipaUk[0]}</span>
              {shown.has(e.id) ? (
                <span className="ml-auto text-xs text-slate-600 dark:text-zinc-300 truncate" title={e.vn}>
                  {e.vn}
                </span>
              ) : (
                <button
                  onClick={() => setShown((s) => toggle(s, e.id))}
                  className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-cyan-600"
                >
                  <Eye className="w-3 h-3" /> nghĩa
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <button
        onClick={markKnown}
        disabled={picked.size === 0 || busy}
        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold inline-flex items-center gap-2"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Đánh dấu {picked.size} từ đã biết
      </button>
      {message && <p className="text-xs text-emerald-700 dark:text-emerald-400">{message}</p>}
    </div>
  );
}

function CatalogSearch({ onChanged }: { onChanged: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchCatalog(q, 30).then(setResults).catch(() => setResults([]));
    }, 150);
    return () => clearTimeout(t);
  }, [query]);

  const early = async (e: CatalogEntry) => {
    const res = await learnEarly(e.id);
    setMessage(
      res === "studied"
        ? `"${e.word}" đã có trong sổ từ của bạn.`
        : `"${e.word}" sẽ là từ mới tiếp theo trong buổi học tới.`
    );
    onChanged();
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus-within:border-cyan-500">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm trong 5.004 từ Oxford (ví dụ: deploy, meeting)…"
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-zinc-100 focus:outline-none"
        />
      </label>
      {query.trim() && results.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-zinc-400">Không có trong bộ Oxford 5000.</p>
      )}
      <div className="space-y-1.5">
        {results.map((e) => (
          <div key={e.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <button onClick={() => handleSpeak(e.word)} title="Nghe" className="text-slate-400 hover:text-cyan-600">
              <Volume2 className="w-4 h-4" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-sm text-slate-900 dark:text-white">{e.word}</span>
                <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">{e.ipaUs[0] ?? e.ipaUk[0]}</span>
                <span className="text-[10px] font-bold px-1.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">{e.cefr}</span>
              </div>
              <div className="text-xs text-slate-600 dark:text-zinc-300 truncate">{e.vn}</div>
            </div>
            <button
              onClick={() => early(e)}
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/40"
            >
              <Zap className="w-3.5 h-3.5" /> Học sớm
            </button>
          </div>
        ))}
      </div>
      {message && <p className="text-xs text-cyan-700 dark:text-cyan-300">{message}</p>}
    </div>
  );
}

/** "Lộ trình từ vựng": levels, progress, skimming known words, and searching the deck */
export default function VocabTab() {
  const refreshWords = useWordsStore((s) => s.refreshWords);
  const [levels, setLevels] = useState<StudyLevel[]>(getStudyLevels);
  const [saving, setSaving] = useState(false);
  const { progress, reload } = useLevelProgress();

  useEffect(() => {
    ensureCatalogSeeded().catch(() => {});
  }, []);

  const onChanged = () => {
    reload();
    refreshWords();
  };

  const choose = async (next: StudyLevel[]) => {
    setSaving(true);
    try {
      setLevels(await changeStudyLevels(next));
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${PAGE_CONTAINER} space-y-8`}>
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Lộ trình từ vựng</h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400">
          5.004 từ Oxford 3000 và 5000, từ A1 đến C1, có nghĩa tiếng Việt, câu ví dụ và phát âm. Mỗi ngày app đưa vào vài từ mới theo hạn mức của bạn.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Cấp đang học</h3>
        <LevelPicker value={levels} onChange={choose} disabled={saving} />
        <p className="text-xs text-slate-500 dark:text-zinc-400">{mixDescription(levels)}</p>
        {progress && <ProgressBars progress={progress} levels={levels} />}
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Lướt nhanh từ đã biết</h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Đây là các từ sắp học. Tích những từ bạn đã chắc chắn biết: app bỏ qua phần học mới và chỉ hỏi lại một lần sau khoảng một tuần. Những từ còn lại học như bình thường.
        </p>
        <Skim levels={levels} onChanged={onChanged} />
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Tìm từ</h3>
        <CatalogSearch onChanged={onChanged} />
      </section>

      <p className="text-[10px] text-slate-400 dark:text-zinc-500">
        Nguồn: bộ thẻ Anki "5000 Từ vựng Tiếng Anh (Oxford 5000, A1–C1)". Từ, cấp CEFR và phiên âm theo Oxford 3000/5000; nghĩa và câu ví dụ do tác giả bộ thẻ biên soạn.
      </p>
    </div>
  );
}
