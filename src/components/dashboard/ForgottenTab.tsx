import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Bug, ChevronDown, Crosshair, Lightbulb, Play, Settings2, Sparkles, Volume2 } from "lucide-react";
import type { WordDetail } from "@/types/database";
import { useWordsStore } from "@/stores/wordsStore";
import { getLeechSettings, saveLeechSettings, type ExerciseType, type LeechSettings } from "@/services/smartReview";
import {
  FORGOTTEN_SESSION_MAX,
  FORGOTTEN_WINDOW_DAYS,
  loadForgottenWords,
  pickSessionWords,
  type ForgottenEntry,
  type ForgottenWords,
} from "@/services/forgottenWords";
import { setWordSuspended } from "@/services/reviewRecorder";
import { generateSmartMnemonic, getStoredMnemonic } from "@/services/aiMnemonic";
import { pipeline } from "@/services/pipeline";
import { AI_VOCAB_ENABLED } from "@/services/features";
import { getFocusSettings } from "@/services/focusSettings";
import { EXERCISE_LABEL_VN } from "../review/exerciseLabels";
import { handleSpeak, PAGE_CONTAINER } from "./shared";
import { formatNextReviewRelative } from "@/utils/reviewSchedule";

interface ForgottenTabProps {
  /** Review these words: due cards graded, the others practice only */
  onStartSession: (words: WordDetail[]) => void;
  /** The same words as a focus session */
  onStartFocus: (words: WordDetail[], minutes: number) => void;
  onRefreshWords: () => void;
}

type View = "active" | "recovered" | "suspended";
type Sort = "score" | "wrong" | "recent";

function timeAgo(t: number | null, now = Date.now()): string | null {
  if (t == null) return null;
  const days = Math.floor((now - t) / (24 * 3600 * 1000));
  if (days <= 0) return "hôm nay";
  if (days === 1) return "hôm qua";
  return `${days} ngày trước`;
}

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="p-3 rounded-xl bg-white dark:bg-zinc-900/80 border border-rose-100 dark:border-rose-900/40">
      <div className="text-[11px] text-slate-500 dark:text-zinc-400">{label}</div>
      <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">{value}</div>
      {sub && <div className="text-[10px] text-slate-400 dark:text-zinc-500">{sub}</div>}
    </div>
  );
}

/**
 * "Từ hay quên": the words the learner keeps getting wrong (see services/forgottenWords), why, one button to
 * review them, the ones won back, the suspended ones, and the leech settings (moved here from Tiến độ).
 */
