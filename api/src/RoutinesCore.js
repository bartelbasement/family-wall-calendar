/**
 * Pure routine logic (no Apps Script services), so Node tests can load it.
 *
 * A routine:  { id, name, icon, person, days: [0..6] (0 = Sunday), from, to, steps: [{ id, text }] }
 *   from/to are 'HH:MM' (both empty = any time of day). steps are ticked off
 *   once per day; tick state is { date: 'yyyy-MM-dd', done: { routineId: [stepId] } }
 *   and anything from an earlier date counts as not done (the daily reset).
 */

var ROUTINE_MAX_ = 10;
var ROUTINE_STEPS_MAX_ = 12;
var ROUTINE_ID_RE_ = /^[A-Za-z0-9_-]{4,24}$/;

function rcText_(s, max) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max); }
function rcTime_(s) { s = String(s || ''); return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : ''; }

/**
 * Validates routines sent by the settings editor. Steps may be strings or
 * { text }. Ids are kept when valid; a step keeps its old id when the same
 * routine had a step with the same text, so editing the list doesn't reset
 * today's ticks on unchanged steps.
 * @param input   routines from the client
 * @param prev    currently saved routines (for step ids)
 * @param codes   valid person codes
 * @param newId   function returning a fresh id
 */
function cleanRoutines(input, prev, codes, newId) {
  var prevById = {};
  (prev || []).forEach(function (r) { prevById[r.id] = r; });
  var seen = {};
  return (input || []).slice(0, ROUTINE_MAX_).map(function (r) {
    r = r || {};
    var id = ROUTINE_ID_RE_.test(String(r.id || '')) && !seen[r.id] ? String(r.id) : newId();
    seen[id] = true;
    var old = prevById[id];
    var oldByText = {};
    ((old && old.steps) || []).forEach(function (s) { oldByText[String(s.text).toLowerCase()] = s.id; });
    var usedStep = {};
    var steps = (r.steps || []).map(function (s) {
      return rcText_(typeof s === 'string' ? s : s && s.text, 50);
    }).filter(Boolean).slice(0, ROUTINE_STEPS_MAX_).map(function (text) {
      var sid = oldByText[text.toLowerCase()];
      if (!sid || usedStep[sid]) sid = newId();
      usedStep[sid] = true;
      return { id: sid, text: text };
    });
    var days = (r.days || []).map(Number).filter(function (d, i, a) {
      return d >= 0 && d <= 6 && Math.floor(d) === d && a.indexOf(d) === i;
    }).sort();
    var from = rcTime_(r.from), to = rcTime_(r.to);
    if (!from || !to) { from = ''; to = ''; } // a window needs both ends
    return {
      id: id,
      name: rcText_(r.name, 30) || 'Routine',
      icon: rcText_(r.icon, 4),
      person: codes.indexOf(r.person) !== -1 ? r.person : null,
      days: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
      from: from,
      to: to,
      steps: steps
    };
  }).filter(function (r) { return r.steps.length; });
}

/** Tick state with one step set or cleared; starts fresh on a new day. */
function applyTick(ticks, today, routineId, stepId, done) {
  var base = ticks && ticks.date === today ? ticks.done || {} : {};
  var out = {};
  Object.keys(base).forEach(function (k) { out[k] = base[k].slice(); });
  var list = out[routineId] || [];
  var i = list.indexOf(stepId);
  if (done && i === -1) list.push(stepId);
  if (!done && i !== -1) list.splice(i, 1);
  if (list.length) out[routineId] = list; else delete out[routineId];
  return { date: today, done: out };
}

/**
 * What the wall shows: each routine with today's done flags. Ticks for steps
 * that no longer exist are ignored.
 */
function routinesView(defs, ticks, today) {
  var done = ticks && ticks.date === today ? ticks.done || {} : {};
  return {
    date: today,
    list: (defs || []).map(function (r) {
      var d = done[r.id] || [];
      return {
        id: r.id, name: r.name, icon: r.icon, person: r.person, days: r.days, from: r.from, to: r.to,
        steps: r.steps.map(function (s) { return { id: s.id, text: s.text, done: d.indexOf(s.id) !== -1 }; })
      };
    })
  };
}

if (typeof module !== 'undefined') {
  module.exports = { cleanRoutines: cleanRoutines, applyTick: applyTick, routinesView: routinesView };
}
