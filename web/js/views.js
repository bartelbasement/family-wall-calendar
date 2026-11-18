// Alternate wall views (M12): People columns and a Rolling 4-day schedule.
// Pure HTML builders; no DOM access.
import { now, todayYmd, addDays, timeLabel, dayLabel, minuteOfDay } from './time.js?v=__V__';
import { esc, bandCode, badges, eventsOn, visible } from './render.js?v=__V__';
import { dayWx } from './weather.js?v=__V__';

const PEOPLE_DAYS = 7;
const SCHED_DAYS = 4;

function dayName(d, today) {
  if (d === today) return 'Today';
  if (d === addDays(today, 1)) return 'Tomorrow';
  return dayLabel(d);
}

/** View switcher buttons for the wall's bottom bar. */
export function viewsHtml(view) {
  const b = (v, ic, label) => `<button class="view-btn" data-view="${v}" aria-pressed="${view === v}" title="${label}"><span>${ic}</span><span class="vl">${label}</span></button>`;
  return b('week', '▦', 'Week') + b('people', '👥', 'People') + b('sched', '🕘', 'Schedule');
}

// ---------------------------------------------------------------- people columns
/** Does this item belong in person `code`'s column? Mom/Dad columns also show Parent items. */
function forPerson(x, code) {
  return x.people.includes(code) || ((code === 'M' || code === 'D') && x.people.includes('P'));
}

export function peopleHtml(items, filter, ctx, people) {
  const today = todayYmd(), tNow = now().getTime();
  let cols = people.filter((p) => p.code !== 'P');
  if (filter !== 'all') cols = cols.filter((p) => p.code === filter);
  const days = Array.from({ length: PEOPLE_DAYS }, (_, i) => addDays(today, i));

  return `<div class="pcols" style="--cols:${cols.length}">` + cols.map((p) => {
    let count = 0;
    const body = days.map((d) => {
      const evs = eventsOn(items, d).filter((x) => forPerson(x, p.code));
      const todos = items.filter((x) => x.section === 'todo' && !x.done && x.date === d && forPerson(x, p.code));
      if (!evs.length && !todos.length) return '';
      count += evs.length + todos.length;
      return `<div class="pc-day${d === today ? ' today' : ''}"><button class="pc-dh" data-day="${d}">${esc(dayName(d, today))}</button>` +
        evs.map((x) => {
          const past = d === today && !x.allDay && Date.parse(x.end || x.start) < tNow;
          const others = x.people.filter((c) => c !== p.code && c !== 'F' && !(c === 'P' && (p.code === 'M' || p.code === 'D')));
          return `<button class="pc-item p-${p.code === 'F' ? bandCode(x.people) : p.code}${past ? ' past' : ''}" data-id="${esc(x.id)}">
            <span class="tm">${x.allDay ? 'All day' : timeLabel(x.start)}</span>
            <span class="ti">${esc(x.title)}${others.length ? ' ' + badges(others, ctx) : ''}</span></button>`;
        }).join('') +
        todos.map((x) => `<button class="pc-item pc-todo p-${p.code === 'F' ? bandCode(x.people) : p.code}" data-id="${esc(x.id)}">
          <span class="tm">☐ Due</span><span class="ti">${esc(x.title)}</span></button>`).join('') +
        `</div>`;
    }).join('');
    // Undated to-dos for this person sit at the bottom of the column.
    const undated = items.filter((x) => x.section === 'todo' && !x.done && !x.date && forPerson(x, p.code));
    count += undated.length;
    return `<section class="pcol p-${p.code}">
      <header class="pc-h"><span class="badge p-${p.code}">${esc(p.badge || p.code)}</span><span class="pc-name">${esc(p.name)}</span><span class="pc-n">${count || ''}</span></header>
      <div class="pc-body">${body || '<p class="pc-free">Nothing this week</p>'}${undated.length ? `<div class="pc-day"><div class="pc-dh">To-do</div>${undated.map((x) =>
        `<button class="pc-item pc-todo p-${p.code === 'F' ? bandCode(x.people) : p.code}" data-id="${esc(x.id)}"><span class="tm">☐</span><span class="ti">${esc(x.title)}</span></button>`).join('')}</div>` : ''}</div>
    </section>`;
  }).join('') + `</div>`;
}

