// Pure HTML builders for the Now + Week view. No DOM access here.
import { now, ymd, todayYmd, addDays, timeLabel, clockLabel, dayLabel, longDateLabel, parts } from './time.js?v=__V__';

const KIDS = ['S', 'R', 'C'];
const ADULTS = ['M', 'D', 'P'];
const WEEK_PILLS = 6;
export const WEEK_DAYS = 14; // rendered; 4 visible at a time, swipe for more
const NOW_ITEMS = 4;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Colour band for an item: one kid -> that kid; several kids -> family; else adult/family. */
export function bandCode(people) {
  const kids = people.filter((p) => KIDS.includes(p));
  if (kids.length === 1) return kids[0];
  if (kids.length > 1) return 'F';
  const adult = people.find((p) => ADULTS.includes(p));
  return adult || 'F';
}

export function badges(people, ctx) {
  return `<span class="badges">${people.map((p) =>
    `<span class="badge p-${p}" title="${esc(ctx.names[p] || p)}">${esc(ctx.badge[p] || p)}</span>`).join('')}</span>`;
}

/** Filter: Mom/Dad also show Parent items; Family shows F. */
export function visible(item, filter) {
  if (filter === 'all') return true;
  if (item.people.includes(filter)) return true;
  return (filter === 'M' || filter === 'D') && item.people.includes('P');
}

const changeWord = (x) => x.change === 'new' ? 'New' : x.change === 'changed' ? 'Changed' : '';

function timeRange(x) {
  if (x.allDay) return x.whenLabel || 'All day';
  const s = timeLabel(x.start);
  return x.end && x.end !== x.start ? `${s} – ${timeLabel(x.end)}` : s;
}

/** Events (not to-dos, not icons) for a day, all-day first, then by start. */
function eventsOn(items, day) {
  return items.filter((x) => x.section !== 'todo' && x.display !== 'icon' && x.date &&
      day >= x.date && day <= (x.endDate || x.date))
    .sort((a, b) => (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1) || String(a.start).localeCompare(String(b.start)));
}

// ---------------------------------------------------------------- banner
export function bannerHtml(items, filter) {
  const today = todayYmd(), until = addDays(today, 6);
  const alerts = items.filter((x) => x.alert && x.date && x.date >= today && x.date <= until && visible(x, filter))
    .sort((a, b) => a.date.localeCompare(b.date));
  const seen = new Set();
  const texts = alerts.map((x) => x.alert).filter((t) => !seen.has(t) && seen.add(t));
  return texts.length ? `⚠️ ${texts.map(esc).join('<span class="sep"> · </span>')}` : '';
}

// ---------------------------------------------------------------- now column
export function nowHtml(items, filter, ctx) {
  const t = now(), today = todayYmd();
  const p = parts(t);
  const evs = eventsOn(items, today).filter((x) => visible(x, filter));
  const allDay = evs.filter((x) => x.allDay);
  const timed = evs.filter((x) => !x.allDay);
  // Keep an event while it is running: until its end, or 1 h after start if no end.
  const live = timed.filter((x) => Date.parse(x.end || x.start) + (x.end ? 0 : 3600e3) > t.getTime());
  const shown = live.slice(0, NOW_ITEMS);
  const nextIdx = shown.findIndex((x) => Date.parse(x.start) > t.getTime());

  let html = `<div class="clock">${clockLabel(t)}<span class="ampm">${p.h < 12 ? 'am' : 'pm'}</span></div>
    <div class="date">${esc(longDateLabel(today))}</div>`;
  const icons = items.filter((x) => x.display === 'icon' && x.date === today);
  if (allDay.length || icons.length) {
    html += `<div class="allday-today">${icons.map((x) =>
      `<span class="chip-ad p-F">${esc(x.icon)} ${esc(x.title)}</span>`).join('')}${allDay.map((x) =>
      `<button class="chip-ad p-${bandCode(x.people)}" data-id="${esc(x.id)}">${esc(x.title)}</button>`).join('')}</div>`;
  }

  if (shown.length) {
    html += `<div class="now-h">Today</div><div class="now-list">` + shown.map((x, i) => {
      const ongoing = Date.parse(x.start) <= t.getTime();
      const sub = [x.note, x.location].filter(Boolean)[0];
      return `<button class="now-item p-${bandCode(x.people)}${ongoing ? ' ongoing' : ''}${i === nextIdx ? ' next' : ''}" data-id="${esc(x.id)}">
        <span class="tm">${timeLabel(x.start)}${x.change ? `<span class="flag">${changeWord(x)}</span>` : ''}</span>
        <span class="ti">${esc(x.title)} ${badges(x.people, ctx)}</span>
        ${sub ? `<span class="sub">${esc(sub)}</span>` : ''}
      </button>`;
    }).join('') + `</div>`;
    if (live.length > shown.length) html += `<div class="now-more">Later today: +${live.length - shown.length} more</div>`;
  } else {
    // Nothing left today: preview the next day with events.
    html += `<div class="now-h">Today</div><div class="now-empty">Nothing else today.</div>`;
  }
  return html;
}

