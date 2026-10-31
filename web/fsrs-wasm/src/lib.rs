//! FSRS parameter optimizer for the web version: the desktop app's own code compiled to WebAssembly.
//!
//! Plain C ABI, no wasm-bindgen: JS copies the UTF-8 JSON input (the same `items` the desktop
//! `compute_fsrs_parameters` command takes) into memory from `alloc`, calls `optimize`, and reads back
//! `[length: u32 little-endian][JSON]`, either `{"ok":true,"result":…}` or `{"ok":false,"error":"…"}`.
//! See web/platform/fsrs.ts.

include!("../../../src-tauri/src/fsrs_optimizer.rs");

/// Memory for the caller to write the input into
#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = std::mem::ManuallyDrop::new(Vec::<u8>::with_capacity(len));
    buf.as_mut_ptr()
}

/// Frees a block from `alloc` or `optimize` (`len` = its full size)
///
/// # Safety
/// `ptr` and `len` must come from `alloc(len)` or be an `optimize` result and its `4 + length`.
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

/// Runs the optimizer on JSON input; returns a block holding the JSON result (see the module docs)
///
/// # Safety
/// `ptr` must point to `len` readable bytes.
#[no_mangle]
pub unsafe extern "C" fn optimize(ptr: *const u8, len: usize) -> *mut u8 {
    let input = std::slice::from_raw_parts(ptr, len);
    let out = match serde_json::from_slice::<Vec<FsrsItemInput>>(input) {
        Ok(items) => match optimize_fsrs_parameters(&items) {
            Ok(result) => serde_json::json!({ "ok": true, "result": result }),
            Err(error) => serde_json::json!({ "ok": false, "error": error }),
        },
        Err(e) => serde_json::json!({ "ok": false, "error": format!("Dữ liệu ôn không hợp lệ: {e}") }),
    };
    let json = out.to_string().into_bytes();
    let mut block = Vec::with_capacity(4 + json.len());
    block.extend_from_slice(&(json.len() as u32).to_le_bytes());
    block.extend_from_slice(&json);
    // Exact size, so dealloc(ptr, 4 + length) frees it
    let block = std::mem::ManuallyDrop::new(block.into_boxed_slice());
    block.as_ptr() as *mut u8
}

/// Native entry for the parity check (scripts/web/fsrs-parity.mjs): same function, run outside wasm
pub fn optimize_json(input: &str) -> String {
    let len = input.len();
    unsafe {
        let p = optimize(input.as_ptr(), len);
        let n = u32::from_le_bytes([*p, *p.add(1), *p.add(2), *p.add(3)]) as usize;
        let s = String::from_utf8_lossy(std::slice::from_raw_parts(p.add(4), n)).into_owned();
        dealloc(p, 4 + n);
        s
    }
}
