// Kiosk-only behaviour for the wall iPad. Long-running WebKit pages leak memory
// and can freeze after days, so the page reloads itself every night and after
// a long run of failed fetches.
import { parts } from './time.js';

const RELOAD_HOUR = 3;            // 3 am Vancouver time
const MAX_UPTIME_MS = 26 * 3600e3; // backstop if the 3 am check is missed
const ERROR_RELOAD_FAILURES = 6;   // about 15+ minutes of failed fetches

export function startKiosk(store) {
  const loadedAt = Date.now();

  // Screen Wake Lock (iOS 16.4+ in Safari, 18.4+ for home-screen apps). It is a
  // backup to Auto-Lock = Never, and must be re-acquired after visibility changes.
  let lock = null;
  async function acquire() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible' && !lock) {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { lock = null; });
      }
    } catch (e) { lock = null; }
  }
  document.addEventListener('visibilitychange', acquire);
  document.addEventListener('click', acquire, { once: true }); // some browsers need a gesture
  acquire();

  // Only reload when the page itself is reachable: reloading while offline would
  // swap the calendar for Safari's error page, which never recovers on its own.
  let reloading = false;
  async function safeReload() {
    if (reloading) return;
    reloading = true;
    try {
      const res = await fetch(location.href, { cache: 'no-store' });
      if (res.ok) { location.reload(); return; }
    } catch (e) { /* offline: keep showing last good data */ }
    reloading = false;
  }

  setInterval(() => {
    const up = Date.now() - loadedAt;
    const p = parts(new Date());
    if ((up > 3600e3 && p.h === RELOAD_HOUR) || up > MAX_UPTIME_MS ||
        (up > 10 * 60e3 && store.state.failures >= ERROR_RELOAD_FAILURES)) {
      safeReload();
    }
  }, 60e3);
}
