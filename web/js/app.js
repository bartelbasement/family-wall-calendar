import { getKey, apiPost } from './api.js?v=__V__';
import { createSettings } from './settings.js?v=__V__';
import { applyPeopleColors } from './theme.js?v=__V__';
import { createStore } from './store.js?v=__V__';
import { getMode } from './mode.js?v=__V__';
import { startKiosk } from './kiosk.js?v=__V__';
import { calibrate, clockLabel, setNow, now, parts } from './time.js?v=__V__';
import { bannerHtml, nowHtml, weekHtml, todosHtml, chipsHtml, itemSheetHtml, daySheetHtml, nightHtml, toastHtml, addSheetHtml } from './render.js?v=__V__';

// Night hours and idle time come from settings (snapshot.options), with these defaults.
const DEFAULT_OPTIONS = { nightStart: '21:30', nightEnd: '06:30', idleMinutes: 2 };
const opts = () => Object.assign({}, DEFAULT_OPTIONS, (store.state.snap && store.state.snap.options) || {});
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const idleMs = () => Math.max(1, Number(opts().idleMinutes) || 2) * 60 * 1000;
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
  toast: null,
  add: null             // quick-add form state while the Add sheet is open
};
try { if (!mode.kiosk) ui.filter = localStorage.getItem('wall-filter') || 'all'; } catch (e) { /* ignore */ }

const store = createStore({ onChange: render, demoUrl: demo ? './demo/snapshot.json' : null });
const settings = createSettings({
  demo,
  getSnap: () => store.state.snap,
  onSaved: () => {
    ui.toast = { kind: 'ok', text: 'Settings saved' };
    setTimeout(() => { if (ui.toast && ui.toast.kind === 'ok') { ui.toast = null; render(); } }, 3000);
    if (demo) render(); else store.refresh();
  },
  onClose: () => render()
});

function ctxFor(snap) {
  const names = {}, badge = {};
  (snap.people || []).forEach((p) => { names[p.code] = p.name; badge[p.code] = p.badge || p.code; });
  return { names, badge };
}

function isNight() {
  if (!mode.kiosk && themeParam !== 'night') return false;
  if (themeParam === 'night') return Date.now() - ui.wokeAt > WAKE_MS;
  return isNightHours() && Date.now() - ui.wokeAt > WAKE_MS;
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
  const start = toMin(opts().nightStart), end = toMin(opts().nightEnd);
  if (start === end) return false;
  return start > end ? (m >= start || m < end) : (m >= start && m < end);
}

function render() {
  const { snap, error } = store.state;
  const stamp = $('#stamp');
  if (!snap) {
    $('#now').innerHTML = `<div class="clock">${clockLabel(now())}</div><p class="now-empty">${errorText(error)}</p>${
      error ? `<p class="err-code">Details: ${escHtml(error)} · tap ↻ to retry</p>` : ''}`;
    stamp.textContent = error ? (error === 'forbidden' || error === 'missing_key' ? '↻ Key problem' : '↻ Offline') : '';
    stamp.className = 'stamp' + (error ? ' stale' : '');
    return;
  }
  calibrate(snap.tzOffset);
  applyPeopleColors(snap.people);
  const ctx = ctxFor(snap);
  ctx.pending = new Set(ui.pending.keys());
  const present = new Set((snap.items || []).map((x) => x.id));
  for (const id of ui.hidden) if (!present.has(id)) ui.hidden.delete(id);
  const items = (snap.items || []).filter((x) => !ui.hidden.has(x.id));

  const night = isNight();
  applyTheme(night);
  $('#night').hidden = !night;
  if (night) { $('#night').innerHTML = nightHtml(items); return; }

  setHtml($('#banner'), bannerHtml(items, 'all')); // alerts matter to everyone: ignore the filter
  setHtml($('#now'), nowHtml(items, ui.filter, ctx));
  // Scroll strips are only rebuilt when their content changes: rewriting them
  // every minute interrupts swipes and leaves iPad Safari with unpainted cards.
  setStrip($('#week'), weekHtml(items, ui.filter, ctx));
  setStrip($('#todos'), todosHtml(items, ui.filter, ctx));
  updateHints();
  $('#chips').innerHTML = chipsHtml(snap.people || [], ui.filter);

  const stale = store.isStale() || !!error;
  stamp.textContent = store.state.refreshing ? '↻ Refreshing…'
    : (demo ? 'DEMO · ' : '') + '↻ Updated ' + clockLabel(snap.updatedAt) + (error ? ' · offline' : '');
  stamp.className = 'stamp' + (stale ? ' stale' : '');

  renderSheet(items, ctx);
  $('#toast').innerHTML = toastHtml(ui.toast);
}

