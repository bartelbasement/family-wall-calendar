const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanRoutines, applyTick, routinesView } = require('../src/RoutinesCore.js');

const codes = ['S', 'R', 'C', 'M', 'D', 'P', 'F'];
const idMaker = () => { let n = 0; return () => 'id' + String(++n).padStart(4, '0'); };

test('cleanRoutines validates fields and fills defaults', () => {
  const out = cleanRoutines([
    { name: '  Morning   routine ', icon: '☀️', person: 'S', days: [1, 2, 2, 9, -1, 3.5], from: '06:30', to: '08:15',
      steps: ['🪥 Brush teeth', '', '  Get   dressed ', { text: 'Pack bag' }] },
    { name: '', person: 'X', from: '07:00', to: 'bad', steps: ['Read'] },
    { name: 'Empty', steps: [' ', ''] }
  ], [], codes, idMaker());
  assert.equal(out.length, 2); // the routine with no steps is dropped
  assert.deepEqual(out[0], {
    id: 'id0001', name: 'Morning routine', icon: '☀️', person: 'S', days: [1, 2], from: '06:30', to: '08:15',
    steps: [{ id: 'id0002', text: '🪥 Brush teeth' }, { id: 'id0003', text: 'Get dressed' }, { id: 'id0004', text: 'Pack bag' }]
  });
  assert.equal(out[1].name, 'Routine');
  assert.equal(out[1].person, null);
  assert.deepEqual(out[1].days, [0, 1, 2, 3, 4, 5, 6]); // no days = every day
  assert.equal(out[1].from, '');                      // half a window = any time
  assert.equal(out[1].to, '');
});

test('cleanRoutines keeps routine ids and step ids for unchanged text', () => {
  const prev = [{ id: 'rmorn', steps: [{ id: 'sbrush', text: 'Brush teeth' }, { id: 'sdress', text: 'Get dressed' }] }];
  const out = cleanRoutines([{ id: 'rmorn', name: 'Morning', steps: ['Get dressed', 'brush teeth', 'Make bed'] }], prev, codes, idMaker());
  assert.equal(out[0].id, 'rmorn');
  assert.deepEqual(out[0].steps.map((s) => s.id), ['sdress', 'sbrush', 'id0001']);
});

test('cleanRoutines replaces bad or duplicate ids and caps the counts', () => {
  const make = idMaker();
  const many = Array.from({ length: 14 }, (_, i) => ({ id: 'same', name: 'R' + i, steps: Array.from({ length: 20 }, (_, j) => 'Step ' + j) }));
  const out = cleanRoutines(many, [], codes, make);
  assert.equal(out.length, 10);
  assert.equal(out[0].id, 'same');
  assert.notEqual(out[1].id, 'same');
  assert.equal(out[0].steps.length, 12);
  assert.equal(cleanRoutines([{ id: 'a b!', steps: ['x'] }], [], codes, idMaker())[0].id, 'id0001');
});

test('applyTick sets, clears and resets on a new day', () => {
  let t = applyTick(null, '2026-11-18', 'r1', 's1', true);
  t = applyTick(t, '2026-11-18', 'r1', 's2', true);
  t = applyTick(t, '2026-11-18', 'r1', 's1', true); // ticking twice is harmless
  assert.deepEqual(t, { date: '2026-11-18', done: { r1: ['s1', 's2'] } });
  t = applyTick(t, '2026-11-18', 'r1', 's1', false);
  t = applyTick(t, '2026-11-18', 'r1', 's2', false);
  assert.deepEqual(t, { date: '2026-11-18', done: {} });
  const old = { date: '2026-11-17', done: { r1: ['s1'] } };
  assert.deepEqual(applyTick(old, '2026-11-18', 'r2', 'x', true), { date: '2026-11-18', done: { r2: ['x'] } });
});

test('routinesView marks today\'s ticks and ignores old days', () => {
  const defs = [{ id: 'r1', name: 'Morning', icon: '', person: 'S', days: [1], from: '', to: '', steps: [{ id: 's1', text: 'A' }, { id: 's2', text: 'B' }] }];
  const v = routinesView(defs, { date: '2026-11-18', done: { r1: ['s2', 'gone'] } }, '2026-11-18');
  assert.equal(v.date, '2026-11-18');
  assert.deepEqual(v.list[0].steps.map((s) => s.done), [false, true]);
  const stale = routinesView(defs, { date: '2026-11-17', done: { r1: ['s1', 's2'] } }, '2026-11-18');
  assert.deepEqual(stale.list[0].steps.map((s) => s.done), [false, false]);
});
