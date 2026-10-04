import { defineConfig } from "vitest/config";
import path from "node:path";

const stub = (file: string) => path.resolve(__dirname, "test/stubs", file);

export default defineConfig({
  resolve: {
    alias: {
      "@tauri-apps/plugin-sql": stub("tauriSql.ts"),
      "@tauri-apps/api/core": stub("tauriApi.ts"),
      "@tauri-apps/api/event": stub("tauriApi.ts"),
      "@tauri-apps/api/window": stub("tauriApi.ts"),
      "@tauri-apps/api/webviewWindow": stub("tauriApi.ts"),
      "@tauri-apps/plugin-notification": stub("tauriApi.ts"),
      "@tauri-apps/plugin-process": stub("tauriApi.ts"),
      "@tauri-apps/plugin-updater": stub("tauriApi.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify("test"),
  },
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // Each test file gets fresh module state (db singleton, scheduler cache)
    isolate: true,
    // Services log every DB write to the terminal; keep test output readable
    onConsoleLog: (log) => !log.includes("[DB]"),
  },
});
