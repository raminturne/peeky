// Native Linux backend. X11 and Wayland use the same GTK/WebKit runtime; compositor
// policy controls placement and global-input features on Wayland.
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    io::{Cursor, Read, Write},
    os::fd::AsRawFd,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    ptr,
    sync::{atomic::{AtomicBool, AtomicU64, Ordering}, mpsc, Mutex, OnceLock},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::ImageFormat;
use gtk::glib::object::Cast;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use gtk::prelude::*;
use gtk::glib::{self, variant::ToVariant};
use gdkx11::X11Window;
use gtk_layer_shell::{Edge, KeyboardMode, Layer, LayerShell};
use cairo::{RectangleInt, Region};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, ShortcutState};

const APP_NAME: &str = "Peeky";
const WIN_W: f64 = 700.0;
const WIN_H: f64 = 430.0;
const MAX_SHELF_BYTES: usize = 200 * 1024 * 1024;

static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
static SETTINGS: OnceLock<Mutex<Map<String, Value>>> = OnceLock::new();
static NOTES: OnceLock<Mutex<Vec<Note>>> = OnceLock::new();
static VAULT: OnceLock<Mutex<Vec<VaultItem>>> = OnceLock::new();
static CLIPS: OnceLock<Mutex<Vec<ClipEntry>>> = OnceLock::new();
static SHELF: OnceLock<Mutex<Vec<ShelfItem>>> = OnceLock::new();
static SHELF_DRAG_PATHS: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
static SHELF_DRAG_HOOKED: AtomicBool = AtomicBool::new(false);
static LAST_CLIPBOARD: OnceLock<Mutex<String>> = OnceLock::new();
static CAPTURE_ACTIVE: AtomicBool = AtomicBool::new(false);
static X11_POINTER_ACTIVE: AtomicBool = AtomicBool::new(false);
static X11_LIB: OnceLock<x11_dl::xlib::Xlib> = OnceLock::new();
static INPUT_INTERACTIVE: AtomicBool = AtomicBool::new(false);
static INPUT_HEARTBEAT: AtomicU64 = AtomicU64::new(0);
static TYPING_ACTIVE: AtomicBool = AtomicBool::new(false);
static VIZ_ACTIVE: AtomicBool = AtomicBool::new(false);
static VIZ_STARTED: AtomicBool = AtomicBool::new(false);
static PREVIOUS_X11_WINDOW: OnceLock<Mutex<Option<String>>> = OnceLock::new();

const UPDATE_KEY: [u8; 32] = [
    63, 0, 60, 214, 100, 167, 237, 223, 180, 217, 239, 181, 141, 177, 76, 130,
    3, 62, 67, 79, 23, 72, 155, 50, 58, 132, 111, 212, 124, 162, 222, 128,
];

#[derive(Clone)]
struct LinuxUpdate {
    version: String,
    package: PathBuf,
}

static UPDATE_READY: OnceLock<Mutex<Option<LinuxUpdate>>> = OnceLock::new();
static KDE_NOTIFICATION_IDS: OnceLock<Mutex<HashSet<u32>>> = OnceLock::new();

fn kde_notification_ids() -> &'static Mutex<HashSet<u32>> {
    KDE_NOTIFICATION_IDS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn update_ready() -> &'static Mutex<Option<LinuxUpdate>> {
    UPDATE_READY.get_or_init(|| Mutex::new(None))
}

fn previous_x11_window() -> &'static Mutex<Option<String>> {
    PREVIOUS_X11_WINDOW.get_or_init(|| Mutex::new(None))
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

fn home_dir() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."))
}

fn data_dir() -> PathBuf {
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home_dir().join(".local/share"));
    let dir = base.join("peeky");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn config_dir() -> PathBuf {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home_dir().join(".config"));
    let dir = base.join("peeky");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn is_wayland() -> bool {
    std::env::var_os("WAYLAND_DISPLAY").is_some()
        || std::env::var("XDG_SESSION_TYPE").map(|s| s.eq_ignore_ascii_case("wayland")).unwrap_or(false)
}

fn emit<S: Serialize + Clone>(event: &str, payload: S) {
    if let Some(app) = APP.get() {
        let _ = app.emit(event, payload);
    }
}

fn log(message: &str) {
    let path = data_dir().join("peeky.log");
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "[{}] {}", now_ms(), message);
    }
}

fn output(program: &str, args: &[&str]) -> Option<String> {
    let result = Command::new(program).args(args).stdout(Stdio::piped()).stderr(Stdio::null()).output().ok()?;
    if result.status.success() {
        Some(String::from_utf8_lossy(&result.stdout).trim().to_string())
    } else {
        None
    }
}

fn command_exists(program: &str) -> bool {
    Command::new("sh")
        .args(["-c", "command -v \"$1\" >/dev/null 2>&1", "peeky", program])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn open_path(path: &str) {
    if !path.is_empty() {
        let _ = Command::new("xdg-open").arg(path).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn();
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> bool {
    if let Some(parent) = path.parent() {
        if fs::create_dir_all(parent).is_err() { return false; }
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).is_ok() && fs::rename(&tmp, path).is_ok()
}

fn write_json(path: &Path, value: &impl Serialize) {
    if let Ok(bytes) = serde_json::to_vec_pretty(value) {
        let _ = write_atomic(path, &bytes);
    }
}

// ---------------------------------------------------------------- settings and XDG autostart
fn settings_defaults() -> Map<String, Value> {
    let mut map = json!({
        "autoHide": true, "dndHint": false, "toured": false, "calendar": "gregorian", "hideVideo": true,
        "copyPreview": true, "clipHistory": true, "deviceAlerts": true, "downloadAlerts": true, "shelf": true,
        "visuals": true, "notifSeconds": 4, "face": "eyes", "noteHotkey": !is_wayland(),
        "vaultLength": 18, "vaultSymbols": true, "lastUser": "", "skin": "black", "musicTheme": "sky",
        "netAlerts": true, "sensorDot": true, "smartCopy": true, "musicReact": true, "autoUpdate": false,
        "autoStart": false
    }).as_object().cloned().unwrap_or_default();
    map.insert("platform".into(), Value::String("linux".into()));
    map
}

fn settings_map() -> &'static Mutex<Map<String, Value>> {
    SETTINGS.get_or_init(|| Mutex::new(settings_defaults()))
}

fn settings_load() {
    let mut map = settings_defaults();
    if let Ok(saved) = fs::read_to_string(config_dir().join("settings.json")) {
        if let Ok(Value::Object(extra)) = serde_json::from_str::<Value>(&saved) {
            for (key, value) in extra { map.insert(key, value); }
        }
    }
    if is_wayland() { map.insert("noteHotkey".into(), false.into()); }
    *settings_map().lock().unwrap() = map;
    settings_save();
}

fn settings_save() {
    let snapshot = settings_map().lock().unwrap().clone();
    write_json(&config_dir().join("settings.json"), &snapshot);
}

fn setting(key: &str) -> Value {
    settings_map().lock().unwrap().get(key).cloned().unwrap_or(Value::Null)
}

fn setting_flag(key: &str) -> bool {
    setting(key).as_bool().unwrap_or(false)
}

fn settings_put(key: &str, value: Value) {
    settings_map().lock().unwrap().insert(key.to_string(), value);
    settings_save();
}

fn autostart_path() -> PathBuf {
    let base = std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).unwrap_or_else(|| home_dir().join(".config"));
    base.join("autostart/com.peeky.app.desktop")
}

fn autostart_on() -> bool {
    autostart_path().exists()
}

fn set_autostart(on: bool) {
    let path = autostart_path();
    if !on {
        let _ = fs::remove_file(path);
        return;
    }
    let executable = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return,
    };
    let escaped = executable.to_string_lossy().replace('\\', "\\\\").replace('"', "\\\"");
    let body = format!(
        "[Desktop Entry]\nType=Application\nName=Peeky\nComment=Peeky desktop island\nExec=\"{}\"\nTerminal=false\nX-GNOME-Autostart-enabled=true\n",
        escaped
    );
    let _ = write_atomic(&path, body.as_bytes());
}

fn settings_payload() -> Value {
    let mut map = settings_map().lock().unwrap().clone();
    map.insert("autoStartOn".into(), autostart_on().into());
    map.insert("version".into(), env!("CARGO_PKG_VERSION").into());
    map.insert("appName".into(), APP_NAME.into());
    map.insert("displayServer".into(), if is_wayland() { "wayland" } else { "x11" }.into());
    Value::Object(map)
}

fn settings_broadcast() {
    emit("settings", settings_payload());
}

fn settings_apply(key: &str, value: &Value) {
    const BOOLS: &[&str] = &[
        "autoUpdate", "musicReact", "netAlerts", "sensorDot", "smartCopy", "autoHide", "hideVideo",
        "copyPreview", "clipHistory", "deviceAlerts", "downloadAlerts", "shelf", "visuals", "noteHotkey", "vaultSymbols",
    ];
    match key {
        "autoStart" => {
            let on = value.as_bool().unwrap_or(false);
            settings_put("autoStart", on.into());
            set_autostart(on);
        }
        "calendar" if ["gregorian", "shamsi", "shamsi-fa", "both"].contains(&value.as_str().unwrap_or("")) => settings_put(key, value.clone()),
        "face" if ["eyes", "clock"].contains(&value.as_str().unwrap_or("")) => settings_put(key, value.clone()),
        "skin" if ["black", "nebula", "crystal", "ember", "reactor", "venom", "cloud", "water", "lava", "ice"].contains(&value.as_str().unwrap_or("")) => settings_put(key, value.clone()),
        "musicTheme" if value.as_str().map(|v| v == "sky" || ["nebula", "crystal", "ember", "reactor", "venom", "cloud", "water", "lava", "ice"].contains(&v)).unwrap_or(false) => settings_put(key, value.clone()),
        "notifSeconds" if value.as_f64().map(|n| (2.0..=15.0).contains(&n)).unwrap_or(false) => settings_put(key, json!(value.as_f64().unwrap().round() as u64)),
        "vaultLength" if value.as_u64().map(|n| (8..=40).contains(&n)).unwrap_or(false) => settings_put(key, value.clone()),
        "dndHint" | "toured" => settings_put(key, true.into()),
        _ if BOOLS.contains(&key) => {
            let mut on = value.as_bool().unwrap_or(false);
            // The upstream global-hotkey backend is X11-only. Wayland sessions deliberately do not
            // advertise a shortcut that the compositor cannot register reliably.
            if key == "noteHotkey" && is_wayland() { on = false; }
            settings_put(key, on.into());
            if key == "noteHotkey" { update_hotkeys(on); }
        }
        _ => return,
    }
    settings_broadcast();
}

fn update_hotkeys(on: bool) {
    if is_wayland() { return; }
    if let Some(app) = APP.get() {
        let shortcuts = app.global_shortcut();
        if on {
            if let Err(e) = shortcuts.register("ctrl+alt+n") { log(&format!("Could not register Ctrl+Alt+N: {e}")); }
            if let Err(e) = shortcuts.register("ctrl+alt+t") { log(&format!("Could not register Ctrl+Alt+T: {e}")); }
        } else {
            let _ = shortcuts.unregister("ctrl+alt+n");
            let _ = shortcuts.unregister("ctrl+alt+t");
        }
    }
}

// ---------------------------------------------------------------- clipboard, history and private copy
#[derive(Clone, Serialize, Deserialize)]
struct ClipEntry {
    id: u64,
    #[serde(default)]
    text: String,
    pinned: bool,
    at: u64,
    #[serde(default)]
    image: Option<String>,
    #[serde(default)]
    preview: String,
    #[serde(default)]
    thumb: String,
    #[serde(skip)]
    image_bytes: Option<Vec<u8>>,
}

fn clips() -> &'static Mutex<Vec<ClipEntry>> {
    CLIPS.get_or_init(|| Mutex::new(Vec::new()))
}

fn last_clipboard() -> &'static Mutex<String> {
    LAST_CLIPBOARD.get_or_init(|| Mutex::new(String::new()))
}

fn clipboard_read() -> Option<String> {
    // Read from the session clipboard without blocking GTK's UI thread.
    let candidates: &[(&str, &[&str])] = if is_wayland() {
        &[
            ("wl-paste", &["--no-newline", "--type", "text/plain;charset=utf-8"]),
            ("wl-paste", &["--no-newline", "--type", "text/plain"]),
            ("wl-paste", &["--no-newline", "--type", "UTF8_STRING"]),
        ]
    } else {
        &[
            ("xclip", &["-selection", "clipboard", "-o", "-t", "UTF8_STRING"]),
            ("xclip", &["-selection", "clipboard", "-o", "-t", "text/plain;charset=utf-8"]),
            ("xclip", &["-selection", "clipboard", "-o", "-t", "text/plain"]),
            ("xsel", &["--clipboard", "--output"]),
        ]
    };

    for (program, args) in candidates {
        let result = Command::new(*program)
            .args(*args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output();
        let Ok(result) = result else { continue; };
        if !result.status.success() || result.stdout.is_empty() { continue; }
        if let Ok(text) = String::from_utf8(result.stdout) {
            return Some(text.trim_end_matches('\0').to_string());
        }
    }
    None
}

// The clipboard helpers normally daemonize after taking ownership. Check their parent
// process result when it exits quickly; if it remains alive, that is expected while it
// continues serving the selection to other applications.
fn clipboard_helper_write(program: &str, args: &[&str], bytes: &[u8]) -> bool {
    let mut child = match Command::new(program)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            log(&format!("Could not start clipboard helper {program}: {error}"));
            return false;
        }
    };

    let Some(mut stdin) = child.stdin.take() else {
        let _ = child.kill();
        log(&format!("Clipboard helper {program} did not expose standard input"));
        return false;
    };
    if let Err(error) = stdin.write_all(bytes) {
        drop(stdin);
        let _ = child.kill();
        log(&format!("Clipboard helper {program} rejected clipboard data: {error}"));
        return false;
    }
    drop(stdin);

    let (sender, receiver) = mpsc::sync_channel(1);
    thread::spawn(move || {
        let success = child.wait().map(|status| status.success()).unwrap_or(false);
        let _ = sender.send(success);
    });

    match receiver.recv_timeout(Duration::from_millis(600)) {
        Ok(true) => true,
        Ok(false) => {
            log(&format!("Clipboard helper {program} exited unsuccessfully"));
            false
        }
        // xclip/wl-copy can stay alive as the owner of the clipboard selection.
        Err(mpsc::RecvTimeoutError::Timeout) => true,
        Err(error) => {
            log(&format!("Could not collect clipboard helper {program} status: {error}"));
            false
        }
    }
}

fn clipboard_write(text: &str, private: bool) -> bool {
    let wayland = is_wayland();
    let copied = if wayland {
        if !command_exists("wl-copy") {
            log("Text clipboard copy failed: wl-copy is missing; install wl-clipboard");
            false
        } else if private {
            clipboard_helper_write("wl-copy", &["--sensitive"], text.as_bytes())
        } else {
            clipboard_helper_write("wl-copy", &[], text.as_bytes())
        }
    } else if command_exists("xclip") {
        clipboard_helper_write("xclip", &["-selection", "clipboard", "-i"], text.as_bytes())
    } else if command_exists("xsel") {
        clipboard_helper_write("xsel", &["--clipboard", "--input"], text.as_bytes())
    } else {
        log("Text clipboard copy failed: xclip/xsel is missing; install xclip");
        false
    };

    if copied {
        *last_clipboard().lock().unwrap() = text.to_string();
    }
    copied
}

