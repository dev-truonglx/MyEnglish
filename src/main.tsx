import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTheme } from "./services/theme";
import { restoreLocalStorageFromDb, startLocalStorageBackup } from "./services/storageBackup";

// Initialize theme (dark/light/system) before first paint
initTheme();

async function bootstrap() {
  // Restore learning progress mirrored in SQLite before services read localStorage.
  // Never block the first render for more than 1.5s (e.g. outside Tauri).
  try {
    await Promise.race([
      restoreLocalStorageFromDb(),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
    startLocalStorageBackup();
  } catch (err) {
    console.warn("localStorage restore skipped:", err);
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
