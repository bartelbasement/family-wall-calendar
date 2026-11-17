import { getKey } from './api.js';
import { createStore } from './store.js';
import { getMode } from './mode.js';
import { startKiosk } from './kiosk.js';
import { calibrate, clockLabel, setNow, now, parts } from './time.js';
import { bannerHtml, nowHtml, weekHtml, todosHtml, chipsHtml, itemSheetHtml, daySheetHtml, nightHtml } from './render.js';

const IDLE_MS = 2 * 60 * 1000;        // wall: return home after 2 min without a touch
const NIGHT = { start: 21 * 60 + 30, end: 6 * 60 + 30 }; // 9:30 pm – 6:30 am (settings later)
const WAKE_MS = 2 * 60 * 1000;        // a tap at night shows the dark full view for 2 min

const params = new URLSearchParams(location.search);
const demo = params.has('demo');
if (params.get('now')) setNow(params.get('now'));
const themeParam = params.get('theme'); // light | dark | night (review aid)

const mode = getMode();
if (!demo) getKey();

const $ = (sel) => document.querySelector(sel);
const ui = {
  filter: 'all',
  sheet: null,          // { type: 'item', id } | { type: 'day', day }
  wokeAt: 0,
  lastTouch: Date.now()
};
try { if (!mode.kiosk) ui.filter = localStorage.getItem('wall-filter') || 'all'; } catch (e) { /* ignore */ }

const store = createStore({ onChange: render, demoUrl: demo ? './demo/snapshot.json' : null });

function ctxFor(snap) {
  const names = {}, badge = {};
  (snap.people || []).forEach((p) => { names[p.code] = p.name; badge[p.code] = p.badge || p.code; });
  return { names, badge };
}

function isNight() {
  if (!mode.kiosk && themeParam !== 'night') return false;
  if (themeParam === 'night') return Date.now() - ui.wokeAt > WAKE_MS;
  const p = parts(now());
  const m = p.h * 60 + p.mi;
  const inNight = NIGHT.start > NIGHT.end ? (m >= NIGHT.start || m < NIGHT.end) : (m >= NIGHT.start && m < NIGHT.end);
  return inNight && Date.now() - ui.wokeAt > WAKE_MS;
}

function applyTheme(night) {
  const root = document.documentElement;
  if (night) root.dataset.theme = 'night';
  else if (themeParam === 'light' || themeParam === 'dark') root.dataset.theme = themeParam;
  else if (mode.kiosk && isNightHours()) root.dataset.theme = 'dark'; // woken at night: stay dark
  else delete root.dataset.theme;
}
function isNightHours() {
  const p = parts(now()); const m = p.h * 60 + p.mi;
  return NIGHT.start > NIGHT.end ? (m >= NIGHT.start || m < NIGHT.end) : (m >= NIGHT.start && m < NIGHT.end);
}

function render() {
  const { snap, error } = store.state;
  const stamp = $('#stamp');
  if (!snap) {
    $('#now').innerHTML = `<div class="clock">${clockLabel(now())}</div><p class="now-empty">${
      error === 'missing_key' ? 'Open this page with the family link (it contains the access key).' : error ? 'Can’t reach the calendar right now.' : 'Loading…'}</p>`;
    stamp.textContent = error ? 'Offline' : '';
    stamp.className = 'stamp' + (error ? ' stale' : '');
    return;
  }
  calibrate(snap.tzOffset);
  const ctx = ctxFor(snap);
  const items = snap.items || [];

  const night = isNight();
  applyTheme(night);
  $('#night').hidden = !night;
  if (night) { $('#night').innerHTML = nightHtml(items); return; }

  $('#banner').innerHTML = bannerHtml(items, ui.filter);
  $('#now').innerHTML = nowHtml(items, ui.filter, ctx);
  const wk = $('#week'), keep = wk.scrollLeft;
  wk.innerHTML = weekHtml(items, ui.filter, ctx);
  wk.scrollLeft = keep;
  updateWeekHint();
  $('#todos').innerHTML = todosHtml(items, ui.filter, ctx);
  $('#chips').innerHTML = chipsHtml(snap.people || [], ui.filter);

  const stale = store.isStale() || !!error;
  stamp.textContent = (demo ? 'DEMO · ' : '') + 'Updated ' + clockLabel(snap.updatedAt) + (error ? ' · offline' : '');
  stamp.className = 'stamp' + (stale ? ' stale' : '');

  renderSheet(items, ctx);
}

function renderSheet(items, ctx) {
  const scrim = $('#scrim');
  if (!ui.sheet) { scrim.hidden = true; scrim.innerHTML = ''; return; }
  let html = '';
  if (ui.sheet.type === 'item') {
    const x = items.find((i) => i.id === ui.sheet.id);
    if (!x) { ui.sheet = null; scrim.hidden = true; return; }
    html = itemSheetHtml(x, ctx, mode.kiosk);
  } else {
    html = daySheetHtml(items, ui.sheet.day, ui.filter, ctx);
  }
  scrim.innerHTML = html;
  scrim.hidden = false;
}

function updateWeekHint() {
  const wk = $('#week');
  $('#week-wrap').classList.toggle('at-end', wk.scrollLeft + wk.clientWidth >= wk.scrollWidth - 4);
}
$('#week').addEventListener('scroll', updateWeekHint, { passive: true });

// ---------------------------------------------------------------- interaction
document.addEventListener('pointerdown', () => { ui.lastTouch = Date.now(); }, { passive: true });

document.addEventListener('click', (e) => {
  if (!$('#night').hidden) { ui.wokeAt = Date.now(); render(); return; }
  const t = e.target;
  if (t.closest('[data-close]') || t.id === 'scrim') { ui.sheet = null; render(); return; }
  const f = t.closest('[data-filter]');
  if (f) {
    ui.filter = f.dataset.filter;
    try { if (!mode.kiosk) localStorage.setItem('wall-filter', ui.filter); } catch (err) { /* ignore */ }
    render(); return;
  }
  const item = t.closest('[data-id]');
  if (item) { ui.sheet = { type: 'item', id: item.dataset.id }; render(); return; }
  const day = t.closest('[data-day]');
  if (day) { ui.sheet = { type: 'day', day: day.dataset.day }; render(); }
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; render(); } });

// Wall: drift back to the home state when nobody is using it.
if (mode.kiosk) {
  setInterval(() => {
    if (Date.now() - ui.lastTouch > IDLE_MS && (ui.sheet || ui.filter !== 'all' || $('#week').scrollLeft > 0)) {
      ui.sheet = null; ui.filter = 'all'; render();
      $('#week').scrollTo({ left: 0, behavior: 'smooth' });
    }
  }, 10e3);
}

// Clock and "now" highlighting: re-render on each new minute.
let lastMinute = -1;
setInterval(() => {
  const m = parts(now()).mi;
  if (m !== lastMinute) { lastMinute = m; render(); }
}, 5e3);

store.start();
if (mode.kiosk && !demo) startKiosk(store);
