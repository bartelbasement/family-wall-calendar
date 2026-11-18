/**
 * Pure packing-list logic (no Apps Script services), so Node tests can load it.
 *
 * A saved list: { id, name, icon, person, items: [{ id, text }] }
 *   Grown-ups edit these in Settings (PIN). person is the usual owner or null.
 * A trip (a list being packed right now, one per kid):
 *   { id, listId, name, icon, person, leave: 'yyyy-MM-dd' | '', started: 'yyyy-MM-dd',
 *     items: [{ id, text, done }] }
 *   Kids start trips, tick items and end them. Ticks never reset on their own.
 */

var PACK_LISTS_MAX_ = 20;
var PACK_ITEMS_MAX_ = 40;
var PACK_TRIPS_MAX_ = 20;
var PACK_LEAVE_DAYS_ = 14;
var PACK_ID_RE_ = /^[A-Za-z0-9_-]{4,24}$/;

function pkText_(s, max) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max); }

/**
 * Item texts -> [{ id, text }], keeping an old id when the text is unchanged
 * (case-insensitive) so edits don't untick items that stayed the same.
 */
function pkItems_(texts, prevItems, newId) {
  var oldByText = {};
  (prevItems || []).forEach(function (it) {
    var k = String(it.text).toLowerCase();
    if (!oldByText[k]) oldByText[k] = it;
  });
  var used = {};
  return (texts || []).map(function (t) {
    return pkText_(typeof t === 'string' ? t : t && t.text, 50);
  }).filter(Boolean).slice(0, PACK_ITEMS_MAX_).map(function (text) {
    var old = oldByText[text.toLowerCase()];
    var id = old && !used[old.id] ? old.id : newId();
    used[id] = true;
    return { id: id, text: text, old: old && old.id === id ? old : null };
  });
}

/** A real 'yyyy-MM-dd' or ''. */
function pkDate_(s) {
  s = String(s || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && pkAddDays_(s, 0) === s ? s : '';
}

/** [from, until], either may be ''; swapped if entered backwards. */
function pkShowRange_(from, until) {
  from = pkDate_(from); until = pkDate_(until);
  return from && until && from > until ? [until, from] : [from, until];
}

/** Whether a saved list belongs in the wall's Pack row today. */
function packListShown(l, today) {
  return (!l.showFrom || today >= l.showFrom) && (!l.showUntil || today <= l.showUntil);
}

/** Validates saved lists from the settings editor. Lists with no items are dropped. */
function cleanPackLists(input, prev, codes, newId) {
  var prevById = {};
  (prev || []).forEach(function (l) { prevById[l.id] = l; });
  var seen = {};
  return (input || []).slice(0, PACK_LISTS_MAX_).map(function (l) {
    l = l || {};
    var id = PACK_ID_RE_.test(String(l.id || '')) && !seen[l.id] ? String(l.id) : newId();
    seen[id] = true;
    var old = prevById[id];
    var show = pkShowRange_(l.showFrom, l.showUntil);
    return {
      id: id,
      name: pkText_(l.name, 30) || 'Packing',
      icon: pkText_(l.icon, 4),
      person: codes.indexOf(l.person) !== -1 ? l.person : null,
      showFrom: show[0],
      showUntil: show[1],
      items: pkItems_(l.items, old && old.items, newId).map(function (it) { return { id: it.id, text: it.text }; })
    };
  }).filter(function (l) { return l.items.length; });
}

/** 'yyyy-MM-dd' + n days (calendar arithmetic, no time zones involved). */
function pkAddDays_(ymd, n) {
  var p = ymd.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.toISOString().slice(0, 10);
}

/** '' or a date from today to today + 14; anything else throws. */
function cleanLeave(leave, today) {
  leave = String(leave || '');
  if (!leave) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(leave) || pkAddDays_(leave, 0) !== leave) throw new Error('bad leave date');
  if (leave < today || leave > pkAddDays_(today, PACK_LEAVE_DAYS_)) throw new Error('leave date out of range');
  return leave;
}

/**
 * New trips for a saved list: one per person in people (valid codes only).
 * With nobody picked, the list's owner gets it (or nobody, for a family list).
 * Trip item ids are the saved list's item ids, so "also update the saved list"
 * can line them up later.
 */
