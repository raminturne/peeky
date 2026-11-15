/* Qazi Island — renderer (single-line pill; the only thing that ever drops below it is the notification stack) */
(() => {
'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const island = $('#island'), glow = $('#glow'), stackEl = $('#stack'), stackList = $('#stack-list'), stackHead = $('#stack-head');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------ icons
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
  play: '<path fill="currentColor" d="M8 5.2v13.6a1 1 0 0 0 1.5.9l11-6.8a1 1 0 0 0 0-1.8l-11-6.8A1 1 0 0 0 8 5.2z"/>',
  pause: '<rect fill="currentColor" x="6" y="5" width="4.4" height="14" rx="1.2"/><rect fill="currentColor" x="13.6" y="5" width="4.4" height="14" rx="1.2"/>',
  next: '<path fill="currentColor" d="M5 6.3v11.4a.8.8 0 0 0 1.3.7l8-5.7a.8.8 0 0 0 0-1.4l-8-5.7A.8.8 0 0 0 5 6.3z"/><rect fill="currentColor" x="16.5" y="5.5" width="2.6" height="13" rx="1.2"/>',
  prev: '<path fill="currentColor" d="M19 6.3v11.4a.8.8 0 0 1-1.3.7l-8-5.7a.8.8 0 0 1 0-1.4l8-5.7a.8.8 0 0 1 1.3.7z"/><rect fill="currentColor" x="4.9" y="5.5" width="2.6" height="13" rx="1.2"/>',
  volume: `<path fill="currentColor" d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/><path ${S} d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/>`,
  muted: `<path fill="currentColor" d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/><path ${S} d="M16 9.5l5 5M21 9.5l-5 5"/>`,
  shot: `<path ${S} d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle ${S} cx="12" cy="12" r="2.6"/>`,
  clipboard: `<rect ${S} x="6" y="5" width="12" height="15.5" rx="2.5"/><path ${S} d="M9.5 5V4.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V5M9.2 11h5.6M9.2 15h3.4"/>`,
  pin: `<path ${S} d="M9 4h6l-1 6 3 3.5H7L10 10zM12 13.5V20"/>`,
  pinned: `<path fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M9 4h6l-1 6 3 3.5H7L10 10z"/><path ${S} d="M12 13.5V20"/>`,
  timer: `<circle ${S} cx="12" cy="13.5" r="7"/><path ${S} d="M12 10v3.5l2.2 1.6M9.5 3h5"/>`,
  bell: `<path ${S} d="M9.5 19.5a2.6 2.6 0 0 0 5 0M6 16.5h12c-1-1.3-1.6-2.6-1.6-5V10a4.4 4.4 0 0 0-8.8 0v1.5c0 2.4-.6 3.7-1.6 5z"/>`,
  close: `<path ${S} d="M7 7l10 10M17 7L7 17"/>`,
  more: '<circle fill="currentColor" cx="5.5" cy="12" r="1.9"/><circle fill="currentColor" cx="12" cy="12" r="1.9"/><circle fill="currentColor" cx="18.5" cy="12" r="1.9"/>',
  minus: `<path ${S} d="M6 12h12"/>`,
  plus: `<path ${S} d="M6 12h12M12 6v12"/>`,
  reset: `<path ${S} d="M5 12a7 7 0 1 0 2.2-5.1M5 5v4h4"/>`,
  note: '<path fill="currentColor" d="M10 4v10.2a3.2 3.2 0 1 0 2 3V8h5V4z"/>',
  copy: `<rect ${S} x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path ${S} d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>`,
  image: `<rect ${S} x="4" y="5" width="16" height="14" rx="3"/><circle ${S} cx="9" cy="10" r="1.6"/><path ${S} d="M5 17l4.5-4 3.5 3 2.5-2 3.5 3"/>`,
  file: `<path ${S} d="M7 3.5h6.5L18 8v10.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2zM13 3.5V8h5"/>`,
  tray: `<path ${S} d="M4 13l2.2-7a2 2 0 0 1 1.9-1.4h7.8A2 2 0 0 1 17.8 6L20 13v4.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 13h4.5l1 2.5h5l1-2.5H20"/>`,
  download: `<path ${S} d="M12 4v10.5M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>`,
  bolt: '<path fill="currentColor" d="M13.2 2.5L5.6 13.2a.6.6 0 0 0 .5.95h4.6l-1 7.1a.4.4 0 0 0 .72.3l7.6-10.7a.6.6 0 0 0-.5-.95h-4.6l1-7.1a.4.4 0 0 0-.72-.3z"/>',
  plug: `<path ${S} d="M9 3v5M15 3v5M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0zM12 17v4"/>`,
  bluetooth: `<path ${S} d="M7 7.5l10 9-5 4v-17l5 4-10 9"/>`,
  headphones: `<path ${S} d="M5 16v-3.5a7 7 0 0 1 14 0V16"/><rect ${S} x="4" y="14" width="4" height="6" rx="1.8"/><rect ${S} x="16" y="14" width="4" height="6" rx="1.8"/>`,
  jot: `<path ${S} d="M6 4h12a2 2 0 0 1 2 2v8l-6 6H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM20 14h-4a2 2 0 0 0-2 2v4M8 9h8M8 13h4"/>`,
  key: `<circle ${S} cx="8.5" cy="15.5" r="4"/><path ${S} d="M11.5 12.5L20 4M16.5 7.5l2.5 2.5M14 10l2 2"/>`,
  check: `<path ${S} d="M5 12.5l4.5 4.5L19 7.5"/>`,
  eye: `<path ${S} d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle ${S} cx="12" cy="12" r="2.6"/>`,
  user: `<circle ${S} cx="12" cy="8.5" r="3.6"/><path ${S} d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.200 1.900 7 5.5"/>`,
  scan: `<path ${S} d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M8.5 9.5h7M12 9.5v6"/>`,
  wifi: `<path ${S} d="M4.5 10a11 11 0 0 1 15 0M7.5 13.2a6.6 6.6 0 0 1 9 0"/><circle fill="currentColor" cx="12" cy="17" r="1.6"/>`,
  wifioff: `<path ${S} d="M4.5 10a11 11 0 0 1 15 0M7.5 13.2a6.6 6.6 0 0 1 9 0M5 4l14 16"/><circle fill="currentColor" cx="12" cy="17" r="1.6"/>`,
  shield: `<path ${S} d="M12 3.5l7 2.6v5.4c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6.1z"/><path ${S} d="M9 12l2.2 2.2 3.8-4.2"/>`,
  mic: `<rect ${S} x="9.2" y="3.5" width="5.6" height="10.5" rx="2.8"/><path ${S} d="M6 11.5a6 6 0 0 0 12 0M12 17.5v3"/>`,
  cam: `<rect ${S} x="3.5" y="7" width="12" height="10" rx="2.5"/><path ${S} d="M15.5 10.5l5-2.5v8l-5-2.5"/>`,
  link: `<path ${S} d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`,
  calc: `<rect ${S} x="5" y="3.5" width="14" height="17" rx="2.5"/><path ${S} d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/>`,
  cal: `<rect ${S} x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path ${S} d="M4 10h16M8.5 3.5V7M15.5 3.5V7"/>`,
  drop: '<path fill="currentColor" d="M12 3.5c3.2 3.9 5.5 6.7 5.5 9.800a5.500 5.500 0 0 1-11 0c0-3.100 2.300-5.900 5.500-9.800z"/>',
  search: `<circle ${S} cx="10.5" cy="10.5" r="6"/><path ${S} d="M15 15l5 5"/>`,
  edit: `<path ${S} d="M4.5 19.5h4l10-10-4-4-10 10zM13 7l4 4"/>`,
  gear: `<circle ${S} cx="12" cy="12" r="2.8"/><path ${S} d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M18 6l-1.6 1.6M7.6 16.4L6 18"/>`,
};
const svg = (name) => `<svg viewBox="0 0 24 24">${ICONS[name] || ''}</svg>`;
const setIcon = (el, name) => { if (el.dataset.cur !== name) { el.innerHTML = svg(name); el.dataset.cur = name; } };
$$('[data-icon]').forEach((el) => setIcon(el, el.dataset.icon));
const badge = document.createElement('i'); badge.className = 'badge'; $('#t-inbox').appendChild(badge);
const shelfBadge = document.createElement('i'); shelfBadge.className = 'badge quiet'; $('#t-shelf').appendChild(shelfBadge);
const gearBadge = document.createElement('i'); gearBadge.className = 'badge dot'; gearBadge.title = 'An update is ready'; $('#t-gear').appendChild(gearBadge);

// ------------------------------------------------------------ state
const st = {
  hover: false, enteredAt: 0, leftAt: 0, picking: false,
  manual: null,                 // 'tools' | 'timer' chosen by the user while hovering
  notif: null, queue: [], notifEndsAt: 0,
  history: [], unseen: 0, stackOpen: false,       // mirrors the Windows notification center
  stackKind: 'notifs',                             // what the stack under the pill lists: 'notifs' | 'files' | 'clips'
  clips: [],                                       // clipboard history (previews; the full texts stay in the main process)
  dragOut: false,                                  // a shelf file is being dragged out right now
  hudUntil: 0,                                     // short status line (copied / charger / Bluetooth / files held)
  shelf: [], dragAt: 0,                            // files parked on the pill; dragAt = a file is being dragged over it
  scrubbing: false,
  volUntil: 0, volSeen: false, vol: 50, mute: false, volLocalAt: 0,
  media: { active: false, playing: false, title: '', artist: '', pos: 0, dur: 0, at: 0, key: '', video: false },
  pausedAt: 0, force: null,
  // menu mode: while music plays the pill behaves like the normal clock/menu instead of the player,
  // and stays that way until the user switches back to the track
  menuMode: false,
  // settings
  autoHide: true, hideVideo: true, calendar: 'gregorian', deviceAlerts: true, shelfOn: true, visuals: true,
  // auto-hide: tuck above the screen edge while an app window sits underneath (always for fullscreen apps)
  covered: false, full: false, tucked: false, peekSince: 0, revealUntil: 0,
  typing: false, holdUntil: 0,                     // a text field is open on the pill / something opened from outside stays put
  parked: false,                                   // a password step waits on the pill while the user works in another window
  keys: false,                                     // a search box under the pill holds the keyboard
  face: 'eyes', settings: {}, notes: [], vault: { items: [] }, ctx: {}, lastUser: '',
  vaultQ: '', vaultSel: 0,                         // the search over saved passwords, and the row Enter would copy
  gen: { pass: '', len: 18, symbols: true },
  skin: 'black', musicTheme: 'sky',                // what the pill wears at rest / while music plays
  net: { online: true, vpn: '', proxy: false }, sensors: { mic: [], cam: [] },
  smartCopy: true, hudAct: null, muteClipUntil: 0, react: true,
};
// the window takes the mouse only while the cursor is on the island (or a text field is open)
let mouseSent = null;
function syncMouse(force) {
  const want = st.hover || (st.typing && !st.parked) || st.dragOut;
  if (force || want !== mouseSent) { mouseSent = want; window.qazi.setInteractive(want); }
}
setInterval(() => syncMouse(true), 500);      // repeated, so one lost message can never leave the pill unclickable
const timer = { left: 25 * 60000, endAt: 0, running: false, done: false };
const views = Object.fromEntries($$('.view').map((v) => [v.dataset.view, v]));
let cur = 'idle';

// The idle face is a real activation target on Linux. This is also the fallback when a
// compositor or X11 pointer watcher does not deliver global hover updates after relaunch.
island.addEventListener('click', (event) => {
  if (st.settings.platform !== 'linux' || cur !== 'idle' || st.tucked) return;
  if (event.target.closest('button, input, a, .row')) return;
  st.hover = true;
  st.manual = 'tools';
  st.enteredAt = Date.now() - 200;
  st.leftAt = 0;
  syncMouse(true);
  render();
});

// music counts only when it is not a video and nothing is running fullscreen (a film, a game)
const musicOn = () => st.media.active && !(st.hideVideo && (st.media.video || st.full));

function pickView() {
  const now = Date.now();
  if (st.force) return st.force;
  // Text entry and password generation must be able to temporarily cover a running
  // timer. The countdown keeps using endAt and returns to the pill when the prompt ends.
  if (st.typing) return 'input';
  if (st.manual === 'gen') return 'gen';
  if (st.manual === 'timer' || timer.running) return 'timer';
  if (dragging()) return 'drop';
  if (st.notif) return 'notif';
  if (now < st.volUntil) return 'vol';
  if (now < st.hudUntil) return 'hud';
  if (st.manual) return st.manual;
  if (st.shelfOn && st.shelf.length) return 'held';      // held files stay on the pill until they are taken out
  const m = st.media;
  if (musicOn() && !st.menuMode && (m.playing || now - st.pausedAt < 12000)) return 'media';
  // Linux keeps the tiny animated face idle on hover. Open the action panel only after
  // an intentional click; Windows preserves its original hover-to-expand interaction.
  if (st.settings.platform !== 'linux' && st.hover && now - st.enteredAt > 130) return 'tools';
  if ((st.hover || now - st.leftAt < 380) && cur === 'tools') return 'tools';
  return 'idle';
}
const dragging = () => st.shelfOn && Date.now() - st.dragAt < 350;
function updateTuck() {
  const now = Date.now();
  const want = !st.force && (st.full || (st.autoHide && st.covered));
  // dwelling on the very top edge of the screen peeks the island back out
  if (want && st.tucked && st.peekSince && now - st.peekSince > 220) { st.revealUntil = now + 1400; st.peekSince = 0; }
  const reveal = st.notif || now < st.volUntil || now < st.hudUntil || dragging() || st.dragOut || st.scrubbing || st.hover || st.typing || timer.running || (st.shelfOn && st.shelf.length && !st.full) || st.stackOpen || st.manual === 'gen' || now < st.revealUntil || now < st.holdUntil || (!st.tucked && now - st.leftAt < 900);   // a running timer stays on screen, fullscreen or not
  const tucked = !!(want && !reveal);
  island.classList.toggle('full', st.full);
  if (tucked !== st.tucked) {
    st.tucked = tucked;
    island.classList.toggle('tucked', tucked);
    glow.classList.toggle('off', tucked);
    if (tucked && st.hover) { st.hover = false; island.classList.remove('hover'); syncMouse(); }
    if (!tucked) evalHover(st.cx, st.cy);    // the cursor may already be resting where the pill lands
  }
}
function render() {
  // nothing closes while a file is on its way out, while typing, or right after it was opened from the tray / a shortcut
  const now = Date.now(), away = !st.hover && !st.dragOut && !st.typing && now > st.holdUntil;
  // the password list and a fresh password stay until the user closes them: they are used together with another window
  if (st.stackOpen && st.stackKind !== 'vault' && away && now - st.leftAt > 650) setStack(false);
  if (away && !st.stackOpen && now - st.leftAt > 380 && st.manual !== 'gen') st.manual = null;
  const viz = st.media.playing && musicOn() && st.visuals;
  if (viz !== st.vizOn) { st.vizOn = viz; window.qazi.setViz(viz); }
  updateTuck();
  if (!st.tucked && st.cx !== undefined) hoverNow();      // the pill may have grown or shrunk under a resting cursor
  island.classList.toggle('dropping', dragging());
  if (st.tucked) {
    if (island.dataset.w !== 'tuck') { island.dataset.w = 'tuck'; island.style.width = '56px'; }
    window.qazi.refreshInputRegion?.();
    return;
  }
  const v = pickView();
  if (v !== cur) {
    views[cur].classList.remove('on');
    views[v].classList.add('on');
    cur = v;
  }
  // On Linux the action strip is a drop-down under the small face, not a 600px-wide
  // bar across the browser's tab row. Windows keeps the original expanding-pill layout.
  const linuxTools = st.settings.platform === 'linux' && cur === 'tools';
  const linuxTimer = st.settings.platform === 'linux' && cur === 'timer';
  const linuxInput = st.settings.platform === 'linux' && cur === 'input';
  const linuxGen = st.settings.platform === 'linux' && cur === 'gen';
  const linuxPopover = linuxTools || linuxTimer || linuxInput || linuxGen;
  island.classList.toggle('tools-open', linuxTools);
  island.classList.toggle('timer-open', linuxTimer);
  island.classList.toggle('input-open', linuxInput);
  island.classList.toggle('gen-open', linuxGen);
  document.body.classList.toggle('linux-tools-open', linuxTools);
  document.body.classList.toggle('linux-timer-open', linuxTimer);
  document.body.classList.toggle('linux-input-open', linuxInput);
  const w = linuxPopover ? 84 : clamp(Math.ceil(views[cur].offsetWidth), 70, 600);
  if (island.dataset.w !== String(w)) {
    island.dataset.w = w;
    island.style.width = w + 'px';
    glow.style.width = w + 50 + 'px'; glow.style.marginLeft = -(w + 50) / 2 + 'px';
    if (sideN) placeSide();
  }
  window.qazi.refreshInputRegion?.();
}
setInterval(render, 70);

// ------------------------------------------------------------ cursor: hover + click-through
window.qazi.onCursor(({ x, y }) => { st.cx = x; st.cy = y; evalHover(x, y); });
function evalHover(x, y) {
  if (x === undefined) return;
  if (st.tucked) {     // stay click-through; only a deliberate rest on the top edge brings it back
    const inZone = Math.abs(x - window.innerWidth / 2) < 60 && y <= 2;
    if (!inZone) st.peekSince = 0; else if (!st.peekSince) st.peekSince = Date.now();
    return;
  }
  if (hoverNow()) render();
}
function hoverNow() {
  const x = st.cx, y = st.cy, r = island.getBoundingClientRect();
  let inside = x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 10 && y <= r.bottom + 8;
  const activeView = island.querySelector('.view.on');
  const activeRect = activeView && activeView.getBoundingClientRect();
  if (!inside && activeRect && activeView.dataset.view !== 'idle') {
    inside = x >= activeRect.left - 6 && x <= activeRect.right + 6
      && y >= activeRect.top - 6 && y <= activeRect.bottom + 6;
  }
  if (!inside && st.stackOpen) {
    const s = stackEl.getBoundingClientRect();
    const center = (r.left + r.right) / 2;
    const fromBottom = activeView && ['tools', 'timer', 'input', 'gen'].includes(activeView.dataset.view) && activeRect
      ? activeRect.bottom
      : r.bottom;
    const inStack = x >= s.left - 6 && x <= s.right + 6
      && y >= s.top - 6 && y <= s.bottom + 10;
    const inConnector = x >= center - 48 && x <= center + 48
      && y >= fromBottom - 6 && y <= s.top + 6;
    inside = inStack || inConnector;
  }
  if (!inside && sideN) { const s = side.getBoundingClientRect(); inside = x >= s.left - 10 && x <= s.right + 6 && y >= s.top - 8 && y <= s.bottom + 8; }
  if (inside === st.hover || st.dragOut) return false;       // mid-drag the window must not switch to click-through
  st.hover = inside;
  island.classList.toggle('hover', inside && !st.stackOpen && !st.typing);
  syncMouse();
  if (inside) st.enteredAt = Date.now(); else st.leftAt = Date.now();
  return true;
}

// Every press that Windows delivers to the island is announced here too. If the page's own event for it never
// arrives (it has happened: the pill looked alive but ignored clicks), the click is carried out anyway.
let lastDown = 0, lostClicks = 0;
document.addEventListener('pointerdown', (event) => {
  lastDown = performance.now();
  // A stationary pointer may not produce pointermove after startup. Treat a direct
  // click on the idle face as an explicit request to open the action strip.
  if (st.tucked || st.hover || !island.contains(event.target)) return;
  st.cx = event.clientX;
  st.cy = event.clientY;
  st.hover = true;
  st.enteredAt = Date.now() - 140;
  island.classList.add('hover');
  syncMouse();
  render();
}, true);
window.qazi.onPress(({ x, y }) => {
  const at = performance.now();
  setTimeout(() => {
    if (Math.abs(lastDown - at) < 700 || st.dragOut) return;
    const el = document.elementFromPoint(x, y);
    window.qazi.lostClick(`#${++lostClicks} at ${Math.round(x)},${Math.round(y)} on ${el ? el.tagName + '#' + el.id : 'nothing'} view=${cur}`);
    const target = el && el.closest('button, .row, [data-view="notif"], [data-view="vol"], [data-view="hud"], .hf, #side, #t-date, input');
    if (target) { if (target.tagName === 'INPUT') target.focus(); else target.click(); }
  }, 260);
});
window.qazi.onRelease(() => { setTimeout(() => { if (st.scrubbing) endScrub(true); }, 120); });   // a scrub whose mouse-up went elsewhere

function bump() { island.classList.remove('bump'); void island.offsetWidth; island.classList.add('bump'); }
let flashT = 0;
function flash(text, color) {
  const f = $('#flash');
  f.textContent = '';
  if (color) { const i = document.createElement('i'); i.style.background = color; f.appendChild(i); }
  f.appendChild(document.createTextNode(text));
  f.classList.add('on');
  clearTimeout(flashT);
  flashT = setTimeout(() => f.classList.remove('on'), 1600);
}

// ------------------------------------------------------------ scrolling text
// A line that does not fit travels to its end and back, forever, so it can be read in full.
// Returns how long one pass takes (ms), or 0 when the text already fits.
function stopMarquee(box) {
  if (box._anim) { box._anim.cancel(); box._anim = null; }
  box.classList.remove('mq-on');
}
function startMarquee(box, brisk) {
  stopMarquee(box);
  const inner = box.firstElementChild;
  if (!inner || box.scrollWidth - box.clientWidth < 6) return 0;
  box.classList.add('mq-on');
  const over = inner.offsetWidth - box.clientWidth;
  if (over < 1) { stopMarquee(box); return 0; }
  const rtl = getComputedStyle(box).direction === 'rtl';      // Persian / Arabic text starts at the right
  const pass = over / (brisk ? 85 : 42) * 1000, pause = brisk ? 550 : 1100, D = pass + pause * 2;
  const to = `translateX(${rtl ? over : -over}px)`;
  box._anim = inner.animate([
    { transform: 'translateX(0)', offset: 0 }, { transform: 'translateX(0)', offset: pause / D },
    { transform: to, offset: 1 - pause / D }, { transform: to, offset: 1 },
  ], { duration: D, iterations: Infinity, direction: 'alternate', easing: 'linear' });
  return pass + pause;
}

// ------------------------------------------------------------ status line (copied / charger / Bluetooth / files held)
function showHud(icon, title, text, ms, tone) {
  if (st.hideVideo && st.full) return;            // never interrupt a fullscreen film or game for this
  const ic = $('#h-icon');
  ic.innerHTML = svg(icon); ic.dataset.cur = icon; ic.className = 'glyph' + (tone ? ' ' + tone : ''); ic.style.color = '';
  st.hudAct = null; views.hud.classList.remove('act');
  $('#h-title').textContent = title || '';
  const box = $('#h-text');
  stopMarquee(box);
  box.firstElementChild.textContent = text || '';
  box.classList.toggle('empty', !text);
  st.hudUntil = Date.now() + (ms || 1700);
  render();
  startMarquee(box, true);
}

// some status lines can be clicked (open the copied link, copy the answer of a sum)
views.hud.addEventListener('click', () => {
  const a = st.hudAct;
  if (!a) return;
  st.hudAct = null; st.hudUntil = 0; a(); render();
});

// ------------------------------------------------------------ notifications (same line, then back)
function showNotif(n) {
  if (!n.title && !n.body) return;
  st.queue.push(n);
  if (st.queue.length > 6) st.queue.shift();
  if (!st.notif && !sideN) nextNotif();
}
function paintIcon(el, n) {
  if (n.icon) { el.style.backgroundImage = `url(data:image/png;base64,${n.icon})`; el.textContent = ''; }
  else { el.style.backgroundImage = ''; el.textContent = (n.app || n.title || '•').trim().charAt(0).toUpperCase(); }
}
// While the pill is being used (its menu, a list under it, a text field), a notification must not take the pill
// away from under the cursor: it shows as a small chip beside the pill instead. Click the chip to open it.
const side = $('#side');
let sideN = null, sideT = 0;
const inUse = () => !st.tucked && (st.stackOpen || st.typing || !!st.manual || (st.hover && cur === 'tools'));
function placeSide() {
  const w = island.clientWidth;
  side.style.left = `calc(50% + ${w / 2 + 8}px)`;
  side.style.maxWidth = Math.max(30, 350 - w / 2 - 14) + 'px';
}
function sideShow(n) {
  sideN = n;
  paintIcon(side.firstElementChild, n);
  side.lastElementChild.textContent = n.title || n.body || n.app || '';
  side.title = [n.app, n.title, n.body].filter(Boolean).join(' — ');
  placeSide(); side.classList.add('on');
  clearTimeout(sideT); sideT = setTimeout(sideHide, n.long ? 8000 : st.notifMs || 4000);
}
function sideHide() {
  clearTimeout(sideT); side.classList.remove('on'); sideN = null;
  if (st.queue.length) setTimeout(nextNotif, 350);
}
side.addEventListener('click', () => {
  const n = sideN;
  if (n) {
    if (n.action === 'dnd') window.qazi.action('dnd');
    else if (n.action === 'download') window.qazi.openDownload(n.path);
    else if (n.action === 'update') installUpdate();
    else if (n.action === 'whatsnew') window.qazi.openUrl('https://github.com/raminturne/peeky/releases/tag/v' + n.version);
    else if (n.action === 'note') { st.holdUntil = Date.now() + 5000; setStack(true, 'notes'); }
    else if (n.action === 'tour') { st.holdUntil = Date.now() + 9000; st.revealUntil = Date.now() + 9000; setStack(true, 'tour'); }
    else if (n.aumid) { window.qazi.activate(n.id, n.aumid); dropHistory(n.id); }
  }
  sideHide();
});
function nextNotif() {
  const n = st.queue.shift();
  if (!n) return;
  if (inUse()) { sideShow(n); return; }
  paintIcon($('#n-icon'), n);
  $('#n-app').textContent = n.app && n.app !== n.title ? n.app : '';
  $('#n-title').textContent = n.title || '';
  const box = $('#n-body'), body = (n.body || '').replace(/\s+/g, ' ').trim();
  stopMarquee(box);
  box.firstElementChild.textContent = body;
  box.classList.toggle('empty', !body);
  st.notif = n;
  bump(); render();
  startMarquee(box, true);                 // long text travels while it is up, but never keeps the notification up
  const base = st.notifMs || 4000;
  st.notifEndsAt = Date.now() + (n.long ? Math.max(base, 8000) : st.queue.length ? Math.min(base, 2800) : base);
  st.notifHovered = false;
}
function endNotif() {
  st.notif = null;
  render();
  setTimeout(() => { if (!st.notif) stopMarquee($('#n-body')); }, 400);
  if (st.queue.length) setTimeout(nextNotif, 380);
}
setInterval(() => {
  if (!st.notif) return;
  if (st.hover) { st.notifHovered = true; return; }             // resting the cursor on it holds it
  if (st.notifHovered) { st.notifHovered = false; st.notifEndsAt = Math.min(st.notifEndsAt, Date.now() + 450); }   // let go: it leaves right away
  if (Date.now() > st.notifEndsAt) endNotif();
}, 120);
// click = what a click on the real Windows notification does (open that chat / page), then dismiss
views.notif.addEventListener('click', () => {
  const n = st.notif;
  if (n) {
    if (n.action === 'dnd') window.qazi.action('dnd');
    else if (n.action === 'download') window.qazi.openDownload(n.path);
    else if (n.action === 'update') installUpdate();
    else if (n.action === 'whatsnew') window.qazi.openUrl('https://github.com/raminturne/peeky/releases/tag/v' + n.version);
    else if (n.action === 'note') { st.holdUntil = Date.now() + 5000; setStack(true, 'notes'); }
    else if (n.action === 'tour') { st.holdUntil = Date.now() + 9000; st.revealUntil = Date.now() + 9000; setStack(true, 'tour'); }
    else if (n.aumid) { window.qazi.activate(n.id, n.aumid); dropHistory(n.id); }
  }
  endNotif();
});

async function installUpdate() {
  const ok = await window.qazi.updateInstall();
  if (!ok) {
    showHud('alert', 'Update not installed', 'Check the administrator prompt and system package manager', 4200, 'faded');
  }
}
// ------------------------------------------------------------ notification stack
function updateBadge() {       // the count lives on the bell inside the menu only — nothing is added next to the clock
  badge.textContent = st.unseen > 9 ? '9+' : st.unseen;
  badge.classList.toggle('on', st.unseen > 0);
}
const rel = (ts) => {
  const m = Math.floor((Date.now() - ts) / 60000);
  return m < 1 ? 'now' : m < 60 ? m + 'm' : m < 1440 ? Math.floor(m / 60) + 'h' : Math.floor(m / 1440) + 'd';
};
function renderFiles() {
  $('#stack-clear').textContent = 'Clear shelf';
  $('#stack-clear').classList.toggle('hidden', !st.shelf.length);
  if (!st.shelf.length) {
    const e = document.createElement('div'); e.className = 'row empty wide'; e.textContent = 'Drop files on the pill to hold them';
    stackList.appendChild(e); return;
  }
  st.shelf.forEach((f, i) => {
    const row = document.createElement('div'); row.className = 'row file'; row.style.setProperty('--i', Math.min(i, 6));
    row.draggable = true; row.title = 'Drag this out to drop the file somewhere — click to show it in its folder';
    const ic = document.createElement('div'); ic.className = 'ic plain';
    if (f.icon) ic.style.backgroundImage = `url(data:image/png;base64,${f.icon})`; else ic.innerHTML = svg('file');
    const box = document.createElement('span'); box.className = 'mqbox'; box.dir = 'auto';
    const mq = document.createElement('span'); mq.className = 'mq';
    const b = document.createElement('b'); b.textContent = f.name; mq.appendChild(b);
    box.appendChild(mq);
    const x = document.createElement('button'); x.className = 'x show'; x.title = 'Take off the shelf (the file itself is not touched)'; x.innerHTML = svg('close');
    row.append(ic, box, x);
    row.addEventListener('mouseenter', () => startMarquee(box));
    row.addEventListener('mouseleave', () => stopMarquee(box));
    row.addEventListener('dragstart', (e) => { e.preventDefault(); window.qazi.shelfDrag([f.path]); });
    row.addEventListener('click', () => window.qazi.shelfReveal(f.path));
    x.addEventListener('click', (e) => { e.stopPropagation(); window.qazi.shelfRemove(f.path); });
    stackList.appendChild(row);
  });
}
function renderClips() {
  const loose = st.clips.filter((c) => !c.pinned).length;
  $('#stack-clear').textContent = 'Clear history';
  $('#stack-clear').classList.toggle('hidden', !loose);
  if (!st.clips.length) {
    const e = document.createElement('div'); e.className = 'row empty wide'; e.textContent = 'Whatever you copy shows up here';
    stackList.appendChild(e); return;
  }
  st.clips.forEach((c, i) => {
    const row = document.createElement('div'); row.className = 'row clip' + (c.pinned ? ' pinned' : ''); row.style.setProperty('--i', Math.min(i, 6));
    row.title = 'Click to copy it again';
    const pin = document.createElement('button'); pin.className = 'pin'; pin.title = c.pinned ? 'Unpin' : 'Pin (kept on top, and after a restart)'; pin.innerHTML = svg(c.pinned ? 'pinned' : 'pin');
    const box = document.createElement('span'); box.className = 'mqbox'; box.dir = 'auto';
    const mq = document.createElement('span'); mq.className = 'mq'; mq.textContent = c.preview + (c.len > c.preview.length + 20 ? '…' : '');
    box.appendChild(mq);
    const tm = document.createElement('span'); tm.className = 'tm dim';
    const x = document.createElement('button'); x.className = 'x'; x.title = 'Remove'; x.innerHTML = svg('close');
    if (c.kind === 'image') {       // a copied picture: its thumbnail and size
      const im = document.createElement('img'); im.className = 'thumb'; im.src = 'data:image/png;base64,' + c.thumb; im.draggable = false;
      box.classList.add('dim'); tm.innerHTML = '';
      row.append(pin, im, box, tm, x);
    } else {
      tm.textContent = c.len > 999 ? Math.round(c.len / 1000) + 'k' : c.len; tm.title = c.len + ' characters';
      row.append(pin, box, tm, x);
    }
    row.addEventListener('mouseenter', () => startMarquee(box));
    row.addEventListener('mouseleave', () => stopMarquee(box));
    row.addEventListener('click', () => { window.qazi.clipCopy(c.id); flash('Copied — paste with Ctrl+V'); });
    pin.addEventListener('click', (e) => { e.stopPropagation(); window.qazi.clipPin(c.id); });
    x.addEventListener('click', (e) => { e.stopPropagation(); window.qazi.clipRemove(c.id); });
    stackList.appendChild(row);
  });
}
function setClips(list) {
  st.clips = Array.isArray(list) ? list : [];
  if (st.stackOpen && st.stackKind === 'clips') { const y = stackList.scrollTop; renderStack(); stackList.scrollTop = y; }
}
window.qazi.onClips(setClips);
window.qazi.clipsGet().then(setClips);

function renderStack() {
  stackList.textContent = '';
  if (st.stackKind !== 'vault' && stackHead.dataset.kind) { stackHead.textContent = ''; stackHead.dataset.kind = ''; stackHead.classList.remove('on'); }
  if (st.stackKind === 'files') { renderFiles(); return; }
  if (st.stackKind === 'clips') { renderClips(); return; }
  if (st.stackKind === 'notes') { renderNotes(); return; }
  if (st.stackKind === 'vault') { renderVault(); return; }
  if (st.stackKind === 'settings') { renderSettings(); return; }
  if (st.stackKind === 'speedo') { renderSpeedo(); return; }
  if (st.stackKind === 'tour') { renderTour(); return; }
  $('#stack-clear').textContent = 'Clear all';
  $('#stack-clear').classList.toggle('hidden', !st.history.length);
  if (!st.history.length) {
    const e = document.createElement('div'); e.className = 'row empty'; e.textContent = 'No notifications';
    stackList.appendChild(e); return;
  }
  st.history.forEach((n, i) => {
    const row = document.createElement('div'); row.className = 'row'; row.style.setProperty('--i', Math.min(i, 6));
    const ic = document.createElement('div'); ic.className = 'ic'; paintIcon(ic, n);
    const app = document.createElement('span'); app.className = 'app dim'; app.textContent = n.app || '';
    const box = document.createElement('span'); box.className = 'mqbox'; box.dir = 'auto';
    const mq = document.createElement('span'); mq.className = 'mq';
    if (n.title) { const b = document.createElement('b'); b.textContent = n.title; mq.appendChild(b); }
    mq.appendChild(document.createTextNode((n.body || '').replace(/\s+/g, ' ')));
    box.appendChild(mq);
    const tm = document.createElement('span'); tm.className = 'tm dim'; tm.textContent = rel(n.ts);
    const x = document.createElement('button'); x.className = 'x'; x.title = 'Dismiss'; x.innerHTML = svg('close');
    row.append(ic, app, box, tm, x);
    row.addEventListener('mouseenter', () => startMarquee(box));
    row.addEventListener('mouseleave', () => stopMarquee(box));
    row.addEventListener('click', () => { if (n.aumid) window.qazi.activate(n.id, n.aumid); dropHistory(n.id); });
    x.addEventListener('click', (e) => { e.stopPropagation(); dropHistory(n.id); window.qazi.dismiss(n.id); });
    stackList.appendChild(row);
  });
}
let freshT = 0;
function setStack(open, kind) {
  kind = kind || st.stackKind;
  if (st.stackOpen === open && (!open || kind === st.stackKind)) return;
  if (st.stackOpen && st.stackKind === 'vault') releaseKeys(true);      // leaving the passwords: the keyboard goes back
  if (open && kind === 'vault') { st.vaultQ = ''; st.vaultSel = 0; stackHead.dataset.kind = ''; }
  st.stackOpen = open;
  if (open) st.stackKind = kind;
  stackEl.classList.toggle('open', open);
  $('#t-inbox').classList.toggle('active', open && st.stackKind === 'notifs');
  $('#t-shelf').classList.toggle('active', open && st.stackKind === 'files');
  $('#t-clips').classList.toggle('active', open && st.stackKind === 'clips');
  $('#t-notes').classList.toggle('active', open && st.stackKind === 'notes');
  $('#t-vault').classList.toggle('active', open && st.stackKind === 'vault');
  $('#t-gear').classList.toggle('active', open && st.stackKind === 'settings');
  $('#t-speedo').classList.toggle('active', open && st.stackKind === 'speedo');
  if (open && kind === 'speedo') loadLocations();
  if (open && kind === 'vault') window.qazi.vaultList().then(setVault);
  island.classList.remove('hover');
  if (open) {
    st.manual = 'tools';
    if (kind === 'notifs') { st.unseen = 0; updateBadge(); }
    renderStack();
    stackList.scrollTop = 0;
    stackEl.classList.add('fresh'); clearTimeout(freshT); freshT = setTimeout(() => stackEl.classList.remove('fresh'), 800);
  }
  render();
}
function addHistory(n) {
  st.history = st.history.filter((h) => h.id !== n.id);
  st.history.push(n);
  st.history.sort((a, b) => b.ts - a.ts);
  if (st.history.length > 60) st.history.length = 60;
  if (st.stackOpen && st.stackKind === 'notifs') renderStack();
}
function dropHistory(id) {
  const before = st.history.length;
  st.history = st.history.filter((h) => h.id !== id);
  if (st.history.length !== before && st.stackOpen && st.stackKind === 'notifs') renderStack();
}
function onNotif(m) {
  const n = { id: String(m.id), aumid: m.aumid, app: m.app, title: m.title, body: m.body, icon: m.icon, ts: m.ts || Date.now() };
  if (!n.title && !n.body) return;
  addHistory(n);
  if (m.old) return;                       // it was already waiting in the notification center
  if (st.stackOpen && st.stackKind === 'notifs') { bump(); return; }    // the list is open: it simply appears on top
  st.unseen++; updateBadge();
  showNotif(n);
}
$('#stack-clear').addEventListener('click', () => {
  if (st.stackKind === 'files') { window.qazi.shelfClear(); return; }
  if (st.stackKind === 'clips') { window.qazi.clipsClear(); return; }       // pinned entries stay
  if (st.stackKind !== 'notifs') return;
  st.history = []; st.unseen = 0; updateBadge(); renderStack();
  window.qazi.clearNotifs();
});

// ------------------------------------------------------------ file shelf
// Drop files on the pill and they wait there (only their paths are remembered); drag them out again anywhere.
function setShelf(list) {
  st.shelf = Array.isArray(list) ? list : [];
  const n = st.shelf.length;
  $('#t-shelf').classList.toggle('hidden', !n);
  shelfBadge.textContent = n > 9 ? '9+' : n; shelfBadge.classList.toggle('on', n > 0);
  const chip = $('#i-shelf');
  chip.innerHTML = n ? svg('tray') + '<b>' + n + '</b>' : '';
  // on the pill itself: up to five of them side by side (one alone also shows its name)
  const box = $('#hd-files'); box.textContent = '';
  st.shelf.slice(-5).forEach((f) => {
    const el = document.createElement('div'); el.className = 'hf'; el.draggable = true;
    el.title = f.name + ' — drag it out to drop it somewhere, click to show it in its folder';
    const ic = document.createElement('span'); ic.className = 'ic';
    if (f.icon) ic.style.backgroundImage = `url(data:image/png;base64,${f.icon})`; else ic.innerHTML = svg('file');
    el.appendChild(ic);
    if (n === 1) { const nm = document.createElement('span'); nm.className = 'nm'; nm.dir = 'auto'; nm.textContent = f.name; el.appendChild(nm); }
    const rm = document.createElement('button'); rm.className = 'rm'; rm.title = 'Let go of it (the file itself is not touched)'; rm.innerHTML = svg('close');
    el.appendChild(rm);
    el.addEventListener('dragstart', (e) => { e.preventDefault(); window.qazi.shelfDrag([f.path]); });
    el.addEventListener('click', () => window.qazi.shelfReveal(f.path));
    rm.addEventListener('click', (e) => { e.stopPropagation(); window.qazi.shelfRemove(f.path); });
    box.appendChild(el);
  });
  $('#hd-more').textContent = n > 5 ? '+' + (n - 5) : '';
  if (st.stackOpen && st.stackKind === 'files') { if (n) renderStack(); else setStack(false); }
  render();
}
window.qazi.onShelf(setShelf);
window.qazi.shelfGet().then(setShelf);
// dragging over the window must never navigate it to the dropped file
// What can be held: real files (Explorer), and things dragged out of apps — a picture from a chat or a web
// page arrives either as file contents without a path, or only as a link / an <img> tag.
const HOLDABLE = ['Files', 'text/uri-list', 'text/html', 'text/plain'];
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (!st.shelfOn || st.dragOut || !HOLDABLE.some((t) => [...e.dataTransfer.types].includes(t))) { e.dataTransfer.dropEffect = 'none'; return; }
  e.dataTransfer.dropEffect = 'copy';
  st.dragAt = Date.now(); render();
});
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  st.dragAt = 0;
  if (!st.shelfOn || st.dragOut) return;
  // everything must be read from the event now; it is emptied as soon as this handler yields
  const dt = e.dataTransfer, paths = [], blobs = [], urls = [], files = [...dt.files];
  const plain = files.length ? '' : (dt.getData('text/plain') || '').trim();
  const uriList = dt.getData('text/uri-list') || '', html = dt.getData('text/html') || '';
  if (!files.length && plain && !uriList.trim() && !/<img/i.test(html)) {
    // a piece of text dragged onto the pill becomes a note
    setNotes(await window.qazi.noteSave(null, plain.slice(0, 5000), 0)); bump();
    showHud('jot', 'Noted', plain.replace(/\s+/g, ' '), 1900);
    return;
  }
  const found = await window.qazi.pathsFor(files);
  files.forEach((f, i) => { if (found[i]) paths.push(found[i]); else blobs.push(f); });
  if (!files.length) {
    for (const line of uriList.split(/\r?\n/)) { const u = line.trim(); if (u && !u.startsWith('#')) urls.push(u); }
    if (!urls.length) { const m = /<img[^>]+src\s*=\s*["']([^"']+)["']/i.exec(html); if (m) urls.push(m[1].replace(/&amp;/g, '&')); }
  }
  const before = st.shelf.length;
  let list = st.shelf;
  if (paths.length) list = await window.qazi.shelfAdd(paths);
  for (const f of blobs) { try { list = await window.qazi.shelfAddData(f.name, f.type, await f.arrayBuffer()); } catch { /* unreadable */ } }
  for (const u of urls.slice(0, 5)) list = await window.qazi.shelfAddUrl(u);
  setShelf(list); bump();
  const added = list.length - before;
  if (added > 0) showHud('tray', added === 1 ? 'Holding' : 'Holding ' + added + ' files', added === 1 ? list[list.length - 1].name : 'drag them out from here', 1900);
  else showHud('tray', "Can't hold that", 'only files and pictures', 2000, 'faded');
});
// While a file is on its way out, the pill and the list stay exactly as they are.
window.qazi.onShelfDragging((on) => {
  st.dragOut = !!on;
  if (!on) { st.leftAt = Date.now(); evalHover(st.cx, st.cy); }
  render();
});
$('#hd-more').addEventListener('click', () => setStack(!(st.stackOpen && st.stackKind === 'files'), 'files'));
$('#hd-menu').addEventListener('click', () => { setStack(false); st.manual = 'tools'; render(); });
// the shelf button itself is a handle for everything on the shelf
$('#t-shelf').addEventListener('dragstart', (e) => { e.preventDefault(); window.qazi.shelfDrag(st.shelf.map((f) => f.path)); });

