import { useState, useEffect } from "react";
import { AlertTriangle, RotateCcw, Loader2, CheckCircle2, X } from "lucide-react";
import { resetAllAppData } from "@/services/appReset";

interface ResetAppDataModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ResetAppDataModal({ isOpen, onClose }: ResetAppDataModalProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetStage, setResetStage] = useState<string>("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset form states when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setConfirmed(false);
      setIsResetting(false);
      setResetStage("");
      setIsSuccess(false);
      setErrorMsg(null);
    }
  }, [isOpen]);

  // Handle ESC key to dismiss (only when not resetting)
  useEffect(() => {
    if (!isOpen || isResetting) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isResetting, onClose]);

  if (!isOpen) return null;

  const handleConfirmReset = async () => {
    if (!confirmed || isResetting) return;

    setIsResetting(true);
    setErrorMsg(null);

    try {
      const ok = await resetAllAppData({
        onProgress: (stage) => setResetStage(stage),
      });

      if (ok) {
        setIsSuccess(true);
        setResetStage("Đặt lại thành công! Đang khởi động lại ứng dụng...");
        setTimeout(() => {
          if (typeof window !== "undefined" && typeof window.location?.reload === "function") {
            window.location.reload();
          }
        }, 800);
      } else {
        setErrorMsg("Không thể hoàn tất việc đặt lại dữ liệu. Vui lòng thử lại sau.");
        setIsResetting(false);
      }
    } catch (err) {
      console.error("Reset data error:", err);
      setErrorMsg(`Đã xảy ra lỗi: ${err instanceof Error ? err.message : String(err)}`);
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-3xl border border-rose-200 dark:border-rose-900/50 bg-white dark:bg-zinc-950 p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-rose-100 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0 shadow-sm">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Đặt lại toàn bộ dữ liệu ứng dụng
              </h3>
              <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                Cài mới hoàn toàn và bắt đầu lại từ đầu
              </p>
            </div>
          </div>
          {!isResetting && !isSuccess && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Warning & Info card */}
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 p-4 space-y-3 text-xs leading-relaxed text-slate-700 dark:text-zinc-300">
          <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>Hành động này không thể hoàn tác! Những gì sẽ diễn ra:</span>
          </div>

          <ul className="space-y-2 pl-1">
            <li className="flex items-start gap-2">
              <span className="text-rose-500 font-bold">•</span>
              <span>
                <strong>Xóa toàn bộ quá trình học:</strong> Toàn bộ từ vựng đã thêm, lịch sử ôn tập SRS, ghi nhận lỗi sai, điểm kinh nghiệm (XP) và chuỗi ngày học (Streak) sẽ bị xóa sạch.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold">•</span>
              <span>
                <strong>Nạp lại dữ liệu gốc:</strong> Tự động import lại 5.000 từ vựng Oxford (A1–C1) và trọn bộ 31 chương ngữ pháp chuẩn.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">•</span>
              <span>
                <strong>Trở về màn khảo sát ban đầu:</strong> Bạn sẽ được chọn lại trình độ hiện tại, thì tiếng Anh bắt đầu học (mặc định thì hiện tại đơn cho người mất gốc) và kế hoạch học mỗi ngày.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400 font-bold">•</span>
              <span>
                <strong>Giữ lại cài đặt giao diện:</strong> Chế độ hiển thị (Sáng/Tối) và kích cỡ chữ (UI Scale) vẫn được giữ nguyên.
              </span>
            </li>
          </ul>
        </div>

        {/* Status / Stage indicator while resetting */}
        {(isResetting || isSuccess) && (
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 flex items-center gap-3">
            {isSuccess ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 animate-in zoom-in-50 duration-200" />
            ) : (
              <Loader2 className="w-5 h-5 text-rose-600 dark:text-rose-400 animate-spin shrink-0" />
            )}
            <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
              {resetStage || "Đang xử lý đặt lại dữ liệu..."}
            </span>
          </div>
        )}

        {/* Error message */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 font-medium">
            {errorMsg}
          </div>
        )}

        {/* Checkbox confirmation */}
        {!isResetting && !isSuccess && (
          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/60 cursor-pointer select-none hover:bg-slate-100/70 dark:hover:bg-zinc-900 transition-colors">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 dark:border-zinc-700"
            />
            <span className="text-xs text-slate-700 dark:text-zinc-300 font-medium leading-snug">
              Tôi hiểu rằng toàn bộ tiến độ và lịch sử học tập sẽ bị xóa vĩnh viễn, ứng dụng sẽ coi như cài mới hoàn toàn.
            </span>
          </label>
        )}

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isResetting || isSuccess}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-900 disabled:opacity-50 transition-colors"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleConfirmReset}
            disabled={!confirmed || isResetting || isSuccess}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-2 shadow-sm shadow-rose-600/20 transition-all"
          >
            {isResetting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang đặt lại...</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Xác nhận đặt lại & Bắt đầu lại</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
