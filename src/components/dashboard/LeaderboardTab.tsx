import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Loader2, LogIn, Plus, RefreshCw, Trophy, Users, WifiOff, X } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { effectiveScope, useStandingStore } from "@/stores/standingStore";
import { accountErrorMessage } from "@/services/accountErrors";
import {
  createGroup,
  fetchLeaderboard,
  joinGroup,
  leaveGroup,
  type BoardKind,
  type GroupInfo,
  type LeaderRow,
} from "@/services/leaderboard";
import { cn } from "@/lib/utils";
import { PAGE_CONTAINER } from "./shared";
import Avatar from "../Avatar";

/** After this long the loading note says the network is slow */
const SLOW_MS = 4000;
/** After this long the request is given up (the learner can retry) */
const TIMEOUT_MS = 20000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/** Placeholder rows while a board loads for the first time */
function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden className="animate-pulse motion-reduce:animate-none">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-slate-100 dark:border-zinc-800/70">
          <div className="w-8 flex justify-center">
            <div className="w-5 h-4 rounded bg-slate-200 dark:bg-zinc-800" />
          </div>
          <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-zinc-800" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 rounded bg-slate-200 dark:bg-zinc-800" style={{ width: `${55 - i * 5}%` }} />
            <div className="h-2.5 w-16 rounded bg-slate-100 dark:bg-zinc-800/70" />
          </div>
          <div className="h-3.5 w-16 rounded bg-slate-200 dark:bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}

const BOARDS: Array<{ kind: BoardKind; label: string }> = [
  { kind: "week", label: "Tuần này" },
  { kind: "month", label: "Tháng này" },
  { kind: "all", label: "Tổng" },
  { kind: "streak", label: "Chuỗi ngày" },
];

const MEDAL = ["🥇", "🥈", "🥉"];

const chip = (active: boolean) =>
  cn(
    "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
    active
      ? "bg-cyan-600 border-cyan-600 text-white"
      : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
  );

