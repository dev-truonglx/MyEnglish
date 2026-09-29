import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import QuickInput from "@/components/QuickInput";
import MainDashboard from "@/components/MainDashboard";

export default function App() {
  const [windowLabel, setWindowLabel] = useState<string>("main");

  useEffect(() => {
    // 1. Check URL query param ?window=quick-input
    const params = new URLSearchParams(window.location.search);
    const urlWin = params.get("window");
    if (urlWin) {
      setWindowLabel(urlWin);
      return;
    }

    // 2. Query Tauri native window label if running in desktop runtime
    try {
      const current = getCurrentWebviewWindow();
      if (current?.label) {
        setWindowLabel(current.label);
      }
    } catch (e) {
      // Browser preview mode fallback
      console.log("Running in browser preview mode:", e);
    }
  }, []);

  // When inside the Quick Input floating window
  if (windowLabel === "quick-input") {
    return (
      <div className="w-screen h-screen overflow-hidden flex items-center justify-center bg-transparent">
        <QuickInput
          onSubmitted={() => {
            // When in browser preview, we can switch back or notify
            if (!("__TAURI_INTERNALS__" in window)) {
              setTimeout(() => setWindowLabel("main"), 1200);
            }
          }}
        />
      </div>
    );
  }

  // When inside the Main Dashboard window
  return (
    <MainDashboard
      onOpenQuickInputPreview={() => setWindowLabel("quick-input")}
    />
  );
}
