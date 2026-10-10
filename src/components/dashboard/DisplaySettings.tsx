import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import {
  getUiScale,
  isFoundationMode,
  isSimpleMode,
  setFoundationMode,
  setSimpleMode,
  setUiScale,
  UI_SCALES,
  type UiScale,
} from "@/services/learnerProfile";
import { englishVoices, getTtsSettings, handleSpeak, saveTtsSettings } from "../review/speech";

const SCALE_LABEL: Record<UiScale, string> = { 1: "Vừa", 1.1: "Lớn", 1.25: "Rất lớn" };

/** Settings for beginners: simple mode, foundation mode, text size, voice and speaking speed */
export default function DisplaySettings() {
  const [simple, setSimple] = useState(isSimpleMode);
  const [foundation, setFoundation] = useState(isFoundationMode);
  const [scale, setScale] = useState<UiScale>(getUiScale);
  const [tts, setTts] = useState(getTtsSettings);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(englishVoices);

  useEffect(() => {
    const load = () => setVoices(englishVoices());
    try {
      window.speechSynthesis.addEventListener("voiceschanged", load);
      return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
    } catch {
      return undefined;
    }
  }, []);

  const toggle = (label: string, hint: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex items-start justify-between gap-3 cursor-pointer">
      <div>
        <div className="text-xs font-bold text-slate-900 dark:text-white">{label}</div>
        <p className="text-[11px] text-slate-500 dark:text-zinc-400">{hint}</p>
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 accent-cyan-600" />
    </label>
  );

  return (
    <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-3">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Giao diện & giọng đọc</div>
      {toggle(
        "Chế độ đơn giản",
        "Ẩn thuật ngữ kỹ thuật của thuật toán (FSRS, độ bền S/D…), nút chấm bằng tiếng Việt, ít lựa chọn hơn trên màn hình.",
        simple,
        (v) => {
          setSimpleMode(v);
          setSimple(v);
        }
      )}
      {toggle(
        "Chế độ mất gốc (học lại từ đầu)",
        "Ưu tiên ngữ pháp nền tảng; chế độ Đọc chỉ coi từ chức năng (the, is, in…) là đã biết; bài tự gõ từ bắt đầu sau khi bạn đã nhận ra từ chắc chắn (7 ngày).",
        foundation,
        (v) => {
          setFoundationMode(v);
          setFoundation(v);
        }
      )}
      <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-zinc-800">
        <div className="text-xs font-bold text-slate-900 dark:text-white">Cỡ chữ</div>
        <div className="flex gap-2">
          {UI_SCALES.map((s) => (
            <button
              key={s}
              onClick={() => {
                setUiScale(s);
                setScale(s);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${scale === s
                ? "bg-cyan-600 text-white border-cyan-600"
                : "border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300"
                }`}
            >
              {SCALE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-zinc-800">
        <div className="text-xs font-bold text-slate-900 dark:text-white">Giọng đọc tiếng Anh</div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={tts.voiceURI}
            onChange={(e) => setTts(saveTtsSettings({ voiceURI: e.target.value }))}
            className="text-xs rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 max-w-[16rem]"
          >
            <option value="">Mặc định của máy</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-zinc-400">
            Tốc độ
            <input
              type="range"
              min={0.6}
              max={1.1}
              step={0.05}
              value={tts.rate}
              onChange={(e) => setTts(saveTtsSettings({ rate: Number(e.target.value) }))}
              className="accent-cyan-600"
            />
            <span className="font-mono w-8">{tts.rate.toFixed(2)}</span>
          </label>
          <button
            onClick={() => handleSpeak("Hello. I fixed the bug and pushed the code.")}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs"
          >
            <Volume2 className="w-3.5 h-3.5" /> Nghe thử
          </button>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
          Giọng "Enhanced"/"Premium" trên macOS nghe tự nhiên hơn (tải thêm trong Cài đặt hệ thống → Trợ năng → Nội dung được đọc).
        </p>
      </div>
    </div>
  );
}
