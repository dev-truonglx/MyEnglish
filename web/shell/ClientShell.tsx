"use client";
/**
 * Start-up of the web app, the counterpart of src/main.tsx: holds the database for this tab, requires an
 * account, brings the deck and the account's progress in, then renders the desktop app's own <App/>.
 * Nothing here decides anything about learning: it only calls the same services main.tsx and App call.
 */
import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import { isCloudConfigured } from "@/services/supabase";
import { useAuthStore } from "@/stores/authStore";
import type { AppProps } from "@/App";
import type { DashboardTab } from "@/components/dashboard/shared";
import { platformSlots } from "@/lib/platformSlots";
import { tabFromPath, pathForTab } from "./tabRoutes";
import LoginScreen from "./LoginScreen";
import { StatusScreen, type Step } from "./StatusScreen";
import { registerServiceWorker } from "./registerServiceWorker";
import PushSettingsCard from "./PushSettingsCard";
import { startPushPlanner } from "./push";

/** Same value as SELECT_TAB_EVENT in src/components/MainDashboard.tsx (not imported: that would pull the
 *  whole app into this start-up chunk) */
const SELECT_TAB_EVENT = "myenglish-select-tab";

// Web-only settings card ("Thông báo khi đóng tab") shown at the top of the shared settings page
platformSlots.settingsTop = PushSettingsCard;

type Phase =
  | { kind: "lock" }
  | { kind: "other-tab" }
  | { kind: "not-configured" }
  | { kind: "auth" }
  | { kind: "login" }
  | { kind: "preparing"; steps: Step[] }
  | { kind: "failed"; message: string }
  | { kind: "ready"; App: React.ComponentType<AppProps> };

const LOCK_NAME = "myenglish-database";

/** Development only: the bundled deck file (a relative path, so the Supabase alias does not apply) */
const loadLocalDeck = () =>
  process.env.NODE_ENV === "production"
    ? Promise.reject(new Error("dev only"))
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      import("../../src/data/vocabCatalog.json").then((m) => m.default as any);

let lockRequest: Promise<boolean> | null = null;

/** The OPFS database allows one connection: the tab holding this lock owns it until it closes. Asked once
 *  per page (React runs effects twice in development). */
function holdDatabaseLock(): Promise<boolean> {
  if (!("locks" in navigator)) return Promise.resolve(true);
  return (lockRequest ??= new Promise((resolve) => {
    navigator.locks
      .request(LOCK_NAME, { ifAvailable: true }, (lock) => {
        resolve(!!lock);
        // Kept for the life of the tab
        return lock ? new Promise<void>(() => {}) : undefined;
      })
      .catch(() => resolve(true));
  }));
}

/**
 * `devOffline` (the /dev page, development builds only): no account, the deck from the local JSON file.
 * Lets the app be exercised without a Supabase project.
 */
