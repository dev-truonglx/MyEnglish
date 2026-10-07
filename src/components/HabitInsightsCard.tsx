import { useEffect, useState } from "react";
import { Sprout, Clock, BellRing, Lightbulb } from "lucide-react";
import type { WordDetail } from "@/types/database";
import { loadHabitInsights, type HabitInsights } from "@/services/habits";
import { MASTERED_STABILITY_DAYS } from "@/services/progress";

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);

function Bars({
  values,
  labelFor,
  tone,
  highlight,
  height = "h-24",
}: {
  values: number[];
  labelFor: (i: number) => string;
  tone: string;
  highlight?: Set<number>;
  height?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  return (
    <div className={`relative ${height} flex items-end gap-[3px]`} onMouseLeave={() => setHovered(null)}>
      {values.map((v, i) => (
        <div key={i} className="flex-1 h-full flex items-end" onMouseEnter={() => setHovered(i)}>
          <div
            className={`w-full rounded-t-[4px] ${tone} ${hovered === i || highlight?.has(i) ? "opacity-100" : "opacity-70"}`}
            style={{ height: `${v > 0 ? Math.max(4, (v / max) * 100) : 0}%` }}
          />
        </div>
      ))}
      {hovered !== null && (
        <div
          className="absolute -top-3 px-2 py-1 rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-mono pointer-events-none whitespace-nowrap"
          style={{ left: `min(${(hovered / values.length) * 100}%, calc(100% - 120px))` }}
        >
          {labelFor(hovered)}: {values[hovered]}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800">
      <div className="text-[11px] text-slate-500 dark:text-zinc-400">{label}</div>
      <div className="text-lg font-bold font-mono text-slate-900 dark:text-white">{value}</div>
      {sub && <div className="text-[10px] text-slate-400 dark:text-zinc-500">{sub}</div>}
    </div>
  );
}

/**
 * Progress that matters and the learner's real study rhythm: words that reached long-term memory each
 * week, the hours they study, and what happens to reminders (to tune when and how often they come).
 */
export default function HabitInsightsCard({ words }: { words: WordDetail[] }) {
  const [data, setData] = useState<HabitInsights | null>(null);

  useEffect(() => {
    const load = () => loadHabitInsights().then(setData).catch(() => {});
    load();
    window.addEventListener("words-changed", load);
    return () => window.removeEventListener("words-changed", load);
  }, []);

  if (!data) return null;
  const masteredNow = words.filter((w) => (w.srs.state ?? 0) === 2 && (w.srs.stability ?? 0) >= MASTERED_STABILITY_DAYS).length;
  const f = data.funnel;
  const topHours = new Set(
    data.studyHours
      .map((n, h) => ({ n, h }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)
      .map((x) => x.h)
  );
  const weekLabel = (i: number) => {
    const d = new Date(data.masteredWeeks[i].weekStart);
    return `Tuần ${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-6 shadow-sm">
      {/* Long-term memory growth */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sprout className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Từ vào trí nhớ dài hạn</h3>
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <div className="text-3xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">{masteredNow}</div>
            <div className="text-[11px] text-slate-500 dark:text-zinc-400">từ nhớ chắc (ổn định ≥ {MASTERED_STABILITY_DAYS} ngày)</div>
          </div>
          <div>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">+{data.masteredThisWeek}</div>
            <div className="text-[11px] text-slate-500 dark:text-zinc-400">
              tuần này{data.productionMasteredThisWeek > 0 ? ` · +${data.productionMasteredThisWeek} từ tự nhớ ra được` : ""}
            </div>
          </div>
        </div>
        <Bars values={data.masteredWeeks.map((w) => w.count)} labelFor={weekLabel} tone="bg-emerald-500" />
        <div className="flex justify-between text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
          <span>8 tuần trước</span>
          <span>Tuần này</span>
        </div>
      </div>

      {/* When the learner studies */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-300">
          <Clock className="w-3.5 h-3.5" /> Giờ bạn hay học ({data.days} ngày)
          {topHours.size > 0 && (
            <span className="ml-auto font-normal text-slate-500 dark:text-zinc-400">
              Nhiều nhất:{" "}
              {[...topHours]
                .sort((a, b) => a - b)
                .map((h) => `${h}h`)
                .join(", ")}
            </span>
          )}
        </div>
        <Bars values={data.studyHours} labelFor={(h) => `${h}h–${h + 1}h`} tone="bg-cyan-500" highlight={topHours} height="h-16" />
        <div className="flex justify-between text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
          <span>0h</span>
          <span>6h</span>
          <span>12h</span>
          <span>18h</span>
          <span>23h</span>
        </div>
      </div>

      {/* Reminders */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-300">
          <BellRing className="w-3.5 h-3.5" /> Lời nhắc ôn ({data.days} ngày)
        </div>
        {f.shown === 0 && f.popupShown === 0 ? (
          <p className="text-[11px] text-slate-400 dark:text-zinc-500">Chưa có dữ liệu — số liệu sẽ có sau vài lần nhắc.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile label="Lời nhắc đã hiện" value={String(f.shown)} />
            <Tile label="Mở ôn / trả lời nhanh" value={pct(f.responseRate)} sub={`${f.opened} lần`} />
            <Tile label="Hoãn / bỏ qua" value={`${f.snoozed} / ${f.ignored}`} />
            <Tile
              label="Phiên popup làm hết"
              value={pct(f.completionRate)}
              sub={`${f.popupCompleted}/${f.popupShown} phiên${f.popupClosedEarly ? ` · ${f.popupClosedEarly} đóng giữa chừng` : ""}`}
            />
          </div>
        )}
        {data.advice && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/60 text-xs text-cyan-900 dark:text-cyan-100">
            <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{data.advice}</span>
          </div>
        )}
      </div>
    </div>
  );
}
