<div align="center">

# Peeky

**A tiny dynamic island for Windows.** One small pill at the top of your screen that shows what is playing,
catches your notifications, remembers what you copied, holds your files, and blinks at you in between.

[![release](https://img.shields.io/github/v/release/raminturne/peeky?label=release&color=555)](https://github.com/raminturne/peeky/releases/latest)
[![downloads](https://img.shields.io/github/downloads/raminturne/peeky/total?label=downloads&color=555)](https://github.com/raminturne/peeky/releases)
[![build](https://img.shields.io/github/actions/workflow/status/raminturne/peeky/build.yml?branch=main&label=build)](https://github.com/raminturne/peeky/actions/workflows/build.yml)
![size](https://img.shields.io/badge/size-~3%20MB-555)
[![license](https://img.shields.io/badge/license-MIT-555)](LICENSE)

[![Windows installer](https://img.shields.io/badge/WINDOWS-INSTALLER-0a7cd6?style=for-the-badge)](https://github.com/raminturne/peeky/releases/latest/download/Peeky-Setup.exe)
[![Windows portable exe](https://img.shields.io/badge/WINDOWS-PORTABLE%20.EXE-1f2328?style=for-the-badge)](https://github.com/raminturne/peeky/releases/latest/download/Peeky-Portable.exe)
[![Windows zip](https://img.shields.io/badge/WINDOWS-.ZIP-1f2328?style=for-the-badge)](https://github.com/raminturne/peeky/releases/latest/download/Peeky-Windows.zip)

[فارسی](#فارسی)

<img src="docs/hero.jpg" width="860" alt="Peeky resting at the top of the desktop">

</div>

## What it does

- **Now playing.** Title, artist, cover, controls and a scrubber for whatever is playing on the system. Films and fullscreen games are left alone.
- **Themes that move.** Liquid skins that drift at rest and flood with colour on the beat (or stay calm, if you switch that off). In **Venom** the pill itself turns to black goo.
- **Notifications in one line.** Click to open that chat. While you are using the pill they wait beside it instead of taking it over.
- **One hover away.** Screenshot, text grab, clipboard history, quick note, passwords, timer, notifications, settings.
- **Smart copy.** A copied link can be opened, a sum gets its answer, a date its twin in the other calendar (Gregorian ⇄ Shamsi), a colour its swatch.
- **File shelf.** Drop files on the pill; up to five sit there side by side until you drag them out again.
- **Timer.** Stays in sight while it runs, even over a fullscreen app.
- **Settings inside the island.** No extra windows.

On its first start Peeky says hello and shows a list of everything it can do; it stays in the settings under *What Peeky can do*. A click on a row tries the thing itself.
And also:

- **Quick notes.** `Ctrl+Alt+N` from anywhere, type one line, Enter. A time in the line (`call Ali in 20m`, `at 18:30 gym`, «۱۰ دقیقه دیگه چای») turns it into a reminder.
- **Passwords.** Generate one, confirm, and it asks which site and which e-mail it is for. Stored encrypted with your Windows account (DPAPI); copies clear themselves from the clipboard after 30 seconds.
- **Text grab.** `Ctrl+Alt+T`, drag a box, and the text in it is on your clipboard. English is read by Windows' own OCR; Persian by a bundled Tesseract. Nothing leaves your machine.
- **Clipboard history** with images and pins.
- **Small signs.** A dot while the microphone or camera is in use, a line when the internet or a VPN goes up or down, Bluetooth devices and the charger.
- **Updates itself.** New releases are downloaded, checked against the project's signing key, and installed with one click.

## Install

Download **[Peeky-Setup.exe](https://github.com/raminturne/peeky/releases/latest/download/Peeky-Setup.exe)** and run it.
It installs for the current user only (no administrator prompt) and starts with Windows; both can be changed in the settings.

Windows 10 or 11 with the WebView2 runtime (already part of Windows 11 and of current Windows 10).

The installer is not code-signed, so Windows SmartScreen may ask once whether to run it.

[مستندات فارسی جامع و راهنمای لینوکس](docs/index.md) · [صفحهٔ راهنمای وب](https://ahb1390.github.io/peeky/)

## Install on Linux

Download the `peeky_2.1.2_amd64.deb` asset from the GitHub release and install it with:

```sh
sudo apt install ./peeky_2.1.2_amd64.deb
```

For a local build, after installing `python3-pil`, run:

```sh
python3 - <<'PY'
from PIL import Image
from pathlib import Path
source = Image.open('src-tauri/icons/icon.ico').convert('RGBA')
for name, size in [('32x32.png', 32), ('128x128.png', 128), ('128x128@2x.png', 256), ('icon.png', 512)]:
    source.resize((size, size), Image.Resampling.LANCZOS).save(Path('src-tauri/icons') / name)
PY
cd src-tauri
cargo tauri build --release --bundles deb
```

The package is built for Debian 12+ and Ubuntu 22.04+ (x86_64). The GitHub build generates the Linux PNG icon sizes from the project's existing ICO file. For a local package build, install `python3-pil` and generate the icon files first. Optional desktop helpers:

- X11 pointer tracking: `xdotool`
- Wayland screenshots: `grim` and `slurp`
- X11 screenshots: `flameshot` or `gnome-screenshot`
- Password storage: `libsecret-tools` and an unlocked Secret Service provider (GNOME Keyring or KWallet)
- Media controls: `playerctl`
- Volume: `wpctl` (PipeWire) or `pactl` (PulseAudio)

## Privacy

Peeky makes no network requests except checking this repository for a new release (which can be switched off).
Notifications, clipboard contents, notes and passwords stay on your computer.

## Build it yourself

```
cd src-tauri
cargo build --release
```

The result is a single `peeky.exe` (about 5 MB). The installer is `installer/island.nsi` (NSIS).
Every push is built by [GitHub Actions](.github/workflows/build.yml); a tag `vX.Y.Z` publishes a release.

## Platforms

- **Windows 10/11:** native Windows backend with WebView2.
- **Linux (Debian 12+, Ubuntu 22.04+, x86_64):** native GTK/WebKitGTK backend, packaged as DEB. X11 and Wayland are supported, with compositor-specific limitations.
- Linux media uses MPRIS/playerctl; volume uses PipeWire/wpctl or PulseAudio/pactl; password storage uses Secret Service; desktop integration uses XDG paths and autostart.

Linux now includes selected-region screenshots, Persian Text Grab, text-and-image clipboard history, media and volume controls, notes, timer, password vault, file shelf drag-out, Bluetooth and capture-activity indicators, audio visualisation and signed DEB updates. Exact availability depends on desktop helpers and compositor support. Wayland global shortcuts are not yet implemented; live notification integration is currently KDE Plasma-specific; active-window context is supported on X11, Sway and Hyprland, with GNOME Wayland still limited.

For the complete Persian setup guide, feature matrix, dependency list and troubleshooting steps, see [مستندات فارسی Peeky](docs/index.md) or the [documentation site](https://ahb1390.github.io/peeky/) (after GitHub Pages is enabled).

## License

[MIT](LICENSE). Bundles tesseract.js and Tesseract's Persian data (Apache 2.0).

---

<div dir="rtl">

## فارسی

**Peeky یک جزیرهٔ کوچک و زنده برای دسکتاپ است.** این فورک علاوه بر ویندوز، پشتیبانی لینوکس را نیز توسعه می‌دهد.

امکانات اصلی شامل پخش رسانه، اعلان‌ها، اسکرین‌شات ناحیه‌ای، استخراج متن فارسی از تصویر، تاریخچهٔ کلیپ‌بورد با پشتیبانی متن و تصویر، یادداشت سریع، خزانهٔ رمز، تایمر و نگهداری فایل‌ها است.

### نصب در لینوکس

بستهٔ DEB را از [Releases](https://github.com/ahb1390/peeky/releases) دریافت و نصب کنید:

~~~bash
sudo apt install ./peeky_VERSION_amd64.deb
~~~

بستهٔ رسمی برای Debian 12+ و Ubuntu 22.04+ روی x86_64 ساخته می‌شود. در Wayland بعضی امکانات به compositor و ابزارهای انتخاب‌گر تصویر وابسته‌اند؛ مستندات کامل، وابستگی‌ها، تفاوت X11 و Wayland و راه‌حل خطاهای رایج در راهنمای فارسی آمده است.

### مستندات

- [راهنمای کامل فارسی در مخزن](docs/index.md)
- [صفحهٔ مستندات فارسی](https://ahb1390.github.io/peeky/)
- [گزارش مشکل و پیشنهاد](https://github.com/ahb1390/peeky/issues)

</div>
