// Packing lists (M16) on the Routines view: active trips are cards in the
// routines grid, saved lists are a "Pack:" row kids tap to start one, and the
// start sheet picks who and (optionally) when. Pure HTML builders.
import { todayYmd, addDays } from './time.js?v=__V__';
import { esc, visible } from './render.js?v=__V__';

/** Cards with more items than this start collapsed. */
export const PACK_OPEN_MAX = 12;
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dowOf = (ymd) => new Date(ymd + 'T12:00:00Z').getUTCDay();
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);

/** 'Leaving today' | 'Leaving tomorrow' | 'Leaving Fri · 3 days' | 'Left Tue' | 'Packing' */
export function leaveLabel(leave, today = todayYmd()) {
  if (!leave) return 'Packing';
  const n = daysBetween(today, leave);
  if (n < 0) return 'Left ' + DAY_SHORT[dowOf(leave)];
  if (n === 0) return 'Leaving today';
  if (n === 1) return 'Leaving tomorrow';
  return `Leaving ${DAY_SHORT[dowOf(leave)]} · ${n} days`;
}

/** Day chips for the start sheet: today .. today + 14. */
export function leaveChoices(today = todayYmd()) {
  return Array.from({ length: 15 }, (_, i) => {
    const ymd = addDays(today, i);
    const d = Number(ymd.slice(8));
    return { ymd, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${DAY_SHORT[dowOf(ymd)]} ${d}` };
  });
}

/** Trips that need doing soon and aren't finished (adds to the side panel badge). */
export function packingDueSoon(packing, today = todayYmd()) {
  if (!packing || !packing.trips) return 0;
  return packing.trips.filter((t) => t.leave && daysBetween(today, t.leave) <= 1 && t.items.some((x) => !x.done)).length;
}

export function visibleTrips(packing, filter) {
  return ((packing && packing.trips) || []).filter((t) => visible({ people: [t.person || 'F'] }, filter));
}

/**
 * One trip card. ui: { open: Set of expanded trip ids, confirm: trip id being
 * cancelled, busy: Set of trip ids being ended }.
 */
export function tripCardHtml(t, byCode, ui) {
  const total = t.items.length, done = t.items.filter((x) => x.done).length;
  const complete = done === total;
  const who = t.person && byCode[t.person];
  const long = total > PACK_OPEN_MAX;
  const open = !long || ui.open.has(t.id);
  const busy = ui.busy.has(t.id);
  const soon = t.leave && daysBetween(todayYmd(), t.leave) <= 1;
  const id = esc(t.id);
  let foot;
  if (ui.confirm === t.id) {
    foot = `<div class="pk-confirm"><span>Stop packing ${esc(t.name)}?</span>
      <button class="opt" data-pack-keep="${id}">Keep</button>
      <button class="opt pk-stop" data-pack-end="${id}" ${busy ? 'disabled' : ''}>Stop</button></div>`;
  } else if (complete) {
    foot = `<p class="rt-done">All packed! 🎉</p>
      <button class="done-btn pk-done" data-pack-end="${id}" ${busy ? 'disabled' : ''}>${busy ? 'Saving…' : 'Done'}</button>`;
  } else {
    foot = `<button class="pk-cancel" data-pack-cancel="${id}">Stop packing</button>`;
  }
  return `<section class="rt pk p-${t.person || 'F'}${complete ? ' complete' : ''}${open ? '' : ' shut'}" data-trip="${id}">
    <header class="rt-h${long ? ' pk-toggle' : ''}" ${long ? `data-pack-toggle="${id}" role="button" aria-expanded="${open}"` : ''}>
      <span class="rt-ic">${esc(t.icon || '🎒')}</span>
      <span class="rt-name">${esc(t.name)}<small>${who ? `<span class="badge p-${who.code}">${esc(who.badge || who.code)}</span> ${esc(who.name)} · ` : ''}<span class="${soon ? 'pk-soon' : ''}">🎒 ${esc(leaveLabel(t.leave))}</span></small></span>
      <span class="rt-n">${done}/${total}</span>
    </header>
    <div class="rt-bar"><i style="width:${Math.round(done / total * 100)}%"></i></div>
    ${open ? `<div class="rt-steps">${t.items.map((s) => `<button class="rt-step${s.done ? ' done' : ''}" data-pack-trip="${id}" data-pack-item="${esc(s.id)}" aria-pressed="${s.done}">
      <span class="rt-box">${s.done ? '✓' : ''}</span><span class="rt-tx">${esc(s.text)}</span></button>`).join('')}</div>`
      : `<button class="opt pk-show" data-pack-toggle="${id}">Show ${total - done} to pack ▾</button>`}
    ${open && long ? `<button class="opt pk-show" data-pack-toggle="${id}">Hide items ▴</button>` : ''}
    ${foot}
  </section>`;
}

/** Whether a saved list belongs in the Pack row today (same rule as the API's packListShown). */
export function listShown(l, today = todayYmd()) {
  return (!l.showFrom || today >= l.showFrom) && (!l.showUntil || today <= l.showUntil);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (ymd) => `${DAY_SHORT[dowOf(ymd)]} ${MONTHS[Number(ymd.slice(5, 7)) - 1]} ${Number(ymd.slice(8))}`;

/** For Settings: 'Always shown' | 'Showing now' | 'Showing until Fri Aug 14' | 'Hidden until …' | 'Hidden (ended …)' */
export function showStatus(l, today = todayYmd()) {
  if (!l.showFrom && !l.showUntil) return 'Always shown';
  if (l.showFrom && today < l.showFrom) return 'Hidden until ' + dayLabel(l.showFrom);
  if (l.showUntil && today > l.showUntil) return 'Hidden (ended ' + dayLabel(l.showUntil) + ')';
  return l.showUntil ? 'Showing until ' + dayLabel(l.showUntil) : 'Showing now';
}

/** The "Pack:" row under the grid: saved lists inside their show range. */
export function packRowHtml(packing) {
  const lists = ((packing && packing.lists) || []).filter((l) => listShown(l));
  if (!lists.length) return '';
  return `<div class="pk-row"><span class="pk-row-h">Pack:</span>${lists.map((l) =>
    `<button class="opt pk-start" data-pack-start="${esc(l.id)}"><span>${esc(l.icon || '🎒')}</span>${esc(l.name)}</button>`).join('')}</div>`;
}

/** People who can pack: everyone but the Family and Parents tags. */
export const packers = (people) => (people || []).filter((p) => p.code !== 'F' && p.code !== 'P');

/** Start sheet. st: { listId, people: [codes], leave, saving, error } */
export function packSheetHtml(list, st, people) {
  const sel = (on) => `aria-pressed="${on ? 'true' : 'false'}"`;
  return `<div class="sheet pk-sheet" role="dialog" aria-modal="true" aria-label="Start packing">
    <button class="close" data-close aria-label="Close">✕</button>
    <h3>${esc(list.icon || '🎒')} ${esc(list.name)} <small>${list.count} items</small></h3>
    <div class="add-h">Who’s packing?</div>
    <div class="opts">${packers(people).map((p) => `<button class="opt who-opt" data-pack-who="${p.code}" ${sel(st.people.includes(p.code))}>
      <span class="badge p-${p.code}">${esc(p.badge || p.code)}</span>${esc(p.name)}</button>`).join('')}</div>
    <div class="add-h">Leaving</div>
    <div class="opts pk-days">
      <button class="opt" data-pack-leave="" ${sel(!st.leave)}>No date</button>
      ${leaveChoices().map((c) => `<button class="opt" data-pack-leave="${c.ymd}" ${sel(st.leave === c.ymd)}>${c.label}</button>`).join('')}
    </div>
    ${st.error ? `<div class="alert-line" style="margin-top:.7rem">${esc(st.error)}</div>` : ''}
    <div class="who-actions">
      <button class="opt" data-close>Cancel</button>
      <button class="done-btn" data-pack-go ${st.saving || !st.people.length ? 'disabled' : ''}>${st.saving ? 'Starting…' : st.people.length > 1 ? `Start ${st.people.length} lists` : 'Start packing'}</button>
    </div>
  </div>`;
}