// ------------------------------------------------------------ media
const DEFAULT_PAL = ['#1f0e6b', '#33199a', '#4c2cbf'];     // dark violet night sky (deep enough that white text stays easy to read)
// Skins: animated surfaces the pill can wear. At rest they move slowly; with music they react to the sound.
const THEMES = {
  nebula: { name: 'Nebula', pal: ['#7a1fd1', '#c0269a', '#ff4f9a'] },
  crystal: { name: 'Sapphire', pal: ['#2b36d9', '#5a48f0', '#9a6bff'] },
  ember: { name: 'Ember', pal: ['#a8081d', '#dc1230', '#ff4a3d'] },
  reactor: { name: 'Reactor', pal: ['#2f8f12', '#6fd61f', '#b6ff3a'] },
  venom: { name: 'Venom', pal: ['#3a3d47', '#8a8f9c', '#e6eaf2'] },
  cloud: { name: 'Storm cloud', pal: ['#7f93b3', '#b9c8e0', '#ffffff'] },
  water: { name: 'Water', pal: ['#0b5fd6', '#1aa6e8', '#5fe0e6'] },
  lava: { name: 'Lava', pal: ['#e02a0c', '#ff7a18', '#ffd24a'] },
  ice: { name: 'Ice', pal: ['#5aa9e6', '#9fd3f7', '#e9f6ff'] },
};
const palette = DEFAULT_PAL;
let lookNow = null, lookDrawn = 'sky';
function applyPal() {       // the accent colours (glow, switches) follow whatever the pill is wearing
  const p = THEMES[lookNow] ? THEMES[lookNow].pal : palette;
  const r = document.documentElement.style;
  r.setProperty('--c1', p[0]); r.setProperty('--c2', p[1]); r.setProperty('--c3', p[2]);
}
// The sky is always this violet, whatever the cover looks like (a cover's colours once turned it brown or gold).
function setArt(b64) {
  const art = $('#art');
  if (!b64) { art.style.backgroundImage = ''; art.innerHTML = svg('note'); return; }
  const url = `data:image/png;base64,${b64}`;
  const img = new Image();
  img.onload = () => { art.style.backgroundImage = `url(${url})`; art.innerHTML = ''; };
  img.onerror = () => setArt(null);
  img.src = url;
}
// Films and series are not "now playing" material: the player says so (kind), or it is a known video app.
const VIDEO_APPS = /vlc|mpv|mpc-hc|mpc-be|potplayer|kmplayer|smplayer|gomplayer|zunevideo|netflix|primevideo|disney|plex|kodi|stremio|filimo|namava|aparat/i;
function onMedia(m) {
  const was = st.media;
  if (!m.active) {
    st.media = { active: false, playing: false, title: '', artist: '', pos: 0, dur: 0, at: 0, key: '', video: false };
    setArt(null);
  } else {
    const justSeeked = Date.now() - (st.seekAt || 0) < 1500 && m.key === was.key;     // the player has not caught up yet
    st.media = { ...m, at: performance.now(), video: m.kind === 'Video' || VIDEO_APPS.test(m.app || '') };
    if (justSeeked) { st.media.pos = was.pos; st.media.at = was.at; }
    $('#m-title').textContent = m.title || 'Unknown title';
    if (!st.scrubbing) $('#m-artist').textContent = m.artist || '';
    if (musicOn()) {
      if (m.key !== was.key && m.playing && !st.menuMode) { st.revealUntil = Date.now() + 3000; if (was.key) bump(); }   // announce the new track
    }
    if (!m.playing && was.playing) st.pausedAt = Date.now();
  }
  const icon = st.media.playing ? 'pause' : 'play';
  setIcon($('#b-play'), icon); setIcon($('#t-play'), icon);
  $('#t-play').classList.toggle('hidden', !st.media.active);
  $('#t-track').classList.toggle('hidden', !(st.menuMode && musicOn()));
  render();
}
function setMenuMode(on) {
  st.menuMode = on;
  try { localStorage.setItem('qazi.menuMode', on ? '1' : ''); } catch { /* storage unavailable */ }
  $('#t-track').classList.toggle('hidden', !(on && musicOn()));
  st.manual = null;
  if (on) st.enteredAt = 0;      // the cursor is already on the pill: show the menu at once
  render();
}
try { st.menuMode = localStorage.getItem('qazi.menuMode') === '1'; } catch { /* storage unavailable */ }
const optimisticToggle = () => {      // instant feedback; the helper confirms within ~0.5s
  window.qazi.media('toggle');
  st.pausedAt = st.media.playing ? Date.now() : 0;
};
$('#b-play').addEventListener('click', optimisticToggle);
$('#t-play').addEventListener('click', optimisticToggle);
$('#b-next').addEventListener('click', () => window.qazi.media('next'));
$('#b-prev').addEventListener('click', () => window.qazi.media('prev'));
$('#b-more').addEventListener('click', () => setMenuMode(true));
$('#t-track').addEventListener('click', () => { setStack(false); setMenuMode(false); });
setArt(null);

