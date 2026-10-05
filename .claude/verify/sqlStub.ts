// sql.js-backed stand-in for @tauri-apps/plugin-sql
declare global { interface Window { initSqlJs: (o: unknown) => Promise<any>; __vdb?: any } }
let shared: any = null;
async function open() {
  if (shared) return shared;
  const SQL = await window.initSqlJs({ locateFile: (f: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}` });
  shared = new SQL.Database();
  window.__vdb = shared;
  return shared;
}
function bind(sql: string, params: unknown[] = []) {
  const args: unknown[] = [];
  const q = sql.replace(/\$(\d+)/g, (_, n) => {
    const v = params[Number(n) - 1];
    args.push(v === undefined ? null : typeof v === "boolean" ? Number(v) : v);
    return "?";
  });
  return { q, args };
}
export default class Database {
  constructor(private db: any) {}
  static async load() { return new Database(await open()); }
  async execute(sql: string, params: unknown[] = []) {
    if (params.length === 0 && !/\$\d+/.test(sql)) { this.db.exec(sql); return { rowsAffected: 0, lastInsertId: 0 }; }
    const { q, args } = bind(sql, params);
    this.db.run(q, args);
    return { rowsAffected: this.db.getRowsModified(), lastInsertId: 0 };
  }
  async select<T>(sql: string, params: unknown[] = []): Promise<T> {
    const { q, args } = bind(sql, params);
    const stmt = this.db.prepare(q); stmt.bind(args);
    const rows: unknown[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows as T;
  }
  async close() { return true; }
}
