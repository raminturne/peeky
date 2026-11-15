// Island — a tiny dynamic island for Windows. Rust backend; the pill itself is a transparent WebView2 page.
mod audio;
mod clip;
mod hit;
mod media;
mod net;
mod ocr;
mod notif;
mod poll;
mod settings;
mod shelf;
mod speedo;
mod store;
mod sys;
mod update;

use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::Ordering::SeqCst;

use serde_json::Value;
use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE};

use poll::Cmd;

// ---------------------------------------------------------------- commands: mouse and keyboard
#[tauri::command]
fn set_interactive(on: bool) {
    hit::set_interactive(on)
}
#[tauri::command]
fn set_typing(window: tauri::WebviewWindow, on: bool, restore: bool) -> Value {
    let ctx = hit::set_typing(on, restore);
    if on {
        let _ = window.set_focus();
    }
    ctx
}
#[tauri::command]
fn lost_click(info: String) {
    sys::log(&format!("a click reached the island but not the page; performed it anyway ({info})"));
}

// ---------------------------------------------------------------- commands: media, volume, notifications
#[tauri::command]
fn media(cmd: String) {
    match cmd.as_str() {
        "toggle" => poll::send(Cmd::Toggle),
        "next" => poll::send(Cmd::Next),
        "prev" => poll::send(Cmd::Prev),
        _ => {}
    }
}
#[tauri::command]
fn seek(ms: f64) {
    if (0.0..86_400_000.0).contains(&ms) {
        poll::send(Cmd::Seek(ms.round() as i64))
    }
}
#[tauri::command]
fn set_volume(v: f64) {
    poll::send(Cmd::Vol(v.clamp(0.0, 1.0) as f32))
}
#[tauri::command]
fn toggle_mute() {
    poll::send(Cmd::Mute)
}
#[tauri::command]
fn set_viz(on: bool) {
    audio::VIZ.store(on, SeqCst)
}
#[tauri::command]
fn notif_act(id: String, aumid: String) {
    let id: String = id.chars().filter(|c| c.is_ascii_alphanumeric()).take(40).collect();
    let aumid: String = aumid.chars().filter(|c| *c != '\r' && *c != '\n').take(300).collect();
    poll::send(Cmd::Act(id, aumid))
}
#[tauri::command]
fn notif_dismiss(id: String) {
    if let Ok(n) = id.parse::<u32>() {
        poll::send(Cmd::Dismiss(n))
    }
}
#[tauri::command]
fn notif_clear() {
    poll::send(Cmd::ClearAll)
}

// ---------------------------------------------------------------- commands: clipboard
#[tauri::command]
fn clips_get() -> Value {
    clip::list()
}
#[tauri::command(async)]
fn clip_copy(id: u64) -> bool {
    clip::copy(id)
}
#[tauri::command]
fn clip_pin(id: u64) {
    clip::pin(id)
}
#[tauri::command]
fn clip_remove(id: u64) {
    clip::remove(id)
}
#[tauri::command]
fn clips_clear() {
    clip::clear()
}
#[tauri::command]
fn copy_text(text: String) -> bool {
    clip::write_text(&text)
}

