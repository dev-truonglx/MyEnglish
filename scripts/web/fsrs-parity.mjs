// Checks that the web FSRS optimizer (WebAssembly) gives the same result as the desktop one (native Rust),
// on the desktop test's synthetic review histories. Usage: node scripts/web/fsrs-parity.mjs [cards...]
// Build the wasm first: node web/scripts/build-fsrs-wasm.mjs
//
// Expect parameters equal up to 1 f32 ulp: exp/ln/pow come from the platform's math library natively and
// from Rust's libm in wasm, and those may round the last bit differently (as macOS and Windows builds of
// the desktop app do between themselves). Such a difference never moves a due date.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const crate = join(dirname(fileURLToPath(import.meta.url)), "../../web/fsrs-wasm");
const run = (args, input) =>
  execFileSync("cargo", ["run", "--quiet", "--release", "--example", "parity", "--", ...args], {
    cwd: crate,
    input,
    maxBuffer: 1 << 28,
  }).toString();

const wasm = readFileSync(join(crate, "target/wasm32-unknown-unknown/release/myenglish_fsrs_wasm.wasm"));
const { instance } = await WebAssembly.instantiate(wasm);
const { memory, alloc, dealloc, optimize } = instance.exports;

function optimizeWasm(json) {
  const bytes = new TextEncoder().encode(json);
  const ptr = alloc(bytes.length);
  new Uint8Array(memory.buffer, ptr, bytes.length).set(bytes);
  const out = optimize(ptr, bytes.length);
  dealloc(ptr, bytes.length);
  const len = new DataView(memory.buffer).getUint32(out, true);
  const text = new TextDecoder().decode(new Uint8Array(memory.buffer, out + 4, len));
  dealloc(out, 4 + len);
  return JSON.parse(text);
}

/** A few f32 ulps at the parameters' magnitude (up to ~100) */
const MAX_ROUNDING = 1e-5;

let failed = false;
for (const cards of process.argv.slice(2).length ? process.argv.slice(2) : ["400", "2000"]) {
  const items = run(["gen", cards]);
  const native = JSON.parse(run(["opt"], items));
  const t0 = Date.now();
  const web = optimizeWasm(items);
  const ms = Date.now() - t0;
  if (!native.ok || !web.ok) {
    console.log(cards, "cards: error", native.error ?? "", web.error ?? "");
    failed = true;
    continue;
  }
  const maxDiff = Math.max(...native.result.parameters.map((p, i) => Math.abs(p - web.result.parameters[i])));
  const verdict = maxDiff === 0 ? "IDENTICAL" : maxDiff <= MAX_ROUNDING ? "SAME (f32 rounding only)" : "DIFFERENT";
  console.log(
    `${cards} cards (${native.result.review_count} reviews): max parameter difference ${maxDiff}, ` +
      `log loss native ${native.result.new_metrics.log_loss} / web ${web.result.new_metrics.log_loss}, ` +
      `wasm ${ms} ms → ${verdict}`
  );
  if (maxDiff > MAX_ROUNDING) failed = true;
}
process.exit(failed ? 1 : 0);
