import { useState } from "react";
import { AlertTriangle, Layers, Loader2 } from "lucide-react";
import type { StudyLevel } from "@/services/vocabCatalog";
import { defaultStudyLevelsFor, setStudyLevels, topUpNewWords } from "@/services/vocabFeed";
import { resetVocabulary } from "@/services/vocabReset";
import { exportBackupJson } from "@/services/dataExport";
import { getUserOverrideLevel } from "@/services/userProficiency";
import { LevelPicker, mixDescription } from "./dashboard/VocabTab";

interface VocabSetupScreenProps {
  /** "migrate": words from before the Oxford deck exist and must be cleared first; "levels": just choose levels */
  mode: "migrate" | "levels";
  onDone: () => void;
}

/**
 * Shown once when the vocabulary becomes the Oxford deck: nothing is deleted until the learner confirms,
 * and a full backup is written to Downloads first. Then the levels to study.
 */
export default function VocabSetupScreen({ mode, onDone }: VocabSetupScreenProps) {
  const [step, setStep] = useState<"migrate" | "levels">(mode);
  const [levels, setLevels] = useState<StudyLevel[]>(() => defaultStudyLevelsFor(getUserOverrideLevel()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [backupFailed, setBackupFailed] = useState(false);

  const reset = async (withBackup: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (withBackup) {
        try {
          setBackupPath(await exportBackupJson());
        } catch (err) {
          setBackupFailed(true);
          setError(`Không sao lưu được: ${err}. Chưa có gì bị xoá.`);
          return;
        }
      }
      await resetVocabulary();
      setStep("levels");
    } catch (err) {
      setError(`Không xoá được dữ liệu cũ: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setStudyLevels(levels);
      await topUpNewWords();
      onDone();
    } catch (err) {
      setError(`Không chuẩn bị được từ vựng: ${err}`);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 space-y-5">
        {step === "migrate" ? (
          <>
            <div className="space-y-2">
              <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
                <Layers className="w-5 h-5 text-cyan-600" /> Từ vựng chuyển sang bộ Oxford 5000
              </h2>
              <p className="text-sm text-slate-600 dark:text-zinc-300">
                Từ nay app dùng một bộ từ duy nhất: <b>5.004 từ Oxford 3000 và 5000</b>, từ A1 đến C1, có nghĩa tiếng Việt theo từ loại, câu ví dụ Anh–Việt và phiên âm. Bạn chọn cấp muốn học, mỗi ngày app đưa vào vài từ mới.
              </p>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-sm text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p>
                  Toàn bộ từ vựng hiện có, cùng lịch ôn và lịch sử ôn, sẽ bị <b>xoá</b>; bạn học lại từ A1 (từ nào đã biết thì bấm "Đã biết" là bỏ qua).
                </p>
                <p>Được giữ lại: ngữ pháp, phát âm, sổ lỗi, chuỗi ngày học, XP, huy hiệu và cài đặt.</p>
                <p>Trước khi xoá, app sao lưu toàn bộ dữ liệu vào thư mục Downloads.</p>
              </div>
            </div>
            {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
            <div className="flex items-center justify-end gap-3">
              {backupFailed && (
                <button
                  onClick={() => reset(false)}
                  disabled={busy}
                  className="text-xs text-rose-600 hover:underline disabled:opacity-50"
                >
                  Xoá mà không sao lưu
                </button>
              )}
              <button
                onClick={() => reset(true)}
                disabled={busy}
                className="inline-flex items-center gap-2 py-2.5 px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 !text-white text-sm font-semibold disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Sao lưu & bắt đầu lại
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Bạn muốn học từ vựng cấp nào?</h2>
              {backupPath && <p className="text-xs text-emerald-700 dark:text-emerald-400">Đã sao lưu vào {backupPath}</p>}
              <p className="text-sm text-slate-500 dark:text-zinc-400">
                Việc học luôn bắt đầu từ A1; chọn thêm cấp cao hơn để trộn vào. Đổi lại lúc nào cũng được trong tab Lộ trình từ vựng.
              </p>
            </div>
            <LevelPicker value={levels} onChange={setLevels} disabled={busy} />
            <p className="text-xs text-slate-500 dark:text-zinc-400">{mixDescription(levels)}</p>
            {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
            <div className="flex justify-end">
              <button
                onClick={start}
                disabled={busy}
                className="inline-flex items-center gap-2 py-2.5 px-5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 !text-white text-sm font-semibold disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Bắt đầu học
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
