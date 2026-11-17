/**
 * Pure Google Calendar (API v3 event resource) → common event model.
 * No Apps Script services here, so Node tests can load it.
 */

var PERSON_PROP_ = 'wallPerson'; // private extended property set by wall quick-add

function escapeRegex_(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** People codes whose keywords appear as whole words in the text, in config order. */
function peopleFromText(text, people) {
  var t = String(text || '').toLowerCase();
  var out = [];
  (people || []).forEach(function (p) {
    var hit = (p.keywords || []).some(function (k) {
      var kw = String(k).trim().toLowerCase();
      return kw && new RegExp('(^|[^a-z0-9])' + escapeRegex_(kw) + '($|[^a-z0-9])').test(t);
    });
    if (hit && out.indexOf(p.code) === -1) out.push(p.code);
  });
  return out;
}

/** Adds days to a 'yyyy-MM-dd' string (pure date math, no time zones). */
function addDays_(ymd, n) {
  var p = ymd.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.toISOString().slice(0, 10);
}

/**
 * @param {Object} ev   Calendar API v3 event
 * @param {Object} ctx  { calendarId, defaultPerson, people, localDate(iso)->'yyyy-MM-dd' }
 * @returns {Object|null}
 */
function normalizeCalendarEvent(ev, ctx) {
  if (!ev || ev.status === 'cancelled') return null;
  var allDay = !!(ev.start && ev.start.date);
  var title = String(ev.summary || '(No title)').trim();

  var people = [];
  var priv = (ev.extendedProperties && ev.extendedProperties['private']) || {};
  if (priv[PERSON_PROP_]) {
    people = String(priv[PERSON_PROP_]).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }
  if (!people.length) people = peopleFromText(title, ctx.people);
  if (!people.length && ctx.defaultPerson) people = [ctx.defaultPerson];
  if (!people.length) people = ['F'];

  var start = allDay ? null : ev.start.dateTime;
  var end = allDay ? null : (ev.end && ev.end.dateTime) || null;
  var date = allDay ? ev.start.date : ctx.localDate(start);
  // All-day end dates are exclusive in the API; store the inclusive last day.
  var endDate = allDay
    ? (ev.end && ev.end.date ? addDays_(ev.end.date, -1) : date)
    : (end ? ctx.localDate(end) : date);

  return {
    id: 'g:' + ev.id,
    trelloId: null,
    icalUid: ev.iCalUID || null,
    source: 'calendar',
    section: 'event',
    title: title,
    fullTitle: title,
    start: start,
    end: end,
    allDay: allDay,
    date: date,
    endDate: endDate,
    whenLabel: null,
    people: people,
    note: null,
    alert: null,
    offDay: false,
    done: false,
    change: null,
    changeNote: null,
    location: ev.location || null,
    url: ev.htmlLink || null,
    calendarId: ctx.calendarId
  };
}

/**
 * Applies a calendar's display options to its normalized events.
 *  - display 'icon': each event becomes a day-header icon item (display:'icon', icon:'🗑️♻️').
 *    Icons come from opts.icons [{match:'garbage', icon:'🗑️'}], matched as whole words.
 *  - fold {title}: 2+ timed events on the same day collapse into one item from the
 *    earliest start to the latest end. A lone event keeps its own title.
 */
function applyCalendarDisplay(items, opts) {
  opts = opts || {};
  if (opts.display === 'icon') {
    return items.map(function (e) {
      var t = e.title.toLowerCase();
      var icons = (opts.icons || []).filter(function (r) {
        return new RegExp('(^|[^a-z0-9])' + escapeRegex_(r.match.toLowerCase()) + '($|[^a-z0-9])').test(t);
      }).map(function (r) { return r.icon; });
      var out = Object.assign({}, e);
      out.display = 'icon';
      out.icon = icons.length ? icons.join('') : (opts.defaultIcon || '📌');
      return out;
    });
  }
  if (opts.fold) {
    var byDay = {}, order = [];
    items.forEach(function (e) {
      if (e.allDay) { order.push([e]); return; }
      if (!byDay[e.date]) { byDay[e.date] = []; order.push(byDay[e.date]); }
      byDay[e.date].push(e);
    });
    return order.map(function (group) {
      if (group.length === 1) return group[0];
      var sorted = group.slice().sort(function (a, b) { return Date.parse(a.start) - Date.parse(b.start); });
      var last = sorted.reduce(function (m, e) { return Date.parse(e.end || e.start) > Date.parse(m.end || m.start) ? e : m; });
      var out = Object.assign({}, sorted[0]);
      out.id = sorted[0].id + '+fold';
      out.title = opts.fold.title || sorted[0].title;
      out.end = last.end || last.start;
      out.endDate = last.endDate || out.endDate;
      out.folded = sorted.map(function (e) { return { title: e.title, start: e.start, end: e.end }; });
      return out;
    });
  }
  return items;
}

if (typeof module !== 'undefined') {
  module.exports = {
    peopleFromText: peopleFromText, normalizeCalendarEvent: normalizeCalendarEvent,
    applyCalendarDisplay: applyCalendarDisplay, PERSON_PROP: PERSON_PROP_
  };
}
