# Peeky Linux Port — Stage 1 Audit

Audit date: 2026-11-15  
Audited repository: `ahb1390/peeky` (the user's fork)  
Branch: `main`  
Baseline commit: `d3ccdd5c52c9055fe619d57ee028383fd35a267c`  
Application version in `src-tauri/Cargo.toml`: `2.1.2`

> This document records the state found during Stage 1. It does not claim that the Linux build or either desktop session has been runtime-tested.

## 1. Repository and architecture baseline

The repository is a fork of `raminturne/peeky`. All work for this port is to remain in `ahb1390/peeky`. Do not open, update, or merge a pull request against the upstream repository.

The current tree already contains an initial Linux port:

- `src-tauri/src/main.rs` selects a platform entry point using `cfg(target_os)`.
- `src-tauri/src/main_windows.rs` contains the existing Windows backend.
- `src-tauri/src/main_linux.rs` contains the Linux backend.
- `src-tauri/tauri.linux.conf.json` contains Linux-specific Tauri bundle settings.
- `.github/workflows/build.yml` has Windows and Linux jobs plus a release job.
- `ui/bridge.js`, `ui/app.js`, and the rest of `ui/` are shared by both platforms.

This is a useful separation boundary: Windows-only modules and Win32/WebView2 types are included only by the Windows entry point. The Linux implementation is currently a large single source file; later stages should split it into focused modules once its public command/event contract is stable.

## 2. Build dependencies

The current manifest keeps these dependencies under Windows target configuration:

- `windows`, `windows-core`, `windows-future`
- `webview2-com`
- `image`
- `ed25519-compact`

Linux target dependencies currently include:

- `tauri-plugin-global-shortcut`
- `gtk`
- `cairo-rs`
- `gtk-layer-shell`

Shared dependencies include Tauri 2, the single-instance plugin, Serde, Serde JSON, and Base64.

### Lockfile issue

The checked-in `src-tauri/Cargo.lock` contains GTK and Cairo packages, but the audit did not find package entries for `gtk-layer-shell` or `tauri-plugin-global-shortcut`, although both are declared in the Linux target dependencies. The Linux workflow currently does not pass `--locked`, so Cargo may resolve and rewrite the lockfile during CI rather than proving that the committed lockfile is complete.

**Required follow-up:** resolve Linux dependencies and commit a complete lockfile, then use locked builds in CI.

## 3. Current Linux capability inventory

The status below describes code found during static inspection, not a successful runtime test.

| Capability | Current implementation found | Current status / limitation |
|---|---|---|
| Window creation | Tauri WebviewWindow, transparent frameless window | Implemented; runtime behavior not verified |
| X11 positioning | Explicit top-centre placement using monitor geometry | Implemented; depends on window manager behavior |
| X11 hover tracking | Polls pointer location with `xdotool` | Implemented when `xdotool` is installed; otherwise falls back to a normal interactive window |
| X11 click-through | Tauri ignore-cursor-events toggling | Best-effort; must be tested against real X11 window managers |
| Wayland layer surface | GTK Layer Shell, top layer, top anchor, input region | Available only on compositors advertising the layer-shell protocol |
| Wayland fallback | Ordinary decorated/movable application window | Used where layer-shell is unavailable (including GNOME's standard Wayland session) |
| Global shortcuts | Tauri global-shortcut plugin | Registered on X11; deliberately disabled on Wayland |
| Text clipboard | `wl-paste` / `wl-copy` on Wayland; `xclip` / `xsel` on X11 | Implemented for text |
| Clipboard history | In-memory text list and pinned text persisted to JSON | Text-only; image history is not implemented in the Linux backend yet |
| Private clipboard copy | Sensitive Wayland copy option and timeout clearing | Implemented; platform-specific privacy semantics need testing |
| Notes and reminders | JSON persistence under XDG data directory | CRUD and persistence implemented; reminder delivery needs validation |
| Password vault | `secret-tool` / Secret Service; metadata index in app data | Implemented when an unlocked Secret Service provider is available |
| Media controls | MPRIS through `playerctl` | Basic play/pause/next/previous/seek and metadata polling found |
| Volume | `wpctl` or `pactl` | Basic volume and mute controls found |
| Audio visualizer | `set_viz` is a no-op; emitted levels are currently placeholders | Not implemented |
| Notifications | Notification command handlers are no-ops | Not implemented |
| File shelf | Add/remove/clear/reveal and URL/data ingestion | Basic file shelf implemented; drag-out is a no-op |
| Download watcher | Polls `~/Downloads` for new stable files | Basic watcher; does not yet cover arbitrary XDG download locations |
| Screenshot / OCR | Wayland uses `grim` + `slurp`; X11 uses available screenshot helpers; UI runs bundled Tesseract | Implemented path; must be tested per session and with Persian/English samples |
| Network status | Reads network interface operational state | Basic online/offline indication only; VPN identification is not implemented |
| Bluetooth and sensor status | No corresponding Linux poller found | Not implemented |
| Active-window context | `xdotool` on X11 | Returns empty data on Wayland |
| Speedo integration | Command returns an unavailable result | Not implemented |
| Self-updater | Linux update check returns a manual result and install returns false | Automatic Linux updates are not implemented |
| System tray | Tauri tray with settings, autostart, restart, quit | Implemented; desktop-environment support needs testing |
| Autostart | XDG `~/.config/autostart/com.peeky.app.desktop` entry | Implemented; needs install/uninstall and desktop-session tests |

## 4. Shared UI command and event contract

A static comparison was made between `ui/bridge.js` and the Linux Tauri command handlers.

- Every command name invoked by the current bridge was found among the Linux command handlers.
- No missing bridge-to-Linux command name was found by that static comparison.
- Linux additionally exposes `vault_edit` and `fg_context` for the current UI.

The bridge subscribes to these event names:

`cursor`, `helper`, `settings`, `clip`, `download`, `shelf`, `shelf-dragging`, `clips`, `levels`, `press`, `release`, `open`, `hotkey`, `notes`, `vault`, `ocr`, `ocr-read`, `speedo`.

The Linux backend emits the following event names during the static scan:

`settings`, `clips`, `clip`, `notes`, `vault`, `shelf`, `download`, `ocr-read`, `ocr`, `helper`, `levels`, `cursor`, `open`, `hotkey`, `speedo`.

### Event contract gaps

The current Linux source does not emit:

- `press`
- `release`
- `shelf-dragging`

These events are part of the shared UI bridge and must be addressed before claiming full interaction parity. The lack of shelf drag-out is also consistent with the current no-op Linux `shelf_drag` implementation.

## 5. Packaging and CI baseline

The repository already has the intended packaging structure:

- Base Tauri configuration keeps bundling inactive for the existing Windows build.
- `tauri.linux.conf.json` enables a Debian package and lists Linux PNG icons.
- The Linux workflow installs GTK/WebKit, Ayatana AppIndicator, GTK Layer Shell, Secret Service and image-generation dependencies.
- The workflow generates PNG icon sizes from the existing ICO file.
- The Linux job invokes `cargo tauri build --release --bundles deb` and uploads the resulting `.deb` plus checksums.
- The release job waits for both Windows and Linux jobs, then publishes their artifacts on a version tag.

The documented package target is x86_64/amd64, with Debian 12+ and Ubuntu 22.04+ stated in the README. Other architectures and distributions are not part of the current package promise.

### CI evidence

At the time of this audit, the GitHub Actions API for `ahb1390/peeky` returned `total_count: 0` workflow runs. Consequently, this audit has no successful Linux build, Windows regression build, package-install test, or X11/Wayland runtime test to cite.

The workflow currently runs `cargo build --release` for Windows and `cargo tauri build --release --bundles deb` for Linux. It does not run a dedicated `cargo test`, `cargo fmt --check`, `cargo clippy`, or package-install smoke test.

## 6. Risks and priorities carried into later stages

1. **Reproducible build:** complete and validate `Cargo.lock` for the Linux-only dependencies; switch CI to locked builds.
2. **Compile validation:** run the Windows and Linux builds before extending the backend. The Linux code has not yet been confirmed by a successful build.
3. **X11 interaction:** validate the fixed Wayland/X11 input region and pointer hit-testing against fractional scaling, multiple monitors, and common window managers.
4. **Wayland reality:** test a layer-shell compositor (for example, a wlroots-based session) separately from GNOME/KDE sessions without layer-shell. Do not promise identical window placement or global-hotkey behavior on every compositor.
5. **UI event parity:** implement or deliberately redesign `press`, `release`, and `shelf-dragging`.
6. **Feature parity:** notifications, audio visualizer, Bluetooth/sensor status, Speedo, automatic update, image clipboard history and drag-out remain outstanding or limited.
7. **Package validation:** install, launch, autostart, upgrade and remove the generated `.deb` on a clean Debian/Ubuntu system.

## 7. Stage 1 conclusion

The project is not starting from an empty Linux branch: a substantial first Linux backend, Debian bundle configuration and Linux CI job already exist in the fork. The immediate next action should be a build-and-lockfile validation pass before adding more platform code. This prevents new features from being layered on top of an unverified baseline.

No application behavior, version number, release tag, or upstream repository was changed as part of this audit.
