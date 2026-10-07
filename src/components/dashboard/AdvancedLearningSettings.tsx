import { useEffect, useRef, useState } from "react";
import { Cpu, Download, Upload, RotateCcw, CalendarRange } from "lucide-react";
import {
  MIN_OPTIMIZER_CARDS,
  MIN_OPTIMIZER_REVIEWS,
  computePersonalWeights,
  getStoredWeights,
  loadTrainingItems,
  resetWeights,
  saveWeights,
  type OptimizerResult,
} from "@/services/fsrsOptimizer";
import { exportBackupJson, exportWordsCsv, importBackup, parseBackup } from "@/services/dataExport";
import { getFSRSSettings, saveFSRSSettings } from "@/services/srs";

const BOX = "p-4 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-2.5";
const BTN =
  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

/**
 * FSRS settings that need care: personal parameters (optimizer), the longest interval, and data
 * backup / restore. Shown under the retention and daily-limit settings.
 */
export default function AdvancedLearningSettings({ onWordsChanged }: { onWordsChanged?: () => void }) {
  const [data, setData] = useState<{ reviewCount: number; cardCount: number } | null>(null);
  const [stored, setStored] = useState(getStoredWeights);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<OptimizerResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [maxInterval, setMaxInterval] = useState(() => getFSRSSettings().maximumInterval);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTrainingItems()
      .then(({ reviewCount, cardCount }) => setData({ reviewCount, cardCount }))
      .catch(() => setData({ reviewCount: 0, cardCount: 0 }));
  }, [stored]);

  const enough = !!data && data.reviewCount >= MIN_OPTIMIZER_REVIEWS && data.cardCount >= MIN_OPTIMIZER_CARDS;
  const improves = result ? result.new_metrics.log_loss < result.default_metrics.log_loss : false;

  const runOptimizer = async () => {
    setRunning(true);
    setMessage(null);
    setResult(null);
    try {
      const { items } = await loadTrainingItems();
      setResult(await computePersonalWeights(items));
    } catch (err) {
      setMessage(`Không tối ưu được: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  const fmt = (x: number) => x.toFixed(4);

  return (
    <div className="space-y-3">
      {/* Personal FSRS parameters */}
      <div className={BOX}>
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <div className="text-xs font-bold text-slate-900 dark:text-white">Tối ưu theo trí nhớ của bạn</div>
          <span className="ml-auto text-[11px] font-mono text-slate-500 dark:text-zinc-400">
            {stored ? `Đang dùng tham số riêng (${new Date(stored.computedAt).toLocaleDateString("vi-VN")})` : "Đang dùng tham số mặc định"}
          </span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
          FSRS học lại 21 tham số từ chính lịch sử ôn của bạn (chỉ lượt ôn đúng lịch), để khoảng ôn khớp với tốc độ quên thật của bạn:
          ít lượt ôn thừa hơn mà vẫn giữ mục tiêu ghi nhớ. Cần ít nhất {MIN_OPTIMIZER_REVIEWS} lượt ôn trên {MIN_OPTIMIZER_CARDS} thẻ.
        </p>
        {data && (
          <div className="space-y-1">
            <div className="h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-cyan-500 rounded-full"
                style={{ width: `${Math.min(100, (data.reviewCount / MIN_OPTIMIZER_REVIEWS) * 100)}%` }}
              />
            </div>
            <div className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">
              {data.reviewCount}/{MIN_OPTIMIZER_REVIEWS} lượt ôn · {data.cardCount}/{MIN_OPTIMIZER_CARDS} thẻ
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={runOptimizer}
            disabled={!enough || running}
            className={`${BTN} bg-cyan-600 hover:bg-cyan-500 text-white`}
          >
            {running ? "Đang tối ưu..." : "Tối ưu ngay"}
          </button>
          {stored && (
            <button
              onClick={() => {
                resetWeights();
                setStored(null);
                setMessage("Đã quay về tham số mặc định.");
              }}
              className={`${BTN} border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 inline-flex items-center gap-1`}
            >
              <RotateCcw className="w-3 h-3" /> Khôi phục mặc định
            </button>
          )}
        </div>
        {result && (
          <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-[11px] space-y-2">
            <table className="w-full font-mono">
              <thead>
                <tr className="text-slate-500 dark:text-zinc-400 text-left">
                  <th className="font-medium">Sai số (thấp hơn = khớp hơn)</th>
                  <th className="font-medium text-right">Mặc định</th>
                  <th className="font-medium text-right">Của bạn</th>
                </tr>
              </thead>
              <tbody className="text-slate-800 dark:text-zinc-200">
                <tr>
                  <td>Log loss</td>
                  <td className="text-right">{fmt(result.default_metrics.log_loss)}</td>
                  <td className="text-right font-bold">{fmt(result.new_metrics.log_loss)}</td>
                </tr>
                <tr>
                  <td>RMSE</td>
                  <td className="text-right">{fmt(result.default_metrics.rmse)}</td>
                  <td className="text-right font-bold">{fmt(result.new_metrics.rmse)}</td>
                </tr>
              </tbody>
            </table>
            <p className={improves ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
              {improves
                ? "Tham số riêng dự đoán trí nhớ của bạn tốt hơn mặc định — nên áp dụng."
                : "Tham số riêng không tốt hơn mặc định — nên giữ mặc định và thử lại khi có thêm dữ liệu."}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  saveWeights(result);
                  setStored(getStoredWeights());
                  setResult(null);
                  setMessage("Đã áp dụng tham số riêng. Lịch ôn mới được tính từ lượt ôn tiếp theo.");
                }}
                className={`${BTN} bg-emerald-600 hover:bg-emerald-500 text-white`}
              >
                Áp dụng
              </button>
              <button onClick={() => setResult(null)} className={`${BTN} border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300`}>
                Bỏ qua
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Longest interval */}
      <div className={BOX}>
        <div className="flex items-center gap-2">
          <CalendarRange className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <div className="text-xs font-bold text-slate-900 dark:text-white">Khoảng ôn dài nhất</div>
          <span className="ml-auto text-sm font-bold text-cyan-600 dark:text-cyan-400 font-mono">{maxInterval} ngày</span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
          Từ đã thuộc rất chắc vẫn được hỏi lại ít nhất một lần trong khoảng này. Dài hơn = ít lượt ôn hơn cho từ đã vững.
        </p>
        <div className="grid grid-cols-4 gap-2">
          {[365, 730, 1825, 3650].map((val) => (
            <button
              key={val}
              onClick={() => {
                saveFSRSSettings({ maximumInterval: val });
                setMaxInterval(val);
              }}
              className={`py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                maxInterval === val
                  ? "bg-cyan-600 text-white shadow-sm font-bold"
                  : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-slate-300"
              }`}
            >
              {val >= 730 ? `${Math.round(val / 365)} năm` : "1 năm"}
            </button>
          ))}
        </div>
      </div>

      {/* Backup */}
      <div className={BOX}>
        <div className="text-xs font-bold text-slate-900 dark:text-white">Sao lưu & khôi phục dữ liệu</div>
        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
          File được lưu vào thư mục Downloads. Khôi phục chỉ thêm dữ liệu mới, không ghi đè từ và tiến độ đang có.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() =>
              exportBackupJson()
                .then((p) => setMessage(`Đã sao lưu toàn bộ dữ liệu: ${p}`))
                .catch((e) => setMessage(`Sao lưu lỗi: ${e}`))
            }
            className={`${BTN} bg-slate-900 dark:bg-white text-white dark:text-slate-900 inline-flex items-center gap-1`}
          >
            <Download className="w-3 h-3" /> Sao lưu (JSON)
          </button>
          <button
            onClick={() =>
              exportWordsCsv()
                .then((p) => setMessage(`Đã xuất danh sách từ: ${p}`))
                .catch((e) => setMessage(`Xuất CSV lỗi: ${e}`))
            }
            className={`${BTN} border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 inline-flex items-center gap-1`}
          >
            <Download className="w-3 h-3" /> Danh sách từ (CSV)
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className={`${BTN} border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 inline-flex items-center gap-1`}
          >
            <Upload className="w-3 h-3" /> Khôi phục từ file...
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const report = await importBackup(parseBackup(await file.text()));
                const added = report.inserted.words ?? 0;
                setMessage(
                  `Đã khôi phục ${added} từ mới (${report.inserted.review_logs ?? 0} lượt ôn)` +
                    (report.skippedExistingWords > 0 ? `, bỏ qua ${report.skippedExistingWords} từ đã có.` : ".")
                );
                onWordsChanged?.();
              } catch (err) {
                setMessage(`Không khôi phục được: ${err instanceof Error ? err.message : String(err)}`);
              }
            }}
          />
        </div>
      </div>

      {message && <p className="text-[11px] text-cyan-700 dark:text-cyan-300 break-all">{message}</p>}
    </div>
  );
}
