// Client-side service worker registration (production only, no React).

/**
 * Registers /sw.js. When a new worker finishes installing while an existing
 * controller is active, calls onUpdateReady with an `apply` function that
 * activates the waiting worker and reloads the page once.
 */
export function registerServiceWorker(onUpdateReady: (apply: () => void) => void): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (process.env.NODE_ENV !== "production") return;

  const notify = (worker: ServiceWorker) => {
    onUpdateReady(() => {
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
      worker.postMessage({ type: "SKIP_WAITING" });
    });
  };

  navigator.serviceWorker
    .register("/sw.js")
    .then((registration) => {
      // A new version installed during an earlier visit is still waiting
      if (registration.waiting && navigator.serviceWorker.controller) notify(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            notify(installing);
          }
        });
      });
    })
    .catch((err) => {
      console.warn("Service worker registration failed", err);
    });
}