// ------------------------------------------------------------ volume HUD (scroll on the pill, or any system volume change)
function paintVol() {
  $('#v-fill').style.width = (st.mute ? 0 : st.vol) + '%';
  $('#v-num').textContent = st.mute ? '0' : st.vol;
  const ic = st.mute || st.vol === 0 ? 'muted' : 'volume';
  setIcon($('#v-icon'), ic);
}
views.vol.addEventListener('click', () => { st.volUntil = Date.now() + 1500; window.qazi.toggleMute(); });
// The pill is the source of truth while scrolling: steps are applied locally at once, sent to Windows at most
// ~16 times a second, and Windows' own (late) reports are ignored until the wheel has rested.
let wheelAcc = 0, volSendT = 0;
island.addEventListener('wheel', (e) => {
  e.preventDefault();
  wheelAcc += e.deltaY;
  const steps = Math.trunc(wheelAcc / 50);          // one mouse notch = 2%, touchpads glide in 1% steps
  if (!steps) return;
  wheelAcc -= steps * 50;
  st.vol = clamp(st.vol - steps, 0, 100); st.mute = false;
  st.volLocalAt = Date.now(); st.volUntil = Date.now() + 1300;
  paintVol(); render();
  if (!volSendT) volSendT = setTimeout(() => { volSendT = 0; window.qazi.setVolume(st.vol / 100); }, 60);
}, { passive: false });

window.qazi.onHelper((m) => {
  if (m.t === 'media') { if (!st.freezeMedia) onMedia(m); }
  else if (m.t === 'thumb') { if (m.key === st.media.key || !st.media.key) setArt(m.data); }
  else if (m.t === 'notif') onNotif(m);
  else if (m.t === 'notifGone') dropHistory(String(m.id));
  else if (m.t === 'cover') { st.covered = !!m.covered; st.full = !!m.full; render(); }
  else if (m.t === 'capture-error') {
    showHud('shot', 'Screenshot unavailable', m.message || 'No capture tool is available', 4200, 'faded');
  }
  else if (m.t === 'bt') {
    if (!st.deviceAlerts) return;
    const audio = /bud|pod|head|ear|speaker|sound|audio|jbl|sony|bose|beats|wh-|wf-|anker|jabra/i.test(m.name);
    showHud(audio ? 'headphones' : 'bluetooth', m.name, m.on ? 'Connected' : 'Disconnected', 2600, m.on ? 'blue pop' : 'faded');
  }
  else if (m.t === 'update') {
    st.update = m.version; gearBadge.classList.add('on');
    showNotif({ app: 'Update', title: 'Version ' + m.version + ' is ready', body: m.body || 'click to install now (it also installs by itself when you step away)', action: 'update', long: true });
    if (st.stackOpen && st.stackKind === 'settings') renderStack();
  }
  else if (m.t === 'updated') showNotif({ app: 'Update', title: 'Peeky was updated to ' + m.version, body: "click to see what's new", action: 'whatsnew', version: m.version, long: true });
  else if (m.t === 'net') {
    const was = st.net; st.net = { online: !!m.online, vpn: m.vpn || '', proxy: !!m.proxy }; paintStatus();
    if (m.first) return;
    if (was.online !== st.net.online) showHud(st.net.online ? 'wifi' : 'wifioff', 'Internet', st.net.online ? 'Back online' : 'No connection', 2800, st.net.online ? 'green pop' : 'red pop');
    else if (was.vpn !== st.net.vpn) showHud('shield', 'VPN', st.net.vpn ? 'On · ' + st.net.vpn : 'Off', 2600, st.net.vpn ? 'green pop' : 'faded');
    else if (was.proxy !== st.net.proxy) showHud('shield', 'Proxy', st.net.proxy ? 'On' : 'Off', 2200, st.net.proxy ? 'green pop' : 'faded');
  }
  else if (m.t === 'sensors') {
    const was = st.sensors; st.sensors = { mic: m.mic || [], cam: m.cam || [] }; paintStatus();
    if (st.sensors.cam.length && !was.cam.length) showHud('cam', 'Camera', 'in use · ' + st.sensors.cam[0], 2600, 'green pop');
    else if (st.sensors.mic.length && !was.mic.length) showHud('mic', 'Microphone', 'in use · ' + st.sensors.mic[0], 2600, 'amber pop');
  }
  else if (m.t === 'vol') {
    if (Date.now() - st.volLocalAt < 1000) return;       // echo of our own scrolling
    const v = Math.round(m.level * 100);
    const changed = v !== st.vol || m.mute !== st.mute;
    st.vol = v; st.mute = !!m.mute; paintVol();
    if (st.volSeen && changed && !(st.hideVideo && st.full)) { st.volUntil = Date.now() + 1300; render(); }
    st.volSeen = true;
  }
});

// Small standing signs: a dot in the corner of the pill while the microphone (amber) or the camera (green) is in
// use or the internet is gone (red), and a word in the menu while a VPN or proxy is on.
function paintStatus() {
  const d = $('#dots'), s = st.sensors, n = st.net;
  d.innerHTML = (s.cam.length ? '<i class="cam"></i>' : '') + (s.mic.length ? '<i class="mic"></i>' : '') + (n.online ? '' : '<i class="off"></i>');
  d.title = [s.cam.length ? 'Camera: ' + s.cam.join(', ') : '', s.mic.length ? 'Microphone: ' + s.mic.join(', ') : '', n.online ? '' : 'No internet'].filter(Boolean).join(' · ');
  const tn = $('#t-net');
  tn.textContent = !n.online ? 'Offline' : n.vpn ? 'VPN' : n.proxy ? 'Proxy' : '';
  tn.title = n.vpn ? 'VPN: ' + n.vpn : n.proxy ? 'A system proxy is on' : '';
  tn.className = 'tag' + (!n.online ? ' bad' : '');
}

