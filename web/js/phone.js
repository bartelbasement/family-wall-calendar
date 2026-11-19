// Pure HTML builders for the phone layout: an agenda list and a to-do list,
// switched by a bottom tab bar. No DOM access here.
import { now, todayYmd, addDays, timeLabel, dayLabel } from './time.js?v=__V__';
import { esc, bandCode, badges, visible, eventsOn, changeWord } from './render.js?v=__V__';
import { dayWx, headWx } from './weather.js?v=__V__';

const AGENDA_DAYS = 30; // matches the snapshot window

function openTodos(items, filter) {
  return items.filter((x) => x.section === 'todo' && !x.done && visible(x, filter))
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
}

export function headHtml(weather) {
  const today = todayYmd();
  return esc(dayLabel(today)) + headWx(weather, today);
}

// ---------------------------------------------------------------- agenda
function rowHtml(x, ctx, past) {
  const tm = x.allDay ? (x.whenLabel || 'All day') : timeLabel(x.start);
  const sub = [x.note, x.location].filter(Boolean)[0];
  return `<button class="ag-row p-${bandCode(x.people)}${past ? ' past' : ''}" data-id="${esc(x.id)}">
    <span class="ag-tm${x.allDay && x.whenLabel ? ' wrap' : ''}">${esc(tm)}</span>
    <span class="ag-main">
      <span class="ag-ti">${x.change ? '<span class="chg">✦</span>' : ''}${esc(x.title)}</span>
      <span class="ag-sub">${badges(x.people, ctx)}${sub ? ` <span class="ag-note">${esc(sub)}</span>` : ''}</span>
    </span>
  </button>`;
}

export function agendaHtml(items, filter, ctx) {
  const today = todayYmd(), tNow = now().getTime();
  let html = '';
  for (let i = 0; i <= AGENDA_DAYS; i++) {
    const d = addDays(today, i);
    const evs = eventsOn(items, d).filter((x) => visible(x, filter));
    const todos = items.filter((x) => x.section === 'todo' && !x.done && x.date === d && visible(x, filter));
    const icons = items.filter((x) => x.display === 'icon' && x.date === d);
    const off = items.some((x) => x.offDay && x.date && d >= x.date && d <= (x.endDate || x.date));
    // Today and tomorrow always show; later days only when something is on.
    if (i > 1 && !evs.length && !todos.length && !off) continue;

    const name = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayLabel(d).split(' ')[0];
    const date = dayLabel(d).split(' ').slice(1).join(' ');
    html += `<section class="ag-day${i === 0 ? ' today' : ''}${off ? ' off' : ''}">
      <h2 class="ag-h"><span class="ag-name">${esc(name)}</span> <span class="ag-date">${esc(date)}</span>
        ${off ? '<span class="ag-off">No school</span>' : ''}
        <span class="ag-wx">${dayWx(ctx.weather, d)}</span>
        ${icons.length ? `<span class="ag-icons">${icons.map((x) => `<span title="${esc(x.title)}">${esc(x.icon)}</span>`).join('')}</span>` : ''}
      </h2>
      ${evs.map((x) => rowHtml(x, ctx, i === 0 && !x.allDay && Date.parse(x.end || x.start) < tNow)).join('')}
      ${todos.map((x) => `<button class="ag-row ag-todo p-${bandCode(x.people)}" data-id="${esc(x.id)}">
        <span class="ag-tm">☐ Due</span>
        <span class="ag-main"><span class="ag-ti">${esc(x.title)}</span><span class="ag-sub">${badges(x.people, ctx)}</span></span>
      </button>`).join('')}
      ${!evs.length && !todos.length ? `<p class="ag-free">${off ? 'No school' : 'Nothing scheduled'}</p>` : ''}
    </section>`;
  }
  return html;
}

// ---------------------------------------------------------------- to-dos
export function phoneTodosHtml(items, filter, ctx) {
  const today = todayYmd();
  const todos = openTodos(items, filter);
  if (!todos.length) return `<p class="pt-none">All done 🎉</p>`;
  return todos.map((x) => {
    const overdue = x.date && x.date < today;
    const due = !x.date ? 'No due date' : overdue ? 'Overdue' : x.date === today ? 'Due today' : 'Due ' + dayLabel(x.date);
    const pending = ctx.pending && ctx.pending.has(x.id);
    return `<button class="pt-row p-${bandCode(x.people)}${pending ? ' pending' : ''}" data-id="${esc(x.id)}">
      <span class="box" data-complete="${esc(x.id)}" role="checkbox" aria-checked="${pending}" aria-label="Mark done">${pending ? '✓' : ''}</span>
      <span class="pt-main">
        <span class="pt-ti">${esc(x.title)}</span>
        <span class="pt-sub">${badges(x.people, ctx)} <span class="${overdue ? 'overdue' : ''}">${esc(due)}</span>${x.change ? ` · <b class="flag-inline">${changeWord(x)}</b>` : ''}</span>
      </span>
    </button>`;
  }).join('');
}

// ---------------------------------------------------------------- tab bar
/** groceryCount: open grocery items, or null when no grocery list is set up (tab hidden).
 *  routinesOn: routines on right now and not finished (badge). */
export function tabsHtml(items, filter, tab, groceryCount, routinesOn) {
  const n = openTodos(items, filter).length;
  const cur = (t) => tab === t ? 'aria-current="page"' : '';
  const gro = groceryCount == null ? '' :
    `<button class="ph-tab" data-tab="grocery" ${cur('grocery')}><span class="ic">🛒${groceryCount ? `<b class="count muted">${groceryCount}</b>` : ''}</span><span>Groceries</span></button>`;
  return `<button class="ph-tab" data-tab="cal" ${cur('cal')}><span class="ic">📅</span><span>Calendar</span></button>
    <button class="ph-tab" data-tab="todo" ${cur('todo')}><span class="ic">☑️${n ? `<b class="count">${n}</b>` : ''}</span><span>To-dos</span></button>
    <button class="ph-tab" data-tab="routines" ${cur('routines')}><span class="ic">⭐${routinesOn ? `<b class="count">${routinesOn}</b>` : ''}</span><span>Routines</span></button>
    ${gro}
    <button class="ph-tab ph-add" data-add-open><span class="ic">＋</span><span>Add</span></button>`;
}
