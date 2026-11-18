/**
 * Weather from Open-Meteo (free, no key; uses Environment Canada's GEM model for BC).
 * Location comes from PRIVATE_CONFIG.weather = { lat, lon, name }; no location, no weather.
 * Cached 30 min; the last good copy is kept so a failed fetch never blanks the wall.
 */
var WEATHER_CACHE_KEY_ = 'weather_v1';
var WEATHER_LAST_PROP_ = 'WEATHER_LAST';

function getWeather_(cfg) {
  var w = cfg.weather;
  if (!w || w.lat == null || w.lon == null) return null;
  var cache = CacheService.getScriptCache();
  var hit = cache.get(WEATHER_CACHE_KEY_);
  if (hit) return JSON.parse(hit);

  var props = PropertiesService.getScriptProperties();
  try {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + Number(w.lat) + '&longitude=' + Number(w.lon) +
      '&current=temperature_2m,weather_code,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&timezone=' + encodeURIComponent(Session.getScriptTimeZone()) + '&forecast_days=16';
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('open-meteo http ' + res.getResponseCode());
    var out = parseWeather(JSON.parse(res.getContentText()), w.name);
    var json = JSON.stringify(out);
    cache.put(WEATHER_CACHE_KEY_, json, 1800);
    props.setProperty(WEATHER_LAST_PROP_, json);
    return out;
  } catch (err) {
    console.warn('weather fetch failed: ' + (err && err.message || err));
    var last = props.getProperty(WEATHER_LAST_PROP_);
    return last ? JSON.parse(last) : null;
  }
}

/** Pure: Open-Meteo response -> { place, fetchedAt, current:{temp,code,isDay}, days:{ymd:{code,hi,lo,pop}} }. */
function parseWeather(d, place) {
  var out = { place: place || '', fetchedAt: new Date().toISOString(), current: null, days: {} };
  if (d.current) {
    out.current = { temp: Math.round(d.current.temperature_2m), code: d.current.weather_code, isDay: d.current.is_day === 1 };
  }
  var dl = d.daily || {};
  (dl.time || []).forEach(function (t, i) {
    out.days[t] = {
      code: dl.weather_code[i],
      hi: Math.round(dl.temperature_2m_max[i]),
      lo: Math.round(dl.temperature_2m_min[i]),
      pop: dl.precipitation_probability_max[i] == null ? null : dl.precipitation_probability_max[i]
    };
  });
  return out;
}

/** Run from the editor: fetch and log the forecast (bypasses the cache). */
function testWeather() {
  CacheService.getScriptCache().remove(WEATHER_CACHE_KEY_);
  var w = getWeather_(getConfig_());
  if (!w) { console.log('No weather: set PRIVATE_CONFIG.weather = { lat, lon, name }'); return; }
  console.log('Now in ' + w.place + ': ' + w.current.temp + '° code ' + w.current.code);
  Object.keys(w.days).slice(0, 5).forEach(function (k) {
    var x = w.days[k];
    console.log(k + '  code ' + x.code + '  ' + x.hi + '/' + x.lo + '  rain ' + x.pop + '%');
  });
}

if (typeof module !== 'undefined') module.exports = { parseWeather: parseWeather };