// ------------------------------------------------------------ audio analysis (system loopback)
const NB = 24;
const levels = new Float32Array(NB);
let bass = 0, bassSlow = 0, energy = 0, heard = null, heardAt = 0;
// the Rust side listens to what the speakers play and sends 24 band levels about 40 times a second
window.qazi.onLevels((list) => { heard = list; heardAt = performance.now(); });
function sampleLevels(t, playing) {
  if (st.fakeLevels) { heard = Array.from({ length: NB }, (_, i) => st.fakeLevels * (0.5 + 0.5 * Math.sin(t * 0.006 + i * 1.3))); heardAt = t; }     // debug: pretend there is sound
  if (playing && heard && t - heardAt < 400) {
    for (let i = 0; i < NB; i++) { const v = heard[i] || 0; levels[i] += (v - levels[i]) * (v > levels[i] ? 0.55 : 0.16); }
  } else {
    for (let i = 0; i < NB; i++) levels[i] *= 0.9;
  }
  let b = 0, e = 0;
  for (let i = 0; i < 4; i++) b += levels[i];
  for (let i = 0; i < NB; i++) e += levels[i];
  bass += (clamp(b / 4, 0, 1) - bass) * 0.5; bassSlow += (bass - bassSlow) * 0.04; energy = e / NB;
}

