import { getSupabase } from "@/services/supabase";
import { useAuthStore } from "@/stores/authStore";
import { buildPushPlan } from "./pushPlan";

export const PUSH_STORAGE_KEY = "myenglish_web_push_v1";

export type PushStatus = "unsupported" | "denied" | "off" | "on";

/**
 * Checks whether Web Push and the required browser APIs are available
 * along with the public VAPID configuration.
 */
export function isPushSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey || !vapidKey.trim()) return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Returns the current push notification status for this client.
 */
export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      try {
        localStorage.setItem(PUSH_STORAGE_KEY, "1");
      } catch {}
      return "on";
    }
    try {
      localStorage.removeItem(PUSH_STORAGE_KEY);
    } catch {}
  } catch (err) {
    console.warn("Failed to check push subscription status:", err);
  }
  return "off";
}

/** Converts base64url string to Uint8Array for applicationServerKey */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Requests permission, registers service worker if needed, subscribes to PushManager,
 * informs Supabase via RPC push_subscribe, and uploads the initial push plan.
 */
export async function enablePush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    console.warn("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not defined");
    return false;
  }

  try {
    // Push needs the service worker even in development
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await navigator.serviceWorker.register("/sw.js");
    }
    const readyReg = await navigator.serviceWorker.ready;

    let sub = await readyReg.pushManager.getSubscription();
    if (!sub) {
      sub = await readyReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
      });
    }

    const subJson = sub.toJSON();
    const keys = subJson.keys || {};
    const p256dh = keys.p256dh;
    const auth = keys.auth;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

    // The server must know this browser, or nothing will ever be delivered: a failure here is a failure
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.rpc("push_subscribe", {
      p_endpoint: sub.endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
      p_ua: ua,
    });
    if (error) {
      console.warn("RPC push_subscribe failed:", error);
      await sub.unsubscribe().catch(() => {});
      return false;
    }

    try {
      localStorage.setItem(PUSH_STORAGE_KEY, "1");
    } catch {}

    await uploadPushPlan();
    return true;
  } catch (err) {
    console.warn("enablePush failed:", err);
    return false;
  }
}

/**
 * Unsubscribes from push notifications on the client and notifies Supabase
 * to clear the push subscription and clear the scheduled plan.
 */
export async function disablePush(): Promise<void> {
  try {
    try {
      localStorage.removeItem(PUSH_STORAGE_KEY);
    } catch {}

    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    const endpoint = sub?.endpoint;

    if (sub) {
      await sub.unsubscribe().catch((err) => console.warn("Failed to unsubscribe pushManager:", err));
    }

    const supabase = getSupabase();
    if (supabase) {
      if (endpoint) {
        const { error: unsubErr } = await supabase.rpc("push_unsubscribe", { p_endpoint: endpoint });
        if (unsubErr) console.warn("RPC push_unsubscribe failed:", unsubErr);
      }
      const { error: planErr } = await supabase.rpc("push_plan_set", { p_items: [] });
      if (planErr) console.warn("RPC push_plan_set [] failed:", planErr);
    }
  } catch (err) {
    console.warn("disablePush failed:", err);
  }
}

/**
 * Uploads the push plan to Supabase if push is enabled and a user is signed in.
 * Never throws errors to callers.
 */
export async function uploadPushPlan(): Promise<void> {
  try {
    const status = await getPushStatus();
    if (status !== "on") return;

    const user = useAuthStore.getState().user;
    if (!user?.id) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const plan = await buildPushPlan();
    const { error } = await supabase.rpc("push_plan_set", { p_items: plan });
    if (error) {
      console.warn("RPC push_plan_set failed:", error);
    }
  } catch (err) {
    console.warn("uploadPushPlan failed:", err);
  }
}

/**
 * Starts periodic and event-driven updates for the push reminder plan:
 * calls uploadPushPlan on start, on window event "myenglish-sync-finished",
 * on visibilitychange to hidden, and every 30 minutes. Returns a cleanup function.
 */
export function startPushPlanner(): () => void {
  if (typeof window === "undefined") return () => {};

  void uploadPushPlan();

  const onSyncFinished = () => {
    void uploadPushPlan();
  };
  window.addEventListener("myenglish-sync-finished", onSyncFinished);

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      void uploadPushPlan();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  const interval = setInterval(() => {
    void uploadPushPlan();
  }, 30 * 60 * 1000);

  return () => {
    window.removeEventListener("myenglish-sync-finished", onSyncFinished);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    clearInterval(interval);
  };
}
