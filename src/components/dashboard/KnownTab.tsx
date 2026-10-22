import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, ChevronLeft, ChevronRight, CircleHelp, Play, RotateCcw, Search, Volume2 } from "lucide-react";
import type { WordDetail } from "@/types/database";
import { useWordsStore } from "@/stores/wordsStore";
import {
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
import { KNOWN_STABILITY_MAX_DAYS, KNOWN_STABILITY_MIN_DAYS } from "@/services/reviewRecorder";
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

/**
 * "Đã biết": the words marked as already known, waiting for their one check, and those already checked with
 * the result (see services/knownWords).
 */
export default function KnownTab({ onCheckNow }: KnownTabProps) {
  const words = useWordsStore((s) => s.words);
  const setSelectedWord = useWordsStore((s) => s.setSelectedWord);
  const [marks, setMarks] = useState<Map<string, string> | null>(null);
  const [view, setView] = useState<View>("waiting");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [result, setResult] = useState<KnownResultFilter>("all");
  const [sort, setSort] = useState<KnownSort>("check");
  const [page, setPage] = useState(1);
  const listTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stale = false;
    loadKnownMarks()
      .then((m) => !stale && setMarks(m))
      .catch(() => !stale && setMarks(new Map()));
    return () => {
      stale = true;
    };
  }, [words]);

  const entries = useMemo(() => (marks ? classifyKnownWords(words, marks) : []), [words, marks]);
  const waiting = entries.filter((e) => e.status === "waiting");
  const checked = entries.filter((e) => e.status !== "waiting");
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
  const goTo = (p: number) => {
    setPage(p);
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
      active
        ? "bg-slate-800 dark:bg-zinc-100 text-white dark:text-zinc-900"
        : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
    }`;


  return (
    <div className={`${PAGE_CONTAINER} space-y-6`}>
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-zinc-900 p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <BadgeCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Đã biết</h2>
            <p className="text-sm text-slate-600 dark:text-zinc-300">
              Những từ bạn đã thành thạo (nghe, đọc, viết được) và đánh dấu "Đã biết". Chúng được tính là Nhớ lâu ngay, không có bài
              luyện gõ từ, và app chỉ hỏi lại mỗi từ một lần sau khoảng {Math.round(KNOWN_STABILITY_MIN_DAYS / 30)}–{Math.round(KNOWN_STABILITY_MAX_DAYS / 30)} tháng: trả lời đúng thì từ ở lại Nhớ lâu và còn lâu mới gặp lại, sai thì học lại như từ thường.
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
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm font-bold shadow-md shadow-emerald-600/30 inline-flex items-center gap-2"
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
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              view === v
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
            }`}
          >
            {label}
          </button>
        ))}
        <label className="ml-auto relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm từ hoặc nghĩa..."
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-800 dark:text-zinc-200 w-52 focus:outline-none focus:border-emerald-500"
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
            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200"
          >
            <option value="check">{view === "waiting" ? "Sắp kiểm tra" : "Mới kiểm tra"}</option>
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
              ? 'Không có từ nào đang chờ kiểm tra. Khi gặp từ mới mà bạn đã biết, bấm "Đã biết" để bỏ qua phần giới thiệu.'
              : "Chưa có từ nào được kiểm tra."}
        </div>
      ) : (
        <>
          <div className="text-[11px] text-slate-500 dark:text-zinc-400">
            Hiển thị {current.from}–{current.to} trên {list.length} từ
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 divide-y divide-slate-100 dark:divide-zinc-800">
            {current.items.map((e) => (
              <KnownRow key={e.word.id} entry={e} onOpen={() => setSelectedWord(e.word)} onCheck={() => onCheckNow([e.word])} />
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

function KnownRow({ entry, onOpen, onCheck }: { entry: KnownEntry; onOpen: () => void; onCheck: () => void }) {
  const { word: w, status, markedAt, checkAt, rememberedLong } = entry;
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
                "—"
              )}
            </div>
          </>
        ) : (
          <>
            <div className="text-slate-400 dark:text-zinc-500">Kết quả</div>
            <span className={`inline-block px-1.5 py-0.5 rounded border font-semibold ${RESULT[status].cls}`}>
              {RESULT[status].label}
              {status === "confirmed" && rememberedLong ? " · Nhớ lâu" : ""}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1 ml-auto">
        <button
          onClick={(e) => handleSpeak(w.word, e)}
          aria-label={`Nghe "${w.word}"`}
          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-slate-100 dark:hover:bg-zinc-800"
        >
          <Volume2 className="w-4 h-4" />
        </button>
        {status === "waiting" && (
          <button
            onClick={onCheck}
            title="Hỏi lại từ này ngay để xác nhận"
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Kiểm tra ngay
          </button>
        )}
      </div>
    </div>
  );
}
