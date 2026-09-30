import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import QuickInput from "@/components/QuickInput";
import MainDashboard from "@/components/MainDashboard";
import FocusReviewModal from "@/components/FocusReviewModal";
import { useUpdateStore } from "@/services/updateService";

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

  // Check for updates on startup
  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

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
      </div>
    );
  }

  // When inside the Review Popup floating window
  if (windowLabel === "review-popup") {
    return (
      <FocusReviewModal
        onClose={() => {
          if (!("__TAURI_INTERNALS__" in window)) {
            setWindowLabel("main");
          }
        }}
      />
    );
  }

  // When inside the Main Dashboard window
  return (
    <MainDashboard
      onOpenQuickInputPreview={() => setWindowLabel("quick-input")}
      onOpenReviewPopupPreview={() => setWindowLabel("review-popup")}
    />
  );
}
