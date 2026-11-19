// Alternate wall views (M12): People columns and a Rolling 4-day schedule.
// Pure HTML builders; no DOM access.
import { now, todayYmd, addDays, timeLabel, dayLabel, minuteOfDay } from './time.js?v=__V__';
import { esc, bandCode, badges, eventsOn, visible, ADULTS } from './render.js?v=__V__';
import { dayWx } from './weather.js?v=__V__';

const PEOPLE_DAYS = 7;
const SCHED_DAYS = 4;

function dayName(d, today) {
  if (d === today) return 'Today';
  if (d === addDays(today, 1)) return 'Tomorrow';
  return dayLabel(d);
}

// ---- ☰ menu style (Settings › Display › Menu; device-only, kept for comparison)
/** Segmented Week | People switch for the bottom bar (☰ menu style only). */
export function viewsHtml(view) {
  const b = (v, ic, label) => `<button class="view-btn" data-view="${v}" aria-pressed="${view === v}" title="${label}"><span>${ic}</span><span class="vl">${label}</span></button>`;
  return b('week', '▦', 'Week') + b('people', '👥', 'People');
}

/** The ☰ slide-in menu: refresh status, Refresh, Settings (PIN). */
export function menuSheetHtml(st) {
  return `<div class="sheet menu-sheet" role="dialog" aria-modal="true" aria-label="Menu">
    <button class="close" data-close aria-label="Close">✕</button>
    <h3>Menu</h3>
    ${st.warn ? `<p class="menu-warn">${esc(st.warn)}</p>` : ''}
    <div class="menu-list">
      <button class="menu-item" data-refresh><span class="ic">↻</span><span class="mi">Refresh now<small class="${st.stale ? 'stale' : ''}">Updated ${esc(st.text)}</small></span></button>
      <button class="menu-item" data-settings-open><span class="ic">⚙</span><span class="mi">Settings<small>Parent PIN</small></span></button>
      <button class="menu-item" data-menu-style="rail"><span class="ic">⇄</span><span class="mi">Switch to side panel<small>Just this screen</small></span></button>
    </div>
  </div>`;
}

// ---- side panel style (default)
/**
 * The wall's side panel: a narrow icon strip down the right edge with the app
 * icon (tap to expand), the views, Grocery, and Refresh / Settings at the foot.
 * Expanded, it slides wider (leftward) over the page and shows labels and details.
 * Labels are always in the markup; the collapsed panel just clips them.
 * @param gro open grocery count, or null when groceries aren't set up
 * @param todos open to-do count (all people)
 * @param rtn routines on right now and not finished
 */
