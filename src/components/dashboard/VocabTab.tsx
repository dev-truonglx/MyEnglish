import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Eye, EyeOff, Layers, Loader2, Search, Sparkles, Volume2, Zap } from "lucide-react";
import {
  CATALOG_LEVEL_COUNTS,
  STUDY_LEVELS,
  ensureCatalogSeeded,
  searchCatalog,
  type CatalogEntry,
  type StudyLevel,
} from "@/services/vocabCatalog";
import {
  UNLOCK_MET_SHARE,
  UNLOCK_REMEMBERED_SHARE,
  changeStudyLevels,
  getStudyLevels,
  learnEarly,
  levelReadyToAdvance,
  levelWeights,
  loadLevelProgress,
  markCatalogWordsKnown,
  nextUnstudiedEntries,
  suggestNextLevel,
  type LevelProgress,
} from "@/services/vocabFeed";
import { estimateNewWordsPerDay, levelEtaDays } from "@/services/progress";
import { getStudyLimits } from "@/services/srs";
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
  // The newest request wins: an older, slower response must not overwrite it
  const seqRef = useRef(0);
  const reload = useCallback(() => {
    const seq = ++seqRef.current;
    loadLevelProgress()
      .then((p) => {
        if (seq === seqRef.current) setProgress(p);
      })
      .catch(() => {
        if (seq === seqRef.current) setProgress(null);
      });
  }, []);
  useEffect(() => {
    reload();
    window.addEventListener("words-changed", reload);
    window.addEventListener("myenglish-study-levels-changed", reload);
    return () => {
      seqRef.current++; // unmounted: drop a response still on its way
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
                <span
                  className="text-slate-500 dark:text-zinc-400"
                  title={`Nhớ lâu: đã ôn thật và sẽ không quên trong ít nhất 3 tuần. Gợi ý mở cấp mới khi gặp ${Math.round(
                    UNLOCK_MET_SHARE * 100
                  )}% số từ và nhớ lâu ${Math.round(UNLOCK_REMEMBERED_SHARE * 100)}%.`}
                >
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

/** "~12 ngày", "~5 tháng" */
function formatEta(days: number): string {
  return days <= 60 ? `~${days} ngày` : `~${Math.round(days / 30)} tháng`;
}

/**
 * The path A1 → C1 in one row: per level whether it is studied, its words met and remembered, and (studied
 * levels) the days left at the current pace. A click chooses levels as LevelPicker does: up to that level, or
 * drops the top chosen level.
 */
function LevelRoadmap({
  progress,
  levels,
  onChange,
  disabled,
}: {
  progress: LevelProgress[];
  levels: StudyLevel[];
  onChange: (levels: StudyLevel[]) => void;
  disabled?: boolean;
}) {
  const top = levels.length - 1;
  // The level mix shares the new words among the chosen levels that still have some
  const open = progress.filter((p) => levels.includes(p.level) && p.total - p.met > 0);
  const weights = levelWeights(open.map((p) => p.level));
  const weightSum = [...weights.values()].reduce((a, b) => a + b, 0) || 1;
  const perDay = estimateNewWordsPerDay(getStudyLimits().newCardsPerDay);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {STUDY_LEVELS.map((level, i) => {
        const p = progress.find((x) => x.level === level);
        const on = i <= top;
        const total = Math.max(1, p?.total ?? CATALOG_LEVEL_COUNTS[level]);
        const met = p?.met ?? 0;
        const remembered = p?.remembered ?? 0;
        const pct = (n: number) => `${Math.min(100, Math.round((n * 100) / total))}%`;
        const allMet = met >= total;
        const ready = !!p && levelReadyToAdvance(p);
        const eta = on && p && !allMet ? levelEtaDays(total - met, perDay, (weights.get(level) ?? 0) / weightSum) : 0;
        const badge = !on
          ? { text: "Chưa mở", cls: "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400" }
          : allMet
            ? { text: "Đã gặp hết", cls: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300" }
            : ready
              ? { text: "Vững rồi", cls: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300" }
              : { text: "Đang học", cls: "bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300" };
        const action = i === top && i > 0 ? `Bấm để bỏ ${level}` : on ? `Bấm để chỉ học đến ${level}` : `Bấm để học thêm đến ${level}`;
        return (
          <button
            key={level}
            type="button"
            disabled={disabled}
            onClick={() => onChange(STUDY_LEVELS.slice(0, i === top && i > 0 ? i : i + 1))}
            aria-pressed={on}
            title={`${level} · ${LEVEL_NAMES[level]}: ${met}/${total} từ đã gặp, ${remembered} nhớ lâu${p?.known ? `, ${p.known} đã biết` : ""}. ${action}.`}
            className={`group text-left p-3 rounded-xl border transition-all disabled:opacity-60 space-y-2 ${
              on
                ? "border-cyan-400 dark:border-cyan-600/70 bg-cyan-50/60 dark:bg-cyan-500/5 ring-1 ring-cyan-400/60 dark:ring-cyan-600/40"
                : "border-dashed border-slate-300 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-500 bg-white/50 dark:bg-zinc-900/40"
            }`}
          >
            <span className="flex items-center justify-between gap-1">
              <span className={`text-lg font-black leading-none ${on ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-zinc-500"}`}>{level}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.text}</span>
            </span>
            <span className={`block text-[11px] ${on ? "text-slate-600 dark:text-zinc-300" : "text-slate-400 dark:text-zinc-500"}`}>{LEVEL_NAMES[level]}</span>
            <span className="relative block h-1.5 rounded-full bg-slate-200/80 dark:bg-zinc-800 overflow-hidden">
              <span className="absolute inset-y-0 left-0 bg-cyan-300 dark:bg-cyan-700" style={{ width: pct(met) }} />
              <span className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: pct(remembered) }} />
            </span>
            <span className="flex items-baseline justify-between gap-1 text-[11px] font-mono">
              <span className={on ? "text-slate-700 dark:text-zinc-200" : "text-slate-400 dark:text-zinc-500"}>
                {met}/{total}
              </span>
              {remembered > 0 && <span className="text-emerald-600 dark:text-emerald-400">{remembered} nhớ lâu</span>}
            </span>
            <span className="block text-[10px] text-slate-500 dark:text-zinc-400 min-h-[14px]">
              {on ? (allMet ? "Chỉ còn ôn" : eta > 0 ? `Gặp hết sau ${formatEta(eta)}` : "") : (
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">+ Thêm vào lộ trình</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Offer the next level: when the chosen levels are met (80%) and remembered for the long run (50%), or when
 * they have no new word left to give (the daily new words would stop).
 */
function NextLevelNotice({
  progress,
  levels,
  onOpen,
  busy,
}: {
  progress: LevelProgress[];
  levels: StudyLevel[];
  onOpen: (next: StudyLevel) => void;
  busy?: boolean;
}) {
  const suggestion = suggestNextLevel(progress, levels);
  if (!suggestion) return null;
  const { next, reason } = suggestion;
  const names = levels.join(", ");
  const text =
    reason === "exhausted"
      ? next
        ? `Bạn đã nhận hết từ mới của ${names}. Các từ đã nhận vẫn được ôn như bình thường, nhưng sẽ không có từ mới nữa cho đến khi mở thêm ${next}.`
        : "Bạn đã nhận hết 5.004 từ của bộ Oxford. Các từ đã nhận vẫn được ôn như bình thường."
      : `Bạn đã gặp hơn ${Math.round(UNLOCK_MET_SHARE * 100)}% số từ ${names} và nhớ lâu được hơn một nửa. Sẵn sàng học thêm cấp ${next}.`;
  return (
    <div
      className={`rounded-lg border p-3 space-y-2 text-xs ${
        reason === "exhausted"
          ? "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200"
          : "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
      }`}
    >
      <p>{text}</p>
      {next && (
        <button
          onClick={() => onOpen(next)}
          disabled={busy}
          className="w-full px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold"
        >
          Mở thêm {next} · {LEVEL_NAMES[next]}
        </button>
      )}
    </div>
  );
}

/** Today screen: progress of the chosen levels, and the next level when it is time */
export function TodayLevelCard({ onOpen }: { onOpen: () => void }) {
  const { progress } = useLevelProgress();
  const refreshWords = useWordsStore((s) => s.refreshWords);
  const [busy, setBusy] = useState(false);
  const levels = getStudyLevels();
  if (!progress) return null;
  const openNext = async (next: StudyLevel) => {
    setBusy(true);
    try {
      await changeStudyLevels([...levels, next]);
      refreshWords();
    } finally {
      setBusy(false);
    }
  };
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
      <NextLevelNotice progress={progress} levels={levels} onOpen={openNext} busy={busy} />
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

  // The newest load wins: switching level quickly must not show the previous level's words
  const loadSeqRef = useRef(0);
  const load = useCallback(() => {
    const seq = ++loadSeqRef.current;
    setEntries(null);
    setPicked(new Set());
    setShown(new Set());
    nextUnstudiedEntries(level, 30)
      .then((list) => {
        if (seq === loadSeqRef.current) setEntries(list);
      })
      .catch(() => {
        if (seq === loadSeqRef.current) setEntries([]);
      });
  }, [level]);
  useEffect(() => {
    load();
    return () => {
      loadSeqRef.current++;
    };
  }, [load]);

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

  const allShown = !!entries && entries.length > 0 && shown.size === entries.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {levels.length > 1 && (
          <div role="tablist" aria-label="Cấp" className="inline-flex items-center gap-0.5 bg-slate-100 dark:bg-zinc-800/80 p-0.5 rounded-lg">
            {levels.map((l) => (
              <button
                key={l}
                role="tab"
                aria-selected={l === level}
                onClick={() => setLevel(l)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  l === level
                    ? "bg-white dark:bg-zinc-700 text-cyan-700 dark:text-cyan-300 shadow-sm"
                    : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        <span className="text-xs text-slate-500 dark:text-zinc-400">
          {entries ? `${entries.length} từ ${level} sắp học tiếp theo` : ""}
        </span>
        {entries && entries.length > 0 && (
          <span className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setShown(allShown ? new Set() : new Set(entries.map((e) => e.id)))}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-zinc-300 hover:text-cyan-700 dark:hover:text-cyan-300"
            >
              {allShown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {allShown ? "Ẩn nghĩa" : "Hiện nghĩa"}
            </button>
            <button
              onClick={() => setPicked(picked.size === entries.length ? new Set() : new Set(entries.map((e) => e.id)))}
              className="text-xs font-medium text-cyan-700 dark:text-cyan-300 hover:underline"
            >
              {picked.size === entries.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
            </button>
          </span>
        )}
      </div>
      {!entries ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-9 rounded-lg bg-slate-100 dark:bg-zinc-800/70 animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-zinc-400">Bạn đã gặp hết các từ {level}.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {entries.map((e) => (
            // The whole row ticks the word (the listen and meaning buttons do their own thing)
            <div
              key={e.id}
              onClick={() => setPicked((s) => toggle(s, e.id))}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-sm cursor-pointer select-none transition-colors ${
                picked.has(e.id)
                  ? "border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30"
                  : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700"
              }`}
            >
              <input
                type="checkbox"
                checked={picked.has(e.id)}
                onClick={(ev) => ev.stopPropagation()}
                onChange={() => setPicked((s) => toggle(s, e.id))}
                aria-label={`Đã biết ${e.word}`}
                className="accent-emerald-600 shrink-0"
              />
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  handleSpeak(e.word);
                }}
                title="Nghe"
                className="text-slate-400 hover:text-cyan-600 shrink-0"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>
              <span className="font-semibold text-slate-900 dark:text-white shrink-0">{e.word}</span>
              <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 truncate">{e.ipaUs[0] ?? e.ipaUk[0]}</span>
              {shown.has(e.id) ? (
                <span className="ml-auto text-xs text-slate-600 dark:text-zinc-300 truncate" title={e.vn}>
                  {e.vn}
                </span>
              ) : (
                <button
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setShown((s) => toggle(s, e.id));
                  }}
                  className="ml-auto shrink-0 inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-cyan-600"
                >
                  <Eye className="w-3 h-3" /> nghĩa
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {/* The action stays in view while the list scrolls */}
      {entries && entries.length > 0 && (
        <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-3 rounded-b-2xl border-t border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur flex flex-wrap items-center gap-3">
          <button
            onClick={markKnown}
            disabled={picked.size === 0 || busy}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {picked.size > 0 ? `Đánh dấu ${picked.size} từ đã biết` : "Chọn từ bạn đã biết"}
          </button>
          {message ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-400 flex-1 min-w-[200px]">{message}</p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-zinc-400 flex-1 min-w-[200px]">
              Từ đã biết được bỏ qua phần học mới, chỉ hỏi lại một lần sau khoảng một tuần.
            </p>
          )}
        </div>
      )}
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
    // An older search finishing after a newer one must not replace its results
    let stale = false;
    const t = setTimeout(() => {
      searchCatalog(q, 30)
        .then((list) => {
          if (!stale) setResults(list);
        })
        .catch(() => {
          if (!stale) setResults([]);
        });
    }, 150);
    return () => {
      stale = true;
      clearTimeout(t);
    };
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
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-gramm="false"
          data-enable-grammarly="false"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-zinc-100 focus:outline-none"
        />
      </label>
      {!query.trim() ? (
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Gặp một từ ở chỗ làm và muốn học ngay? Tìm nó rồi bấm <span className="font-semibold">Học sớm</span>: từ đó thành từ mới tiếp theo, kể cả khi thuộc cấp chưa mở.
        </p>
      ) : results.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-zinc-400">Không có trong bộ Oxford 5000.</p>
      ) : null}
      <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
        {results.map((e) => (
          <div key={e.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <button onClick={() => handleSpeak(e.word)} title="Nghe" className="text-slate-400 hover:text-cyan-600">
              <Volume2 className="w-4 h-4" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">{e.word}</span>
                <span className="shrink-0 text-[10px] font-bold px-1.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">{e.cefr}</span>
              </div>
              <div className="text-xs text-slate-600 dark:text-zinc-300 truncate" title={e.vn}>
                <span className="font-mono text-[11px] text-slate-400 dark:text-zinc-500">{e.ipaUs[0] ?? e.ipaUk[0]}</span>
                {(e.ipaUs[0] ?? e.ipaUk[0]) ? " · " : ""}
                {e.vn}
              </div>
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

  const totals = progress?.reduce(
    (t, p) => ({ total: t.total + p.total, met: t.met + p.met, remembered: t.remembered + p.remembered, known: t.known + p.known }),
    { total: 0, met: 0, remembered: 0, known: 0 }
  );
  const perDay = estimateNewWordsPerDay(getStudyLimits().newCardsPerDay);
  const card = "rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm";

  return (
    <div className={`${PAGE_CONTAINER} space-y-5`}>
      {/* Title and the whole path in numbers */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-500" /> Lộ trình từ vựng
          </h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            5.004 từ Oxford 3000 và 5000 (A1–C1), có nghĩa tiếng Việt, câu ví dụ và phát âm.
          </p>
        </div>
        {totals && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800/80 text-slate-600 dark:text-zinc-300" title="Từ đã học ít nhất một lần, kể cả từ đánh dấu đã biết">
              Đã gặp <b className="font-mono text-slate-900 dark:text-white">{totals.met.toLocaleString("vi-VN")}</b>
              <span className="text-slate-400 dark:text-zinc-500">/{totals.total.toLocaleString("vi-VN")}</span>
            </span>
            <span className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" title="Đã ôn thật và sẽ không quên trong ít nhất 3 tuần">
              Nhớ lâu <b className="font-mono">{totals.remembered.toLocaleString("vi-VN")}</b>
            </span>
            {totals.known > 0 && (
              <span className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800/80 text-slate-600 dark:text-zinc-300">
                Đã biết <b className="font-mono text-slate-900 dark:text-white">{totals.known}</b>
              </span>
            )}
            <span className="px-2.5 py-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300" title="Hạn mức thẻ mới mỗi ngày (Cài đặt) chia cho từ mới và thẻ nhớ ra từ, nên khoảng một nửa là từ mới">
              ~<b className="font-mono">{perDay}</b> từ mới/ngày
            </span>
          </div>
        )}
      </div>

      {/* The path: choose the levels and see each one's progress in one row */}
      <section className={`${card} p-5 space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Cấp đang học</h3>
          <span className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-1.5 rounded-full bg-cyan-300 dark:bg-cyan-700" /> Đã gặp</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-1.5 rounded-full bg-emerald-500" /> Nhớ lâu</span>
          </span>
        </div>
        {progress ? (
          <LevelRoadmap progress={progress} levels={levels} onChange={choose} disabled={saving} />
        ) : (
          <LevelPicker value={levels} onChange={choose} disabled={saving} />
        )}
        <p className="text-xs text-slate-500 dark:text-zinc-400">{mixDescription(levels)}</p>
        {progress && (
          <NextLevelNotice progress={progress} levels={levels} onOpen={(next) => choose([...levels, next])} busy={saving} />
        )}
      </section>

      {/* Skim the next words (main) and search the deck (side) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <section className={`${card} p-5 space-y-3`}>
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-500" /> Lướt nhanh từ đã biết
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">Tích những từ sắp học mà bạn chắc chắn đã biết, để dành thời gian cho từ thật sự mới.</p>
          </div>
          <Skim levels={levels} onChanged={onChanged} />
        </section>

        <section className={`${card} p-5 space-y-3 order-first lg:order-none lg:sticky lg:top-4`}>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-cyan-500" /> Tìm từ và học sớm
          </h3>
          <CatalogSearch onChanged={onChanged} />
        </section>
      </div>

      <p className="text-[10px] text-slate-400 dark:text-zinc-500">
        Nguồn: bộ thẻ Anki "5000 Từ vựng Tiếng Anh (Oxford 5000, A1–C1)". Từ, cấp CEFR và phiên âm theo Oxford 3000/5000; nghĩa và câu ví dụ do tác giả bộ thẻ biên soạn.
      </p>
    </div>
  );
}
