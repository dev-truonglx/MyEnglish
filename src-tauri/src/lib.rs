use std::str::FromStr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
#[cfg(not(target_os = "macos"))]
use tauri_plugin_notification::NotificationExt;

static LAST_NOTIFICATION_TIME: AtomicU64 = AtomicU64::new(0);
/// Set to true before calling relaunch() so CloseRequested lets the process die.
static ALLOW_EXIT: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

fn create_hidden_command<S: AsRef<std::ffi::OsStr>>(program: S) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        // 0x08000000 = CREATE_NO_WINDOW: suppresses Windows console/cmd window creation
        cmd.creation_flags(0x08000000);
    }
    cmd
}

#[cfg(target_os = "macos")]
fn ensure_macos_app_registered() {
    let current_exe = match std::env::current_exe() {
        Ok(path) => path,
        Err(_) => return,
    };

    let parent = match current_exe.parent() {
        Some(p) => p,
        None => return,
    };

    let app_bundle_path = parent.join("MyEnglish.app");
    let contents_dir = app_bundle_path.join("Contents");
    let macos_dir = contents_dir.join("MacOS");
    let resources_dir = contents_dir.join("Resources");

    let _ = std::fs::create_dir_all(&macos_dir);
    let _ = std::fs::create_dir_all(&resources_dir);

    let bundle_bin = macos_dir.join("tauri-app");
    if !bundle_bin.exists() {
        #[cfg(unix)]
        let _ = std::os::unix::fs::symlink(&current_exe, &bundle_bin);
    }

    let plist_path = contents_dir.join("Info.plist");
    if !plist_path.exists() {
        let plist_content = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>com.myenglish.app</string>
    <key>CFBundleName</key>
    <string>MyEnglish</string>
    <key>CFBundleDisplayName</key>
    <string>MyEnglish</string>
    <key>CFBundleExecutable</key>
    <string>tauri-app</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
</dict>
</plist>
"#;
        let _ = std::fs::write(&plist_path, plist_content);
    }

    if let Some(path_str) = app_bundle_path.to_str() {
        let _ = std::process::Command::new("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
            .arg("-f")
            .arg(path_str)
            .output();
    }
}

#[tauri::command]
fn send_desktop_notification(app: AppHandle, title: String, body: String) -> Result<bool, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    LAST_NOTIFICATION_TIME.store(now, Ordering::SeqCst);

    // Emit event to frontend for in-app toast banner and state tracking
    let _ = app.emit("desktop-notification-received", serde_json::json!({
        "title": &title,
        "body": &body,
        "target": "review"
    }));

    #[cfg(target_os = "macos")]
    {
        let app_handle = app.clone();
        let title_c = title.clone();
        let body_c = body.clone();

        std::thread::spawn(move || {
            let mut notif = mac_notification_sys::Notification::new();
            notif.title(&title_c)
                .message(&body_c)
                .sound("Glass")
                .main_button(mac_notification_sys::MainButton::SingleAction("Ôn tập ngay"))
                .wait_for_click(true);

            match notif.send() {
                Ok(mac_notification_sys::NotificationResponse::Click)
                | Ok(mac_notification_sys::NotificationResponse::ActionButton(_)) => {
                    LAST_NOTIFICATION_TIME.store(0, Ordering::SeqCst);
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                        let _ = window.emit("open-review-tab", serde_json::json!({ "auto_start": false }));
                    }
                }
                _ => {}
            }
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app.notification().builder()
            .title(&title)
            .body(&body)
            .show();
    }

    Ok(true)
}

#[tauri::command]
fn trigger_review_navigation(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.emit("open-review-tab", serde_json::json!({ "auto_start": false }));
    }
    Ok(())
}

#[tauri::command]
fn get_clipboard_text() -> String {
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("/usr/bin/pbpaste").output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout).to_string();
                if !text.is_empty() {
                    return text;
                }
            }
        }
    }

    // Cross-platform clipboard via arboard (supports Windows, Linux, macOS fallback)
    for _ in 0..3 {
        if let Ok(mut clipboard) = arboard::Clipboard::new() {
            if let Ok(text) = clipboard.get_text() {
                if !text.is_empty() {
                    return text;
                }
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(30));
    }

    String::new()
}

