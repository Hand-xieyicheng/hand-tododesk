use keyring::Entry;
use std::sync::Mutex;
#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

const KEYCHAIN_SERVICE: &str = "todoDesk";
const KEYCHAIN_REFRESH_ACCOUNT: &str = "refresh_token";
const KEYCHAIN_REMEMBERED_PASSWORD_PREFIX: &str = "remembered_password:";

#[derive(Clone, Copy, PartialEq, Eq)]
enum AppCloseBehavior {
    Hide,
    Quit,
}

struct AppWindowPreferences {
    close_behavior: Mutex<AppCloseBehavior>,
}

impl Default for AppWindowPreferences {
    fn default() -> Self {
        Self {
            close_behavior: Mutex::new(AppCloseBehavior::Hide),
        }
    }
}

fn remembered_password_account(email: &str) -> Result<String, String> {
    let normalized_email = email.trim().to_lowercase();
    if normalized_email.is_empty() {
        return Err("Email is required".to_string());
    }
    Ok(format!(
        "{}{}",
        KEYCHAIN_REMEMBERED_PASSWORD_PREFIX, normalized_email
    ))
}

#[tauri::command]
fn save_refresh_token(token: String) -> Result<(), String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_REFRESH_ACCOUNT)
        .map_err(|error| error.to_string())?;
    entry
        .set_password(&token)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_refresh_token() -> Result<Option<String>, String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_REFRESH_ACCOUNT)
        .map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn delete_refresh_token() -> Result<(), String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_REFRESH_ACCOUNT)
        .map_err(|error| error.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_remembered_password(email: String, password: String) -> Result<(), String> {
    let account = remembered_password_account(&email)?;
    let entry = Entry::new(KEYCHAIN_SERVICE, &account).map_err(|error| error.to_string())?;
    entry
        .set_password(&password)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_remembered_password(email: String) -> Result<Option<String>, String> {
    let account = remembered_password_account(&email)?;
    let entry = Entry::new(KEYCHAIN_SERVICE, &account).map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn delete_remembered_password(email: String) -> Result<(), String> {
    let account = remembered_password_account(&email)?;
    let entry = Entry::new(KEYCHAIN_SERVICE, &account).map_err(|error| error.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn open_floating_card(app: AppHandle, url: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("floating-card") {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "floating-card", WebviewUrl::App(url.into()))
        .title("todoDesk 卡片")
        .inner_size(360.0, 520.0)
        .min_inner_size(300.0, 360.0)
        .always_on_top(false)
        .decorations(false)
        .resizable(true)
        .build()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_app_close_behavior(
    preferences: tauri::State<'_, AppWindowPreferences>,
    behavior: String,
) -> Result<(), String> {
    let close_behavior = match behavior.as_str() {
        "hide" => AppCloseBehavior::Hide,
        "quit" => AppCloseBehavior::Quit,
        _ => return Err("Unsupported app close behavior".to_string()),
    };
    let mut current = preferences
        .close_behavior
        .lock()
        .map_err(|_| "App close behavior state is unavailable".to_string())?;
    *current = close_behavior;
    Ok(())
}

#[tauri::command]
fn show_main_window(app: AppHandle) -> Result<(), String> {
    show_main_window_inner(&app)
}

fn show_main_window_inner(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("/".into()))
        .title("todoDesk")
        .inner_size(1180.0, 760.0)
        .min_inner_size(960.0, 640.0)
        .decorations(true);

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true)
        .accept_first_mouse(true);

    #[cfg(not(target_os = "macos"))]
    let builder = builder;

    builder
        .build()
        .map(|window| {
            let _ = window.set_focus();
        })
        .map_err(|error| error.to_string())
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "打开 todoDesk", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::new()
        .tooltip("todoDesk")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                let _ = show_main_window_inner(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = show_main_window_inner(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn handle_main_window_close(window: &tauri::Window, event: &WindowEvent) {
    if window.label() != "main" {
        return;
    }

    if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let close_behavior = window
            .state::<AppWindowPreferences>()
            .close_behavior
            .lock()
            .map(|current| *current)
            .unwrap_or(AppCloseBehavior::Hide);

        match close_behavior {
            AppCloseBehavior::Hide => {
                let _ = window.hide();
            }
            AppCloseBehavior::Quit => {
                window.app_handle().exit(0);
            }
        }
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        .manage(AppWindowPreferences::default())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            save_refresh_token,
            load_refresh_token,
            delete_refresh_token,
            save_remembered_password,
            load_remembered_password,
            delete_remembered_password,
            open_floating_card,
            set_app_close_behavior,
            show_main_window
        ])
        .on_window_event(handle_main_window_close)
        .setup(|app| {
            setup_tray(app.handle())?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building todoDesk");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            let _ = show_main_window_inner(app_handle);
        }
    });
}
