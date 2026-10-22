import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTheme } from "./services/theme";
import { restoreLocalStorageFromDb, startLocalStorageBackup } from "./services/storageBackup";
import { getInitialWindowLabel } from "./lib/windowLabel";
import { initStrictInputGuards } from "./lib/inputGuards";

// Initialize theme (dark/light/system) before first paint
initTheme();
// Enforce strict raw keyboard input across all inputs in the system
initStrictInputGuards();

async function bootstrap() {
  // Restore learning progress mirrored in SQLite before services read localStorage.
  // Wait for it fully: a backup started before restore finished could overwrite SQLite with defaults.
  if ("__TAURI_INTERNALS__" in window) {
    try {
      if (getInitialWindowLabel() === "main") {
        // Main window only: loaded on demand so the other windows (popup, nudge) don't pull the
        // migration's services (grammar book, catalog, db, smart review) into their startup
        const { ensureReleaseMigrationV27 } = await import("./services/releaseMigration");
        await ensureReleaseMigrationV27();
      }
      await restoreLocalStorageFromDb();
      // Windows share localStorage, so only the main window mirrors it back
      if (getInitialWindowLabel() === "main") {
        startLocalStorageBackup();
        // Words marked "Đã biết" under the old rules get the current ones (after restore: it reads the FSRS settings)
        const { settleKnownWords } = await import("./services/reviewRecorder");
        await settleKnownWords().catch((err) => console.warn("Known words not settled:", err));
      }
    } catch (err) {
      console.warn("localStorage restore failed, backup disabled for this session:", err);
    }
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