// ---------------------------------------------------------------- commands: shelf and downloads
#[tauri::command(async)]
fn shelf_get() -> Value {
    shelf::list()
}
#[tauri::command(async)]
fn shelf_add(paths: Vec<String>) -> Value {
    shelf::add(paths)
}
#[tauri::command]
fn shelf_add_data(request: tauri::ipc::Request<'_>) -> Value {
    let head = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).map(shelf_decode).unwrap_or_default();
    match request.body() {
        tauri::ipc::InvokeBody::Raw(data) => shelf::add_data(&head("x-name"), &head("x-type"), data),
        _ => shelf::list(),
    }
}
fn shelf_decode(s: &str) -> String {
    // header values are percent-encoded by the page (file names may be Persian)
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let hex = |c: u8| (c as char).to_digit(16).map(|d| d as u8);
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = (hex(b[i + 1]), hex(b[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
#[tauri::command(async)]
fn shelf_add_url(url: String) -> Value {
    shelf::add_url(&url)
}
#[tauri::command]
fn shelf_remove(path: String) {
    shelf::remove(&path)
}
#[tauri::command]
fn shelf_clear() {
    shelf::clear()
}
#[tauri::command]
fn shelf_reveal(path: String) {
    shelf::reveal(&path)
}
#[tauri::command]
fn shelf_drag(paths: Vec<String>) {
    shelf::drag(paths) // on the main thread: this is a real drag-and-drop loop
}
#[tauri::command]
fn open_download(path: String) {
    shelf::open_download(&path)
}

// ---------------------------------------------------------------- commands: settings and small actions
#[tauri::command]
fn settings_get() -> Value {
    settings::payload()
}
#[tauri::command]
fn settings_set(key: String, value: Value) {
    settings::apply(&key, &value)
}
#[tauri::command]
fn action(name: String) {
    match name.as_str() {
        "screenshot" => sys::shell_open("ms-screenclip:", None),
        "dnd" => sys::shell_open("ms-settings:notifications", None),
        "ocr" => ocr::start(),
        _ => {}
    }
}

/// Opens a copied link in the default browser. Web addresses only: nothing else is ever handed to the shell.
#[tauri::command]
fn open_url(url: String) {
    let u = url.trim();
    let web = u.starts_with("https://") || u.starts_with("http://");
    if web && u.len() < 2000 && !u.chars().any(|c| c.is_whitespace() || c.is_control() || c == '"') {
        sys::shell_open(u, None)
    }
}

#[tauri::command(async)]
fn update_check() -> String {
    update::check()
}
#[tauri::command]
fn update_install() -> bool {
    update::install()
}
#[tauri::command(async)]
fn speedo_cmd(cmd: String, id: Option<String>, on: Option<bool>) -> Value {
    speedo::command(&cmd, id, on)
}
#[tauri::command]
fn ocr_done(text: String, conf: f64) {
    ocr::page_answer(text, conf as i32)
}

// ---------------------------------------------------------------- commands: notes and vault
#[tauri::command]
fn notes_get() -> Value {
    store::notes()
}
#[tauri::command]
fn note_save(id: Option<u64>, text: String, remind: Option<f64>) -> Value {
    store::note_save(id, &text, remind.unwrap_or(0.0).max(0.0) as u64)
}
#[tauri::command]
fn note_pin(id: u64) -> Value {
    store::note_pin(id)
}
#[tauri::command]
fn note_fired(id: u64) -> Value {
    store::note_fired(id)
}
#[tauri::command]
fn note_remove(id: u64) -> Value {
    store::note_remove(id)
}
#[tauri::command]
fn vault_list() -> Value {
    store::vault_list()
}
#[tauri::command]
fn vault_generate(len: usize, symbols: bool) -> String {
    store::generate(len, symbols)
}
#[tauri::command]
/// Returns the new entry's id (0 = it could not be written).
fn vault_save(site: String, user: String, pass: String) -> u64 {
    let id = store::vault_save(&site, &user, &pass);
    if id != 0 {
        remember_user(&user);
    }
    id
}
#[tauri::command]
fn vault_edit(id: u64, site: String, user: String) -> bool {
    let ok = store::vault_edit(id, &site, &user);
    if ok {
        remember_user(&user);
    }
    ok
}
fn remember_user(user: &str) {
    if !user.trim().is_empty() {
        settings::put("lastUser", user.trim().into());
        settings::broadcast();
    }
}
#[tauri::command]
fn fg_context() -> Value {
    hit::fg_context()
}
#[tauri::command]
fn vault_copy(id: u64, what: String) -> bool {
    store::vault_copy(id, &what)
}
#[tauri::command]
fn copy_secret(text: String) -> bool {
    store::copy_secret(&text)
}
#[tauri::command]
fn vault_reveal(id: u64) -> Option<String> {
    store::vault_reveal(id)
}
#[tauri::command]
fn vault_remove(id: u64) -> bool {
    store::vault_remove(id)
}

#[tauri::command]
fn debug_out(text: String) {
    if let Some(d) = sys::debug_dir() {
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(d.join("out.log")) {
            let _ = writeln!(f, "{text}");
        }
    }
}

// ---------------------------------------------------------------- tray
fn tray_rgba() -> Vec<u8> {
    // a black pill with two eyes
    const S: i32 = 32;
    let mut buf = vec![0u8; (S * S * 4) as usize];
    for y in 0..S {
        for x in 0..S {
            let i = ((y * S + x) * 4) as usize;
            let cx = x.clamp(9, 23);
            if (x - cx).pow(2) + (y - 16).pow(2) <= 64 {
                buf[i..i + 4].copy_from_slice(&[12, 12, 14, 255]);
            }
            for ex in [11.5f32, 20.5] {
                if ((x as f32 - ex) / 2.6).powi(2) + ((y as f32 - 16.0) / 3.4).powi(2) <= 1.0 {
                    buf[i..i + 4].copy_from_slice(&[255, 255, 255, 255]);
                }
            }
        }
    }
    buf
}
fn create_tray(app: &tauri::App) -> tauri::Result<()> {
    let title = MenuItemBuilder::with_id("title", format!("{} {}", sys::APP_NAME, env!("CARGO_PKG_VERSION"))).enabled(false).build(app)?;
    let auto = CheckMenuItemBuilder::with_id("autostart", "Start with Windows").checked(settings::autostart_on()).build(app)?;
    let menu = MenuBuilder::new(app).item(&title).separator().text("settings", "Settings…").item(&auto).text("restart", "Restart").separator().text("quit", "Quit").build()?;
    TrayIconBuilder::with_id("main")
        .icon(tauri::image::Image::new_owned(tray_rgba(), 32, 32))
        .tooltip(sys::APP_NAME)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, ev| match ev.id().as_ref() {
            "settings" => sys::emit("open", "settings"),
            "autostart" => {
                let on = auto.is_checked().unwrap_or(false);
                settings::put("autoStart", on.into());
                settings::set_autostart(on);
                settings::broadcast();
            }
            "restart" => app.restart(),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

/// Developer aid: ISLAND_DEBUG=<dir> runs <dir>\eval.js inside the page and appends the result to <dir>\out.log.
fn start_debug(win: tauri::WebviewWindow, dir: PathBuf) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(400));
        let f = dir.join("eval.js");
        if let Ok(code) = std::fs::read_to_string(&f) {
            let _ = std::fs::remove_file(&f);
            let code = code.trim().trim_end_matches(';');
            let js = format!("(async()=>{{let r;try{{r=await ({code});}}catch(e){{r='ERR '+(e&&e.stack||e);}}let t;try{{t=JSON.stringify(r);}}catch(e){{t=String(r);}}window.__TAURI__.core.invoke('debug_out',{{text:'[eval] '+t}});}})()");
            let _ = win.eval(&js);
        }
    });
}

fn main() {
    let debug = std::env::var_os("ISLAND_DEBUG").map(PathBuf::from);
    let _ = sys::DEBUG_DIR.set(debug.clone());
    if let Some(y) = std::env::var("ISLAND_Y").ok().and_then(|v| v.parse::<isize>().ok()) {
        hit::OFFSET_Y.store(y, SeqCst);
    }
    settings::load();
    hit::HOTKEY_WANTED.store(settings::flag("noteHotkey") && debug.is_none(), SeqCst);

    let mut builder = tauri::Builder::default();
    if debug.is_none() {
        // launching the app again opens its settings
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| sys::emit("open", "settings")));
    }
    builder
        .invoke_handler(tauri::generate_handler![
            set_interactive, set_typing, lost_click, media, seek, set_volume, toggle_mute, set_viz, notif_act, notif_dismiss, notif_clear,
            clips_get, clip_copy, clip_pin, clip_remove, clips_clear, copy_text,
            shelf_get, shelf_add, shelf_add_data, shelf_add_url, shelf_remove, shelf_clear, shelf_reveal, shelf_drag, open_download,
            settings_get, settings_set, action, open_url, ocr_done, speedo_cmd, update_check, update_install,
            notes_get, note_save, note_pin, note_fired, note_remove,
            vault_list, vault_generate, vault_save, vault_edit, fg_context, vault_copy, copy_secret, vault_reveal, vault_remove, debug_out
        ])
        .setup(move |app| {
            let _ = sys::APP.set(app.handle().clone());
            let mut wb = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
                .title(sys::APP_NAME)
                .inner_size(hit::WIN_W, hit::WIN_H)
                .position(0.0, 0.0)
                .decorations(false)
                .transparent(true)
                .shadow(false)
                .resizable(false)
                .maximizable(false)
                .minimizable(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .focused(false)
                .visible(false)
                .disable_drag_drop_handler()
                // the pill animates and keeps time even when Windows thinks nobody is looking at it
                .additional_browser_args("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --autoplay-policy=no-user-gesture-required");
            if let Some(d) = &debug {
                wb = wb.data_directory(d.join("webview"));
            }
            let win = wb.build()?;
            sys::set_hwnd(HWND(win.hwnd()?.0));
            hit::set_interactive(false);
            hit::start();
            unsafe {
                let _ = ShowWindow(sys::hwnd(), SW_SHOWNOACTIVATE);
            }
            shelf::hook_webview(&win);
            create_tray(app)?;
            settings::ensure_autostart();
            std::thread::spawn(|| {
                for s in [5, 55] {
                    std::thread::sleep(std::time::Duration::from_secs(s));
                    settings::ensure_autostart();
                }
            });
            let _ = std::fs::remove_dir_all(sys::temp_dir()); // leftovers of the last run
            clip::load();
            poll::start();
            audio::start_viz();
            shelf::start_downloads();
            notif::scan_shortcuts();
            hit::start_hotkey();
            update::start();
            // speedo::start();   // parked: Speedo has no control pipe yet, so there is nothing to talk to
            if let Some(d) = debug.clone() {
                start_debug(win, d);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the island");
}
