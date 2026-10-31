import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import pkg from "./package.json" with { type: "json" };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const extensionDir = path.resolve(__dirname, "extension");
  const platformDir = path.resolve(extensionDir, "platform");
  const srcDir = path.resolve(__dirname, "src");

  return {
    root: extensionDir,
    publicDir: path.resolve(extensionDir, "public"),
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(env.VITE_SUPABASE_URL ?? ""),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ""),
    },
    resolve: {
      alias: {
        "@tauri-apps/plugin-sql": path.join(platformDir, "sql.ts"),
        "@tauri-apps/api/core": path.join(platformDir, "tauri-core.ts"),
        "@tauri-apps/api/event": path.join(platformDir, "tauri-event.ts"),
        "@tauri-apps/api/window": path.join(platformDir, "tauri-window.ts"),
        "@tauri-apps/api/webview": path.join(platformDir, "tauri-window.ts"),
        "@tauri-apps/api/webviewWindow": path.join(platformDir, "tauri-window.ts"),
        "@tauri-apps/plugin-notification": path.join(platformDir, "tauri-notification.ts"),
        "@tauri-apps/plugin-updater": path.join(platformDir, "tauri-desktop-only.ts"),
        "@tauri-apps/plugin-process": path.join(platformDir, "tauri-desktop-only.ts"),
        "@tauri-apps/plugin-autostart": path.join(platformDir, "tauri-desktop-only.ts"),
        "@tauri-apps/plugin-opener": path.join(platformDir, "tauri-desktop-only.ts"),
        "@": srcDir,
        "~": extensionDir,
      },
    },
    plugins: [react()],
    build: {
      outDir: path.resolve(__dirname, "dist-extension"),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: path.resolve(extensionDir, "index.html"),
          popup: path.resolve(extensionDir, "popup.html"),
          sidepanel: path.resolve(extensionDir, "sidepanel.html"),
          background: path.resolve(extensionDir, "src/background.ts"),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === "background") return "[name].js";
            return "assets/[name]-[hash].js";
          },
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash].[ext]",
        },
      },
    },
  };
});
