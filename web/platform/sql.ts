/**
 * Web stand-in for @tauri-apps/plugin-sql (next.config.ts aliases the import here). Every call goes to the
 * SQLite worker (public/db-worker.mjs); the services keep their SQL unchanged.
 */
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker("/db-worker.mjs", { type: "module", name: "myenglish-db" });
  worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.error !== undefined) p.reject(new Error(e.data.error));
    else p.resolve(e.data.result);
  };
  return worker;
}

function call<T>(msg: Record<string, unknown>): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    getWorker().postMessage({ id, ...msg });
  });
}

let opened: Promise<{ persistent: boolean }> | null = null;

/** Whether the database survives a reload (false = OPFS unavailable, kept in memory) */
export function openDatabaseFile(path: string): Promise<{ persistent: boolean }> {
  // "sqlite:myenglish.db" → "myenglish.db"
  opened ??= call<{ persistent: boolean }>({ op: "open", name: path.replace(/^sqlite:/, "") });
  return opened;
}

export interface QueryResult {
  rowsAffected: number;
  lastInsertId?: number;
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
    return call<boolean>({ op: "close" });
  }
}
