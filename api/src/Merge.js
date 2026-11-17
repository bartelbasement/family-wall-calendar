/**
 * Display-only merge of Trello school items and Google Calendar events.
 * Pure functions; Node tests load this file directly.
 *
 * Two items are the same event when ALL hold:
 *   1. same local date (all-day calendar ranges cover the Trello date),
 *   2. start times within maxMinutes, or either one is all-day,
 *   3. titles match: Jaccard of key tokens >= minJaccard, or every key token of
 *      the shorter title appears in the longer one.
 * Calendar wins on time and location; Trello adds people, NOTE/ALERT/WHEN,
 * off-day flag, change markers and the card link.
 */

var MERGE_DEFAULTS_ = {
  maxMinutes: 90,
  minJaccard: 0.5,
  stopwords: ['the', 'a', 'an', 'at', 'vs', 'v', 'and', 'of', 'for', 'to', 'in', 'on', 'with',
    'am', 'pm', 'away', 'home', 'by', 'from', 'up', 'is'],
  // Phrases rewritten to one canonical token before tokenizing (longest first wins).
  synonyms: [
    { token: 'noschool', phrases: ['pro d day', 'pro d', 'prod day', 'no school', 'non instructional day',
      'design day', 'assessment day', 'professional development day'] }
  ],
  ignoreWords: [] // person names, school labels etc. (added from config)
};

function mergeOptions(overrides) {
  var o = JSON.parse(JSON.stringify(MERGE_DEFAULTS_));
  Object.keys(overrides || {}).forEach(function (k) {
    if (k === 'ignoreWords' || k === 'stopwords') o[k] = o[k].concat(overrides[k]);
    else if (k === 'synonyms') o.synonyms = o.synonyms.concat(overrides.synonyms);
    else o[k] = overrides[k];
  });
  return o;
}

/** Lowercased, punctuation-free key tokens with synonyms, stopwords, names and numbers removed. */
function keyTokens(title, opts) {
  var s = ' ' + String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  var rules = [];
  (opts.synonyms || []).forEach(function (syn) {
    syn.phrases.forEach(function (p) { rules.push({ phrase: p, token: syn.token }); });
  });
  rules.sort(function (a, b) { return b.phrase.length - a.phrase.length; });
  rules.forEach(function (r) {
    s = s.split(' ' + r.phrase + ' ').join(' ' + r.token + ' ');
  });
  var drop = {};
  opts.stopwords.concat(opts.ignoreWords).forEach(function (w) {
    String(w).toLowerCase().split(/[^a-z0-9]+/).forEach(function (p) { if (p) drop[p] = true; });
  });
  var out = [];
  s.trim().split(/\s+/).forEach(function (t) {
    if (!t || drop[t] || /^\d+$/.test(t) || /^\d+(am|pm)$/.test(t)) return;
    if (out.indexOf(t) === -1) out.push(t);
  });
  return out;
}

/** Title similarity in [0,1]: 1 for containment, else Jaccard. */
function titleScore(a, b) {
  if (!a.length || !b.length) return 0;
  var small = a.length <= b.length ? a : b, big = small === a ? b : a;
  var inter = small.filter(function (t) { return big.indexOf(t) !== -1; }).length;
  if (inter === small.length) return 1;
  var union = a.length + b.length - inter;
  return inter / union;
}

function coversDate_(cal, date) {
  return date >= cal.date && date <= (cal.endDate || cal.date);
}

/** Returns {ok, score, reason} for one Trello event vs one calendar event. */
function compareItems(t, c, opts) {
  if (!t.date || !c.date || !coversDate_(c, t.date)) return { ok: false, score: 0, reason: 'date' };
  if (!t.allDay && !c.allDay) {
    var mins = Math.abs(Date.parse(t.start) - Date.parse(c.start)) / 60000;
    if (!(mins <= opts.maxMinutes)) return { ok: false, score: 0, reason: 'time ' + Math.round(mins) + 'm' };
  }
  var score = titleScore(keyTokens(t.title, opts), keyTokens(c.title, opts));
  if (score === 1 || score >= opts.minJaccard) return { ok: true, score: score, reason: 'match' };
  return { ok: false, score: score, reason: 'title ' + score.toFixed(2) };
}

function mergePair_(t, c) {
  var people = c.people.concat(t.people).filter(function (p, i, arr) { return arr.indexOf(p) === i; });
  if (people.length > 1) people = people.filter(function (p) { return p !== 'F'; });
  var m = Object.assign({}, c);
  m.id = c.id + '|' + t.id;
  m.source = 'both';
  m.trelloId = t.trelloId;
  m.people = people;
  m.note = t.note; m.alert = t.alert; m.whenLabel = t.whenLabel;
  m.offDay = !!(t.offDay || c.offDay);
  m.change = t.change; m.changeNote = t.changeNote;
  m.trelloUrl = t.url;
  m.altTitle = t.title;
  return m;
}

/** Removes calendar events that share an iCalUID (same event on two calendars). */
function dedupeByUid(calItems) {
  var seen = {};
  return calItems.filter(function (c) {
    if (!c.icalUid) return true;
    var k = c.icalUid + '|' + (c.start || c.date);
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
}

/**
 * @returns {{items: Object[], pairs: Object[], nearMisses: Object[]}}
 *   items: merged + unmatched events and all to-dos; pairs/nearMisses for the report.
 */
function mergeItems(trelloItems, calItems, opts) {
  opts = opts || mergeOptions();
  var cals = dedupeByUid(calItems);
  var tEvents = trelloItems.filter(function (t) { return t.section === 'event' && t.date; });
  var mergeable = cals.filter(function (c) { return c.display !== 'icon'; });

  var candidates = [], nearMisses = [];
  tEvents.forEach(function (t) {
    mergeable.forEach(function (c) {
      var r = compareItems(t, c, opts);
      if (r.ok) candidates.push({ t: t, c: c, score: r.score });
      else if (r.reason !== 'date' && r.score > 0) nearMisses.push({ trello: t.title, calendar: c.title, date: t.date, reason: r.reason });
    });
  });
  // Best score first; ties prefer the closest start time. One-to-one.
  candidates.sort(function (a, b) {
    return (b.score - a.score) ||
      (Math.abs(Date.parse(a.t.start) - Date.parse(a.c.start || a.t.start)) - Math.abs(Date.parse(b.t.start) - Date.parse(b.c.start || b.t.start)));
  });
  var usedT = {}, usedC = {}, pairs = [];
  candidates.forEach(function (x) {
    if (usedT[x.t.id] || usedC[x.c.id]) return;
    usedT[x.t.id] = usedC[x.c.id] = true;
    pairs.push({ t: x.t, c: x.c, score: x.score });
  });

  var items = pairs.map(function (p) { return mergePair_(p.t, p.c); })
    .concat(cals.filter(function (c) { return !usedC[c.id]; }))
    .concat(trelloItems.filter(function (t) { return !usedT[t.id]; }));

  return {
    items: items,
    pairs: pairs.map(function (p) { return { date: p.t.date, trello: p.t.title, calendar: p.c.title, score: Math.round(p.score * 100) / 100 }; }),
    nearMisses: nearMisses
  };
}

if (typeof module !== 'undefined') {
  module.exports = { mergeOptions: mergeOptions, keyTokens: keyTokens, titleScore: titleScore,
    compareItems: compareItems, dedupeByUid: dedupeByUid, mergeItems: mergeItems };
}