// ---------------------------------------------------------------- week grid
function pillHtml(x, ctx, isPast) {
  const cls = `pill p-${bandCode(x.people)}${x.allDay ? ' ad' : ''}${isPast ? ' past' : ''}`;
  const single = x.people.length === 1;
  const chg = x.change ? `<span class="chg" title="${x.change === 'new' ? 'New' : 'Changed'}">✦</span>` : '';
  return `<button class="${cls}" data-id="${esc(x.id)}">
    ${x.allDay ? '' : `<span class="row1"><span class="tm">${timeLabel(x.start)}</span>${single ? badges(x.people, ctx) : ''}</span>`}
    <span class="ti">${chg}${esc(x.title)}</span>
    ${!single || x.allDay ? badges(x.people, ctx).replace('class="badges"', 'class="badges multi"') : ''}
    ${x.source === 'both' ? '<i class="both-dot" title="In calendar and Trello"></i>' : ''}
  </button>`;
}

export function weekHtml(items, filter, ctx) {
  const today = todayYmd(), tNow = now().getTime();
  const days = [];
  for (let i = 1; i <= WEEK_DAYS; i++) days.push(addDays(today, i));
  return days.map((d) => {
    const all = eventsOn(items, d);
    const evs = all.filter((x) => visible(x, filter));
    const icons = items.filter((x) => x.display === 'icon' && x.date === d).map((x) => x.icon).join(' ');
    const off = items.some((x) => x.offDay && x.date && d >= x.date && d <= (x.endDate || x.date));
    const todos = items.filter((x) => x.section === 'todo' && x.date === d && visible(x, filter));
    const dots = [...new Set(evs.flatMap((x) => x.people))].filter((p) => p !== 'F');
    const [, , dd] = d.split('-');
    const label = dayLabel(d).split(' ')[0];

    const shown = evs.slice(0, WEEK_PILLS);
    const rest = evs.length - shown.length;
    return `<section class="day${d === today ? ' today' : ''}${off ? ' off' : ''}">
      <button class="day-h" data-day="${d}">
        <span><span class="dow">${d === addDays(today, 1) ? 'TOMORROW' : label.toUpperCase()}</span><br><span class="num">${Number(dd)}</span></span>
        <span class="icons">${esc(icons)}</span>
        <span class="dots">${dots.map((p) => `<i class="p-${p}"></i>`).join('')}</span>
      </button>
      ${shown.map((x) => pillHtml(x, ctx, d === today && !x.allDay && Date.parse(x.end || x.start) < tNow)).join('')}
      ${rest > 0 ? `<button class="more" data-day="${d}">+${rest} more</button>` : ''}
      ${!evs.length ? `<div class="day-free">${off ? 'No school' : 'Free'}</div>` : ''}
      ${todos.length ? `<button class="todo-mark" data-day="${d}">☐ ${esc(todos[0].title)}${todos.length > 1 ? ` +${todos.length - 1}` : ''}</button>` : ''}
    </section>`;
  }).join('');
}

// ---------------------------------------------------------------- to-dos
export function todosHtml(items, filter, ctx) {
  const today = todayYmd();
  const todos = items.filter((x) => x.section === 'todo' && !x.done && visible(x, filter))
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  if (!todos.length) return `<span class="todos-h">To-do</span><span class="todos-none">All done 🎉</span>`;
  return `<span class="todos-h">To-do · ${todos.length}</span>` + todos.map((x) => {
    const overdue = x.date && x.date < today;
    const due = !x.date ? '' : overdue ? 'Overdue' : x.date === today ? 'Due today' : 'Due ' + dayLabel(x.date);
    const pending = ctx.pending && ctx.pending.has(x.id);
    return `<button class="todo p-${bandCode(x.people)}${pending ? ' pending' : ''}" data-id="${esc(x.id)}">
      <span class="box" data-complete="${esc(x.id)}" role="checkbox" aria-checked="${pending}" aria-label="Mark done">${pending ? '✓' : ''}</span>
      <span class="ti">${esc(x.title)}</span>
      <span class="due${overdue ? ' overdue' : ''}">${badges(x.people, ctx)} ${esc(due)}${x.change ? ` · <b class="flag-inline">${changeWord(x)}</b>` : ''}</span>
    </button>`;
  }).join('');
}

