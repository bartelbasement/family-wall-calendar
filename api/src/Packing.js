/**
 * Packing lists (M16). Logic is in PackingCore.js; this file stores it.
 *
 * A Script Property holds at most 9 KB, so each saved list and each trip gets
 * its own property: PACK_L_<id> (saved list) and PACK_T_<id> (trip). The order
 * of saved lists is kept in PACK_ORDER. Saved lists are edited in Settings
 * (PIN). Kids start, tick and end trips from the wall without the PIN;
 * grown-ups change a trip's items in Settings (saveTripEdits_). Every write patches the
 * snapshot straight away, like the routine ticks.
 */

var PACK_LIST_PREFIX_ = 'PACK_L_';
var PACK_TRIP_PREFIX_ = 'PACK_T_';
var PACK_ORDER_PROP_ = 'PACK_ORDER';

function packProps_() { return PropertiesService.getScriptProperties(); }

function packJson_(raw) {
  try { return JSON.parse(raw); } catch (e) { return null; }
}

/** Every property with this prefix, parsed. */
function readPrefixed_(prefix) {
  var all = packProps_().getProperties(), out = [];
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(prefix) === 0) {
      var v = packJson_(all[k]);
      if (v) out.push(v);
    }
  });
  return out;
}

/** Saved lists in the order they were saved. */
function readPackLists_() {
  var order = readJsonProp_(PACK_ORDER_PROP_, []);
  return readPrefixed_(PACK_LIST_PREFIX_).sort(function (a, b) {
    var ia = order.indexOf(a.id), ib = order.indexOf(b.id);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

function readTrips_() { return readPrefixed_(PACK_TRIP_PREFIX_); }

function readTrip_(id) {
  if (!PACK_ID_RE_.test(String(id || ''))) throw new Error('bad tripId');
  var t = packJson_(packProps_().getProperty(PACK_TRIP_PREFIX_ + id) || '');
  if (!t) throw new Error('that packing list is no longer in progress');
  return t;
}

function packJsonChecked_(obj) {
  var json = JSON.stringify(obj);
  if (json.length > 9000) throw new Error('packing list too large (fewer or shorter items)');
  return json;
}

function writeTrip_(t) { packProps_().setProperty(PACK_TRIP_PREFIX_ + t.id, packJsonChecked_(t)); }

/** Validates and stores the saved lists from the settings editor (replaces them all). */
function savePackLists_(input, cfg) {
  var codes = cfg.people.map(function (p) { return p.code; });
  var prev = readPackLists_();
  var lists = cleanPackLists(input, prev, codes, routineId_);
  var props = packProps_(), batch = {};
  lists.forEach(function (l) { batch[PACK_LIST_PREFIX_ + l.id] = packJsonChecked_(l); }); // all checked before any write
  batch[PACK_ORDER_PROP_] = JSON.stringify(lists.map(function (l) { return l.id; }));
  props.setProperties(batch);
  var keep = {};
  lists.forEach(function (l) { keep[l.id] = true; });
  prev.forEach(function (l) { if (!keep[l.id]) props.deleteProperty(PACK_LIST_PREFIX_ + l.id); });
  return lists; // trips already started from a deleted list carry on
}

/** Snapshot part: { lists (no items), trips }. */
function packingForSnapshot_() {
  return packingView(readPackLists_(), readTrips_());
}

function patchPackingSnapshot_() {
  var view = packingForSnapshot_();
  var snap = readSnapshot_();
  if (snap) { snap.packing = view; writeSnapshot_(snap); }
  return { ok: true, packing: view };
}

/** POST packStart { listId, people: [codes], leave: 'yyyy-MM-dd' | '', requestId } */
function packStart_(body) {
  return once_(body.requestId, function () {
    var listId = String(body.listId || '');
    var list = readPackLists_().filter(function (l) { return l.id === listId; })[0];
    if (!list) throw new Error('unknown packing list');
    var codes = getConfig_().people.map(function (p) { return p.code; });
    var trips = startTrips(list, body.people, body.leave, todayLocal_(), codes, routineId_);
    if (readTrips_().length + trips.length > PACK_TRIPS_MAX_) throw new Error('too many packing lists in progress');
    var batch = {};
    trips.forEach(function (t) { batch[PACK_TRIP_PREFIX_ + t.id] = packJsonChecked_(t); });
    packProps_().setProperties(batch);
    return patchPackingSnapshot_();
  });
}

/** POST packTick { tripId, itemId, done, requestId } */
function packTick_(body) {
  return once_(body.requestId, function () {
    writeTrip_(tickTrip(readTrip_(body.tripId), String(body.itemId || ''), !!body.done));
    return patchPackingSnapshot_();
  });
}

/** POST packEnd { tripId, requestId }: Done or Cancel. Ending one that's already gone is fine. */
function packEnd_(body) {
  return once_(body.requestId, function () {
    if (!PACK_ID_RE_.test(String(body.tripId || ''))) throw new Error('bad tripId');
    packProps_().deleteProperty(PACK_TRIP_PREFIX_ + body.tripId);
    return patchPackingSnapshot_();
  });
}

/**
 * Grown-up edits to trips in progress, sent with saveSettings (the PIN is
 * already checked there). Locked so a kid's tick can't land in between the
 * read and the write. Saved lists are written after savePackLists_, so
 * "also update the saved list" wins over an edit of that list in the same save.
 */
function saveTripEdits_(edits) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var r = applyTripEdits(readTrips_(), edits, routineId_);
    var batch = {};
    r.trips.forEach(function (t) { batch[PACK_TRIP_PREFIX_ + t.id] = packJsonChecked_(t); });
    readPackLists_().forEach(function (l) {
      if (r.lists[l.id]) batch[PACK_LIST_PREFIX_ + l.id] = packJsonChecked_(Object.assign({}, l, { items: r.lists[l.id] }));
    });
    if (Object.keys(batch).length) packProps_().setProperties(batch);
    return { changed: r.trips.length, skipped: r.skipped };
  } finally {
    lock.releaseLock();
  }
}