export default function ClientShell({
  devOffline = false,
  basePath,
}: {
  devOffline?: boolean;
  basePath?: string;
}): ReactNode {
  const [phase, setPhase] = useState<Phase>({ kind: "lock" });
  /** A new deploy is cached and waiting: applied only when the learner chooses (never mid-review) */
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null);
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);

  // Web: one URL per tab under basePath (/learn, or /dev in development).
  const [initialTab] = useState<DashboardTab | undefined>(() => {
    if (!basePath || typeof window === "undefined") return undefined;
    const tab = tabFromPath(window.location.pathname, basePath);
    if (!tab) {
      window.history.replaceState(null, "", basePath);
      return "today";
    }
    return tab;
  });

  const firstTabChangeRef = useRef(true);
  /** The tab on screen (the URL can run ahead of it while "leave this review?" is asked) */
  const shownTabRef = useRef<DashboardTab | undefined>(initialTab);
  /** Position of the current history entry among this app's entries */
  const historyIndexRef = useRef(0);
  const onTabChange = useCallback(
    (tab: DashboardTab) => {
      shownTabRef.current = tab;
      if (!basePath || typeof window === "undefined") return;
      const targetPath = pathForTab(tab, basePath);
      const isFirst = firstTabChangeRef.current;
      firstTabChangeRef.current = false;
      if (isFirst) {
        // Number this app's history entries, so a back/forward can be undone (see the popstate handler)
        historyIndexRef.current = 0;
        window.history.replaceState({ myenglishIdx: 0 }, "", targetPath);
      } else if (window.location.pathname !== targetPath) {
        historyIndexRef.current += 1;
        window.history.pushState({ myenglishIdx: historyIndexRef.current }, "", targetPath);
      }
    },
    [basePath]
  );

  useEffect(() => {
    if (!basePath) return;
    let pending: number | undefined;
    const handlePopState = (e: PopStateEvent) => {
      const from = historyIndexRef.current;
      const to = typeof e.state?.myenglishIdx === "number" ? e.state.myenglishIdx : from;
      historyIndexRef.current = to;
      const tab = tabFromPath(window.location.pathname, basePath) ?? "today";
      window.dispatchEvent(new CustomEvent(SELECT_TAB_EVENT, { detail: tab }));
      // Still on the old tab a moment later: the app is asking before leaving an unfinished review. Step back
      // to that tab's history entry (history intact); if the learner then leaves, onTabChange moves on.
      window.clearTimeout(pending);
      pending = window.setTimeout(() => {
        const shown = shownTabRef.current;
        if (shown && shown !== tab && to !== from) window.history.go(from - to);
      }, 300);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.clearTimeout(pending);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [basePath]);

  useEffect(() => {
    registerServiceWorker((apply) => setApplyUpdate(() => apply));
  }, []);

  // A clicked reminder notification asks the open tab to show a page (navigating would reload the app)
  useEffect(() => {
    if (!basePath || !("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent<{ type?: string; url?: string }>) => {
      if (e.data?.type !== "OPEN_URL" || !e.data.url) return;
      const tab = tabFromPath(new URL(e.data.url, window.location.origin).pathname, basePath) ?? "today";
      window.dispatchEvent(new CustomEvent(SELECT_TAB_EVENT, { detail: tab }));
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [basePath]);

  // Reminder plan for when the tab is closed (signed-in web only, never the offline /dev page)
  const appReady = phase.kind === "ready";
  useEffect(() => {
    if (!appReady || devOffline) return;
    return startPushPlanner();
  }, [appReady, devOffline]);

  // 1. One tab owns the database
  useEffect(() => {
    let cancelled = false;
    holdDatabaseLock().then((owned) => {
      if (cancelled) return;
      if (!owned) setPhase({ kind: "other-tab" });
      else if (devOffline) setPhase({ kind: "preparing", steps: [] });
      else if (!isCloudConfigured()) setPhase({ kind: "not-configured" });
      else {
        setPhase({ kind: "auth" });
        void useAuthStore.getState().init();
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Allow guest to learn first; login prompt only triggers when exiting a lesson or closing the tab
  useEffect(() => {
    if (!ready) return;
    setPhase((p) => {
      if (p.kind === "auth") return { kind: "preparing", steps: [] };
      return p;
    });
  }, [ready]);

  // 3. Database, deck, the account's progress, then the app
  const preparing = phase.kind === "preparing";
  useEffect(() => {
    if (!preparing) return;
    let cancelled = false;
    const steps: Step[] = [
      { label: "Mở dữ liệu trên trình duyệt", state: "running" },
      { label: "Bộ từ Oxford 5000", state: "waiting" },
      { label: "Tiến độ học từ tài khoản", state: "waiting" },
    ];
    const show = (i: number, state: Step["state"], note?: string) => {
      steps[i] = { ...steps[i], state, note };
      if (i + 1 < steps.length && state === "done") steps[i + 1] = { ...steps[i + 1], state: "running" };
      if (!cancelled) setPhase({ kind: "preparing", steps: [...steps] });
    };
    show(0, "running");

    (async () => {
      // Ask the browser not to evict the database under storage pressure
      void navigator.storage?.persist?.().catch(() => false);

      const { getDatabase } = await import("@/services/db");
      const { openDatabaseFile } = await import("~/platform/sql");
      await getDatabase();
      const { persistent } = await openDatabaseFile("sqlite:myenglish.db");
      show(0, "done", persistent ? undefined : "Trình duyệt không cho lưu lâu dài: dữ liệu tải lại từ tài khoản mỗi lần mở");

      const { ensureCatalogSeeded } = await import("@/services/vocabCatalog");
      await ensureCatalogSeeded(devOffline ? loadLocalDeck : undefined);
      show(1, "done");

      // First pass before the app renders, so a learner new to this browser sees their own progress
      // instead of the first-run onboarding
      if (devOffline || !useAuthStore.getState().user) {
        show(2, "done", useAuthStore.getState().user ? "Bỏ qua (chế độ dev offline)" : "Chưa đăng nhập (dữ liệu lưu trên máy này)");
      } else {
        const { runSync } = await import("@/services/sync/manager");
        await runSync();
        const syncError = useAuthStore.getState().sync.error;
        show(2, "done", syncError ?? undefined);
      }

      // What src/main.tsx does before rendering (the release migration and the localStorage mirror are
      // desktop-only: a browser keeps its localStorage itself)
      const { settleKnownWords } = await import("@/services/reviewRecorder");
      await settleKnownWords().catch((err) => console.warn("Known words not settled:", err));
      const [{ initTheme }, { initStrictInputGuards }] = await Promise.all([
        import("@/services/theme"),
        import("@/lib/inputGuards"),
      ]);
      initTheme();
      initStrictInputGuards();

      const { default: App } = await import("@/App");
      if (!cancelled) setPhase({ kind: "ready", App });
    })().catch((err) => {
      console.error("Web start-up failed:", err);
      if (!cancelled) setPhase({ kind: "failed", message: err instanceof Error ? err.message : String(err) });
    });
    return () => {
      cancelled = true;
    };
  }, [preparing, devOffline]);

  switch (phase.kind) {
    case "ready":
      return (
        <>
          <phase.App
            initialTab={basePath ? initialTab : undefined}
            onTabChange={basePath ? onTabChange : undefined}
          />
          {applyUpdate && (
            <button
              type="button"
              onClick={applyUpdate}
              className="fixed bottom-4 left-1/2 z-[9999] -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg"
            >
              Có bản mới — bấm để tải lại
            </button>
          )}
        </>
      );
    case "login":
      return <LoginScreen />;
    case "preparing":
      return <StatusScreen title="Đang chuẩn bị dữ liệu" steps={phase.steps} footer="Lần sau sẽ mở ngay, kể cả khi offline." />;
    case "other-tab":
      return (
        <StatusScreen
          title="MyEnglish đang mở ở tab khác"
          message="Dữ liệu học chỉ mở được ở một tab mỗi lúc. Hãy đóng tab kia rồi tải lại trang này."
          action={{ label: "Tải lại", onClick: () => window.location.reload() }}
        />
      );
    case "not-configured":
      return (
        <StatusScreen
          title="Chưa cấu hình máy chủ"
          message="Thiếu NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (xem web/.env.example)."
        />
      );
    case "failed":
      return (
        <StatusScreen
          title="Không khởi động được"
          message={phase.message}
          action={{ label: "Thử lại", onClick: () => window.location.reload() }}
        />
      );
    default:
      return <StatusScreen title="MyEnglish" message="Đang mở…" />;
  }
}
