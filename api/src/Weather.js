/**
 * Weather location for the clients. Each device fetches Open-Meteo itself:
 * requests from Apps Script come from Google's shared IP addresses, which
 * Open-Meteo rate-limits, so a server-side fetch is unreliable.
 * Location comes from PRIVATE_CONFIG.weather = { lat, lon, name }; no location, no weather.
 */
function weatherLocation_(cfg) {
  var w = cfg.weather;
  if (!w || w.lat == null || w.lon == null) return null;
  return { lat: Number(w.lat), lon: Number(w.lon), name: String(w.name || '') };
}
