import { useEffect, useState, type FormEvent } from "react";
import { Cloud, Loader2, LogIn, UserPlus, X } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { runSync } from "@/services/sync/manager";
import type { AuthPromptReason } from "@/services/authPrompt";

type Mode = "signin" | "signup" | "forgot";

export interface AuthSyncPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  reason?: AuthPromptReason;
  title?: string;
  message?: string;
}

export default function AuthSyncPromptModal({
  isOpen,
  onClose,
  onSuccess,
  reason = "exit_lesson",
  title,
  message,
}: AuthSyncPromptModalProps) {
  const { busy, error, notice, signIn, signUp, resetPassword, clearMessages } = useAuthStore();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (isOpen) {
      clearMessages();
      setMode("signin");
    }
  }, [isOpen, clearMessages]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const switchTo = (m: Mode) => {
    clearMessages();
    setMode(m);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    let ok = false;
    if (mode === "signin") {
      ok = await signIn(email, password);
    } else if (mode === "signup") {
      ok = await signUp(email, password, name);
    } else {
      ok = await resetPassword(email);
      return;
    }

    if (ok) {
      // Immediately run sync to push study data collected so far
      void runSync();
      onSuccess?.();
      onClose();
    }
  };

  const defaultTitle =
    reason === "close_tab" ? "Đồng bộ tiến độ trước khi rời đi" : "Đồng bộ dữ liệu học của bạn";

  const defaultMessage =
    reason === "close_tab"
      ? "Bạn chưa đăng nhập. Đăng nhập hoặc tạo tài khoản ngay để đồng bộ kết quả học tập, tránh mất dữ liệu khi đóng tab hoặc đổi thiết bị."
      : "Bạn vừa học xong bài học. Đăng nhập hoặc tạo tài khoản để đồng bộ tiến trình học tập lên đám mây và tiếp tục học trên các thiết bị khác.";

  const inputClass =
    "w-full px-3 py-2.5 rounded-xl text-sm border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Đồng bộ tài khoản"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {title || defaultTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                {message || defaultMessage}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode switcher */}
        {mode !== "forgot" ? (
          <div className="flex rounded-xl bg-slate-100 dark:bg-zinc-800 p-1">
            <button
              type="button"
              onClick={() => switchTo("signin")}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                mode === "signin"
                  ? "bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => switchTo("signup")}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                mode === "signup"
                  ? "bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Đăng ký
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800 dark:text-zinc-200">Đặt lại mật khẩu</span>
            <button
              type="button"
              onClick={() => switchTo("signin")}
              className="text-cyan-600 dark:text-cyan-400 hover:underline"
            >
              Quay lại đăng nhập
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                Tên hiển thị
              </label>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tên trên bảng xếp hạng (3–20 ký tự)"
                required
                minLength={3}
                maxLength={20}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
              Email
            </label>
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
            />
          </div>

          {mode !== "forgot" && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  Mật khẩu
                </label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => switchTo("forgot")}
                    className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline"
                  >
                    Quên mật khẩu?
                  </button>
                )}
              </div>
              <input
                className={inputClass}
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ít nhất 6 ký tự"
                required
                minLength={6}
              />
            </div>
          )}

          {error && (
            <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900">
              {error}
            </div>
          )}

          {notice && (
            <div className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900">
              {notice}
            </div>
          )}

          <div className="pt-1 space-y-2">
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "signin"
                ? "Đăng nhập & đồng bộ"
                : mode === "signup"
                ? "Tạo tài khoản & đồng bộ"
                : "Gửi liên kết đặt lại"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 px-4 rounded-xl text-xs font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/60 transition-colors"
            >
              Để sau, tiếp tục không đồng bộ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