fn emit_clip_preview(text: &str) {
    let preview = text.chars().take(400).collect::<String>()
        .split_whitespace().collect::<Vec<_>>().join(" ");
    emit("clip", json!({ "kind": "text", "text": text, "preview": preview }));
}

fn clip_payload() -> Value {
    Value::Array(clips().lock().unwrap().iter().map(|clip| {
        if clip.image.is_some() {
            json!({
                "id": clip.id, "kind": "image", "preview": clip.preview,
                "len": 0, "pinned": clip.pinned, "thumb": clip.thumb
            })
        } else {
            let preview = clip.text.chars().take(400).collect::<String>()
                .split_whitespace().collect::<Vec<_>>().join(" ");
            json!({
                "id": clip.id, "kind": "text", "preview": preview,
                "len": clip.text.chars().count(), "pinned": clip.pinned
            })
        }
    }).collect())
}

fn save_clips() {
    let mut pinned: Vec<ClipEntry> = clips().lock().unwrap().iter()
        .filter(|clip| clip.pinned).cloned().collect();
    let dir = clip_image_dir();
    let mut keep = HashSet::new();

    for clip in &mut pinned {
        if let (Some(name), Some(bytes)) = (clip.image.as_deref(), clip.image_bytes.as_deref()) {
            if let Some(path) = clip_image_path(name) {
                if !path.exists() {
                    let _ = write_atomic(&path, bytes);
                }
                keep.insert(name.to_string());
            }
        } else if let Some(name) = clip.image.as_deref() {
            if clip_image_path(name).is_some_and(|path| path.exists()) {
                keep.insert(name.to_string());
            }
        }
        clip.image_bytes = None;
    }

    write_json(&data_dir().join("clips.json"), &pinned);
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !keep.contains(&name) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
}

fn clip_image_dir() -> PathBuf {
    let dir = data_dir().join("clips");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn clip_image_path(name: &str) -> Option<PathBuf> {
    let path = Path::new(name);
    if path.components().count() != 1 || path.file_name()?.to_str()? != name {
        return None;
    }
    Some(clip_image_dir().join(path))
}

fn image_hash(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in bytes {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn build_image_clip(
    id: u64,
    pinned: bool,
    at: u64,
    bytes: Vec<u8>,
    stored_name: Option<String>,
) -> Option<ClipEntry> {
    if bytes.is_empty() || bytes.len() > 20 * 1024 * 1024 {
        return None;
    }
    let decoded = image::load_from_memory(&bytes).ok()?;
    let (width, height) = (decoded.width(), decoded.height());
    if width == 0 || height == 0 || (width as u64) * (height as u64) > 40_000_000 {
        return None;
    }

    let mut png_cursor = Cursor::new(Vec::new());
    decoded.write_to(&mut png_cursor, ImageFormat::Png).ok()?;
    let png = png_cursor.into_inner();

    let thumbnail = decoded.thumbnail(200, 60).to_rgba8();
    let mut thumb_cursor = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(thumbnail)
        .write_to(&mut thumb_cursor, ImageFormat::Png)
        .ok()?;

    let filename = stored_name.unwrap_or_else(|| format!("{:016x}.png", image_hash(&png)));
    Some(ClipEntry {
        id,
        text: String::new(),
        pinned,
        at,
        image: Some(filename),
        preview: format!("{width} × {height}"),
        thumb: BASE64.encode(thumb_cursor.into_inner()),
        image_bytes: Some(png),
    })
}

fn clipboard_read_image() -> Option<Vec<u8>> {
    let candidates: Vec<(&str, Vec<&str>)> = if is_wayland() {
        vec![
            ("wl-paste", vec!["--no-newline", "--type", "image/png"]),
            ("wl-paste", vec!["--no-newline", "--type", "image/jpeg"]),
        ]
    } else {
        vec![
            ("xclip", vec!["-selection", "clipboard", "-o", "-t", "image/png"]),
            ("xclip", vec!["-selection", "clipboard", "-o", "-t", "image/jpeg"]),
        ]
    };

    for (program, args) in candidates {
        let Ok(result) = Command::new(program)
            .args(args)
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output() else { continue; };
        if result.status.success() && !result.stdout.is_empty() {
            return Some(result.stdout);
        }
    }
    None
}

fn clipboard_read_file_urls() -> Option<String> {
    let (program, args): (&str, &[&str]) = if is_wayland() {
        ("wl-paste", &["--no-newline", "--type", "text/uri-list"])
    } else {
        ("xclip", &["-selection", "clipboard", "-o", "-t", "text/uri-list"])
    };
    let value = output(program, args)?;
    let urls = value.lines().filter(|line| {
        let line = line.trim();
        !line.is_empty() && !line.starts_with('#')
    }).collect::<Vec<_>>();
    if urls.is_empty() { None } else { Some(urls.join("\n")) }
}

fn enforce_clip_limits(list: &mut Vec<ClipEntry>) {
    list.sort_by(|a, b| b.pinned.cmp(&a.pinned).then(b.at.cmp(&a.at)));
    let mut loose = 0usize;
    let mut loose_images = 0usize;
    list.retain(|clip| {
        if clip.pinned { return true; }
        loose += 1;
        if clip.image.is_some() {
            loose_images += 1;
            if loose_images > 10 { return false; }
        }
        loose <= 30
    });
}

fn add_clip(text: String) {
    let text = text.trim_end_matches('\0').to_string();
    if text.trim().is_empty() || text.chars().count() > 100_000 { return; }
    {
        let mut list = clips().lock().unwrap();
        if let Some(found) = list.iter_mut().find(|clip| clip.image.is_none() && clip.text == text) {
            found.at = now_ms();
        } else {
            let id = list.iter().map(|clip| clip.id).max().unwrap_or(0) + 1;
            list.push(ClipEntry {
                id, text, pinned: false, at: now_ms(),
                image: None, preview: String::new(), thumb: String::new(), image_bytes: None,
            });
        }
        enforce_clip_limits(&mut list);
    }
    save_clips();
    emit("clips", clip_payload());
}

fn add_clip_image(bytes: Vec<u8>) {
    let next_id = clips().lock().unwrap().iter().map(|clip| clip.id).max().unwrap_or(0) + 1;
    let Some(entry) = build_image_clip(next_id, false, now_ms(), bytes, None) else { return; };
    {
        let mut list = clips().lock().unwrap();
        if let Some(filename) = entry.image.as_deref() {
            if let Some(found) = list.iter_mut().find(|clip| clip.image.as_deref() == Some(filename)) {
                found.at = now_ms();
                found.image_bytes = entry.image_bytes;
                found.preview = entry.preview;
                found.thumb = entry.thumb;
            } else {
                list.push(entry);
            }
        }
        enforce_clip_limits(&mut list);
    }
    save_clips();
    emit("clips", clip_payload());
}

fn clips_load() {
    if let Ok(raw) = fs::read_to_string(data_dir().join("clips.json")) {
        if let Ok(saved) = serde_json::from_str::<Vec<ClipEntry>>(&raw) {
            let mut loaded = Vec::new();
            for clip in saved {
                if let Some(name) = clip.image.as_deref() {
                    let Some(path) = clip_image_path(name) else { continue; };
                    let Ok(bytes) = fs::read(path) else { continue; };
                    if let Some(mut image) = build_image_clip(clip.id, clip.pinned, clip.at, bytes, Some(name.to_string())) {
                        loaded.push(image);
                    }
                } else if !clip.text.is_empty() {
                    loaded.push(ClipEntry { image: None, image_bytes: None, preview: String::new(), thumb: String::new(), ..clip });
                }
            }
            *clips().lock().unwrap() = loaded;
        }
    }

    let current_text = clipboard_read().filter(|text| !text.trim().is_empty());
    let current_image = if current_text.is_none() {
        clipboard_read_image().map(|bytes| format!("image:{:016x}", image_hash(&bytes)))
    } else { None };
    *last_clipboard().lock().unwrap() = current_text.or(current_image).unwrap_or_default();
}

fn copy_text_impl(text: &str) -> bool {
    if !clipboard_write(text, false) { return false; }
    if setting_flag("clipHistory") { add_clip(text.to_string()); }
    if setting_flag("copyPreview") { emit_clip_preview(text); }
    true
}

fn copy_secret_impl(text: &str) -> bool {
    if !clipboard_write(text, true) { return false; }
    let expected = text.to_string();
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(30));
        if clipboard_read().as_deref() == Some(expected.as_str()) {
            let _ = clipboard_write("", true);
        }
    });
    true
}

fn clipboard_watch() {
    thread::spawn(|| loop {
        thread::sleep(Duration::from_millis(900));

        if let Some(text) = clipboard_read().filter(|text| !text.trim().is_empty()) {
            let changed = {
                let mut last = last_clipboard().lock().unwrap();
                if *last == text { false } else { *last = text.clone(); true }
            };
            if changed {
                if setting_flag("clipHistory") { add_clip(text.clone()); }
                if setting_flag("copyPreview") { emit_clip_preview(&text); }
            }
            continue;
        }

        if let Some(image) = clipboard_read_image() {
            let signature = format!("image:{:016x}", image_hash(&image));
            let changed = {
                let mut last = last_clipboard().lock().unwrap();
                if *last == signature { false } else { *last = signature; true }
            };
            if changed {
                if setting_flag("clipHistory") { add_clip_image(image); }
                if setting_flag("copyPreview") { emit("clip", json!({ "kind": "image" })); }
            }
            continue;
        }

        if let Some(files) = clipboard_read_file_urls() {
            let signature = format!("files:{files}");
            let changed = {
                let mut last = last_clipboard().lock().unwrap();
                if *last == signature { false } else { *last = signature; true }
            };
            if changed && setting_flag("copyPreview") {
                let count = files.lines().count();
                emit("clip", json!({ "kind": "files", "preview": format!("{count} file(s)") }));
            }
        }
    });
}


// ---------------------------------------------------------------- notes and Secret Service vault (GNOME Keyring / KWallet via libsecret)
#[derive(Clone, Serialize, Deserialize)]
struct Note {
    id: u64,
    text: String,
    #[serde(default)]
    pinned: bool,
    at: u64,
    #[serde(default)]
    remind: u64,
    #[serde(default)]
    fired: bool,
}

fn notes() -> &'static Mutex<Vec<Note>> {
    NOTES.get_or_init(|| Mutex::new(Vec::new()))
}

fn notes_load() {
    if let Ok(raw) = fs::read_to_string(data_dir().join("notes.json")) {
        if let Ok(list) = serde_json::from_str::<Vec<Note>>(&raw) { *notes().lock().unwrap() = list; }
    }
}

fn notes_payload(list: &[Note]) -> Value {
    serde_json::to_value(list).unwrap_or(Value::Array(Vec::new()))
}

fn notes_save_and_emit(list: &mut Vec<Note>) -> Value {
    list.sort_by(|a, b| b.pinned.cmp(&a.pinned).then(b.at.cmp(&a.at)));
    write_json(&data_dir().join("notes.json"), list);
    let value = notes_payload(list);
    emit("notes", value.clone());
    value
}

fn note_save_impl(id: Option<u64>, text: &str, remind: u64) -> Value {
    let text = text.trim();
    if text.is_empty() || text.len() > 20_000 { return notes_payload(&notes().lock().unwrap()); }
    let mut list = notes().lock().unwrap();
    if let Some(found) = id.and_then(|id| list.iter_mut().find(|n| n.id == id)) {
        found.text = text.to_string();
        found.remind = remind;
        found.fired = false;
    } else {
        let id = list.iter().map(|n| n.id).max().unwrap_or(0) + 1;
        list.push(Note { id, text: text.to_string(), pinned: false, at: now_ms(), remind, fired: false });
    }
    if list.len() > 300 {
        if let Some(index) = list.iter().rposition(|n| !n.pinned) { list.remove(index); }
    }
    notes_save_and_emit(&mut list)
}

fn note_pin_impl(id: u64) -> Value {
    let mut list = notes().lock().unwrap();
    if let Some(note) = list.iter_mut().find(|n| n.id == id) { note.pinned = !note.pinned; }
    notes_save_and_emit(&mut list)
}

fn note_fired_impl(id: u64) -> Value {
    let mut list = notes().lock().unwrap();
    if let Some(note) = list.iter_mut().find(|n| n.id == id) { note.fired = true; }
    notes_save_and_emit(&mut list)
}

fn note_remove_impl(id: u64) -> Value {
    let mut list = notes().lock().unwrap();
    list.retain(|n| n.id != id);
    notes_save_and_emit(&mut list)
}

#[derive(Clone, Serialize, Deserialize)]
struct VaultItem {
    id: u64,
    site: String,
    user: String,
    at: u64,
    #[serde(default)]
    len: usize,
}

fn vault() -> &'static Mutex<Vec<VaultItem>> {
    VAULT.get_or_init(|| Mutex::new(Vec::new()))
}

fn vault_load() {
    if let Ok(raw) = fs::read_to_string(data_dir().join("vault-index.json")) {
        if let Ok(items) = serde_json::from_str::<Vec<VaultItem>>(&raw) { *vault().lock().unwrap() = items; }
    }
}

fn secret_tool_available() -> bool { command_exists("secret-tool") }

fn secret_service_available() -> bool {
    if !secret_tool_available() { return false; }

    if command_exists("busctl") {
        if Command::new("busctl")
            .args(["--user", "status", "org.freedesktop.secrets"])
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
            .status().map(|status| status.success()).unwrap_or(false)
        {
            return true;
        }
    }
    if command_exists("gdbus") {
        return Command::new("gdbus")
            .args(["introspect", "--session", "--dest", "org.freedesktop.secrets", "--object-path", "/org/freedesktop/secrets"])
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
            .status().map(|status| status.success()).unwrap_or(false);
    }
    false
}

fn vault_payload() -> Value {
    let locked = !secret_service_available();
    let items = vault().lock().unwrap();
    json!({
        "locked": locked,
        "items": items.iter().map(|v| json!({
            "id": v.id, "site": v.site, "user": v.user,
            "len": v.len,
            "at": v.at
        })).collect::<Vec<_>>()
    })
}

fn secret_store(id: u64, secret: &str, label: &str) -> bool {
    let mut child = match Command::new("secret-tool")
        .args(["store", "--label", label, "application", "peeky", "entry", &id.to_string()])
        .stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null()).spawn() {
            Ok(c) => c, Err(_) => return false,
        };
    if let Some(mut stdin) = child.stdin.take() {
        if stdin.write_all(secret.as_bytes()).is_err() {
            let _ = child.kill();
            return false;
        }
    }

    // Secret Service can wait for an unlock prompt. Never let a missing desktop
    // keyring agent block Peeky's UI command forever.
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) if started.elapsed() < Duration::from_secs(12) => {
                thread::sleep(Duration::from_millis(50));
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                log("Secret Service store timed out or could not be reached");
                return false;
            }
        }
    }
}