// ------------------------------------------------------------ the night sky: gradient, drifting lights, twinkling stars
const SKY_W = 600, SKY_H = 36;
const sky = $('#sky'), skyG = sky.getContext('2d');
function sizeSky() {
  const dpr = window.devicePixelRatio || 1;
  sky.width = Math.round(SKY_W * dpr); sky.height = Math.round(SKY_H * dpr);
  skyG.setTransform(dpr, 0, 0, dpr, 0, 0);
}
sizeSky(); window.addEventListener('resize', sizeSky);
const stars = Array.from({ length: 72 }, (_, i) => ({
  x: Math.random() * SKY_W, y: 3 + Math.random() * (SKY_H - 6),
  r: 0.45 + Math.random() * 0.75, ph: Math.random() * 6.28, sp: 0.8 + Math.random() * 2.6,
  drift: 1.5 + Math.random() * 5, band: 2 + Math.floor(Math.random() * (NB - 4)), big: i % 9 === 0,
}));
const shooting = [];
let skyA = 0, lastShot = 0;
function sparkle(g, x, y, R) {          // four-point star with pinched sides
  g.beginPath();
  g.moveTo(x, y - R); g.quadraticCurveTo(x, y, x + R, y); g.quadraticCurveTo(x, y, x, y + R);
  g.quadraticCurveTo(x, y, x - R, y); g.quadraticCurveTo(x, y, x, y - R); g.fill();
}
// stars: each listens to its own slice of the spectrum
function drawStars(g, t, dt, x0, x1, W, A, every) {
  g.fillStyle = '#fff';
  const n = Math.min(stars.length, Math.round(W / 7.5));
  for (let i = 0; i < n; i += every) {
    const s = stars[i];
    s.x -= s.drift * dt * (1 + energy * 3);
    if (s.x < x0 - 4) { s.x = x1 + 4; s.y = 3 + Math.random() * (SKY_H - 6); }
    else if (s.x > x1 + 4) s.x = x0 + Math.random() * W;
    const lv = levels[s.band], tw = 0.5 + 0.5 * Math.sin(t * 0.001 * s.sp + s.ph);
    g.globalAlpha = A * clamp((0.3 + 0.7 * tw) * (0.4 + lv * 1.6), 0, 1);
    if (s.big) sparkle(g, s.x, s.y, Math.min(5.5, s.r * (2.6 + lv * 3 + bass * 1.2)));   // capped so text stays readable
    else { g.beginPath(); g.arc(s.x, s.y, s.r * (0.85 + lv * 0.9), 0, 6.283); g.fill(); }
  }
}
// the night sky: the cover's colours, soft lights, stars, a shooting star on a strong beat
function paintSky(g, t, dt, x0, x1, W, A) {
  const grad = g.createLinearGradient(x0, 0, x1, SKY_H);
  grad.addColorStop(0, palette[0]); grad.addColorStop(0.55, palette[1]); grad.addColorStop(1, palette[2]);
  g.globalAlpha = A * clamp(0.8 + bass * 0.2, 0, 1); g.fillStyle = grad; g.fillRect(x0, 0, W, SKY_H);

  g.globalCompositeOperation = 'lighter';
  // soft lights that sway and swell with the music (kept faint: three of them on top of each other must not wash the pill out)
  for (let i = 0; i < 3; i++) {
    const v = (levels[i * 7 + 1] + levels[i * 7 + 3] + levels[i * 7 + 5]) / 3;
    const cx = x0 + (0.5 + 0.5 * Math.sin(t * 0.0006 * (1 + i * 0.37) + i * 2.1)) * W;
    const cy = SKY_H / 2 + Math.cos(t * 0.0009 + i * 1.7) * 9, rad = 20 + v * 44;
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    rg.addColorStop(0, `rgba(255,255,255,${clamp(0.03 + v * 0.17, 0, 0.2).toFixed(3)})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = A; g.fillStyle = rg; g.fillRect(cx - rad, 0, rad * 2, SKY_H);
  }
  drawStars(g, t, dt, x0, x1, W, A, 1);
  if (bass - bassSlow > 0.14 && t - lastShot > 1500) {
    lastShot = t;
    shooting.push({ x: x0 + Math.random() * W * 0.6, y: -2, vx: 170 + Math.random() * 90, vy: 62, life: 0 });
  }
  for (let i = shooting.length - 1; i >= 0; i--) {
    const s = shooting[i];
    s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.life > 0.6 || s.y > SKY_H + 6) { shooting.splice(i, 1); continue; }
    const tx = s.x - s.vx * 0.11, ty = s.y - s.vy * 0.11;
    const lg = g.createLinearGradient(s.x, s.y, tx, ty);
    lg.addColorStop(0, 'rgba(255,255,255,.95)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = A * clamp(1 - s.life / 0.6, 0, 1);
    g.strokeStyle = lg; g.lineWidth = 1.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(tx, ty); g.stroke();
  }
}

// ---- skins. Liquid camo: a dark surface with thin bright veins that drifts steadily to one side; the louder the
// music, the more of it floods with colour. It is a small field of numbers (one per 2x2 pixels) blown up smoothly.
const FW = SKY_W / 2, FH = SKY_H / 2;
const fcan = document.createElement('canvas'); fcan.width = FW; fcan.height = FH;
const fctx = fcan.getContext('2d'), fimg = fctx.createImageData(FW, FH);
const LIQ = {
  reactor: { bg: [3, 5, 4], lo: [36, 140, 10], hi: [165, 255, 55], spec: [235, 255, 200], thr: 0.8, speed: 1 },
  ember: { bg: [12, 2, 4], lo: [150, 8, 22], hi: [255, 52, 40], spec: [255, 200, 170], thr: 0.78, speed: 1 },
  crystal: { bg: [9, 8, 46], lo: [44, 48, 205], hi: [140, 105, 255], spec: [236, 232, 255], thr: 0.45, speed: 0.8 },
  venom: { bg: [0, 0, 1], lo: [14, 15, 19], hi: [38, 41, 50], spec: [150, 156, 170], thr: 0.62, speed: 0.55 },
};
function paintLiquid(g, t, x0, x1, W, A, P) {
  const d = fimg.data, tt = t * 0.0006 * P.speed, scroll = t * 0.021 * P.speed;
  const c0 = Math.max(0, Math.floor(x0 / 2) - 1), c1 = Math.min(FW, Math.ceil(x1 / 2) + 1);
  const flood = energy * 0.9 + bass * 0.22, bg = P.bg, lo = P.lo, hi = P.hi, sp = P.spec;
  for (let x = c0; x < c1; x++) {
    const u = (x * 2 + scroll) / 23;
    const thr = Math.max(0.02, P.thr - flood - levels[clamp(Math.floor((x * 2 - x0) / W * NB), 0, NB - 1)] * 0.45);
    for (let y = 0; y < FH; y++) {
      const v = y * 2 / 12;
      const n = 0.6 * Math.sin(u * 2 + 1.7 * Math.sin(v * 2.6 + u * 0.7 + tt * 0.7)) + 0.4 * Math.sin(v * 3.1 - u * 1.1 + 1.3 * Math.sin(u * 1.9 - tt * 0.5));
      const fill = clamp((n - thr) / 0.16, 0, 1);                              // inside a pool of colour
      const vein = 1 - Math.min(1, Math.abs(n - thr + 0.4) / 0.055);           // a hairline some way outside it
      const k = Math.max(fill, vein * 0.85), h = fill * fill, s = clamp((n - thr - 0.3) / 0.12, 0, 1) * 0.7;
      const i = (y * FW + x) * 4;
      for (let c = 0; c < 3; c++) {
        let val = bg[c] + (lo[c] - bg[c]) * k; val += (hi[c] - val) * h; val += (sp[c] - val) * s;
        d[i + c] = val;
      }
      d[i + 3] = 255;
    }
  }
  fctx.putImageData(fimg, 0, 0);
  g.globalAlpha = A; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(fcan, 0, 0, FW, FH, 0, 0, SKY_W, SKY_H);
}
const PAINT = {
  sky: paintSky,
  // a dark galaxy: clouds of magenta and violet drifting over black, a few stars
  nebula(g, t, dt, x0, x1, W, A) {
    g.globalAlpha = A; g.fillStyle = '#08030f'; g.fillRect(x0, 0, W, SKY_H);
    g.globalCompositeOperation = 'lighter';
    const C = ['255,45,150', '130,60,255', '60,80,230', '255,90,200', '170,40,220'];
    for (let i = 0; i < 5; i++) {
      const v = (levels[2 + i * 4] + levels[3 + i * 4]) / 2;
      const span = W + 120, cx = x0 - 60 + ((((i * 0.2 * span - t * 0.012 * (1 + i * 0.13)) % span) + span) % span);     // all drifting the same way
      const cy = SKY_H / 2 + Math.cos(t * 0.0006 + i * 2.3) * 10, rad = 26 + v * 40 + (i % 2) * 10;
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      rg.addColorStop(0, `rgba(${C[i]},${clamp(0.34 + v * 0.36, 0, 0.6).toFixed(3)})`); rg.addColorStop(1, `rgba(${C[i]},0)`);
      g.globalAlpha = A; g.fillStyle = rg; g.fillRect(cx - rad, 0, rad * 2, SKY_H);
    }
    drawStars(g, t, dt, x0, x1, W, A * 0.8, 2);
  },
};
for (const k of Object.keys(LIQ)) PAINT[k] = (g, t, dt, x0, x1, W, A) => paintLiquid(g, t, x0, x1, W, A, LIQ[k]);

// ---- scenes: skins that are a small picture of something rather than a pattern
const bandAt = (x, x0, W) => levels[clamp(Math.floor((x - x0) / W * NB), 0, NB - 1)];
let storm = 0, strike = 0;                  // the cloud: 0 = white fair-weather cloud, 1 = thundercloud; flash = lightning just struck
const cloudRGB = () => [244, 247, 251].map((v, i) => Math.round(clamp(v + ([50, 56, 68][i] - v) * storm + strike * 95 * storm, 0, 255)));
// a white cloud; when music plays it darkens into a thundercloud (the puffs, rain and lightning are drawn by drawCloud)
PAINT.cloud = (g, t, dt, x0, x1, W, A) => {
  g.globalAlpha = A; g.fillStyle = `rgb(${cloudRGB()})`; g.fillRect(x0, 0, W, SKY_H);
  for (let i = 0; i < 5; i++) {        // soft light and shade drifting through it
    const span = W + 100, cx = x0 - 50 + ((((i * 0.2 * span - t * 0.009 * (1 + i * 0.17)) % span) + span) % span), cy = 8 + (i % 3) * 10, rad = 22 + (i % 2) * 12;
    const dark = i % 2 === 1, rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    const col = dark ? '20,26,40' : '255,255,255', a = dark ? 0.06 + storm * 0.3 : 0.5 - storm * 0.42;
    rg.addColorStop(0, `rgba(${col},${a.toFixed(3)})`); rg.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = rg; g.fillRect(cx - rad, 0, rad * 2, SKY_H);
  }
  if (strike > 0.02) { g.globalAlpha = A * strike * 0.6; g.fillStyle = '#e4eeff'; g.fillRect(x0, 0, W, SKY_H); }
};
// Water, lava and ice change the body itself (see drawBody / drawIce); inside, the pill is painted to match.
const SCENE = {
  water: { stops: [[0.05, '#3bb6f6'], [0.46, '#0f5cc9'], [1, '#0b49b8']], wob: 1.7, r: 4.6, len: 15, every: 1500, g: 520 },
  lava: { stops: [[0.08, '#190503'], [0.3, '#4c1005'], [0.44, '#e24a0e'], [0.6, '#ff9a1e'], [1, '#ffd24a']], wob: 1.2, r: 5.2, len: 11, every: 2400, g: 210 },
};
const ICE = [[0.08, '#f4fbff'], [0.44, '#b9def8'], [0.62, '#8fc8f0'], [1, '#e6f5ff']];
function sceneGrad(g, stops, off) {          // one vertical gradient shared by the outside and the inside of the pill
  const gr = g.createLinearGradient(0, -off, 0, 96 - off);
  for (const [p, c] of stops) gr.addColorStop(p, c);
  return gr;
}
const drift = (g, t, x0, W, A, col, a, n) => {       // soft patches of light sliding one way
  for (let i = 0; i < n; i++) {
    const span = W + 100, cx = x0 - 50 + ((((i / n * span - t * 0.011 * (1 + i * 0.19)) % span) + span) % span), cy = 6 + (i % 3) * 9, rad = 16 + (i % 2) * 12;
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    rg.addColorStop(0, `rgba(${col},${a})`); rg.addColorStop(1, `rgba(${col},0)`);
    g.globalAlpha = A; g.fillStyle = rg; g.fillRect(cx - rad, 0, rad * 2, SKY_H);
  }
};
PAINT.water = (g, t, dt, x0, x1, W, A) => {
  g.globalAlpha = A; g.fillStyle = sceneGrad(g, SCENE.water.stops, 8); g.fillRect(x0, 0, W, SKY_H);
  drift(g, t, x0, W, A, '190,235,255', 0.2 + energy * 0.4, 5);
};
PAINT.lava = (g, t, dt, x0, x1, W, A) => {
  paintLiquid(g, t, x0, x1, W, A, LIQ.ember);                 // veins of fire moving under the crust
  g.globalAlpha = A * 0.55; g.fillStyle = sceneGrad(g, SCENE.lava.stops, 8); g.fillRect(x0, 0, W, SKY_H);
};
PAINT.ice = (g, t, dt, x0, x1, W, A) => {
  g.globalAlpha = A; g.fillStyle = sceneGrad(g, ICE, 8); g.fillRect(x0, 0, W, SKY_H);
  g.save(); g.transform(1, 0, -0.7, 1, 0, 0);                  // slanted streaks of sheen
  for (let i = 0; i < 4; i++) {
    const span = W + 160, x = x0 + ((((i * 0.27 * span + t * 0.02) % span) + span) % span);
    g.globalAlpha = A * 0.5; g.fillStyle = '#fff'; g.fillRect(x, -2, 3 + (i % 2) * 7, SKY_H + 4);
  }
  g.restore();
};
// Venom: the pill itself turns to black goo. Lumps crawl along its edge and now and then a tendril reaches out
// and snaps back (further on a beat). Drawn on a canvas behind the pill, melted together by an SVG filter.
const goo = $('#goo'), gooG = goo.getContext('2d');
const lumps = Array.from({ length: 44 }, (_, i) => ({ s: Math.random(), v: (0.006 + Math.random() * 0.012) * (Math.random() < 0.5 ? 1 : -1), ph: Math.random() * 6.283, sp: 0.8 + Math.random() * 1.8, r: 6 + Math.random() * 5 }));
const tendrils = Array.from({ length: 8 }, () => ({ s: Math.random(), len: 0, to: 0, at: 0, ph: Math.random() * 6.283 }));
function onEdge(s, W, cx) {          // a point on the outline of the pill (a stadium), and which way is "out"
  const R = SKY_H / 2, top = 8, flat = Math.max(0, W - 2 * R), L = 2 * flat + 2 * Math.PI * R;
  let d = (((s % 1) + 1) % 1) * L;
  const xl = cx - flat / 2, xr = cx + flat / 2, cy = top + R;
  if (d < flat) return [xl + d, top + 2 * R, 0, 1];                    // bottom edge, left to right
  d -= flat;
  if (d < Math.PI * R) { const a = Math.PI / 2 - d / R; return [xr + Math.cos(a) * R, cy + Math.sin(a) * R, Math.cos(a), Math.sin(a)]; }
  d -= Math.PI * R;
  if (d < flat) return [xr - d, top, 0, -1];                           // top edge
  d -= flat;
  const a = -Math.PI / 2 - d / R; return [xl + Math.cos(a) * R, cy + Math.sin(a) * R, Math.cos(a), Math.sin(a)];
}
let gooOn = false;
function drawGoo(t, dt, on, live) {
  if (!on) { if (gooOn) { gooOn = false; gooG.clearRect(0, 0, goo.width, goo.height); goo.style.opacity = 0; } return; }
  if (!gooOn) { gooOn = true; goo.style.opacity = 1; }
  const g = gooG, W = island.clientWidth, cx = goo.width / 2;
  g.clearRect(0, 0, goo.width, goo.height);
  g.fillStyle = '#000';
  // the outline itself is a slow wave all the way round, so no straight edge is left however wide the pill is
  const L = 2 * Math.max(0, W - SKY_H) + Math.PI * SKY_H;
  g.beginPath();
  for (let d = 0; d < L; d += 4) {
    const [x, y, nx, ny] = onEdge(d / L, W, cx);
    const off = 2.2 + 2.4 * Math.sin(d * 0.085 + t * 0.0021) + 1.9 * Math.sin(d * 0.041 - t * 0.0013 + 1.3) + 1.2 * Math.sin(d * 0.19 + t * 0.004) + bass * 4;
    if (d === 0) g.moveTo(x + nx * off, y + ny * off); else g.lineTo(x + nx * off, y + ny * off);
  }
  g.closePath(); g.fill();
  const nLumps = clamp(Math.round(L / 24), 8, lumps.length), nTen = clamp(Math.round(3 + W / 110), 3, tendrils.length);
  for (let li = 0; li < nLumps; li++) {
    const l = lumps[li];
    l.s += l.v * dt * (1 + energy * 4);
    const [x, y, nx, ny] = onEdge(l.s, W, cx), out = -3 + 8 * (0.5 + 0.5 * Math.sin(t * 0.0016 * l.sp + l.ph)) + bass * 7;
    g.beginPath(); g.arc(x + nx * out, y + ny * out, l.r + Math.sin(t * 0.002 * l.sp + l.ph * 2) * 1.5, 0, 6.283); g.fill();
  }
  for (let ti = 0; ti < nTen; ti++) {
    const td = tendrils[ti];
    if (t > td.at) {       // choose what it does next: mostly rest, sometimes reach out
      const reach = Math.random() < (live ? 0.5 + bass : 0.3);
      td.to = reach ? 11 + Math.random() * (live ? 14 + bass * 16 : 12) : 0;
      if (td.len < 1 && reach) td.s = Math.random() * 0.5 + (Math.random() < 0.8 ? 0 : 0.5);      // mostly from the bottom edge and the right end
      td.at = t + (reach ? 500 + Math.random() * 700 : 700 + Math.random() * 2600);
    }
    td.len += (td.to - td.len) * Math.min(1, dt * (td.to > td.len ? 7 : 3.2));
    if (td.len < 0.6) continue;
    const [x, y, nx, ny] = onEdge(td.s, W, cx), n = 6;
    for (let i = 0; i <= n; i++) {
      const q = i / n, w = Math.sin(t * 0.004 + td.ph + q * 3) * 2.2 * q;
      g.beginPath(); g.arc(x + nx * td.len * q - ny * w, y + ny * td.len * q + nx * w, 7 * (1 - q * 0.7), 0, 6.283); g.fill();
    }
  }
}
// The cloud outside the pill: puffs all round its edge (melted together like the goo), and under a thundercloud
// rain, and a bolt of lightning on every strong beat.
const fx = $('#fx'), fxG = fx.getContext('2d');
const puffs = Array.from({ length: 52 }, () => [Math.random(), Math.random(), Math.random() * 6.283]);
const drops = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), v: 0.9 + Math.random() * 0.8 }));
const bolts = [];
let cloudOn = false, lastBolt = 0;
function drawCloud(t, dt, on, live) {
  if (!on) {
    if (cloudOn) { cloudOn = false; storm = 0; strike = 0; gooG.clearRect(0, 0, goo.width, goo.height); fxG.clearRect(0, 0, fx.width, fx.height); goo.style.opacity = 0; document.body.classList.remove('daylight', 'cloud'); }
    return;
  }
  if (!cloudOn) { cloudOn = true; goo.style.opacity = 1; document.body.classList.add('cloud'); }
  storm += ((live ? 1 : 0) - storm) * Math.min(1, dt * 1.5);
  strike *= Math.pow(0.002, dt);
  document.body.classList.toggle('daylight', storm < 0.5);
  const g = gooG, W = island.clientWidth, cx = goo.width / 2;
  g.clearRect(0, 0, goo.width, goo.height);
  g.fillStyle = `rgb(${cloudRGB()})`;
  g.beginPath(); g.roundRect(cx - W / 2 + 1, 9, W - 2, SKY_H - 2, 17); g.fill();
  const L = 2 * Math.max(0, W - SKY_H) + Math.PI * SKY_H, n = clamp(Math.round(L / 15), 8, puffs.length);
  for (let i = 0; i < n; i++) {
    const [a, b, ph] = puffs[i], [x, y, nx, ny] = onEdge(i / n + t * 0.000007, W, cx);
    const out = -1 + b * 3.5;
    g.beginPath(); g.arc(x + nx * out, y + ny * out, 6.5 + a * 5 + (ny < -0.5 ? 2 : 0) + Math.sin(t * 0.0011 + ph) * 1.2 + bass * 2.5 * storm, 0, 6.283); g.fill();
  }
  const f = fxG; f.clearRect(0, 0, fx.width, fx.height);
  if (storm < 0.25) return;
  f.strokeStyle = `rgba(170,195,235,${(0.5 * storm).toFixed(2)})`; f.lineWidth = 1; f.beginPath();
  for (const d of drops) {
    d.y += d.v * dt * (1.5 + energy * 2); if (d.y > 1) { d.y = 0; d.x = Math.random(); }
    const x = cx - W / 2 + 8 + d.x * (W - 16), y = 50 + d.y * 50;
    f.moveTo(x, y); f.lineTo(x - 1.5, y + 6);
  }
  f.stroke();
  if (live && bass - bassSlow > 0.11 && t - lastBolt > 420) {
    lastBolt = t; strike = 1;
    let x = cx - W / 2 + 14 + Math.random() * (W - 28), y = 46; const pts = [[x, y]], end = 70 + Math.random() * 28;
    while (y < end) { x += (Math.random() - 0.5) * 14; y += 5 + Math.random() * 7; pts.push([x, y]); }
    bolts.push({ pts, life: 1 });
  }
  f.strokeStyle = '#fff'; f.shadowColor = '#9cc0ff'; f.shadowBlur = 9; f.lineWidth = 1.7; f.lineJoin = 'round';
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]; b.life -= dt * 4.5;
    if (b.life <= 0) { bolts.splice(i, 1); continue; }
    f.globalAlpha = b.life; f.beginPath(); f.moveTo(b.pts[0][0], b.pts[0][1]);
    for (let k = 1; k < b.pts.length; k++) f.lineTo(b.pts[k][0], b.pts[k][1]);
    f.stroke();
  }
  f.globalAlpha = 1; f.shadowBlur = 0;
}
// Water and lava: the pill becomes a blob of liquid. Its outline rolls, and drops swell under it, hang, and fall
// (faster with the music). Lava also throws sparks on a beat.
const drips = Array.from({ length: 9 }, () => ({ x: Math.random(), len: 0, phase: 0, y: 0, vy: 0, at: 0 }));
const embers = [];
let bodyOn = null;
function drawBody(t, dt, key, live) {
  if (!key) { if (bodyOn) { bodyOn = null; gooG.clearRect(0, 0, goo.width, goo.height); fxG.clearRect(0, 0, fx.width, fx.height); goo.style.opacity = 0; embers.length = 0; } return; }
  if (bodyOn !== key) { bodyOn = key; goo.style.opacity = 1; for (const d of drips) { d.phase = 0; d.at = t + Math.random() * 1500; } }
  const P = SCENE[key], g = gooG, f = fxG, W = island.clientWidth, cx = goo.width / 2;
  g.clearRect(0, 0, goo.width, goo.height); f.clearRect(0, 0, fx.width, fx.height);
  g.fillStyle = sceneGrad(g, P.stops, 0);
  const L = 2 * Math.max(0, W - SKY_H) + Math.PI * SKY_H;
  g.beginPath();
  for (let d = 0; d < L; d += 4) {
    const [x, y, nx, ny] = onEdge(d / L, W, cx);
    const off = 1.5 + P.wob * (Math.sin(d * 0.07 + t * 0.0019) + 0.8 * Math.sin(d * 0.033 - t * 0.0012 + 1.3)) + bass * 2.5;
    if (d === 0) g.moveTo(x + nx * off, y + ny * off); else g.lineTo(x + nx * off, y + ny * off);
  }
  g.closePath(); g.fill();
  const n = clamp(Math.round(W / 50), 2, drips.length), speed = live ? 1 + energy * 3 + bass : 1;
  for (let i = 0; i < n; i++) {
    const d = drips[i], bx = cx - W / 2 + 16 + d.x * (W - 32), by = 43;
    if (d.phase === 0) { if (t > d.at) { d.phase = 1; d.x = Math.random(); d.len = 0; } continue; }
    if (d.phase === 1) {
      d.len += dt * P.len * 0.9 * speed;
      for (let q = 0; q <= 1; q += 0.2) { g.beginPath(); g.arc(bx, by + d.len * q, P.r * (q > 0.75 ? 0.95 : 0.85 - q * 0.45), 0, 6.283); g.fill(); }
      if (d.len >= P.len) { d.phase = 2; d.y = by + d.len; d.vy = 12; }
    } else {
      d.vy += dt * P.g; d.y += d.vy * dt; d.len *= Math.pow(0.02, dt);
      g.beginPath(); g.arc(bx, d.y, P.r * 0.85, 0, 6.283); g.fill();
      g.beginPath(); g.arc(bx, by + d.len * 0.4, P.r * 0.7, 0, 6.283); g.fill();          // what is left behind draws back in
      if (key === 'water') { f.globalAlpha = 0.75; f.fillStyle = '#fff'; f.beginPath(); f.arc(bx - 1.4, d.y - 1.6, 1.1, 0, 6.283); f.fill(); }
      if (d.y > 100) { d.phase = 0; d.at = t + P.every * (0.4 + Math.random()) / speed; }
    }
  }
  if (key === 'water') {        // a glint of light along the top
    f.globalAlpha = 0.5; f.strokeStyle = '#fff'; f.lineWidth = 1.4; f.lineCap = 'round';
    f.beginPath(); f.moveTo(cx - W / 2 + 16, 12.5); f.lineTo(cx - W / 2 + Math.min(46, W * 0.4), 12.5); f.stroke();
  } else {
    if (live && bass - bassSlow > 0.11 && embers.length < 40) for (let k = 0; k < 4; k++) embers.push({ x: cx - W / 2 + 10 + Math.random() * (W - 20), y: 44, vx: (Math.random() - 0.5) * 50, vy: -10 + Math.random() * 50, life: 1 });
    f.fillStyle = '#ffd98a'; f.shadowColor = '#ff7a18'; f.shadowBlur = 6;
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i]; e.vy += dt * 160; e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt * 1.5;
      if (e.life <= 0 || e.y > 108) { embers.splice(i, 1); continue; }
      f.globalAlpha = e.life; f.beginPath(); f.arc(e.x, e.y, 1.2, 0, 6.283); f.fill();
    }
    f.shadowBlur = 0;
  }
  f.globalAlpha = 1;
}
// Ice: a frozen pill with icicles hanging from it. They grow and shrink with the music; snow drifts down.
const icicles = Array.from({ length: 44 }, () => ({ w: 5 + Math.random() * 6, len: 0, base: 5 + Math.random() * 13, gap: 3 + Math.random() * 9, band: 1 + Math.floor(Math.random() * (NB - 3)), ph: Math.random() * 6.283 }));
const flakes = Array.from({ length: 22 }, () => ({ x: Math.random(), y: Math.random(), v: 0.12 + Math.random() * 0.2, ph: Math.random() * 6.283 }));
let iceOn = false;
function drawIce(t, dt, on, live) {
  if (!on) { if (iceOn) { iceOn = false; fxG.clearRect(0, 0, fx.width, fx.height); document.body.classList.remove('daylight'); } return; }
  if (!iceOn) { iceOn = true; document.body.classList.add('daylight'); }
  const f = fxG, W = island.clientWidth, cx = fx.width / 2, x0 = cx - W / 2;
  f.clearRect(0, 0, fx.width, fx.height);
  f.fillStyle = sceneGrad(f, ICE, 0);
  f.beginPath(); f.roundRect(x0 - 1, 7, W + 2, SKY_H + 2, 19); f.fill();           // a rim of ice just outside the pill
  let x = x0 + 15, i = 0;
  while (x < x0 + W - 12 && i < icicles.length) {
    const ic = icicles[i++];
    const want = ic.base * (live ? 0.55 + levels[ic.band] * 2 + bass * 0.5 : 0.8 + 0.12 * Math.sin(t * 0.0011 + ic.ph));
    ic.len += (want - ic.len) * Math.min(1, dt * 9);
    f.beginPath(); f.moveTo(x - ic.w / 2, 43); f.lineTo(x + ic.w / 2, 43); f.lineTo(x + ic.w * 0.08, 43 + ic.len); f.closePath(); f.fill();
    f.globalAlpha = 0.7; f.strokeStyle = '#fff'; f.lineWidth = 0.8; f.beginPath(); f.moveTo(x - ic.w * 0.22, 44); f.lineTo(x, 43 + ic.len * 0.8); f.stroke(); f.globalAlpha = 1;
    x += ic.w + ic.gap;
  }
  f.fillStyle = '#fff';
  for (const s of flakes) {
    s.y += s.v * dt * (1 + energy * 2); if (s.y > 1) { s.y = 0; s.x = Math.random(); }
    f.globalAlpha = 0.75 * (1 - s.y); f.beginPath(); f.arc(x0 + s.x * W + Math.sin(t * 0.0015 + s.ph) * 5, 48 + s.y * 56, 1.1, 0, 6.283); f.fill();
  }
  if (live && bass > 0.3) for (let k = 0; k < 3; k++) { f.globalAlpha = bass; sparkle(f, x0 + 12 + ((k * 0.37 + t * 0.0002) % 1) * (W - 24), 13 + k * 9, 3 + bass * 4); }
  f.globalAlpha = 1;
}
// whichever of these the current skin needs; the rest are switched off first so two never share the canvas
let aura = null;
function drawAura(t, dt, live) {
  const want = !st.tucked && skyA > 0.5 && ['venom', 'cloud', 'water', 'lava', 'ice'].includes(lookNow) ? lookNow : null;
  if (want !== aura) { drawGoo(t, 0, false); drawCloud(t, 0, false); drawBody(t, 0, null); drawIce(t, 0, false); aura = want; document.body.classList.toggle('scene', !!want); document.body.classList.toggle('venom', want === 'venom'); }
  if (want === 'venom') drawGoo(t, dt, true, live);
  else if (want === 'cloud') drawCloud(t, dt, true, live);
  else if (want === 'ice') drawIce(t, dt, true, live);
  else if (want) drawBody(t, dt, want, live);
}
let dimA = 1;
function drawLook(t, dt, live) {
  const g = skyG;
  g.clearRect(0, 0, SKY_W, SKY_H);
  if (skyA < 0.01) return;
  // behind a row of buttons or a line of text the skin steps back, so everything stays easy to read
  const want = cur === 'idle' || ['cloud', 'water', 'lava', 'ice'].includes(lookDrawn) ? 1 : cur === 'media' || cur === 'held' ? 0.72 : lookDrawn === 'sky' ? 0.8 : 0.55;
  dimA += (want - dimA) * 0.18;
  const W = island.clientWidth, x0 = (SKY_W - W) / 2;
  (PAINT[lookDrawn] || paintSky)(g, t, dt, x0, x0 + W, W, skyA * dimA * (live || ['cloud', 'water', 'lava', 'ice'].includes(lookDrawn) ? 1 : 0.9));
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}
const barsC = $('#bars'), barsG = barsC.getContext('2d');
let idleFrames = 0, lastT = 0, lastPaint = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const playing = st.media.playing && musicOn();
  const look = st.skin !== 'black' ? st.skin : playing && st.visuals && st.react ? 'sky' : null;      // one theme for everything; plain black gets the night sky while music plays
  if (look !== lookNow) {
    if (look && lookNow) skyA = Math.min(skyA, 0.2);       // one skin gives way to another: fade the new one in
    lookNow = look; applyPal();
  }
  if (look) lookDrawn = look;
  skyA += ((look ? 1 : 0) - skyA) * 0.07;
  island.classList.toggle('sky', skyA > 0.4);
  paintSeek();
  if (!playing && energy < 0.004) {
    if (skyA < 0.01) {
      if (idleFrames++ === 2) { drawAura(t, 0, false); glow.style.opacity = 0; skyG.clearRect(0, 0, SKY_W, SKY_H); barsG.clearRect(0, 0, barsC.width, barsC.height); }
      lastT = t;
      return;
    }
    if (st.tucked) { drawAura(t, 0, false); return; }
    if (t - lastPaint < (aura ? 24 : 45)) return;       // a resting skin moves slowly: about 20 frames a second is plenty
  }
  idleFrames = 0;
  const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t; lastPaint = t;
  sampleLevels(t, playing);

  glow.style.opacity = playing && st.react && (!aura || aura === 'lava') ? (skyA * clamp(0.1 + bass * 0.34, 0, 0.42)).toFixed(3) : 0;
  glow.style.transform = `scale(${(1 + bass * 0.1).toFixed(3)}, ${(1 + bass * 0.45).toFixed(3)})`;
  if (st.react) { drawLook(t, dt, playing); drawAura(t, dt, playing); }
  else {            // the theme stays calm: for a moment the painters see silence
    const keep = levels.slice(), b = bass, bs = bassSlow, e = energy;
    levels.fill(0); bass = 0; bassSlow = 0; energy = 0;
    drawLook(t, dt, false); drawAura(t, dt, false);
    levels.set(keep); bass = b; bassSlow = bs; energy = e;
  }

  if (cur === 'media') {
    const w = barsC.width, h = barsC.height, n = 5, bw = 6, gap = 5, x0 = (w - (n * bw + (n - 1) * gap)) / 2;
    barsG.clearRect(0, 0, w, h);
    barsG.fillStyle = document.body.classList.contains('daylight') ? '#18222f' : '#fff';
    for (let i = 0; i < n; i++) {
      const v = clamp(levels[1 + i * 4] * 1.5, 0.14, 1), bh = v * (h - 4);
      barsG.beginPath(); barsG.roundRect(x0 + i * (bw + gap), (h - bh) / 2, bw, bh, 3); barsG.fill();
    }
  }
}
requestAnimationFrame(frame);

// ------------------------------------------------------------ track position + scrubbing
// A hairline along the bottom of the pill shows where the track is. Bring the cursor to that edge and it
// thickens into a scrubber: click or drag to jump (only for players that allow it).
const seekEl = $('#seek'), fmtT = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + pad(s % 60); };
let scrubRatio = 0, artistText = '';
const mediaPos = () => { const m = st.media; return clamp(m.pos + (m.playing ? performance.now() - m.at : 0), 0, m.dur || 0); };
function paintSeek() {
  const m = st.media, on = cur === 'media' && m.dur > 0 && !st.tucked;
  if (seekEl.classList.contains('on') !== on) seekEl.classList.toggle('on', on);
  if (seekEl.classList.contains('can') !== !!m.canSeek) seekEl.classList.toggle('can', !!m.canSeek);
  if (!on) return;
  const r = st.scrubbing ? scrubRatio : mediaPos() / m.dur;
  $('#seek-fill').style.width = (r * 100).toFixed(2) + '%';
  $('#seek-knob').style.left = (r * 100).toFixed(2) + '%';
}
const ratioAt = (e) => { const r = seekEl.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); };
seekEl.addEventListener('pointerdown', (e) => {
  if (!st.media.canSeek) return;
  e.preventDefault();
  try { seekEl.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  st.scrubbing = true; seekEl.classList.add('scrub');
  artistText = $('#m-artist').textContent;
  scrubRatio = ratioAt(e);
  $('#m-artist').textContent = fmtT(scrubRatio * st.media.dur) + ' / ' + fmtT(st.media.dur);
});
seekEl.addEventListener('pointermove', (e) => {
  if (!st.scrubbing) return;
  scrubRatio = ratioAt(e);
  $('#m-artist').textContent = fmtT(scrubRatio * st.media.dur) + ' / ' + fmtT(st.media.dur);
});
function endScrub(apply) {
  if (!st.scrubbing) return;
  st.scrubbing = false; seekEl.classList.remove('scrub');
  $('#m-artist').textContent = st.media.artist || artistText || '';
  if (apply && st.media.dur > 0) {
    const ms = Math.round(scrubRatio * st.media.dur);
    st.media.pos = ms; st.media.at = performance.now(); st.seekAt = Date.now();   // show it at once; the player confirms shortly
    window.qazi.seek(ms);
  }
  st.leftAt = Date.now();
}
seekEl.addEventListener('pointerup', () => endScrub(true));
seekEl.addEventListener('pointercancel', () => endScrub(false));

// ------------------------------------------------------------ clock / date / battery
const pad = (n) => String(n).padStart(2, '0');
const fWeek = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
const fGreg = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const fShamsi = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { day: 'numeric', month: 'long' });
const fShamsiFa = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long' });
const parts = (f, d) => Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
const CALENDARS = ['gregorian', 'shamsi', 'shamsi-fa', 'both'];
function dateText(d) {
  const wk = fWeek.format(d), g = fGreg.format(d);
  const sp = parts(fShamsi, d), sh = sp.day + ' ' + sp.month;
  if (st.calendar === 'shamsi') return wk + ', ' + sh;
  if (st.calendar === 'shamsi-fa') { const p = parts(fShamsiFa, d); return p.weekday + ' ' + p.day + ' ' + p.month; }
  if (st.calendar === 'both') return g + ' · ' + sh;
  return wk + ', ' + g;
}
$('#t-date').addEventListener('click', () => {
  st.calendar = CALENDARS[(CALENDARS.indexOf(st.calendar) + 1) % CALENDARS.length];
  window.qazi.setCalendar(st.calendar); tick(); render();
});
const mmss = (ms) => { const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600); return (h ? h + ':' : '') + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60); };
function tick() {
  const d = new Date(), hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const left = timer.running ? Math.max(0, timer.endAt - Date.now()) : timer.left;
  if (timer.running && left <= 0) {
    timer.running = false; timer.left = 0; timer.done = true;
    beep(); showNotif({ app: 'Timer', title: 'Time is up', body: '' });
  }
  const it = $('#i-time');
  it.textContent = timer.running ? mmss(left) : hm;
  it.classList.toggle('count', timer.running);
  views.idle.classList.toggle('faceon', st.face === 'eyes' && !timer.running);
  $('#t-time').textContent = hm;
  const dt = dateText(d), td = $('#t-date');
  if (td.textContent !== dt) td.textContent = dt;
  $('#tm-time').textContent = mmss(left);
  $('#tm-time').classList.toggle('done', timer.done);
  $('#m-timer').textContent = timer.running ? mmss(left) : '';
  views.media.classList.toggle('timing', timer.running);
  setIcon($('#tm-start'), timer.running ? 'pause' : 'play');
}
setInterval(tick, 200);

if (navigator.getBattery) {
  navigator.getBattery().then((b) => {
    let warned = false;
    b.addEventListener('chargingchange', () => {       // charger plugged in / pulled out
      if (!st.deviceAlerts) return;
      const pct = Math.round(b.level * 100) + '%';
      if (b.charging) showHud('bolt', 'Charging', pct, 2600, 'green pop'); else showHud('plug', 'On battery', pct, 2400, 'faded');
    });
    const paint = () => {
      const pct = Math.round(b.level * 100);
      // desktops report a permanently full, charging battery — don't show that
      $('#t-bat').textContent = b.charging && pct === 100 ? '' : pct + '%' + (b.charging ? ' ⚡' : '');
      if (!b.charging && b.level <= 0.15 && !warned) { warned = true; showNotif({ app: 'Battery', title: 'Low battery', body: pct + '% left — plug in your charger' }); }
      if (b.charging) warned = false;
    };
    paint(); b.addEventListener('levelchange', paint); b.addEventListener('chargingchange', paint);
  }).catch(() => {});
}

// ------------------------------------------------------------ tools
$$('[data-act]').forEach((b) => b.addEventListener('click', async () => {
  const a = b.dataset.act;
  if (a === 'inbox') { setStack(!(st.stackOpen && st.stackKind === 'notifs'), 'notifs'); return; }
  if (a === 'shelf') { setStack(!(st.stackOpen && st.stackKind === 'files'), 'files'); return; }
  if (a === 'timer') { setStack(false); st.manual = 'timer'; render(); return; }
  if (a === 'settings') { setStack(!(st.stackOpen && st.stackKind === 'settings'), 'settings'); return; }
  if (a === 'notes') { if (st.stackOpen && st.stackKind === 'notes') setStack(false); else quickNote(); return; }
  if (a === 'vault') { setStack(!(st.stackOpen && st.stackKind === 'vault'), 'vault'); return; }
  if (a === 'clips') { setStack(!(st.stackOpen && st.stackKind === 'clips'), 'clips'); return; }
  if (a === 'speedo') { setStack(!(st.stackOpen && st.stackKind === 'speedo'), 'speedo'); return; }
  window.qazi.action(a);
}));

// ------------------------------------------------------------ timer
function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.22, 0.44, 0.9, 1.12, 1.34].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = i % 3 === 2 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => ctx.close(), 2500);
  } catch { /* no audio device */ }
}
function nudge(dir) {
  if (timer.running) { timer.endAt = Math.max(Date.now() + 1000, timer.endAt + dir * 60000); return; }
  const min = Math.round(timer.left / 60000);
  const step = (dir > 0 ? min >= 10 : min > 10) ? 5 : 1;
  timer.left = clamp(min + dir * step, 1, 180) * 60000; timer.done = false;
}
$('#tm-minus').addEventListener('click', () => { nudge(-1); tick(); });
$('#tm-plus').addEventListener('click', () => { nudge(1); tick(); });
$('#tm-start').addEventListener('click', () => {
  if (timer.running) { timer.left = Math.max(0, timer.endAt - Date.now()); timer.running = false; }
  else { if (timer.left <= 0) timer.left = 25 * 60000; timer.done = false; timer.endAt = Date.now() + timer.left; timer.running = true; }
  tick(); render();
});
$('#tm-reset').addEventListener('click', () => { timer.running = false; timer.done = false; timer.left = 25 * 60000; tick(); render(); });

// ------------------------------------------------------------ one line of typing on the pill
// ask() turns the pill into a text field and resolves with what was typed (null = cancelled).
// With keep:true the field stays open after Enter, for a follow-up question.
// With stay:true (the password steps) clicking another window does not cancel: the field waits on the pill,
// the keyboard goes back to that window, and a click on the field picks it up again.
let askDone = null, askKeep = false, askAt = 0, askStay = false;
const inText = $('#in-text');
function setParked(on) {
  st.parked = on;
  island.classList.toggle('parked', on);
  syncMouse(); render();
}
function closeTyping(restore) {
  if (!st.typing) return;
  st.typing = false; inText.blur();
  if (st.parked) setParked(false);
  window.qazi.setTyping(false, restore);
  st.leftAt = Date.now(); syncMouse(); render();
}
function ask(o) {
  return new Promise((resolve) => {
    if (askDone) { const d = askDone; askDone = null; d(null); }
    setIcon($('#in-icon'), o.icon || 'jot');
    inText.type = o.secret ? 'password' : 'text';
    inText.placeholder = o.placeholder || ''; inText.value = o.value || '';
    $('#in-hint').textContent = o.hint || '';
    askKeep = !!o.keep; askStay = !!o.stay; askAt = Date.now();
    askDone = resolve;
    const first = !st.typing;
    st.keys = false;                       // the field takes over the keyboard that a search box may have held
    st.typing = true; if (st.parked) setParked(false); syncMouse(); render();
    window.qazi.setTyping(true).then((ctx) => {
      if (first && ctx && ctx.title !== undefined) st.ctx = ctx;        // what the user was looking at before
      if (o.fill && !inText.value) inText.value = o.fill() || '';
      setTimeout(() => { inText.focus(); inText.select(); }, first ? 90 : 0);
    });
  });
}
function answer(v) {
  if (!askDone) return;
  const d = askDone; askDone = null;
  if (v === null || !askKeep) closeTyping(true);
  d(v);
}
inText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); answer(inText.value); }
  else if (e.key === 'Escape') { e.preventDefault(); answer(null); }
});
$('#in-ok').addEventListener('click', () => answer(inText.value));
$('#in-cancel').addEventListener('click', () => answer(null));
// clicking somewhere else puts the field away (without pulling the focus back) — or, for the password steps,
// leaves it waiting on the pill
window.addEventListener('blur', () => {
  if (st.keys) {
    st.keys = false; if (!st.typing) window.qazi.setTyping(false, false);
    if (st.stackOpen && st.stackKind === 'vault') markSel();
  }
  if (!st.typing || st.parked) return;
  if (askStay) {
    setTimeout(() => {
      if (st.typing && !st.parked && askStay && !document.hasFocus()) { setParked(true); window.qazi.setTyping(false, false); }
    }, 250);
    return;
  }
  if (Date.now() - askAt < 500) return;
  const d = askDone; askDone = null;
  closeTyping(false);
  if (d) d(null);
});
// back on the waiting field: it takes the keyboard again (its buttons work without that)
views.input.addEventListener('pointerdown', (e) => {
  if (!st.parked || e.target.closest('button')) return;
  setParked(false);
  window.qazi.setTyping(true).then(() => setTimeout(() => inText.focus(), 40));
});

// a search box under the pill borrows the keyboard the same way, and gives it back when it is done
function holdKeys(then) {
  if (st.keys || st.typing) { if (then) then(); return; }
  st.keys = true;
  // the page only gets the keyboard once Windows has brought the window forward: focus after that
  window.qazi.setTyping(true).then(() => setTimeout(() => { if (st.keys && then) then(); }, 90));
}
window.addEventListener('focus', () => {
  const q = $('#v-search');
  if (st.keys && q && st.stackOpen && st.stackKind === 'vault' && document.activeElement !== q) q.focus();
});
// buttons under the pill never take the focus away from a search box
stackEl.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
function releaseKeys(restore) {
  if (!st.keys) return;
  st.keys = false;
  if (!st.typing) window.qazi.setTyping(false, !!restore);
}

// ------------------------------------------------------------ quick notes
// Jot a line and it is kept. A time in the line ("call Ali in 20m", "at 18:30 gym", "۱۰ دقیقه دیگه چای")
// turns it into a reminder that comes back as a notification.
const faDigits = (s) => s.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
function parseReminder(raw) {
  const text = faDigits(raw);
  const clean = (m) => (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim() || raw.trim();
  let m = /(?:^|\s)(?:in|after)\s+(\d+(?:\.\d+)?)\s*(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)(?=\s|$)/i.exec(text);
  if (m) {
    const u = m[2][0].toLowerCase(), k = u === 's' ? 1000 : u === 'm' ? 60000 : 3600000;
    return { text: clean(m), at: Date.now() + Math.round(parseFloat(m[1]) * k) };
  }
  m = /(\d+)\s*(ثانیه|دقیقه|ساعت)\s*(?:دیگه|دیگر|بعد)/.exec(text);
  if (m) { const k = m[2] === 'ثانیه' ? 1000 : m[2] === 'دقیقه' ? 60000 : 3600000; return { text: clean(m), at: Date.now() + Number(m[1]) * k }; }
  m = /(?:^|\s)(tomorrow\s+|فردا\s+)?(?:at|ساعت)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?=\s|$)/i.exec(text);
  if (m) {
    let h = Number(m[2]); const min = Number(m[3] || 0), ap = (m[4] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) return { text: raw.trim(), at: 0 };
    const d = new Date(); d.setHours(h, min, 0, 0);
    if (m[1] || d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return { text: clean(m), at: d.getTime() };
  }
  return { text: raw.trim(), at: 0 };
}
const fmtWhen = (ts) => {
  const d = new Date(ts), left = ts - Date.now();
  if (left > 0 && left < 3600000) return 'in ' + Math.max(1, Math.round(left / 60000)) + 'm';
  const day = d.toDateString() === new Date().toDateString() ? '' : fWeek.format(d) + ' ';
  return day + pad(d.getHours()) + ':' + pad(d.getMinutes());
};
function setNotes(list) {
  st.notes = Array.isArray(list) ? list : [];
  if (st.stackOpen && st.stackKind === 'notes') { const y = stackList.scrollTop; renderStack(); stackList.scrollTop = y; }
}
window.qazi.onNotes(setNotes);
window.qazi.notesGet().then(setNotes);
async function quickNote(edit) {
  setStack(true, 'notes');
  const v = await ask({ icon: 'jot', placeholder: 'Jot it down…  “call Ali in 20m” reminds you', value: edit ? edit.text : '', hint: '↵' });
  if (v === null || !v.trim()) return;
  const r = parseReminder(v);
  setNotes(await window.qazi.noteSave(edit ? edit.id : null, r.text, r.at));
  setStack(false);
  showHud(r.at ? 'bell' : 'jot', r.at ? 'Reminder ' + fmtWhen(r.at) : 'Noted', r.text, 2000, 'pop');
  emote('happy', 1200);
}
function renderNotes() {
  $('#stack-clear').classList.add('hidden');
  if (!st.notes.length) {
    const e = document.createElement('div'); e.className = 'row empty wide'; e.textContent = 'Nothing noted yet — type and press Enter';
    stackList.appendChild(e); return;
  }
  st.notes.forEach((n, i) => {
    const row = document.createElement('div'); row.className = 'row clip note' + (n.pinned ? ' pinned' : '') + (n.remind && n.fired ? ' done' : ''); row.style.setProperty('--i', Math.min(i, 6));
    row.title = 'Click to copy — double-click to edit';
    const pin = document.createElement('button'); pin.className = 'pin'; pin.title = n.pinned ? 'Unpin' : 'Pin on top'; pin.innerHTML = svg(n.pinned ? 'pinned' : 'pin');
    const box = document.createElement('span'); box.className = 'mqbox'; box.dir = 'auto';
    const mq = document.createElement('span'); mq.className = 'mq'; mq.textContent = n.text.replace(/\s+/g, ' ');
    box.appendChild(mq);
    row.append(pin, box);
    if (n.remind) {
      const chip = document.createElement('span'); chip.className = 'chip' + (n.fired ? ' off' : ''); chip.innerHTML = svg('bell') + fmtWhen(n.remind);
      chip.title = n.fired ? 'Reminded' : 'Reminder at ' + new Date(n.remind).toLocaleString();
      row.appendChild(chip);
    }
    const tm = document.createElement('span'); tm.className = 'tm dim'; tm.textContent = rel(n.at);
    const x = document.createElement('button'); x.className = 'x'; x.title = 'Delete'; x.innerHTML = svg('close');
    row.append(tm, x);
    row.addEventListener('mouseenter', () => startMarquee(box));
    row.addEventListener('mouseleave', () => stopMarquee(box));
    let clickT = 0;
    row.addEventListener('click', () => { clearTimeout(clickT); clickT = setTimeout(() => { window.qazi.copy(n.text); flash('Copied — paste with Ctrl+V'); }, 230); });
    row.addEventListener('dblclick', () => { clearTimeout(clickT); quickNote(n); });
    pin.addEventListener('click', (e) => { e.stopPropagation(); window.qazi.notePin(n.id).then(setNotes); });
    x.addEventListener('click', (e) => { e.stopPropagation(); window.qazi.noteRemove(n.id).then(setNotes); });
    stackList.appendChild(row);
  });
}
// reminders that are due come back as a notification (even over a fullscreen app: you asked for it)
setInterval(() => {
  const now = Date.now();
  for (const n of st.notes) {
    if (!n.remind || n.fired || n.remind > now) continue;
    n.fired = true;
    window.qazi.noteFired(n.id).then(setNotes);
    beep(); showNotif({ app: 'Reminder', title: n.text.replace(/\s+/g, ' '), body: '', long: true, action: 'note' });
  }
}, 3000);

// ------------------------------------------------------------ passwords
// The vault lives encrypted on the Rust side; the page only ever sees names, never the stored passwords.
function setVault(v) {
  st.vault = v && Array.isArray(v.items) ? v : { items: [] };
  if (st.stackOpen && st.stackKind === 'vault') { const y = stackList.scrollTop; renderStack(); stackList.scrollTop = y; }
}
window.qazi.onVault(setVault);
const BROWSERS = /\s[-–—]\s(Google Chrome|Mozilla Firefox|Microsoft​? ?Edge|Brave|Opera|Vivaldi|Firefox|Chromium|Arc)[^-–—]*$/i;
function guessSite(ctx) {       // "Sign up · GitHub - Google Chrome" → "GitHub"
  if (!ctx) return '';
  let t = (ctx.title || '').replace(/\s[-–—]\s(Personal|Profile \d+|Work)\b.*$/i, '');
  if (BROWSERS.test(t)) {
    t = t.replace(BROWSERS, '');
    const parts = t.split(/\s[-–—|·•:]\s/).map((s) => s.trim()).filter(Boolean);
    return (parts[parts.length - 1] || '').slice(0, 60);
  }
  const exe = (ctx.exe || '').replace(/\.exe$/i, '');
  return /^(explorer|searchhost|shellexperiencehost|applicationframehost)$/i.test(exe) ? '' : exe.charAt(0).toUpperCase() + exe.slice(1);
}
async function newGen() {
  st.gen.pass = await window.qazi.vaultGenerate(st.gen.len, st.gen.symbols);
  $('#g-pass').textContent = st.gen.pass; $('#g-len').textContent = st.gen.len;
  $('#g-sym').classList.toggle('off', !st.gen.symbols);
  render();
}
// the fresh password stays on the pill until it is used (✓) or put away (✕), whatever else is clicked meanwhile
async function openGen() { setStack(false); await newGen(); st.manual = 'gen'; render(); }
$('#g-cancel').addEventListener('click', () => { st.manual = null; st.gen.pass = ''; $('#g-pass').textContent = ''; st.leftAt = Date.now(); render(); });
$('#g-again').addEventListener('click', newGen);
$('#g-minus').addEventListener('click', () => { st.gen.len = clamp(st.gen.len - 2, 8, 40); window.qazi.setSetting('vaultLength', st.gen.len); newGen(); });
$('#g-plus').addEventListener('click', () => { st.gen.len = clamp(st.gen.len + 2, 8, 40); window.qazi.setSetting('vaultLength', st.gen.len); newGen(); });
$('#g-sym').addEventListener('click', () => { st.gen.symbols = !st.gen.symbols; window.qazi.setSetting('vaultSymbols', st.gen.symbols); newGen(); });
$('#g-ok').addEventListener('click', async () => {
  const pass = st.gen.pass; st.manual = null;
  const ctx = await window.qazi.fgContext();          // the page it is for, read before anything takes the focus from it
  if (ctx && ctx.title !== undefined) st.ctx = ctx;
  await window.qazi.copySecret(pass);                 // ready to paste into the sign-up form right away
  saveLogin(pass, true);
});
// A password is kept the moment it is made (or typed in), under the name the window suggests. The questions after
// that only name it: leaving them halfway, or for good, never loses the password.
async function saveLogin(pass, generated) {
  if (!generated) {
    pass = await ask({ icon: 'key', placeholder: 'Type or paste the password', secret: true, hint: '1/3', keep: true, stay: true });
    if (!pass) { if (pass !== null) closeTyping(true); return; }
  }
  const guess = guessSite(st.ctx) || 'Untitled';
  const id = await window.qazi.vaultSave(guess, '', pass);
  if (!id) {
    closeTyping(true);
    showHud('key', 'Could not save', generated ? 'the password is still on your clipboard' : '', 3200, 'faded');
    return;
  }
  const n = generated ? 2 : 3;
  const site = await ask({ icon: 'key', placeholder: 'Saved. What is it for?  (site or app)', value: guess === 'Untitled' ? '' : guess, hint: (n - 1) + '/' + n, keep: true, stay: true });
  if (site === null) { showHud('key', 'Saved as ' + guess, 'rename it any time under Passwords', 2800, 'green'); return; }
  const name = site.trim() || guess;
  const user = await ask({ icon: 'user', placeholder: 'Email or username', value: st.lastUser, hint: n + '/' + n, stay: true });
  const ok = await window.qazi.vaultEdit(id, name, user === null ? '' : user);
  showHud('key', 'Saved', name + (ok ? '' : ' · the name could not be changed') + (generated ? ' · password is on your clipboard' : ''), 2600, ok ? 'green pop' : 'faded');
  emote('happy', 1200);
}
// rename an entry / fix its username (the password stays)
async function editLogin(v) {
  const site = await ask({ icon: 'key', placeholder: 'Site or app', value: v.site, hint: '1/2', keep: true, stay: true });
  if (site === null) return;
  const user = await ask({ icon: 'user', placeholder: 'Email or username', value: v.user, hint: '2/2', stay: true });
  if (user === null) return;
  const ok = await window.qazi.vaultEdit(v.id, site, user);
  showHud('key', ok ? 'Updated' : 'Could not update', site.trim() || 'Untitled', 2000, ok ? 'green' : 'faded');
}
// The list stays open while you go back and forth to the page you are signing in to. A search box on top
// narrows it; Enter copies the password of the highlighted row, Shift+Enter its username, Esc clears / closes.
function vaultFound() {
  const q = st.vaultQ.trim().toLowerCase();
  if (!q) return st.vault.items;
  const words = q.split(/\s+/);
  const rank = (v) => { const s = (v.site || '').toLowerCase(); return s.startsWith(q) ? 0 : s.includes(q) ? 1 : 2; };
  return st.vault.items
    .filter((v) => { const hay = ((v.site || '') + ' ' + (v.user || '')).toLowerCase(); return words.every((w) => hay.includes(w)); })
    .sort((a, b) => rank(a) - rank(b));
}
function markSel() {
  const on = !!(st.vaultQ.trim() || st.keys);
  $$('#stack-list .row.vault').forEach((r, i) => {
    r.classList.toggle('sel', on && i === st.vaultSel);
    if (on && i === st.vaultSel) r.scrollIntoView({ block: 'nearest' });
  });
}
async function copyLogin(v, what) {
  const ok = await window.qazi.vaultCopy(v.id, what);
  flash(!ok ? 'Could not copy' : what === 'user' ? 'Username copied' : 'Password copied — clears in 30s');
  if (!ok) return;
  const btn = stackList.querySelector(`.row.vault[data-id="${v.id}"] .act.${what}`);
  if (btn) {
    btn.classList.add('ok'); btn.innerHTML = svg('check');
    setTimeout(() => { btn.classList.remove('ok'); btn.innerHTML = svg(what === 'user' ? 'user' : 'key'); }, 1500);
  }
  releaseKeys(true);       // straight back to the page being filled in, so Ctrl+V pastes there
}
function vaultHead() {
  if (stackHead.dataset.kind === 'vault') return;
  stackHead.dataset.kind = 'vault'; stackHead.textContent = ''; stackHead.classList.add('on');
  const box = document.createElement('label'); box.className = 'search'; box.innerHTML = svg('search');
  const q = document.createElement('input'); q.id = 'v-search'; q.type = 'text'; q.spellcheck = false; q.autocomplete = 'off'; q.dir = 'auto';
  q.placeholder = 'Search'; q.value = st.vaultQ;
  box.title = 'Enter copies the password · Shift+Enter the username · Esc clears';
  box.appendChild(q);
  box.addEventListener('pointerdown', () => { holdKeys(() => q.focus()); markSel(); });
  q.addEventListener('focus', () => { holdKeys(); markSel(); });
  q.addEventListener('input', () => { st.vaultQ = q.value; st.vaultSel = 0; renderStack(); stackList.scrollTop = 0; });
  q.addEventListener('keydown', (e) => {
    const list = vaultFound();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      st.vaultSel = clamp(st.vaultSel + (e.key === 'ArrowDown' ? 1 : -1), 0, Math.max(0, list.length - 1)); markSel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const v = list[st.vaultSel]; if (v) copyLogin(v, e.shiftKey ? 'user' : 'pass');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (q.value) { q.value = ''; st.vaultQ = ''; st.vaultSel = 0; renderStack(); } else setStack(false);
    }
  });
  const btn = (icon, label, title, fn) => {
    const b = document.createElement('button'); b.className = 'pillbtn'; b.title = title;
    b.innerHTML = svg(icon) + (label ? `<span>${label}</span>` : ''); b.addEventListener('click', fn); return b;
  };
  const g = btn('bolt', 'New', 'Make a new password', openGen);
  const a = btn('plus', 'Add', 'Save a password you already have', () => { setStack(false); saveLogin('', false); });
  const x = btn('close', '', 'Close the passwords', () => setStack(false)); x.classList.add('round');
  stackHead.append(box, g, a, x);
}
function renderVault() {
  $('#stack-clear').classList.add('hidden');
  vaultHead();
  const note = (text) => { const e = document.createElement('div'); e.className = 'row empty wide'; e.textContent = text; stackList.appendChild(e); };
  if (st.vault.locked) note('Password storage is unavailable. Install and unlock GNOME Keyring or another Secret Service provider, then restart Peeky.');
  const list = vaultFound();
  st.vaultSel = clamp(st.vaultSel, 0, Math.max(0, list.length - 1));
  if (!st.vault.items.length) { if (!st.vault.locked) note('No passwords yet — New makes one'); return; }
  if (!list.length) { note('Nothing matches “' + st.vaultQ.trim() + '”'); return; }
  const showSel = !!(st.vaultQ.trim() || st.keys);
  list.forEach((v, i) => {
    const row = document.createElement('div'); row.className = 'row vault' + (showSel && i === st.vaultSel ? ' sel' : ''); row.style.setProperty('--i', Math.min(i + 1, 6));
    row.dataset.id = v.id;
    row.title = 'Click to copy the password (it leaves the clipboard after 30 seconds)';
    const ic = document.createElement('div'); ic.className = 'ic'; ic.textContent = (v.site || '•').trim().charAt(0).toUpperCase();
    const box = document.createElement('span'); box.className = 'mqbox'; box.dir = 'auto';
    const mq = document.createElement('span'); mq.className = 'mq'; const b = document.createElement('b'); b.textContent = v.site || 'Untitled'; mq.appendChild(b);
    box.appendChild(mq);
    const who = document.createElement('span'); who.className = 'who dim'; who.textContent = v.user; who.dir = 'ltr';
    const cu = document.createElement('button'); cu.className = 'act user'; cu.title = 'Copy the email / username'; cu.innerHTML = svg('user');
    const cp = document.createElement('button'); cp.className = 'act pass'; cp.title = 'Copy the password'; cp.innerHTML = svg('key');
    const ey = document.createElement('button'); ey.className = 'act'; ey.title = 'Show the password for a moment'; ey.innerHTML = svg('eye');
    const ed = document.createElement('button'); ed.className = 'act'; ed.title = 'Rename / change the username'; ed.innerHTML = svg('edit');
    const x = document.createElement('button'); x.className = 'x show'; x.title = 'Delete'; x.innerHTML = svg('close');
    row.append(ic, box, who);
    if (v.user) row.appendChild(cu);
    row.append(cp, ey, ed, x);
    ed.addEventListener('click', (e) => { e.stopPropagation(); editLogin(v); });
    row.addEventListener('mouseenter', () => startMarquee(box));
    row.addEventListener('mouseleave', () => stopMarquee(box));
    row.addEventListener('click', () => { st.vaultSel = i; markSel(); copyLogin(v, 'pass'); });
    cu.addEventListener('click', (e) => { e.stopPropagation(); st.vaultSel = i; markSel(); copyLogin(v, 'user'); });
    cp.addEventListener('click', (e) => { e.stopPropagation(); st.vaultSel = i; markSel(); copyLogin(v, 'pass'); });
    ey.addEventListener('click', async (e) => {
      e.stopPropagation();
      const p = await window.qazi.vaultReveal(v.id); if (!p) return;
      who.textContent = p; who.classList.remove('dim'); who.style.fontFamily = 'Consolas, monospace';
      setTimeout(() => { who.textContent = v.user; who.classList.add('dim'); who.style.fontFamily = ''; }, 4000);
    });
    let sureT = 0;
    x.addEventListener('click', (e) => {       // two clicks: the first one only arms it
      e.stopPropagation();
      if (x.classList.contains('sure')) { window.qazi.vaultRemove(v.id); return; }
      x.classList.add('sure'); x.title = 'Click again to delete'; clearTimeout(sureT); sureT = setTimeout(() => x.classList.remove('sure'), 2500);
    });
    stackList.appendChild(row);
  });
}

// ------------------------------------------------------------ Speedo VPN, driven from the pill
// Shows up only when Speedo is running and offers its control pipe: one switch to connect, one for its
// firewall, and the list of locations (click one to move there).
let speedo = { present: false }, spLocs = [], spLocsAt = 0;
async function loadLocations() {
  if (Date.now() - spLocsAt < 60000 && spLocs.length) return;
  const r = await window.qazi.speedo('locations');
  if (r && r.ok && Array.isArray(r.locations)) { spLocs = r.locations; spLocsAt = Date.now(); if (st.stackOpen && st.stackKind === 'speedo') renderStack(); }
}
window.qazi.onSpeedo((s) => {
  const was = speedo; speedo = s || { present: false };
  const bt = $('#t-speedo');
  bt.classList.toggle('hidden', !speedo.present);
  bt.classList.toggle('live', speedo.state === 'connected');
  bt.title = 'Speedo VPN' + (speedo.state === 'connected' && speedo.location ? ' · ' + speedo.location.name : '');
  if (!speedo.present && st.stackOpen && st.stackKind === 'speedo') setStack(false);
  else if (st.stackOpen && st.stackKind === 'speedo') { const y = stackList.scrollTop; renderStack(); stackList.scrollTop = y; }
  if (was.present && speedo.present && was.state !== speedo.state && (speedo.state === 'connected' || was.state === 'connected'))
    showHud('shield', 'Speedo', speedo.state === 'connected' ? 'Connected' + (speedo.location ? ' · ' + speedo.location.name : '') : 'Disconnected', 2400, speedo.state === 'connected' ? 'green pop' : 'faded');
});
window.qazi.speedo('status').then((r) => { if (r && r.ok && r.state && !speedo.present) window.__speedoBoot = r; });
function renderSpeedo() {
  $('#stack-clear').classList.add('hidden');
  const s = speedo, on = s.state === 'connected', busy = s.state === 'connecting';
  const code = (c) => { const e = document.createElement('span'); e.className = 'cc'; e.textContent = (c || '··').slice(0, 2).toUpperCase(); return e; };
  const head = document.createElement('div'); head.className = 'row set sp';
  const lbl = document.createElement('span'); lbl.className = 'lbl';
  const name = document.createElement('b'); name.textContent = s.location ? s.location.name : 'Speedo';
  const sub = document.createElement('span'); sub.className = 'dim'; sub.textContent = !s.signedIn ? 'Sign in inside Speedo first' : busy ? 'Connecting…' : on ? 'Connected' + (s.ip ? ' · ' + s.ip : '') : 'Not connected';
  lbl.append(name, sub);
  const sw = document.createElement('button'); sw.className = 'sw big' + (on ? ' on' : '') + (busy ? ' busy' : ''); sw.title = on || busy ? 'Disconnect' : 'Connect';
  sw.addEventListener('click', () => {
    if (!s.signedIn) { window.qazi.speedo('show'); return; }
    sw.classList.add('busy'); sw.classList.toggle('on');
    window.qazi.speedo(on || busy ? 'disconnect' : 'connect').then((r) => { if (r && r.ok === false) showHud('shield', 'Speedo', r.error || 'Could not do that', 2600, 'red'); });
  });
  head.append(code(s.location && s.location.code), lbl, sw);
  stackList.appendChild(head);
  if (s.firewall !== undefined && s.signedIn) {
    const fw = document.createElement('div'); fw.className = 'row set';
    const l = document.createElement('span'); l.className = 'lbl'; l.textContent = 'Firewall (block traffic outside the VPN)';
    const f = document.createElement('button'); f.className = 'sw' + (s.firewall ? ' on' : '');
    f.addEventListener('click', () => { f.classList.toggle('on'); window.qazi.speedo('firewall', { on: !s.firewall }); });
    fw.append(l, f); stackList.appendChild(fw);
  }
  if (!s.signedIn) return;
  const cur = s.location && s.location.id;
  [...spLocs].sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0)).slice(0, 80).forEach((loc, i) => {
    const row = document.createElement('div'); row.className = 'row loc' + (loc.id === cur ? ' cur' : ''); row.style.setProperty('--i', Math.min(i + 2, 6));
    row.title = loc.id === cur && on ? 'Connected here' : 'Connect to ' + loc.name;
    const box = document.createElement('span'); box.className = 'mqbox'; const b = document.createElement('b'); b.textContent = loc.name; box.appendChild(b);
    row.append(code(loc.code), box);
    if (loc.fav) { const st2 = document.createElement('span'); st2.className = 'dim tm'; st2.textContent = '★'; row.appendChild(st2); }
    if (loc.ping) { const p = document.createElement('span'); p.className = 'dim who'; p.textContent = loc.ping + ' ms'; row.appendChild(p); }
    row.addEventListener('click', () => { row.classList.add('cur'); window.qazi.speedo('connect', { id: loc.id }).then((r) => { if (r && r.ok === false) showHud('shield', 'Speedo', r.error || 'Could not connect', 2600, 'red'); }); });
    stackList.appendChild(row);
  });
}

// ------------------------------------------------------------ settings, as rows under the pill
const SETTINGS_UI = [
  ['button', 'tour', 'What Peeky can do', 'Show me'],
  ['toggle', 'autoStart', 'Start with Windows'],
  ['toggle', 'autoUpdate', 'Update automatically'],
  ['seg', 'face', 'Resting pill shows', [['eyes', 'Eyes'], ['clock', 'Clock']]],
  ['seg', 'calendar', 'Date', [['gregorian', 'Greg.'], ['shamsi', 'Shamsi'], ['shamsi-fa', 'شمسی'], ['both', 'Both']]],
  ['toggle', 'autoHide', 'Hide while a window is underneath'],
  ['toggle', 'hideVideo', 'Stay out of the way for videos'],
  ['swatch', 'skin', 'Theme', ['black', 'nebula', 'crystal', 'ember', 'reactor', 'venom']],        // cloud, water, lava and ice are parked until they are finished
  ['toggle', 'musicReact', 'Theme reacts to music'],
  ['toggle', 'visuals', 'Night sky with music (black theme)'],
  ['step', 'notifSeconds', 'Notification stays for', 2, 10, 's'],
  ['button', 'dnd', "Hide Windows' own banners", 'Open'],
  ['toggle', 'copyPreview', 'Show what was copied'],
  ['toggle', 'clipHistory', 'Clipboard history'],
  ['toggle', 'deviceAlerts', 'Charger and Bluetooth'],
  ['toggle', 'downloadAlerts', 'Finished downloads'],
  ['toggle', 'shelf', 'File shelf'],
  ['toggle', 'netAlerts', 'Internet and VPN changes'],
  ['toggle', 'sensorDot', 'Microphone / camera in use'],
  ['toggle', 'smartCopy', 'Smart copy: links, sums, dates'],
  ['toggle', 'noteHotkey', 'Ctrl+Alt+N note · Ctrl+Alt+T text grab'],
];
function renderSettings() {
  $('#stack-clear').classList.add('hidden');
  const s = st.settings || {};
  if (st.update) {       // a downloaded update is the first thing here, where it can be seen
    const row = document.createElement('div'); row.className = 'row set sp upd';
    const ic = document.createElement('div'); ic.className = 'ic plain'; ic.innerHTML = svg('download');
    const l = document.createElement('span'); l.className = 'lbl';
    const b = document.createElement('b'); b.textContent = 'Version ' + st.update + ' is ready';
    const d = document.createElement('span'); d.className = 'dim';
    d.textContent = s.platform === 'linux'
      ? 'Requires administrator approval; Peeky restarts after installation'
      : (s.autoUpdate !== false ? 'Installs by itself when you step away' : 'Takes a few seconds, then Peeky is back');
    l.append(b, d);
    const go = document.createElement('button'); go.className = 'go solid'; go.textContent = 'Install now';
    go.addEventListener('click', async () => {
      go.textContent = 'Installing…';
      const ok = await window.qazi.updateInstall();
      if (!ok) { go.textContent = 'Install failed'; showHud('alert', 'Update not installed', 'Check the administrator prompt and system package manager', 4200, 'faded'); }
    });
    row.append(ic, l, go);
    stackList.appendChild(row);
  }
  SETTINGS_UI.forEach(([type, key, label, a, b, unit], i) => {
    const row = document.createElement('div'); row.className = 'row set'; row.style.setProperty('--i', Math.min(i, 6));
    const l = document.createElement('span'); l.className = 'lbl'; l.textContent = label; row.appendChild(l);
    if (type === 'toggle') {
      const on = key === 'autoStart' ? !!s.autoStartOn : s[key] !== false;
      const sw = document.createElement('button'); sw.className = 'sw' + (on ? ' on' : '');
      sw.addEventListener('click', () => { sw.classList.toggle('on'); window.qazi.setSetting(key, !on); });
      row.appendChild(sw);
    } else if (type === 'seg') {
      const seg = document.createElement('div'); seg.className = 'seg';
      for (const [val, text] of a) {
        const bt = document.createElement('button'); bt.textContent = text; if ((s[key] || a[0][0]) === val) bt.className = 'on';
        bt.addEventListener('click', () => window.qazi.setSetting(key, val));
        seg.appendChild(bt);
      }
      row.appendChild(seg);
    } else if (type === 'swatch') {
      const now = s[key] || a[0];
      const name = document.createElement('span'); name.className = 'dim swn'; name.textContent = now === 'sky' ? 'Cover colours' : now === 'black' ? 'Black' : THEMES[now].name;
      const box = document.createElement('div'); box.className = 'sws';
      for (const val of a) {
        const bt = document.createElement('button'); bt.className = 'sw-' + val + (val === now ? ' on' : '');
        bt.title = val === 'sky' ? 'Violet night sky' : val === 'black' ? 'Plain black' : THEMES[val].name;
        bt.addEventListener('click', () => window.qazi.setSetting(key, val));
        box.appendChild(bt);
      }
      row.append(name, box);
    } else if (type === 'step') {
      const cur = clamp(Number(s[key]) || a, a, b);
      const mk = (icon, d) => { const bt = document.createElement('button'); bt.className = 'ib small'; bt.innerHTML = svg(icon); bt.addEventListener('click', () => window.qazi.setSetting(key, clamp(cur + d, a, b))); return bt; };
      const num = document.createElement('span'); num.className = 'num'; num.textContent = cur + unit;
      row.append(mk('minus', -1), num, mk('plus', 1));
    } else if (type === 'button') {
      const bt = document.createElement('button'); bt.className = 'go'; bt.textContent = a; bt.addEventListener('click', () => { if (key === 'tour') setStack(true, 'tour'); else window.qazi.action(key); });
      row.appendChild(bt);
    }
    stackList.appendChild(row);
  });
  const info = document.createElement('div'); info.className = 'row set info';
  info.textContent = (s.appName || 'Peeky') + ' ' + (s.version || '');
  const up = document.createElement('button'); up.className = 'go'; up.textContent = st.update ? 'Install ' + st.update : 'Check for updates';
  up.addEventListener('click', async () => {
    if (st.update) { installUpdate(); return; }
    up.textContent = 'Checking…';
    const r = await window.qazi.updateCheck();
    if (r.startsWith('ready')) { st.update = r.slice(6); gearBadge.classList.add('on'); renderStack(); return; }
    else up.textContent = r === 'none' ? 'Up to date' : 'Could not check';
  });
  info.appendChild(up);
  stackList.appendChild(info);
}
// What Peeky can do: one row per feature, under the pill. A click on a row tries the thing itself.
const TOUR = [
  ['note', 'Now playing', 'Play something: cover, title and controls appear here'],
  ['bell', 'Notifications', 'One line on the pill. Click it to open that chat', 'inbox'],
  ['link', 'Smart copy', 'Copy a link, a sum or a date, then click the line'],
  ['tray', 'File shelf', 'Drop files on the pill. Drag them out when you need them'],
  ['scan', 'Text grab', 'Drag a box on the screen, the text is copied', 'ocr', 'Ctrl Alt T'],
  ['jot', 'Quick note', 'One line. "call Ali in 20m" becomes a reminder', 'notes', 'Ctrl Alt N'],
  ['clipboard', 'Clipboard history', 'Everything you copied, with images and pins', 'clips'],
  ['key', 'Passwords', 'Makes one, asks what it is for, keeps it encrypted', 'vault'],
  ['timer', 'Timer', 'Stays in sight while it runs', 'timer'],
  ['gear', 'Themes and settings', 'Liquid skins, Venom, and every switch', 'settings'],
];
function renderTour() {
  $('#stack-clear').classList.add('hidden');
  const head = document.createElement('div'); head.className = 'row empty wide'; head.textContent = 'Hover the pill to open its menu';
  stackList.appendChild(head);
  TOUR.forEach(([icon, title, text, act, keys], i) => {
    const row = document.createElement('div'); row.className = 'row set sp tour' + (act ? ' can' : ''); row.style.setProperty('--i', Math.min(i + 1, 6));
    const ic = document.createElement('div'); ic.className = 'ic plain'; ic.innerHTML = svg(icon);
    const lbl = document.createElement('span'); lbl.className = 'lbl';
    const b = document.createElement('b'); b.textContent = title;
    const d = document.createElement('span'); d.className = 'dim'; d.textContent = text;
    lbl.append(b, d); row.append(ic, lbl);
    if (keys) { const k = document.createElement('span'); k.className = 'keys'; k.textContent = keys; row.appendChild(k); }
    if (act) {
      row.title = 'Try it';
      row.addEventListener('click', () => { st.holdUntil = Date.now() + 6000; const bt = $('[data-act="' + act + '"]'); if (act === 'ocr') setStack(false); if (bt) bt.click(); });
    }
    stackList.appendChild(row);
  });
}
// opened from the tray icon, or by starting the app a second time
window.qazi.onOpen((what) => {
  st.holdUntil = Date.now() + 9000; st.revealUntil = Date.now() + 9000;
  setStack(true, what === 'settings' ? 'settings' : st.stackKind);
});
window.qazi.onHotkey((what) => { if (what === 'note' && !st.typing) { st.holdUntil = Date.now() + 1500; quickNote(); } });

// ------------------------------------------------------------ the face
const face = $('#i-face');
let emoteT = 0;
function emote(name, ms) {
  face.className = name; clearTimeout(emoteT);
  emoteT = setTimeout(() => { face.className = ''; }, ms);
}
const blink = () => emote('blink', 130);
(function faceLoop() {
  if (cur === 'idle' && !st.tucked && st.face === 'eyes' && !face.className) {
    const r = Math.random(), night = new Date().getHours() < 6;
    if (night && r < 0.45) emote('sleepy', 2800);
    else if (r < 0.6) blink();
    else if (r < 0.72) { blink(); setTimeout(blink, 250); }
    else if (r < 0.84) { emote('look-l', 650); setTimeout(() => emote('look-r', 650), 700); }
    else if (r < 0.91) emote('happy', 1300);
    else if (r < 0.96) emote('wink', 380);
    else emote('squint', 900);
  }
  setTimeout(faceLoop, 1700 + Math.random() * 3600);
})();
// The face follows the system pointer on X11. Wayland only reports pointer movement
// while the compositor routes events to Peeky's own surface.
window.qazi.onCursor(({ x, y }) => {
  // pointerleave uses this sentinel on Wayland, where global pointer queries are blocked.
  if (x === -1000 && y === -1000) {
    face.style.setProperty('--lx', '0px');
    face.style.setProperty('--ly', '0px');
    return;
  }
  const dx = x - window.innerWidth / 2, dy = y - 26, d = Math.hypot(dx, dy);
  const k = d > 1 ? Math.min(1, d / 120) : 0;
  face.style.setProperty('--lx', (k ? dx / d * 2.4 * k : 0).toFixed(2) + 'px');
  face.style.setProperty('--ly', (k ? dy / d * 1.6 * k : 0).toFixed(2) + 'px');
});

// ------------------------------------------------------------ boot
let hinted = false, toured = false;
const applySettings = (s) => {
  if (!s) return;
  document.body.classList.toggle('linux-host', s.platform === 'linux');
  st.autoHide = s.autoHide !== false;
  st.hideVideo = s.hideVideo !== false;
  st.notifMs = clamp(Number(s.notifSeconds) || 4, 2, 15) * 1000;
  st.deviceAlerts = s.deviceAlerts !== false;
  st.shelfOn = s.shelf !== false;
  st.visuals = s.visuals !== false;
  st.skin = ['nebula', 'crystal', 'ember', 'reactor', 'venom'].includes(s.skin) ? s.skin : 'black';
  st.musicTheme = THEMES[s.musicTheme] ? s.musicTheme : 'sky';
  st.smartCopy = s.smartCopy !== false;
  st.react = s.musicReact !== false;
  if (s.netAlerts === false) { st.net = { online: true, vpn: '', proxy: false }; paintStatus(); }
  st.calendar = CALENDARS.includes(s.calendar) ? s.calendar : 'gregorian';
  st.face = s.face === 'clock' ? 'clock' : 'eyes';
  st.settings = s; st.lastUser = s.lastUser || '';
  st.gen.len = Number(s.vaultLength) || 18; st.gen.symbols = s.vaultSymbols !== false;
  if (st.stackOpen && st.stackKind === 'settings') { const y = stackList.scrollTop; renderStack(); stackList.scrollTop = y; }
  tick(); render();
  if (!s.toured && !toured) {        // the first start: say hello and offer the list of what it can do
    toured = true;
    setTimeout(() => {
      showNotif({ app: 'Welcome', title: "Hi, I'm Peeky", body: 'Click to see what I can do', action: 'tour', long: true });
      window.qazi.setSetting('toured', true);
    }, 1800);
  }
  if (!s.dndHint && !hinted) {       // one-time guide: Windows has no switch an app may flip, so point at it
    hinted = true;
    setTimeout(() => {
      showNotif({ app: 'Tip', title: 'Banners only here?', body: 'Click, then switch on "Do not disturb"', action: 'dnd', long: true });
      window.qazi.hintShown();
    }, 3500);
  }
};
// something was copied: show what, for a moment (can be switched off in Settings)
// Smart copy: some things are worth more than "Copied". A link can be opened, a sum has an answer, a date has
// its twin in the other calendar, a colour can be seen. One click on the line does the obvious thing.
function calc(src) {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/,(?=\d{3}(\D|$))/g, '').replace(/\s+/g, '');
  let i = 0;
  const num = () => { const m = /^\d*\.?\d+/.exec(s.slice(i)); if (!m) throw 0; i += m[0].length; let v = parseFloat(m[0]); if (s[i] === '%') { i++; v /= 100; } return v; };
  const atom = () => {
    if (s[i] === '(') { i++; const v = expr(); if (s[i++] !== ')') throw 0; return v; }
    if (s[i] === '-') { i++; return -atom(); }
    if (s[i] === '+') { i++; return atom(); }
    return num();
  };
  const pow = () => { const b = atom(); if (s[i] === '^') { i++; return Math.pow(b, pow()); } return b; };
  const term = () => { let v = pow(); while (s[i] === '*' || s[i] === '/') { const o = s[i++], r = pow(); v = o === '*' ? v * r : v / r; } return v; };
  const expr = () => { let v = term(); while (s[i] === '+' || s[i] === '-') { const o = s[i++], r = term(); v = o === '+' ? v + r : v - r; } return v; };
  try { const v = expr(); return i === s.length && isFinite(v) ? v : null; } catch { return null; }
}
function jalaliToGregorian(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097); days %= 146097;
  if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let gd = days + 1, gm = 1;
  const len = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (; gm <= 12 && gd > len[gm]; gm++) gd -= len[gm];
  return [gy, gm, gd];
}
function smart(raw) {
  const t = faDigits(raw.trim());
  if (!t || t.length > 300) return null;
  const copyIt = (v) => () => window.qazi.copy(v);
  if (/^https?:\/\/[^\s"<>]+$/i.test(t)) {
    let host = t; try { host = new URL(t).host.replace(/^www\./, ''); } catch { return null; }
    return { icon: 'link', title: host, text: 'click to open', tone: 'blue pop', act: () => window.qazi.openUrl(t) };
  }
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t);
  if (m) {
    const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1], n = parseInt(h, 16), rgb = `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
    return { icon: 'drop', title: '#' + h.toUpperCase(), text: rgb + ' · click to copy', color: '#' + h, act: copyIt(rgb) };
  }
  m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    if (y >= 1900 && y <= 2100) {
      const sh = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(y, mo - 1, d));
      const long = new Intl.DateTimeFormat('en-u-ca-persian', { day: 'numeric', month: 'long', weekday: 'short' }).format(new Date(y, mo - 1, d));
      return { icon: 'cal', title: sh, text: long + ' · click to copy', act: copyIt(sh) };
    }
    if (y >= 1300 && y <= 1500) {
      const [gy, gm, gd] = jalaliToGregorian(y, mo, d), g = `${gy}-${pad(gm)}-${pad(gd)}`;
      const long = new Date(gy, gm - 1, gd).toLocaleDateString('en', { day: 'numeric', month: 'long', weekday: 'short' });
      return { icon: 'cal', title: g, text: long + ' · click to copy', act: copyIt(g) };
    }
    return null;
  }
  // a sum: digits and operators only, and not something that merely looks like one (a phone number, a range)
  if (t.length <= 80 && /^[\d\s+\-*/().,%^×÷]+$/.test(t) && /\d\s*[+*/^×÷]\s*[\d(-]|\d\s+-\s+[\d(]/.test(t) && !/^0\d+-/.test(t)) {
    const v = calc(t);
    if (v === null) return null;
    const out = String(Math.round(v * 1e8) / 1e8);
    return { icon: 'calc', title: '= ' + Number(out).toLocaleString('en', { maximumFractionDigits: 8 }), text: 'click to copy', act: copyIt(out) };
  }
  return null;
}
// Persian text is read here, by Tesseract (it ships with the app and is loaded the first time it is needed,
// then put away again after a minute of rest).
let ocrWorker = null, ocrRest = 0;
async function readPersian(png) {
  if (!window.Tesseract) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'ocr/tesseract.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  const base = new URL('ocr/', location.href).href;
  if (!ocrWorker) ocrWorker = await window.Tesseract.createWorker('fas', 1, { workerPath: base + 'worker.min.js', corePath: base, langPath: base, workerBlobURL: false, cacheMethod: 'none', gzip: true });
  clearTimeout(ocrRest);
  ocrRest = setTimeout(() => { const w = ocrWorker; ocrWorker = null; if (w) w.terminate(); }, 60000);
  const d = (await ocrWorker.recognize('data:image/png;base64,' + png)).data;
  return [d.text || '', d.confidence || 0];
}
window.qazi.onOcrRead(async (m) => {
  showHud('scan', 'Reading…', '', 9000, 'faded');
  let text = '', conf = 0;
  try { [text, conf] = await readPersian(m.png); } catch (e) { window.__ocrErr = String(e && e.message || e); ocrWorker = null; }
  window.qazi.ocrDone(text, conf);
});
window.qazi.onOcr((r) => {
  st.muteClipUntil = Date.now() + 1500;
  if (r.ok) showHud('scan', 'Text copied', String(r.text).replace(/\s+/g, ' '), 2800, 'green pop');
  else showHud('scan', 'Text grab', r.why || 'Nothing found', 2400, 'faded');
});
window.qazi.onClip((c) => {
  if (Date.now() < st.muteClipUntil) return;
  const s = c.kind === 'text' && st.smartCopy && c.text ? smart(c.text) : null;
  if (s) {
    showHud(s.icon, s.title, s.text, 4200, s.tone);
    if (s.color) $('#h-icon').style.color = s.color;
    st.hudAct = s.act; views.hud.classList.add('act');
    return;
  }
  if (c.kind === 'text') showHud('copy', 'Copied', c.preview, 1500);
  else if (c.kind === 'image') showHud('image', 'Copied', 'image', 1400);
  else if (c.kind === 'files') showHud('file', 'Copied', 'files', 1400);
  else showHud('copy', 'Copied', '', 1200);
});
// a browser download finished: one line, click to open it
window.qazi.onDownload((d) => {
  showNotif({ app: 'Download finished', title: d.name, body: d.size + (d.risky ? ' · click to show in folder' : ' · click to open'), icon: d.icon, action: 'download', path: d.path });
});
window.qazi.onSettings(applySettings);
window.qazi.getSettings().then(applySettings);
paintVol(); tick(); updateBadge(); paintStatus(); render();
window.__qazi = { st, timer, showNotif, onNotif, onMedia, render, setStack, showHud, setShelf, quickNote, parseReminder, guessSite, emote, ask, tick, smart, calc, jalaliToGregorian, levels, fake: (v) => { st.fakeLevels = v; } };   // debug hooks
})();
