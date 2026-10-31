/**
 * Web side of the desktop `compute_fsrs_parameters` command: the same Rust optimizer, compiled to
 * WebAssembly, run in a worker (public/fsrs-worker.mjs). One run at a time, like the desktop.
 */
let running = false;

export async function computeFsrsParameters(items: unknown): Promise<unknown> {
  if (running) throw new Error("Đang tối ưu tham số, vui lòng đợi lượt trước xong");
  running = true;
  const worker = new Worker("/fsrs-worker.mjs", { type: "module", name: "myenglish-fsrs" });
  try {
    const reply = await new Promise<{ ok: boolean; result?: unknown; error?: string }>((resolve, reject) => {
      worker.onmessage = (e) => resolve(e.data);
      worker.onerror = (e) => reject(new Error(e.message || "FSRS worker failed"));
      worker.postMessage({ items });
    });
    if (!reply.ok) throw new Error(reply.error ?? "FSRS optimization failed");
    return reply.result;
  } finally {
    worker.terminate();
    running = false;
  }
}
