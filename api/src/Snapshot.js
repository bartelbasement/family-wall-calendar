/** Combines Trello + Calendar into the merged list the wall displays. */

function mergeOptionsFromConfig_(cfg) {
  var names = [];
  cfg.people.forEach(function (p) { names.push(p.name); });
  return mergeOptions({
    ignoreWords: names.concat(cfg.merge.ignoreWords || []),
    synonyms: cfg.merge.synonyms || [],
    maxMinutes: cfg.merge.maxMinutes,
    minJaccard: cfg.merge.minJaccard
  });
}

function getMerged_(fresh) {
  var cfg = getConfig_();
  var t = getTrelloItems_(fresh);
  var c = getCalendarItems_(fresh);
  var r = mergeItems(t.items, c.items, mergeOptionsFromConfig_(cfg));
  r.items.sort(function (a, b) {
    return (a.date || '9999').localeCompare(b.date || '9999') ||
      (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1) ||
      String(a.start || '').localeCompare(String(b.start || ''));
  });
  return { fetchedAt: new Date().toISOString(), errors: c.errors, items: r.items, pairs: r.pairs, nearMisses: r.nearMisses };
}

var SNAPSHOT_STALE_MINUTES_ = 20;

/**
 * Trigger target (every 5 minutes): rebuilds the snapshot from live sources.
 * On failure the previous snapshot is kept and the error recorded, so the wall
 * keeps showing the last good data.
 */
function buildSnapshot() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // a build is already running
  var props = PropertiesService.getScriptProperties();
  try {
    var r = getMerged_(true);
    var cfg = getConfig_();
    var tz = Session.getScriptTimeZone(), now = new Date();
    var grocery = null;
    try { grocery = readGrocery_(cfg); } catch (e) {
      console.warn('grocery read failed: ' + e);
      var prev = readSnapshot_();
      grocery = prev ? prev.grocery || null : null; // keep the last good list
    }
    writeSnapshot_({
      version: 1,
      updatedAt: now.toISOString(),
      tz: tz,
      // Server's current UTC offset, e.g. "-07:00", so clients can verify their tzdata.
      tzOffset: Utilities.formatDate(now, tz, 'XXX'),
      today: Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
      sourceErrors: r.errors,
      people: cfg.people.map(function (p) {
        return { code: p.code, name: p.name, badge: p.badge || p.code, swatch: p.swatch || DEFAULT_SWATCH_[p.code] || 'slate' };
      }),
      options: cfg.options,
      weatherAt: weatherLocation_(cfg), // clients fetch the forecast (see Weather.js)
      grocery: grocery,
      items: r.items
    });
    props.setProperty('SNAP_LAST_OK', now.toISOString());
    props.deleteProperty('SNAP_LAST_ERROR');
  } catch (err) {
    console.error('buildSnapshot failed: ' + (err && err.stack || err));
    props.setProperty('SNAP_LAST_ERROR', new Date().toISOString() + ' ' + String(err && err.message || err).slice(0, 500));
  } finally {
    lock.releaseLock();
  }
}

/** Snapshot for the wall: stored copy, or a live build if none exists yet. */
function getSnapshot_() {
  var snap = readSnapshot_();
  if (!snap) {
    buildSnapshot();
    snap = readSnapshot_();
  }
  if (!snap) throw new Error('No snapshot available yet');
  var ageMin = (Date.now() - Date.parse(snap.updatedAt)) / 60000;
  snap.stale = ageMin > SNAPSHOT_STALE_MINUTES_;
  snap.lastError = PropertiesService.getScriptProperties().getProperty('SNAP_LAST_ERROR');
  return snap;
}

/** Run once from the editor: (re)creates the 5-minute buildSnapshot trigger. */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'buildSnapshot') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('buildSnapshot').timeBased().everyMinutes(5).create();
  buildSnapshot();
  var s = readSnapshot_();
  console.log('Trigger installed. Snapshot: ' + (s ? s.items.length + ' items at ' + s.updatedAt : 'NOT BUILT, see SNAP_LAST_ERROR'));
}

/** Run from the editor: dry-run merge report against live data. */
function testMerge() {
  var r = getMerged_(true);
  var counts = r.items.reduce(function (acc, x) { acc[x.source] = (acc[x.source] || 0) + 1; return acc; }, {});
  console.log('Items: ' + r.items.length + ' ' + JSON.stringify(counts) + (r.errors.length ? '  ERRORS: ' + JSON.stringify(r.errors) : ''));
  console.log('=== MERGED (' + r.pairs.length + ')');
  r.pairs.forEach(function (p) {
    console.log(p.date + '  [' + p.score + ']  T: ' + p.trello + '   ==   C: ' + p.calendar);
  });
  console.log('=== NEAR MISSES (' + r.nearMisses.length + ')');
  r.nearMisses.forEach(function (n) {
    console.log(n.date + '  (' + n.reason + ')  T: ' + n.trello + '   vs   C: ' + n.calendar);
  });
  console.log('=== TRELLO EVENTS NOT MERGED');
  r.items.filter(function (x) { return x.source === 'trello' && x.section === 'event'; }).forEach(function (x) {
    console.log(x.date + '  [' + x.people.join(',') + ']  ' + x.title);
  });
}
