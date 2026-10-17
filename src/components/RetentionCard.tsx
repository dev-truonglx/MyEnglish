import { useEffect, useState, type ReactNode } from "react";
import { Repeat, ArrowUp, ArrowDown, Timer } from "lucide-react";
import { loadRetentionInsights, MIN_GROUP_DAYS, type Rate, type RetentionInsights } from "@/services/retention";

const pct = (r: Rate) => (r.rate == null ? "—" : `${Math.round(r.rate * 100)}%`);

function Delta({ now, before }: { now: Rate; before: Rate }) {
  if (now.rate == null || before.rate == null) return null;
  const diff = Math.round((now.rate - before.rate) * 100);
  if (diff === 0) return <span className="text-[10px] text-slate-400 dark:text-zinc-500">như 30 ngày trước</span>;
  const up = diff > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] ${up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(diff)} điểm so với 30 ngày trước
    </span>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: ReactNode }) {
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800">
      <div className="text-[11px] text-slate-500 dark:text-zinc-400">{label}</div>
      <div className="text-lg font-bold font-mono text-slate-900 dark:text-white">{value}</div>
      {sub && <div className="text-[10px] text-slate-400 dark:text-zinc-500">{sub}</div>}
    </div>
  );
}

/**
 * Coming back to study: next day (D1), a week later (D7), study days in the following week, and whether days
 * with a completed focus session bring the learner back more often than days without.
 */
export default function RetentionCard() {
  const [data, setData] = useState<RetentionInsights | null>(null);

  useEffect(() => {
    const load = () => loadRetentionInsights().then(setData).catch(() => {});
    load();
    window.addEventListener("words-changed", load);
    return () => window.removeEventListener("words-changed", load);
  }, []);

  if (!data) return null;
  const { current, previous, withFocus, withoutFocus, focus } = data;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Repeat className="w-4 h-4 text-cyan-500" />
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Thói quen quay lại</h3>
        <span className="text-[11px] text-slate-400 dark:text-zinc-500">{data.windowDays} ngày gần nhất</span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Tile label="Học lại hôm sau (D1)" value={pct(current.d1)} sub={<Delta now={current.d1} before={previous.d1} />} />
        <Tile label="Học lại sau 1 tuần (D7)" value={pct(current.d7)} sub={<Delta now={current.d7} before={previous.d7} />} />
        <Tile
          label="Ngày học trong 7 ngày sau"
          value={current.daysInNextWeek == null ? "—" : `${current.daysInNextWeek.toFixed(1)}/7`}
          sub="trung bình sau mỗi ngày học"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300">
          <Timer className="w-3.5 h-3.5 text-violet-500" /> Phiên tập trung
        </div>
        {focus.sessions === 0 ? (
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Chưa có phiên tập trung nào. Bấm "Phiên tập trung" ở tab Hôm nay để học trọn 10 phút không bị nhắc nhở.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3">
            <Tile label="Số phiên" value={String(focus.sessions)} sub={`${focus.completed} xong · ${focus.abandoned} bỏ dở`} />
            <Tile label="Hoàn thành" value={focus.completionRate == null ? "—" : `${Math.round(focus.completionRate * 100)}%`} />
            <Tile label="Phút / phiên" value={focus.avgMinutes == null ? "—" : focus.avgMinutes.toFixed(1)} sub="thời gian học thật" />
            <Tile label="Đúng ngay lần đầu" value={focus.firstTryRate == null ? "—" : `${Math.round(focus.firstTryRate * 100)}%`} />
          </div>
        )}
        {focus.completed > 0 &&
          (withFocus && withoutFocus ? (
            <p className="text-xs text-slate-600 dark:text-zinc-300">
              Học lại hôm sau: <b>{pct(withFocus.d1)}</b> sau ngày có phiên tập trung, <b>{pct(withoutFocus.d1)}</b> sau ngày không có.
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Cần thêm dữ liệu: so sánh ngày có và không có phiên tập trung khi mỗi loại có ít nhất {MIN_GROUP_DAYS} ngày.
            </p>
          ))}
      </div>
    </div>
  );
}
