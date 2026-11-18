// Routines view (M13) for the wall: each routine is a card of big tappable
// steps that reset every day. Definitions come from Settings › Routines; the
// snapshot carries { date, list } with today's ticks. Pure HTML builders.
import { now, todayYmd, minuteOfDay } from './time.js?v=__V__';
import { esc, visible } from './render.js?v=__V__';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
/** '15:30' -> '3:30 pm' */
export function hhmmLabel(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`;
}
const dowOf = (ymdStr) => new Date(ymdStr + 'T12:00:00Z').getUTCDay();

/** "Weekdays", "Sat, Sun", "Every day" */
export function daysLabel(days) {
  const d = [...days].sort();
  if (d.length === 7) return 'Every day';
  if (d.join() === '1,2,3,4,5') return 'Weekdays';
  if (d.join() === '0,6') return 'Weekends';
  return d.map((i) => DAY_NAMES[i]).join(', ');
}

/** Today's routines with done flags reset if the data is from an earlier day. */
function todays(routines) {
  if (!routines || !routines.list) return [];
  const fresh = routines.date === todayYmd();
  return routines.list.map((r) => fresh ? r : { ...r, steps: r.steps.map((s) => ({ ...s, done: false })) });
}

/** 'now' | 'later' | 'earlier' | 'off' (not on today's days) */
export function routineState(r, t = now()) {
  if (!r.days.includes(dowOf(todayYmd()))) return 'off';
  if (!r.from || !r.to) return 'now';
  const m = minuteOfDay(t), from = toMin(r.from), to = toMin(r.to);
  const inWin = from <= to ? m >= from && m < to : m >= from || m < to; // windows may cross midnight
  if (inWin) return 'now';
  return m < from ? 'later' : 'earlier';
}

/** Routines that are on right now and not finished (side panel badge). */
export function routinesOnNow(routines) {
  return todays(routines).filter((r) => routineState(r) === 'now' && r.steps.some((s) => !s.done)).length;
}

const ORDER = { now: 0, later: 1, earlier: 2 };

export function routinesViewHtml(routines, filter, people) {
  const all = todays(routines).filter((r) => visible({ people: [r.person || 'F'] }, filter));
  const byCode = {};
  (people || []).forEach((p) => { byCode[p.code] = p; });

  if (!routines || !routines.list || !routines.list.length) {
    return `<div class="rv"><div class="rv-empty">
      <p class="rv-big">No routines yet</p>
      <p>Make morning, after-school or bedtime checklists the kids can tick off here. They reset every day.</p>
      <button class="tv-add" data-settings-open data-settings-tab="routines">⚙ Set up routines</button>
      <p class="rv-hint">Settings › Routines (parent PIN)</p>
    </div></div>`;
  }

  const shown = all.map((r) => ({ r, st: routineState(r) })).filter((x) => x.st !== 'off')
    // Timed routines first (they're the ones with a deadline), then all-day ones.
    .sort((a, b) => ORDER[a.st] - ORDER[b.st] || (a.r.from || '99:99').localeCompare(b.r.from || '99:99'));
  const off = all.filter((r) => routineState(r) === 'off');

  const cards = shown.map(({ r, st }) => {
    const total = r.steps.length, done = r.steps.filter((s) => s.done).length;
    const complete = done === total;
    const who = r.person && byCode[r.person];
    const when = !r.from ? 'Any time today'
      : st === 'later' ? 'Starts ' + hhmmLabel(r.from)
      : st === 'earlier' ? 'Was ' + hhmmLabel(r.from) + '–' + hhmmLabel(r.to)
      : 'Until ' + hhmmLabel(r.to);
    return `<section class="rt p-${r.person || 'F'} st-${st}${complete ? ' complete' : ''}">
      <header class="rt-h">
        <span class="rt-ic">${esc(r.icon || '⭐')}</span>
        <span class="rt-name">${esc(r.name)}<small>${who ? `<span class="badge p-${who.code}">${esc(who.badge || who.code)}</span> ${esc(who.name)} · ` : ''}${esc(when)}</small></span>
        <span class="rt-n">${done}/${total}</span>
      </header>
      <div class="rt-bar"><i style="width:${Math.round(done / total * 100)}%"></i></div>
      ${complete ? '<p class="rt-done">All done! 🎉</p>' : ''}
      <div class="rt-steps">${r.steps.map((s) => `<button class="rt-step${s.done ? ' done' : ''}" data-routine="${esc(r.id)}" data-step="${esc(s.id)}" aria-pressed="${s.done}">
        <span class="rt-box">${s.done ? '✓' : ''}</span><span class="rt-tx">${esc(s.text)}</span></button>`).join('')}</div>
    </section>`;
  }).join('');

  return `<div class="rv">
    <div class="rv-grid">${cards || `<p class="rv-none">No routines today${filter !== 'all' ? ' for this person' : ''}.</p>`}</div>
    ${off.length ? `<p class="rv-off">Not today: ${off.map((r) => `${esc(r.name)} (${esc(daysLabel(r.days))})`).join(' · ')}</p>` : ''}
  </div>`;
}

/** Sample routines for the demo page (no names; people come from the demo snapshot). */
export function demoRoutines() {
  const r = (id, name, icon, person, days, from, to, steps) =>
    ({ id, name, icon, person, days, from, to, steps: steps.map((text, i) => ({ id: id + 's' + i, text, done: false })) });
  return {
    date: todayYmd(),
    list: [
      r('rmorning', 'Morning', '☀️', 'S', [1, 2, 3, 4, 5], '06:30', '08:30', ['👕 Get dressed', '🥣 Breakfast', '🪥 Brush teeth', '🎒 Pack backpack', '👟 Shoes on']),
      r('rschool', 'After school', '🏫', 'R', [1, 2, 3, 4, 5], '15:00', '17:30', ['🎒 Unpack lunch box', '📚 Homework', '🎹 Piano practice']),
      r('rbed', 'Bedtime', '🌙', 'C', [0, 1, 2, 3, 4, 5, 6], '19:00', '20:30', ['🛁 Bath', '🧸 Pyjamas', '🪥 Brush teeth', '📖 Story']),
      r('rdaily', 'Feed the dog', '🐶', null, [0, 1, 2, 3, 4, 5, 6], '', '', ['🥣 Breakfast', '🍖 Dinner', '💧 Fresh water']),
      r('rchores', 'Saturday chores', '🧹', null, [6], '09:00', '12:00', ['🛏️ Make beds', '🧺 Laundry away', '🧽 Tidy rooms'])
    ]
  };
}
