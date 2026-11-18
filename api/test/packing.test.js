const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanPackLists, cleanLeave, startTrips, tickTrip, editTrip, listFromTrip, applyTripEdits, packingView } = require('../src/PackingCore.js');

const codes = ['S', 'R', 'C', 'M', 'D', 'P', 'F'];
const idMaker = (p = 'id') => { let n = 0; return () => p + String(++n).padStart(4, '0'); };

const swim = { id: 'lswim', name: 'Swim bag', icon: '🏊', person: 'S',
  items: [{ id: 'i1', text: 'Towel' }, { id: 'i2', text: 'Goggles' }, { id: 'i3', text: 'Swimsuit' }] };

test('cleanPackLists validates fields, drops empty lists and keeps item ids by text', () => {
  const prev = [{ id: 'lcamp', items: [{ id: 'old1', text: 'Sleeping bag' }] }];
  const out = cleanPackLists([
    { id: 'lcamp', name: '  Camping ', icon: '⛺', person: 'X', items: ['Flashlight', ' sleeping   BAG ', '', { text: 'Hat' }] },
    { name: '', items: ['Towel'] },
    { name: 'Empty', items: [' '] }
  ], prev, codes, idMaker());
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { id: 'lcamp', name: 'Camping', icon: '⛺', person: null,
    items: [{ id: 'id0001', text: 'Flashlight' }, { id: 'old1', text: 'sleeping BAG' }, { id: 'id0002', text: 'Hat' }] });
  assert.equal(out[1].name, 'Packing');
});

test('cleanPackLists caps lists at 20 and items at 40, and replaces duplicate ids', () => {
  const many = Array.from({ length: 25 }, () => ({ id: 'same', items: Array.from({ length: 50 }, (_, j) => 'Item ' + j) }));
  const out = cleanPackLists(many, [], codes, idMaker());
  assert.equal(out.length, 20);
  assert.equal(out[0].items.length, 40);
  assert.equal(new Set(out.map((l) => l.id)).size, 20);
});

test('cleanLeave allows blank or today..today+14 only', () => {
  assert.equal(cleanLeave('', '2026-11-18'), '');
  assert.equal(cleanLeave('2026-11-18', '2026-11-18'), '2026-11-18');
  assert.equal(cleanLeave('2026-12-02', '2026-11-18'), '2026-12-02');
  assert.throws(() => cleanLeave('2026-12-03', '2026-11-18'), /out of range/);
  assert.throws(() => cleanLeave('2026-11-17', '2026-11-18'), /out of range/);
  assert.throws(() => cleanLeave('2026-02-30', '2026-02-20'), /bad leave/);
  assert.throws(() => cleanLeave('Friday', '2026-11-18'), /bad leave/);
});

test('startTrips makes one copy per picked kid, or the owner when nobody is picked', () => {
  const two = startTrips(swim, ['R', 'C', 'R', 'X'], '2026-11-21', '2026-11-18', codes, idMaker('t'));
  assert.deepEqual(two.map((t) => [t.id, t.person]), [['t0001', 'R'], ['t0002', 'C']]);
  assert.equal(two[0].leave, '2026-11-21');
  assert.equal(two[0].started, '2026-11-18');
  assert.deepEqual(two[0].items[0], { id: 'i1', text: 'Towel', done: false });
  two[0].items[0].done = true;
  assert.equal(two[1].items[0].done, false); // copies don't share items

  assert.deepEqual(startTrips(swim, [], '', '2026-11-18', codes, idMaker()).map((t) => t.person), ['S']);
  assert.deepEqual(startTrips({ ...swim, person: null }, null, '', '2026-11-18', codes, idMaker()).map((t) => t.person), [null]);
  assert.throws(() => startTrips(swim, ['R'], '2027-01-01', '2026-11-18', codes, idMaker()), /out of range/);
});