function startTrips(list, people, leave, today, codes, newId) {
  var who = [];
  (people || []).forEach(function (c) { if (codes.indexOf(c) !== -1 && who.indexOf(c) === -1) who.push(c); });
  if (!who.length) who = [list.person || null];
  var lv = cleanLeave(leave, today);
  return who.map(function (person) {
    return {
      id: newId(), listId: list.id, name: list.name, icon: list.icon, person: person,
      leave: lv, started: today,
      items: list.items.map(function (it) { return { id: it.id, text: it.text, done: false }; })
    };
  });
}

/** A copy of trip with one item ticked or unticked; throws for an unknown item. */
function tickTrip(trip, itemId, done) {
  if (!trip.items.some(function (it) { return it.id === itemId; })) throw new Error('unknown packing item');
  var out = JSON.parse(JSON.stringify(trip));
  out.items.forEach(function (it) { if (it.id === itemId) it.done = !!done; });
  return out;
}

/** A copy of trip with a new item list (grown-up edit). Unchanged items keep their ticks. */
function editTrip(trip, texts, newId) {
  var items = pkItems_(texts, trip.items, newId).map(function (it) {
    return { id: it.id, text: it.text, done: !!(it.old && it.old.done) };
  });
  if (!items.length) throw new Error('a packing list needs at least one item');
  var out = JSON.parse(JSON.stringify(trip));
  out.items = items;
  return out;
}

/** The saved list with its items replaced by the trip's (for "also update the saved list"). */
function listFromTrip(list, trip) {
  return { id: list.id, name: list.name, icon: list.icon, person: list.person,
    showFrom: list.showFrom || '', showUntil: list.showUntil || '',
    items: trip.items.map(function (it) { return { id: it.id, text: it.text }; }) };
}

/**
 * Grown-up edits from Settings, applied to the trips in progress.
 * edits: [{ tripId, items: [text], saveToList, allCopies }]
 *   allCopies: every trip started from the same saved list gets these items
 *              (each keeps its own ticks on unchanged items).
 *   saveToList: the saved list takes the edited trip's items.
 * Trips that have ended since Settings opened are skipped.
 * Returns { trips: changed trips, lists: { listId: items }, skipped }.
 */
function applyTripEdits(trips, edits, newId) {
  var byId = {}, changed = {}, order = [], lists = {}, skipped = 0;
  (trips || []).forEach(function (t) { byId[t.id] = t; });
  (edits || []).slice(0, PACK_TRIPS_MAX_).forEach(function (e) {
    var trip = e && byId[e.tripId];
    if (!trip) { skipped++; return; }
    var targets = e.allCopies
      ? (trips || []).filter(function (t) { return t.listId === trip.listId; })
      : [trip];
    targets.forEach(function (t) {
      if (!changed[t.id]) order.push(t.id);
      changed[t.id] = editTrip(changed[t.id] || t, e.items, newId);
    });
    if (e.saveToList) {
      lists[trip.listId] = changed[trip.id].items.map(function (it) { return { id: it.id, text: it.text }; });
    }
  });
  return { trips: order.map(function (id) { return changed[id]; }), lists: lists, skipped: skipped };
}

/**
 * What the wall gets: saved lists without their items (just enough for the
 * "Pack:" row) and trips sorted by leave date, undated ones last, then by start.
 */
function packingView(lists, trips) {
  return {
    lists: (lists || []).map(function (l) {
      return { id: l.id, name: l.name, icon: l.icon, person: l.person, count: l.items.length,
        showFrom: l.showFrom || '', showUntil: l.showUntil || '' };
    }),
    trips: (trips || []).slice().sort(function (a, b) {
      return (a.leave || '9999').localeCompare(b.leave || '9999') ||
        a.started.localeCompare(b.started) || a.id.localeCompare(b.id);
    })
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    cleanPackLists: cleanPackLists, cleanLeave: cleanLeave, startTrips: startTrips, tickTrip: tickTrip,
    editTrip: editTrip, packListShown: packListShown, listFromTrip: listFromTrip, applyTripEdits: applyTripEdits, packingView: packingView,
    PACK_TRIPS_MAX_: PACK_TRIPS_MAX_
  };
}
