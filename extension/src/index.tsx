import React from "react";
import ReactDOM from "react-dom/client";
import ExtensionShell from "../shell/ExtensionShell";
import "@/index.css";
import type { DashboardTab } from "@/components/dashboard/shared";

function getTabFromUrl(): DashboardTab | undefined {
  try {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as DashboardTab | null;
    const validTabs: DashboardTab[] = [
      "today",
      "library",
      "known",
      "capture",
      "reading",
      "writing",
      "review",
      "forgotten",
      "analytics",
      "guide",
      "grammar",
      "pronunciation",
      "leaderboard",
      "account",
    ];
    if (tab && validTabs.includes(tab)) return tab;
  } catch {
    // fallback
  }
  return "today";
}

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ExtensionShell mode="fullscreen" initialTab={getTabFromUrl()} />
    </React.StrictMode>
  );
}
