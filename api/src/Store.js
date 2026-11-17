/**
 * Snapshot storage. The 5-minute trigger writes the merged snapshot to:
 *   - CacheService (fast; chunked because one value is limited to 100 KB)
 *   - Script Properties (durable last-good copy; chunked, 9 KB per value)
 * Reads try the cache first, then Properties.
 */

var SNAP_CACHE_PREFIX_ = 'snap:v1:';
var SNAP_PROP_PREFIX_ = 'SNAP_V1_';
var SNAP_CACHE_CHUNK_ = 90000;
var SNAP_PROP_CHUNK_ = 8000;
var SNAP_CACHE_SECONDS_ = 21600; // the 6-hour maximum

function chunk_(s, size) {
  var out = [];
  for (var i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

function writeSnapshot_(snap) {
  var json = JSON.stringify(snap);

  var cache = CacheService.getScriptCache();
  var cParts = chunk_(json, SNAP_CACHE_CHUNK_);
  var cMap = {};
  cParts.forEach(function (p, i) { cMap[SNAP_CACHE_PREFIX_ + i] = p; });
  cMap[SNAP_CACHE_PREFIX_ + 'n'] = String(cParts.length);
  cache.putAll(cMap, SNAP_CACHE_SECONDS_);

  var props = PropertiesService.getScriptProperties();
  var old = Number(props.getProperty(SNAP_PROP_PREFIX_ + 'N') || 0);
  var pParts = chunk_(json, SNAP_PROP_CHUNK_);
  var pMap = {};
  pParts.forEach(function (p, i) { pMap[SNAP_PROP_PREFIX_ + i] = p; });
  pMap[SNAP_PROP_PREFIX_ + 'N'] = String(pParts.length);
  props.setProperties(pMap);
  for (var i = pParts.length; i < old; i++) props.deleteProperty(SNAP_PROP_PREFIX_ + i);
}

function readSnapshot_() {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get(SNAP_CACHE_PREFIX_ + 'n') || 0);
  if (n) {
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(SNAP_CACHE_PREFIX_ + i);
    var got = cache.getAll(keys);
    if (keys.every(function (k) { return got[k] != null; })) {
      try { return JSON.parse(keys.map(function (k) { return got[k]; }).join('')); } catch (e) { /* fall through */ }
    }
  }
  var props = PropertiesService.getScriptProperties();
  var pn = Number(props.getProperty(SNAP_PROP_PREFIX_ + 'N') || 0);
  if (!pn) return null;
  var all = props.getProperties(), parts = [];
  for (var j = 0; j < pn; j++) {
    if (all[SNAP_PROP_PREFIX_ + j] == null) return null;
    parts.push(all[SNAP_PROP_PREFIX_ + j]);
  }
  try { return JSON.parse(parts.join('')); } catch (e) { return null; }
}
