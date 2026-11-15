/* The page's only door to the Rust side: window.qazi */
(() => {
'use strict';
const { invoke } = window.__TAURI__.core, { listen } = window.__TAURI__.event;
const on = (ev) => (cb) => { listen(ev, (e) => cb(e.payload)); };
const quiet = (p) => p.catch(() => {});

// dropped files come without paths; the host turns the file objects back into paths
let dropSeq = 0;
const dropWait = new Map();
listen('drop-paths', (e) => { const done = dropWait.get(e.payload.token); if (done) { dropWait.delete(e.payload.token); done(e.payload.paths || []); } });

// Wayland does not expose a global pointer query. Send pointer coordinates only while the
// compositor has routed input to this surface; Rust restricts the idle input region to the pill.
let hostPlatform = '';
invoke('settings_get').then((settings) => {
  hostPlatform = settings && settings.platform || '';
  // A compact GTK input region lets the WebView receive pointer events only over visible
  // controls. DOM pointer events therefore work on X11 as well as Wayland, even when the
  // optional global X11 pointer watcher cannot start.
  if (hostPlatform === 'linux') {
    let lastCursorUpdate = 0;
    window.addEventListener('pointermove', (event) => {
      const now = performance.now();
      if (now - lastCursorUpdate < 24) return;
      lastCursorUpdate = now;
      quiet(invoke('cursor_update', { x: event.clientX, y: event.clientY }));
    }, { passive: true });
    window.addEventListener('pointerleave', () => {
      quiet(invoke('cursor_update', { x: -1000, y: -1000 }));
    }, { passive: true });
    requestAnimationFrame(() => pushLinuxInputRegion(false));
  }
}).catch(() => {});

// Return the union of the visible, interactive surfaces, not the 700x430 transparent
// WebView. The face, expanded view, open list and side notification remain clickable.
function inputRegions() {
  const island = document.getElementById('island');
  if (!island) return [{ x: 308, y: 0, width: 84, height: 44 }];

  const regions = [];
  const addRect = (rect, padding = 4) => {
    if (!rect || ![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)) return;
    const left = Math.max(0, Math.floor(rect.left - padding));
    const top = Math.max(0, Math.floor(rect.top - padding));
    const right = Math.min(window.innerWidth, Math.ceil(rect.right + padding));
    const bottom = Math.min(window.innerHeight, Math.ceil(rect.bottom + padding));
    if (right > left && bottom > top) {
      regions.push({ x: left, y: top, width: right - left, height: bottom - top });
    }
  };

  const islandRect = island.getBoundingClientRect();
  addRect(islandRect, 8);

  const activeView = island.classList.contains('tucked') ? null : island.querySelector('.view.on');
  let activeRect = null;
  if (activeView) {
    activeRect = activeView.getBoundingClientRect();
    addRect(activeRect, 6);

    // The Linux action strip is below the face. Keep only a narrow centre
    // corridor between them interactive, not the whole transparent gap.
    if (['tools', 'timer', 'input', 'gen'].includes(activeView.dataset.view)) {
      const center = (islandRect.left + islandRect.right) / 2;
      const top = islandRect.bottom - 3;
      const bottom = activeRect.top + 3;
      if (bottom > top) addRect({ left: center - 48, top, right: center + 48, bottom }, 0);
    }
  }

  const stack = document.getElementById('stack');
  if (stack && stack.classList.contains('open')) {
    const stackRect = stack.getBoundingClientRect();
    addRect(stackRect, 6);

    // Keep a slim path from the face/action strip into the stack. This lets the
    // pointer reach the list without making the full gap across the screen active.
    const fromBottom = activeView && ['tools', 'timer', 'input', 'gen'].includes(activeView.dataset.view) && activeRect
      ? activeRect.bottom
      : islandRect.bottom;
    const center = (islandRect.left + islandRect.right) / 2;
    const top = fromBottom - 3;
    const bottom = stackRect.top + 3;
    if (bottom > top && bottom - top < 120) {
      addRect({ left: center - 42, top, right: center + 42, bottom }, 0);
    }
  }

  const side = document.getElementById('side');
  if (side && side.classList.contains('on')) addRect(side.getBoundingClientRect(), 10);

  // Dedupe identical rectangles; Cairo will union overlaps while retaining gaps.
  const unique = new Map();
  for (const region of regions) {
    const key = [region.x, region.y, region.width, region.height].join(',');
    unique.set(key, region);
  }
  return [...unique.values()].slice(0, 12);
}

function inputBounds(regions = inputRegions()) {
  if (!regions.length) return { x: 308, y: 0, width: 84, height: 44 };
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const region of regions) {
    left = Math.min(left, region.x);
    top = Math.min(top, region.y);
    right = Math.max(right, region.x + region.width);
    bottom = Math.max(bottom, region.y + region.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

let inputUpdate = 0, activeInput = false, lastLinuxRegion = '';

function pushLinuxInputRegion(renew = false) {
  if (hostPlatform !== 'linux') return;
  const regions = inputRegions();
  const bounds = inputBounds(regions);
  const signature = JSON.stringify({ on: activeInput, regions });
  if (signature === lastLinuxRegion && !renew) return;
  lastLinuxRegion = signature;
  invoke('set_interactive', { on: activeInput, ...bounds, regions }).catch(() => {
    if (lastLinuxRegion === signature) lastLinuxRegion = '';
  });
}

window.qazi = {
  onCursor: on('cursor'), onHelper: on('helper'), onSettings: on('settings'), onClip: on('clip'), onDownload: on('download'),
  onShelf: on('shelf'), onShelfDragging: on('shelf-dragging'), onClips: on('clips'), onLevels: on('levels'),
  onPress: on('press'), onRelease: on('release'), onOpen: on('open'), onHotkey: on('hotkey'), onNotes: on('notes'), onVault: on('vault'), onOcr: on('ocr'), onOcrRead: on('ocr-read'), onSpeedo: on('speedo'),

  setInteractive: (v) => {
    activeInput = !!v;
    const seq = ++inputUpdate;
    requestAnimationFrame(() => {
      if (seq !== inputUpdate) return;
      if (hostPlatform === 'linux') {
        pushLinuxInputRegion(activeInput);
        return;
      }
      // Keep the Windows bridge contract unchanged.
      quiet(invoke('set_interactive', { on: activeInput }));
    });
  },
  refreshInputRegion: () => {
    if (hostPlatform === 'linux') pushLinuxInputRegion(false);
  },
  setTyping: (v, restore) => {
    const on = !!v;
    if (hostPlatform === 'linux') {
      activeInput = on;
      const regions = inputRegions();
      const bounds = inputBounds(regions);
      lastLinuxRegion = JSON.stringify({ on: activeInput, regions });
      return invoke('set_typing', { on, restore: !!restore, ...bounds, regions }).catch(() => {
        lastLinuxRegion = '';
        return {};
      });
    }
    return invoke('set_typing', { on, restore: !!restore }).catch(() => ({}));
  },
  lostClick: (info) => quiet(invoke('lost_click', { info: String(info) })),

  media: (cmd) => quiet(invoke('media', { cmd })),
  seek: (ms) => quiet(invoke('seek', { ms })),
  setVolume: (v) => quiet(invoke('set_volume', { v })),
  toggleMute: () => quiet(invoke('toggle_mute')),
  setViz: (v) => quiet(invoke('set_viz', { on: !!v })),

  activate: (id, aumid) => quiet(invoke('notif_act', { id: String(id), aumid: aumid || '' })),
  dismiss: (id) => quiet(invoke('notif_dismiss', { id: String(id) })),
  clearNotifs: () => quiet(invoke('notif_clear')),
  hintShown: () => quiet(invoke('settings_set', { key: 'dndHint', value: true })),

  pathsFor(files) {
    return new Promise((resolve) => {
      const list = [...files];
      if (!list.length || !(window.chrome && chrome.webview && chrome.webview.postMessageWithAdditionalObjects)) { resolve(list.map(() => '')); return; }
      const token = 'd' + (++dropSeq);
      dropWait.set(token, resolve);
      setTimeout(() => { if (dropWait.delete(token)) resolve(list.map(() => '')); }, 1500);
      try { chrome.webview.postMessageWithAdditionalObjects('island-drop:' + token, list); } catch { dropWait.delete(token); resolve(list.map(() => '')); }
    });
  },
  shelfAdd: (paths) => invoke('shelf_add', { paths }),
  shelfAddData: (name, type, buf) => invoke('shelf_add_data', new Uint8Array(buf), { headers: { 'x-name': encodeURIComponent(name || ''), 'x-type': encodeURIComponent(type || '') } }),
  shelfAddUrl: (url) => invoke('shelf_add_url', { url }),
  shelfGet: () => invoke('shelf_get'),
  shelfRemove: (path) => quiet(invoke('shelf_remove', { path })),
  shelfClear: () => quiet(invoke('shelf_clear')),
  shelfReveal: (path) => quiet(invoke('shelf_reveal', { path })),
  shelfDrag: (paths) => quiet(invoke('shelf_drag', { paths })),
  openDownload: (path) => quiet(invoke('open_download', { path })),

  clipsGet: () => invoke('clips_get'),
  clipCopy: (id) => quiet(invoke('clip_copy', { id })),
  clipPin: (id) => quiet(invoke('clip_pin', { id })),
  clipRemove: (id) => quiet(invoke('clip_remove', { id })),
  clipsClear: () => quiet(invoke('clips_clear')),
  copy: (text) => quiet(invoke('copy_text', { text })),

  getSettings: () => invoke('settings_get'),
  setSetting: (key, value) => quiet(invoke('settings_set', { key, value })),
  setCalendar: (value) => quiet(invoke('settings_set', { key: 'calendar', value })),
  action: (name) => quiet(invoke('action', { name })),
  ocrDone: (text, conf) => quiet(invoke('ocr_done', { text: String(text || ''), conf: Number(conf) || 0 })),
  speedo: (cmd, more) => invoke('speedo_cmd', { cmd, ...(more || {}) }).catch(() => ({ ok: false })),
  updateCheck: () => invoke('update_check').catch(() => 'failed'),
  updateInstall: () => invoke('update_install').catch(() => false),
  openUrl: (url) => quiet(invoke('open_url', { url })),

  notesGet: () => invoke('notes_get'),
  noteSave: (id, text, remind) => invoke('note_save', { id: id || null, text, remind: remind || 0 }),
  notePin: (id) => invoke('note_pin', { id }),
  noteFired: (id) => invoke('note_fired', { id }),
  noteRemove: (id) => invoke('note_remove', { id }),

  vaultList: () => invoke('vault_list'),
  vaultGenerate: (len, symbols) => invoke('vault_generate', { len, symbols: !!symbols }),
  vaultSave: (site, user, pass) => invoke('vault_save', { site, user, pass }).catch(() => 0),     // the new entry's id, 0 = not saved
  vaultEdit: (id, site, user) => invoke('vault_edit', { id, site, user }).catch(() => false),
  fgContext: () => invoke('fg_context').catch(() => ({})),
  vaultCopy: (id, what) => invoke('vault_copy', { id, what }),
  copySecret: (text) => invoke('copy_secret', { text }),
  vaultReveal: (id) => invoke('vault_reveal', { id }),
  vaultRemove: (id) => invoke('vault_remove', { id }),
};
window.addEventListener('error', (e) => quiet(invoke('debug_out', { text: '[page error] ' + e.message + ' @' + e.lineno })));
})();
