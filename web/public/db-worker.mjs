/**
 * The app's SQLite database on the web: SQLite WASM in this worker, stored in OPFS (opfs-sahpool VFS).
 * Speaks the same calls as @tauri-apps/plugin-sql (execute / select with $1, $2 placeholders), so the
 * services run their own schema, migrations and queries unchanged. See web/platform/sql.ts.
 */
import sqlite3InitModule from "./sqlite/index.mjs";

let sqlite3 = null;
let db = null;
let persistent = false;

async function open(name) {
  if (db) return { persistent };
  sqlite3 = await sqlite3InitModule();
  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "myenglish-sahpool" });
    db = new pool.OpfsSAHPoolDb(`/${name}`);
    persistent = true;
  } catch (err) {
    // No OPFS (some private windows): keep working in memory, the account sync refills it after sign-in
    console.warn("OPFS unavailable, database kept in memory:", err);
    db = new sqlite3.oo1.DB(":memory:", "c");
    persistent = false;
  }
  return { persistent };
}

/** Same rewrite as the plugin's: `$1, $2` → positional `?`, booleans → 0/1, undefined → null */
function bind(sql, params = []) {
  const args = [];
  const q = sql.replace(/\$(\d+)/g, (_, n) => {
    const v = params[Number(n) - 1];
    args.push(v === undefined ? null : typeof v === "boolean" ? Number(v) : v);
    return "?";
  });
  return { q, args };
}

function normalize(row) {
  // Integers above 2^53 come back as BigInt; the desktop plugin returns JSON numbers
  for (const k in row) if (typeof row[k] === "bigint") row[k] = Number(row[k]);
  return row;
}

function execute(sql, params) {
  if ((!params || params.length === 0) && !/\$\d+/.test(sql)) {
    db.exec(sql);
  } else {
    const { q, args } = bind(sql, params);
    db.exec({ sql: q, bind: args });
  }
  return {
    rowsAffected: db.changes(),
    lastInsertId: Number(sqlite3.capi.sqlite3_last_insert_rowid(db.pointer)),
  };
}

function select(sql, params) {
  const { q, args } = bind(sql, params);
  const rows = db.exec({ sql: q, bind: args.length ? args : undefined, rowMode: "object", returnValue: "resultRows" });
  return rows.map(normalize);
}

self.onmessage = async (e) => {
  const { id, op, sql, params, name } = e.data;
  try {
    let result;
    if (op === "open") result = await open(name);
    else if (op === "execute") result = execute(sql, params);
    else if (op === "select") result = select(sql, params);
    else if (op === "close") {
      db?.close();
      db = null;
      result = true;
    } else throw new Error(`unknown op ${op}`);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