/** XP race: weekly / monthly / all-time XP and streaks, among everyone or inside a friend group */
export default function LeaderboardTab({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const configured = useAuthStore((s) => s.configured);
  const user = useAuthStore((s) => s.user);
  const syncing = useAuthStore((s) => s.sync.status === "syncing");
  const [kind, setKind] = useState<BoardKind>("week");
  // The board followed here is the one the rank widgets follow (a group when the learner is in one)
  const groups = useStandingStore((s) => s.groups);
  const scopePref = useStandingStore((s) => s.scopePref);
  const setScope = useStandingStore((s) => s.setScope);
  const groupId = effectiveScope(scopePref, groups);
  const setGroupId = setScope;
  const boardKey = `${kind}|${groupId ?? "all"}`;
  // Boards already loaded this visit: switching back shows them at once while they refresh
  const cacheRef = useRef(new Map<string, LeaderRow[]>());
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  // Only the latest request may set the board (a slow answer for a board left meanwhile is dropped)
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!user) return;
    const id = ++requestRef.current;
    const key = boardKey;
    setRows(cacheRef.current.get(key) ?? null);
    setLoading(true);
    setSlow(false);
    setError(null);
    const slowTimer = setTimeout(() => requestRef.current === id && setSlow(true), SLOW_MS);
    try {
      const next = await withTimeout(fetchLeaderboard(kind, groupId), TIMEOUT_MS);
      if (requestRef.current !== id) return;
      cacheRef.current.set(key, next);
      setRows(next);
    } catch (err) {
      if (requestRef.current !== id) return;
      setError(
        err instanceof Error && err.message === "timeout"
          ? "Máy chủ phản hồi quá chậm nên chưa tải được bảng xếp hạng. Kiểm tra mạng rồi thử lại."
          : accountErrorMessage(err)
      );
    } finally {
      clearTimeout(slowTimer);
      if (requestRef.current === id) {
        setLoading(false);
        setSlow(false);
      }
    }
  }, [user, kind, groupId, boardKey]);

  const loadGroups = useCallback(async () => {
    if (!user) return;
    await useStandingStore.getState().refreshGroups();
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);
  // A finished sync means fresher XP: refresh the board
  useEffect(() => {
    window.addEventListener("myenglish-cloud-synced", load);
    return () => window.removeEventListener("myenglish-cloud-synced", load);
  }, [load]);

  if (!configured || !user) {
    return (
      <div className={PAGE_CONTAINER}>
        <div className="p-8 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm text-center space-y-3">
          <Trophy className="w-10 h-10 mx-auto text-amber-500" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Bảng xếp hạng XP</h2>
          <p className="text-sm text-slate-600 dark:text-zinc-400 max-w-md mx-auto">
            {configured
              ? "Đăng nhập để đua kinh nghiệm với mọi người, hoặc lập nhóm riêng với bạn bè. Tiến trình học của bạn cũng được đồng bộ giữa các máy."
              : "Tính năng tài khoản chưa được cấu hình trong bản này (thiếu khóa Supabase). Xem supabase/README.md."}
          </p>
          {configured && onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold"
            >
              <LogIn className="w-4 h-4" /> Đăng nhập tài khoản
            </button>
          )}
        </div>
      </div>
    );
  }

  const top = rows?.filter((r) => r.rank <= 50 || !r.isMe) ?? [];
  const mineOutside = rows?.find((r) => r.isMe && !top.includes(r)) ?? null;
  const isStreak = kind === "streak";
  const scopeName = groupId ? (groups.find((g) => g.id === groupId)?.name ?? "Nhóm") : "Tất cả mọi người";

  const row = (r: LeaderRow) => (
    <div
      key={`${r.rank}-${r.displayName}`}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 border-slate-100 dark:border-zinc-800/70",
        r.isMe && "bg-cyan-50 dark:bg-cyan-500/10"
      )}
    >
      <div className="w-8 text-center text-sm font-bold text-slate-500 dark:text-zinc-400">{MEDAL[r.rank - 1] ?? r.rank}</div>
      <Avatar id={r.avatar} name={r.displayName} size="sm" />
      <div className="flex-1 min-w-0">
        <div className={cn("text-sm truncate", r.isMe ? "font-bold text-cyan-700 dark:text-cyan-300" : "font-medium text-slate-900 dark:text-white")}>
          {r.displayName}
          {r.isMe && <span className="ml-2 text-[10px] uppercase tracking-wide">bạn</span>}
        </div>
        <div className="text-[11px] text-slate-500 dark:text-zinc-400">Lv.{r.level}{!isStreak && r.streak > 0 ? ` · 🔥 ${r.streak} ngày` : ""}</div>
      </div>
      <div className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">
        {isStreak ? `🔥 ${r.streak}` : `${r.xp.toLocaleString("vi-VN")} XP`}
      </div>
    </div>
  );

  return (
    <div className={PAGE_CONTAINER}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Bảng xếp hạng</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">{scopeName}</p>
            </div>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Làm mới
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {BOARDS.map((b) => (
            <button key={b.kind} onClick={() => setKind(b.kind)} className={chip(kind === b.kind)}>
              {b.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setGroupId(null)} className={chip(groupId === null)}>
            Tất cả
          </button>
          {groups.map((g) => (
            <button key={g.id} onClick={() => setGroupId(g.id)} className={chip(groupId === g.id)}>
              <Users className="inline w-3 h-3 mr-1 -mt-0.5" />
              {g.name}
            </button>
          ))}
          <button onClick={() => setShowGroups((v) => !v)} className={chip(showGroups)}>
            <Plus className="inline w-3 h-3 mr-1 -mt-0.5" />
            Nhóm
          </button>
        </div>

        {showGroups && (
          <GroupsPanel
            groups={groups}
            onChanged={async (selectId) => {
              await loadGroups();
              if (selectId !== undefined) setGroupId(selectId);
              else void useStandingStore.getState().refresh(true);
            }}
          />
        )}

        {error && (
          <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/20 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span className="flex-1">
              {error}
              {rows && rows.length > 0 ? " Đang hiện số lần trước." : ""}
            </span>
            <button onClick={() => void load()} className="shrink-0 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold">
              Thử lại
            </button>
          </div>
        )}

        <div className="relative rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden" aria-busy={loading}>
          {/* Refreshing a board already on screen: a thin bar, the rows stay readable */}
          {loading && rows && rows.length > 0 && (
            <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-amber-100 dark:bg-amber-950/60">
              <div className="h-full w-1/3 bg-amber-500 animate-[leaderboard-progress_1.2s_ease-in-out_infinite]" />
            </div>
          )}
          {rows === null ? (
            error ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-zinc-400">Chưa tải được bảng xếp hạng.</div>
            ) : (
              <>
                <div className="px-4 pt-3 pb-1 flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400" role="status">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {slow ? "Mạng hơi chậm, vẫn đang tải bảng xếp hạng…" : "Đang tải bảng xếp hạng…"}
                </div>
                <SkeletonRows />
              </>
            )
          ) : top.length === 0 && !mineOutside ? (
            loading ? (
              <SkeletonRows count={3} />
            ) : (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-zinc-400">
              Chưa có ai trên bảng này. Ôn vài thẻ để lên bảng đầu tiên!
            </div>
            )
          ) : (
            <div className={cn("transition-opacity", loading && slow && "opacity-60")}>
              {top.map(row)}
              {mineOutside && (
                <>
                  <div className="px-4 py-1 text-center text-xs text-slate-400">···</div>
                  {row(mineOutside)}
                </>
              )}
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
          {syncing ? "Đang đồng bộ…  " : ""}
          XP của bạn được cập nhật mỗi lần đồng bộ (tự động sau khi học). Bảng chỉ để vui cùng bạn bè: XP do ứng dụng tự báo lên.
        </p>
      </div>
    </div>
  );
}

function GroupsPanel({ groups, onChanged }: { groups: GroupInfo[]; onChanged: (selectId?: string | null) => Promise<void> }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // window.confirm is not reliable in the webview: leaving asks for a second click on the same button
  const [leaving, setLeaving] = useState<string | null>(null);

  const act = async (fn: () => Promise<string | null | undefined>) => {
    setBusy(true);
    setError(null);
    try {
      const selectId = await fn();
      await onChanged(selectId);
    } catch (err) {
      setError(accountErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const input =
    "flex-1 min-w-0 px-3 py-2 rounded-lg text-xs border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white placeholder:text-slate-400";
  const button =
    "px-3 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white";

  return (
    <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) void act(async () => { const g = await createGroup(name.trim()); setName(""); return g.id; });
          }}
        >
          <div className="text-xs font-bold text-slate-700 dark:text-zinc-300">Tạo nhóm mới</div>
          <div className="flex gap-2">
            <input className={input} placeholder="Tên nhóm (2–30 ký tự)" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
            <button className={button} disabled={busy || name.trim().length < 2}>Tạo</button>
          </div>
        </form>
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void act(async () => { const g = await joinGroup(code.trim()); setCode(""); return g.id; });
          }}
        >
          <div className="text-xs font-bold text-slate-700 dark:text-zinc-300">Vào nhóm bằng mã mời</div>
          <div className="flex gap-2">
            <input className={cn(input, "uppercase")} placeholder="VD: 3F9A12BC" maxLength={12} value={code} onChange={(e) => setCode(e.target.value)} />
            <button className={button} disabled={busy || !code.trim()}>Vào</button>
          </div>
        </form>
      </div>

      {error && <div className="text-xs text-rose-600 dark:text-rose-400">{error}</div>}

      {groups.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
          {groups.map((g) => (
            <li key={g.id} className="py-2 flex items-center gap-3 text-xs">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900 dark:text-white truncate">{g.name}</div>
                <div className="text-slate-500 dark:text-zinc-400">{g.memberCount} thành viên · mã mời <span className="font-mono">{g.inviteCode}</span></div>
              </div>
              <button
                title="Chép mã mời"
                onClick={() => {
                  void navigator.clipboard?.writeText(g.inviteCode).then(() => {
                    setCopied(g.id);
                    window.setTimeout(() => setCopied(null), 1500);
                  });
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                {copied === g.id ? "✓" : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                title="Rời nhóm"
                disabled={busy}
                onClick={() => {
                  if (leaving !== g.id) {
                    setLeaving(g.id);
                    window.setTimeout(() => setLeaving((cur) => (cur === g.id ? null : cur)), 4000);
                    return;
                  }
                  setLeaving(null);
                  void act(async () => { await leaveGroup(g.id); return null; });
                }}
                className={cn(
                  "p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10",
                  leaving === g.id && "px-2 font-semibold bg-rose-50 dark:bg-rose-500/10"
                )}
              >
                {leaving === g.id ? "Rời nhóm?" : <X className="w-3.5 h-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
