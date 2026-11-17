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
