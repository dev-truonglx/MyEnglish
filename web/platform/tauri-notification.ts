/** Web stand-in for @tauri-apps/plugin-notification: the browser's Notification API. */
export async function isPermissionGranted(): Promise<boolean> {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  return Notification.requestPermission();
}

export function sendNotification(options: string | { title: string; body?: string }): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const { title, body } = typeof options === "string" ? { title: options, body: undefined } : options;
  try {
    const n = new Notification(title, { body, icon: "/app-icon.png" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (err) {
    console.warn("notification not shown:", err);
  }
}
