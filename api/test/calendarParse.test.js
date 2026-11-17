const test = require('node:test');
const assert = require('node:assert/strict');
const { peopleFromText, normalizeCalendarEvent } = require('../src/CalendarParse.js');

const people = [
  { code: 'S', keywords: ['kid one', 'volleyball'] },
  { code: 'R', keywords: ['kidtwo'] },
  { code: 'M', keywords: ['sam', 'mom'] },
  { code: 'D', keywords: ['dad'] }
];
const ctx = {
  calendarId: 'fam', defaultPerson: null, people,
  localDate: (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver' }).format(new Date(iso))
};

test('peopleFromText matches whole words only, multiple people', () => {
  assert.deepEqual(peopleFromText('Volleyball tournament', people), ['S']);
  assert.deepEqual(peopleFromText("Sam's dentist + Dad pickup", people), ['M', 'D']);
  assert.deepEqual(peopleFromText('Samsung repair', people), []);       // not "sam"
  assert.deepEqual(peopleFromText('Kid One & KidTwo swim', people), ['S', 'R']);
  assert.deepEqual(peopleFromText('', people), []);
});

test('timed event: local date from Vancouver time, keyword person', () => {
  const e = normalizeCalendarEvent({
    id: 'e1', iCalUID: 'u1@google.com', summary: 'Volleyball practice',
    start: { dateTime: '2026-11-18T06:30:00-08:00' }, // = 07:30 Vancouver (UTC-7)
    end: { dateTime: '2026-11-18T08:00:00-08:00' }, location: 'Gym', htmlLink: 'https://cal/x'
  }, ctx);
  assert.equal(e.date, '2026-11-18');
  assert.equal(e.allDay, false);
  assert.deepEqual(e.people, ['S']);
  assert.equal(e.icalUid, 'u1@google.com');
  assert.equal(e.location, 'Gym');
});

test('late-evening UTC instant still lands on the right local date', () => {
  const e = normalizeCalendarEvent({ id: 'e2', summary: 'x', start: { dateTime: '2026-11-19T05:30:00Z' } }, ctx);
  assert.equal(e.date, '2026-11-18'); // 10:30 pm Nov 18 Vancouver
});

test('all-day multi-day: exclusive end converted to inclusive last day', () => {
  const e = normalizeCalendarEvent({ id: 'e3', summary: 'Family trip', start: { date: '2026-12-26' }, end: { date: '2026-12-30' } }, ctx);
  assert.equal(e.allDay, true);
  assert.equal(e.date, '2026-12-26');
  assert.equal(e.endDate, '2026-12-29');
  assert.equal(e.start, null);
  assert.deepEqual(e.people, ['F']);
});

test('hidden wallPerson property wins over keywords; calendar default before Family', () => {
  const tagged = normalizeCalendarEvent({
    id: 'e4', summary: 'Mom pizza night', start: { date: '2026-11-20' }, end: { date: '2026-11-21' },
    extendedProperties: { private: { wallPerson: 'R' } }
  }, ctx);
  assert.deepEqual(tagged.people, ['R']);
  const dflt = normalizeCalendarEvent({ id: 'e5', summary: 'Meeting', start: { date: '2026-11-20' } }, { ...ctx, defaultPerson: 'D' });
  assert.deepEqual(dflt.people, ['D']);
});

test('cancelled events are dropped', () => {
  assert.equal(normalizeCalendarEvent({ id: 'e6', status: 'cancelled', start: { date: '2026-11-20' } }, ctx), null);
});

const { applyCalendarDisplay } = require('../src/CalendarParse.js');
const ev = (id, date, start, end, title) => ({ id, date, endDate: date, allDay: false, start, end, title, people: ['F'] });

test('icon display: whole-word icon rules, default icon', () => {
  const out = applyCalendarDisplay([
    ev('a', '2026-11-25', '2026-11-25T07:30:00-07:00', null, 'Garbage Cart, Green Cart, Recycling'),
    ev('b', '2026-11-18', '2026-11-18T07:30:00-07:00', null, 'Yard waste')
  ], { display: 'icon', icons: [{ match: 'garbage', icon: 'G' }, { match: 'recycling', icon: 'R' }] });
  assert.equal(out[0].display, 'icon');
  assert.equal(out[0].icon, 'GR');
  assert.equal(out[1].icon, '📌');
});

test('fold: 2+ same-day events collapse; lone events and other days untouched', () => {
  const out = applyCalendarDisplay([
    ev('s1', '2026-11-22', '2026-11-22T07:00:00-07:00', '2026-11-22T08:30:00-07:00', 'Call Time'),
    ev('s2', '2026-11-22', '2026-11-22T09:00:00-07:00', '2026-11-22T10:15:00-07:00', 'Service'),
    ev('s3', '2026-11-22', '2026-11-22T11:00:00-07:00', '2026-11-22T12:15:00-07:00', 'Service'),
    ev('r1', '2026-11-24', '2026-11-24T19:00:00-07:00', '2026-11-24T21:00:00-07:00', 'Rehearsal')
  ], { fold: { title: 'Church' } });
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'Church');
  assert.equal(out[0].start, '2026-11-22T07:00:00-07:00');
  assert.equal(out[0].end, '2026-11-22T12:15:00-07:00');
  assert.equal(out[0].folded.length, 3);
  assert.equal(out[1].title, 'Rehearsal');
});

test('no display options: items unchanged', () => {
  const items = [ev('x', '2026-11-20', '2026-11-20T10:00:00-07:00', null, 'X')];
  assert.equal(applyCalendarDisplay(items, {}), items);
});
