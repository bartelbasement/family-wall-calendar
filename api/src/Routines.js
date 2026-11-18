/**
 * Routines (M13): definitions are edited in Settings (PIN) and stored as JSON in
 * Script Property ROUTINES_V1; today's ticks live in ROUTINE_TICKS and reset
 * daily (see RoutinesCore.js). The snapshot carries { date, list } and every
 * tick patches it straight away, like the other write actions.
 */

var ROUTINES_PROP_ = 'ROUTINES_V1';
var ROUTINE_TICKS_PROP_ = 'ROUTINE_TICKS';

function readJsonProp_(name, dflt) {
  var raw = PropertiesService.getScriptProperties().getProperty(name);
  if (!raw) return dflt;
  try { return JSON.parse(raw); } catch (e) { return dflt; }
}

function readRoutines_() { return readJsonProp_(ROUTINES_PROP_, []); }

function routineId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); }

/** Validates and stores routines from the settings editor. */
function saveRoutines_(input, cfg) {
  var codes = cfg.people.map(function (p) { return p.code; });
  var list = cleanRoutines(input, readRoutines_(), codes, routineId_);
  var json = JSON.stringify(list);
  if (json.length > 9000) throw new Error('routines too large (fewer or shorter steps)');
  PropertiesService.getScriptProperties().setProperty(ROUTINES_PROP_, json);
  return list;
}

function todayLocal_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Snapshot part: every routine with today's done flags. */
function routinesForSnapshot_() {
  return routinesView(readRoutines_(), readJsonProp_(ROUTINE_TICKS_PROP_, null), todayLocal_());
}

/** POST routineTick { routineId, stepId, done, requestId } */
function routineTick_(body) {
  return once_(body.requestId, function () {
    var rid = String(body.routineId || ''), sid = String(body.stepId || '');
    var def = readRoutines_().filter(function (r) { return r.id === rid; })[0];
    if (!def || !def.steps.some(function (s) { return s.id === sid; })) throw new Error('unknown routine step');
    var today = todayLocal_();
    var ticks = applyTick(readJsonProp_(ROUTINE_TICKS_PROP_, null), today, rid, sid, !!body.done);
    PropertiesService.getScriptProperties().setProperty(ROUTINE_TICKS_PROP_, JSON.stringify(ticks));
    var view = routinesForSnapshot_();
    var snap = readSnapshot_();
    if (snap) { snap.routines = view; writeSnapshot_(snap); }
    return { ok: true, routines: view };
  });
}