fn secret_lookup(id: u64) -> Option<String> {
    let mut child = Command::new("secret-tool")
        .args(["lookup", "application", "peeky", "entry", &id.to_string()])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => {
                let mut value = String::new();
                child.stdout.take()?.read_to_string(&mut value).ok()?;
                if value.is_empty() { return None; }
                return Some(value);
            }
            Ok(Some(_)) => return None,
            Ok(None) if started.elapsed() < Duration::from_secs(12) => {
                thread::sleep(Duration::from_millis(50));
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                log("Secret Service lookup timed out or could not be reached");
                return None;
            }
        }
    }
}

fn vault_save_impl(site: &str, user: &str, pass: &str) -> u64 {
    let site = site.trim();
    let user = user.trim();
    if pass.is_empty() || pass.len() > 1000 || site.len() > 300 || user.len() > 300 || !secret_service_available() {
        return 0;
    }
    let mut items = vault().lock().unwrap();
    let id = items.iter().map(|v| v.id).max().unwrap_or(0) + 1;
    if !secret_store(id, pass, &format!("Peeky password for {}", if site.is_empty() { "Untitled" } else { site })) {
        return 0;
    }
    items.push(VaultItem {
        id,
        site: if site.is_empty() { "Untitled".into() } else { site.into() },
        user: user.into(),
        at: now_ms(),
        len: pass.chars().count(),
    });
    write_json(&data_dir().join("vault-index.json"), &*items);
    drop(items);
    emit("vault", vault_payload());
    id
}

fn vault_edit_impl(id: u64, site: &str, user: &str) -> bool {
    let site = site.trim();
    let user = user.trim();
    if site.len() > 300 || user.len() > 300 { return false; }
    let mut items = vault().lock().unwrap();
    let Some(item) = items.iter_mut().find(|entry| entry.id == id) else { return false; };
    item.site = if site.is_empty() { "Untitled".into() } else { site.into() };
    item.user = user.into();
    write_json(&data_dir().join("vault-index.json"), &*items);
    drop(items);
    emit("vault", vault_payload());
    true
}

fn vault_remove_impl(id: u64) -> bool {
    if !secret_service_available() { return false; }
    let mut child = match Command::new("secret-tool")
        .args(["clear", "application", "peeky", "entry", &id.to_string()])
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn() {
            Ok(child) => child,
            Err(error) => {
                log(&format!("Could not remove password from Secret Service: {error}"));
                return false;
            }
        };
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(Some(_)) => {
                log("Secret Service refused to remove the password");
                return false;
            }
            Ok(None) if started.elapsed() < Duration::from_secs(12) => {
                thread::sleep(Duration::from_millis(50));
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                log("Secret Service removal timed out");
                return false;
            }
        }
    }
    let mut items = vault().lock().unwrap();
    items.retain(|v| v.id != id);
    write_json(&data_dir().join("vault-index.json"), &*items);
    drop(items);
    emit("vault", vault_payload());
    true
}

fn vault_reveal_impl(id: u64) -> Option<String> {
    secret_lookup(id)
}

fn vault_copy_impl(id: u64, what: &str) -> bool {
    let value = {
        let items = vault().lock().unwrap();
        let Some(item) = items.iter().find(|v| v.id == id) else { return false; };
        if what == "user" { item.user.clone() }
        else if what == "pass" { match secret_lookup(id) { Some(s) => s, None => return false } }
        else { return false; }
    };
    copy_secret_impl(&value)
}

fn vault_generate_impl(len: usize, symbols: bool) -> String {
    const ALPHA: &[u8] = b"abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const EXTRA: &[u8] = b"!@#$%^&*()-_=+[]{}:,.?";
    let mut random = vec![0u8; len.clamp(8, 64)];
    if fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut random)).is_err() {
        return String::new();
    }
    let mut alphabet = ALPHA.to_vec();
    if symbols { alphabet.extend_from_slice(EXTRA); }
    random.iter().map(|b| alphabet[*b as usize % alphabet.len()] as char).collect()
}

// ---------------------------------------------------------------- file shelf, downloads and desktop integration
#[derive(Clone, Serialize, Deserialize)]
struct ShelfItem {
    path: String,
    name: String,
    icon: Option<String>,
}

fn shelf() -> &'static Mutex<Vec<ShelfItem>> {
    SHELF.get_or_init(|| Mutex::new(Vec::new()))
}

fn shelf_payload() -> Value {
    Value::Array(shelf().lock().unwrap().iter().map(|f| json!({
        "path": f.path, "name": f.name, "icon": f.icon
    })).collect())
}

fn shelf_save() {
    write_json(&data_dir().join("shelf.json"), &*shelf().lock().unwrap());
    emit("shelf", shelf_payload());
}

fn shelf_load() {
    if let Ok(raw) = fs::read_to_string(data_dir().join("shelf.json")) {
        if let Ok(items) = serde_json::from_str::<Vec<ShelfItem>>(&raw) {
            *shelf().lock().unwrap() = items.into_iter().filter(|i| Path::new(&i.path).exists()).collect();
        }
    }
}

fn shelf_put(path: &Path) -> bool {
    if !path.is_file() { return false; }
    let path = match path.canonicalize() { Ok(p) => p, Err(_) => return false };
    let text = path.to_string_lossy().to_string();
    let mut list = shelf().lock().unwrap();
    if list.iter().any(|i| i.path == text) { return false; }
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| text.clone());
    list.push(ShelfItem { path: text, name, icon: None });
    if list.len() > 40 { list.remove(0); }
    true
}

fn shelf_add_impl(paths: Vec<String>) -> Value {
    let mut changed = false;
    for p in paths {
        if !p.is_empty() { changed |= shelf_put(Path::new(&p)); }
    }
    if changed { shelf_save(); }
    shelf_payload()
}

fn safe_filename(name: &str) -> String {
    let cleaned: String = name.chars().filter(|c| !c.is_control() && !['/', '\\', ':'].contains(c)).take(120).collect();
    if cleaned.trim().is_empty() { format!("peeky-{}", now_ms()) } else { cleaned }
}

fn shelf_add_data_impl(name: &str, mime: &str, data: &[u8]) -> Value {
    if data.is_empty() || data.len() > MAX_SHELF_BYTES { return shelf_payload(); }
    let mut filename = safe_filename(name);
    if Path::new(&filename).extension().is_none() {
        let ext = match mime.to_ascii_lowercase().as_str() {
            "image/png" => "png", "image/jpeg" => "jpg", "image/webp" => "webp",
            "image/gif" => "gif", "application/pdf" => "pdf", _ => "bin"
        };
        filename.push('.');
        filename.push_str(ext);
    }
    let dir = data_dir().join("shelf-files");
    if fs::create_dir_all(&dir).is_err() { return shelf_payload(); }
    let dest = dir.join(format!("{}-{}", now_ms(), filename));
    if fs::write(&dest, data).is_ok() {
        let _ = shelf_put(&dest);
        shelf_save();
    }
    shelf_payload()
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(a), Some(b)) = ((bytes[i + 1] as char).to_digit(16), (bytes[i + 2] as char).to_digit(16)) {
                out.push((a * 16 + b) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn shelf_add_url_impl(url: &str) -> Value {
    let url = url.trim();
    if let Some(rest) = url.strip_prefix("file://") {
        let path = percent_decode(rest);
        return shelf_add_impl(vec![path]);
    }
    if url.to_ascii_lowercase().starts_with("data:image/") {
        if let Some((header, body)) = url.split_once(',') {
            let mime = header.strip_prefix("data:").unwrap_or("").split(';').next().unwrap_or("");
            let bytes = if header.ends_with(";base64") {
                use base64::Engine as _;
                base64::engine::general_purpose::STANDARD.decode(body).ok()
            } else {
                Some(percent_decode(body).into_bytes())
            };
            if let Some(bytes) = bytes {
                return shelf_add_data_impl("image", mime, &bytes);
            }
        }
        return shelf_payload();
    }
    if !(url.starts_with("https://") || url.starts_with("http://")) || url.len() > 4000
        || url.chars().any(|c| c.is_control() || c.is_whitespace()) || !command_exists("curl") {
        return shelf_payload();
    }
    let name = url.split(['?', '#']).next().unwrap_or("download").rsplit('/').next().unwrap_or("download");
    let filename = safe_filename(&percent_decode(name));
    let dir = data_dir().join("shelf-files");
    if fs::create_dir_all(&dir).is_err() { return shelf_payload(); }
    let dest = dir.join(format!("{}-{}", now_ms(), filename));
    let status = Command::new("curl").args([
        "--fail", "--location", "--max-filesize", "209715200", "--connect-timeout", "10",
        "--max-time", "45", "--output"
    ]).arg(&dest).arg(url).stdout(Stdio::null()).stderr(Stdio::null()).status();
    if status.map(|s| s.success()).unwrap_or(false) {
        let _ = shelf_put(&dest);
        shelf_save();
    } else {
        let _ = fs::remove_file(dest);
    }
    shelf_payload()
}

fn shelf_remove_impl(path: &str) {
    shelf().lock().unwrap().retain(|f| f.path != path);
    shelf_save();
}

fn shelf_clear_impl() {
    shelf().lock().unwrap().clear();
    shelf_save();
}

fn shelf_reveal_impl(path: &str) {
    let target = Path::new(path).parent().unwrap_or(Path::new(path));
    open_path(target.to_string_lossy().as_ref());
}

fn shelf_drag_paths() -> &'static Mutex<Vec<String>> {
    SHELF_DRAG_PATHS.get_or_init(|| Mutex::new(Vec::new()))
}

fn path_file_uri(path: &str) -> String {
    let mut uri = String::from("file://");
    for byte in path.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b'-' | b'_' | b'.' | b'~' => uri.push(*byte as char),
            other => uri.push_str(&format!("%{other:02X}")),
        }
    }
    uri
}

fn shelf_drag_impl(paths: Vec<String>) {
    let files: Vec<String> = {
        let shelf = shelf().lock().unwrap();
        shelf.iter()
            .filter(|item| paths.iter().any(|path| path == &item.path))
            .filter_map(|item| Path::new(&item.path).canonicalize().ok())
            .filter(|path| path.is_file())
            .map(|path| path.to_string_lossy().into_owned())
            .collect()
    };
    if files.is_empty() {
        log("Shelf drag ignored: none of the selected files still exists");
        return;
    }

    *shelf_drag_paths().lock().unwrap() = files;
    emit("shelf-dragging", true);

    let Some(window) = APP.get().and_then(|app| app.get_webview_window("main")) else {
        shelf_drag_paths().lock().unwrap().clear();
        emit("shelf-dragging", false);
        return;
    };

    let gtk_handle = window.clone();
    let drag_result = window.run_on_main_thread(move || {
        let Ok(gtk_window) = gtk_handle.gtk_window() else {
            log("Shelf drag failed: could not access the native GTK window");
            shelf_drag_paths().lock().unwrap().clear();
            emit("shelf-dragging", false);
            return;
        };

        // GTK keeps the native drag source and file URI negotiation on the UI thread.
        // The data is read from the validated shelf paths only when the destination asks.
        if !SHELF_DRAG_HOOKED.swap(true, Ordering::SeqCst) {
            gtk_window.connect_drag_data_get(|_, _context, selection, _info, _time| {
                let uris: Vec<String> = shelf_drag_paths().lock().unwrap()
                    .iter().map(|path| path_file_uri(path)).collect();
                let refs: Vec<&str> = uris.iter().map(String::as_str).collect();
                if !selection.set_uris(&refs) {
                    log("Shelf drag destination rejected the file URI list");
                }
            });
            gtk_window.connect_drag_end(|_, _context| {
                shelf_drag_paths().lock().unwrap().clear();
                emit("shelf-dragging", false);
            });
        }

        let targets = gtk::TargetList::new(&[]);
        targets.add_uri_targets(0);
        let context = gtk_window.drag_begin_with_coordinates(
            &targets,
            gtk::gdk::DragAction::COPY,
            1,
            None,
            -1,
            -1,
        );
        if context.is_none() {
            shelf_drag_paths().lock().unwrap().clear();
            emit("shelf-dragging", false);
            log("GTK could not start the native Shelf file drag");
        }
    });

    if let Err(error) = drag_result {
        shelf_drag_paths().lock().unwrap().clear();
        emit("shelf-dragging", false);
        log(&format!("Shelf drag could not reach the GTK main thread: {error}"));
    }
}

fn size_label(bytes: u64) -> String {
    if bytes >= 1024 * 1024 { format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0)) }
    else if bytes >= 1024 { format!("{:.0} KB", bytes as f64 / 1024.0) }
    else { format!("{bytes} B") }
}

fn downloads_watch() {
    thread::spawn(|| {
        let dir = home_dir().join("Downloads");
        let mut known = HashSet::<PathBuf>::new();
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() { known.insert(entry.path()); }
        }
        loop {
            thread::sleep(Duration::from_secs(2));
            let Ok(entries) = fs::read_dir(&dir) else { continue; };
            for entry in entries.flatten() {
                let path = entry.path();
                if known.contains(&path) { continue; }
                let Ok(meta) = entry.metadata() else { continue; };
                if !meta.is_file() || meta.len() == 0 { continue; }
                thread::sleep(Duration::from_millis(700));
                let Ok(after) = fs::metadata(&path) else { continue; };
                if after.len() != meta.len() { continue; }
                known.insert(path.clone());
                let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
                let risky = ["deb", "rpm", "appimage", "sh", "run", "bin", "desktop"].contains(&ext.as_str());
                emit("download", json!({
                    "name": name, "size": size_label(after.len()), "risky": risky,
                    "path": path.to_string_lossy(), "icon": Value::Null
                }));
            }
        }
    });
}

fn open_download_impl(path: &str) {
    let ext = Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    if ["deb", "rpm", "appimage", "sh", "run", "bin", "desktop"].contains(&ext.as_str()) {
        shelf_reveal_impl(path);
    } else {
        open_path(path);
    }
}

// ---------------------------------------------------------------- screenshot/OCR
fn screenshot_path() -> PathBuf {
    let dir = std::env::temp_dir().join("peeky");
    let _ = fs::create_dir_all(&dir);
    dir.join(format!("capture-{}.png", now_ms()))
}

fn run_capture_command(mut command: Command, dest: &Path, tool: &str) -> Result<Vec<u8>, String> {
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not start {tool}: {error}"))?;

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() < Duration::from_secs(120) => {
                thread::sleep(Duration::from_millis(80));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                log(&format!("{tool} timed out while waiting for a region selection"));
                return Err(format!("{tool} timed out. Press Escape to cancel and try again."));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("Could not wait for {tool}: {error}"));
            }
        }
    };

    if !status.success() {
        return Err(format!("{tool} did not complete the capture (cancelled or failed)"));
    }
    let bytes = fs::read(dest).map_err(|error| format!("{tool} did not create a readable screenshot: {error}"))?;
    if bytes.is_empty() || image::load_from_memory(&bytes).is_err() {
        return Err(format!("{tool} created an invalid screenshot"));
    }
    Ok(bytes)
}

