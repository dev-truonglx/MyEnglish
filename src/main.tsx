import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTheme } from "./services/theme";
import { restoreLocalStorageFromDb, startLocalStorageBackup } from "./services/storageBackup";
import { getInitialWindowLabel } from "./lib/windowLabel";
import { initStrictInputGuards } from "./lib/inputGuards";

import { ensureReleaseMigrationV27 } from "./services/releaseMigration";

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
        await ensureReleaseMigrationV27();
      }
      await restoreLocalStorageFromDb();
      // Windows share localStorage, so only the main window mirrors it back
      if (getInitialWindowLabel() === "main") startLocalStorageBackup();
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
