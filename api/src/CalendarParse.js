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

if (typeof module !== 'undefined') {
  module.exports = { peopleFromText: peopleFromText, normalizeCalendarEvent: normalizeCalendarEvent, PERSON_PROP: PERSON_PROP_ };
}
