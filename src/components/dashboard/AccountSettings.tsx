import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Cloud, CloudOff, Loader2, LogOut, RefreshCw } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useStandingStore } from "@/stores/standingStore";
import { resolveAccountMismatch, runSync } from "@/services/sync/manager";
import { cn } from "@/lib/utils";
import Avatar from "../Avatar";
import { AVATARS } from "@/services/avatars";

type Mode = "signin" | "signup" | "forgot";

const field =
  "w-full px-3 py-2 rounded-lg text-base md:text-sm border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white placeholder:text-slate-400";
const primary = "px-4 py-2 max-md:min-h-10 rounded-lg text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white inline-flex items-center justify-center gap-2";
const secondary =
  "px-3 py-2 max-md:min-h-10 rounded-lg text-xs font-semibold border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center max-md:justify-center gap-1.5";

function formatTime(iso: string | null): string {
  if (!iso) return "chưa lần nào";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "chưa lần nào" : d.toLocaleString("vi-VN");
}

/** Settings → Tài khoản: sign in / up, and the state of the progress sync */
export default function AccountSettings() {
  const { configured, ready, user, profile, busy, notice, error, sync } = useAuthStore();
  const store = useAuthStore.getState;
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [editName, setEditName] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const rankWidgets = useStandingStore((s) => s.enabled);

  useEffect(() => {
    store().clearMessages();
  }, [mode, store]);

  const shell = (children: React.ReactNode) => (
    <section>
      <div className="p-3.5 md:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-4 shadow-sm">{children}</div>
    </section>
  );

  if (!configured) {
    return shell(
      <div className="flex items-start gap-3 text-xs text-slate-600 dark:text-zinc-400">
        <CloudOff className="w-5 h-5 shrink-0 text-slate-400" />
        <p className="leading-relaxed">
          Đăng nhập, đồng bộ giữa các máy và bảng xếp hạng cần một dự án Supabase. Bản này chưa được cấu hình
          (thiếu <span className="font-mono">VITE_SUPABASE_URL</span> / <span className="font-mono">VITE_SUPABASE_ANON_KEY</span>);
          ứng dụng vẫn dùng bình thường ngoại tuyến. Xem <span className="font-mono">supabase/README.md</span>.
        </p>
      </div>
    );
  }

  if (!ready) {
    return shell(
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Đang kiểm tra tài khoản…
      </div>
    );
  }

  if (!user) {
    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      const s = store();
      if (mode === "signin") await s.signIn(email, password);
      else if (mode === "signup") await s.signUp(email, password, name);
      else await s.resetPassword(email);
    };
    return shell(
      <form onSubmit={submit} className="space-y-3 max-w-sm">
        <div className="flex items-start gap-3">
          <Cloud className="w-5 h-5 shrink-0 text-cyan-600 dark:text-cyan-400 mt-0.5" />
          <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
            Đăng nhập để giữ tiến trình học giữa các máy và đua XP với bạn bè. Dữ liệu vẫn nằm trên máy; tài khoản chỉ đồng bộ bản sao.
            Sách ngữ pháp của bạn không bao giờ được tải lên.
          </p>
        </div>
        <div className="flex gap-2">
          {([["signin", "Đăng nhập"], ["signup", "Tạo tài khoản"]] as const).map(([m, label]) => (
            <button
              type="button"
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-3 py-1.5 max-md:min-h-10 max-md:inline-flex max-md:items-center max-md:justify-center rounded-lg text-xs font-semibold border",
                mode === m ? "bg-cyan-600 border-cyan-600 text-white" : "border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <input className={field} type="email" required autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode === "signup" && (
          <input className={field} required minLength={3} maxLength={20} placeholder="Tên hiển thị trên bảng xếp hạng (3–20 ký tự)" value={name} onChange={(e) => setName(e.target.value)} />
        )}
        {mode !== "forgot" && (
          <input
            className={field}
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="Mật khẩu (ít nhất 6 ký tự)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {error && <div className="text-xs text-rose-600 dark:text-rose-400">{error}</div>}
        {notice && <div className="text-xs text-emerald-600 dark:text-emerald-400">{notice}</div>}
        <div className="flex items-center gap-3">
          <button className={primary} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "signin" ? "Đăng nhập" : mode === "signup" ? "Tạo tài khoản" : "Gửi thư đặt lại mật khẩu"}
          </button>
          {mode === "signin" && (
            <button type="button" onClick={() => setMode("forgot")} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-zinc-200 underline">
              Quên mật khẩu?
            </button>
          )}
          {mode === "forgot" && (
            <button type="button" onClick={() => setMode("signin")} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-zinc-200 underline">
              Quay lại
            </button>
          )}
        </div>
      </form>
    );
  }

  const syncing = sync.status === "syncing";
  return shell(
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            title="Đổi ảnh đại diện"
            aria-expanded={pickingAvatar}
            onClick={() => setPickingAvatar((v) => !v)}
            className="relative rounded-full shrink-0 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900 hover:ring-2 hover:ring-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-500 transition"
          >
            <Avatar id={profile?.avatar} name={profile?.displayName ?? user.email} size="lg" />
            <span className="absolute -bottom-0.5 -right-0.5 px-1 rounded-full bg-cyan-600 text-white text-[9px] font-semibold leading-4">Đổi</span>
          </button>
          <div className="min-w-0">
            {editName === null ? (
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {profile?.displayName ?? "…"}
                <button onClick={() => setEditName(profile?.displayName ?? "")} className="ml-2 text-[11px] font-normal text-cyan-600 hover:underline">
                  Đổi tên
                </button>
              </div>
            ) : (
              <form
                className="flex items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await store().updateDisplayName(editName)) setEditName(null);
                }}
              >
                <input className={cn(field, "py-1")} minLength={3} maxLength={20} value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                <button className={secondary} disabled={busy}>Lưu</button>
                <button type="button" className={secondary} onClick={() => setEditName(null)}>Hủy</button>
              </form>
            )}
            <div className="text-xs text-slate-500 dark:text-zinc-400 truncate">{user.email}</div>
          </div>
        </div>
        <button className={secondary} disabled={busy || syncing} onClick={() => void store().signOut()}>
          <LogOut className="w-3.5 h-3.5" /> Đăng xuất
        </button>
      </div>
      {pickingAvatar && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-2">
          <div className="text-xs font-bold text-slate-700 dark:text-zinc-300">Chọn ảnh đại diện</div>
          <div role="radiogroup" aria-label="Ảnh đại diện" className="grid grid-cols-5 sm:grid-cols-10 gap-2">
            {AVATARS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={profile?.avatar === a.id}
                title={a.label}
                disabled={busy}
                onClick={async () => {
                  if (await store().updateAvatar(a.id)) setPickingAvatar(false);
                }}
                className={cn(
                  "rounded-full p-0.5 border-2 transition disabled:opacity-50",
                  profile?.avatar === a.id ? "border-cyan-500" : "border-transparent hover:border-slate-300 dark:hover:border-zinc-600"
                )}
              >
                <Avatar id={a.id} name={a.label} size="md" />
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <div className="text-xs text-rose-600 dark:text-rose-400">{error}</div>}

      {sync.accountMismatch ? (
        <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 space-y-3 text-xs text-slate-700 dark:text-zinc-300">
          <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4" />
            {sync.mismatchReason === "reset"
              ? "Tài khoản đã được đặt lại từ một máy khác"
              : "Máy này đang chứa dữ liệu của một tài khoản khác"}
          </div>
          <p className="leading-relaxed">
            {sync.mismatchReason === "reset"
              ? "Dữ liệu trên tài khoản đã bị xóa bằng \"Đặt lại toàn bộ dữ liệu ứng dụng\" ở một máy khác. Máy này vẫn còn tiến trình cũ. Chọn cách xử lý:"
              : "Bạn vừa đăng nhập bằng tài khoản mới, nhưng tiến trình trên máy đã đồng bộ với tài khoản trước. Chọn cách xử lý:"}
          </p>
          <div className="flex flex-wrap gap-2">
            <button className={primary} onClick={() => void resolveAccountMismatch("merge")}>
              {sync.mismatchReason === "reset" ? "Giữ tiến trình máy này, gửi lại lên tài khoản" : "Gộp dữ liệu máy này vào tài khoản mới"}
            </button>
            {confirmWipe ? (
              <button
                className="px-4 py-2 max-md:min-h-10 max-md:inline-flex max-md:items-center max-md:justify-center rounded-lg text-sm font-semibold bg-rose-600 hover:bg-rose-500 text-white"
                onClick={() => void resolveAccountMismatch("wipe")}
              >
                Chắc chắn: xóa dữ liệu trên máy
              </button>
            ) : (
              <button className={secondary} onClick={() => setConfirmWipe(true)}>
                {sync.mismatchReason === "reset" ? "Xóa dữ liệu trên máy này cho khớp tài khoản" : "Xóa dữ liệu trên máy, bắt đầu từ tài khoản mới"}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
              {syncing ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang đồng bộ…</>
              ) : sync.status === "error" ? (
                <><CloudOff className="w-3.5 h-3.5 text-rose-500" /> Chưa đồng bộ được</>
              ) : (
                <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Tiến trình được đồng bộ</>
              )}
            </div>
            <div className="text-slate-500 dark:text-zinc-400">Lần gần nhất: {formatTime(sync.lastSyncAt)}</div>
            {sync.error && <div className="text-rose-600 dark:text-rose-400">{sync.error}</div>}
            {sync.lastReport && !syncing && (sync.lastReport.pushed > 0 || sync.lastReport.applied > 0) && (
              <div className="text-slate-500 dark:text-zinc-400">
                Gửi lên {sync.lastReport.pushed} mục · nhận về {sync.lastReport.applied} thay đổi
              </div>
            )}
          </div>
          <button className={secondary} disabled={syncing} onClick={() => void runSync()}>
            <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} /> Đồng bộ ngay
          </button>
        </div>
      )}
      <label className="flex items-start justify-between gap-3 cursor-pointer">
        <div>
          <div className="text-xs font-bold text-slate-900 dark:text-white">Hiện thứ hạng XP trong ứng dụng</div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
            Thẻ "Cuộc đua tuần này" ở màn Hôm nay, dòng hạng ở thanh bên và hạng mới sau mỗi phiên ôn. Tắt đi nếu bạn thấy áp lực: bảng xếp hạng vẫn xem được ở tab Xếp hạng.
          </p>
        </div>
        <input type="checkbox" checked={rankWidgets} onChange={(e) => useStandingStore.getState().setEnabled(e.target.checked)} className="mt-1 accent-cyan-600" />
      </label>
      <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
        Đồng bộ: từ vựng và lịch ôn, lịch sử ôn tập, sổ lỗi, điểm ngữ pháp, XP, chuỗi ngày và các cài đặt học. Không đồng bộ: nội dung sách ngữ pháp
        bạn nhập, khóa API, đường dẫn máy.
      </p>
    </>
  );
}