fn capture_selection_slurp(dest: &Path) -> Result<Vec<u8>, String> {
    if !command_exists("slurp") || !command_exists("grim") {
        return Err("For this Wayland session install grim and slurp, or use the desktop screenshot tool".into());
    }
    let selection = Command::new("slurp")
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(|error| format!("Could not start slurp: {error}"))?;
    if !selection.status.success() {
        return Err("Selection cancelled".into());
    }
    let geometry = String::from_utf8_lossy(&selection.stdout).trim().to_string();
    if geometry.is_empty() {
        return Err("Selection cancelled".into());
    }
    let mut command = Command::new("grim");
    command.args(["-g", &geometry]).arg(dest);
    run_capture_command(command, dest, "grim")
}

fn desktop_name() -> String {
    std::env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .to_ascii_lowercase()
}

// Cinnamon's native screenshot utility is used in area-selection mode. Unlike
// --interactive, --area opens the region selector directly and writes a PNG that
// Peeky can publish to the real desktop clipboard itself.

fn capture_selection() -> Result<Vec<u8>, String> {
    let dest = screenshot_path();
    let desktop = desktop_name();
    // Prefer Cinnamon's own GNOME Screenshot tool on Mint/Cinnamon X11. --area
    // displays the crosshair selector directly; --interactive opens a multi-step
    // dialog and does not guarantee that the result reaches the clipboard.
    let result = if !is_wayland() && desktop.contains("cinnamon") && command_exists("gnome-screenshot") {
        let mut command = Command::new("gnome-screenshot");
        command.args(["--area", "--file"]).arg(&dest);
        run_capture_command(command, &dest, "Cinnamon Screenshot")
    } else if is_wayland() {
        if desktop.contains("kde") && command_exists("spectacle") {
            let mut command = Command::new("spectacle");
            command.args(["--region", "--background", "--nonotify", "--output"]).arg(&dest);
            run_capture_command(command, &dest, "Spectacle")
        } else if desktop.contains("gnome") && command_exists("gnome-screenshot") {
            let mut command = Command::new("gnome-screenshot");
            command.args(["--area", "--file"]).arg(&dest);
            run_capture_command(command, &dest, "GNOME Screenshot")
        } else if command_exists("grim") && command_exists("slurp") {
            capture_selection_slurp(&dest)
        } else if command_exists("spectacle") {
            let mut command = Command::new("spectacle");
            command.args(["--region", "--background", "--nonotify", "--output"]).arg(&dest);
            run_capture_command(command, &dest, "Spectacle")
        } else if command_exists("gnome-screenshot") {
            let mut command = Command::new("gnome-screenshot");
            command.args(["--area", "--file"]).arg(&dest);
            run_capture_command(command, &dest, "GNOME Screenshot")
        } else {
            Err("No Wayland selector is installed. Install grim + slurp, GNOME Screenshot, or Spectacle".into())
        }
    } else if command_exists("flameshot") {
        let mut command = Command::new("flameshot");
        command.args(["gui", "--path"]).arg(&dest);
        run_capture_command(command, &dest, "Flameshot")
    } else if command_exists("gnome-screenshot") {
        let mut command = Command::new("gnome-screenshot");
        command.args(["--area", "--file"]).arg(&dest);
        run_capture_command(command, &dest, "GNOME Screenshot")
    } else if command_exists("spectacle") {
        let mut command = Command::new("spectacle");
        command.args(["--region", "--background", "--nonotify", "--output"]).arg(&dest);
        run_capture_command(command, &dest, "Spectacle")
    } else if command_exists("maim") {
        let mut command = Command::new("maim");
        command.arg("-s").arg(&dest);
        run_capture_command(command, &dest, "maim")
    } else {
        Err("No X11 screen selector is installed. Install GNOME Screenshot, Flameshot, Spectacle, or maim".into())
    };
    let _ = fs::remove_file(&dest);
    result
}

fn capture_fullscreen() -> Result<Vec<u8>, String> {
    let dest = screenshot_path();
    let desktop = desktop_name();
    let result = if is_wayland() && desktop.contains("kde") && command_exists("spectacle") {
        let mut command = Command::new("spectacle");
        command.args(["--fullscreen", "--background", "--nonotify", "--output"]).arg(&dest);
        run_capture_command(command, &dest, "Spectacle")
    } else if is_wayland() && desktop.contains("gnome") && command_exists("gnome-screenshot") {
        let mut command = Command::new("gnome-screenshot");
        command.args(["--file"]).arg(&dest);
        run_capture_command(command, &dest, "GNOME Screenshot")
    } else if is_wayland() && command_exists("grim") {
        let mut command = Command::new("grim");
        command.arg(&dest);
        run_capture_command(command, &dest, "grim")
    } else if command_exists("spectacle") {
        let mut command = Command::new("spectacle");
        command.args(["--fullscreen", "--background", "--nonotify", "--output"]).arg(&dest);
        run_capture_command(command, &dest, "Spectacle")
    } else if command_exists("gnome-screenshot") {
        let mut command = Command::new("gnome-screenshot");
        command.args(["--file"]).arg(&dest);
        run_capture_command(command, &dest, "GNOME Screenshot")
    } else if command_exists("maim") {
        let mut command = Command::new("maim");
        command.arg(&dest);
        run_capture_command(command, &dest, "maim")
    } else {
        Err("No full-screen capture tool is installed. Install grim, GNOME Screenshot, Spectacle, or maim".into())
    };
    let _ = fs::remove_file(&dest);
    result
}

fn clipboard_write_png(bytes: &[u8]) -> bool {
    let (program, args): (&str, &[&str]) = if is_wayland() {
        ("wl-copy", &["--type", "image/png"])
    } else {
        ("xclip", &["-selection", "clipboard", "-t", "image/png", "-i"])
    };

    if !command_exists(program) {
        log(&format!("Image clipboard copy failed: {program} is missing"));
        return false;
    }
    if clipboard_helper_write(program, args, bytes) {
        *last_clipboard().lock().unwrap() = format!("image:{:016x}", image_hash(bytes));
        return true;
    }

    log(&format!("Image clipboard copy failed: {program} could not own the clipboard selection"));
    false
}

struct CaptureBusyGuard;
impl Drop for CaptureBusyGuard {
    fn drop(&mut self) {
        CAPTURE_ACTIVE.store(false, Ordering::SeqCst);
    }
}

fn capture_is_busy() -> bool {
    CAPTURE_ACTIVE.swap(true, Ordering::SeqCst)
}

fn screenshot_start() {
    if capture_is_busy() {
        emit("helper", json!({ "t": "capture-error", "message": "A screenshot or text scan is already in progress." }));
        return;
    }

    thread::spawn(|| {
        let _guard = CaptureBusyGuard;
        log("Starting region screenshot selection");
        match capture_selection() {
            Ok(png) => {
                log(&format!("Region screenshot captured ({} bytes); copying PNG to clipboard", png.len()));
                if clipboard_write_png(&png) {
                    if setting_flag("clipHistory") { add_clip_image(png); }
                    log("Region screenshot copied to system clipboard and added to Peeky history");
                    emit("clip", json!({ "kind": "image" }));
                } else {
                    emit("helper", json!({
                        "t": "capture-error",
                        "message": if is_wayland() {
                            "Could not copy the screenshot: install wl-clipboard (wl-copy)."
                        } else {
                            "Could not copy the screenshot: install xclip (sudo apt install xclip)."
                        }
                    }));
                }
            }
            Err(why) => {
                log(&format!("Screenshot failed: {why}"));
                if !why.to_ascii_lowercase().contains("cancel") {
                    emit("helper", json!({ "t": "capture-error", "message": why }));
                }
            }
        }
    });
}

fn ocr_start() {
    if capture_is_busy() {
        emit("ocr", json!({ "ok": false, "why": "A screenshot or text scan is already in progress" }));
        return;
    }

    thread::spawn(|| {
        let _guard = CaptureBusyGuard;
        match capture_selection() {
            Ok(png) => {
                let encoded = {
                    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
                    let mut out = String::with_capacity((png.len() + 2) / 3 * 4);
                    for chunk in png.chunks(3) {
                        let a = chunk[0]; let b = *chunk.get(1).unwrap_or(&0); let c = *chunk.get(2).unwrap_or(&0);
                        out.push(TABLE[(a >> 2) as usize] as char);
                        out.push(TABLE[(((a & 3) << 4) | (b >> 4)) as usize] as char);
                        out.push(if chunk.len() > 1 { TABLE[(((b & 15) << 2) | (c >> 6)) as usize] as char } else { '=' });
                        out.push(if chunk.len() > 2 { TABLE[(c & 63) as usize] as char } else { '=' });
                    }
                    out
                };
                emit("ocr-read", json!({ "png": encoded }));
            }
            Err(why) => emit("ocr", json!({ "ok": false, "why": why })),
        }
    });
}

fn ocr_done_impl(text: &str, _conf: f64) {
    let clean = text.trim();
    if clean.is_empty() {
        emit("ocr", json!({ "ok": false, "why": "No text found" }));
    } else if copy_text_impl(clean) {
        emit("ocr", json!({ "ok": true, "text": clean }));
    } else {
        emit("ocr", json!({ "ok": false, "why": "Could not write to the clipboard" }));
    }
}

// ---------------------------------------------------------------- media and audio through MPRIS / PipeWire / PulseAudio command-line clients
fn playerctl(args: &[&str]) {
    let _ = Command::new("playerctl").args(args).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status();
}

fn media_metadata() -> Value {
    let raw = output("playerctl", &["metadata", "--format", "{{status}}\n{{title}}\n{{artist}}\n{{position}}\n{{mpris:length}}\n{{playerName}}"]);
    let Some(raw) = raw else {
        return json!({ "active": false, "playing": false, "title": "", "artist": "", "pos": 0, "dur": 0, "at": 0, "key": "", "video": false });
    };
    let mut lines = raw.lines();
    let status = lines.next().unwrap_or("");
    let title = lines.next().unwrap_or("").to_string();
    let artist = lines.next().unwrap_or("").to_string();
    let pos = lines.next().unwrap_or("0").parse::<f64>().unwrap_or(0.0);
    let duration = lines.next().unwrap_or("0").parse::<f64>().unwrap_or(0.0);
    let app = lines.next().unwrap_or("").to_string();
    json!({
        "active": true, "playing": status.eq_ignore_ascii_case("playing"),
        "title": title, "artist": artist, "pos": (pos * 1000.0) as u64,
        "dur": (duration / 1000.0) as u64, "at": now_ms(),
        "key": format!("{app}|{title}|{artist}"), "kind": "Music", "app": app, "video": false
    })
}

fn volume_state() -> (f32, bool) {
    if let Some(raw) = output("wpctl", &["get-volume", "@DEFAULT_AUDIO_SINK@"]) {
        let value = raw.split_whitespace().find_map(|w| w.parse::<f32>().ok()).unwrap_or(0.0);
        return (value.clamp(0.0, 1.0), raw.contains("MUTED"));
    }
    if let Some(raw) = output("pactl", &["get-sink-volume", "@DEFAULT_SINK@"]) {
        let value = raw.split_whitespace().find_map(|w| w.strip_suffix('%').and_then(|n| n.parse::<f32>().ok())).unwrap_or(0.0) / 100.0;
        let muted = output("pactl", &["get-sink-mute", "@DEFAULT_SINK@"]).map(|s| s.contains("yes")).unwrap_or(false);
        return (value.clamp(0.0, 1.0), muted);
    }
    (0.0, false)
}

fn set_volume_value(value: f32) {
    let value = value.clamp(0.0, 1.0);
    if command_exists("wpctl") {
        let _ = Command::new("wpctl").args(["set-volume", "@DEFAULT_AUDIO_SINK@", &format!("{:.2}", value)]).status();
    } else {
        let _ = Command::new("pactl").args(["set-sink-volume", "@DEFAULT_SINK@", &format!("{:.0}%", value * 100.0)]).status();
    }
}

fn toggle_mute_value() {
    if command_exists("wpctl") {
        let _ = Command::new("wpctl").args(["set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"]).status();
    } else {
        let _ = Command::new("pactl").args(["set-sink-mute", "@DEFAULT_SINK@", "toggle"]).status();
    }
}

// ---------------------------------------------------------------- Bluetooth and privacy-sensor activity
fn bluetooth_connected_devices() -> Option<BTreeMap<String, String>> {
    if !command_exists("bluetoothctl") { return None; }
    let raw = output("bluetoothctl", &["devices", "Connected"])?;
    let mut devices = BTreeMap::new();
    for line in raw.lines() {
        let line = line.trim();
        let Some(rest) = line.strip_prefix("Device ") else { continue; };
        let mut fields = rest.splitn(2, char::is_whitespace);
        let Some(address) = fields.next() else { continue; };
        let name = fields.next().unwrap_or("").trim();
        if address.matches(':').count() == 5 && !name.is_empty() {
            devices.insert(address.to_ascii_uppercase(), name.to_string());
        }
    }
    Some(devices)
}

fn parse_pactl_microphone_users() -> Vec<String> {
    let sources = output("pactl", &["list", "short", "sources"]).unwrap_or_default();
    let monitor_sources: HashSet<String> = sources.lines().filter_map(|line| {
        let mut fields = line.split_whitespace();
        let id = fields.next()?;
        let name = fields.next().unwrap_or("").to_ascii_lowercase();
        (name.contains("monitor") || name.ends_with(".mon")).then(|| id.to_string())
    }).collect();

    let Some(raw) = output("pactl", &["list", "source-outputs"]) else { return Vec::new(); };
    let mut found = Vec::new();
    let (mut source, mut app) = (None::<String>, None::<String>);
    let flush = |source: &Option<String>, app: &Option<String>, found: &mut Vec<String>| {
        if source.as_ref().is_some_and(|id| !monitor_sources.contains(id)) {
            if let Some(name) = app.as_ref().filter(|name| !name.trim().is_empty()) {
                if !found.iter().any(|old| old == name) { found.push(name.clone()); }
            }
        }
    };
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Source Output #") {
            flush(&source, &app, &mut found);
            source = None;
            app = None;
        } else if let Some(value) = trimmed.strip_prefix("Source:") {
            source = Some(value.trim().to_string());
        } else if app.is_none() && (trimmed.starts_with("application.name =") || trimmed.starts_with("application.process.binary =")) {
            if let Some((_, value)) = trimmed.split_once('=') {
                let value = value.trim().trim_matches('"');
                if !value.is_empty() { app = Some(value.to_string()); }
            }
        }
    }
    flush(&source, &app, &mut found);
    found.sort();
    found
}