export function chipsHtml(people, filter) {
  const list = [{ code: 'all', name: 'All' }].concat(people.filter((p) => p.code !== 'P'));
  return list.map((p) => `<button class="chip" data-filter="${p.code}" aria-pressed="${filter === p.code}">
    ${p.code === 'all' ? 'All' : `<span class="badge p-${p.code}">${esc(p.badge || p.code)}</span>${esc(p.name)}`}
  </button>`).join('');
}

// ---------------------------------------------------------------- sheets
export function itemSheetHtml(x, ctx, kiosk) {
  const names = x.people.map((p) => `<span>${badges([p], ctx)} ${esc(ctx.names[p] || p)}</span>`).join('');
  const when = x.section === 'todo'
    ? (x.date ? 'Due ' + dayLabel(x.date) : 'No due date')
    : `${dayLabel(x.date)}${x.endDate && x.endDate !== x.date ? ' – ' + dayLabel(x.endDate) : ''} · ${timeRange(x)}`;
  const rows = [
    ['When', esc(when)],
    x.whenLabel && !x.allDay ? ['Times', esc(x.whenLabel)] : null,
    x.location ? ['Where', esc(x.location)] : null,
    x.note ? ['Note', esc(x.note)] : null,
    x.folded ? ['Includes', x.folded.map((f) => esc(f.title)).join(', ')] : null,
    x.change ? [changeWord(x), esc(x.changeNote || (x.change === 'new' ? 'Added in the last 2 days' : 'Updated in the last 2 days'))] : null
  ].filter(Boolean);
  const src = x.source === 'both' ? 'Google Calendar + Trello' : x.source === 'trello' ? 'Trello' : 'Google Calendar';
  const links = kiosk ? '' : [
    x.trelloUrl || (x.source === 'trello' ? x.url : null) ? `<a href="${esc(x.trelloUrl || x.url)}" target="_blank" rel="noopener">Open in Trello</a>` : '',
    x.source !== 'trello' && x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">Open in Calendar</a>` : ''
  ].join('');
  return `<div class="sheet p-${bandCode(x.people)}" role="dialog" aria-modal="true">
    <div class="band"></div>
    <button class="close" data-close aria-label="Close">✕</button>
    ${x.alert ? `<div class="alert-line">⚠️ ${esc(x.alert)}</div>` : ''}
    <h3>${esc(x.title)}</h3>
    <div class="who">${names}</div>
    <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${x.section === 'todo' && x.trelloId ? `<button class="done-btn" data-complete="${esc(x.id)}">✓ Mark done</button>` : ''}
    ${links ? `<div class="links">${links}</div>` : ''}
    <div class="src">From ${src}</div>
  </div>`;
}

export function daySheetHtml(items, day, filter, ctx) {
  const evs = eventsOn(items, day).filter((x) => visible(x, filter));
  const icons = items.filter((x) => x.display === 'icon' && x.date === day);
  const todos = items.filter((x) => x.section === 'todo' && x.date === day && visible(x, filter));
  return `<div class="sheet" role="dialog" aria-modal="true">
    <button class="close" data-close aria-label="Close">✕</button>
    <h3>${esc(longDateLabel(day))}</h3>
    ${icons.map((x) => `<p style="font-size:1.15rem;margin:.2rem 0 .8rem">${esc(x.icon)} ${esc(x.title)}</p>`).join('')}
    <div class="day-list">${evs.map((x) => pillHtml(x, ctx, false)).join('') || '<p>Nothing scheduled.</p>'}</div>
    ${todos.length ? `<div class="now-h">Due this day</div><div class="day-list">${todos.map((x) =>
      `<button class="pill p-${bandCode(x.people)}" data-id="${esc(x.id)}"><span class="ti">☐ ${esc(x.title)}</span></button>`).join('')}</div>` : ''}
    </div>`;
}

/** Undo toast for a to-do being completed. */
export function toastHtml(t) {
  if (!t) return '';
  if (t.kind === 'error') return `<div class="toast err" role="alert">${esc(t.text)}</div>`;
  if (t.kind === 'ok') return `<div class="toast" role="status"><span>✓ ${esc(t.text)}</span></div>`;
  return `<div class="toast" role="status">
    <span>✓ ${esc(t.text)}</span>
    <button class="undo" data-undo="${esc(t.id)}">Undo</button>
    <i class="bar" style="animation-duration:${t.ms}ms"></i>
  </div>`;
}

