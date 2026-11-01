/**
 * Web stand-in for @tauri-apps/api/event. Desktop events travel between windows (main, popup, nudge);
 * on the web they travel between this tab's listeners and other tabs through a BroadcastChannel.
 */
export type UnlistenFn = () => void;
export interface Event<T> {
  event: string;
  id: number;
  payload: T;
}
export type EventCallback<T> = (event: Event<T>) => void;

const listeners = new Map<string, Set<EventCallback<unknown>>>();
let channel: BroadcastChannel | null = null;
let seq = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatInitTimer: ReturnType<typeof setTimeout> | null = null;

function deliver(event: string, payload: unknown) {
  const set = listeners.get(event);
  if (!set) return;
  for (const cb of [...set]) {
    try {
      cb({ event, id: ++seq, payload });
    } catch (err) {
      console.warn(`listener of "${event}" failed:`, err);
    }
  }
}

function syncHeartbeatTimer() {
  const set = listeners.get("srs-heartbeat");
  if (set && set.size > 0) {
    if (!heartbeatTimer && typeof window !== "undefined") {
      // Initial tick shortly after startup to update tab title and check due reminders, then every 30s like Rust
      heartbeatInitTimer = setTimeout(() => {
        heartbeatInitTimer = null;
        deliver("srs-heartbeat", {});
      }, 1500);
      heartbeatTimer = setInterval(() => {
        deliver("srs-heartbeat", {});
      }, 30_000);
    }
  } else {
    if (heartbeatInitTimer) {
      clearTimeout(heartbeatInitTimer);
      heartbeatInitTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }
}

function getChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === "undefined") return channel;
  channel = new BroadcastChannel("myenglish-events");
  channel.onmessage = (e: MessageEvent<{ event: string; payload: unknown }>) => deliver(e.data.event, e.data.payload);
  return channel;
}

export async function listen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  getChannel();
  let set = listeners.get(event);
  if (!set) listeners.set(event, (set = new Set()));
  set.add(handler as EventCallback<unknown>);
  if (event === "srs-heartbeat") syncHeartbeatTimer();
  return () => {
    set!.delete(handler as EventCallback<unknown>);
    if (event === "srs-heartbeat") syncHeartbeatTimer();
  };
}

export async function once<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  const unlisten = await listen<T>(event, (e) => {
    unlisten();
    handler(e);
  });
  return unlisten;
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  deliver(event, payload);
  try {
    getChannel()?.postMessage({ event, payload });
  } catch (err) {
    // Payloads that cannot be cloned stay in this tab
    console.warn(`event "${event}" not sent to other tabs:`, err);
  }
}
