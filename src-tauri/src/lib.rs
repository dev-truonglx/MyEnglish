use std::str::FromStr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
#[cfg(not(target_os = "macos"))]
use tauri_plugin_notification::NotificationExt;

static LAST_NOTIFICATION_TIME: AtomicU64 = AtomicU64::new(0);

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
                return String::from_utf8_lossy(&output.stdout).to_string();
            }
        }
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
    if let Some(window) = app.get_webview_window("main") {
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

#[tauri::command]
fn show_review_popup(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("review-popup") {
        if let Some(monitor) = get_monitor_at_cursor(&window) {
            let size = monitor.size();
            let pos = monitor.position();
            let _ = window.set_position(tauri::Position::Physical(*pos));
            let _ = window.set_size(tauri::Size::Physical(*size));
        }
        window.show().map_err(|e| e.to_string())?;

        // Re-apply on visible window to guarantee macOS AppKit applies frame to the target screen
        if let Some(monitor) = get_monitor_at_cursor(&window) {
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

        window.set_focus().map_err(|e| e.to_string())?;
        let _ = window.emit("review-popup-opened", serde_json::json!({}));
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
    let mut text = s.trim();
    if let Some(stripped) = text.strip_prefix("```json") {
        text = stripped.trim();
    } else if let Some(stripped) = text.strip_prefix("```") {
        text = stripped.trim();
    }
    if let Some(stripped) = text.strip_suffix("```") {
        text = stripped.trim();
    }
    text.to_string()
}

#[derive(serde::Serialize)]
pub struct CliStatusResult {
    pub installed: bool,
    pub path: String,
    pub details: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
fn check_cli_status() -> CliStatusResult {
    let home = std::env::var("HOME").unwrap_or_default();
    let gemini_bin = format!("{}/.gemini/bin/gemini", home);
    let agy_bin = format!("{}/.gemini/bin/agy", home);

    let (bin_path, exists) = if std::path::Path::new(&gemini_bin).exists() {
        (gemini_bin, true)
    } else if std::path::Path::new(&agy_bin).exists() {
        (agy_bin, true)
    } else {
        ("gemini".to_string(), false)
    };

    if !exists {
        return CliStatusResult {
            installed: false,
            path: bin_path,
            details: None,
            error: Some("Không tìm thấy binary agy hoặc gemini trong ~/.gemini/bin/".to_string()),
        };
    }

    match std::process::Command::new(&bin_path).arg("--help").output() {
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
async fn enrich_word_with_gemini(word: String) -> Result<serde_json::Value, String> {
    let clean_word = word.trim().to_lowercase();
    if clean_word.is_empty() {
        return Err("Word cannot be empty".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let home = std::env::var("HOME").unwrap_or_default();
        let gemini_bin = format!("{}/.gemini/bin/gemini", home);
        let agy_bin = format!("{}/.gemini/bin/agy", home);

        let bin_path = if std::path::Path::new(&gemini_bin).exists() {
            gemini_bin
        } else if std::path::Path::new(&agy_bin).exists() {
            agy_bin
        } else {
            "gemini".to_string()
        };

        let prompt = format!(
            "You are an expert English linguist and developer educator. \
            Analyze the English vocabulary word: '{clean_word}'. \
            Output strictly valid JSON with no markdown formatting or backticks, matching this exact schema: \
            {{\
              \"phonetic\": \"IPA pronunciation e.g. /kənˈkɜːr.ən.si/\",\
              \"part_of_speech\": \"noun, verb, adjective, or adverb\",\
              \"topic\": \"Primary category: System Design, Database & Storage, Concurrency & Async, Networking & APIs, Security & Auth, DevOps & Cloud, Frontend & UI, Backend & Microservices, Data Structures & Algorithms, Architecture & Patterns, Testing & QA, General Tech, or Everyday Life\",\
              \"meaning_vn\": \"Clear, comprehensive Vietnamese explanation in both software engineering and general daily life context\",\
              \"collocations\": [\
                \"common tech phrase 1 using '{clean_word}'\",\
                \"common tech phrase 2 using '{clean_word}'\",\
                \"common tech phrase 3 using '{clean_word}'\"\
              ],\
              \"code_snippet\": \"// Realistic 3-5 line code snippet (TypeScript/Go/Python) illustrating practical usage of '{clean_word}'\",\
              \"synonyms\": [\
                {{\
                  \"word\": \"synonym1\",\
                  \"phonetic\": \"IPA for synonym1\",\
                  \"meaning_vn\": \"Vietnamese meaning of synonym1\",\
                  \"examples\": [\
                    {{\
                      \"sentence_en\": \"Software engineering sentence using synonym1\",\
                      \"meaning_vn\": \"Ý nghĩa của câu bằng tiếng Việt\",\
                      \"structure\": \"Cấu trúc câu chi tiết (ví dụ: S + V (transitive) + O + Relative Clause...)\",\
                      \"why_used\": \"Giải thích vì sao lại dùng cấu trúc câu này trong ngữ cảnh này\"\
                    }},\
                    {{\
                      \"sentence_en\": \"Everyday real-life sentence using synonym1\",\
                      \"meaning_vn\": \"Ý nghĩa của câu bằng tiếng Việt\",\
                      \"structure\": \"Cấu trúc câu chi tiết\",\
                      \"why_used\": \"Giải thích vì sao lại dùng cấu trúc câu này trong ngữ cảnh này\"\
                    }}\
                  ]\
                }}\
              ],\
              \"antonyms\": [\
                {{\
                  \"word\": \"antonym1\",\
                  \"phonetic\": \"IPA for antonym1\",\
                  \"meaning_vn\": \"Vietnamese meaning of antonym1\",\
                  \"examples\": [\
                    {{\
                      \"sentence_en\": \"Software engineering sentence using antonym1\",\
                      \"meaning_vn\": \"Ý nghĩa của câu bằng tiếng Việt\",\
                      \"structure\": \"Cấu trúc câu chi tiết\",\
                      \"why_used\": \"Giải thích vì sao lại dùng cấu trúc câu này trong ngữ cảnh này\"\
                    }},\
                    {{\
                      \"sentence_en\": \"Everyday real-life sentence using antonym1\",\
                      \"meaning_vn\": \"Ý nghĩa của câu bằng tiếng Việt\",\
                      \"structure\": \"Cấu trúc câu chi tiết\",\
                      \"why_used\": \"Giải thích vì sao lại dùng cấu trúc câu này trong ngữ cảnh này\"\
                    }}\
                  ]\
                }}\
              ],\
              \"examples\": [\
                {{\
                  \"sentence_en\": \"Software engineering sentence using '{clean_word}'\",\
                  \"sentence_vn\": \"Bản dịch tiếng Việt\",\
                  \"grammar_analysis\": \"Cấu trúc câu: ... | Giải thích lý do dùng: ...\"\
                }},\
                {{\
                  \"sentence_en\": \"Everyday life sentence using '{clean_word}'\",\
                  \"sentence_vn\": \"Bản dịch tiếng Việt\",\
                  \"grammar_analysis\": \"Cấu trúc câu: ... | Giải thích lý do dùng: ...\"\
                }}\
              ]\
            }}"
        );

        let output = std::process::Command::new(&bin_path)
            .arg("--dangerously-skip-permissions")
            .arg("-p")
            .arg(&prompt)
            .output()
            .map_err(|e| format!("Failed to execute Gemini CLI at '{}': {}", bin_path, e))?;

        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "Gemini CLI exited with code {:?}: {}",
                output.status.code(),
                err_msg
            ));
        }

        let raw_stdout = String::from_utf8_lossy(&output.stdout);
        let cleaned = clean_json_string(&raw_stdout);

        let parsed: serde_json::Value = serde_json::from_str(&cleaned).map_err(|e| {
            format!(
                "Failed to parse Gemini response as JSON: {}. Raw output was: {}",
                e, cleaned
            )
        })?;

        Ok(parsed)
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
                                let clipboard = get_clipboard_text();
                                let _ = window.emit("quick-input-opened", serde_json::json!({ "clipboard": clipboard }));
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
            let shortcut = Shortcut::from_str("CmdOrCtrl+Shift+E")?;
            app.global_shortcut().register(shortcut)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_quick_input,
            hide_quick_input,
            show_main_window,
            submit_word,
            enrich_word_with_gemini,
            get_clipboard_text,
            check_cli_status,
            send_desktop_notification,
            trigger_review_navigation,
            show_review_popup,
            hide_review_popup
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        match event {
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
