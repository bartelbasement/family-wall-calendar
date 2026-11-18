// Parent settings: PIN pad, then Calendars / People / Display tabs.
// Renders into #scrim; app.js forwards clicks, inputs and changes while open.
import { apiPost } from './api.js?v=__V__';
import { SWATCHES, DEFAULTS } from './theme.js?v=__V__';
import { esc } from './render.js?v=__V__';

const STYLE_LABELS = { normal: 'Normal', icons: 'Icon in day header', fold: 'One item per day' };
const IDLE_CHOICES = [1, 2, 3, 5, 10];

/** Inline colour variables so a row previews its chosen swatch before saving. */
function swatchVars(name) {
  const sw = SWATCHES[name] || SWATCHES.slate;
  return `--bg-p:${sw.l[0]};--tx-p:${sw.l[1]};--bd-p:${sw.l[2]}`;
}

export function createSettings({ demo, getSnap, onSaved, onClose }) {
  let s = null; // { stage, pin, error, data, tab, swatches }
  const scrim = () => document.getElementById('scrim');

  function draw() {
    if (!s) return;
    scrim().innerHTML = s.stage === 'pin' ? pinHtml() : s.stage === 'loading' ? msgHtml('Loading settings…') : editHtml();
    scrim().hidden = false;
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
    const tabs = [['calendars', 'Calendars'], ['people', 'People'], ['display', 'Display']];
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
          <div class="swatches">${s.swatches.map((w) => `<button class="sw${p.swatch === w ? ' on' : ''}" data-set-swatch="${i}" data-swatch="${w}" style="background:${SWATCHES[w].l[2]}" aria-label="${w}"></button>`).join('')}</div>
          ${p.code === 'F' ? '' : `<label class="kw">Keywords <input data-set-person="${i}" data-field="keywords" value="${esc(p.keywords.join(', '))}" placeholder="e.g. volleyball, wildcats"></label>`}
        </div>`).join('');
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
        </div>`;
    }
    return `<div class="sheet set-sheet" role="dialog" aria-modal="true" aria-label="Settings">
      <button class="close" data-set-close aria-label="Close">✕</button>
      <h3>Settings</h3>
      <div class="seg seg3">${tabs.map(([k, v]) => `<button class="opt" data-set-tab="${k}" aria-pressed="${s.tab === k}">${v}</button>`).join('')}</div>
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
          options: snap.options || { nightStart: '21:30', nightEnd: '06:30', idleMinutes: 2 }
        }, swatches: Object.keys(SWATCHES) };
      } else {
        res = await apiPost('getSettings', { pin: s.pin });
      }
      s.data = res.settings; s.swatches = res.swatches; s.stage = 'edit'; s.tab = 'calendars';
    } catch (e) {
      const m = e.message;
      s.stage = 'pin'; s.pin = '';
      s.error = m === 'bad_pin' ? 'Wrong PIN.' : m === 'pin_locked' ? 'Too many tries. Wait 15 minutes.'
        : m === 'pin_not_set' ? 'No PIN set yet (add SETTINGS_PIN in Script Properties).' : 'Couldn’t load settings (' + m + ').';
    }
    draw();
  }

  async function save() {
    s.stage = 'saving'; s.error = null; draw();
    try {
      if (demo) {
        await new Promise((r) => setTimeout(r, 500));
        const snap = getSnap();
        snap.people = s.data.people.map(({ code, name, badge, swatch }) => ({ code, name, badge, swatch }));
        snap.options = s.data.options;
      } else {
        await apiPost('saveSettings', { pin: s.pin, settings: s.data });
      }
      s = null;
      onSaved();
    } catch (e) {
      s.stage = 'edit';
      s.error = e.message === 'bad_pin' || e.message === 'pin_locked' ? 'PIN no longer valid. Close and try again.' : 'Couldn’t save (' + e.message + ').';
      draw();
    }
  }

  function close() { s = null; onClose(); }

  return {
    active: () => !!s,
    open() { s = { stage: 'pin', pin: '', error: null, data: null, tab: 'calendars', swatches: [] }; draw(); },
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
      if (tab) { s.tab = tab.dataset.setTab; draw(); return true; }
      const tg = t.closest('[data-set-cal-toggle]');
      if (tg) { const c = s.data.calendars[+tg.dataset.setCalToggle]; c.include = !c.include; draw(); return true; }
      const sw = t.closest('[data-set-swatch]');
      if (sw) { s.data.people[+sw.dataset.setSwatch].swatch = sw.dataset.swatch; draw(); return true; }
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
      }
    },
    /** Selects redraw (they can reveal more fields). */
    handleChange(e) {
      if (!s || !s.data) return;
      const el = e.target;
      if (el.dataset.setCal != null && el.tagName === 'SELECT') {
        s.data.calendars[+el.dataset.setCal][el.dataset.field] = el.value || null;
        draw();
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
