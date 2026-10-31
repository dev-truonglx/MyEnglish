import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, ChevronLeft, ChevronRight, CircleHelp, Play, RotateCcw, Search, Undo2, Volume2 } from "lucide-react";
import type { WordDetail } from "@/types/database";
import { useWordsStore } from "@/stores/wordsStore";
import {
  CEFR_LEVELS,
  NO_LEVEL,
  classifyKnownWords,
  filterKnown,
  levelCounts,
  levelOf,
  loadKnownMarks,
  pageButtons,
  pageOf,
  type KnownEntry,
  type KnownResultFilter,
  type KnownSort,
  type KnownStatus,
} from "@/services/knownWords";
import {
  easyStatesFromEvents,
  KNOWN_CHECK_LABEL,
  LEVEL_ACCEPT_AT,
  LEVEL_MIN_CHECKS,
  LEVEL_RELEARN_AT,
  levelResetsFromEvents,
  levelStatsFromEvents,
  loadKnownEvents,
  unmarkWordEasy,
  type EasyEventRow,
  type LevelStatus,
} from "@/services/easyWords";
import { formatNextReviewRelative } from "@/utils/reviewSchedule";
import { handleSpeak, PAGE_CONTAINER } from "./shared";

interface KnownTabProps {
  /** Make these words' checks due now and review them */
  onCheckNow: (words: WordDetail[]) => void;
}

type View = "waiting" | "checked";

const PAGE_SIZE = 30;
/** Most words in one "Kiểm tra ngay" session */
const CHECK_MAX = 20;

