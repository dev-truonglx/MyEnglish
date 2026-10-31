import path from "node:path";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

const root = path.resolve(__dirname, "..");
const src = path.join(root, "src");
const platform = path.join(__dirname, "platform");
const appVersion = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version as string;

/**
 * The web app runs the desktop app's own code from ../src. Only the platform is swapped: every
 * @tauri-apps import resolves to web/platform, and the two bundled data files are loaded from Supabase.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: { externalDir: true },
  outputFileTracingRoot: root,
  webpack(config, { webpack }) {
    config.resolve.alias = {
      ...config.resolve.alias,
      // Exact matches first: they must win over the "@" alias below
      "@/data/vocabCatalog.json$": path.join(platform, "vocab-catalog.ts"),
      "@/data/grammarCatalog.json$": path.join(platform, "grammar-catalog.ts"),
      "@tauri-apps/plugin-sql$": path.join(platform, "sql.ts"),
      "@tauri-apps/api/core$": path.join(platform, "tauri-core.ts"),
      "@tauri-apps/api/event$": path.join(platform, "tauri-event.ts"),
      "@tauri-apps/api/window$": path.join(platform, "tauri-window.ts"),
      "@tauri-apps/api/webview$": path.join(platform, "tauri-window.ts"),
      "@tauri-apps/api/webviewWindow$": path.join(platform, "tauri-window.ts"),
      "@tauri-apps/plugin-notification$": path.join(platform, "tauri-notification.ts"),
      "@tauri-apps/plugin-updater$": path.join(platform, "tauri-desktop-only.ts"),
      "@tauri-apps/plugin-process$": path.join(platform, "tauri-desktop-only.ts"),
      "@tauri-apps/plugin-autostart$": path.join(platform, "tauri-desktop-only.ts"),
      "@tauri-apps/plugin-opener$": path.join(platform, "tauri-desktop-only.ts"),
      "@": src,
    };
    config.plugins.push(
      new webpack.DefinePlugin({
        // src/services/supabase.ts reads Vite's names; on the web they come from NEXT_PUBLIC_*
        "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""),
        "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""),
        __APP_VERSION__: JSON.stringify(appVersion),
      })
    );
    config.experiments = { ...config.experiments, topLevelAwait: true };
    // platform/*-catalog.ts await their Supabase load at the top level; every supported browser has async/await
    config.output.environment = { ...config.output.environment, asyncFunction: true };
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/privacy-policy",
        destination: "/privacy",
      },
    ];
  },
};

export default nextConfig;
