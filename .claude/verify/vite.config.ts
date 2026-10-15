import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const proj = path.resolve(__dirname, "../..");
const stub = path.resolve(proj, "test/stubs/tauriApi.ts");

// Throwaway harness: runs real components in a browser against an in-browser SQLite (sql.js)
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify("verify"),
    // A fake project: main.tsx answers its requests (?account, ?leaderboard), nothing leaves the browser
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://fake.supabase.co"),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("fake-anon-key"),
  },
  css: { postcss: proj },
  resolve: {
    alias: {
      "@tauri-apps/plugin-sql": path.resolve(__dirname, "sqlStub.ts"),
      "@tauri-apps/api/core": stub,
      "@tauri-apps/api/event": stub,
      "@tauri-apps/api/window": stub,
      "@tauri-apps/api/webviewWindow": stub,
      "@tauri-apps/plugin-notification": stub,
      "@tauri-apps/plugin-process": stub,
      "@tauri-apps/plugin-updater": stub,
      "@tauri-apps/plugin-autostart": stub,
      "@": path.resolve(proj, "src"),
    },
  },
  server: { port: 1430, strictPort: true, fs: { allow: [proj] } },
});
