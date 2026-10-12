import { useState } from "react";
import { BookOpen, Sparkles, CheckCircle2 } from "lucide-react";
import { DEFAULT_INITIAL_TENSE_IDS, saveInitialTenses } from "@/services/grammarPath";
import TenseSelectionPicker from "./TenseSelectionPicker";

interface GrammarTenseSetupModalProps {
  onDone: () => void;
}

export default function GrammarTenseSetupModal({ onDone }: GrammarTenseSetupModalProps) {
  const [selectedTenses, setSelectedTenses] = useState<string[]>([...DEFAULT_INITIAL_TENSE_IDS]);
  const [saving, setSaving] = useState(false);

  const handleConfirm = () => {
    setSaving(true);
    try {
      saveInitialTenses(selectedTenses);
      onDone();
    } catch (err) {
      console.warn("Failed to save initial tenses:", err);
      onDone();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 space-y-5">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Chọn thì bắt đầu học
              </h2>
              <span className="text-xs text-cyan-700 dark:text-cyan-400 font-medium inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Lộ trình ngữ pháp tinh gọn cho người mất gốc
              </span>
            </div>
          </div>

          <p className="text-sm text-slate-600 dark:text-zinc-300 leading-relaxed pt-1">
            Trước đây app tự động bật toàn bộ các chương và các thì, dễ gây ngợp khi làm bài và kiểm tra. Giờ đây bạn có thể chọn thì mình muốn tập trung học trước — mặc định là <b>Thì hiện tại đơn</b>.
          </p>
        </div>

        {/* Tense picker */}
        <TenseSelectionPicker value={selectedTenses} onChange={setSelectedTenses} />

        {/* Bottom actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-zinc-800">
          <span className="text-xs text-slate-500 dark:text-zinc-400">
            Có thể thay đổi bất cứ lúc nào trong tab <b>Ngữ pháp</b>
          </span>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || selectedTenses.length === 0}
            className="inline-flex items-center gap-2 py-2.5 px-6 rounded-xl bg-cyan-600 hover:bg-cyan-500 !text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4" />
            Xác nhận & Bắt đầu học
          </button>
        </div>
      </div>
    </div>
  );
}
