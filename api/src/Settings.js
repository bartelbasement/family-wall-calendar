/**
 * Wall-editable settings, stored as JSON in Script Properties (SETTINGS_V1).
 * They layer over Config defaults and Private.js (see getConfig_):
 *   calendars: which calendars show, default person, display style
 *   people:    name, badge, colour swatch, keywords (Trello labels stay in Private.js)
 *   options:   night hours, idle minutes
 *   routines:  stored separately in ROUTINES_V1 (see Routines.js), edited here too
 *   packing:   saved packing lists, stored separately (see Packing.js), edited here too
 *   tripEdits: grown-up changes to lists being packed (saved only, never read back)
 * Reads and writes require the parent PIN (Script Property SETTINGS_PIN).
 */

var SETTINGS_PROP_ = 'SETTINGS_V1';
var PIN_FAIL_KEY_ = 'pin:fails';
var PIN_MAX_FAILS_ = 5;
var PIN_LOCK_SECONDS_ = 900;

var SWATCHES_ = ['purple', 'green', 'amber', 'red', 'blue', 'teal', 'pink', 'orange', 'slate'];
var STYLES_ = ['normal', 'icons', 'fold'];
var DEFAULT_SWATCH_ = { S: 'purple', R: 'green', C: 'amber', M: 'red', D: 'red', P: 'red', F: 'slate' };
var DEFAULT_ICON_RULES_ = [
  { match: 'garbage', icon: '🗑️' }, { match: 'green', icon: '🌿' }, { match: 'compost', icon: '🌿' },
  { match: 'yard', icon: '🍂' }, { match: 'recycling', icon: '♻️' }, { match: 'glass', icon: '🫙' }
];
var DEFAULT_OPTIONS_ = { nightStart: '21:30', nightEnd: '06:30', idleMinutes: 2 };

function readSettings_() {
  var raw = PropertiesService.getScriptProperties().getProperty(SETTINGS_PROP_);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

/** Throws unless pin matches SETTINGS_PIN. Locks out after repeated failures. */
function checkPin_(pin) {
  var expected = prop_('SETTINGS_PIN');
  if (!expected) throw new Error('pin_not_set');
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get(PIN_FAIL_KEY_) || 0);
  if (fails >= PIN_MAX_FAILS_) throw new Error('pin_locked');
  if (String(pin || '') !== expected) {
    cache.put(PIN_FAIL_KEY_, String(fails + 1), PIN_LOCK_SECONDS_);
    throw new Error('bad_pin');
  }
  cache.remove(PIN_FAIL_KEY_);
}

/** Calendar style as stored in settings, derived from an effective calendar entry. */
function styleOf_(c) {
  return c.display === 'icon' ? 'icons' : c.fold ? 'fold' : 'normal';
}

/**
 * Current settings for the editor: every calendar the account can see (with
 * include/defaultPerson/style), people, options. Built from saved settings or,
 * the first time, from Private.js.
 */
function getSettingsForEditor_(body) {
  checkPin_(body.pin);
  var cfg = getConfig_();
  var saved = readSettings_() || {};
  var savedCals = {};
  (saved.calendars || []).forEach(function (c) { savedCals[c.id] = c; });
  var activeCals = {};
  cfg.calendars.forEach(function (c) { activeCals[c.id] = c; });

  var calendars = [], token;
  do {
    var page = Calendar.CalendarList.list({ pageToken: token, maxResults: 250 });
    (page.items || []).forEach(function (c) {
      var s = savedCals[c.id], a = activeCals[c.id];
      calendars.push({
        id: c.id,
        name: c.summaryOverride || c.summary,
        color: c.backgroundColor || null,
        include: s ? !!s.include : !!a,
        defaultPerson: s ? (s.defaultPerson || null) : (a && a.defaultPerson) || null,
        style: s ? (s.style || 'normal') : (a ? styleOf_(a) : 'normal'),
        foldTitle: s ? (s.foldTitle || '') : (a && a.fold && a.fold.title) || ''
      });
    });
    token = page.nextPageToken;
  } while (token);

  var people = cfg.people.map(function (p) {
    return { code: p.code, name: p.name, badge: p.badge || p.code, swatch: p.swatch || DEFAULT_SWATCH_[p.code] || 'slate',
      keywords: p.keywords || [] };
  });
  return { ok: true, settings: { calendars: calendars, people: people, options: cfg.options, routines: readRoutines_(), packing: readPackLists_(), trips: packingView([], readTrips_()).trips }, swatches: SWATCHES_ };
}

