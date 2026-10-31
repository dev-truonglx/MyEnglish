/**
 * Chrome Extension Background Service Worker (Manifest V3)
 * Handles default side panel behavior on icon click, badge counters for due reviews,
 * periodic review alarms, and context menus.
 */

function updateBadge(due: number, isUrgent = true) {
  const text = due > 0 ? (due > 999 ? "999+" : String(due)) : "";
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({
    color: isUrgent && due > 0 ? "#ef4444" : "#0891b2",
  });
}

function openOrFocusDashboardTab(tabName?: string, searchWord?: string) {
  let query = "";
  if (tabName) query += `?tab=${tabName}`;
  if (searchWord) query += `${query ? "&" : "?"}search=${encodeURIComponent(searchWord)}`;
  const targetUrl = chrome.runtime.getURL(`index.html${query}`);

  chrome.tabs.query({ url: chrome.runtime.getURL("index.html*") }, (tabs) => {
    if (tabs.length > 0 && tabs[0].id) {
      chrome.tabs.update(tabs[0].id, { active: true, url: targetUrl });
      if (tabs[0].windowId) chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: targetUrl });
    }
  });
}

// Configure side panel behavior so clicking the icon directly opens the side panel
function setupSidePanelBehavior() {
  // Ensure popup is disabled so icon clicks trigger side panel directly
  chrome.action.setPopup({ popup: "" });

  if ((chrome as any).sidePanel?.setPanelBehavior) {
    (chrome as any).sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err: unknown) => console.warn("Failed to set openPanelOnActionClick:", err));
  }
}

// On install / update
chrome.runtime.onInstalled.addListener(() => {
  setupSidePanelBehavior();

  // Load initial badge
  chrome.storage.local.get(["dueCount", "hasUrgentReviews"], (data) => {
    updateBadge(Number(data.dueCount ?? 0), data.hasUrgentReviews !== false);
  });

  // Context menus
  chrome.contextMenus.create({
    id: "myenglish-open-sidepanel",
    title: "◨ Mở MyEnglish ở thanh bên (Side Panel)",
    contexts: ["action"],
  });

  chrome.contextMenus.create({
    id: "myenglish-open-tab",
    title: "🚀 Mở MyEnglish trong tab mới",
    contexts: ["action"],
  });

  chrome.contextMenus.create({
    id: "myenglish-lookup-word",
    title: "Tra từ '%s' trong MyEnglish",
    contexts: ["selection"],
  });

  // Alarms
  chrome.alarms.create("check-reviews", { periodInMinutes: 15 });
});

// Startup check
chrome.runtime.onStartup.addListener(() => {
  setupSidePanelBehavior();
  chrome.storage.local.get(["dueCount", "hasUrgentReviews"], (data) => {
    updateBadge(Number(data.dueCount ?? 0), data.hasUrgentReviews !== false);
  });
});

// Fallback when user clicks toolbar icon
chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.windowId && (chrome as any).sidePanel?.open) {
    try {
      await (chrome as any).sidePanel.open({ windowId: tab.windowId });
      return;
    } catch {}
  }
  openOrFocusDashboardTab();
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "myenglish-open-sidepanel") {
    if (tab?.windowId && (chrome as any).sidePanel?.open) {
      (chrome as any).sidePanel.open({ windowId: tab.windowId });
    } else {
      openOrFocusDashboardTab();
    }
  } else if (info.menuItemId === "myenglish-open-tab") {
    openOrFocusDashboardTab();
  } else if (info.menuItemId === "myenglish-lookup-word" && info.selectionText) {
    openOrFocusDashboardTab("library", info.selectionText.trim());
  }
});

// Shortcut commands listener (e.g. Alt+Shift+E)
chrome.commands.onCommand.addListener((command) => {
  if (command === "open-myenglish-tab") {
    openOrFocusDashboardTab();
  }
});

// Watch storage for dueCount badge updates
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.dueCount || changes.hasUrgentReviews)) {
    chrome.storage.local.get(["dueCount", "hasUrgentReviews"], (data) => {
      updateBadge(Number(data.dueCount ?? 0), data.hasUrgentReviews !== false);
    });
  }
});

// Periodic alarm listener
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "check-reviews") {
    chrome.storage.local.get(
      ["dueCount", "hasUrgentReviews", "lastNotifiedAt", "lastNotifiedDueCount"],
      (data) => {
        const due = Number(data.dueCount ?? 0);
        const isUrgent = data.hasUrgentReviews !== false;
        updateBadge(due, isUrgent);

        if (due > 0 && typeof chrome.notifications !== "undefined") {
          const now = Date.now();
          const lastNotifiedAt = Number(data.lastNotifiedAt ?? 0);
          const lastNotifiedDueCount = Number(data.lastNotifiedDueCount ?? 0);

          // Quiet hours: 22h - 7h local time
          const currentHour = new Date().getHours();
          const isQuietHours = currentHour >= 22 || currentHour < 7;

          // Notify at least 2 hours apart, or if more cards became due, and not during quiet hours
          const twoHoursMs = 2 * 60 * 60 * 1000;
          const shouldNotify =
            !isQuietHours &&
            (now - lastNotifiedAt > twoHoursMs || due > lastNotifiedDueCount);

          if (shouldNotify) {
            chrome.notifications.create("myenglish-due-reminder", {
              type: "basic",
              iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
              title: "MyEnglish • Đến giờ ôn tập!",
              message: `Bạn có ${due} thẻ cần ôn tập hôm nay (~${Math.max(1, Math.round(due * 0.2))} phút). Nhấp để ôn ngay!`,
              buttons: [{ title: "🚀 Ôn tập ngay" }, { title: "⏰ Để sau" }],
              priority: 1,
            });
            chrome.storage.local.set({
              lastNotifiedAt: now,
              lastNotifiedDueCount: due,
            });
          }
        }
      }
    );
  }
});

// Notifications click listener (opens or focuses Review tab)
if (chrome.notifications) {
  chrome.notifications.onClicked.addListener((notifId) => {
    try {
      chrome.notifications.clear(notifId);
    } catch {}
    openOrFocusDashboardTab("review");
  });

  if (chrome.notifications.onButtonClicked) {
    chrome.notifications.onButtonClicked.addListener((notifId, buttonIndex) => {
      try {
        chrome.notifications.clear(notifId);
      } catch {}
      if (buttonIndex === 0) {
        openOrFocusDashboardTab("review");
      }
    });
  }
}

// Runtime messages listener
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "UPDATE_DUE_BADGE") {
    const due = Number(message.dueCount ?? 0);
    const isUrgent = message.hasUrgentReviews !== false;
    updateBadge(due, isUrgent);
    chrome.storage.local.set({ dueCount: due, hasUrgentReviews: isUrgent });
    sendResponse({ ok: true });
  } else if (message.type === "OPEN_DASHBOARD_TAB") {
    openOrFocusDashboardTab(message.tab, message.search);
    sendResponse({ ok: true });
  }
  return true;
});
