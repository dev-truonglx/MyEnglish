/**
 * Web stand-in for @tauri-apps/plugin-sql (next.config.ts aliases the import here).
 * Coordinated SQLite architecture:
 * Exactly ONE context (Leader tab) runs db-worker.mjs and holds OPFS SAHPool.
 * All other contexts (Peers: additional tabs) forward SQL queries
 * across BroadcastChannel to the Leader.
 *
 * If the Leader context unloads or closes, the next queued context is automatically
 * promoted to Leader via Web Locks API and spins up the worker seamlessly.
 */

export interface QueryResult {
  rowsAffected: number;
  lastInsertId?: number;
}

type Role = "init" | "leader" | "peer";

const CLIENT_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
const CHANNEL_NAME = "myenglish-db-channel";
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;

let role: Role = "init";
let coordinatorPromise: Promise<void> | null = null;

// Leader worker state
let localWorker: Worker | null = null;
let workerSeq = 0;
const workerPending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

// Peer state
let peerSeq = 0;
const peerPending = new Map<
  number,
  {
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
    msg: Record<string, unknown>;
    acked?: boolean;
    timer?: ReturnType<typeof setTimeout>;
  }
>();

// Deduplicate peer requests on Leader
const inFlightLeaderJobs = new Map<string, Promise<unknown>>();

function getWorkerUrl(): string {
  return "/db-worker.mjs";
}

function getLeaderWorker(): Worker {
  if (localWorker) return localWorker;
  localWorker = new Worker(getWorkerUrl(), { type: "module", name: "myenglish-db" });
  localWorker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
    const p = workerPending.get(e.data.id);
    if (!p) return;
    workerPending.delete(e.data.id);
    if (e.data.error !== undefined) p.reject(new Error(e.data.error));
    else p.resolve(e.data.result);
  };
  localWorker.onerror = (err) => {
    console.error("Local SQLite worker error:", err);
    for (const [id, p] of workerPending.entries()) {
      workerPending.delete(id);
      p.reject(new Error(`Worker error: ${err.message || String(err)}`));
    }
  };
  return localWorker;
}

function executeOnLeader<T>(msg: Record<string, unknown>): Promise<T> {
  const id = ++workerSeq;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (workerPending.has(id)) {
        workerPending.delete(id);
        reject(new Error("Local SQLite worker request timed out"));
      }
    }, 20000);

    workerPending.set(id, {
      resolve: (v: unknown) => {
        clearTimeout(timer);
        resolve(v as T);
      },
      reject: (e: Error) => {
        clearTimeout(timer);
        reject(e);
      },
    });

    try {
      getLeaderWorker().postMessage({ id, ...msg });
    } catch (err) {
      clearTimeout(timer);
      workerPending.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

function executeOnPeer<T>(msg: Record<string, unknown>): Promise<T> {
  const reqId = ++peerSeq;
  return new Promise<T>((resolve, reject) => {
    const entry: {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      msg: Record<string, unknown>;
      acked?: boolean;
      timer?: ReturnType<typeof setTimeout>;
    } = {
      resolve: resolve as (v: unknown) => void,
      reject,
      msg,
      acked: false,
    };
    peerPending.set(reqId, entry);

    const send = () => {
      channel?.postMessage({
        type: "DB_REQ",
        clientId: CLIENT_ID,
        reqId,
        msg,
      });
    };

    send();

    let attempts = 0;
    const retry = () => {
      if (!peerPending.has(reqId) || entry.acked) return;
      if (attempts < 6) {
        attempts++;
        send();
        entry.timer = setTimeout(retry, 250);
      } else {
        // Leader context did not even ACK after 1.5s (frozen, closed, or dead lock).
        // Promote self to Leader and execute locally so startup never fails.
        console.warn("Leader context unresponsive, promoting self to Leader to recover gracefully.");
        peerPending.delete(reqId);
        onPromotedToLeader();
        executeOnLeader<T>(msg).then(resolve).catch(reject);
      }
    };
    entry.timer = setTimeout(retry, 250);
  });
}

function onPromotedToLeader(): void {
  role = "leader";
  // Drain all pending peer calls through the newly active local worker
  for (const [reqId, entry] of peerPending.entries()) {
    if (entry.timer) clearTimeout(entry.timer);
    peerPending.delete(reqId);
    executeOnLeader(entry.msg)
      .then(entry.resolve)
      .catch(entry.reject);
  }
}

// Channel communications
if (channel) {
  channel.onmessage = async (e: MessageEvent) => {
    const data = e.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "DB_REQ" && role === "leader") {
      const { clientId: senderId, reqId, msg } = data;
      // Immediately acknowledge so the Peer knows Leader is alive even during long seeding queries
      channel.postMessage({
        type: "DB_ACK",
        targetClientId: senderId,
        reqId,
      });

      const jobKey = `${senderId}:${reqId}`;
      let job = inFlightLeaderJobs.get(jobKey);

      if (!job) {
        job = executeOnLeader(msg).finally(() => {
          setTimeout(() => inFlightLeaderJobs.delete(jobKey), 1000);
        });
        inFlightLeaderJobs.set(jobKey, job);
      }

      try {
        const result = await job;
        channel.postMessage({
          type: "DB_RES",
          targetClientId: senderId,
          reqId,
          result,
        });
      } catch (err) {
        channel.postMessage({
          type: "DB_RES",
          targetClientId: senderId,
          reqId,
          error: String(err instanceof Error ? err.message : err),
        });
      }
    } else if (data.type === "DB_ACK" && data.targetClientId === CLIENT_ID) {
      const entry = peerPending.get(data.reqId);
      if (entry && !entry.acked) {
        entry.acked = true;
        if (entry.timer) clearTimeout(entry.timer);
        // Leader is alive and working on the query; wait up to 20s for completion
        entry.timer = setTimeout(() => {
          if (peerPending.has(data.reqId)) {
            peerPending.delete(data.reqId);
            entry.reject(new Error("Database query timed out on Leader context"));
          }
        }, 20000);
      }
    } else if (data.type === "DB_RES" && data.targetClientId === CLIENT_ID) {
      const entry = peerPending.get(data.reqId);
      if (entry) {
        peerPending.delete(data.reqId);
        if (entry.timer) clearTimeout(entry.timer);
        if (data.error !== undefined) entry.reject(new Error(data.error));
        else entry.resolve(data.result);
      }
    }
  };
}

