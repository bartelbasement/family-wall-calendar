// Parent settings: PIN pad, then Calendars / People / Display tabs.
// Renders into #scrim; app.js forwards clicks, inputs and changes while open.
import { apiPost } from './api.js?v=__V__';
import { SWATCHES, DEFAULTS, swatchColors } from './theme.js?v=__V__';
import { LOOKS, getLook, setLook, APPEARANCES, getAppearance, setAppearance } from './look.js?v=__V__';
import { esc } from './render.js?v=__V__';
import { keepScroll } from './dom.js?v=__V__';
import { leaveLabel, showStatus, listShown } from './packing.js?v=__V__';

const STYLE_LABELS = { normal: 'Normal', icons: 'Icon in day header', fold: 'One item per day' };
const IDLE_CHOICES = [1, 2, 3, 5, 10];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_ROUTINES = 10;
const MAX_PACK_LISTS = 20;
const MAX_PACK_ITEMS = 40;

/** Saved packing lists, same idea: items as one text block. */
const packToEditor = (list) => (list || []).map((l) => ({ ...l, itemsText: (l.items || []).map((x) => x.text).join('\n') }));
const packFromEditor = (list) => list.map((l) => ({
  id: l.id || '', name: l.name, icon: l.icon, person: l.person || null,
  showFrom: l.showFrom || '', showUntil: l.showUntil || '',
  items: String(l.itemsText || '').split('\n').map((x) => x.trim()).filter(Boolean)
}));
/** Lists being packed: items as text, plus the two save choices. orig spots unchanged rows. */
const tripsToEditor = (list) => (list || []).map((t) => {
  const itemsText = (t.items || []).map((x) => x.text).join('\n');
  return { ...t, itemsText, orig: itemsText, saveToList: false, allCopies: false };
});
const lineCount = (text) => String(text || '').split('\n').filter((x) => x.trim()).length;

/** Routines as the editor holds them: steps as one text block, one per line. */
const toEditor = (list) => (list || []).map((r) => ({ ...r, stepsText: (r.steps || []).map((x) => x.text).join('\n') }));
/** ...and back to what the API takes (it assigns ids and validates). */
const fromEditor = (list) => list.map((r) => ({
  id: r.id || '', name: r.name, icon: r.icon, person: r.person || null, days: r.days, from: r.from || '', to: r.to || '',
  steps: String(r.stepsText || '').split('\n').map((x) => x.trim()).filter(Boolean)
}));

/** Inline colour variables so a row previews its chosen swatch before saving. */
function swatchVars(name) {
  const [bg, tx, bd] = swatchColors(name);
  return `--bg-p:${bg};--tx-p:${tx};--bd-p:${bd}`;
}

