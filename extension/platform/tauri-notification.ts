/**
 * Chrome Extension stand-in for @tauri-apps/plugin-notification.
 * Supports both chrome.notifications and Web Notification API.
 */
export async function isPermissionGranted(): Promise<boolean> {
  if (typeof chrome !== "undefined" && chrome.notifications) {
    return true;
  }
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (typeof chrome !== "undefined" && chrome.notifications) {
    return "granted";
  }
  if (typeof Notification === "undefined") return "denied";
  return Notification.requestPermission();
}

export function sendNotification(options: string | { title: string; body?: string }): void {
  const { title, body } = typeof options === "string" ? { title: options, body: undefined } : options;
  if (typeof chrome !== "undefined" && chrome.notifications?.create) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
      title,
      message: body || "",
      buttons: [{ title: "🚀 Ôn tập ngay" }, { title: "⏰ Để sau" }],
      priority: 2,
    });
    return;
  }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      const n = new Notification(title, {
        body,
        icon: typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL("icons/icon-128.png") : "/app-icon.png",
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (err) {
      console.warn("Notification not shown:", err);
    }
  }
}
