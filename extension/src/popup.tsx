import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import ExtensionShell from "../shell/ExtensionShell";
import "@/index.css";
import { ExternalLink, PanelRightClose, Sparkles } from "lucide-react";

function PopupTopBar() {
  const [openInTabPref, setOpenInTabPref] = useState(false);

  useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get(["openInTabOnClick"], (res) => {
        setOpenInTabPref(!!res.openInTabOnClick);
      });
    }
  }, []);

  const openFullTab = () => {
    if (typeof chrome !== "undefined" && chrome.tabs?.query) {
      const url = chrome.runtime.getURL("index.html");
      chrome.tabs.query({ url: chrome.runtime.getURL("index.html*") }, (tabs) => {
        if (tabs.length > 0 && tabs[0].id) {
          chrome.tabs.update(tabs[0].id, { active: true });
          if (tabs[0].windowId) chrome.windows.update(tabs[0].windowId, { focused: true });
        } else {
          chrome.tabs.create({ url });
        }
        window.close();
      });
    } else {
      window.open("/index.html", "_blank");
    }
  };

  const openSidePanel = async () => {
    if (typeof chrome !== "undefined" && (chrome as any).sidePanel?.open) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.windowId) {
          await (chrome as any).sidePanel.open({ windowId: tab.windowId });
          window.close();
        }
      } catch (err) {
        console.warn("Could not open side panel:", err);
      }
    }
  };

  const toggleOpenInTabPref = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setOpenInTabPref(val);
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: "SET_OPEN_IN_TAB_ON_CLICK", value: val });
    }
  };

  const hasSidePanel = typeof chrome !== "undefined" && !!(chrome as any).sidePanel?.open;

  return (
    <div className="shrink-0 flex flex-col bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 z-50">
      {/* Top Header */}
      <header className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <img src="/icons/icon-32.png" alt="MyEnglish" className="w-6 h-6 rounded-lg shadow-xs" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">MyEnglish</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800">
              Extension
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasSidePanel && (
            <button
              onClick={openSidePanel}
              title="Mở thanh bên cạnh bài viết đang đọc"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 transition cursor-pointer"
            >
              <PanelRightClose className="w-3.5 h-3.5 text-cyan-600" />
              <span>Thanh bên</span>
            </button>
          )}

          <button
            onClick={openFullTab}
            title="Mở giao diện đầy đủ trong tab trình duyệt mới"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 active:scale-95 shadow-sm transition-all cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Mở trong tab mới</span>
          </button>
        </div>
      </header>

      {/* Helpful banner for opening full tab experience */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-indigo-500/5 dark:from-cyan-950/40 dark:via-blue-950/40 dark:to-zinc-900 border-t border-cyan-500/15 text-[11px] text-slate-600 dark:text-zinc-300">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
          <span>Học toàn màn hình thoải mái hơn trong tab riêng</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={openInTabPref}
              onChange={toggleOpenInTabPref}
              className="w-3.5 h-3.5 rounded text-cyan-600 focus:ring-cyan-500 accent-cyan-600"
            />
            <span>Luôn mở tab mới khi click icon</span>
          </label>
        </div>
      </div>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <div className="flex flex-col w-full h-full overflow-hidden bg-background text-foreground">
        <PopupTopBar />
        <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
          <ExtensionShell mode="popup" initialTab="today" />
        </div>
      </div>
    </React.StrictMode>
  );
}
