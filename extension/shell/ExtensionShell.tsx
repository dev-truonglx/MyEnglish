import { useEffect, useState, type ReactNode } from "react";
import { useAuthStore } from "@/stores/authStore";
import type { DashboardTab } from "@/components/dashboard/shared";
import { StatusScreen } from "./StatusScreen";
import { RefreshCw, ExternalLink } from "lucide-react";
import type { AppProps } from "@/App";

type Phase =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; App: React.ComponentType<AppProps> };

export default function ExtensionShell({
  initialTab,
  mode = "fullscreen",
}: {
  initialTab?: DashboardTab;
  mode?: "fullscreen" | "popup" | "sidepanel";
}): ReactNode {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        void navigator.storage?.persist?.().catch(() => false);

        // Open database connection (coordinator proxy ensures single worker in OPFS)
        const { openDatabaseFile } = await import("~/platform/sql");
        await openDatabaseFile("sqlite:myenglish.db");
        const { getDatabase } = await import("@/services/db");
        await getDatabase();

        // Background non-blocking background tasks
        void (async () => {
          const { ensureCatalogSeeded } = await import("@/services/vocabCatalog");
          await ensureCatalogSeeded().catch(() => {});
          const { ensureGrammarBookSeeded } = await import("@/services/grammarBook");
          await ensureGrammarBookSeeded().catch(() => {});
          const { settleKnownWords } = await import("@/services/reviewRecorder");
          await settleKnownWords().catch(() => {});
          await useAuthStore.getState().init().catch(() => {});
          if (useAuthStore.getState().user) {
            const { runSync } = await import("@/services/sync/manager");
            await runSync().catch(() => {});
          }
        })();

        // App initializers
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
        console.error("Extension start-up failed:", err);
        if (mounted) {
          setPhase({ kind: "failed", message: err instanceof Error ? err.message : String(err) });
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  switch (phase.kind) {
    case "ready":
      return (
        <div className="w-full h-full min-h-0 flex-1 flex flex-col overflow-hidden">
          {mode === "sidepanel" && (
            <div className="flex items-center justify-between px-3 py-1 bg-slate-100 dark:bg-zinc-900 border-b border-border text-xs text-muted-foreground select-none shrink-0 z-10">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Thanh bên MyEnglish
              </span>
              <button
                type="button"
                onClick={() => {
                  if (typeof chrome !== "undefined" && chrome.tabs?.create) {
                    chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
                  } else {
                    window.open("/index.html", "_blank");
                  }
                }}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-foreground transition-colors cursor-pointer"
                title="Mở MyEnglish trong tab lớn"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Mở tab lớn</span>
              </button>
            </div>
          )}
          <phase.App initialTab={initialTab} />
        </div>
      );

    case "failed":
      return (
        <StatusScreen
          title="Không thể khởi động"
          message={phase.message}
          action={{
            label: "Thử lại",
            icon: <RefreshCw className="w-4 h-4" />,
            onClick: () => window.location.reload(),
          }}
        />
      );

    default:
      return (
        <div className="w-full h-screen min-h-screen bg-slate-50 dark:bg-zinc-950 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      );
  }
}