// ---------------------------------------------------------------- rolling schedule
/** Lays out a day's timed events in side-by-side lanes where they overlap. */
function layoutLanes(evs) {
  const out = [];
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    cluster.forEach((e) => {
      let lane = lanes.findIndex((end) => end <= e.s);
      if (lane === -1) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = e.e;
      e.lane = lane;
    });
    cluster.forEach((e) => { e.lanes = lanes.length; out.push(e); });
    cluster = []; clusterEnd = -1;
  };
  evs.sort((a, b) => a.s - b.s || b.e - a.e).forEach((e) => {
    if (cluster.length && e.s >= clusterEnd) flush();
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, e.e);
  });
  if (cluster.length) flush();
  return out;
}

export function scheduleHtml(items, filter, ctx) {
  const today = todayYmd(), tNow = now().getTime();
  const days = Array.from({ length: SCHED_DAYS }, (_, i) => addDays(today, i));

  // Timed events per day, as minutes from midnight (clamped to that day).
  const perDay = days.map((d) => {
    const evs = eventsOn(items, d).filter((x) => !x.allDay && x.start && visible(x, filter));
    return evs.map((x) => {
      const sameStartDay = x.date === d;
      const s = sameStartDay ? minuteOfDay(x.start) : 0;
      let e = x.end ? (x.endDate === d ? minuteOfDay(x.end) : 24 * 60) : s + 60;
      if (e <= s) e = Math.min(s + 30, 24 * 60);
      return { x, s, e: Math.max(e, s + 30) };
    });
  });
  let startH = 7, endH = 21;
  perDay.flat().forEach((e) => { startH = Math.min(startH, Math.floor(e.s / 60)); endH = Math.max(endH, Math.ceil(e.e / 60)); });
  endH = Math.min(endH, 24);
  const span = (endH - startH) * 60;
  const pct = (m) => ((Math.min(Math.max(m, startH * 60), endH * 60) - startH * 60) / span) * 100;

  const head = days.map((d) => {
    const off = items.some((x) => x.offDay && x.date && d >= x.date && d <= (x.endDate || x.date));
    const icons = items.filter((x) => x.display === 'icon' && x.date === d).map((x) => x.icon).join(' ');
    const allDay = eventsOn(items, d).filter((x) => x.allDay && visible(x, filter));
    return `<div class="sc-h${d === today ? ' today' : ''}${off ? ' off' : ''}">
      <button class="sc-dh" data-day="${d}"><span class="dn">${esc(dayName(d, today))}</span>${d === today || d === addDays(today, 1) ? `<span class="dd">${esc(dayLabel(d))}</span>` : ''}
        <span class="sc-wx">${dayWx(ctx.weather, d)}${icons ? ' ' + esc(icons) : ''}</span></button>
      <div class="sc-ad">${allDay.map((x) => `<button class="sc-chip p-${bandCode(x.people)}" data-id="${esc(x.id)}">${esc(x.title)}</button>`).join('')}</div>
    </div>`;
  }).join('');

  const hours = [];
  for (let h = startH; h < endH; h++) hours.push(h);
  const hourLabel = (h) => `${h % 12 || 12} ${h < 12 || h === 24 ? 'am' : 'pm'}`;

  const cols = days.map((d, i) => {
    const evs = layoutLanes(perDay[i]).map((e) => {
      const past = d === today && Date.parse(e.x.end || e.x.start) + (e.x.end ? 0 : 3600e3) < tNow;
      const top = pct(e.s), h = Math.max(pct(e.e) - top, 2.2);
      return `<button class="sc-ev p-${bandCode(e.x.people)}${past ? ' past' : ''}" data-id="${esc(e.x.id)}"
        style="top:${top.toFixed(2)}%;height:${h.toFixed(2)}%;left:calc(${(100 / e.lanes) * e.lane}% + 1px);width:calc(${100 / e.lanes}% - 3px)">
        <span class="tm">${timeLabel(e.x.start)}</span> <span class="ti">${esc(e.x.title)}</span></button>`;
    }).join('');
    const nowLine = d === today ? `<i class="sc-now" style="top:${pct(minuteOfDay(new Date(tNow))).toFixed(2)}%"></i>` : '';
    return `<div class="sc-col${d === today ? ' today' : ''}" style="grid-column:${i + 2}">${evs}${nowLine}</div>`;
  }).join('');

  return `<div class="sched" style="--hours:${endH - startH}">
    <div class="sc-corner"></div>${head}
    <div class="sc-hours">${hours.map((h) => `<span>${hourLabel(h)}</span>`).join('')}</div>
    <div class="sc-grid">${hours.map(() => '<i></i>').join('')}</div>${cols}
  </div>`;
}