fn pipewire_capture_users() -> Option<(Vec<String>, Vec<String>)> {
    let raw = output("pw-dump", &[])?;
    let json: Value = serde_json::from_str(&raw).ok()?;
    let nodes = json.as_array()?;
    let mut mic = Vec::new();
    let mut cam = Vec::new();
    for node in nodes {
        let info = &node["info"];
        if info["state"].as_str() != Some("running") { continue; }
        let props = &info["props"];
        let class = props["media.class"].as_str().unwrap_or("");
        if !class.starts_with("Stream/Input/") { continue; }
        let name = props["application.name"].as_str()
            .or_else(|| props["application.process.binary"].as_str())
            .or_else(|| props["node.description"].as_str())
            .unwrap_or("Unknown app").trim();
        if name.is_empty() { continue; }
        let target = if class.contains("Video") { &mut cam } else if class.contains("Audio") { &mut mic } else { continue; };
        if !target.iter().any(|old| old == name) { target.push(name.to_string()); }
    }
    mic.sort();
    cam.sort();
    Some((mic, cam))
}

fn proc_capture_users() -> (Vec<String>, Vec<String>) {
    let mut mic = Vec::new();
    let mut cam = Vec::new();
    let Ok(processes) = fs::read_dir("/proc") else { return (mic, cam); };
    for process in processes.flatten() {
        let pid = process.file_name().to_string_lossy().parse::<u32>();
        let Ok(pid) = pid else { continue; };
        if pid == std::process::id() { continue; }
        let comm = fs::read_to_string(process.path().join("comm")).unwrap_or_default();
        let name = comm.trim();
        if name.is_empty() || name == "pipewire" || name == "wireplumber" { continue; }
        let Ok(fds) = fs::read_dir(process.path().join("fd")) else { continue; };
        let mut has_mic = false;
        let mut has_cam = false;
        for fd in fds.flatten() {
            let Ok(target) = fs::read_link(fd.path()) else { continue; };
            let path = target.to_string_lossy();
            if path.starts_with("/dev/video") { has_cam = true; }
            if path.starts_with("/dev/snd/pcm") && path.ends_with('c') { has_mic = true; }
            if has_cam && has_mic { break; }
        }
        if has_mic && !mic.iter().any(|old| old == name) { mic.push(name.to_string()); }
        if has_cam && !cam.iter().any(|old| old == name) { cam.push(name.to_string()); }
    }
    mic.sort();
    cam.sort();
    (mic, cam)
}

fn sensor_snapshot() -> (Vec<String>, Vec<String>) {
    if let Some((mut mic, mut cam)) = pipewire_capture_users() {
        if mic.is_empty() {
            mic = parse_pactl_microphone_users();
        }
        // PipeWire's graph exposes active camera stream clients. Keep the /proc fallback
        // for direct V4L2 applications that do not use a PipeWire camera node.
        let (_, direct_cam) = proc_capture_users();
        for name in direct_cam {
            if !cam.iter().any(|old| old == &name) { cam.push(name); }
        }
        cam.sort();
        (mic, cam)
    } else {
        let mic = parse_pactl_microphone_users();
        let (_, cam) = proc_capture_users();
        (mic, cam)
    }
}

fn net_state() -> (bool, String, bool) {
    let mut online = false;
    let mut vpn = String::new();
    if let Ok(entries) = fs::read_dir("/sys/class/net") {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name == "lo" { continue; }
            let up = fs::read_to_string(entry.path().join("operstate"))
                .map(|s| s.trim() == "up").unwrap_or(false);
            if !up { continue; }
            online = true;
            let lower = name.to_ascii_lowercase();
            let looks_vpn = ["tun", "tap", "wg", "tailscale", "zt", "warp", "hiddify", "sing", "xray", "vpn", "proton"]
                .iter().any(|word| lower.starts_with(word) || lower.contains(word));
            if looks_vpn && vpn.is_empty() { vpn = name; }
        }
    }

    let has_proxy_env = [
        "http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY",
    ].iter().any(|key| std::env::var(key).map(|v| !v.trim().is_empty()).unwrap_or(false));
    let desktop_proxy = output("gsettings", &["get", "org.gnome.system.proxy", "mode"])
        .map(|mode| mode.trim_matches('\'').trim() != "none")
        .unwrap_or(false);
    (online, vpn, has_proxy_env || desktop_proxy)
}

fn x11_window_geometry(id: &str) -> Option<(i32, i32, i32, i32)> {
    let raw = output("xdotool", &["getwindowgeometry", "--shell", id])?;
    let mut x = None;
    let mut y = None;
    let mut width = None;
    let mut height = None;
    for line in raw.lines() {
        if let Some(value) = line.strip_prefix("X=") { x = value.parse::<i32>().ok(); }
        if let Some(value) = line.strip_prefix("Y=") { y = value.parse::<i32>().ok(); }
        if let Some(value) = line.strip_prefix("WIDTH=") { width = value.parse::<i32>().ok(); }
        if let Some(value) = line.strip_prefix("HEIGHT=") { height = value.parse::<i32>().ok(); }
    }
    Some((x?, y?, width?, height?))
}

// Detect the external X11 window underneath Peeky. When Peeky temporarily owns focus for
// a text field, retain the last external window instead of treating Peeky as the covered app.
fn x11_cover_state(last_external: &mut Option<String>) -> Option<(bool, bool)> {
    if is_wayland() || !X11_POINTER_ACTIVE.load(Ordering::SeqCst) { return None; }
    let active = output("xdotool", &["getactivewindow"])?;
    let active_pid = x11_window_pid(&active);
    let target = if active_pid == Some(std::process::id()) {
        last_external.clone()?
    } else {
        let title = output("xdotool", &["getwindowname", &active]).unwrap_or_default();
        if title.trim().is_empty() {
            *last_external = None;
            return Some((false, false));
        }
        *last_external = Some(active.clone());
        active
    };

    let title = output("xdotool", &["getwindowname", &target]).unwrap_or_default();
    if title.trim().is_empty() {
        *last_external = None;
        return Some((false, false));
    }
    let Some((x, y, width, height)) = x11_window_geometry(&target) else {
        // The previously focused application may have been closed while Peeky had focus.
        // Do not leave a stale "covered" state hiding the island.
        *last_external = None;
        return Some((false, false));
    };
    if width <= 0 || height <= 0 { return Some((false, false)); }

    let Some(window) = APP.get().and_then(|app| app.get_webview_window("main")) else { return None; };
    let Ok(position) = window.outer_position() else { return None; };
    let Ok(size) = window.outer_size() else { return None; };
    let Ok(scale) = window.scale_factor() else { return None; };
    let center_x = position.x + size.width as i32 / 2;
    let center_y = position.y + (26.0 * scale.max(0.5)).round() as i32;

    let right = x.saturating_add(width);
    let bottom = y.saturating_add(height);
    // X11 geometry describes the client surface; a decorated application's title bar can
    // sit above it. Include a small top frame allowance so maximized browsers still count
    // as covering the pill and its top-edge controls.
    let decorated_top = y.saturating_sub(56);
    let covered = x <= center_x
        && center_x < right
        && decorated_top <= center_y
        && center_y < bottom;

    let monitors = window.available_monitors().ok()?;
    let Some(monitor) = monitors.into_iter().find(|monitor| {
        let p = monitor.position();
        let s = monitor.size();
        center_x >= p.x
            && center_x < p.x + s.width as i32
            && center_y >= p.y
            && center_y < p.y + s.height as i32
    }) else {
        return Some((covered, false));
    };
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let full = x <= monitor_position.x
        && y <= monitor_position.y
        && right >= monitor_position.x + monitor_size.width as i32
        && bottom >= monitor_position.y + monitor_size.height as i32;
    Some((covered, full))
}

fn poll_start() {
    thread::spawn(|| {
        let mut previous_media = Value::Null;
        let mut last_network: Option<(bool, String, bool)> = None;
        let mut last_volume = String::new();
        let mut net_tick = 0u8;
        let mut volume_tick = 0u8;
        let mut media_tick = 0u8;
        let mut window_tick = 0u8;
        let mut bluetooth_tick = 0u8;
        let mut sensors_tick = 0u8;
        let mut bluetooth_current: Option<BTreeMap<String, String>> = None;
        let mut bluetooth_candidate: Option<BTreeMap<String, String>> = None;
        let mut bluetooth_candidate_count = 0u8;
        let mut sensors_current: Option<(Vec<String>, Vec<String>)> = None;
        let mut sensors_candidate: Option<(Vec<String>, Vec<String>)> = None;
        let mut sensors_candidate_count = 0u8;
        let mut last_external_window = None;
        let mut window_state_candidate: Option<(bool, bool)> = None;
        let mut window_state_sent: Option<(bool, bool)> = None;
        let mut window_state_count = 0u8;
        loop {
            thread::sleep(Duration::from_millis(250));
            media_tick = media_tick.wrapping_add(1);
            volume_tick = volume_tick.wrapping_add(1);
            net_tick = net_tick.wrapping_add(1);
            window_tick = window_tick.wrapping_add(1);
            bluetooth_tick = bluetooth_tick.wrapping_add(1);
            sensors_tick = sensors_tick.wrapping_add(1);
            if media_tick >= 2 {
                media_tick = 0;
                let state = media_metadata();
                if state != previous_media {
                    emit("helper", json!({ "t": "media", "active": state["active"], "playing": state["playing"], "title": state["title"], "artist": state["artist"], "pos": state["pos"], "dur": state["dur"], "at": state["at"], "key": state["key"], "kind": state["kind"], "app": state["app"] }));
                    previous_media = state;
                }
            }
            if volume_tick >= 2 {
                volume_tick = 0;
                let (level, mute) = volume_state();
                let key = format!("{level:.2}|{mute}");
                if key != last_volume {
                    last_volume = key;
                    emit("helper", json!({ "t": "vol", "level": level, "mute": mute }));
                }
            }
            if net_tick >= 20 {
                net_tick = 0;
                let network = net_state();
                if last_network.as_ref() != Some(&network) {
                    emit("helper", json!({
                        "t": "net", "online": network.0, "vpn": network.1, "proxy": network.2,
                        "first": last_network.is_none()
                    }));
                    last_network = Some(network);
                }
            }
            if bluetooth_tick >= 12 {
                bluetooth_tick = 0;
                if let Some(sample) = bluetooth_connected_devices() {
                    if bluetooth_candidate.as_ref() == Some(&sample) {
                        bluetooth_candidate_count = bluetooth_candidate_count.saturating_add(1);
                    } else {
                        bluetooth_candidate = Some(sample.clone());
                        bluetooth_candidate_count = 1;
                    }
                    if bluetooth_candidate_count >= 2 && bluetooth_current.as_ref() != Some(&sample) {
                        if let Some(previous) = bluetooth_current.as_ref() {
                            for (address, name) in &sample {
                                if !previous.contains_key(address) {
                                    emit("helper", json!({ "t": "bt", "name": name, "on": true }));
                                }
                            }
                            for (address, name) in previous {
                                if !sample.contains_key(address) {
                                    emit("helper", json!({ "t": "bt", "name": name, "on": false }));
                                }
                            }
                        }
                        bluetooth_current = Some(sample);
                    }
                }
            }
            if sensors_tick >= 6 {
                sensors_tick = 0;
                if setting_flag("sensorDot") {
                    let sample = sensor_snapshot();
                    if sensors_candidate.as_ref() == Some(&sample) {
                        sensors_candidate_count = sensors_candidate_count.saturating_add(1);
                    } else {
                        sensors_candidate = Some(sample.clone());
                        sensors_candidate_count = 1;
                    }
                    if sensors_candidate_count >= 2 && sensors_current.as_ref() != Some(&sample) {
                        emit("helper", json!({ "t": "sensors", "mic": sample.0, "cam": sample.1 }));
                        sensors_current = Some(sample);
                    }
                } else if sensors_current.take().is_some() {
                    sensors_candidate = None;
                    sensors_candidate_count = 0;
                    emit("helper", json!({ "t": "sensors", "mic": [], "cam": [] }));
                }
            }
            // X11 can inspect the active window geometry. Report only after two matching samples
            // so rapid focus/raise changes do not make the island flicker over applications.
            if window_tick >= 2 {
                window_tick = 0;
                if let Some(state) = x11_cover_state(&mut last_external_window) {
                    if window_state_candidate == Some(state) {
                        window_state_count = window_state_count.saturating_add(1);
                    } else {
                        window_state_candidate = Some(state);
                        window_state_count = 1;
                    }
                    if window_state_count >= 2 && window_state_sent != Some(state) {
                        emit("helper", json!({ "t": "cover", "covered": state.0, "full": state.1 }));
                        window_state_sent = Some(state);
                    }
                }
            }
        }
    });
}

// ---------------------------------------------------------------- window, tray and application commands
#[derive(Clone, Copy, Deserialize)]
struct InputRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn default_input_regions() -> Vec<InputRect> {
    vec![InputRect {
        x: (WIN_W - 84.0) / 2.0,
        y: 0.0,
        width: 84.0,
        height: 44.0,
    }]
}

fn legacy_input_regions(
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
) -> Option<Vec<InputRect>> {
    match (x, y, width, height) {
        (Some(x), Some(y), Some(width), Some(height)) => Some(vec![InputRect {
            x, y, width, height,
        }]),
        _ => None,
    }
}

fn apply_linux_input_region(
    window: tauri::WebviewWindow,
    input_regions: Vec<InputRect>,
) {
    let target = window.clone();
    let _ = window.run_on_main_thread(move || {
        let Ok(gtk_window) = target.gtk_window() else {
            log("Could not access GTK window while applying input regions");
            return;
        };

        // Keep the hit-test areas disjoint. A single union bounding box would also
        // intercept clicks in the transparent space between the face, action strip,
        // notification stack and side chip.
        let mut rectangles: Vec<RectangleInt> = input_regions
            .into_iter()
            .take(12)
            .filter_map(|rect| {
                if !rect.x.is_finite()
                    || !rect.y.is_finite()
                    || !rect.width.is_finite()
                    || !rect.height.is_finite()
                    || rect.width <= 0.0
                    || rect.height <= 0.0
                {
                    return None;
                }

                let left = rect.x.max(0.0).min(WIN_W).floor();
                let top = rect.y.max(0.0).min(WIN_H).floor();
                let right = (rect.x + rect.width).max(0.0).min(WIN_W).ceil();
                let bottom = (rect.y + rect.height).max(0.0).min(WIN_H).ceil();
                if right <= left || bottom <= top {
                    return None;
                }

                Some(RectangleInt::new(
                    left as i32,
                    top as i32,
                    (right - left) as i32,
                    (bottom - top) as i32,
                ))
            })
            .collect();

        // Never leave the user with an unclickable window if the renderer sends bad
        // geometry during startup or while a view is being replaced.
        if rectangles.is_empty() {
            rectangles.push(RectangleInt::new(308, 0, 84, 44));
        }

        let region = Region::create_rectangles(&rectangles);
        gtk_window.input_shape_combine_region(Some(&region));
        gtk_window.queue_draw();
    });
}

fn set_input_interactive(
    window: tauri::WebviewWindow,
    on: bool,
    input_regions: Option<Vec<InputRect>>,
) {
    INPUT_INTERACTIVE.store(on, Ordering::SeqCst);
    INPUT_HEARTBEAT.store(now_ms(), Ordering::SeqCst);

    // The GTK input shape is enforced on both X11 and Wayland. The "interactive"
    // state renews the watchdog; it never expands the native window to 700x430.
    apply_linux_input_region(window, input_regions.unwrap_or_else(default_input_regions));
}

