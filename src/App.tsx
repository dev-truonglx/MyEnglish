import { useEffect, useState, lazy, Suspense } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
// Each window (main, quick-input, review-popup) loads only the code it renders
const QuickInput = lazy(() => import("@/components/QuickInput"));
const MainDashboard = lazy(() => import("@/components/MainDashboard"));
const FocusReviewModal = lazy(() => import("@/components/FocusReviewModal"));
import { useUpdateStore } from "@/services/updateService";

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function getInitialWindowLabel(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlWin = params.get("window");
    if (urlWin) return urlWin;

    const current = getCurrentWebviewWindow();
    if (current?.label) {
      return current.label;
    }
  } catch (e) {
    // Browser preview mode fallback
  }
  return "main";
}

// Synchronously apply transparent window styles before React render
if (typeof document !== "undefined") {
  const initialLabel = getInitialWindowLabel();
  if (initialLabel === "review-popup" || initialLabel === "quick-input") {
    document.documentElement.classList.add("transparent-window");
    document.body.classList.add("transparent-window");
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }
}

export default function App() {
  const [windowLabel, setWindowLabel] = useState<string>(getInitialWindowLabel);
  const checkForUpdates = useUpdateStore((state) => state.checkForUpdates);

  // Check for updates on startup and every 6 hours, only in the main window
  // (the popup/quick-input windows share the same app and would repeat the check)
  useEffect(() => {
    if (windowLabel !== "main") return;
    checkForUpdates();
    const timer = window.setInterval(() => checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [checkForUpdates, windowLabel]);

  useEffect(() => {
    // Fallback sync in case window label is resolved late
    const label = getInitialWindowLabel();
    if (label !== windowLabel) {
      setWindowLabel(label);
    }
  }, [windowLabel]);

  useEffect(() => {
    if (windowLabel === "review-popup" || windowLabel === "quick-input") {
      document.documentElement.classList.add("transparent-window");
      document.body.classList.add("transparent-window");
      document.documentElement.style.background = "transparent";
      document.documentElement.style.backgroundColor = "transparent";
      document.body.style.background = "transparent";
      document.body.style.backgroundColor = "transparent";
    } else {
      document.documentElement.classList.remove("transparent-window");
      document.body.classList.remove("transparent-window");
    }
  }, [windowLabel]);

  // When inside the Quick Input floating window
  if (windowLabel === "quick-input") {
    return (
      <div className="w-screen h-screen overflow-hidden flex items-center justify-center bg-transparent">
        <Suspense fallback={null}>
        <QuickInput
          onSubmitted={() => {
            if (!("__TAURI_INTERNALS__" in window)) {
              setTimeout(() => setWindowLabel("main"), 1200);
            }
          }}
          onOpenDashboard={() => {
            if (!("__TAURI_INTERNALS__" in window)) {
              setWindowLabel("main");
            }
          }}
          onDismiss={() => {
            if (!("__TAURI_INTERNALS__" in window)) {
              setWindowLabel("main");
            }
          }}
        />
        </Suspense>
      </div>
    );
  }

  // When inside the Review Popup floating window
  if (windowLabel === "review-popup") {
    return (
      <Suspense fallback={null}>
        <FocusReviewModal
          onClose={() => {
            if (!("__TAURI_INTERNALS__" in window)) {
              setWindowLabel("main");
            }
          }}
        />
      </Suspense>
    );
  }

  // When inside the Main Dashboard window
  return (
    <Suspense fallback={null}>
      <MainDashboard
        onOpenQuickInputPreview={() => setWindowLabel("quick-input")}
        onOpenReviewPopupPreview={() => setWindowLabel("review-popup")}
      />
    </Suspense>
  );
}