export function railHtml(view, open, st, gro, todos, rtn) {
  const btn = (attrs, ic, label, sub, cls = '', badge = '') =>
    `<button class="rail-btn${cls}" ${attrs} aria-label="${label}" title="${label}"><span class="ic"><span class="em">${ic}</span>${badge}</span>` +
    `<span class="rl">${label}${sub ? `<small>${sub}</small>` : ''}</span></button>`;
  const nav = (v, ic, label, sub = '', badge = '') => btn(`data-view="${v}"${view === v ? ' aria-current="page"' : ''}`, ic, label, sub, view === v ? ' on' : '', badge);
  return `<div class="rail-top">
      ${btn(`data-rail-toggle aria-expanded="${open}"`, '<img src="icons/icon-192.png" alt="">', 'Family', open ? 'Tap to close' : '', ' rail-home')}
      ${open && st.warn ? `<p class="rail-warn">${esc(st.warn)}</p>` : ''}
      ${nav('week', '▦', 'Calendar')}
      ${nav('people', '👥', 'People')}
      ${nav('sched', '🕒', 'Timeline', 'Next 4 days')}
      ${nav('todos', '☑', 'To-dos', todos ? todos + ' open' : 'All done', todos ? `<b class="rail-count">${todos}</b>` : '')}
      ${nav('routines', '⭐', 'Routines', rtn ? rtn + ' on now' : 'Nothing on now', rtn ? `<b class="rail-count">${rtn}</b>` : '')}
      ${gro == null ? '' : btn('data-grocery-open', '🛒', 'Grocery', gro ? gro + ' to get' : 'All done', '', gro ? `<b class="rail-count">${gro}</b>` : '')}
    </div>
    <div class="rail-foot">
      ${btn('data-menu-style="classic"', '⇄', 'Switch to ☰ menu', 'Just this screen')}
      ${btn('data-refresh', '↻', 'Refresh now', esc('Updated ' + st.text), st.stale ? ' stale' : '')}
      ${btn('data-settings-open', '⚙', 'Settings', 'Parent PIN')}
    </div>`;
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

// ---------------------------------------------------------------- to-dos view
const TODO_BUCKETS = [
  ['now', 'Overdue & today'], ['week', 'This week'], ['later', 'Later'], ['none', 'No due date']
];

function todoBucket(x, today, weekEnd) {
  if (!x.date) return 'none';
  if (x.date <= today) return 'now';
  return x.date <= weekEnd ? 'week' : 'later';
}

/**
 * Whose job is this to-do (By person layout)? If a grown-up is tagged (Mom, Dad
 * or Parent = both), it's the grown-ups' job and the kids' badges just say who
 * it's for; otherwise it belongs to everyone tagged. A separate "who does it"
 * field is planned for the Supabase version; this rule stays as its fallback.
 */
function doesTodo(x, code) {
  const grown = x.people.filter((c) => ADULTS.includes(c));
  if (!grown.length) return forPerson(x, code);
  return grown.includes(code) || (grown.includes('P') && (code === 'M' || code === 'D'));
}

/** One to-do card: tick box (completes, with undo) and the rest opens its pop-up. */
function todoCard(x, ctx, today, colour) {
  const overdue = x.date && x.date < today;
  const due = !x.date ? '' : overdue ? 'Overdue · ' + dayLabel(x.date) : x.date === today ? 'Due today' : 'Due ' + dayLabel(x.date);
  const pending = ctx.pending && ctx.pending.has(x.id);
  return `<button class="tv-item p-${colour}${pending ? ' pending' : ''}" data-id="${esc(x.id)}">
    <span class="box" data-complete="${esc(x.id)}" role="checkbox" aria-checked="${pending}" aria-label="Mark done">${pending ? '✓' : ''}</span>
    <span class="tv-main"><span class="ti">${esc(x.title)}</span>
    <span class="tv-sub">${badges(x.people, ctx)}${due ? ` <span class="${overdue ? 'overdue' : ''}">${esc(due)}</span>` : ''}${x.change ? ` · <b class="flag-inline">${x.change === 'new' ? 'New' : 'Changed'}</b>` : ''}</span></span>
  </button>`;
}

/**
 * The wall's To-dos view: open to-dos in columns, either by due date
 * (Overdue & today | This week | Later | No due date) or by person, by whose
 * job it is (see doesTodo; a job shared by several people repeats in each column). Tick to complete, tap to
 * open the pop-up, and "Add to-do" opens the Add sheet set to a to-do.
 */
export function todosViewHtml(items, filter, ctx, people, mode) {
  const today = todayYmd(), weekEnd = addDays(today, 6);
  const open = items.filter((x) => x.section === 'todo' && !x.done && visible(x, filter))
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.title.localeCompare(b.title));
  const seg = (m, label) => `<button class="opt" data-todo-mode="${m}" aria-pressed="${mode === m}">${label}</button>`;
  const head = `<div class="tv-head">
      <div class="tv-seg">${seg('due', 'By due date')}${seg('person', 'By person')}</div>
      <span class="tv-n">${open.length ? open.length + ' open' : ''}</span>
      <button class="tv-add" data-add-todo>＋ Add to-do</button>
    </div>`;
  if (!open.length) return `<div class="tv">${head}<p class="tv-none">All done 🎉</p></div>`;

  let cols;
  if (mode === 'person') {
    let ps = people.filter((p) => p.code !== 'P');
    if (filter !== 'all') ps = ps.filter((p) => p.code === filter);
    cols = ps.map((p) => {
      const colour = (x) => p.code === 'F' ? bandCode(x.people) : p.code;
      const mine = open.filter((x) => doesTodo(x, p.code));
      // Filtered to one person (a chip), also list what's for them but done by
      // someone else, so the chip still shows everything involving them.
      const forThem = filter === 'all' ? [] : open.filter((x) => !doesTodo(x, p.code));
      return `<section class="pcol p-${p.code}">
        <header class="pc-h"><span class="badge p-${p.code}">${esc(p.badge || p.code)}</span><span class="pc-name">${esc(p.name)}</span><span class="pc-n">${mine.length || ''}</span></header>
        <div class="pc-body tv-body">${mine.map((x) => todoCard(x, ctx, today, colour(x))).join('') || '<p class="pc-free">Nothing to do</p>'}${
          forThem.length ? `<div class="pc-dh tv-others">For ${esc(p.name)}, done by others</div>${forThem.map((x) => todoCard(x, ctx, today, bandCode(x.people))).join('')}` : ''}</div>
      </section>`;
    });
  } else {
    cols = TODO_BUCKETS.map(([b, label]) => {
      const inB = open.filter((x) => todoBucket(x, today, weekEnd) === b);
      const urgent = b === 'now' && inB.length;
      return `<section class="pcol tv-due${urgent ? ' urgent' : ''}">
        <header class="pc-h"><span class="pc-name">${label}</span><span class="pc-n">${inB.length || ''}</span></header>
        <div class="pc-body tv-body">${inB.map((x) => todoCard(x, ctx, today, bandCode(x.people))).join('') || '<p class="pc-free">Nothing here</p>'}</div>
      </section>`;
    });
  }
  return `<div class="tv">${head}<div class="pcols" style="--cols:${cols.length}">${cols.join('')}</div></div>`;
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