export function createSettings({ demo, getSnap, onSaved, onClose }) {
  let s = null; // { stage, pin, error, data, tab, swatches }
  const scrim = () => document.getElementById('scrim');

  // Keep the scroll position across redraws (e.g. picking a swatch), so the
  // list doesn't jump back to the top. Switching tabs passes top = true.
  function draw(top) {
    if (!s) return;
    const el = scrim();
    const fill = () => { el.innerHTML = s.stage === 'pin' ? pinHtml() : s.stage === 'loading' ? msgHtml('Loading settings…') : editHtml(); };
    if (top) fill(); else keepScroll(el, fill);
    el.hidden = false;
  }

  const msgHtml = (m) => `<div class="sheet set-sheet" role="dialog" aria-modal="true"><button class="close" data-set-close aria-label="Close">✕</button><h3>Settings</h3><p>${esc(m)}</p></div>`;

  function pinHtml() {
    const dots = Array.from({ length: Math.max(4, s.pin.length) }, (_, i) => `<i class="${i < s.pin.length ? 'on' : ''}"></i>`).join('');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
    return `<div class="sheet set-sheet pin-sheet" role="dialog" aria-modal="true" aria-label="Parent PIN">
      <button class="close" data-set-close aria-label="Close">✕</button>
      <h3>Parent PIN</h3>
      <div class="pin-dots">${dots}</div>
      ${s.error ? `<div class="alert-line">${esc(s.error)}</div>` : ''}
      <div class="pin-pad">${keys.map((k) => `<button class="pin-key${k === 'ok' ? ' ok' : ''}" data-pin="${k}" ${k === 'ok' && s.pin.length < 4 ? 'disabled' : ''}>${k === 'del' ? '⌫' : k === 'ok' ? 'OK' : k}</button>`).join('')}</div>
    </div>`;
  }

  function personOptions(selected, allowNone) {
    const people = s.data.people;
    return (allowNone ? `<option value="" ${!selected ? 'selected' : ''}>By keywords (else Family)</option>` : '') +
      people.map((p) => `<option value="${p.code}" ${selected === p.code ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  }

  function editHtml() {
    const d = s.data;
    const tabs = [['calendars', 'Calendars'], ['people', 'People'], ['routines', 'Routines'], ['display', 'Display']];
    let body = '';
    if (s.tab === 'calendars') {
      body = `<p class="set-hint">Choose which calendars show on the wall. Events are coloured by name keywords in the title, or by the calendar’s default person.</p>` +
        d.calendars.map((c, i) => `<div class="set-row cal-row${c.include ? '' : ' off'}">
          <div class="cal-top">
            <span class="cal-dot" style="background:${esc(c.color || '#999')}"></span>
            <span class="cal-name">${esc(c.name)}</span>
            <button class="opt" data-set-cal-toggle="${i}" aria-pressed="${c.include}">${c.include ? 'Shown' : 'Hidden'}</button>
          </div>
          ${c.include ? `<div class="cal-opts">
            <label>Person <select data-set-cal="${i}" data-field="defaultPerson">${personOptions(c.defaultPerson, true)}</select></label>
            <label>Show as <select data-set-cal="${i}" data-field="style">${Object.entries(STYLE_LABELS).map(([k, v]) => `<option value="${k}" ${c.style === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            ${c.style === 'fold' ? `<label>Title <input data-set-cal="${i}" data-field="foldTitle" value="${esc(c.foldTitle)}" maxlength="40" placeholder="e.g. Church"></label>` : ''}
          </div>` : ''}
        </div>`).join('');
    } else if (s.tab === 'people') {
      body = `<p class="set-hint">The badge can be a letter or an emoji. Keywords colour calendar events whose titles contain them (separate with commas).</p>` +
        d.people.map((p, i) => `<div class="set-row person-row" style="${swatchVars(p.swatch)}">
          <div class="person-top">
            <input class="badge-in" data-set-person="${i}" data-field="badge" value="${esc(p.badge)}" maxlength="4" aria-label="Badge">
            <input class="name-in" data-set-person="${i}" data-field="name" value="${esc(p.name)}" maxlength="24" aria-label="Name">
          </div>
          <div class="swatches">${s.swatches.map((w) => `<button class="sw${p.swatch === w ? ' on' : ''}" data-set-swatch="${i}" data-swatch="${w}" style="background:${swatchColors(w)[2]}" aria-label="${w}"></button>`).join('')}</div>
          ${p.code === 'F' ? '' : `<label class="kw">Keywords <input data-set-person="${i}" data-field="keywords" value="${esc(p.keywords.join(', '))}" placeholder="e.g. volleyball, wildcats"></label>`}
        </div>`).join('');
    } else if (s.tab === 'routines') {
      const rts = d.routines || [];
      const swatchOf = (code) => { const p = d.people.find((x) => x.code === code); return p ? p.swatch : 'slate'; };
      const who = (sel) => `<option value="" ${!sel ? 'selected' : ''}>Whole family</option>` +
        d.people.filter((p) => p.code !== 'F' && p.code !== 'P').map((p) => `<option value="${p.code}" ${sel === p.code ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
      body = `<p class="set-hint">Checklists to tick off on the wall’s Routines screen. Ticks reset every day. One step per line; start a step with an emoji if you like. Leave the times empty to show it all day.</p>` +
        rts.map((r, i) => `<div class="set-row person-row rt-edit" style="${swatchVars(swatchOf(r.person))}">
          <div class="person-top">
            <input class="badge-in" data-set-rt="${i}" data-field="icon" value="${esc(r.icon || '')}" maxlength="4" placeholder="⭐" aria-label="Icon">
            <input class="name-in" data-set-rt="${i}" data-field="name" value="${esc(r.name || '')}" maxlength="30" placeholder="e.g. Morning" aria-label="Routine name">
            <button class="opt rt-del" data-set-rt-del="${i}" aria-label="Delete routine">🗑</button>
          </div>
          <div class="cal-opts">
            <label>For <select data-set-rt="${i}" data-field="person">${who(r.person)}</select></label>
            <label>From <input type="time" data-set-rt="${i}" data-field="from" value="${esc(r.from || '')}"></label>
            <label>to <input type="time" data-set-rt="${i}" data-field="to" value="${esc(r.to || '')}"></label>
          </div>
          <div class="opts rt-days">${DAY_LETTERS.map((l, di) => `<button class="opt" data-set-rt-day="${i}" data-day-n="${di}" aria-pressed="${r.days.includes(di)}" aria-label="${DAY_NAMES[di]}">${l}</button>`).join('')}</div>
          <label class="kw">Steps <textarea data-set-rt="${i}" data-field="stepsText" rows="${Math.min(12, Math.max(3, String(r.stepsText || '').split('\n').length + 1))}" placeholder="🪥 Brush teeth&#10;👕 Get dressed">${esc(r.stepsText || '')}</textarea></label>
        </div>`).join('') +
        `<button class="opt rt-add" data-set-rt-add ${rts.length >= MAX_ROUTINES ? 'disabled' : ''}>＋ Add routine</button>`;
      if (d.packing) {
        const pks = d.packing;
        body += `<h4 class="set-sub">🎒 Packing lists</h4>
          <p class="set-hint">Lists the kids can start from the Routines screen when it’s time to pack (swim bag, camping, Grandma’s). Ticks stay until they tap Done. Kids can’t change the items. One item per line, up to ${MAX_PACK_ITEMS}. Leave the dates empty to always show a list, or set them to keep it off the wall until the trip is close.</p>` +
          pks.map((l, i) => {
            const n = lineCount(l.itemsText);
            return `<div class="set-row person-row rt-edit" style="${swatchVars(swatchOf(l.person))}">
            <div class="person-top">
              <input class="badge-in" data-set-pk="${i}" data-field="icon" value="${esc(l.icon || '')}" maxlength="4" placeholder="🎒" aria-label="Icon">
              <input class="name-in" data-set-pk="${i}" data-field="name" value="${esc(l.name || '')}" maxlength="30" placeholder="e.g. Swim bag" aria-label="Packing list name">
              <button class="opt rt-del" data-set-pk-del="${i}" aria-label="Delete packing list">🗑</button>
            </div>
            <div class="cal-opts">
              <label>Usually for <select data-set-pk="${i}" data-field="person">${who(l.person).replace('Whole family', 'Anyone (pick when starting)')}</select></label>
            </div>
            <div class="cal-opts pk-show-range">
              <label>Show from <input type="date" data-set-pk="${i}" data-field="showFrom" value="${esc(l.showFrom || '')}"></label>
              <label>until <input type="date" data-set-pk="${i}" data-field="showUntil" value="${esc(l.showUntil || '')}"></label>
              <span class="pk-status${listShown(l) ? '' : ' off'}">${esc(showStatus(l))}</span>
            </div>
            <label class="kw">Items <span class="pk-n${n > MAX_PACK_ITEMS ? ' over' : ''}" data-pk-n="${i}">${n}/${MAX_PACK_ITEMS}</span>
              <textarea data-set-pk="${i}" data-field="itemsText" rows="${Math.min(14, Math.max(4, String(l.itemsText || '').split('\n').length + 1))}" placeholder="🩱 Swimsuit&#10;🏊 Goggles&#10;🧴 Towel">${esc(l.itemsText || '')}</textarea></label>
          </div>`;
          }).join('') +
          `<button class="opt rt-add" data-set-pk-add ${pks.length >= MAX_PACK_LISTS ? 'disabled' : ''}>＋ Add packing list</button>`;
      }
      if (d.trips && d.trips.length) {
        const nameOf = (code) => { const p = d.people.find((x) => x.code === code); return p ? p.name : 'Anyone'; };
        const saved = new Set((d.packing || []).map((l) => l.id).filter(Boolean));
        body += `<h4 class="set-sub">Being packed now</h4>
          <p class="set-hint">Add or remove items on a list a kid is packing. Items you keep stay ticked.</p>` +
          d.trips.map((t, i) => {
            const n = lineCount(t.itemsText);
            const copies = d.trips.filter((x) => x.listId === t.listId).length;
            const flag = (f, label, ok) => ok ? `<button class="opt" data-set-trip-flag="${i}" data-flag="${f}" aria-pressed="${!!t[f]}">${label}</button>` : '';
            return `<div class="set-row person-row rt-edit" style="${swatchVars(swatchOf(t.person))}">
              <div class="set-label">${esc(t.icon || '🎒')} ${esc(t.name)} <span class="pk-trip-who">· ${esc(nameOf(t.person))} · ${esc(leaveLabel(t.leave))}</span></div>
              <label class="kw">Items <span class="pk-n${n > MAX_PACK_ITEMS ? ' over' : ''}" data-trip-n="${i}">${n}/${MAX_PACK_ITEMS}</span>
                <textarea data-set-trip="${i}" rows="${Math.min(14, Math.max(4, String(t.itemsText || '').split('\n').length + 1))}">${esc(t.itemsText || '')}</textarea></label>
              <div class="opts pk-trip-flags">
                ${flag('allCopies', `Change all ${copies} ${esc(t.name)} lists`, copies > 1)}
                ${flag('saveToList', 'Also update the saved list', saved.has(t.listId))}
              </div>
            </div>`;
          }).join('');
      }
    } else {
      const o = d.options;
      body = `<div class="set-row">
          <div class="set-label">Night mode (dim clock only)</div>
          <div class="cal-opts"><label>From <input type="time" data-set-opt="nightStart" value="${esc(o.nightStart)}"></label>
          <label>to <input type="time" data-set-opt="nightEnd" value="${esc(o.nightEnd)}"></label></div>
        </div>
        <div class="set-row">
          <div class="set-label">Go back to the home screen after</div>
          <div class="opts">${IDLE_CHOICES.map((m) => `<button class="opt" data-set-idle="${m}" aria-pressed="${Number(o.idleMinutes) === m}">${m} min</button>`).join('')}</div>
        </div>
        <div class="set-row">
          <div class="set-label">Appearance on this screen (changes right away)</div>
          <div class="opts">${APPEARANCES.map(([k, v]) => `<button class="opt" data-set-appearance="${k}" aria-pressed="${getAppearance() === k}">${v}</button>`).join('')}</div>
        </div>
        <div class="set-row">
          <div class="set-label">Look on this screen (changes right away)</div>
          <div class="opts">${LOOKS.map(([k, v]) => `<button class="opt" data-set-look="${k}" aria-pressed="${getLook() === k}">${v}</button>`).join('')}</div>
        </div>`;
    }
    return `<div class="sheet set-sheet" role="dialog" aria-modal="true" aria-label="Settings">
      <button class="close" data-set-close aria-label="Close">✕</button>
      <h3>Settings</h3>
      <div class="seg seg${tabs.length}">${tabs.map(([k, v]) => `<button class="opt" data-set-tab="${k}" aria-pressed="${s.tab === k}">${v}</button>`).join('')}</div>
      <div class="set-body">${body}</div>
      ${s.error ? `<div class="alert-line">${esc(s.error)}</div>` : ''}
      <div class="set-foot">
        <button class="opt" data-set-close>Cancel</button>
        <button class="done-btn" data-set-save ${s.stage === 'saving' ? 'disabled' : ''}>${s.stage === 'saving' ? 'Saving…' : 'Save'}</button>
      </div>
    </div>`;
  }

  async function load() {
    s.stage = 'loading'; s.error = null; draw();
    try {
      let res;
      if (demo) {
        await new Promise((r) => setTimeout(r, 300));
        const snap = getSnap();
        res = { settings: {
          calendars: [
            { id: 'fam', name: 'Family', color: '#9e69af', include: true, defaultPerson: null, style: 'normal', foldTitle: '' },
            { id: 'sam', name: 'Sam’s Calendar', color: '#039be5', include: true, defaultPerson: null, style: 'normal', foldTitle: '' },
            { id: 'bins', name: 'Collection Calendar', color: '#33b679', include: true, defaultPerson: null, style: 'icons', foldTitle: '' },
            { id: 'church', name: 'Church', color: '#f6bf26', include: true, defaultPerson: 'D', style: 'fold', foldTitle: 'Church' },
            { id: 'hol', name: 'Holidays in Canada', color: '#0b8043', include: false, defaultPerson: null, style: 'normal', foldTitle: '' }
          ],
          people: (snap.people || []).map((p) => ({ ...p, swatch: p.swatch || DEFAULTS[p.code] || 'slate', keywords: [] })),
          options: snap.options || { nightStart: '21:30', nightEnd: '06:30', idleMinutes: 2 },
          routines: ((snap.routines && snap.routines.list) || []).map(({ id, name, icon, person, days, from, to, steps }) => ({ id, name, icon, person, days, from, to, steps })),
          // Demo snapshot lists keep their items (the real snapshot only has counts).
          packing: ((snap.packing && snap.packing.lists) || []).map(({ id, name, icon, person, showFrom, showUntil, items }) => ({ id, name, icon, person, showFrom, showUntil, items: items || [] })),
          trips: JSON.parse(JSON.stringify((snap.packing && snap.packing.trips) || []))
        }, swatches: Object.keys(SWATCHES) };
      } else {
        res = await apiPost('getSettings', { pin: s.pin });
      }
      s.data = res.settings; s.data.routines = toEditor(s.data.routines);
      // null (an API without packing lists) hides the section and is never saved,
      // so an older API can't be told to wipe the lists.
      s.data.packing = Array.isArray(s.data.packing) ? packToEditor(s.data.packing) : null;
      s.data.trips = Array.isArray(s.data.trips) ? tripsToEditor(s.data.trips) : null;
      s.swatches = res.swatches; s.stage = 'edit'; s.tab = s.wantTab || 'calendars';
    } catch (e) {
      const m = e.message;
      s.stage = 'pin'; s.pin = '';
      s.error = m === 'bad_pin' ? 'Wrong PIN.' : m === 'pin_locked' ? 'Too many tries. Wait 15 minutes.'
        : m === 'pin_not_set' ? 'No PIN set yet (add SETTINGS_PIN in Script Properties).' : 'Couldn’t load settings (' + m + ').';
    }
    draw();
  }

  async function save() {
    const long = (s.data.packing || []).concat(s.data.trips || []).find((l) => lineCount(l.itemsText) > MAX_PACK_ITEMS);
    const emptyTrip = (s.data.trips || []).find((t) => !lineCount(t.itemsText));
    if (emptyTrip) {
      s.tab = 'routines';
      s.error = `“${emptyTrip.name}” being packed needs at least one item. To stop it, use Stop packing on its card.`;
      draw(); return;
    }
    if (long) {
      s.tab = 'routines';
      s.error = `“${long.name || 'A packing list'}” has more than ${MAX_PACK_ITEMS} items. Shorten it or split it in two.`;
      draw(); return;
    }
    s.stage = 'saving'; s.error = null; draw();
    try {
      if (demo) {
        await new Promise((r) => setTimeout(r, 500));
        const snap = getSnap();
        snap.people = s.data.people.map(({ code, name, badge, swatch }) => ({ code, name, badge, swatch }));
        snap.options = s.data.options;
        // Demo: rebuild the routines the wall shows, keeping ticks on unchanged steps.
        const old = {};
        ((snap.routines && snap.routines.list) || []).forEach((r) => { old[r.id] = r; });
        snap.routines = { date: snap.routines ? snap.routines.date : '', list: fromEditor(s.data.routines).filter((r) => r.steps.length).map((r, i) => {
          const id = r.id || 'demo' + Date.now() + i;
          const was = {};
          ((old[id] && old[id].steps) || []).forEach((x) => { was[x.text] = x; });
          return { ...r, id, name: r.name || 'Routine', days: r.days.length ? r.days : [0, 1, 2, 3, 4, 5, 6],
            steps: r.steps.map((text, j) => ({ id: was[text] ? was[text].id : id + 's' + j, text, done: !!(was[text] && was[text].done) })) };
        }) };
        if (s.data.packing) {
          const lists = packFromEditor(s.data.packing).filter((l) => l.items.length).map((l, i) => {
            const id = l.id || 'demopk' + Date.now() + i;
            if (l.showFrom && l.showUntil && l.showFrom > l.showUntil) [l.showFrom, l.showUntil] = [l.showUntil, l.showFrom];
            return { id, name: l.name || 'Packing', icon: l.icon, person: l.person, count: l.items.length, showFrom: l.showFrom, showUntil: l.showUntil,
              items: l.items.map((text, j) => ({ id: id + 'i' + j, text })) };
          });
          snap.packing = { lists, trips: (snap.packing && snap.packing.trips) || [] };
        }
        demoTripEdits(snap, tripEdits());
      } else {
        const settings = { ...s.data, routines: fromEditor(s.data.routines), tripEdits: tripEdits() };
        delete settings.trips;
        if (s.data.packing) settings.packing = packFromEditor(s.data.packing); else delete settings.packing;
        await apiPost('saveSettings', { pin: s.pin, settings });
      }
      s = null;
      onSaved();
    } catch (e) {
      s.stage = 'edit';
      s.error = e.message === 'bad_pin' || e.message === 'pin_locked' ? 'PIN no longer valid. Close and try again.' : 'Couldn’t save (' + e.message + ').';
      draw();
    }
  }

  /** Rows that changed, or that should be copied to the saved list. */
  function tripEdits() {
    return (s.data.trips || []).filter((t) => t.itemsText !== t.orig || t.saveToList).map((t) => ({
      tripId: t.id, items: String(t.itemsText).split('\n').map((x) => x.trim()).filter(Boolean),
      saveToList: !!t.saveToList, allCopies: !!t.allCopies
    }));
  }

  /** Demo stand-in for the server's applyTripEdits (ticks kept by item text). */
  function demoTripEdits(snap, edits) {
    const P = snap.packing;
    if (!P || !edits.length) return;
    edits.forEach((e) => {
      const trip = P.trips.find((t) => t.id === e.tripId);
      if (!trip) return;
      (e.allCopies ? P.trips.filter((t) => t.listId === trip.listId) : [trip]).forEach((t) => {
        const was = {};
        t.items.forEach((x) => { was[x.text.toLowerCase()] = x; });
        t.items = e.items.map((text, j) => { const w = was[text.toLowerCase()]; return { id: w ? w.id : t.id + 'e' + Date.now() + j, text, done: !!(w && w.done) }; });
      });
      const list = e.saveToList && P.lists.find((l) => l.id === trip.listId);
      if (list) { list.items = trip.items.map(({ id, text }) => ({ id, text })); list.count = list.items.length; }
    });
  }

  function close() { s = null; onClose(); }

  return {
    active: () => !!s,
    /** tab: which tab to show after the PIN (e.g. 'routines'); defaults to Calendars. */
    open(tab) { s = { stage: 'pin', pin: '', error: null, data: null, tab: 'calendars', wantTab: tab || null, swatches: [] }; draw(); },
    close,
    /** Returns true when the click was handled by the settings sheet. */
    handleClick(t) {
      if (!s) return false;
      if (t.closest('[data-set-close]') || t.id === 'scrim') { close(); return true; }
      const k = t.closest('[data-pin]');
      if (k) {
        const v = k.dataset.pin;
        if (v === 'del') s.pin = s.pin.slice(0, -1);
        else if (v === 'ok') { if (s.pin.length >= 4) { load(); return true; } }
        else if (s.pin.length < 8) s.pin += v;
        s.error = null; draw(); return true;
      }
      if (!s.data) return !!t.closest('.set-sheet');
      const tab = t.closest('[data-set-tab]');
      if (tab) { s.tab = tab.dataset.setTab; draw(true); return true; }
      const tg = t.closest('[data-set-cal-toggle]');
      if (tg) { const c = s.data.calendars[+tg.dataset.setCalToggle]; c.include = !c.include; draw(); return true; }
      const sw = t.closest('[data-set-swatch]');
      if (sw) { s.data.people[+sw.dataset.setSwatch].swatch = sw.dataset.swatch; draw(); return true; }
      const rtAdd = t.closest('[data-set-rt-add]');
      if (rtAdd) {
        if (s.data.routines.length < MAX_ROUTINES) s.data.routines.push({ id: '', name: '', icon: '', person: null, days: [0, 1, 2, 3, 4, 5, 6], from: '', to: '', stepsText: '' });
        draw(); return true;
      }
      const rtDel = t.closest('[data-set-rt-del]');
      if (rtDel) { s.data.routines.splice(+rtDel.dataset.setRtDel, 1); draw(); return true; }
      const rtDay = t.closest('[data-set-rt-day]');
      if (rtDay) {
        const r = s.data.routines[+rtDay.dataset.setRtDay], n = +rtDay.dataset.dayN;
        r.days = r.days.includes(n) ? r.days.filter((x) => x !== n) : r.days.concat(n).sort();
        draw(); return true;
      }
      const pkAdd = t.closest('[data-set-pk-add]');
      if (pkAdd && s.data.packing) {
        if (s.data.packing.length < MAX_PACK_LISTS) s.data.packing.push({ id: '', name: '', icon: '', person: null, itemsText: '' });
        draw(); return true;
      }
      const pkDel = t.closest('[data-set-pk-del]');
      if (pkDel && s.data.packing) {
        s.data.packing.splice(+pkDel.dataset.setPkDel, 1); draw(); return true;
      }
      const tf = t.closest('[data-set-trip-flag]');
      if (tf && s.data.trips) { const tr = s.data.trips[+tf.dataset.setTripFlag]; tr[tf.dataset.flag] = !tr[tf.dataset.flag]; draw(); return true; }
      const lk = t.closest('[data-set-look]');
      if (lk) { setLook(lk.dataset.setLook); draw(true); return true; }
      const ap = t.closest('[data-set-appearance]');
      if (ap) { setAppearance(ap.dataset.setAppearance); draw(true); return true; }
      const idle = t.closest('[data-set-idle]');
      if (idle) { s.data.options.idleMinutes = Number(idle.dataset.setIdle); draw(); return true; }
      if (t.closest('[data-set-save]')) { if (s.stage === 'edit') save(); return true; }
      return !!t.closest('.set-sheet');
    },
    /** Text fields update state without redrawing (keeps the keyboard up). */
    handleInput(e) {
      if (!s || !s.data) return;
      const el = e.target;
      if (el.dataset.setPerson != null) {
        const p = s.data.people[+el.dataset.setPerson];
        if (el.dataset.field === 'keywords') p.keywords = el.value.split(',').map((x) => x.trim()).filter(Boolean);
        else p[el.dataset.field] = el.value;
      } else if (el.dataset.setCal != null && el.tagName === 'INPUT') {
        s.data.calendars[+el.dataset.setCal][el.dataset.field] = el.value;
      } else if (el.dataset.setOpt) {
        s.data.options[el.dataset.setOpt] = el.value;
      } else if (el.dataset.setRt != null && el.tagName !== 'SELECT') {
        s.data.routines[+el.dataset.setRt][el.dataset.field] = el.value;
      } else if (el.dataset.setTrip != null) {
        const i = +el.dataset.setTrip;
        s.data.trips[i].itemsText = el.value;
        const n = lineCount(el.value), tag = scrim().querySelector(`[data-trip-n="${i}"]`);
        if (tag) { tag.textContent = `${n}/${MAX_PACK_ITEMS}`; tag.classList.toggle('over', n > MAX_PACK_ITEMS); }
      } else if (el.dataset.setPk != null && el.tagName !== 'SELECT') {
        const i = +el.dataset.setPk;
        s.data.packing[i][el.dataset.field] = el.value;
        if (el.dataset.field === 'itemsText') { // live count without a redraw
          const n = lineCount(el.value), tag = scrim().querySelector(`[data-pk-n="${i}"]`);
          if (tag) { tag.textContent = `${n}/${MAX_PACK_ITEMS}`; tag.classList.toggle('over', n > MAX_PACK_ITEMS); }
        }
      }
    },
    /** Selects redraw (they can reveal more fields). */
    handleChange(e) {
      if (!s || !s.data) return;
      const el = e.target;
      if (el.dataset.setCal != null && el.tagName === 'SELECT') {
        s.data.calendars[+el.dataset.setCal][el.dataset.field] = el.value || null;
        draw();
      } else if (el.dataset.setRt != null && el.tagName === 'SELECT') {
        s.data.routines[+el.dataset.setRt].person = el.value || null;
        draw(); // the row takes that person's colour
      } else if (el.dataset.setPk != null && el.tagName === 'SELECT') {
        s.data.packing[+el.dataset.setPk].person = el.value || null;
        draw();
      } else if (el.dataset.setPk != null && el.type === 'date') {
        s.data.packing[+el.dataset.setPk][el.dataset.field] = el.value;
        draw(); // refresh the "Hidden until …" label
      }
    },
    handleKey(e) {
      if (!s || s.stage !== 'pin') return false;
      if (/^\d$/.test(e.key) && s.pin.length < 8) { s.pin += e.key; s.error = null; draw(); return true; }
      if (e.key === 'Backspace') { s.pin = s.pin.slice(0, -1); draw(); return true; }
      if (e.key === 'Enter' && s.pin.length >= 4) { load(); return true; }
      return false;
    }
  };
}
