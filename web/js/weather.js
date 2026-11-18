// Weather display helpers. Data comes in the snapshot (snap.weather, from Open-Meteo).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
  const parts = [];
  if (d) parts.push(`H ${deg(d.hi)} · L ${deg(d.lo)}`);
  if (d && d.pop != null && d.pop >= 20) parts.push(`${d.pop}% rain`);
  return `<div class="wx-now" title="${esc(weather.place)}">
    <span class="wx-ic">${icon}</span>${cur ? `<span class="wx-t">${deg(cur.temp)}</span>` : ''}
    <span class="wx-d">${esc(label)}${parts.length ? '<br>' + parts.join(' · ') : ''}</span>
  </div>`;
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
