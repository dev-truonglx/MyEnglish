// Copies the SQLite WASM build into public/sqlite so the database worker loads it as plain static files
// (no bundler handling of .wasm / workers needed).
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@sqlite.org/sqlite-wasm/dist");
const out = join(root, "public/sqlite");
mkdirSync(out, { recursive: true });
for (const f of ["index.mjs", "sqlite3.wasm", "sqlite3-opfs-async-proxy.js"]) cpSync(join(src, f), join(out, f));
console.log("sqlite-wasm copied to public/sqlite");