const dateVn = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const RESULT: Record<Exclude<KnownStatus, "waiting">, { label: string; cls: string }> = {
  confirmed: { label: "Đã xác nhận", cls: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60" },
  failed: { label: "Kiểm tra sai, đang học lại", cls: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60" },
};

const LEVEL_STATUS: Record<LevelStatus, { label: string; cls: string }> = {
  verifying: { label: "Đang kiểm chứng", cls: "text-sky-700 dark:text-sky-300" },
  checking: { label: "Cần kiểm tra thêm — hỏi nhiều hơn", cls: "text-amber-700 dark:text-amber-300" },
  accepted: { label: "Đã công nhận", cls: "text-emerald-700 dark:text-emerald-300" },
  relearn: { label: "Phải học lại", cls: "text-rose-700 dark:text-rose-300" },
};

/**
 * "Đã biết": the words marked as already known, waiting for a check or checked with the result
 * (services/knownWords), and how each level's checks are going (services/easyWords).
 */
export default function KnownTab({ onCheckNow }: KnownTabProps) {
  const words = useWordsStore((s) => s.words);
  const setSelectedWord = useWordsStore((s) => s.setSelectedWord);
  const [marks, setMarks] = useState<Map<string, string> | null>(null);
  const [events, setEvents] = useState<EasyEventRow[]>([]);
  const [view, setView] = useState<View>("waiting");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [result, setResult] = useState<KnownResultFilter>("all");
  const [sort, setSort] = useState<KnownSort>("check");
  const [page, setPage] = useState(1);
  const listTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stale = false;
    Promise.all([loadKnownMarks(), loadKnownEvents().catch(() => [] as EasyEventRow[])])
      .then(([m, e]) => {
        if (stale) return;
        setEvents(e);
        setMarks(m);
      })
      .catch(() => !stale && setMarks(new Map()));
    return () => {
      stale = true;
    };
  }, [words]);

  const easy = useMemo(() => easyStatesFromEvents(events), [events]);
  const levelStats = useMemo(() => levelStatsFromEvents(events), [events]);
  const resets = useMemo(() => levelResetsFromEvents(events), [events]);
  const entries = useMemo(() => (marks ? classifyKnownWords(words, marks, easy) : []), [words, marks, easy]);
  const waiting = entries.filter((e) => e.status === "waiting");
  const checked = entries.filter((e) => e.status !== "waiting");
  // Each level with words marked (still aside) or checks: how its checks are going
  const levelRows = useMemo(() => {
    const aside = new Map<string, number>();
    for (const e of entries) if (!e.legacy && e.status !== "failed") aside.set(levelOf(e.word), (aside.get(levelOf(e.word)) ?? 0) + 1);
    return [...CEFR_LEVELS, NO_LEVEL]
      .filter((l) => aside.has(l) || levelStats.has(l))
      .map((l) => ({ level: l, aside: aside.get(l) ?? 0, stats: levelStats.get(l), reset: resets.find((r) => r.level === l) ?? null }));
  }, [entries, levelStats, resets]);
  const confirmed = checked.filter((e) => e.status === "confirmed").length;
  const failed = checked.length - confirmed;

  const list = useMemo(() => filterKnown(entries, { view, level, result, query, sort }), [entries, view, level, result, query, sort]);
  // Levels of the group on screen, with their counts
  const levels = useMemo(() => levelCounts(view === "waiting" ? waiting : checked), [view, waiting, checked]);
  // Any change of filter starts again from page 1; a level absent from the group goes back to all
  useEffect(() => setPage(1), [view, level, result, query, sort]);
  useEffect(() => {
    if (level !== "all" && !levels.some((l) => l.level === level)) setLevel("all");
  }, [levels, level]);
  const current = pageOf(list, page, PAGE_SIZE);
  // The words of the waiting group as filtered (a level chosen: that level only), soonest check first
  const checkLevel = view === "waiting" && level !== "all" ? level : null;
  const checkPool = checkLevel ? waiting.filter((e) => levelOf(e.word) === checkLevel) : waiting;
  const toCheck = checkPool.slice(0, CHECK_MAX).map((e) => e.word);
  /** A marked word goes back to learning (its mark is undone) */
  const sendBack = async (w: WordDetail) => {
    setEvents((prev) => [...prev, { word_id: w.id, type: "easy_back", at: new Date().toISOString(), meta: null }]);
    await unmarkWordEasy(w.id).catch((err) => console.warn("Failed to send a known word back:", err));
  };
  const goTo = (p: number) => {
    setPage(p);
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const chip = (active: boolean) =>
    `max-md:min-h-10 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
      active
        ? "bg-slate-800 dark:bg-zinc-100 text-white dark:text-zinc-900"
        : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
    }`;


  return (
    <div className={`${PAGE_CONTAINER} max-md:p-3 space-y-6`}>
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-zinc-900 p-4 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <BadgeCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Đã biết</h2>
            <p className="text-sm text-slate-600 dark:text-zinc-300">
              Những từ bạn đã thuộc chắc: bấm "Tôi biết chắc từ này" (phím D) dưới thẻ giới thiệu hoặc thẻ ôn, hay đánh dấu cả một cấp độ. Chúng
              không vào lịch ôn và không chiếm chỗ từ mới mỗi ngày. Thỉnh thoảng app hỏi lại ngẫu nhiên vài từ trong phiên ôn: đúng thì
              từ vẫn là Đã biết và lần sau còn lâu hơn (sớm nhất sau khoảng {KNOWN_CHECK_LABEL}, không quá khoảng cách tối đa trong cài
              đặt), sai thì từ quay lại học như bình thường.
            </p>
            <p className="text-sm text-slate-600 dark:text-zinc-300 mt-1">
              Mỗi cấp độ được kiểm chứng riêng (2–3 câu mỗi phiên, cấp cao hỏi nhiều hơn). Sau ít nhất {LEVEL_MIN_CHECKS} câu: đúng từ{" "}
              {Math.round(LEVEL_ACCEPT_AT * 100)}% thì cấp đó được công nhận; đúng {Math.round(LEVEL_RELEARN_AT * 100)}% trở xuống thì
              các từ chưa được xác nhận của cấp đó quay lại học từ đầu; ở giữa thì app hỏi cấp đó nhiều hơn.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
          {[
            ["Chờ kiểm tra", waiting.length, "chưa được hỏi lại"],
            ["Đã xác nhận", confirmed, "trả lời đúng khi kiểm tra"],
            ["Kiểm tra sai", failed, "đang học lại"],
          ].map(([label, value, sub]) => (
            <div key={label as string} className="p-3 rounded-xl bg-white dark:bg-zinc-900/80 border border-emerald-100 dark:border-emerald-900/40">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">{label}</div>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">{marks ? value : "…"}</div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-500">{sub}</div>
            </div>
          ))}
        </div>

        {waiting.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onCheckNow(toCheck)}
              className="max-md:min-h-10 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm font-bold shadow-md shadow-emerald-600/30 inline-flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-white" /> Kiểm tra ngay {toCheck.length} từ{checkLevel ? ` ${checkLevel}` : ""}
            </button>
            <span className="text-xs text-slate-500 dark:text-zinc-400">
              Không cần chờ: trả lời đúng là từ được xác nhận luôn.
              {checkPool.length > CHECK_MAX ? ` ${CHECK_MAX} từ đến lượt sớm nhất trước.` : ""}
            </span>
          </div>
        )}
      </div>

      {levelRows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 space-y-2" aria-label="Kiểm chứng theo cấp độ">
          <div className="text-xs font-bold text-slate-700 dark:text-zinc-200">Kiểm chứng theo cấp độ</div>
          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            {levelRows.map(({ level: l, aside, stats, reset }) => {
              const status = stats?.status ?? "verifying";
              return (
                <div key={l} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-[11px]">
                  <span className="w-10 font-bold text-slate-900 dark:text-white">{l}</span>
                  <span className="w-32 text-slate-500 dark:text-zinc-400">{aside.toLocaleString("vi-VN")} từ đã biết</span>
                  <span className="w-40 text-slate-500 dark:text-zinc-400">
                    {stats && stats.total > 0
                      ? `Đúng ${stats.correct}/${stats.total} câu gần đây (${Math.round((stats.correct / stats.total) * 100)}%)`
                      : "Chưa kiểm tra câu nào"}
                  </span>
                  <span className={`font-semibold ${LEVEL_STATUS[status].cls}`}>
                    {LEVEL_STATUS[status].label}
                    {status === "verifying" && stats ? ` (${stats.total}/${LEVEL_MIN_CHECKS} câu)` : ""}
                  </span>
                  {reset && (
                    <span className="basis-full text-rose-700 dark:text-rose-300">
                      {dateVn(reset.at)}: chỉ đúng {reset.correct}/{reset.total} câu kiểm tra — {reset.sent.toLocaleString("vi-VN")} từ {l} chưa được
                      xác nhận đã quay lại học từ đầu.
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["waiting", `Chờ kiểm tra (${waiting.length})`],
            ["checked", `Đã kiểm tra (${checked.length})`],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`max-md:min-h-10 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              view === v
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
            }`}
          >
            {label}
          </button>
        ))}
        <label className="w-full sm:w-auto sm:ml-auto relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm từ hoặc nghĩa..."
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base md:text-xs text-slate-800 dark:text-zinc-200 w-full sm:w-52 focus:outline-none focus:border-emerald-500"
          />
        </label>
      </div>

      {/* Classification: level, result (checked words), order */}
      <div ref={listTopRef} className="scroll-mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {levels.length > 1 && (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Lọc theo cấp độ">
            <span className="text-[11px] text-slate-400 dark:text-zinc-500 mr-1">Cấp độ</span>
            <button onClick={() => setLevel("all")} className={chip(level === "all")}>
              Tất cả
            </button>
            {levels.map((l) => (
              <button key={l.level} onClick={() => setLevel(l.level)} className={chip(level === l.level)}>
                {l.level} <span className="opacity-60">{l.count}</span>
              </button>
            ))}
          </div>
        )}
        {view === "checked" && (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Lọc theo kết quả">
            <span className="text-[11px] text-slate-400 dark:text-zinc-500 mr-1">Kết quả</span>
            {(
              [
                ["all", "Tất cả"],
                ["confirmed", "Đã xác nhận"],
                ["remembered", "Nhớ lâu"],
                ["failed", "Kiểm tra sai"],
              ] as const
            ).map(([r, label]) => (
              <button key={r} onClick={() => setResult(r)} className={chip(result === r)}>
                {label}
              </button>
            ))}
          </div>
        )}
        <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
          Sắp xếp
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as KnownSort)}
            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 max-md:text-base text-slate-700 dark:text-zinc-200"
          >
            <option value="check">{view === "checked" ? "Mới kiểm tra" : "Sắp kiểm tra"}</option>
            <option value="marked">Mới đánh dấu</option>
            <option value="az">A → Z</option>
          </select>
        </label>
      </div>

      {!marks ? (
        <div className="h-32 rounded-2xl bg-slate-100 dark:bg-zinc-900 animate-pulse" />
      ) : list.length === 0 ? (
        <div className="text-center py-10 text-sm text-slate-500 dark:text-zinc-400">
          {query || level !== "all" || result !== "all"
            ? "Không có từ nào khớp bộ lọc."
            : view === "waiting"
              ? 'Không có từ nào đang chờ kiểm tra. Khi gặp từ bạn đã thuộc chắc, bấm "Tôi biết chắc từ này" (phím D) dưới thẻ.'
              : "Chưa có từ nào được kiểm tra."}
        </div>
      ) : (
        <>
          <div className="text-[11px] text-slate-500 dark:text-zinc-400">
            Hiển thị {current.from}–{current.to} trên {list.length} từ
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 divide-y divide-slate-100 dark:divide-zinc-800">
            {current.items.map((e) => (
              <KnownRow
                key={e.word.id}
                entry={e}
                onOpen={() => setSelectedWord(e.word)}
                onCheck={() => onCheckNow([e.word])}
                onSendBack={() => sendBack(e.word)}
              />
            ))}
          </div>
          {current.pages > 1 && (
            <nav className="flex items-center justify-center gap-1" aria-label="Phân trang">
              <button
                onClick={() => goTo(current.page - 1)}
                disabled={current.page === 1}
                aria-label="Trang trước"
                className="p-1.5 rounded-lg text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {pageButtons(current.page, current.pages).map((n, i) =>
                n == null ? (
                  <span key={`gap-${i}`} className="px-1 text-xs text-slate-400">
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    onClick={() => goTo(n)}
                    aria-current={n === current.page ? "page" : undefined}
                    className={`min-w-8 h-8 px-2 rounded-lg text-xs font-semibold transition-colors ${
                      n === current.page
                        ? "bg-emerald-600 text-white"
                        : "text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {n}
                  </button>
                )
              )}
              <button
                onClick={() => goTo(current.page + 1)}
                disabled={current.page === current.pages}
                aria-label="Trang sau"
                className="p-1.5 rounded-lg text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function KnownRow({
  entry,
  onOpen,
  onCheck,
  onSendBack,
}: {
  entry: KnownEntry;
  onOpen: () => void;
  onCheck: () => void;
  onSendBack: () => void;
}) {
  const { word: w, status, markedAt, checkAt, rememberedLong, passedChecks = 0, legacy } = entry;
  // Still marked the current way (set aside): it can go back to learning
  const aside = !legacy && status !== "failed";
  const check = checkAt ? formatNextReviewRelative(checkAt, false) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
      <button onClick={onOpen} className="min-w-0 flex-1 basis-[220px] text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900 dark:text-white">{w.word}</span>
          {w.phonetic && <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">{w.phonetic}</span>}
          {w.cefr_level && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 font-bold">{w.cefr_level}</span>
          )}
        </div>
        <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-1">{w.meaning_vn}</p>
      </button>

      <div className="text-[11px] text-slate-500 dark:text-zinc-400 w-32">
        <div className="text-slate-400 dark:text-zinc-500">Đánh dấu</div>
        {dateVn(markedAt)}
      </div>

      <div className="text-[11px] w-56">
        {status === "waiting" ? (
          <>
            <div className="text-slate-400 dark:text-zinc-500 inline-flex items-center gap-1">
              <CircleHelp className="w-3 h-3" /> Kiểm tra
            </div>
            <div>
              {check ? (
                <span title={check.exactDateStr} className={`px-1.5 py-0.5 rounded font-semibold ${check.badgeClass.replace("animate-pulse", "")}`}>
                  {check.diffMs <= 0 ? "Đến lượt kiểm tra" : check.label}
                </span>
              ) : (
                <span title="Được hỏi ngẫu nhiên trong các phiên ôn tới, theo cấp độ">Ngẫu nhiên</span>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="text-slate-400 dark:text-zinc-500">Kết quả</div>
            <span className={`inline-block px-1.5 py-0.5 rounded border font-semibold ${RESULT[status].cls}`}>
              {RESULT[status].label}
              {status === "confirmed" && passedChecks > 0 ? ` · đúng ${passedChecks} lần` : ""}
              {status === "confirmed" && rememberedLong ? " · Nhớ lâu" : ""}
            </span>
            {status === "confirmed" && check && (
              <div className="mt-0.5 text-slate-400 dark:text-zinc-500" title={check.exactDateStr}>
                Hỏi lại {check.diffMs <= 0 ? "khi có dịp" : check.label}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 w-full sm:w-auto sm:ml-auto">
        <button
          onClick={(e) => handleSpeak(w.word, e)}
          aria-label={`Nghe "${w.word}"`}
          className="p-2.5 -m-1 md:p-1.5 md:m-0 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-slate-100 dark:hover:bg-zinc-800"
        >
          <Volume2 className="w-4 h-4" />
        </button>
        {status === "waiting" && (
          <button
            onClick={onCheck}
            title="Hỏi lại từ này ngay để xác nhận"
            className="max-md:min-h-10 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Kiểm tra ngay
          </button>
        )}
        {aside && (
          <button
            onClick={onSendBack}
            title="Bỏ đánh dấu Đã biết: từ quay lại học như bình thường"
            className="max-md:min-h-10 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700 inline-flex items-center gap-1"
          >
            <Undo2 className="w-3 h-3" /> Học lại
          </button>
        )}
      </div>
    </div>
  );
}
