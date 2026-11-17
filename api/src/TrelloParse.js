/**
 * Pure Trello → common event model conversion. No Apps Script services here, so
 * Node tests can load it (see the module.exports guard at the bottom).
 */

var DESC_FIELDS_ = ['NOTE', 'ALERT', 'WHEN'];

/** Pulls NOTE:/ALERT:/WHEN: lines (case-insensitive) out of a card description. */
function parseDesc(desc) {
  var out = { note: null, alert: null, when: null };
  String(desc || '').split(/\r?\n/).forEach(function (line) {
    // Tolerates markdown wrappers such as "- **WHEN:** text" or "_NOTE_: text".
    var m = line.match(/^\s*(?:[*_>-]\s*)*([A-Za-z]+)[*_]*\s*:\s*(?:[*_]+\s*)?(.+?)\s*$/);
    if (!m) return;
    var field = m[1].toUpperCase();
    if (DESC_FIELDS_.indexOf(field) === -1) return;
    var key = field.toLowerCase();
    if (out[key] === null) out[key] = m[2];
  });
  return out;
}

/**
 * Removes a leading "Who: " prefix (e.g. "Stella: Volleyball", "LFES: No school")
 * when the prefix is one of the given names (person or label names, any case).
 * The badge already shows who, so the prefix is noise on the wall.
 */
function stripTitlePrefix(title, names) {
  var t = String(title || '').trim();
  var m = t.match(/^([^:]{1,30}):\s+(.+)$/);
  if (!m) return t;
  var prefix = m[1].trim().toLowerCase();
  var known = (names || []).some(function (n) { return String(n).trim().toLowerCase() === prefix; });
  return known ? m[2].trim() : t;
}

/** True when a WHEN: value means the item has no specific time. */
function isAllDayWhen(when) {
  return !!when && /\ball[\s-]?day\b/i.test(when);
}

/**
 * @param {Object} card  Trello card (name, desc, due, dueComplete, idList, labels, shortUrl, id)
 * @param {Object} ctx   { listSections: {listId: 'todo'|'event'|null},
 *                         labelPeople: {lowercased label name: person code},
 *                         offDayLabel: lowercased label name,
 *                         localDate: function(isoString) -> 'yyyy-MM-dd',
 *                         changes: {cardId: {change, changeNote}} }
 * @returns {Object|null} common event model, or null when the card is not shown
 */
function normalizeCard(card, ctx) {
  var section = ctx.listSections[card.idList];
  if (!section) return null; // Done or unknown lists are not displayed

  var rawLabels = (card.labels || []).map(function (l) { return String(l.name || '').trim(); });
  var labels = rawLabels.map(function (n) { return n.toLowerCase(); });
  var rawTitle = String(card.name || '').trim();
  var people = [];
  labels.forEach(function (name) {
    var code = ctx.labelPeople[name];
    if (code && people.indexOf(code) === -1) people.push(code);
  });
  if (!people.length) people.push('F');

  var d = parseDesc(card.desc);
  var allDay = isAllDayWhen(d.when);
  var start = card.due || null;
  var ch = (ctx.changes && ctx.changes[card.id]) || {};

  return {
    id: 't:' + card.id,
    trelloId: card.id,
    icalUid: null,
    source: 'trello',
    section: section,
    title: stripTitlePrefix(rawTitle, rawLabels.concat(ctx.personNames || [])),
    fullTitle: rawTitle,
    start: start,
    end: null,
    allDay: allDay,
    date: start ? ctx.localDate(start) : null,
    whenLabel: d.when,
    people: people,
    note: d.note,
    alert: d.alert,
    // Label is the convention; a "No school" title is accepted as a fallback.
    offDay: labels.indexOf(ctx.offDayLabel) !== -1 || /\bno school\b/i.test(rawTitle),
    done: !!card.dueComplete,
    change: ch.change || null,
    changeNote: ch.changeNote || null,
    location: null,
    url: card.shortUrl || null
  };
}

/**
 * Turns board actions (createCard / updateCard) into New/Changed markers.
 * Only edits to name, due date or description count as "changed"; moves and
 * position shuffles are ignored to keep the markers quiet.
 */
function changeMarkers(actions) {
  var out = {};
  (actions || []).forEach(function (a) {
    var card = a.data && a.data.card;
    if (!card || !card.id) return;
    if (a.type === 'createCard') {
      out[card.id] = { change: 'new', changeNote: null };
      return;
    }
    if (a.type !== 'updateCard' || (out[card.id] && out[card.id].change === 'new')) return;
    var old = (a.data && a.data.old) || {};
    var note = null;
    if ('due' in old) note = 'Time changed';
    else if ('name' in old) note = 'Renamed';
    else if ('desc' in old) note = 'Details updated';
    if (note) out[card.id] = { change: 'changed', changeNote: note };
  });
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = { stripTitlePrefix: stripTitlePrefix, parseDesc: parseDesc, isAllDayWhen: isAllDayWhen, normalizeCard: normalizeCard, changeMarkers: changeMarkers };
}