export default function ForgottenTab({ onStartSession, onStartFocus, onRefreshWords }: ForgottenTabProps) {
  const words = useWordsStore((s) => s.words);
  const setSelectedWord = useWordsStore((s) => s.setSelectedWord);
  const [data, setData] = useState<ForgottenWords | null>(null);
  const [view, setView] = useState<View>("active");
  const [sort, setSort] = useState<Sort>("score");
  const [leechSettings, setLeechSettings] = useState<LeechSettings>(getLeechSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mnemonic, setMnemonic] = useState<{ id: string; text: string | null } | null>(null);
  const mnemonicFor = useRef<string | null>(null);

  useEffect(() => {
    let stale = false;
    loadForgottenWords(words)
      .then((d) => !stale && setData(d))
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [words, leechSettings]);

  const list = useMemo(() => {
    if (!data) return [];
    const entries = [...data[view]];
    if (view === "active" && sort === "wrong") entries.sort((a, b) => (b.stats?.wrong ?? 0) - (a.stats?.wrong ?? 0) || b.score - a.score);
    if (view === "active" && sort === "recent") entries.sort((a, b) => (b.stats?.lastWrongAt ?? 0) - (a.stats?.lastWrongAt ?? 0));
    return entries;
  }, [data, view, sort]);

  const sessionWords = useMemo(() => (data ? pickSessionWords(data.active) : []), [data]);
  const recoveredRecently = data ? data.recovered.filter((e) => e.stats?.lastWrongAt != null).length : 0;
  const focusMinutes = getFocusSettings().minutes;

  const showMnemonic = async (w: WordDetail) => {
    mnemonicFor.current = w.id;
    const existing = getStoredMnemonic(w.id, w.meaning_vn);
    setMnemonic({ id: w.id, text: existing });
    if (existing) return;
    const generated = await generateSmartMnemonic(w);
    if (mnemonicFor.current === w.id) setMnemonic({ id: w.id, text: generated });
  };

  const suspend = async (w: WordDetail, on: boolean) => {
    await setWordSuspended(w.id, on);
    setMessage(on ? `Đã tạm ngưng "${w.word}"` : `Đã đưa "${w.word}" trở lại lịch ôn`);
    onRefreshWords();
  };

  const updateLeech = (patch: Partial<LeechSettings>) => {
    saveLeechSettings(patch);
    setLeechSettings(getLeechSettings());
  };

  const trend = data ? data.wrongLast7 - data.wrongPrev7 : 0;

  return (
    <div className={`${PAGE_CONTAINER} space-y-6`}>
      {/* Header: what this is, three numbers, the one action */}
      <div className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/30 dark:to-zinc-900 p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center text-rose-500 shrink-0">
            <Bug className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Từ hay quên
              {data && data.active.length > 0 && <span className="ml-2 text-rose-500 font-mono">({data.active.length})</span>}
            </h2>
            <p className="text-sm text-slate-600 dark:text-zinc-300">
              Những từ bạn trả lời sai từ 2 lần trong {FORGOTTEN_WINDOW_DAYS} ngày, hoặc đã quên nhiều lần. Ôn riêng nhóm này
              là cách nhanh nhất để hết quên.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <Tile label="Đang hay quên" value={data ? data.active.length : "…"} sub={data ? `${data.active.filter((e) => e.dueNow).length} từ đến hạn ôn` : null} />
          <Tile
            label="Câu sai 7 ngày qua"
            value={data ? data.wrongLast7 : "…"}
            sub={
              data && (data.wrongLast7 > 0 || data.wrongPrev7 > 0) ? (
                <span className={`inline-flex items-center gap-0.5 ${trend <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {trend <= 0 ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                  {trend === 0 ? "như tuần trước" : `${Math.abs(trend)} so với tuần trước (${data.wrongPrev7})`}
                </span>
              ) : (
                "so với tuần trước"
              )
            }
          />
          <Tile label="Đã nhớ lại" value={data ? recoveredRecently : "…"} sub="từng hay sai, nay đã vững" />
        </div>

        {data && data.active.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onStartSession(sessionWords)}
              autoFocus
              className="px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white text-sm font-bold shadow-md shadow-rose-600/30 inline-flex items-center gap-2 transition-all"
            >
              <Play className="w-4 h-4 fill-white" /> Ôn {sessionWords.length} từ hay quên
            </button>
            <button
              onClick={() => onStartFocus(sessionWords, focusMinutes)}
              title="Ôn nhóm này trong một phiên tập trung: ẩn mọi thứ khác, tắt nhắc nhở"
              className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold inline-flex items-center gap-1.5 shadow-sm shadow-violet-600/30"
            >
              <Crosshair className="w-4 h-4" /> Tập trung {focusMinutes}′
            </button>
            <span className="text-xs text-slate-500 dark:text-zinc-400">
              {data.active.length > FORGOTTEN_SESSION_MAX ? `${FORGOTTEN_SESSION_MAX} từ khó nhất trước. ` : ""}
              Từ chưa đến hạn chỉ luyện thêm, lịch ôn không đổi.
            </span>
          </div>
        )}
      </div>

      {/* Groups and order */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["active", `Đang hay quên (${data?.active.length ?? 0})`],
            ["recovered", `Đã nhớ lại (${data?.recovered.length ?? 0})`],
            ["suspended", `Tạm ngưng (${data?.suspended.length ?? 0})`],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              view === v
                ? "bg-rose-600 text-white"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
            }`}
          >
            {label}
          </button>
        ))}
        {view === "active" && (
          <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
            Sắp xếp
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200"
            >
              <option value="score">Cần ôn nhất</option>
              <option value="wrong">Sai nhiều nhất</option>
              <option value="recent">Sai gần nhất</option>
            </select>
          </label>
        )}
      </div>

      {view === "suspended" ? (
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Từ tạm ngưng được bỏ ra khỏi mọi lượt ôn: phiên học, phiên tập trung, popup và nhắc nhở. Lịch ôn của từ đứng yên
          cho đến khi bạn bấm "Ôn lại". Từ vào đây khi bạn bấm "Tạm ngưng", hoặc tự động khi thành từ khó nếu "Cài đặt từ
          khó" đang chọn "Tạm ngưng ôn". Dùng cho từ bạn chưa muốn học lúc này (quá khó, ít dùng); đừng để quá lâu, vì
          từ không được ôn sẽ dần quên hẳn.
        </p>
      ) : (
        <p className="text-xs text-slate-500 dark:text-zinc-400 inline-flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Thanh "nhớ %": khả năng bạn còn nhớ từ ngay lúc này, giảm dần theo thời gian và tăng lại sau mỗi lần ôn đúng.</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> ≥ 85% vững</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> 70–84% sắp quên</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> &lt; 70% nên ôn ngay</span>
        </p>
      )}

      {message && <p className="text-xs text-emerald-600 dark:text-emerald-400">{message}</p>}

      {!data ? (
        <div className="h-32 rounded-2xl bg-slate-100 dark:bg-zinc-900 animate-pulse" />
      ) : list.length === 0 ? (
        <div className="text-center py-10 text-sm text-slate-500 dark:text-zinc-400">
          {view === "active"
            ? "Chưa có từ nào hay quên 🎉. Từ bạn trả lời sai từ 2 lần sẽ hiện ở đây."
            : view === "recovered"
              ? "Chưa có từ nào. Ôn các từ hay quên đến khi đúng 3 lần liền là chúng chuyển sang đây."
              : "Không có từ nào đang tạm ngưng."}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {list.map((e) => (
            <ForgottenRow
              key={e.word.id}
              entry={e}
              mnemonic={mnemonic?.id === e.word.id ? mnemonic.text : undefined}
              onOpen={() => setSelectedWord(e.word)}
              onReview={() => onStartSession([e.word])}
              onMnemonic={() => showMnemonic(e.word)}
              onSuspend={(on) => suspend(e.word, on)}
              onRegenerate={
                AI_VOCAB_ENABLED
                  ? () =>
                      pipeline
                        .enqueue(e.word.word)
                        .then((res) =>
                          setMessage(res.accepted ? `AI đang tạo lại nghĩa & ví dụ mới cho "${e.word.word}"...` : `Không thể phân tích lại: ${res.reason}`)
                        )
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Leech settings (were at the bottom of Tiến độ) */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <button
          onClick={() => setShowSettings((s) => !s)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-zinc-200"
        >
          <Settings2 className="w-4 h-4 text-slate-400" /> Cài đặt từ khó
          <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showSettings ? "rotate-180" : ""}`} />
        </button>
        {showSettings && (
          <div className="px-4 pb-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500 dark:text-zinc-400">Coi là "Từ khó" khi đã quên từ:</span>
              {[2, 3, 4, 5].map((t) => (
                <button
                  key={t}
                  onClick={() => updateLeech({ threshold: t })}
                  className={`px-2 py-0.5 rounded font-mono font-bold ${
                    leechSettings.threshold === t
                      ? "bg-rose-500 text-white"
                      : "border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {t} lần
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500 dark:text-zinc-400">Khi một từ thành từ khó:</span>
              {(
                [
                  ["highlight", "Chỉ đánh dấu"],
                  ["relearn", "Học lại như từ mới (xem lại nghĩa, ví dụ trước khi hỏi)"],
                  ["suspend", "Tạm ngưng ôn (xử lý tay sau)"],
                ] as const
              ).map(([action, label]) => (
                <button
                  key={action}
                  onClick={() => updateLeech({ action })}
                  className={`px-2 py-0.5 rounded-md border transition-colors ${
                    leechSettings.action === action
                      ? "bg-rose-500 text-white border-rose-500"
                      : "border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-slate-400 dark:text-zinc-500">
              Từ khó được ôn bằng dạng bài dễ hơn và kèm mẹo nhớ. Danh sách "Từ hay quên" ở trên rộng hơn: mọi từ sai từ 2 lần.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ForgottenRow({
  entry,
  mnemonic,
  onOpen,
  onReview,
  onMnemonic,
  onSuspend,
  onRegenerate,
}: {
  entry: ForgottenEntry;
  /** undefined: not opened; null: being generated */
  mnemonic: string | null | undefined;
  onOpen: () => void;
  onReview: () => void;
  onMnemonic: () => void;
  onSuspend: (on: boolean) => void;
  onRegenerate?: () => void;
}) {
  const { word: w, stats, lapses, leech, retrievability, status, weakType, nextReview, dueNow } = entry;
  const r = retrievability == null ? null : Math.round(retrievability * 100);
  const last = timeAgo(stats?.lastWrongAt ?? null);
  // The earliest of the two cards; the tooltip has each card's date
  const next = nextReview.earliest ? formatNextReviewRelative(nextReview.earliest) : null;
  const cardDate = (d: Date | null) => (d ? formatNextReviewRelative(d).exactDateStr : null);
  const nextTitle = [
    nextReview.recognition && `Nhận ra nghĩa: ${cardDate(nextReview.recognition)}`,
    nextReview.production && `Tự nhớ ra từ: ${cardDate(nextReview.production)}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 shadow-sm space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-slate-900 dark:text-white">{w.word}</span>
            {w.phonetic && <span className="text-xs font-mono text-slate-400 dark:text-zinc-500">{w.phonetic}</span>}
          </div>
          <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-1">{w.meaning_vn}</p>
        </button>
        <button
          onClick={(e) => handleSpeak(w.word, e)}
          aria-label={`Nghe "${w.word}"`}
          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-slate-100 dark:hover:bg-zinc-800 shrink-0"
        >
          <Volume2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
        {stats && stats.wrong > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
            Sai {stats.wrong} lần / {FORGOTTEN_WINDOW_DAYS} ngày
          </span>
        )}
        {lapses > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400">Quên {lapses} lần</span>
        )}
        {leech && <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white">Từ khó</span>}
        {status === "recovered" && (
          <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400">
            ✓ Đúng {stats?.rightSinceWrong ?? 0} lần liền
          </span>
        )}
      </div>

      <div className="text-[11px] text-slate-500 dark:text-zinc-400 space-y-0.5">
        <div className="flex items-center gap-1.5" title={nextTitle || undefined}>
          Lịch ôn tiếp:
          {status === "suspended" ? (
            <span className="text-slate-400 dark:text-zinc-500">không có (đang tạm ngưng)</span>
          ) : dueNow ? (
            <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 font-semibold">
              {next && next.diffMs < 0 ? next.label : "Đến hạn ôn"}
            </span>
          ) : next ? (
            <span className={`px-1.5 py-0.5 rounded font-semibold ${next.badgeClass}`}>
              {next.label} · {next.exactDateStr}
            </span>
          ) : (
            <span>chưa có</span>
          )}
        </div>
        {last && <div>Sai gần nhất: {last}</div>}
        {weakType && <div>Hay sai ở dạng: {EXERCISE_LABEL_VN[weakType as ExerciseType] ?? weakType}</div>}
      </div>

      {r != null && (
        <div
          className="flex items-center gap-2"
          title={`Khả năng bạn còn nhớ từ này ngay lúc này (theo FSRS): ${r}%. Giảm dần theo thời gian kể từ lần ôn cuối, tăng lại sau mỗi lần trả lời đúng. Xanh ≥ 85%, vàng 70–84%, đỏ < 70% (nên ôn sớm).`}
        >
          <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
            <div
              className={`h-full rounded-full ${r >= 85 ? "bg-emerald-500" : r >= 70 ? "bg-amber-500" : "bg-rose-500"}`}
              style={{ width: `${r}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">nhớ {r}%</span>
        </div>
      )}

      {mnemonic !== undefined && (
        <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
          {mnemonic ?? "Đang tạo mẹo nhớ…"}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-0.5 text-xs">
        {status === "suspended" ? (
          <button onClick={() => onSuspend(false)} className="text-cyan-600 dark:text-cyan-400 hover:underline">
            Ôn lại
          </button>
        ) : (
          <button
            onClick={onReview}
            className="px-2.5 py-1 rounded-lg font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60"
          >
            Ôn từ này
          </button>
        )}
        <button onClick={onMnemonic} className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:underline">
          <Lightbulb className="w-3.5 h-3.5" /> Mẹo nhớ
        </button>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            title="Ví dụ mới cho bối cảnh mới: nhớ lại từ nhiều ngữ cảnh khác nhau giúp hết quên"
            className="inline-flex items-center gap-1 text-cyan-600 dark:text-cyan-400 hover:underline"
          >
            <Sparkles className="w-3.5 h-3.5" /> Ví dụ mới (AI)
          </button>
        )}
        {status !== "suspended" && (
          <button onClick={() => onSuspend(true)} className="ml-auto text-slate-400 dark:text-zinc-500 hover:underline">
            Tạm ngưng
          </button>
        )}
      </div>
    </div>
  );
}
