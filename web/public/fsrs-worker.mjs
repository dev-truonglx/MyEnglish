/**
 * The FSRS parameter optimizer on the web: the desktop app's own Rust optimizer compiled to WebAssembly
 * (web/fsrs-wasm), run here so the page stays responsive. Message in: { items } (the same input as the
 * desktop `compute_fsrs_parameters` command); message out: { ok, result } or { ok: false, error }.
 */
let exportsPromise = null;

function load() {
  const wasmUrl = "/fsrs/myenglish_fsrs.wasm";
  exportsPromise ??= (
    WebAssembly.instantiateStreaming
      ? WebAssembly.instantiateStreaming(fetch(wasmUrl), {})
          .then((r) => r.instance.exports)
          .catch(() =>
            fetch(wasmUrl)
              .then((r) => r.arrayBuffer())
              .then((bytes) => WebAssembly.instantiate(bytes, {}))
              .then((r) => r.instance.exports)
          )
      : fetch(wasmUrl)
          .then((r) => r.arrayBuffer())
          .then((bytes) => WebAssembly.instantiate(bytes, {}))
          .then((r) => r.instance.exports)
  );
  return exportsPromise;
}

self.onmessage = async (e) => {
  try {
    const { memory, alloc, dealloc, optimize } = await load();
    const bytes = new TextEncoder().encode(JSON.stringify(e.data.items));
    const ptr = alloc(bytes.length);
    new Uint8Array(memory.buffer, ptr, bytes.length).set(bytes);
    const out = optimize(ptr, bytes.length);
    dealloc(ptr, bytes.length);
    const len = new DataView(memory.buffer).getUint32(out, true);
    const text = new TextDecoder().decode(new Uint8Array(memory.buffer, out + 4, len));
    dealloc(out, 4 + len);
    self.postMessage(JSON.parse(text));
  } catch (err) {
    // A trap (e.g. out of memory) ends the module: load it again next time
    exportsPromise = null;
    self.postMessage({ ok: false, error: String(err?.message ?? err) });
  }
};
