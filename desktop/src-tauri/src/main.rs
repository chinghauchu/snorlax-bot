#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|err| err.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|err| err.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|err| err.to_string())?;
    }
    Ok(())
}

/// v0.77: window title plus the dock / taskbar badge.
/// `set_badge_count` covers the macOS dock and Linux taskbar.
/// Windows has no count badge in Tauri (overlay icon only); the
/// title still carries the number. Zero clears the badge.
#[tauri::command]
fn set_unread_chrome(app: tauri::AppHandle, title: String, badge: i64) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "missing main window".to_string())?;
    window.set_title(&title).map_err(|err| err.to_string())?;
    let count = if badge > 0 { Some(badge) } else { None };
    let _ = window.set_badge_count(count);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_url, set_unread_chrome])
        .run(tauri::generate_context!())
        .expect("error while running Snorlax-Bot");
}
