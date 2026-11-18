// wall  = kiosk iPad (large type, idle->home, night mode, wake lock, nightly reload)
// phone = portrait agenda with bottom tabs
// auto  = phone below 700 px wide, otherwise the wall layout without kiosk behaviour
const LS_KEY = 'wall-mode';
const VALID = ['wall', 'phone', 'auto'];

export function getMode() {
  const url = new URL(location.href);
  const q = url.searchParams.get('mode');
  if (VALID.includes(q)) {
    try { localStorage.setItem(LS_KEY, q); } catch (e) { /* ignore */ }
    if (!url.searchParams.has('install')) { // install links keep their parameters (see api.js)
      url.searchParams.delete('mode');
      history.replaceState(null, '', url);
    }
  }
  let saved = q;
  if (!saved) { try { saved = localStorage.getItem(LS_KEY); } catch (e) { saved = null; } }
  const chosen = VALID.includes(saved) ? saved : 'auto';
  const layout = chosen === 'auto' ? (window.innerWidth < 700 ? 'phone' : 'wide') : (chosen === 'phone' ? 'phone' : 'wide');
  return { setting: chosen, kiosk: chosen === 'wall', layout };
}
