import { useEffect, useState } from "react";
import { Target, Gauge, CalendarClock, AlertTriangle } from "lucide-react";
import {
  loadLearningInsights,
  loadWorkloadForecast,
  type LearningInsights,
  type WorkloadForecast,
} from "@/services/progress";
import { saveStudyLimits } from "@/services/srs";

const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);

/** Retention needs this many review answers before it means anything */
const MIN_RETENTION_SAMPLE = 20;

function RetentionTile({ label, value, count, target }: { label: string; value: number | null; count: number; target: number }) {
  const enough = count >= MIN_RETENTION_SAMPLE && value != null;
  const delta = enough ? (value as number) - target : 0;
  const tone = !enough
    ? "text-slate-400 dark:text-zinc-500"
    : Math.abs(delta) <= 0.03
    ? "text-emerald-600 dark:text-emerald-400"
    : delta < 0
    ? "text-rose-600 dark:text-rose-400"
    : "text-sky-600 dark:text-sky-400";
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800">
      <div className="text-[11px] text-slate-500 dark:text-zinc-400">{label}</div>
      <div className={`text-xl font-bold font-mono ${tone}`}>{pct(value)}</div>
      <div className="text-[10px] text-slate-400 dark:text-zinc-500">
        {count} lượt ôn{count < MIN_RETENTION_SAMPLE ? " · chưa đủ dữ liệu" : ""}
      </div>
    </div>
  );
}

/**
 * How well the schedule fits this learner: true retention (answers to cards in Review state, the number
 * FSRS aims at the target), predicted vs actual recall, and the review load of the next 30 days.
 */
