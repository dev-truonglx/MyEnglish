// Service worker: caches the app shell and static assets for offline use.
// Same-origin GET requests only; cross-origin calls (e.g. Supabase) are never touched.

// Bump when db-worker.mjs or the SQLite files change: they are served cache-first and are not content-hashed
const VERSION = "v2";
const CACHE_NAME = `myenglish-${VERSION}`;

const PRECACHE_URLS = [
  "/learn",
  "/manifest.webmanifest",
  "/app-icon.png",
  "/db-worker.mjs",
  "/sqlite/index.mjs",
  "/sqlite/sqlite3.wasm",
  "/sqlite/sqlite3-opfs-async-proxy.js",
];

// Precache the shell; the new worker waits until the page asks it to activate.
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

// Applies the update when the page sends {type: "SKIP_WAITING"}.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Drop caches from other versions, then take control of open pages.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/sqlite/") ||
    url.pathname === "/db-worker.mjs" ||
    url.pathname === "/app-icon.png"
  );
}

// Cache-first: serve from cache, otherwise fetch and store the response.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

// Network-first for navigations; offline falls back to the cached /learn shell.
async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch (err) {
    const cache = await caches.open(CACHE_NAME);
    const fallback = await cache.match("/learn");
    if (fallback) return fallback;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never intercept other origins.
  if (url.origin !== self.location.origin) return;
  // Development (push testing registers this worker there too): dev chunks are not content-hashed
  if (self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1") return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
  }
  // Everything else: not intercepted, goes straight to the network.
});

// ─── Web Push ────────────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    try {
      payload = { body: event.data ? event.data.text() : "" };
    } catch {
      payload = {};
    }
  }

  const title = payload.title || "MyEnglish";
  const body = payload.body || "";
  const tag = payload.tag;
  const url = payload.url || "/learn";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: "/app-icon.png",
      badge: "/app-icon.png",
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data && event.notification.data.url) || "/learn";
  const targetUrl = new URL(rawUrl, self.location.origin).href;
  const learnPrefix = new URL("/learn", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.startsWith(learnPrefix) && "focus" in client) {
          await client.focus();
          // The open app switches tab itself (ClientShell): navigating would reload it mid-session
          if (client.url !== targetUrl) client.postMessage({ type: "OPEN_URL", url: rawUrl });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(rawUrl || "/learn");
      }
    })
  );
});
