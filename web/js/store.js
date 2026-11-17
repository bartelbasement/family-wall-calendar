// Polls the snapshot, keeps the last good copy (memory + localStorage), and
// backs off on errors. The wall never blanks because of a failed fetch.
import { apiGet } from './api.js?v=__V__';

const LS_KEY = 'wall-snapshot-v1';
export const STALE_MINUTES = 20;

function loadCached() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { return null; }
}
function saveCached(snap) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(snap)); } catch (e) { /* quota or blocked */ }
}

export function createStore({ intervalMs = 5 * 60 * 1000, onChange, demoUrl = null }) {
  const state = { snap: demoUrl ? null : loadCached(), error: null, failures: 0, lastAttempt: null };
  let timer = null;

  const emit = () => onChange && onChange(state);

  async function refresh() {
    clearTimeout(timer);
    state.lastAttempt = Date.now();
    try {
      let snap;
      if (demoUrl) {
        const res = await fetch(demoUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error('demo_http_' + res.status);
        snap = await res.json();
        snap.updatedAt = new Date().toISOString(); // demo data is always "fresh"
      } else {
        snap = await apiGet('snapshot');
      }
      state.snap = snap;
      state.error = null;
      state.failures = 0;
      if (!demoUrl) saveCached(snap);
    } catch (e) {
      state.error = e.message || String(e);
      state.failures += 1;
    }
    emit();
    // Back off 30 s, 60 s, 2 min … capped at the normal interval.
    const delay = state.failures ? Math.min(30000 * 2 ** (state.failures - 1), intervalMs) : intervalMs;
    timer = setTimeout(refresh, delay + Math.random() * 5000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (!state.lastAttempt || Date.now() - state.lastAttempt > 60000)) refresh();
  });

  return {
    state,
    start() { emit(); refresh(); },
    refresh,
    /** Minutes since the snapshot was built on the server (null if none). */
    ageMinutes() { return state.snap ? (Date.now() - Date.parse(state.snap.updatedAt)) / 60000 : null; },
    isStale() { const a = this.ageMinutes(); return a === null || a > STALE_MINUTES || !!state.snap.stale; }
  };
}
