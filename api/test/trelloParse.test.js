const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDesc, isAllDayWhen, normalizeCard, changeMarkers } = require('../src/TrelloParse.js');

const ctx = {
  listSections: { L_TODO: 'todo', L_UP: 'event' },
  labelPeople: { 'kid one': 'S', 'kid two': 'R', parent: 'P' },
  offDayLabel: 'no school',
  localDate: (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver' }).format(new Date(iso)),
  changes: {}
};

test('parseDesc reads NOTE/ALERT/WHEN case-insensitively, first one wins', () => {
  const d = parseDesc('note: Leave by 2:30\nSome text\nAlert: No school Fri\nWHEN: All day\nNOTE: second');
  assert.deepEqual(d, { note: 'Leave by 2:30', alert: 'No school Fri', when: 'All day' });
});

test('parseDesc tolerates markdown bullets and bold markers and ignores other prefixes', () => {
  const d = parseDesc('- **WHEN:** Shows 9 am, 1 pm\nhttps://example.com\nTODO: nope');
  assert.equal(d.when, 'Shows 9 am, 1 pm');
  assert.equal(d.note, null);
  assert.equal(parseDesc('_NOTE_: Bring a water bottle').note, 'Bring a water bottle');
});

test('parseDesc handles empty and missing descriptions', () => {
  assert.deepEqual(parseDesc(''), { note: null, alert: null, when: null });
  assert.deepEqual(parseDesc(undefined), { note: null, alert: null, when: null });
});

test('isAllDayWhen', () => {
  assert.equal(isAllDayWhen('All day'), true);
  assert.equal(isAllDayWhen('all-day event'), true);
  assert.equal(isAllDayWhen('Shows 9 am, 1 pm'), false);
  assert.equal(isAllDayWhen(null), false);
});

test('normalizeCard maps labels to people, list to section, and local date', () => {
  const e = normalizeCard({
    id: 'c1', name: ' Winter concert ', desc: 'WHEN: All day\nNOTE: Wear black',
    due: '2026-12-11T02:00:00.000Z', // Dec 10, 6 pm Vancouver
    idList: 'L_UP', labels: [{ name: 'Kid One' }, { name: 'Kid Two' }, { name: 'LFES' }],
    shortUrl: 'https://trello.com/c/x'
  }, ctx);
  assert.equal(e.section, 'event');
  assert.equal(e.title, 'Winter concert');
  assert.deepEqual(e.people, ['S', 'R']);
  assert.equal(e.allDay, true);
  assert.equal(e.date, '2026-12-10');
  assert.equal(e.note, 'Wear black');
  assert.equal(e.source, 'trello');
});

test('normalizeCard falls back to Family, flags off days, skips Done lists', () => {
  const e = normalizeCard({ id: 'c2', name: 'Pro-D day', idList: 'L_UP', labels: [{ name: 'No school' }] }, ctx);
  assert.deepEqual(e.people, ['F']);
  assert.equal(e.offDay, true);
  assert.equal(e.start, null);
  assert.equal(e.date, null);
  assert.equal(normalizeCard({ id: 'c3', name: 'old', idList: 'L_DONE', labels: [] }, ctx), null);
});

test('changeMarkers: create = new, due/name/desc edits = changed, moves ignored', () => {
  const m = changeMarkers([
    { type: 'createCard', data: { card: { id: 'a' } } },
    { type: 'updateCard', data: { card: { id: 'a' }, old: { due: 'x' } } },
    { type: 'updateCard', data: { card: { id: 'b' }, old: { due: 'x' } } },
    { type: 'updateCard', data: { card: { id: 'c' }, old: { pos: 1 } } },
    { type: 'updateCard', data: { card: { id: 'd' }, old: { idList: 'L1' } } }
  ]);
  assert.deepEqual(m.a, { change: 'new', changeNote: null });
  assert.deepEqual(m.b, { change: 'changed', changeNote: 'Time changed' });
  assert.equal(m.c, undefined);
  assert.equal(m.d, undefined);
});