function cleanText_(s, max) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max); }
function cleanTime_(s, dflt) { s = String(s || ''); return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : dflt; }

/** Validates and saves settings, then rebuilds the snapshot so the wall updates. */
function saveSettings_(body) {
  checkPin_(body.pin);
  var cfg = getConfig_();
  var codes = cfg.people.map(function (p) { return p.code; });
  var input = body.settings || {};

  var calendars = (input.calendars || []).slice(0, 50).map(function (c) {
    return {
      id: cleanText_(c.id, 300),
      include: !!c.include,
      defaultPerson: codes.indexOf(c.defaultPerson) !== -1 ? c.defaultPerson : null,
      style: STYLES_.indexOf(c.style) !== -1 ? c.style : 'normal',
      foldTitle: cleanText_(c.foldTitle, 40)
    };
  }).filter(function (c) { return c.id; });

  var people = (input.people || []).filter(function (p) { return codes.indexOf(p.code) !== -1; }).map(function (p) {
    return {
      code: p.code,
      name: cleanText_(p.name, 24) || p.code,
      badge: cleanText_(p.badge, 4) || p.code,
      swatch: SWATCHES_.indexOf(p.swatch) !== -1 ? p.swatch : (DEFAULT_SWATCH_[p.code] || 'slate'),
      keywords: (p.keywords || []).map(function (k) { return cleanText_(k, 30).toLowerCase(); }).filter(Boolean).slice(0, 30)
    };
  });

  var o = input.options || {};
  var options = {
    nightStart: cleanTime_(o.nightStart, DEFAULT_OPTIONS_.nightStart),
    nightEnd: cleanTime_(o.nightEnd, DEFAULT_OPTIONS_.nightEnd),
    idleMinutes: Math.min(Math.max(Number(o.idleMinutes) || DEFAULT_OPTIONS_.idleMinutes, 1), 30)
  };

  var settings = { version: 1, savedAt: new Date().toISOString(), calendars: calendars, people: people, options: options };
  var json = JSON.stringify(settings);
  if (json.length > 9000) throw new Error('settings too large');
  if (Array.isArray(input.routines)) saveRoutines_(input.routines, cfg); // validated first: a bad list saves nothing
  if (Array.isArray(input.packing)) savePackLists_(input.packing, cfg);
  var tripResult = Array.isArray(input.tripEdits) && input.tripEdits.length ? saveTripEdits_(input.tripEdits) : null;
  PropertiesService.getScriptProperties().setProperty(SETTINGS_PROP_, json);

  var cache = CacheService.getScriptCache();
  cache.remove(CAL_CACHE_KEY_);
  cache.remove(TRELLO_CACHE_KEY_);
  buildSnapshot();
  return { ok: true, savedAt: settings.savedAt, trips: tripResult };
}

/** Layers saved settings over a config object (called from getConfig_). */
function applySettings_(cfg) {
  var s = readSettings_();
  cfg.options = JSON.parse(JSON.stringify(DEFAULT_OPTIONS_));
  if (!s) return cfg;
  if (s.options) Object.keys(DEFAULT_OPTIONS_).forEach(function (k) { if (s.options[k] != null) cfg.options[k] = s.options[k]; });

  if (s.people && s.people.length) {
    var byCode = {};
    s.people.forEach(function (p) { byCode[p.code] = p; });
    cfg.people = cfg.people.map(function (p) {
      var o = byCode[p.code];
      if (!o) return p;
      return { code: p.code, name: o.name || p.name, badge: o.badge || p.badge, swatch: o.swatch,
        trelloLabels: p.trelloLabels || [], keywords: o.keywords || [] };
    });
  }

  if (s.calendars && s.calendars.length) {
    var privateById = {};
    cfg.calendars.forEach(function (c) { privateById[c.id] = c; });
    cfg.calendars = s.calendars.filter(function (c) { return c.include; }).map(function (c) {
      var base = privateById[c.id] || {};
      var out = { id: c.id, defaultPerson: c.defaultPerson || null };
      if (c.style === 'icons') {
        out.display = 'icon';
        out.icons = base.icons || DEFAULT_ICON_RULES_;
        out.defaultIcon = base.defaultIcon || '📌';
      } else if (c.style === 'fold') {
        out.fold = { title: c.foldTitle || (base.fold && base.fold.title) || 'Busy' };
      }
      return out;
    });
  }
  return cfg;
}
