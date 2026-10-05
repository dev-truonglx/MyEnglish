import { useEffect, useState, lazy, Suspense } from "react";
import { getInitialWindowLabel } from "@/lib/windowLabel";
import ErrorBoundary from "@/components/ErrorBoundary";
// Each window (main, quick-input, review-popup) loads only the code it renders
const QuickInput = lazy(() => import("@/components/QuickInput"));
const MainDashboard = lazy(() => import("@/components/MainDashboard"));
const FocusReviewModal = lazy(() => import("@/components/FocusReviewModal"));
const ReviewNudge = lazy(() => import("@/components/ReviewNudge"));

/** Floating windows rendered over other apps on a transparent background */
const TRANSPARENT_WINDOWS = ["review-popup", "quick-input", "review-nudge"];
import { useUpdateStore } from "@/services/updateService";
import { syncAutostartWithSystem } from "@/services/autostartService";

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Synchronously apply transparent window styles before React render
if (typeof document !== "undefined") {
  const initialLabel = getInitialWindowLabel();
  if (TRANSPARENT_WINDOWS.includes(initialLabel)) {
    document.documentElement.classList.add("transparent-window");
    document.body.classList.add("transparent-window");
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }
}

export default function App() {
  const [windowLabel, setWindowLabel] = useState<string>(getInitialWindowLabel);
  const checkForUpdates = useUpdateStore((state) => state.checkForUpdates);

  // Check for updates and sync autostart on startup in the main window
  useEffect(() => {
    if (windowLabel !== "main") return;
    checkForUpdates();
    syncAutostartWithSystem();
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
    if (TRANSPARENT_WINDOWS.includes(windowLabel)) {
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
      <ErrorBoundary key={windowLabel} windowLabel={windowLabel}>
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
      </ErrorBoundary>
    );
  }

  // When inside the corner reminder window
  if (windowLabel === "review-nudge") {
    return (
      <ErrorBoundary key={windowLabel} windowLabel={windowLabel}>
      <Suspense fallback={null}>
        <ReviewNudge
          onDone={() => {
            if (!("__TAURI_INTERNALS__" in window)) {
              setWindowLabel("main");
            }
          }}
        />
      </Suspense>
      </ErrorBoundary>
    );
  }

  // When inside the Review Popup floating window
  if (windowLabel === "review-popup") {
    return (
      <ErrorBoundary key={windowLabel} windowLabel={windowLabel}>
      <Suspense fallback={null}>
        <FocusReviewModal
          onClose={() => {
            if (!("__TAURI_INTERNALS__" in window)) {
              setWindowLabel("main");
            }
          }}
        />
      </Suspense>
      </ErrorBoundary>
    );
  }

  // When inside the Main Dashboard window
  return (
    <ErrorBoundary key={windowLabel} windowLabel={windowLabel}>
      <Suspense fallback={null}>
        <MainDashboard
          onOpenQuickInputPreview={() => setWindowLabel("quick-input")}
          onOpenReviewPopupPreview={() => setWindowLabel("review-popup")}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
