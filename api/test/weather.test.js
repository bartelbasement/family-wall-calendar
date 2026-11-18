const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWeather } = require('../src/Weather.js');

const sample = {
  current: { temperature_2m: 6.6, weather_code: 61, is_day: 0 },
  daily: {
    time: ['2026-11-17', '2026-11-18'],
    weather_code: [61, 3],
    temperature_2m_max: [8.4, 9.5],
    temperature_2m_min: [3.6, -0.4],
    precipitation_probability_max: [90, null]
  }
};

test('parseWeather rounds temperatures and keys days by date', () => {
  const w = parseWeather(sample, 'Town');
  assert.equal(w.place, 'Town');
  assert.deepEqual(w.current, { temp: 7, code: 61, isDay: false });
  assert.deepEqual(w.days['2026-11-17'], { code: 61, hi: 8, lo: 4, pop: 90 });
  assert.equal(w.days['2026-11-18'].lo, -0); // Math.round(-0.4) is -0; shown as 0
  assert.equal(w.days['2026-11-18'].pop, null);
});

test('parseWeather tolerates a response without current or daily', () => {
  const w = parseWeather({}, '');
  assert.equal(w.current, null);
  assert.deepEqual(w.days, {});
});