#[tauri::command]
fn toggle_quick_input(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("quick-input") {
        let is_visible = window.is_visible().map_err(|e| e.to_string())?;
        if is_visible {
            window.hide().map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            if let Some(rp) = app.get_webview_window("review-popup") {
                if rp.is_visible().unwrap_or(false) {
                    let _ = rp.hide();
                }
            }
            if let Some(monitor) = get_monitor_at_cursor(&window) {
                let m_pos = monitor.position();
                let m_size = monitor.size();
                if let Ok(w_size) = window.outer_size() {
                    let x = m_pos.x + ((m_size.width as i32 - w_size.width as i32) / 2);
                    let y = m_pos.y + ((m_size.height as i32 - w_size.height as i32) / 3);
                    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
                }
            }
            let clipboard = get_clipboard_text();
            let _ = window.emit("quick-input-opened", serde_json::json!({ "clipboard": clipboard }));
            let _ = window.set_always_on_top(true);
            let _ = window.unminimize();
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
            Ok(true)
        }
    } else {
        Err("Quick input window not found".to_string())
    }
}

#[tauri::command]
fn hide_quick_input(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("quick-input") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn show_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(qi) = app.get_webview_window("quick-input") {
        let _ = qi.hide();
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
mod macos_cursor {
    use std::ffi::c_void;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventCreate(source: *const c_void) -> *mut c_void;
        fn CGEventGetLocation(event: *mut c_void) -> CGPoint;
        fn CFRelease(cf: *mut c_void);
    }

    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct CGPoint {
        pub x: f64,
        pub y: f64,
    }

    pub fn get_global_cursor_pos() -> Option<CGPoint> {
        unsafe {
            let event = CGEventCreate(std::ptr::null());
            if event.is_null() {
                return None;
            }
            let pt = CGEventGetLocation(event);
            CFRelease(event);
            Some(pt)
        }
    }
}

#[cfg(target_os = "macos")]
mod macos_app {
    use std::ffi::c_void;

    #[link(name = "AppKit", kind = "framework")]
    extern "C" {
        fn objc_getClass(name: *const std::os::raw::c_char) -> *mut c_void;
        fn sel_registerName(name: *const std::os::raw::c_char) -> *mut c_void;
        fn objc_msgSend(receiver: *mut c_void, sel: *mut c_void, ...) -> *mut c_void;
    }

    pub fn activate_app_ignoring_other_apps() {
        unsafe {
            let ns_app_cls = objc_getClass(b"NSApplication\0".as_ptr() as *const _);
            if ns_app_cls.is_null() {
                return;
            }
            let shared_app_sel = sel_registerName(b"sharedApplication\0".as_ptr() as *const _);
            let shared_app = objc_msgSend(ns_app_cls, shared_app_sel);
            if shared_app.is_null() {
                return;
            }
            let activate_sel = sel_registerName(b"activateIgnoringOtherApps:\0".as_ptr() as *const _);
            let activate_fn: unsafe extern "C" fn(*mut c_void, *mut c_void, bool) -> *mut c_void =
                std::mem::transmute(objc_msgSend as *const ());
            activate_fn(shared_app, activate_sel, true);
        }
    }
}

fn get_monitor_at_cursor(window: &tauri::WebviewWindow) -> Option<tauri::Monitor> {
    let monitors = window.available_monitors().ok()?;

    #[cfg(target_os = "macos")]
    {
        if let Some(cursor) = macos_cursor::get_global_cursor_pos() {
            for m in &monitors {
                let scale = m.scale_factor();
                let pos = m.position();
                let size = m.size();
                let left = pos.x as f64 / scale;
                let top = pos.y as f64 / scale;
                let right = left + (size.width as f64 / scale);
                let bottom = top + (size.height as f64 / scale);

                if cursor.x >= left && cursor.x < right && cursor.y >= top && cursor.y < bottom {
                    return Some(m.clone());
                }
            }
        }
    }

    // Fallback for non-macOS or if CoreGraphics call failed:
    if let Ok(cursor_pos) = window.cursor_position() {
        for m in &monitors {
            let m_pos = m.position();
            let m_size = m.size();
            let x = cursor_pos.x as i32;
            let y = cursor_pos.y as i32;
            if x >= m_pos.x
                && x < m_pos.x + m_size.width as i32
                && y >= m_pos.y
                && y < m_pos.y + m_size.height as i32
            {
                return Some(m.clone());
            }
        }
    }

    window.current_monitor().ok().flatten().or_else(|| window.primary_monitor().ok().flatten())
}

/// Robust monitor selection:
/// 1. If "main" window is visible, show popup on the SAME monitor the user is viewing the dashboard!
/// 2. If "main" window is hidden/minimized, target the monitor where the cursor currently resides.
/// 3. Fallback to primary monitor (guaranteed to be the active display with menu bar).
fn get_target_monitor_for_popup(app: &AppHandle, popup_win: &tauri::WebviewWindow) -> Option<tauri::Monitor> {
    if let Some(main_win) = app.get_webview_window("main") {
        if main_win.is_visible().unwrap_or(false) {
            if let Ok(Some(m)) = main_win.current_monitor() {
                return Some(m);
            }
        }
    }

    if let Some(m) = get_monitor_at_cursor(popup_win) {
        return Some(m);
    }

    popup_win.primary_monitor().ok().flatten().or_else(|| popup_win.current_monitor().ok().flatten())
}

#[tauri::command]
fn show_review_popup(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("review-popup") {
        let _ = window.set_visible_on_all_workspaces(true);
        let _ = window.set_always_on_top(true);
        let _ = window.unminimize();

        #[cfg(target_os = "macos")]
        {
            macos_app::activate_app_ignoring_other_apps();
        }

        if let Some(monitor) = get_target_monitor_for_popup(&app, &window) {
            let size = monitor.size();
            let pos = monitor.position();
            let _ = window.set_position(tauri::Position::Physical(*pos));
            let _ = window.set_size(tauri::Size::Physical(*size));
        }

        window.show().map_err(|e| e.to_string())?;

        // Re-apply on visible window to guarantee macOS AppKit applies frame to the target screen
        if let Some(monitor) = get_target_monitor_for_popup(&app, &window) {
            let size = monitor.size();
            let pos = monitor.position();
            let _ = window.set_position(tauri::Position::Physical(*pos));
            let _ = window.set_size(tauri::Size::Physical(*size));
            eprintln!(
                "[ReviewPopup] monitor pos: {:?}, size: {:?}, current win pos: {:?}, win size: {:?}",
                pos,
                size,
                window.outer_position().ok(),
                window.inner_size().ok()
            );
        }

        let _ = window.set_focus();

        // Broadcast to ALL windows (app.emit instead of window.emit)
        let _ = app.emit("review-popup-opened", serde_json::json!({
            "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64
        }));
        Ok(true)
    } else {
        Err("Review popup window not found".to_string())
    }
}

#[tauri::command]
fn hide_review_popup(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("review-popup") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn clean_json_string(s: &str) -> String {
    let text = s.trim();

    // 1. If markdown code block exists (```json ... ``` or ``` ... ```), strip wrapper
    let unquoted = if let Some(start_idx) = text.find("```json") {
        let after_start = &text[start_idx + 7..];
        if let Some(end_idx) = after_start.rfind("```") {
            after_start[..end_idx].trim()
        } else {
            after_start.trim()
        }
    } else if let Some(start_idx) = text.find("```") {
        let after_start = &text[start_idx + 3..];
        if let Some(end_idx) = after_start.rfind("```") {
            after_start[..end_idx].trim()
        } else {
            after_start.trim()
        }
    } else {
        text
    };

    // 2. Identify outer JSON delimiter: either object `{ ... }` or array `[ ... ]`
    let first_brace = unquoted.find('{');
    let first_bracket = unquoted.find('[');

    match (first_brace, first_bracket) {
        (Some(b), Some(k)) => {
            if k < b {
                // Array bracket appears first
                if let Some(last_bracket) = unquoted.rfind(']') {
                    if last_bracket >= k {
                        return unquoted[k..=last_bracket].to_string();
                    }
                }
                if let Some(last_brace) = unquoted.rfind('}') {
                    if last_brace >= b {
                        return unquoted[b..=last_brace].to_string();
                    }
                }
            } else {
                // Object brace appears first
                if let Some(last_brace) = unquoted.rfind('}') {
                    if last_brace >= b {
                        return unquoted[b..=last_brace].to_string();
                    }
                }
                if let Some(last_bracket) = unquoted.rfind(']') {
                    if last_bracket >= k {
                        return unquoted[k..=last_bracket].to_string();
                    }
                }
            }
        }
        (Some(b), None) => {
            if let Some(last_brace) = unquoted.rfind('}') {
                if last_brace >= b {
                    return unquoted[b..=last_brace].to_string();
                }
            }
        }
        (None, Some(k)) => {
            if let Some(last_bracket) = unquoted.rfind(']') {
                if last_bracket >= k {
                    return unquoted[k..=last_bracket].to_string();
                }
            }
        }
        (None, None) => {}
    }

    unquoted.to_string()
}

/// Called by the frontend BEFORE invoking relaunch() during an update.
/// Sets ALLOW_EXIT so the CloseRequested handler doesn't swallow the quit.
#[tauri::command]
fn prepare_update_exit() {
    ALLOW_EXIT.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn log_debug(tag: String, message: String) {
    println!("[{}] {}", tag, message);
}

#[derive(serde::Serialize)]
pub struct CliStatusResult {
    pub installed: bool,
    pub path: String,
    pub details: Option<String>,
    pub error: Option<String>,
}

fn resolve_cli_candidate(path: &std::path::Path) -> Option<String> {
    if path.is_file() {
        return Some(path.to_string_lossy().to_string());
    }
    if path.is_dir() {
        let exe_names = [
            "agy.exe",
            "agy",
            "gemini.exe",
            "gemini",
            "antigravity.exe",
            "antigravity",
            "bin/agy.exe",
            "bin/agy",
            "bin/gemini.exe",
            "bin/gemini",
        ];
        for name in exe_names {
            let candidate = path.join(name);
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().to_string());
            }
        }
    }
    None
}

/// Resolve the agy/gemini binary path cross-platform.
/// Checks user custom path first, then extensive default directories on Windows/macOS/Linux
/// (including .gemini/antigravity-cli, .gemini/bin, etc.), and finally performs a system PATH lookup.
fn get_cli_bin_path(custom_path: Option<&str>) -> (String, bool) {
    if let Some(cp) = custom_path {
        let trimmed = cp.trim();
        if !trimmed.is_empty() {
            let p = std::path::Path::new(trimmed);
            if let Some(resolved) = resolve_cli_candidate(p) {
                return (resolved, true);
            }
        }
    }

    #[cfg(target_os = "windows")]
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_default();
    #[cfg(not(target_os = "windows"))]
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();

    let home_path = std::path::Path::new(&home);

    let mut candidates: Vec<std::path::PathBuf> = Vec::new();

    // Check .gemini/antigravity-cli (common on Windows)
    candidates.push(home_path.join(".gemini").join("antigravity-cli"));
    candidates.push(home_path.join(".gemini").join("antigravity-cli").join("agy.exe"));
    candidates.push(home_path.join(".gemini").join("antigravity-cli").join("agy"));
    candidates.push(home_path.join(".gemini").join("antigravity-cli").join("bin").join("agy.exe"));
    candidates.push(home_path.join(".gemini").join("antigravity-cli").join("bin").join("agy"));
    candidates.push(home_path.join(".gemini").join("antigravity-cli").join("antigravity.exe"));
    candidates.push(home_path.join(".gemini").join("antigravity-cli.exe"));

    // Check .gemini/bin
    candidates.push(home_path.join(".gemini").join("bin").join("agy.exe"));
    candidates.push(home_path.join(".gemini").join("bin").join("agy"));
    candidates.push(home_path.join(".gemini").join("bin").join("gemini.exe"));
    candidates.push(home_path.join(".gemini").join("bin").join("gemini"));

    // Check .antigravity
    candidates.push(home_path.join(".antigravity").join("bin").join("agy.exe"));
    candidates.push(home_path.join(".antigravity").join("bin").join("agy"));

    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let lp = std::path::Path::new(&local_app_data);
            candidates.push(lp.join("Programs").join("antigravity").join("agy.exe"));
            candidates.push(lp.join("antigravity-cli").join("agy.exe"));
            candidates.push(lp.join("antigravity").join("agy.exe"));
        }
        if let Ok(app_data) = std::env::var("APPDATA") {
            let ap = std::path::Path::new(&app_data);
            candidates.push(ap.join("npm").join("agy.cmd"));
            candidates.push(ap.join("npm").join("agy.exe"));
        }
    }

    for cand in &candidates {
        if let Some(resolved) = resolve_cli_candidate(cand) {
            return (resolved, true);
        }
    }

    // Fallback: search system PATH using where (Windows) or which (Unix)
    #[cfg(target_os = "windows")]
    {
        for cmd_name in &["agy.exe", "agy", "gemini.exe", "gemini"] {
            if let Ok(output) = create_hidden_command("where").arg(cmd_name).output() {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    if let Some(first_line) = stdout.lines().next() {
                        let trimmed = first_line.trim();
                        if !trimmed.is_empty() && std::path::Path::new(trimmed).exists() {
                            return (trimmed.to_string(), true);
                        }
                    }
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        for cmd_name in &["agy", "gemini"] {
            if let Ok(output) = create_hidden_command("which").arg(cmd_name).output() {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let trimmed = stdout.trim();
                    if !trimmed.is_empty() && std::path::Path::new(trimmed).exists() {
                        return (trimmed.to_string(), true);
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let fallback = home_path.join(".gemini").join("antigravity-cli").join("agy.exe");
        (fallback.to_string_lossy().to_string(), false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let fallback = home_path.join(".gemini").join("bin").join("agy");
        (fallback.to_string_lossy().to_string(), false)
    }
}

#[tauri::command]
fn check_cli_status(custom_path: Option<String>) -> CliStatusResult {
    let (bin_path, exists) = get_cli_bin_path(custom_path.as_deref());

    if !exists {
        return CliStatusResult {
            installed: false,
            path: bin_path,
            details: None,
            error: Some("Không tìm thấy binary agy. Hãy kiểm tra hoặc dán đường dẫn cài đặt vào ô cấu hình tùy chỉnh bên dưới.".to_string()),
        };
    }

    match create_hidden_command(&bin_path).arg("--help").output() {
        Ok(out) => {
            if out.status.success() {
                CliStatusResult {
                    installed: true,
                    path: bin_path,
                    details: Some("Antigravity CLI (Sẵn sàng hoạt động)".to_string()),
                    error: None,
                }
            } else {
                let err = String::from_utf8_lossy(&out.stderr).to_string();
                CliStatusResult {
                    installed: true,
                    path: bin_path,
                    details: None,
                    error: Some(format!("CLI trả về lỗi: {}", err)),
                }
            }
        }
        Err(e) => CliStatusResult {
            installed: false,
            path: bin_path,
            details: None,
            error: Some(format!("Không thể khởi chạy: {}", e)),
        },
    }
}

#[tauri::command]
async fn enrich_word_with_gemini(word: String, custom_path: Option<String>) -> Result<serde_json::Value, String> {
    let clean_word = word.trim().to_lowercase();
    if clean_word.is_empty() {
        return Err("Word cannot be empty".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let (bin_path, _) = get_cli_bin_path(custom_path.as_deref());
        println!("[MyEnglish AI] Bắt đầu phân tích từ '{}' bằng binary: '{}'", clean_word, bin_path);
        let start_time = std::time::Instant::now();

        let prompt = format!(
            "Analyze the English tech vocabulary: '{clean_word}'. \
            Return strictly valid JSON with no markdown formatting or backticks, matching this exact schema: \
            {{\
              \"phonetic\": \"/IPA/\",\
              \"part_of_speech\": \"noun|verb|adjective|adverb\",\
              \"topic\": \"Category (e.g. System Design, DevOps, Frontend, Database, Concurrency, Security, General Tech, Everyday Life)\",\
              \"meaning_vn\": \"Concise, clear Vietnamese meaning in tech & daily context\",\
              \"collocations\": [\"phrase 1\", \"phrase 2\", \"phrase 3\"],\
              \"code_snippet\": \"// 2-3 lines realistic code illustrating '{clean_word}'\",\
              \"examples\": [\
                {{\
                  \"sentence_en\": \"Present Simple or Continuous sentence with '{clean_word}'\",\
                  \"sentence_vn\": \"Bản dịch tiếng Việt\",\
                  \"grammar_analysis\": \"[Present Simple] S + V(s/es) - Thói quen/Quy tắc\"\
                }},\
                {{\
                  \"sentence_en\": \"Past Simple or Continuous sentence with '{clean_word}'\",\
                  \"sentence_vn\": \"Bản dịch tiếng Việt\",\
                  \"grammar_analysis\": \"[Past Simple] S + V2/ed - Sự kiện đã xảy ra\"\
                }},\
                {{\
                  \"sentence_en\": \"Present Perfect, Conditional, or Passive sentence with '{clean_word}'\",\
                  \"sentence_vn\": \"Bản dịch tiếng Việt\",\
                  \"grammar_analysis\": \"[Present Perfect/Passive] Cấu trúc & giải thích\"\
                }}\
              ],\
              \"synonyms\": [\
                {{\
                  \"word\": \"synonym1\",\
                  \"phonetic\": \"/IPA/\",\
                  \"meaning_vn\": \"Nghĩa tiếng Việt ngắn\",\
                  \"examples\": [{{\"sentence_en\": \"Short sample sentence\", \"meaning_vn\": \"Bản dịch\"}}]\
                }}\
              ],\
              \"antonyms\": [\
                {{\
                  \"word\": \"antonym1\",\
                  \"phonetic\": \"/IPA/\",\
                  \"meaning_vn\": \"Nghĩa tiếng Việt ngắn\",\
                  \"examples\": [{{\"sentence_en\": \"Short sample sentence\", \"meaning_vn\": \"Bản dịch\"}}]\
                }}\
              ]\
            }}"
        );

        // Fast mode: gemini-3.8-flash-low with disabled slash commands & 35s timeout
        let mut fast_cmd = create_hidden_command(&bin_path);
        fast_cmd.arg("--dangerously-skip-permissions");
        fast_cmd.arg("--disable-slash-commands");
        fast_cmd.arg("--model").arg("gemini-3.6-flash-medium");
        fast_cmd.arg("--print-timeout").arg("35s");
        fast_cmd.arg("-p").arg(&prompt);

        let output = match fast_cmd.output() {
            Ok(out) if out.status.success() => out,
            _ => {
                // Fallback attempt: Basic arguments without model flags in case of older CLI versions
                create_hidden_command(&bin_path)
                    .arg("--dangerously-skip-permissions")
                    .arg("-p")
                    .arg(&prompt)
                    .output()
                    .map_err(|e| format!("Failed to execute Gemini CLI at '{}': {}", bin_path, e))?
            }
        };

        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            eprintln!("[MyEnglish AI] Lỗi CLI ({:?}): {}", output.status.code(), err_msg);
            return Err(format!(
                "Gemini CLI exited with code {:?}: {}",
                output.status.code(),
                err_msg
            ));
        }

        let raw_stdout = String::from_utf8_lossy(&output.stdout);
        let cleaned = clean_json_string(&raw_stdout);

        let parsed: serde_json::Value = serde_json::from_str(&cleaned).map_err(|e| {
            eprintln!("[MyEnglish AI] Lỗi parse JSON: {}. Raw: {}", e, cleaned);
            format!(
                "Failed to parse Gemini response as JSON: {}. Raw output was: {}",
                e, cleaned
            )
        })?;

        let elapsed = start_time.elapsed();
        println!("[MyEnglish AI] Phân tích hoàn tất cho '{}' trong {:.2?}", clean_word, elapsed);

        Ok(parsed)
    })
    .await
    .map_err(|e| format!("Task execution failed: {}", e))?
}

#[tauri::command]
async fn generate_grammar_exercises_ai(
    topic: String,
    level: String,
    custom_path: Option<String>,
) -> Result<serde_json::Value, String> {
    let clean_topic = topic.trim().to_string();
    if clean_topic.is_empty() {
        return Err("Topic cannot be empty".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let (bin_path, _) = get_cli_bin_path(custom_path.as_deref());
        println!("[MyEnglish AI] Sinh bài tập ngữ pháp cho: '{}' ({})", clean_topic, level);

        // Ultra-compact token-optimized prompt
        let prompt = format!(
            "Generate 10 practical English grammar test questions for level {level}, topic: '{clean_topic}'. Focus on tech/work context. \
            Output ONLY valid JSON array with NO markdown, matching: \
            [\
              {{\
                \"type\": \"multiple_choice|conjugation|error_spotting\",\
                \"prompt_en\": \"Sentence to test with blank _____ or bracketed words [word]\",\
                \"prompt_vn\": \"Vietnamese translation\",\
                \"hint\": \"Short grammar hint\",\
                \"options\": [\"optA\", \"optB\", \"optC\", \"optD\"],\
                \"correct_answer\": \"exact correct answer\",\
                \"error_word\": \"wrong word if error_spotting\",\
                \"explanation\": \"Brief explanation in Vietnamese\"\
              }}\
            ]"
        );

        let mut cmd = create_hidden_command(&bin_path);
        cmd.arg("--dangerously-skip-permissions");
        cmd.arg("--disable-slash-commands");
        cmd.arg("--model").arg("gemini-3.6-flash-medium");
        cmd.arg("--print-timeout").arg("30s");
        cmd.arg("-p").arg(&prompt);

        let output = match cmd.output() {
            Ok(out) if out.status.success() => out,
            _ => {
                create_hidden_command(&bin_path)
                    .arg("--dangerously-skip-permissions")
                    .arg("-p")
                    .arg(&prompt)
                    .output()
                    .map_err(|e| format!("Failed to execute Gemini CLI at '{}': {}", bin_path, e))?
            }
        };

        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Gemini CLI exited with error: {}", err_msg));
        }

        let raw_stdout = String::from_utf8_lossy(&output.stdout);
        let cleaned = clean_json_string(&raw_stdout);

        // Try direct parse first; if it fails (e.g. Gemini returned comma-separated objects without outer [ ]), fallback to wrapping in [ ]
        let parsed: serde_json::Value = match serde_json::from_str(&cleaned) {
            Ok(v) => v,
            Err(first_err) => {
                let trimmed = cleaned.trim();
                let wrapped = if !trimmed.starts_with('[') && !trimmed.ends_with(']') {
                    format!("[{}]", trimmed)
                } else {
                    trimmed.to_string()
                };
                match serde_json::from_str(&wrapped) {
                    Ok(v) => v,
                    Err(_) => {
                        return Err(format!("Failed to parse Gemini output as JSON: {}. Raw: {}", first_err, cleaned));
                    }
                }
            }
        };

        // If the model wrapped the result in an object like { "exercises": [...] } or { "questions": [...] }, unwrap it
        let final_val = if parsed.is_array() {
            parsed
        } else if let Some(arr) = parsed.get("exercises").or_else(|| parsed.get("questions")) {
            arr.clone()
        } else {
            serde_json::Value::Array(vec![parsed])
        };

        Ok(final_val)
    })
    .await
    .map_err(|e| format!("Task execution failed: {}", e))?
}

#[tauri::command]
fn submit_word(app: AppHandle, word: String) -> Result<String, String> {
    let clean_word = word.trim().to_lowercase();
    if clean_word.is_empty() {
        return Err("Word cannot be empty".to_string());
    }

    // Emit event across windows for real-time background processing
    app.emit("word-submitted", serde_json::json!({ "word": clean_word }))
        .map_err(|e| e.to_string())?;

    // Auto-hide the quick input window upon submission
    if let Some(window) = app.get_webview_window("quick-input") {
        let _ = window.hide();
    }

    Ok(clean_word)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("quick-input") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                // If review popup is active, hide it so quick-input is unobstructed
                                if let Some(rp) = app.get_webview_window("review-popup") {
                                    if rp.is_visible().unwrap_or(false) {
                                        let _ = rp.hide();
                                    }
                                }
                                if let Some(monitor) = get_monitor_at_cursor(&window) {
                                    let m_pos = monitor.position();
                                    let m_size = monitor.size();
                                    if let Ok(w_size) = window.outer_size() {
                                        let x = m_pos.x + ((m_size.width as i32 - w_size.width as i32) / 2);
                                        let y = m_pos.y + ((m_size.height as i32 - w_size.height as i32) / 3);
                                        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
                                    }
                                }
                                let clipboard = get_clipboard_text();
                                let _ = window.emit("quick-input-opened", serde_json::json!({ "clipboard": clipboard }));
                                let _ = window.set_always_on_top(true);
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                ensure_macos_app_registered();
                let bundle = mac_notification_sys::get_bundle_identifier_or_default("MyEnglish");
                let _ = mac_notification_sys::set_application(&bundle);
            }
            if let Ok(shortcut) = Shortcut::from_str("CmdOrCtrl+Shift+E") {
                if let Err(e) = app.global_shortcut().register(shortcut) {
                    eprintln!("[GlobalShortcut] Warning: Failed to register CmdOrCtrl+Shift+E: {:?}", e);
                }
            }

            // ── System tray icon (all platforms) ─────────────────────────────
            // macOS: appears in menu bar (top). Windows/Linux: system tray.
            // Note: tauri.conf.json must NOT have a "trayIcon" section, otherwise
            // Tauri creates a second icon automatically alongside this one.
            {
                use tauri::menu::{MenuBuilder, MenuItemBuilder};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

                let show_item = MenuItemBuilder::with_id("show", "Mở Dashboard").build(app)?;
                let quit_item = MenuItemBuilder::with_id("quit", "Thoát MyEnglish").build(app)?;
                let tray_menu = MenuBuilder::new(app)
                    .item(&show_item)
                    .separator()
                    .item(&quit_item)
                    .build()?;

                let _tray = TrayIconBuilder::new()
                    .icon(app.default_window_icon().cloned().unwrap())
                    .menu(&tray_menu)
                    .tooltip("MyEnglish")
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "show" => {
                            if let Some(rp) = app.get_webview_window("review-popup") {
                                if rp.is_visible().unwrap_or(false) {
                                    let _ = rp.hide();
                                }
                            }
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(rp) = app.get_webview_window("review-popup") {
                                if rp.is_visible().unwrap_or(false) {
                                    let _ = rp.hide();
                                }
                            }
                            if let Some(w) = app.get_webview_window("main") {
                                if w.is_visible().unwrap_or(false) {
                                    let _ = w.hide();
                                } else {
                                    let _ = w.show();
                                    let _ = w.unminimize();
                                    let _ = w.set_focus();
                                }
                            }
                        }
                    })
                    .build(app)?;
            }

            // Spawn background timer heartbeat so reviews can trigger reliably
            // even when windows are minimized, inactive, or hidden in tray
            let bg_app = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(30));
                let _ = bg_app.emit("srs-heartbeat", serde_json::json!({}));
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_quick_input,
            hide_quick_input,
            show_main_window,
            submit_word,
            enrich_word_with_gemini,
            generate_grammar_exercises_ai,
            get_clipboard_text,
            check_cli_status,
            send_desktop_notification,
            trigger_review_navigation,
            show_review_popup,
            hide_review_popup,
            prepare_update_exit,
            log_debug
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        match event {
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                let last = LAST_NOTIFICATION_TIME.swap(0, Ordering::SeqCst);
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                    if now.saturating_sub(last) < 120 {
                        let _ = window.emit("open-review-tab", serde_json::json!({ "auto_start": false }));
                    }
                }
            }
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::CloseRequested { api, .. },
                ..
            } => {
                // If an update is in progress, allow the process to die normally.
                // Otherwise hide to tray so the app keeps running in background.
                if label == "main" && !ALLOW_EXIT.load(Ordering::SeqCst) {
                    api.prevent_close();
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.hide();
                    }
                }
            }
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::Focused(true),
                ..
            } => {
                if label == "main" {
                    let now = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();
                    let last = LAST_NOTIFICATION_TIME.swap(0, Ordering::SeqCst);
                    if now.saturating_sub(last) < 120 {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("open-review-tab", serde_json::json!({ "auto_start": false }));
                        }
                    }
                }
            }
            _ => {}
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_json_string_array() {
        let input = r#"
        ```json
        [
          { "type": "multiple_choice", "prompt": "hello" },
          { "type": "conjugation", "prompt": "world" }
        ]
        ```
        "#;
        let cleaned = clean_json_string(input);
        assert!(cleaned.starts_with('['));
        assert!(cleaned.ends_with(']'));
        let parsed: serde_json::Value = serde_json::from_str(&cleaned).expect("Should parse as JSON array");
        assert!(parsed.is_array());
        assert_eq!(parsed.as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_clean_json_string_object_with_nested_array() {
        let input = r#"
        Here is the analysis:
        {
          "meaning_vn": "lập trình",
          "examples": ["code", "debug"]
        }
        Hope this helps!
        "#;
        let cleaned = clean_json_string(input);
        assert!(cleaned.starts_with('{'));
        assert!(cleaned.ends_with('}'));
        let parsed: serde_json::Value = serde_json::from_str(&cleaned).expect("Should parse as JSON object");
        assert!(parsed.is_object());
    }
}