fn set_interactive_window(
    on: bool,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
    regions: Option<Vec<InputRect>>,
) {
    if let Some(window) = APP.get().and_then(|app| app.get_webview_window("main")) {
        set_input_interactive(
            window,
            on,
            regions.or_else(|| legacy_input_regions(x, y, width, height)),
        );
    }
}

#[tauri::command]
fn set_interactive(
    on: bool,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
    regions: Option<Vec<InputRect>>,
) {
    set_interactive_window(on, x, y, width, height, regions);
}

#[tauri::command]
fn cursor_update(x: f64, y: f64) {
    if x.is_finite() && y.is_finite() {
        emit("cursor", json!({ "x": x, "y": y }));
    }
}

fn x11_window_pid(id: &str) -> Option<u32> {
    output("xdotool", &["getwindowpid", id]).and_then(|value| value.parse::<u32>().ok())
}

fn x11_window_context(id: &str) -> Value {
    let title = output("xdotool", &["getwindowname", id]).unwrap_or_default();
    let exe = x11_window_pid(id)
        .and_then(|pid| fs::read_link(format!("/proc/{pid}/exe")).ok())
        .and_then(|path| path.file_name().map(|name| name.to_string_lossy().to_string()))
        .unwrap_or_default();
    json!({ "title": title, "exe": exe })
}

fn capture_previous_x11_window() -> Value {
    if is_wayland() { return json!({}); }
    let Some(id) = output("xdotool", &["getactivewindow"]) else { return json!({}); };
    // Do not replace the saved external window with Peeky itself when an input flow
    // advances from one field to the next.
    if x11_window_pid(&id) == Some(std::process::id()) { return json!({}); }
    *previous_x11_window().lock().unwrap() = Some(id.clone());
    x11_window_context(&id)
}