const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Plain-language reason for a failed first load. */
function errorText(error) {
  if (!error) return 'Loading…';
  if (error === 'missing_key') return 'This device doesn’t have the access key yet. Open the family link (the one ending in ?key=…) once on this device.';
  if (error === 'forbidden') return 'This device’s access key isn’t valid (it may be cut off or mistyped). Open the full family link again.';
  if (/^http_/.test(error)) return 'The calendar server returned an error. It usually clears up in a minute.';
  return 'Can’t reach the calendar server from this device (network or browser blocked the request).';
}

function renderSheet(items, ctx) {
  const scrim = $('#scrim');
  if (settings.active()) return; // the settings module owns the sheet while open
  if (!ui.sheet) { scrim.hidden = true; scrim.innerHTML = ''; return; }
  let html = '';
  if (ui.sheet.type === 'add') {
    // Never rebuild the form on background refreshes: it would wipe what is being typed.
    if (scrim.querySelector('.add-sheet')) return;
    html = addSheetHtml(ui.add, (store.state.snap && store.state.snap.people) || []);
  } else if (ui.sheet.type === 'item') {
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
function setHtml(el, html) {
  if (el._html === html) return false;
  el.innerHTML = html; el._html = html;
  return true;
}
function setStrip(el, html) {
  const keep = el.scrollLeft;
  if (setHtml(el, html)) el.scrollLeft = keep;
}

function updateHints() {
  for (const [stripSel, wrapSel] of [['#week', '#week-wrap'], ['#todos', '#todos-wrap']]) {
    const el = $(stripSel);
    $(wrapSel).classList.toggle('at-end', el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }
}
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
  if (settings.active()) { settings.handleClick(e.target); return; }
  if (e.target.closest('[data-settings-open]')) { ui.sheet = null; ui.add = null; settings.open(); return; }
  const t = e.target;
  if (t.closest('[data-close]') || t.id === 'scrim') { ui.sheet = null; ui.add = null; render(); return; }
  if (t.closest('[data-add-open]')) { openAdd(); return; }
  if (t.closest('[data-refresh]')) { store.refreshNow(); return; }
  if (ui.sheet && ui.sheet.type === 'add' && handleAddClick(t)) return;
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

document.addEventListener('keydown', (e) => {
  if (settings.handleKey(e)) { e.preventDefault(); return; }
  if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; ui.add = null; render(); }
  if (e.key === 'Enter' && e.target.id === 'add-title') { e.preventDefault(); submitAdd(); }
});

// ---------------------------------------------------------------- quick add
function openAdd() {
  const filterPerson = ui.filter !== 'all' ? [ui.filter] : [];
  ui.add = { type: 'event', people: filterPerson, date: todayYmdLocal(), time: null, title: '',
    saving: false, error: null, requestId: crypto.randomUUID() };
  ui.sheet = { type: 'add' };
  drawAdd();
  render();
}
function todayYmdLocal() { const p = parts(now()); return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; }

/** Redraws the add form, keeping focus/caret in the title box if it had it. */
function drawAdd() {
  const scrim = $('#scrim');
  const hadFocus = document.activeElement && document.activeElement.id === 'add-title';
  scrim.innerHTML = addSheetHtml(ui.add, (store.state.snap && store.state.snap.people) || []);
  scrim.hidden = false;
  if (hadFocus) { const i = $('#add-title'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}

function handleAddClick(t) {
  const f = ui.add;
  if (!f || f.saving) return !!f;
  const typ = t.closest('[data-add-type]');
  if (typ) {
    f.type = typ.dataset.addType;
    if (f.type === 'event' && !f.date) f.date = todayYmdLocal();
    if (f.type === 'event') f.people = f.people.filter((p) => p !== 'P');
    drawAdd(); return true;
  }
  const per = t.closest('[data-add-person]');
  if (per) {
    const p = per.dataset.addPerson;
    f.people = f.people.includes(p) ? f.people.filter((x) => x !== p) : f.people.concat(p);
    drawAdd(); return true;
  }
  const day = t.closest('[data-add-day]');
  if (day) { f.date = day.dataset.addDay || null; drawAdd(); return true; }
  const tm = t.closest('[data-add-time]');
  if (tm) { f.time = tm.dataset.addTime || null; drawAdd(); return true; }
  if (t.closest('[data-add-submit]')) { submitAdd(); return true; }
  return !!t.closest('.add-sheet'); // swallow other taps inside the form
}

document.addEventListener('input', (e) => {
  settings.handleInput(e);
  if (!ui.add) return;
  if (e.target.id === 'add-title') {
    ui.add.title = e.target.value;
    const b = document.querySelector('[data-add-submit]');
    if (b) b.disabled = !(ui.add.title.trim() && (ui.add.type !== 'event' || ui.add.date));
  }
});
document.addEventListener('change', (e) => {
  settings.handleChange(e);
  if (!ui.add) return;
  if (e.target.id === 'add-date' && e.target.value) { ui.add.date = e.target.value; drawAdd(); }
  if (e.target.id === 'add-time' && e.target.value) { ui.add.time = e.target.value; drawAdd(); }
});

async function submitAdd() {
  const f = ui.add;
  if (!f || f.saving || !f.title.trim() || (f.type === 'event' && !f.date)) return;
  f.saving = true; f.error = null; drawAdd();
  const body = { title: f.title.trim(), people: f.people, date: f.date, time: f.type === 'event' ? f.time : null, requestId: f.requestId };
  try {
    let item;
    if (demo) {
      await new Promise((r) => setTimeout(r, 500));
      item = { id: 'demo-' + f.requestId, source: f.type === 'event' ? 'calendar' : 'trello', section: f.type === 'event' ? 'event' : 'todo',
        title: body.title, people: body.people.length ? body.people : ['F'], date: body.date, endDate: body.date,
        allDay: f.type === 'event' && !body.time, start: body.time ? `${body.date}T${body.time}:00-07:00` : null,
        change: f.type === 'todo' ? 'new' : null, trelloId: f.type === 'todo' ? 'demo' : null };
    } else {
      item = (await apiPost(f.type === 'event' ? 'addEvent' : 'addTodo', body)).item;
    }
    const snap = store.state.snap;
    if (item && snap && !snap.items.some((x) => x.id === item.id)) snap.items.push(item);
    ui.sheet = null; ui.add = null;
    ui.toast = { kind: 'ok', text: (f.type === 'event' ? 'Added to the calendar: ' : 'Added to-do: ') + body.title };
    setTimeout(() => { if (ui.toast && ui.toast.kind === 'ok') { ui.toast = null; render(); } }, 4000);
    render();
  } catch (err) {
    f.saving = false;
    f.error = 'Couldn’t add that (' + (err.message || 'error') + '). Check the connection and try again.';
    drawAdd();
  }
}

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
    if (Date.now() - ui.lastTouch > idleMs() && (ui.sheet || settings.active() || ui.filter !== 'all' || $('#week').scrollLeft > 4 || $('#todos').scrollLeft > 4)) {
      if (settings.active()) settings.close();
      ui.sheet = null; ui.add = null; ui.filter = 'all'; render();
      ui.lastTouch = Date.now(); // reset once per idle spell, never in a loop
      $('#week').scrollTo({ left: 0, behavior: 'smooth' });
      $('#todos').scrollTo({ left: 0, behavior: 'smooth' });
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
