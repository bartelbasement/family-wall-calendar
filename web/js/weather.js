// Weather from Open-Meteo (free, no key; Environment Canada's GEM model for BC).
// Each device fetches it directly (Apps Script's shared IPs get rate-limited);
// the snapshot only says where: snap.weatherAt = { lat, lon, name }.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LS_KEY = 'wall-weather-v1';
const FRESH_MS = 30 * 60e3;

/** Open-Meteo response -> { place, fetchedAt, current:{temp,code,isDay}, days:{ymd:{code,hi,lo,pop}} }. */
export function parseWeather(d, place) {
  const out = { place: place || '', fetchedAt: new Date().toISOString(), current: null, days: {} };
  if (d.current) out.current = { temp: Math.round(d.current.temperature_2m) || 0, code: d.current.weather_code, isDay: d.current.is_day === 1 };
  const dl = d.daily || {};
  (dl.time || []).forEach((t, i) => {
    out.days[t] = {
      code: dl.weather_code[i],
      hi: Math.round(dl.temperature_2m_max[i]) || 0,
      lo: Math.round(dl.temperature_2m_min[i]) || 0,
      pop: dl.precipitation_probability_max[i] ?? null
    };
  });
  return out;
}

/**
 * Keeps a forecast for the snapshot's location: refetched every 30 min, last good
 * copy kept in localStorage so a failed fetch or a reload never blanks it.
 */
export function createWeather(onChange) {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { saved = null; }
  let loc = null, busy = false;
  const sameLoc = (s) => s && loc && s.lat === loc.lat && s.lon === loc.lon;

  async function load() {
    if (!loc || busy) return;
    if (sameLoc(saved) && Date.now() - saved.at < FRESH_MS) return;
    busy = true;
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon +
        '&current=temperature_2m,weather_code,is_day' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
        '&timezone=' + encodeURIComponent(loc.tz || 'America/Vancouver') + '&forecast_days=16';
      const res = await fetch(url);
      if (!res.ok) throw new Error('http_' + res.status);
      saved = { at: Date.now(), lat: loc.lat, lon: loc.lon, data: parseWeather(await res.json(), loc.name) };
      try { localStorage.setItem(LS_KEY, JSON.stringify(saved)); } catch (e) { /* storage blocked */ }
      onChange();
    } catch (e) {
      console.warn('weather fetch failed', e); // keep the last good copy; retry on the next tick
    } finally {
      busy = false;
    }
  }
  setInterval(load, 5 * 60e3);

  return {
    /** Called with each snapshot: { lat, lon, name } or null, plus the snapshot's time zone. */
    setLocation(at, tz) {
      const next = at ? { lat: at.lat, lon: at.lon, name: at.name, tz } : null;
      const moved = !loc || !next || next.lat !== loc.lat || next.lon !== loc.lon;
      loc = next;
      if (loc && moved) load();
    },
    get() { return sameLoc(saved) ? saved.data : null; }
  };
}

/** WMO weather code -> [day icon, night icon, label]. */
function lookup(code) {
  if (code === 0) return ['☀️', '🌙', 'Clear'];
  if (code === 1) return ['🌤️', '🌙', 'Mostly clear'];
  if (code === 2) return ['⛅', '☁️', 'Partly cloudy'];
  if (code === 3) return ['☁️', '☁️', 'Cloudy'];
  if (code === 45 || code === 48) return ['🌫️', '🌫️', 'Fog'];
  if (code >= 51 && code <= 57) return ['🌦️', '🌧️', 'Drizzle'];
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['🌧️', '🌧️', 'Rain'];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['🌨️', '🌨️', 'Snow'];
  if (code >= 95) return ['⛈️', '⛈️', 'Thunderstorm'];
  return ['', '', ''];
}

const deg = (n) => `${n}°`;
const CURRENT_MAX_AGE_MS = 3 * 3600e3; // older "current" readings are hidden, forecasts kept

/** Small inline forecast for a day header: "🌧️ 9°/4°". */
export function dayWx(weather, ymd) {
  const d = weather && weather.days && weather.days[ymd];
  if (!d) return '';
  const [icon, , label] = lookup(d.code);
  const rain = d.pop != null && d.pop >= 40 ? ` · ${d.pop}% rain` : '';
  return `<span class="wx" title="${esc(label + rain)}">${icon} ${deg(d.hi)}<span class="lo">/${deg(d.lo)}</span></span>`;
}

/** Wall "Now" column: current temperature plus today's high/low and rain chance. */
export function nowWx(weather, ymd) {
  if (!weather) return '';
  const d = weather.days && weather.days[ymd];
  const cur = weather.current && Date.now() - Date.parse(weather.fetchedAt) < CURRENT_MAX_AGE_MS ? weather.current : null;
  if (!cur && !d) return '';
  const [dayIcon, nightIcon, label] = lookup(cur ? cur.code : d.code);
  const icon = cur && !cur.isDay ? nightIcon : dayIcon;
  // Sits beside the clock (bottom-aligned, under the corner buttons):
  // icon + temp, then the description and high/low on two small lines.
  const sub = [];
  if (d) sub.push(`${deg(d.hi)}/${deg(d.lo)}`);
  if (d && d.pop != null && d.pop >= 20) sub.push(`💧${d.pop}%`);
  return `<div class="wx-now" title="${esc(weather.place)}">
    <span class="wx-ic">${icon}</span>${cur ? `<span class="wx-t">${deg(cur.temp)}</span>` : ''}
    <span class="wx-d"><span>${esc(label)}</span>${sub.length ? `<span>${esc(sub.join(' '))}</span>` : ''}</span></div>`;
}

/** Phone header: "🌧️ 7°". */
export function headWx(weather, ymd) {
  if (!weather) return '';
  const cur = weather.current && Date.now() - Date.parse(weather.fetchedAt) < CURRENT_MAX_AGE_MS ? weather.current : null;
  const d = weather.days && weather.days[ymd];
  if (!cur && !d) return '';
  const [dayIcon, nightIcon] = lookup(cur ? cur.code : d.code);
  return `<span class="wx-head">${cur && !cur.isDay ? nightIcon : dayIcon} ${cur ? deg(cur.temp) : deg(d.hi)}</span>`;
}
