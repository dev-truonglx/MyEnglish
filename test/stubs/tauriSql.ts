/**
 * Test double for @tauri-apps/plugin-sql backed by a real in-memory SQLite (node:sqlite),
 * so services run their actual schema, migrations and queries in tests.
 */
import { DatabaseSync } from "node:sqlite";

/** Rewrite tauri-style `$1, $2` placeholders to positional `?` and reorder params to match. */
function bind(sql: string, params: unknown[] = []): { sql: string; args: unknown[] } {
  const args: unknown[] = [];
  const rewritten = sql.replace(/\$(\d+)/g, (_, n: string) => {
    const value = params[Number(n) - 1];
    args.push(value === undefined ? null : typeof value === "boolean" ? Number(value) : value);
    return "?";
  });
  return { sql: rewritten, args };
}

export default class Database {
  private db: DatabaseSync;

  constructor() {
    this.db = new DatabaseSync(":memory:");
  }

  static async load(_path: string): Promise<Database> {
    return new Database();
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ rowsAffected: number; lastInsertId: number }> {
    if (params.length === 0 && !/\$\d+/.test(sql)) {
      this.db.exec(sql);
      return { rowsAffected: 0, lastInsertId: 0 };
    }
    const { sql: q, args } = bind(sql, params);
    const res = this.db.prepare(q).run(...(args as never[]));
    return { rowsAffected: Number(res.changes), lastInsertId: Number(res.lastInsertRowid) };
  }

  async select<T>(sql: string, params: unknown[] = []): Promise<T> {
    const { sql: q, args } = bind(sql, params);
    return this.db.prepare(q).all(...(args as never[])) as T;
  }

  async close(): Promise<boolean> {
    this.db.close();
    return true;
  }
}