export default function LearningInsightsCard() {
  const [insights, setInsights] = useState<LearningInsights | null>(null);
  const [forecast, setForecast] = useState<WorkloadForecast | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const load = () => {
    loadLearningInsights(30).then(setInsights).catch(() => {});
    loadWorkloadForecast(30).then(setForecast).catch(() => {});
  };
  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener("words-changed", onChange);
    return () => window.removeEventListener("words-changed", onChange);
  }, []);

  if (!insights || !forecast) return null;
  const r = insights.retention;
  const maxDay = Math.max(1, forecast.maxSessionSize, ...forecast.days.map((d) => d.reviews));
  const suggestedNew = Math.max(2, Math.round(forecast.newCardsPerDay / 2));

  let advice: string | null = null;
  if (r.count >= MIN_RETENTION_SAMPLE && r.trueRetention != null) {
    if (r.trueRetention < r.targetRetention - 0.05) {
      advice =
        "Bạn đang nhớ ít hơn mục tiêu: khoảng ôn hiện dài hơn trí nhớ thật. Nên giảm số từ mới mỗi ngày, và khi đủ dữ liệu hãy chạy tối ưu tham số FSRS.";
    } else if (r.trueRetention > r.targetRetention + 0.05) {
      advice = "Bạn nhớ tốt hơn mục tiêu: có thể ôn thưa hơn (tối ưu tham số FSRS sẽ kéo dài khoảng ôn cho đúng với bạn).";
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Hiệu quả ghi nhớ (30 ngày)</h3>
        <span className="ml-auto text-[11px] text-slate-400 dark:text-zinc-500">
          Mục tiêu: {pct(r.targetRetention)} · {insights.minutesPerActiveDay.toFixed(1)} phút/ngày học
        </span>
      </div>

      {/* True retention */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <RetentionTile label="Tỉ lệ nhớ thật" value={r.trueRetention} count={r.count} target={r.targetRetention} />
        <RetentionTile label="Nhận diện (EN→VN)" value={r.recognition.retention} count={r.recognition.count} target={r.targetRetention} />
        <RetentionTile label="Tự nhớ ra từ" value={r.production.retention} count={r.production.count} target={r.targetRetention} />
        <RetentionTile label="Từ còn non (< 21 ngày)" value={r.young.retention} count={r.young.count} target={r.targetRetention} />
      </div>
      <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
        Chỉ tính lượt ôn đúng lịch của thẻ đã thuộc (không tính từ mới, luyện thêm hay làm lại) — đây là con số FSRS
        nhắm tới mục tiêu. Gần mục tiêu ±3% là lịch ôn đang khớp với trí nhớ của bạn.
      </p>
      {advice && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{advice}</span>
        </div>
      )}

      {/* Calibration */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-300">
          <Gauge className="w-3.5 h-3.5" /> Dự đoán của FSRS so với thực tế
        </div>
        {insights.calibration.length === 0 ? (
          <p className="text-[11px] text-slate-400 dark:text-zinc-500">Chưa có lượt ôn nào của thẻ đã thuộc kể từ khi bắt đầu ghi dữ liệu này.</p>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-slate-500 dark:text-zinc-400 text-left">
                <th className="font-medium py-1">Khả năng nhớ dự đoán</th>
                <th className="font-medium py-1 text-right">Dự đoán</th>
                <th className="font-medium py-1 text-right">Thực tế</th>
                <th className="font-medium py-1 text-right">Số lượt</th>
              </tr>
            </thead>
            <tbody>
              {insights.calibration.map((b) => (
                <tr key={b.label} className="border-t border-slate-100 dark:border-zinc-800/80">
                  <td className="py-1.5 font-mono text-slate-700 dark:text-zinc-300">{b.label}</td>
                  <td className="py-1.5 text-right font-mono text-slate-600 dark:text-zinc-400">{pct(b.predicted)}</td>
                  <td className="py-1.5 text-right font-mono font-semibold text-slate-900 dark:text-white">{pct(b.actual)}</td>
                  <td className="py-1.5 text-right font-mono text-slate-400 dark:text-zinc-500">{b.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Workload forecast */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-300">
          <CalendarClock className="w-3.5 h-3.5" /> Lượt ôn đến hạn 30 ngày tới
          <span className="ml-auto font-normal text-slate-500 dark:text-zinc-400">
            TB 7 ngày tới: {forecast.averagePerDay.toFixed(1)}/ngày · 1 phiên = {forecast.maxSessionSize} thẻ
          </span>
        </div>
        <div className="relative h-28 flex items-end gap-[2px]" onMouseLeave={() => setHovered(null)}>
          {/* Session-size reference line */}
          <div
            className="absolute left-0 right-0 border-t border-dashed border-slate-300 dark:border-zinc-700 pointer-events-none"
            style={{ bottom: `${(forecast.maxSessionSize / maxDay) * 100}%` }}
          />
          {forecast.days.map((d, i) => (
            <div
              key={d.date}
              className="flex-1 h-full flex items-end cursor-default"
              onMouseEnter={() => setHovered(i)}
            >
              <div
                className={`w-full rounded-t-[4px] ${
                  hovered === i ? "bg-cyan-700 dark:bg-cyan-300" : "bg-cyan-500 dark:bg-cyan-500"
                }`}
                style={{ height: `${Math.max(d.reviews > 0 ? 3 : 0, (d.reviews / maxDay) * 100)}%` }}
              />
            </div>
          ))}
          {hovered !== null && (
            <div
              className="absolute -top-2 px-2 py-1 rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-mono pointer-events-none whitespace-nowrap"
              style={{ left: `min(calc(${(hovered / forecast.days.length) * 100}% ), calc(100% - 110px))` }}
            >
              {hovered === 0 ? "Hôm nay (gồm quá hạn)" : forecast.days[hovered].date}: {forecast.days[hovered].reviews} lượt
            </div>
          )}
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
          <span>Hôm nay</span>
          <span>+15 ngày</span>
          <span>+30 ngày</span>
        </div>
        {forecast.overloaded && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-800 dark:text-rose-200">
            <span>
              Trung bình mỗi ngày cần ôn nhiều hơn một phiên. Từ mới sẽ làm tải tăng thêm — nên giảm còn {suggestedNew} từ mới/ngày cho tới khi
              hết tồn đọng.
            </span>
            <button
              onClick={() => {
                saveStudyLimits({ newCardsPerDay: suggestedNew });
                setApplied(`Đã đặt ${suggestedNew} từ mới/ngày`);
                load();
              }}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold"
            >
              Áp dụng
            </button>
          </div>
        )}
        {applied && <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{applied}</p>}
      </div>
    </div>
  );
}
