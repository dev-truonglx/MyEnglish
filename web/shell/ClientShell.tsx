"use client";
/**
 * Start-up of the web app, the counterpart of src/main.tsx: holds the database for this tab, requires an
 * account, brings the deck and the account's progress in, then renders the desktop app's own <App/>.
 * Coordinated SQLite proxy allows multiple tabs to run simultaneously.
 */
import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import { isCloudConfigured } from "@/services/supabase";
import { useAuthStore } from "@/stores/authStore";
import type { AppProps } from "@/App";
import type { DashboardTab } from "@/components/dashboard/shared";
import { platformSlots } from "@/lib/platformSlots";
import { tabFromPath, pathForTab } from "./tabRoutes";
import { StatusScreen } from "./StatusScreen";
import { registerServiceWorker } from "./registerServiceWorker";
import PushSettingsCard from "./PushSettingsCard";
import { startPushPlanner } from "./push";

/** Same value as SELECT_TAB_EVENT in src/components/MainDashboard.tsx */
const SELECT_TAB_EVENT = "myenglish-select-tab";

// Web-only settings card ("Thông báo khi đóng tab") shown at the top of the shared settings page
platformSlots.settingsTop = PushSettingsCard;

type Phase =
  | { kind: "loading" }
  | { kind: "not-configured" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; App: React.ComponentType<AppProps> };

/** Development only: the bundled deck file */
const loadLocalDeck = () =>
  process.env.NODE_ENV === "production"
    ? Promise.reject(new Error("dev only"))
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      import("../../src/data/vocabCatalog.json").then((m) => m.default as any);

export default function ClientShell({
  devOffline = false,
  basePath,
}: {
  devOffline?: boolean;
  basePath?: string;
}): ReactNode {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null);

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
  const shownTabRef = useRef<DashboardTab | undefined>(initialTab);
  const historyIndexRef = useRef(0);
  const onTabChange = useCallback(
    (tab: DashboardTab) => {
      shownTabRef.current = tab;
      if (!basePath || typeof window === "undefined") return;
      const targetPath = pathForTab(tab, basePath);
      const isFirst = firstTabChangeRef.current;
      firstTabChangeRef.current = false;
      if (isFirst) {
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

  // Reminder plan for when the tab is closed
  const appReady = phase.kind === "ready";
  useEffect(() => {
    if (!appReady || devOffline) return;
    return startPushPlanner();
  }, [appReady, devOffline]);

  useEffect(() => {
    let mounted = true;

    if (!devOffline && !isCloudConfigured()) {
      setPhase({ kind: "not-configured" });
      return;
    }

    (async () => {
      try {
        void navigator.storage?.persist?.().catch(() => false);

        // Open SQLite connection via coordinated proxy
        const { openDatabaseFile } = await import("~/platform/sql");
        await openDatabaseFile("sqlite:myenglish.db");
        const { getDatabase } = await import("@/services/db");
        await getDatabase();

        // Background non-blocking background tasks
        void (async () => {
          const { ensureCatalogSeeded } = await import("@/services/vocabCatalog");
          await ensureCatalogSeeded(devOffline ? loadLocalDeck : undefined).catch(() => {});

          const { settleKnownWords } = await import("@/services/reviewRecorder");
          await settleKnownWords().catch(() => {});

          if (!devOffline) {
            await useAuthStore.getState().init().catch(() => {});
            if (useAuthStore.getState().user) {
              const { runSync } = await import("@/services/sync/manager");
              await runSync().catch(() => {});
            }
          }
        })();

        // Theme and input guards
        const [{ initTheme }, { initStrictInputGuards }] = await Promise.all([
          import("@/services/theme"),
          import("@/lib/inputGuards"),
        ]);
        initTheme();
        initStrictInputGuards();

        // Render UI immediately
        const { default: App } = await import("@/App");
        if (mounted) {
          setPhase({ kind: "ready", App });
        }
      } catch (err) {
        console.error("Web start-up failed:", err);
        if (mounted) {
          setPhase({ kind: "failed", message: err instanceof Error ? err.message : String(err) });
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [devOffline]);

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
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      );
  }
}
