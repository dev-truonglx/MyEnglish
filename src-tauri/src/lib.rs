use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;

static PENDING_REVIEW_NAV: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn send_desktop_notification(app: AppHandle, title: String, body: String) -> Result<bool, String> {
    PENDING_REVIEW_NAV.store(true, Ordering::SeqCst);

    // Emit event to frontend for in-app toast banner and state tracking
    let _ = app.emit("desktop-notification-received", serde_json::json!({
        "title": &title,
        "body": &body,
        "target": "review"
    }));

    // 1. Try Tauri notification plugin builder
    let _ = app.notification().builder()
        .title(&title)
        .body(&body)
        .show();

    // 2. On macOS, use native mac_notification_sys with app bundle identifier so clicking activates MyEnglish
    #[cfg(target_os = "macos")]
    {
        let bundle = mac_notification_sys::get_bundle_identifier_or_default("com.myenglish.app");
        let _ = mac_notification_sys::set_application(&bundle);
        let _ = mac_notification_sys::Notification::new()
            .title(&title)
            .message(&body)
            .sound("Glass")
            .send();
    }

    Ok(true)
}

#[tauri::command]
fn trigger_review_navigation(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.emit("open-review-tab", ());
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
            trigger_review_navigation
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        match event {
            tauri::RunEvent::Reopen { .. } => {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                    if PENDING_REVIEW_NAV.swap(false, Ordering::SeqCst) {
                        let _ = window.emit("open-review-tab", ());
                    }
                }
            }
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::Focused(true),
                ..
            } => {
                if label == "main" && PENDING_REVIEW_NAV.swap(false, Ordering::SeqCst) {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.emit("open-review-tab", ());
                    }
                }
            }
            _ => {}
        }
    });
}
