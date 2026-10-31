"use client";
/** Sign-in / sign-up for the web (an account is required there). Uses the desktop app's own auth store. */
import { useState, type FormEvent } from "react";
import { useAuthStore } from "@/stores/authStore";

type Mode = "signin" | "signup" | "reset";

export default function LoginScreen() {
  const { busy, error, notice, signIn, signUp, resetPassword, clearMessages } = useAuthStore();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const switchTo = (m: Mode) => {
    clearMessages();
    setMode(m);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === "signin") await signIn(email, password);
    else if (mode === "signup") await signUp(email, password, name);
    else await resetPassword(email);
  };

  const input =
    "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background text-foreground px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <img src="/app-icon.png" alt="" className="h-8 w-8 rounded-lg" />
          <h1 className="text-lg font-semibold">MyEnglish</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Đăng nhập để học tiếp với tiến độ của bạn."
            : mode === "signup"
              ? "Tạo tài khoản: tiến độ được lưu và đồng bộ với app máy tính."
              : "Nhập email để nhận liên kết đặt lại mật khẩu."}
        </p>

        {mode === "signup" && (
          <label className="mt-4 block text-sm">
            Tên hiển thị
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={20} />
          </label>
        )}
        <label className="mt-4 block text-sm">
          Email
          <input className={input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {mode !== "reset" && (
          <label className="mt-3 block text-sm">
            Mật khẩu
            <input
              className={input}
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {notice && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Đang xử lý…" : mode === "signin" ? "Đăng nhập" : mode === "signup" ? "Đăng ký" : "Gửi liên kết"}
        </button>

        <div className="mt-4 flex justify-between text-xs text-muted-foreground">
          {mode === "signin" ? (
            <>
              <button type="button" onClick={() => switchTo("signup")} className="hover:underline">
                Chưa có tài khoản? Đăng ký
              </button>
              <button type="button" onClick={() => switchTo("reset")} className="hover:underline">
                Quên mật khẩu
              </button>
            </>
          ) : (
            <button type="button" onClick={() => switchTo("signin")} className="hover:underline">
              Đã có tài khoản? Đăng nhập
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