fn restore_previous_x11_window() {
    if is_wayland() { return; }
    let Some(previous) = previous_x11_window().lock().unwrap().take() else { return; };
    let Some(active) = output("xdotool", &["getactivewindow"]) else { return; };
    // If the user deliberately switched to another app, never steal focus back.
    if x11_window_pid(&active) != Some(std::process::id()) { return; }
    if x11_window_pid(&previous).is_none() { return; }

    let activated = Command::new("xdotool")
        .args(["windowactivate", "--sync", &previous])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    if !activated {
        let _ = Command::new("xdotool")
            .args(["windowfocus", "--sync", &previous])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

#[tauri::command]
fn set_typing(
    window: tauri::WebviewWindow,
    on: bool,
    restore: bool,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
    regions: Option<Vec<InputRect>>,
) -> Value {
    let context = if on { capture_previous_x11_window() } else { json!({}) };
    TYPING_ACTIVE.store(on, Ordering::SeqCst);
    set_input_interactive(
        window.clone(),
        on,
        regions.or_else(|| legacy_input_regions(x, y, width, height)),
    );

    // A layer-shell surface normally stays passive. Promote it to exclusive keyboard
    // focus only while a Peeky text/search field is active, then return to on-demand mode.
    // This is especially important for Wayland compositors: pointer interactivity alone
    // does not guarantee that WebKit receives typed input or Ctrl+C/Ctrl+V.
    let focus_window = window.clone();
    let layer_shell = is_wayland() && gtk_layer_shell::is_supported();
    if let Err(error) = window.run_on_main_thread(move || {
        if layer_shell {
            if let Ok(gtk_window) = focus_window.gtk_window() {
                gtk_window.set_keyboard_mode(if on {
                    KeyboardMode::Exclusive
                } else {
                    KeyboardMode::OnDemand
                });
            }
        }
        if on {
            if let Err(error) = focus_window.set_focus() {
                log(&format!("Could not focus the Peeky input field: {error}"));
            }
        }
    }) {
        log(&format!("Could not schedule Peeky keyboard focus update: {error}"));
    }

    if !on {
        if restore {
            restore_previous_x11_window();
        } else {
            previous_x11_window().lock().unwrap().take();
        }
    }
    context
}

fn interaction_watchdog_start() {
    thread::spawn(|| loop {
        thread::sleep(Duration::from_millis(250));
        if INPUT_INTERACTIVE.load(Ordering::SeqCst)
            && now_ms().saturating_sub(INPUT_HEARTBEAT.load(Ordering::SeqCst)) > 4_000
        {
            let was_typing = TYPING_ACTIVE.swap(false, Ordering::SeqCst);
            // A dead renderer cannot complete its input flow. Drop the saved X11 focus target
            // rather than unexpectedly restoring a stale application during a later session.
            previous_x11_window().lock().unwrap().take();
            if let Some(window) = APP.get().and_then(|app| app.get_webview_window("main")) {
                set_input_interactive(window, false, None);
            }
            if was_typing {
                log("The UI stopped renewing input capture during a text flow; released pointer input");
            } else {
                log("The UI stopped renewing input capture; released pointer input");
            }
        }
    });
}

#[tauri::command]
fn lost_click(info: String) { log(&format!("missed click: {info}")); }

#[tauri::command]
fn media(cmd: String) {
    match cmd.as_str() {
        "toggle" => playerctl(&["play-pause"]),
        "next" => playerctl(&["next"]),
        "prev" => playerctl(&["previous"]),
        _ => {}
    }
}

#[tauri::command]
fn seek(ms: f64) {
    if (0.0..86_400_000.0).contains(&ms) {
        let seconds = format!("{:.3}", ms / 1000.0);
        playerctl(&["position", &seconds]);
    }
}

#[tauri::command]
fn set_volume(v: f64) { set_volume_value(v.clamp(0.0, 1.0) as f32); }

#[tauri::command]
fn toggle_mute() { toggle_mute_value(); }

// ---------------------------------------------------------------- system-output visualizer (PulseAudio / PipeWire-Pulse monitor)
const VIZ_BANDS: usize = 24;
const VIZ_FFT_SIZE: usize = 1024;

#[repr(C)]
struct PollFd {
    fd: i32,
    events: i16,
    revents: i16,
}

unsafe extern "C" {
    fn poll(fds: *mut PollFd, nfds: usize, timeout: i32) -> i32;
}

fn fft(re: &mut [f32], im: &mut [f32]) {
    let n = re.len();
    let mut j = 0usize;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let ang = -2.0 * std::f32::consts::PI / len as f32;
        let (wr, wi) = (ang.cos(), ang.sin());
        let half = len / 2;
        let mut i = 0;
        while i < n {
            let (mut cr, mut ci) = (1.0f32, 0.0f32);
            for k in 0..half {
                let (a, b) = (i + k, i + k + half);
                let (vr, vi) = (re[b] * cr - im[b] * ci, re[b] * ci + im[b] * cr);
                let (ur, ui) = (re[a], im[a]);
                re[a] = ur + vr;
                im[a] = ui + vi;
                re[b] = ur - vr;
                im[b] = ui - vi;
                let ncr = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = ncr;
            }
            i += len;
        }
        len <<= 1;
    }
}

fn visualizer_capture() -> bool {
    if !command_exists("parec") {
        log("Audio visualizer unavailable: install pulseaudio-utils (parec) and a PulseAudio-compatible PipeWire service");
        return false;
    }
    let mut child = match Command::new("parec")
        .args([
            "--raw", "--format=s16le", "--rate=48000", "--channels=2",
            "--latency-msec=20", "--device=@DEFAULT_MONITOR@",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            log(&format!("Could not start audio monitor capture: {error}"));
            return false;
        }
    };
    let Some(stdout) = child.stdout.as_mut() else {
        let _ = child.kill();
        let _ = child.wait();
        return false;
    };
    let fd = stdout.as_raw_fd();
    let n = VIZ_FFT_SIZE;
    let window: Vec<f32> = (0..n).map(|i| {
        let x = i as f32 / n as f32;
        0.42 - 0.5 * (2.0 * std::f32::consts::PI * x).cos()
            + 0.08 * (4.0 * std::f32::consts::PI * x).cos()
    }).collect();
    let mut re = vec![0.0f32; n];
    let mut im = vec![0.0f32; n];
    let mut smooth = vec![0.0f32; n / 2];
    let mut bytes = vec![0u8; n * 4];
    let mut last_emit = Instant::now();

    while VIZ_ACTIVE.load(Ordering::SeqCst) {
        let mut descriptor = PollFd { fd, events: 1, revents: 0 };
        let ready = unsafe { poll(&mut descriptor, 1, 120) };
        if ready < 0 {
            log("Audio visualizer pipe polling failed");
            break;
        }
        if ready == 0 {
            continue;
        }
        if descriptor.revents & (0x08 | 0x10) != 0 { // error or hangup
            break;
        }
        if stdout.read_exact(&mut bytes).is_err() { break; }

        for i in 0..n {
            let p = i * 4;
            let left = i16::from_le_bytes([bytes[p], bytes[p + 1]]) as f32 / 32768.0;
            let right = i16::from_le_bytes([bytes[p + 2], bytes[p + 3]]) as f32 / 32768.0;
            re[i] = (left + right) * 0.5 * window[i];
            im[i] = 0.0;
        }
        fft(&mut re, &mut im);

        let mut peak = 0.0f32;
        for k in 0..n / 2 {
            let magnitude = (re[k] * re[k] + im[k] * im[k]).sqrt() / n as f32;
            smooth[k] = 0.61 * smooth[k] + 0.39 * magnitude;
            peak = peak.max(smooth[k]);
        }

        let byte = |k: usize| -> f32 {
            let db = 20.0 * smooth[k.min(n / 2 - 1)].max(1e-10).log10();
            ((db + 100.0) / 70.0 * 255.0).clamp(0.0, 255.0)
        };
        let mut levels = [0.0f32; VIZ_BANDS];
        for (i, level) in levels.iter_mut().enumerate() {
            let a = ((i as f32 / VIZ_BANDS as f32).powf(1.9) * 300.0).floor() as usize + 1;
            let b = (((i + 1) as f32 / VIZ_BANDS as f32).powf(1.9) * 300.0).floor() as usize + 1;
            let b = b.max(a + 1);
            let sum: f32 = (a..b).map(byte).sum();
            let value = (sum / (b - a) as f32 / 255.0).powf(1.5)
                * (1.0 + i as f32 / VIZ_BANDS as f32 * 0.9);
            *level = (value * 1000.0).round() / 1000.0;
        }

        if peak > 1e-7 || last_emit.elapsed() >= Duration::from_millis(90) {
            emit("levels", levels.to_vec());
            last_emit = Instant::now();
        }
    }

    let _ = child.kill();
    let _ = child.wait();
    emit("levels", vec![0.0f32; VIZ_BANDS]);
    true
}

fn visualizer_start() {
    if VIZ_STARTED.swap(true, Ordering::SeqCst) { return; }
    thread::spawn(|| loop {
        if VIZ_ACTIVE.load(Ordering::SeqCst) {
            if !visualizer_capture() {
                thread::sleep(Duration::from_secs(3));
            }
        } else {
            thread::sleep(Duration::from_millis(250));
        }
    });
}

#[tauri::command]
fn set_viz(on: bool) {
    VIZ_ACTIVE.store(on, Ordering::SeqCst);
}

// ---------------------------------------------------------------- KDE Plasma live notification watcher
// Plasma's watcher extension forwards notifications to this D-Bus object. The standard
// freedesktop protocol alone does not provide a cross-application notification history API.
const KDE_WATCHER_XML: &str = r#"
<node>
  <interface name="org.kde.NotificationWatcher">
    <method name="Notify">
      <arg name="id" type="u" direction="in"/>
      <arg name="app_name" type="s" direction="in"/>
      <arg name="replaces_id" type="u" direction="in"/>
      <arg name="app_icon" type="s" direction="in"/>
      <arg name="summary" type="s" direction="in"/>
      <arg name="body" type="s" direction="in"/>
      <arg name="actions" type="as" direction="in"/>
      <arg name="hints" type="a{sv}" direction="in"/>
      <arg name="timeout" type="i" direction="in"/>
    </method>
    <method name="CloseNotification">
      <arg name="id" type="u" direction="in"/>
    </method>
  </interface>
</node>
"#;

fn kde_notification_watcher_start() {
    thread::spawn(|| {
        let context = glib::MainContext::new();
        let context_result = context.with_thread_default(|| {
        let connection = match gio::bus_get_sync(gio::BusType::Session, None::<&gio::Cancellable>) {
            Ok(connection) => connection,
            Err(error) => {
                log(&format!("KDE notification watcher unavailable: {error}"));
                return;
            }
        };
        let node = match gio::DBusNodeInfo::for_xml(KDE_WATCHER_XML) {
            Ok(node) => node,
            Err(error) => {
                log(&format!("Could not prepare KDE notification watcher: {error}"));
                return;
            }
        };
        let Some(interface) = node.lookup_interface("org.kde.NotificationWatcher") else {
            log("KDE notification watcher interface is missing");
            return;
        };

        let registration = connection.register_object(
            "/NotificationWatcher",
            &interface,
            |_, _sender, _path, _interface, method, parameters, invocation| {
                match method {
                    "Notify" => {
                        let parsed = parameters.get::<(
                            u32,
                            String,
                            u32,
                            String,
                            String,
                            String,
                            Vec<String>,
                            HashMap<String, glib::Variant>,
                            i32,
                        )>();
                        if let Some((id, app_name, replaces_id, app_icon, summary, body, actions, _hints, _timeout)) = parsed {
                            if replaces_id != 0 {
                                kde_notification_ids().lock().unwrap().remove(&replaces_id);
                                emit("helper", json!({ "t": "notifGone", "id": replaces_id }));
                            }
                            kde_notification_ids().lock().unwrap().insert(id);
                            let app = if app_name.trim().is_empty() { "Desktop" } else { app_name.trim() };
                            let has_default_action = actions.iter().step_by(2).any(|action| action == "default");
                            emit("helper", json!({
                                "t": "notif",
                                "id": id,
                                "aumid": if has_default_action { "default" } else { "" },
                                "app": app,
                                "title": summary,
                                "body": body,
                                "icon": app_icon,
                                "ts": now_ms()
                            }));
                        } else {
                            log("Ignoring a malformed notification from KDE Plasma");
                        }
                        invocation.return_value(None);
                    }
                    "CloseNotification" => {
                        if let Some((id,)) = parameters.get::<(u32,)>() {
                            // Keep the notification in Peeky's own history after its popup
                            // times out. This only marks it as no longer active in Plasma.
                            kde_notification_ids().lock().unwrap().remove(&id);
                        }
                        invocation.return_value(None);
                    }
                    _ => invocation.return_dbus_error(
                        "org.freedesktop.DBus.Error.UnknownMethod",
                        "Unsupported notification watcher method",
                    ),
                }
            },
            |_, _, _, _, _| ().to_variant(),
            |_, _, _, _, _, _| false,
        );

        let registration = match registration {
            Ok(id) => id,
            Err(error) => {
                log(&format!("Could not register KDE notification watcher: {error}"));
                return;
            }
        };

        let registered = connection.call_sync(
            Some("org.freedesktop.Notifications"),
            "/org/freedesktop/Notifications",
            "org.kde.NotificationManager",
            "RegisterWatcher",
            None,
            None,
            gio::DBusCallFlags::NONE,
            3000,
            None::<&gio::Cancellable>,
        );
        if let Err(error) = registered {
            log(&format!("This desktop does not support the KDE notification watcher: {error}"));
            let _ = connection.unregister_object(registration);
            return;
        }

        log("Connected to KDE Plasma notification watcher");
        let main_loop = glib::MainLoop::new(Some(&context), false);
        main_loop.run();

        let _ = connection.call_sync(
            Some("org.freedesktop.Notifications"),
            "/org/freedesktop/Notifications",
            "org.kde.NotificationManager",
            "UnRegisterWatcher",
            None,
            None,
            gio::DBusCallFlags::NONE,
            1000,
            None::<&gio::Cancellable>,
        );
        let _ = connection.unregister_object(registration);
        });
        if let Err(error) = context_result {
            log(&format!("Could not acquire the KDE notification main context: {error}"));
        }
    });
}

fn notification_dbus_call(method: &str, args: &[&str]) -> bool {
    if !command_exists("gdbus") { return false; }
    Command::new("gdbus")
        .args([
            "call", "--session",
            "--dest", "org.freedesktop.Notifications",
            "--object-path", "/org/freedesktop/Notifications",
            "--method", method,
        ])
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn notification_action(id: &str, action: &str) -> bool {
    let Ok(id) = id.parse::<u32>() else { return false; };
    if action.is_empty() || action.len() > 128 || action.chars().any(char::is_control) { return false; }
    let id = id.to_string();
    notification_dbus_call(
        "org.kde.NotificationManager.InvokeAction",
        &[&id, action],
    )
}

fn notification_dismiss(id: &str) -> bool {
    let Ok(id) = id.parse::<u32>() else { return false; };
    let id_text = id.to_string();
    let closed = notification_dbus_call(
        "org.freedesktop.Notifications.CloseNotification",
        &[&id_text],
    );
    kde_notification_ids().lock().unwrap().remove(&id);
    closed
}

fn notification_clear_active() {
    let ids: Vec<u32> = kde_notification_ids().lock().unwrap().iter().copied().collect();
    for id in ids {
        let _ = notification_dismiss(&id.to_string());
    }
}

#[tauri::command]
fn notif_act(id: String, aumid: String) {
    let _ = notification_action(&id, &aumid);
}

#[tauri::command]
fn notif_dismiss(id: String) {
    let _ = notification_dismiss(&id);
}

#[tauri::command]
fn notif_clear() {
    notification_clear_active();
}

#[tauri::command]
fn clips_get() -> Value { clip_payload() }

#[tauri::command]
fn clip_copy(id: u64) -> bool {
    let entry = clips().lock().unwrap().iter().find(|clip| clip.id == id).cloned();
    let Some(entry) = entry else { return false; };
    if let Some(image_name) = entry.image.as_deref() {
        let bytes = entry.image_bytes.clone().or_else(|| clip_image_path(image_name).and_then(|path| fs::read(path).ok()));
        let Some(bytes) = bytes else { return false; };
        let copied = clipboard_write_png(&bytes);
        if copied && setting_flag("copyPreview") {
            emit("clip", json!({ "kind": "image" }));
        }
        copied
    } else {
        copy_text_impl(&entry.text)
    }
}

#[tauri::command]
fn clip_pin(id: u64) {
    if let Some(item) = clips().lock().unwrap().iter_mut().find(|c| c.id == id) { item.pinned = !item.pinned; }
    save_clips();
    emit("clips", clip_payload());
}

#[tauri::command]
fn clip_remove(id: u64) {
    clips().lock().unwrap().retain(|c| c.id != id);
    save_clips();
    emit("clips", clip_payload());
}

#[tauri::command]
fn clips_clear() {
    clips().lock().unwrap().retain(|c| c.pinned);
    save_clips();
    emit("clips", clip_payload());
}

#[tauri::command]
fn copy_text(text: String) -> bool { copy_text_impl(&text) }

#[tauri::command]
fn shelf_get() -> Value { shelf_payload() }

#[tauri::command]
fn shelf_add(paths: Vec<String>) -> Value { shelf_add_impl(paths) }

#[tauri::command]
fn shelf_add_data(request: tauri::ipc::Request<'_>) -> Value {
    let header = |key: &str| request.headers().get(key).and_then(|v| v.to_str().ok()).map(percent_decode).unwrap_or_default();
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => shelf_add_data_impl(&header("x-name"), &header("x-type"), bytes),
        _ => shelf_payload(),
    }
}

#[tauri::command]
fn shelf_add_url(url: String) -> Value { shelf_add_url_impl(&url) }

#[tauri::command]
fn shelf_remove(path: String) { shelf_remove_impl(&path); }

#[tauri::command]
fn shelf_clear() { shelf_clear_impl(); }

#[tauri::command]
fn shelf_reveal(path: String) { shelf_reveal_impl(&path); }

#[tauri::command]
fn shelf_drag(paths: Vec<String>) { shelf_drag_impl(paths); }

#[tauri::command]
fn open_download(path: String) { open_download_impl(&path); }

#[tauri::command]
fn settings_get() -> Value { settings_payload() }

#[tauri::command]
fn settings_set(key: String, value: Value) { settings_apply(&key, &value); }

#[tauri::command]
fn action(name: String) {
    match name.as_str() {
        "screenshot" => screenshot_start(),
        "dnd" => {
            if command_exists("gnome-control-center") { let _ = Command::new("gnome-control-center").arg("notifications").spawn(); }
            else if command_exists("systemsettings") { let _ = Command::new("systemsettings").arg("kcm_notifications").spawn(); }
        }
        "ocr" => ocr_start(),
        _ => {}
    }
}

#[tauri::command]
fn open_url(url: String) {
    let value = url.trim();
    if (value.starts_with("https://") || value.starts_with("http://"))
        && value.len() < 2000
        && !value.chars().any(|c| c.is_whitespace() || c.is_control() || c == '"' || c == '\'') {
        open_path(value);
    }
}

// ---------------------------------------------------------------- signed Linux package updates
fn update_repository() -> String {
    let repo = option_env!("PEEKY_UPDATE_REPOSITORY").unwrap_or("raminturne/peeky");
    let valid = repo.split_once('/').is_some_and(|(owner, project)| {
        !owner.is_empty() && !project.is_empty()
            && owner.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
            && project.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
    });
    if valid { repo.to_string() } else { "raminturne/peeky".to_string() }
}

fn update_dir() -> PathBuf {
    let base = std::env::var_os("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home_dir().join(".cache"));
    let dir = base.join("peeky").join("updates");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn safe_update_asset(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 180
        && name.ends_with(".deb")
        && name.chars().all(|c| c.is_ascii_alphanumeric() || "._+-".contains(c))
}

fn download_update_asset(name: &str, max_bytes: u64) -> Option<PathBuf> {
    let path = update_dir().join(name);
    let _ = fs::remove_file(&path);
    let url = format!(
        "https://github.com/{}/releases/latest/download/{}",
        update_repository(), name
    );
    let limit = max_bytes.to_string();
    let status = Command::new("curl")
        .args([
            "--fail", "--location", "--silent", "--show-error",
            "--connect-timeout", "12", "--max-time", "180",
            "--retry", "2", "--max-filesize", &limit,
            "--output",
        ])
        .arg(&path)
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .ok()?;
    if !status.success() { return None; }
    let size = fs::metadata(&path).ok()?.len();
    (size > 0 && size <= max_bytes).then_some(path)
}

fn update_version_parts(version: &str) -> Vec<u64> {
    version.trim_start_matches('v')
        .split('.')
        .map(|part| part.split(['-', '+']).next().unwrap_or("0").parse::<u64>().unwrap_or(0))
        .collect()
}

fn update_is_newer(candidate: &str, current: &str) -> bool {
    update_version_parts(candidate) > update_version_parts(current)
}

fn verify_update_package(package: &Path) -> bool {
    let Ok(metadata) = fs::metadata(package) else { return false; };
    if metadata.len() == 0 || metadata.len() > 256 * 1024 * 1024 { return false; }

    let signature_path = PathBuf::from(format!("{}.sig", package.to_string_lossy()));
    let (Ok(data), Ok(signature_text)) = (fs::read(package), fs::read_to_string(signature_path)) else {
        return false;
    };
    let Ok(signature_bytes) = BASE64.decode(signature_text.trim()) else { return false; };
    let (Ok(public_key), Ok(signature)) = (
        ed25519_compact::PublicKey::from_slice(&UPDATE_KEY),
        ed25519_compact::Signature::from_slice(&signature_bytes),
    ) else {
        return false;
    };
    public_key.verify(&data, &signature).is_ok()
}

/// Returns "none", "ready <version>", or "failed: <reason>".
/// The manifest selects a filename only; trust comes from verifying the package signature.
fn linux_update_check() -> String {
    if let Some(update) = update_ready().lock().unwrap().as_ref() {
        return format!("ready {}", update.version);
    }
    if !command_exists("curl") || !command_exists("dpkg-deb") {
        return "failed: install curl and dpkg-deb to check for updates".into();
    }

    let Some(manifest_path) = download_update_asset("latest-linux.json", 64 * 1024) else {
        return "failed: could not download the Linux update manifest".into();
    };
    let manifest = fs::read_to_string(&manifest_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok());
    let Some(manifest) = manifest else {
        return "failed: the Linux update manifest is invalid".into();
    };
    let Some(filename) = manifest["file"].as_str().filter(|name| safe_update_asset(name)) else {
        return "failed: the Linux update manifest contains an invalid package name".into();
    };

    let Some(package) = download_update_asset(filename, 256 * 1024 * 1024) else {
        return "failed: the Linux package download did not finish".into();
    };
    let signature_name = format!("{filename}.sig");
    let Some(signature) = download_update_asset(&signature_name, 16 * 1024) else {
        let _ = fs::remove_file(&package);
        return "failed: the package signature could not be downloaded".into();
    };

    if !verify_update_package(&package) {
        let _ = fs::remove_file(&package);
        let _ = fs::remove_file(&signature);
        log("Linux update rejected: package signature verification failed");
        return "failed: the package signature is not valid".into();
    }

    let package_version = output("dpkg-deb", &["-f", package.to_string_lossy().as_ref(), "Version"])
        .unwrap_or_default();
    let manifest_version = manifest["version"].as_str().unwrap_or("").trim();
    if package_version.is_empty() || package_version != manifest_version {
        let _ = fs::remove_file(&package);
        let _ = fs::remove_file(&signature);
        return "failed: package version does not match the release manifest".into();
    }
    if !update_is_newer(&package_version, env!("CARGO_PKG_VERSION")) {
        let _ = fs::remove_file(&package);
        let _ = fs::remove_file(&signature);
        return "none".into();
    }

    *update_ready().lock().unwrap() = Some(LinuxUpdate {
        version: package_version.clone(),
        package,
    });
    emit("helper", json!({
        "t": "update",
        "version": package_version,
        "body": "An update is ready. Click here to install it and approve the administrator prompt."
    }));
    format!("ready {package_version}")
}

/// Installation is always user initiated. pkexec displays the desktop's administrator
/// confirmation; never run dpkg silently from the periodic update checker.
fn linux_update_install() -> bool {
    let Some(update) = update_ready().lock().unwrap().clone() else { return false; };
    if !verify_update_package(&update.package) {
        log("Linux update rejected at install time: package signature verification failed");
        return false;
    }
    if !command_exists("pkexec") || !Path::new("/usr/bin/dpkg").exists() {
        log("Linux update cannot start: pkexec or /usr/bin/dpkg is missing");
        return false;
    }

    log(&format!("Starting administrator-approved Linux update {}", update.version));
    let status = Command::new("pkexec")
        .arg("/usr/bin/dpkg")
        .arg("--install")
        .arg(&update.package)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    match status {
        Ok(status) if status.success() => {
            if let Some(app) = APP.get() {
                app.request_restart();
                true
            } else {
                false
            }
        }
        Ok(status) => {
            log(&format!("Linux package installation was not completed (exit status {})", status));
            false
        }
        Err(error) => {
            log(&format!("Could not start administrator-approved Linux package installation: {error}"));
            false
        }
    }
}

fn update_background_start() {
    thread::spawn(|| {
        thread::sleep(Duration::from_secs(45));
        let mut next_check = 0u64;
        loop {
            if setting_flag("autoUpdate") && now_ms() >= next_check {
                let result = linux_update_check();
                let delay = if result.starts_with("failed") {
                    Duration::from_secs(30 * 60)
                } else {
                    Duration::from_secs(6 * 60 * 60)
                };
                next_check = now_ms().saturating_add(delay.as_millis() as u64);
                if result.starts_with("failed") {
                    log(&format!("Automatic Linux update check: {result}"));
                }
            }
            thread::sleep(Duration::from_secs(20));
        }
    });
}

#[tauri::command(async)]
fn update_check() -> String { linux_update_check() }

#[tauri::command(async)]
fn update_install() -> bool { linux_update_install() }

#[tauri::command]
fn speedo_cmd(_cmd: String, _id: Option<String>, _on: Option<bool>) -> Value {
    json!({ "ok": false, "present": false })
}

#[tauri::command]
fn ocr_done(text: String, conf: f64) { ocr_done_impl(&text, conf); }

#[tauri::command]
fn notes_get() -> Value { notes_payload(&notes().lock().unwrap()) }

#[tauri::command]
fn note_save(id: Option<u64>, text: String, remind: Option<f64>) -> Value {
    note_save_impl(id, &text, remind.unwrap_or(0.0).max(0.0) as u64)
}

#[tauri::command]
fn note_pin(id: u64) -> Value { note_pin_impl(id) }

#[tauri::command]
fn note_fired(id: u64) -> Value { note_fired_impl(id) }

#[tauri::command]
fn note_remove(id: u64) -> Value { note_remove_impl(id) }

#[tauri::command]
fn vault_list() -> Value { vault_payload() }

#[tauri::command]
fn vault_generate(len: usize, symbols: bool) -> String { vault_generate_impl(len, symbols) }

#[tauri::command]
fn vault_save(site: String, user: String, pass: String) -> u64 {
    let id = vault_save_impl(&site, &user, &pass);
    if id != 0 && !user.trim().is_empty() {
        settings_put("lastUser", user.trim().into());
        settings_broadcast();
    }
    id
}

#[tauri::command]
fn vault_edit(id: u64, site: String, user: String) -> bool {
    let ok = vault_edit_impl(id, &site, &user);
    if ok && !user.trim().is_empty() {
        settings_put("lastUser", user.trim().into());
        settings_broadcast();
    }
    ok
}

fn process_executable_name(pid: u32) -> String {
    fs::read_link(format!("/proc/{pid}/exe"))
        .ok()
        .and_then(|path| path.file_name().map(|name| name.to_string_lossy().to_string()))
        .unwrap_or_default()
}

fn focused_sway_node(node: &Value) -> Option<&Value> {
    if node["focused"].as_bool() == Some(true) { return Some(node); }
    for key in ["nodes", "floating_nodes"] {
        if let Some(children) = node[key].as_array() {
            for child in children {
                if let Some(found) = focused_sway_node(child) { return Some(found); }
            }
        }
    }
    None
}

fn wayland_window_context() -> Value {
    // Hyprland publishes the focused toplevel as JSON through its supported CLI.
    if command_exists("hyprctl") {
        if let Some(raw) = output("hyprctl", &["activewindow", "-j"]) {
            if let Ok(active) = serde_json::from_str::<Value>(&raw) {
                let pid = active["pid"].as_u64().and_then(|pid| u32::try_from(pid).ok());
                if pid == Some(std::process::id()) { return json!({}); }
                let title = active["title"].as_str().unwrap_or("").trim();
                let exe = pid.map(process_executable_name).filter(|name| !name.is_empty())
                    .unwrap_or_else(|| active["class"].as_str().unwrap_or("").to_string());
                if !title.is_empty() || !exe.is_empty() {
                    return json!({ "title": title, "exe": exe });
                }
            }
        }
    }

    // Sway exposes a focused-node tree. Traverse both tiled and floating descendants.
    if command_exists("swaymsg") {
        if let Some(raw) = output("swaymsg", &["-t", "get_tree", "-r"]) {
            if let Ok(tree) = serde_json::from_str::<Value>(&raw) {
                if let Some(active) = focused_sway_node(&tree) {
                    let pid = active["pid"].as_u64().and_then(|pid| u32::try_from(pid).ok());
                    if pid == Some(std::process::id()) { return json!({}); }
                    let app_id = active["app_id"].as_str().unwrap_or("").trim();
                    let title = active["name"].as_str().unwrap_or(app_id).trim();
                    let exe = pid.map(process_executable_name).filter(|name| !name.is_empty())
                        .unwrap_or_else(|| app_id.to_string());
                    if !title.is_empty() || !exe.is_empty() {
                        return json!({ "title": title, "exe": exe });
                    }
                }
            }
        }
    }
    json!({})
}

#[tauri::command]
fn fg_context() -> Value {
    if is_wayland() { return wayland_window_context(); }
    let Some(id) = output("xdotool", &["getactivewindow"]) else { return json!({}); };
    if x11_window_pid(&id) == Some(std::process::id()) { return json!({}); }
    x11_window_context(&id)
}

#[tauri::command]
fn vault_copy(id: u64, what: String) -> bool { vault_copy_impl(id, &what) }

#[tauri::command]
fn copy_secret(text: String) -> bool { copy_secret_impl(&text) }

#[tauri::command]
fn vault_reveal(id: u64) -> Option<String> { vault_reveal_impl(id) }

#[tauri::command]
fn vault_remove(id: u64) -> bool { vault_remove_impl(id) }

#[tauri::command]
fn debug_out(text: String) { log(&text); }

fn tray_rgba() -> Vec<u8> {
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
    let title = MenuItemBuilder::with_id("title", format!("{} {}", APP_NAME, env!("CARGO_PKG_VERSION"))).enabled(false).build(app)?;
    let auto = CheckMenuItemBuilder::with_id("autostart", "Start with Linux").checked(autostart_on()).build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&title).separator()
        .text("settings", "Settings…")
        .item(&auto)
        .text("restart", "Restart")
        .separator()
        .text("quit", "Quit")
        .build()?;
    TrayIconBuilder::with_id("main")
        .icon(tauri::image::Image::new_owned(tray_rgba(), 32, 32))
        .tooltip(APP_NAME)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "settings" => { let _ = app.emit("open", "settings"); }
            "autostart" => {
                let on = auto.is_checked().unwrap_or(false);
                settings_put("autoStart", on.into());
                set_autostart(on);
                settings_broadcast();
            }
            "restart" => app.restart(),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

fn position_x11_window(window: &tauri::WebviewWindow) {
    // Explicit positioning is supported by X11 window managers.
    if let Ok(monitors) = window.available_monitors() {
        if let Some(monitor) = monitors.first() {
            let p = monitor.position();
            let size = monitor.size();
            let x = p.x + (size.width as i32 - WIN_W as i32) / 2;
            let _ = window.set_position(tauri::PhysicalPosition::new(x, p.y));
        }
    }
}

fn initialize_x11_threading() {
    if is_wayland() { return; }
    let Ok(xlib) = x11_dl::xlib::Xlib::open() else {
        log("libX11 is unavailable; using a normal interactive window without X11 pointer tracking");
        return;
    };
    // GTK/WebKit also use Xlib. XInitThreads must be called before either library opens
    // its display connection; the X11 polling thread then owns a separate Display handle.
    let initialized = unsafe { (xlib.XInitThreads)() };
    if initialized == 0 {
        log("XInitThreads failed; using a normal interactive window without X11 pointer tracking");
        return;
    }
    let _ = X11_LIB.set(xlib);
}

fn x11_native_window_id(window: &tauri::WebviewWindow) -> Option<x11_dl::xlib::Window> {
    let gtk_window = window.gtk_window().ok()?;
    let gdk_window = gtk_window.window()?;
    let x11_window = gdk_window.downcast::<X11Window>().ok()?;
    Some(x11_window.xid() as _)
}

unsafe fn x11_root_level_window(
    xlib: &x11_dl::xlib::Xlib,
    display: *mut x11_dl::xlib::Display,
    mut current: x11_dl::xlib::Window,
) -> Option<x11_dl::xlib::Window> {
    // Window managers may reparent client windows inside decoration/frame windows.
    // Walk upwards so the pointer's root child can be compared with Peeky's real top-level.
    for _ in 0..32 {
        let mut root = 0;
        let mut parent = 0;
        let mut children: *mut x11_dl::xlib::Window = ptr::null_mut();
        let mut child_count = 0u32;
        let ok = (xlib.XQueryTree)(
            display,
            current,
            &mut root,
            &mut parent,
            &mut children,
            &mut child_count,
        );
        if !children.is_null() {
            (xlib.XFree)(children.cast());
        }
        if ok == 0 || root == 0 || parent == 0 || parent == current {
            return None;
        }
        if parent == root {
            return Some(current);
        }
        current = parent;
    }
    None
}

fn x11_pointer_watch() {
    if is_wayland() { return; }
    let Some(xlib) = X11_LIB.get() else {
        X11_POINTER_ACTIVE.store(false, Ordering::SeqCst);
        // The compact GTK input region remains active; the WebView bridge supplies
        // local pointer events even when global X11 polling is unavailable.
        return;
    };
    let Some(window) = APP.get().and_then(|app| app.get_webview_window("main")) else { return; };
    let Some(own_window_id) = x11_native_window_id(&window) else {
        log("Could not obtain Peeky's native X11 window id; pointer tracking is disabled");
        X11_POINTER_ACTIVE.store(false, Ordering::SeqCst);
        // Keep the measured GTK input shape. DOM pointer events remain the fallback.
        return;
    };

    thread::spawn(move || unsafe {
        let display = (xlib.XOpenDisplay)(ptr::null());
        if display.is_null() {
            log("XOpenDisplay failed; pointer tracking is disabled");
            X11_POINTER_ACTIVE.store(false, Ordering::SeqCst);
            return;
        }
        let root = (xlib.XDefaultRootWindow)(display);
        // The window manager can reparent the GTK surface a moment after map(). Retry
        // instead of permanently disabling pointer tracking during that startup race.
        let mut resolved_root_child = None;
        for _ in 0..50 {
            resolved_root_child = x11_root_level_window(xlib, display, own_window_id);
            if resolved_root_child.is_some() { break; }
            thread::sleep(Duration::from_millis(100));
        }
        let Some(own_root_child) = resolved_root_child else {
            log("Could not resolve Peeky's top-level X11 window after 5 seconds; pointer tracking is disabled");
            (xlib.XCloseDisplay)(display);
            X11_POINTER_ACTIVE.store(false, Ordering::SeqCst);
            return;
        };

        X11_POINTER_ACTIVE.store(true, Ordering::SeqCst);
        let mut last_emit = std::time::Instant::now();
        let mut last_down = false;
        let mut press_belongs_to_peeky = false;
        let mut last_x = -1000.0;
        let mut last_y = -1000.0;

        loop {
            thread::sleep(Duration::from_millis(16));

            let mut pointer_root = 0;
            let mut pointer_child = 0;
            let mut root_x = 0;
            let mut root_y = 0;
            let mut window_x = 0;
            let mut window_y = 0;
            let mut mask = 0u32;
            let queried = (xlib.XQueryPointer)(
                display,
                root,
                &mut pointer_root,
                &mut pointer_child,
                &mut root_x,
                &mut root_y,
                &mut window_x,
                &mut window_y,
                &mut mask,
            );
            if queried == 0 { continue; }

            let (Ok(position), Ok(scale)) = (window.outer_position(), window.scale_factor()) else { continue; };
            let scale = scale.max(0.5);
            let x = (root_x - position.x) as f64 / scale;
            let y = (root_y - position.y) as f64 / scale;
            let near = x > -80.0 && x < WIN_W + 80.0 && y > -80.0 && y < WIN_H + 80.0;

            let pointer_moved = (x - last_x).abs() > 0.1 || (y - last_y).abs() > 0.1;
            // X11 can report the global pointer without taking input from other apps.
            // Emit movement even when the cursor is outside Peeky's transparent window;
            // the face renderer can then follow the user across the whole desktop.
            if pointer_moved && last_emit.elapsed() >= Duration::from_millis(16) {
                emit("cursor", json!({ "x": (x * 10.0).round() / 10.0, "y": (y * 10.0).round() / 10.0 }));
                last_emit = std::time::Instant::now();
                last_x = x;
                last_y = y;
            }

            // Match the Windows hit-test fallback: only announce a press when the actual
            // top-level window under the pointer is Peeky, not merely when the coordinates
            // overlap its 700x430 transparent WebView rectangle.
            let left_button_down = mask & (1 << 8) != 0; // X11 Button1Mask
            if left_button_down
                && !last_down
                && INPUT_INTERACTIVE.load(Ordering::SeqCst)
                && near
                && pointer_child == own_root_child
            {
                press_belongs_to_peeky = true;
                emit("press", json!({ "x": x, "y": y }));
            } else if !left_button_down && last_down && press_belongs_to_peeky {
                press_belongs_to_peeky = false;
                emit("release", json!({ "x": x, "y": y }));
            }
            last_down = left_button_down;
        }
    });
}

fn register_x11_hotkeys(app: &tauri::App) {
    if !is_wayland() && setting_flag("noteHotkey") {
        if let Err(e) = app.global_shortcut().register("ctrl+alt+n") { log(&format!("Ctrl+Alt+N unavailable: {e}")); }
        if let Err(e) = app.global_shortcut().register("ctrl+alt+t") { log(&format!("Ctrl+Alt+T unavailable: {e}")); }
    }
}

fn main() {
    std::panic::set_hook(Box::new(|info| {
        log(&format!("PANIC: {info}"));
        log(&format!("Backtrace:\n{}", std::backtrace::Backtrace::force_capture()));
    }));
    initialize_x11_threading();
    log(&format!("Starting Peeky {} on {} ({})", env!("CARGO_PKG_VERSION"), if is_wayland() { "Wayland" } else { "X11" }, desktop_name()));
    settings_load();
    notes_load();
    vault_load();
    clips_load();
    shelf_load();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app.emit("open", "settings");
            if let Some(window) = app.get_webview_window("main") { let _ = window.set_focus(); }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, shortcut, event| {
            if event.state != ShortcutState::Pressed { return; }
            if shortcut.matches(Modifiers::CONTROL | Modifiers::ALT, Code::KeyN) {
                let _ = app.emit("hotkey", "note");
            } else if shortcut.matches(Modifiers::CONTROL | Modifiers::ALT, Code::KeyT) {
                ocr_start();
            }
        }).build());

    builder
        .invoke_handler(tauri::generate_handler![
            set_interactive, cursor_update, set_typing, lost_click, media, seek, set_volume, toggle_mute, set_viz, notif_act, notif_dismiss, notif_clear,
            clips_get, clip_copy, clip_pin, clip_remove, clips_clear, copy_text,
            shelf_get, shelf_add, shelf_add_data, shelf_add_url, shelf_remove, shelf_clear, shelf_reveal, shelf_drag, open_download,
            settings_get, settings_set, action, open_url, ocr_done, speedo_cmd, update_check, update_install,
            notes_get, note_save, note_pin, note_fired, note_remove,
            vault_list, vault_generate, vault_save, vault_edit, fg_context, vault_copy, copy_secret, vault_reveal, vault_remove, debug_out
        ])
        .setup(|app| {
            let _ = APP.set(app.handle().clone());
            if !is_wayland() { register_x11_hotkeys(app); }

            // gtk-layer-shell gives Wayland compositors that implement wlr-layer-shell a true
            // top-layer, top-centred surface. GNOME's default Wayland compositor does not expose
            // this protocol, so it gets a conventional, movable application window instead.
            let layer_shell = is_wayland() && gtk_layer_shell::is_supported();
            if is_wayland() && !layer_shell {
                log("This Wayland compositor has no layer-shell protocol; using a regular desktop window");
            }

            let mut builder = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
                .title(APP_NAME)
                .inner_size(WIN_W, WIN_H)
                .decorations(is_wayland() && !layer_shell)
                .transparent(true)
                .shadow(false)
                .resizable(is_wayland() && !layer_shell)
                .maximizable(false)
                .minimizable(true)
                .always_on_top(!is_wayland() || layer_shell)
                .skip_taskbar(!is_wayland() || layer_shell)
                .focused(false)
                .visible(false)
                .disable_drag_drop_handler();
            if !is_wayland() {
                builder = builder.position(0.0, 0.0);
            }
            let window = builder.build()?;

            if layer_shell {
                if let Ok(gtk_window) = window.gtk_window() {
                    gtk_window.init_layer_shell();
                    gtk_window.set_layer(Layer::Top);
                    gtk_window.set_anchor(Edge::Top, true);
                    // CSS positions the pill 8px below the surface origin; do not add a second layer margin.
                    gtk_window.set_layer_shell_margin(Edge::Top, 0);
                    gtk_window.set_exclusive_zone(-1);
                    gtk_window.set_keyboard_mode(KeyboardMode::OnDemand);
                    gtk_window.set_namespace("peeky");
                }
            } else if is_wayland() {
                let _ = window.center();
            } else {
                position_x11_window(&window);
            }

            let _ = window.show();
            // Start with a compact hit target on every Linux display server. The bridge
            // expands it only around controls that are actually visible.
            set_input_interactive(window.clone(), false, Some(default_input_regions()));

            create_tray(app)?;
            if setting_flag("autoStart") { set_autostart(true); }
            clipboard_watch();
            downloads_watch();
            x11_pointer_watch();
            interaction_watchdog_start();
            poll_start();
            visualizer_start();
            update_background_start();
            kde_notification_watcher_start();
            settings_broadcast();
            emit("notes", notes_payload(&notes().lock().unwrap()));
            emit("vault", vault_payload());
            emit("shelf", shelf_payload());
            emit("clips", clip_payload());
            emit("helper", json!({ "t": "cover", "covered": false, "full": false }));
            emit("speedo", json!({ "present": false }));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Peeky on Linux");
}
