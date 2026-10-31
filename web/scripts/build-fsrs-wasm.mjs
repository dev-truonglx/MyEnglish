// Builds the FSRS optimizer (web/fsrs-wasm: the desktop's src-tauri/src/fsrs_optimizer.rs) to WebAssembly and
// copies it to public/fsrs/. The .wasm is committed, so deploys need no Rust toolchain; rebuild it when
// fsrs_optimizer.rs or the fsrs version changes. Needs: rustup target add wasm32-unknown-unknown
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const crate = join(web, "fsrs-wasm");
execFileSync("cargo", ["build", "--release", "--target", "wasm32-unknown-unknown"], { cwd: crate, stdio: "inherit" });
const out = join(web, "public/fsrs/myenglish_fsrs.wasm");
mkdirSync(dirname(out), { recursive: true });
copyFileSync(join(crate, "target/wasm32-unknown-unknown/release/myenglish_fsrs_wasm.wasm"), out);
console.log(`FSRS optimizer: ${out} (${Math.round(statSync(out).size / 1024)} KB)`);