function ensureCoordinator(): Promise<void> {
  if (coordinatorPromise) return coordinatorPromise;

  coordinatorPromise = new Promise<void>((resolve) => {
    if (typeof navigator === "undefined" || !("locks" in navigator) || !channel) {
      role = "leader";
      resolve();
      return;
    }

    let resolvedOnce = false;
    const markReady = () => {
      if (!resolvedOnce) {
        resolvedOnce = true;
        resolve();
      }
    };

    // Try immediate acquisition
    navigator.locks
      .request("myenglish-db-coordinator", { ifAvailable: true }, async (lock) => {
        if (lock) {
          role = "leader";
          markReady();
          return new Promise<void>((rel) => {
            const onUnload = () => {
              localWorker?.terminate();
              localWorker = null;
              rel();
            };
            // Use pagehide (not beforeunload) so canceling a beforeunload prompt never kills the worker
            window.addEventListener("pagehide", onUnload);
          });
        } else {
          // Another context is already the Leader
          role = "peer";
          markReady();

          // Queue in case the Leader closes
          navigator.locks
            .request("myenglish-db-coordinator", async (promotedLock) => {
              if (promotedLock) {
                onPromotedToLeader();
                return new Promise<void>((rel) => {
                  const onUnload = () => {
                    localWorker?.terminate();
                    localWorker = null;
                    rel();
                  };
                  window.addEventListener("pagehide", onUnload);
                });
              }
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        console.warn("navigator.locks unavailable, acting as leader:", err);
        role = "leader";
        markReady();
      });
  });

  return coordinatorPromise;
}

async function call<T>(msg: Record<string, unknown>): Promise<T> {
  await ensureCoordinator();
  if (role === "leader") {
    return executeOnLeader<T>(msg);
  } else {
    return executeOnPeer<T>(msg);
  }
}

let opened: Promise<{ persistent: boolean }> | null = null;

/** Whether the database survives a reload (false = OPFS unavailable, kept in memory) */
export function openDatabaseFile(path: string): Promise<{ persistent: boolean }> {
  // "sqlite:myenglish.db" → "myenglish.db"
  if (!opened) {
    opened = call<{ persistent: boolean }>({ op: "open", name: path.replace(/^sqlite:/, "") }).catch((err) => {
      opened = null;
      throw err;
    });
  }
  return opened;
}

export default class Database {
  path: string;

  constructor(path: string) {
    this.path = path;
  }

  static async load(path: string): Promise<Database> {
    await openDatabaseFile(path);
    return new Database(path);
  }

  static get(path: string): Database {
    return new Database(path);
  }

  async execute(query: string, bindValues: unknown[] = []): Promise<QueryResult> {
    return call<QueryResult>({ op: "execute", sql: query, params: bindValues });
  }

  async select<T>(query: string, bindValues: unknown[] = []): Promise<T> {
    return call<T>({ op: "select", sql: query, params: bindValues });
  }

  async close(): Promise<boolean> {
    if (role === "leader") {
      try {
        await call<boolean>({ op: "close" });
      } catch {}
      localWorker?.terminate();
      localWorker = null;
    }
    opened = null;
    return true;
  }
}