// ---------------------------------------------------------------- night
export function nightHtml(items) {
  const t = now();
  const p = parts(t);
  // After midnight "next" is today; in the evening it is tomorrow.
  const target = p.h < 12 ? todayYmd() : addDays(todayYmd(), 1);
  const first = eventsOn(items, target).filter((x) => !x.allDay)[0];
  const alert = items.find((x) => x.alert && x.date === target);
  return `<div>
    <div class="clock">${clockLabel(t)}</div>
    ${first ? `<div class="nxt">${p.h < 12 ? 'Today' : 'Tomorrow'} · <b>${timeLabel(first.start)} ${esc(first.title)}</b></div>` : ''}
    ${alert ? `<div class="nxt">⚠️ ${esc(alert.alert)}</div>` : ''}
  </div>`;
}

export { ymd };

// ---------------------------------------------------------------- quick add
const PRESET_TIMES = [
  { t: null, label: 'All day' },
  { t: '09:00', label: 'Morning 9:00' },
  { t: '15:30', label: 'After school 3:30' },
  { t: '18:30', label: 'Evening 6:30' }
];

/** Quick-add form. `f` = ui.add state; `people` = snapshot people list. */
export function addSheetHtml(f, people) {
  const today = todayYmd();
  const days = [{ d: today, label: 'Today' }, { d: addDays(today, 1), label: 'Tomorrow' }];
  for (let i = 2; i <= 6; i++) { const d = addDays(today, i); days.push({ d, label: dayLabel(d).replace(/ \w+ /, ' ') }); }
  const isEvent = f.type === 'event';
  const dayKnown = !f.date || days.some((x) => x.d === f.date);
  const who = people.filter((p) => p.code !== 'P' || !isEvent);
  const sel = (on) => `aria-pressed="${on ? 'true' : 'false'}"`;
  const timeKnown = PRESET_TIMES.some((x) => x.t === f.time);
  const canSave = f.title.trim() && (!isEvent || f.date) && !f.saving;

  return `<div class="sheet add-sheet" role="dialog" aria-modal="true" aria-label="Add">
    <button class="close" data-close aria-label="Close">✕</button>
    <h3>Add</h3>
    <div class="seg">
      <button class="opt" data-add-type="event" ${sel(isEvent)}>📅 Event</button>
      <button class="opt" data-add-type="todo" ${sel(!isEvent)}>☐ To-do</button>
    </div>

    <div class="add-h">Who</div>
    <div class="opts">${who.map((p) => `<button class="opt who-opt" data-add-person="${p.code}" ${sel(f.people.includes(p.code))}>
      <span class="badge p-${p.code}">${esc(p.badge || p.code)}</span>${esc(p.name)}</button>`).join('')}</div>

    <div class="add-h">${isEvent ? 'Day' : 'Due'}</div>
    <div class="opts">
      ${isEvent ? '' : `<button class="opt" data-add-day="" ${sel(!f.date)}>No date</button>`}
      ${days.map((x) => `<button class="opt" data-add-day="${x.d}" ${sel(f.date === x.d)}>${esc(x.label)}</button>`).join('')}
      <label class="opt picker ${!dayKnown ? 'on' : ''}">📆 Other <input type="date" id="add-date" value="${!dayKnown ? f.date : ''}" min="${today}"></label>
    </div>

    ${isEvent ? `<div class="add-h">Time</div>
    <div class="opts">
      ${PRESET_TIMES.map((x) => `<button class="opt" data-add-time="${x.t || ''}" ${sel(f.time === x.t)}>${esc(x.label)}</button>`).join('')}
      <label class="opt picker ${!timeKnown ? 'on' : ''}">🕑 Other <input type="time" id="add-time" value="${!timeKnown && f.time ? f.time : ''}" step="300"></label>
    </div>` : ''}

    <div class="add-h">What</div>
    <input id="add-title" class="add-title" type="text" maxlength="120" autocomplete="off" enterkeyhint="done"
      placeholder="${isEvent ? 'e.g. Pizza night' : 'e.g. Bring gym strip'}  (tap 🎤 on the keyboard to talk)" value="${esc(f.title)}">

    ${f.error ? `<div class="alert-line" style="margin-top:.8rem">${esc(f.error)}</div>` : ''}
    <button class="done-btn" data-add-submit ${canSave ? '' : 'disabled'}>${f.saving ? 'Adding…' : isEvent ? 'Add event' : 'Add to-do'}</button>
    <div class="src">${isEvent ? 'Goes to the family Google Calendar' : 'Goes to the Kids’ School Trello board (To Do)'}</div>
  </div>`;
}
