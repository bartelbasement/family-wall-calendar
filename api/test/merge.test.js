const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeOptions, keyTokens, compareItems, mergeItems } = require('../src/Merge.js');

// Placeholders stand in for real names/schools (public repo).
const opts = mergeOptions({ ignoreWords: ['Kid One', 'Kid Two', 'Kid Three', 'SCHOOLA', 'SCHOOLB', 'Mom', 'Dad', 'Parent'] });

const tr = (id, title, start, extra = {}) => ({
  id: 't:' + id, trelloId: id, source: 'trello', section: 'event', title,
  start, date: start.slice(0, 10), allDay: false, people: ['S'], note: null, alert: null,
  whenLabel: null, offDay: false, change: null, changeNote: null, url: 'https://trello/' + id, ...extra
});
const cal = (id, title, start, extra = {}) => ({
  id: 'g:' + id, icalUid: id + '@google', source: 'calendar', section: 'event', title,
  start, end: null, date: start.slice(0, 10), endDate: start.slice(0, 10), allDay: false,
  people: ['F'], location: 'Calendar place', url: 'https://cal/' + id, offDay: false, ...extra
});
const allDayCal = (id, title, date, extra = {}) =>
  cal(id, title, date + 'T00:00:00-07:00', { start: null, date, endDate: date, allDay: true, ...extra });
const allDayTr = (id, title, date, extra = {}) =>
  tr(id, title, date + 'T12:00:00-07:00', { allDay: true, whenLabel: 'All day', ...extra });

test('keyTokens: names, numbers, times, stopwords and punctuation removed; synonyms applied', () => {
  assert.deepEqual(keyTokens('Kid One: Volleyball game vs Rivals @ Other School, 3:15 pm (AWAY)', opts),
    ['volleyball', 'game', 'rivals', 'other', 'school']);
  assert.deepEqual(keyTokens('Pro D Day', opts), ['noschool']);
  assert.deepEqual(keyTokens('No school (Design/Assessment Day)', opts), ['noschool', 'design']);
});

// ---- Handoff fixtures --------------------------------------------------------
test('handoff: concert in both, Trello all-day vs calendar 6 pm -> merge', () => {
  const r = compareItems(allDayTr('c', 'Winter Concert', '2026-12-10'), cal('c', 'Winter concert', '2026-12-10T18:00:00-07:00'), opts);
  assert.equal(r.ok, true);
});

test('handoff: two volleyball practices on different days -> no merge', () => {
  const r = compareItems(tr('p1', 'Volleyball practice', '2026-11-18T07:00:00-07:00'),
    cal('p2', 'Volleyball practice', '2026-11-24T07:00:00-07:00'), opts);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'date');
});

test('handoff: same day, different titles (Dentist vs Volleyball practice) -> no merge', () => {
  const r = compareItems(tr('d', 'Dentist', '2026-11-18T07:30:00-07:00'),
    cal('v', 'Volleyball practice', '2026-11-18T07:00:00-07:00'), opts);
  assert.equal(r.ok, false);
});

// ---- Real-data shaped fixtures ----------------------------------------------
test('real: "Kid One volleyball game" vs "Volleyball game vs Rivals @ Other School, 3:15 pm (AWAY)" -> merge', () => {
  const r = compareItems(tr('g', 'Volleyball game vs Rivals @ Other School, 3:15 pm (AWAY)', '2026-11-18T15:15:00-07:00'),
    cal('g', 'Kid One volleyball game', '2026-11-18T15:15:00-07:00'), opts);
  assert.equal(r.ok, true);
});

test('real: "Kid One volleyball practice" 7:00 vs "Extra volleyball practice 7 am, small gym" -> merge', () => {
  const r = compareItems(tr('x', 'Extra volleyball practice 7 am, small gym', '2026-11-18T07:00:00-07:00'),
    cal('x', 'Kid One volleyball practice', '2026-11-18T07:00:00-07:00'), opts);
  assert.equal(r.ok, true);
});

test('real: "Pro D Day" (all-day) vs "No school (Design/Assessment Day)" -> merge via synonyms', () => {
  const r = compareItems(allDayTr('n', 'No school (Design/Assessment Day)', '2026-11-20', { offDay: true }),
    allDayCal('n', 'Pro D Day', '2026-11-20'), opts);
  assert.equal(r.ok, true);
});

test('real: "Kid Two Christmas Tea" 10:25 vs "Christmas Tea 10:30 am – 2 pm" 10:30 -> merge', () => {
  const r = compareItems(tr('t', 'Christmas Tea 10:30 am – 2 pm', '2026-11-27T10:30:00-07:00'),
    cal('t', 'Kid Two Christmas Tea', '2026-11-27T10:25:00-07:00'), opts);
  assert.equal(r.ok, true);
});

test('real: Friendsgiving (all-day) does not merge with the no-school day', () => {
  const r = compareItems(allDayTr('n', 'No school (Design/Assessment Day)', '2026-11-20'),
    allDayCal('f', 'Friendsgiving', '2026-11-20'), opts);
  assert.equal(r.ok, false);
});

test('times more than 90 minutes apart do not merge even with identical titles', () => {
  const r = compareItems(tr('a', 'Volleyball game', '2026-11-18T15:15:00-07:00'),
    cal('b', 'Volleyball game', '2026-11-18T19:00:00-07:00'), opts);
  assert.equal(r.ok, false);
  assert.match(r.reason, /^time/);
});

// ---- mergeItems ----------------------------------------------------------------
test('mergeItems: calendar wins time/location, Trello adds people/notes/link; one-to-one; todos untouched', () => {
  const t1 = tr('g', 'Volleyball game vs Rivals @ Other School, 3:15 pm (AWAY)', '2026-11-18T15:15:00-07:00',
    { people: ['S'], note: 'Be there by 3:00', change: 'changed', changeNote: 'Time changed' });
  const c1 = cal('g', 'Kid One volleyball game', '2026-11-18T15:20:00-07:00', { people: ['S'], location: 'Gym' });
  const c2 = cal('g2', 'Kid One volleyball game', '2026-11-18T15:20:00-07:00', { icalUid: 'g@google' }); // same UID, other calendar
  const todo = tr('todo', 'Request tickets', '2026-11-29T07:00:00-07:00', { section: 'todo', people: ['P'] });
  const garbage = cal('bin', 'Garbage', '2026-11-18T07:30:00-07:00', { display: 'icon', icon: 'G' });

  const r = mergeItems([t1, todo], [c1, c2, garbage], opts);
  assert.equal(r.pairs.length, 1);
  const m = r.items.find((x) => x.source === 'both');
  assert.equal(m.start, '2026-11-18T15:20:00-07:00');
  assert.equal(m.location, 'Gym');
  assert.equal(m.note, 'Be there by 3:00');
  assert.equal(m.trelloUrl, 'https://trello/g');
  assert.equal(m.change, 'changed');
  assert.deepEqual(m.people, ['S']);
  assert.equal(r.items.length, 3, 'merged + todo + garbage icon (duplicate UID dropped)');
  assert.ok(r.items.includes(todo));
  assert.ok(r.items.includes(garbage));
});

test('mergeItems: Family is dropped when a real person is present', () => {
  const r = mergeItems([allDayTr('n', 'No school', '2026-11-20', { people: ['R', 'C'], offDay: true })],
    [allDayCal('n', 'Pro D Day', '2026-11-20', { people: ['F'] })], opts);
  assert.deepEqual(r.items[0].people, ['R', 'C']);
  assert.equal(r.items[0].offDay, true, 'off-day flag carried from Trello');
});
