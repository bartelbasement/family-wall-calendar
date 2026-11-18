import { getKey, apiPost } from './api.js?v=__V__';
import { createStore } from './store.js?v=__V__';
import { getMode } from './mode.js?v=__V__';
import { startKiosk } from './kiosk.js?v=__V__';
import { calibrate, clockLabel, setNow, now, parts } from './time.js?v=__V__';
import { bannerHtml, nowHtml, weekHtml, todosHtml, chipsHtml, itemSheetHtml, daySheetHtml, nightHtml, toastHtml } from './render.js?v=__V__';

const IDLE_MS = 2 * 60 * 1000;        // wall: return home after 2 min without a touch
const NIGHT = { start: 21 * 60 + 30, end: 6 * 60 + 30 }; // 9:30 pm – 6:30 am (settings later)
const WAKE_MS = 2 * 60 * 1000;        // a tap at night shows the dark full view for 2 min
const UNDO_MS = 5000;                 // time to undo a to-do tick before it is written to Trello

window.__appStarted = true; // modules loaded; disarms the reload safety net in index.html
try { sessionStorage.removeItem('wall-rescue'); } catch (e) { /* ignore */ }

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
  lastTouch: Date.now(),
  pending: new Map(),   // to-do id -> undo timer (ticked, not yet sent)
  hidden: new Set(),    // to-do ids completed in Trello; hidden until the snapshot drops them
  toast: null
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
  ctx.pending = new Set(ui.pending.keys());
  const present = new Set((snap.items || []).map((x) => x.id));
  for (const id of ui.hidden) if (!present.has(id)) ui.hidden.delete(id);
  const items = (snap.items || []).filter((x) => !ui.hidden.has(x.id));

  const night = isNight();
  applyTheme(night);
  $('#night').hidden = !night;
  if (night) { $('#night').innerHTML = nightHtml(items); return; }

  $('#banner').innerHTML = bannerHtml(items, 'all'); // alerts matter to everyone: ignore the filter
  $('#now').innerHTML = nowHtml(items, ui.filter, ctx);
  const wk = $('#week'), keep = wk.scrollLeft;
  wk.innerHTML = weekHtml(items, ui.filter, ctx);
  wk.scrollLeft = keep;
  updateWeekHint();
  const td = $('#todos'), keepTd = td.scrollLeft;
  td.innerHTML = todosHtml(items, ui.filter, ctx);
  td.scrollLeft = keepTd;
  updateHints();
  $('#chips').innerHTML = chipsHtml(snap.people || [], ui.filter);

  const stale = store.isStale() || !!error;
  stamp.textContent = (demo ? 'DEMO · ' : '') + 'Updated ' + clockLabel(snap.updatedAt) + (error ? ' · offline' : '');
  stamp.className = 'stamp' + (stale ? ' stale' : '');

  renderSheet(items, ctx);
  $('#toast').innerHTML = toastHtml(ui.toast);
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

// Sideways strips (days, to-dos): show a › hint while more is off-screen, and
// let a normal mouse wheel scroll them sideways on PCs.
function updateHints() {
  for (const [stripSel, wrapSel] of [['#week', '#week-wrap'], ['#todos', '#todos-wrap']]) {
    const el = $(stripSel);
    $(wrapSel).classList.toggle('at-end', el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }
}
const updateWeekHint = updateHints;
for (const sel of ['#week', '#todos']) {
  const el = $(sel);
  el.addEventListener('scroll', updateHints, { passive: true });
  el.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
      e.preventDefault();
      el.scrollBy({ left: e.deltaY, behavior: 'auto' });
    }
  }, { passive: false });
}
addEventListener('resize', updateHints);

// ---------------------------------------------------------------- interaction
document.addEventListener('pointerdown', () => { ui.lastTouch = Date.now(); }, { passive: true });

document.addEventListener('click', (e) => {
  if (!$('#night').hidden) { ui.wokeAt = Date.now(); render(); return; }
  const t = e.target;
  if (t.closest('[data-close]') || t.id === 'scrim') { ui.sheet = null; render(); return; }
  const u = t.closest('[data-undo]');
  if (u) { undoComplete(u.dataset.undo); return; }
  const c = t.closest('[data-complete]');
  if (c) { startComplete(c.dataset.complete); return; }
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

// ---------------------------------------------------------------- to-do completion
function todoById(id) { return ((store.state.snap && store.state.snap.items) || []).find((x) => x.id === id); }

function startComplete(id) {
  const x = todoById(id);
  if (!x || x.section !== 'todo' || ui.pending.has(id)) return;
  ui.sheet = null;
  ui.pending.set(id, setTimeout(() => commitComplete(id), UNDO_MS));
  ui.toast = { id, text: x.title, ms: UNDO_MS };
  render();
}

function undoComplete(id) {
  clearTimeout(ui.pending.get(id));
  ui.pending.delete(id);
  if (ui.toast && ui.toast.id === id) ui.toast = null;
  render();
}

async function commitComplete(id) {
  const x = todoById(id);
  ui.pending.delete(id);
  if (ui.toast && ui.toast.id === id) ui.toast = null;
  ui.hidden.add(id);
  render();
  try {
    if (demo) await new Promise((r) => setTimeout(r, 400));
    else await apiPost('completeTodo', { cardId: x.trelloId });
  } catch (e) {
    ui.hidden.delete(id);
    ui.toast = { kind: 'error', text: 'Couldn’t update Trello. Try again in a minute.' };
    setTimeout(() => { if (ui.toast && ui.toast.kind === 'error') { ui.toast = null; render(); } }, 6000);
    render();
  }
}

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