test('tickTrip ticks and unticks without changing the original', () => {
  const [t] = startTrips(swim, ['R'], '', '2026-11-18', codes, idMaker());
  const a = tickTrip(t, 'i2', true);
  assert.equal(a.items[1].done, true);
  assert.equal(t.items[1].done, false);
  assert.equal(tickTrip(a, 'i2', false).items[1].done, false);
  assert.throws(() => tickTrip(t, 'nope', true), /unknown packing item/);
});

test('editTrip keeps ticks on unchanged items and adds new ones unticked', () => {
  let [t] = startTrips(swim, ['R'], '', '2026-11-18', codes, idMaker());
  t = tickTrip(tickTrip(t, 'i1', true), 'i3', true);
  const e = editTrip(t, ['towel', 'Swimsuit', 'Fishing rod'], idMaker('n'));
  assert.deepEqual(e.items, [
    { id: 'i1', text: 'towel', done: true },
    { id: 'i3', text: 'Swimsuit', done: true },
    { id: 'n0001', text: 'Fishing rod', done: false }
  ]);
  assert.equal(t.items.length, 3); // original untouched
  assert.throws(() => editTrip(t, [' '], idMaker()), /at least one item/);

  const saved = listFromTrip(swim, e);
  assert.deepEqual(saved, { id: 'lswim', name: 'Swim bag', icon: '🏊', person: 'S',
    items: [{ id: 'i1', text: 'towel' }, { id: 'i3', text: 'Swimsuit' }, { id: 'n0001', text: 'Fishing rod' }] });
});

test('packingView strips saved items and sorts trips by leave date, undated last', () => {
  const trip = (id, leave, started) => ({ id, leave, started, items: [] });
  const v = packingView([swim], [trip('tc', '', '2026-11-10'), trip('tb', '2026-11-25', '2026-11-18'),
    trip('ta', '2026-11-20', '2026-11-18'), trip('td', '', '2026-11-01')]);
  assert.deepEqual(v.lists, [{ id: 'lswim', name: 'Swim bag', icon: '🏊', person: 'S', count: 3 }]);
  assert.deepEqual(v.trips.map((t) => t.id), ['ta', 'tb', 'td', 'tc']);
  assert.deepEqual(packingView(null, null), { lists: [], trips: [] });
});

test('applyTripEdits edits one copy, or every copy of the same list, and can update the saved list', () => {
  const mk = idMaker('t');
  let [a, b] = startTrips(swim, ['R', 'C'], '', '2026-11-18', codes, mk);
  const [other] = startTrips({ ...swim, id: 'lcamp' }, ['R'], '', '2026-11-18', codes, mk);
  a = tickTrip(a, 'i1', true);
  b = tickTrip(b, 'i2', true);
  const trips = [a, b, other];

  const one = applyTripEdits(trips, [{ tripId: a.id, items: ['Towel', 'Goggles', 'Snack'] }], idMaker('n'));
  assert.deepEqual(one.trips.map((t) => t.id), [a.id]);
  assert.deepEqual(one.trips[0].items.map((x) => [x.text, x.done]), [['Towel', true], ['Goggles', false], ['Snack', false]]);
  assert.deepEqual(one.lists, {});

  const all = applyTripEdits(trips, [{ tripId: b.id, items: ['Towel', 'Goggles', 'Snack'], allCopies: true, saveToList: true }], idMaker('n'));
  assert.deepEqual(all.trips.map((t) => t.id), [a.id, b.id]); // not the camping trip
  assert.deepEqual(all.trips[0].items.map((x) => x.done), [true, false, false]); // each keeps its own ticks
  assert.deepEqual(all.trips[1].items.map((x) => x.done), [false, true, false]);
  assert.deepEqual(all.lists.lswim.map((x) => x.text), ['Towel', 'Goggles', 'Snack']);
  assert.deepEqual(all.lists.lswim.map((x) => x.id), all.trips[1].items.map((x) => x.id));

  const gone = applyTripEdits(trips, [{ tripId: 'ended', items: ['x'] }, null], idMaker());
  assert.deepEqual(gone, { trips: [], lists: {}, skipped: 2 });
  assert.throws(() => applyTripEdits(trips, [{ tripId: a.id, items: [] }], idMaker()), /at least one item/);
});
