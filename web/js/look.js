// Per-screen display choices (Settings › Display), kept in this device's storage:
//  - Appearance: follow the device (system), or force light or dark.
//  - Look: Classic or Linen. Linen has light and dark palettes; it steps aside at night.
// ?look=linen overrides the look for a quick comparison (review aid); ?theme= still
// overrides appearance in app.js.

export const LOOKS = [['classic', 'Classic'], ['linen', 'Linen']];
export const APPEARANCES = [['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']];
const LOOK_KEY = 'wall-look', APP_KEY = 'wall-appearance';
const valid = (list, v) => list.some(([k]) => k === v);
const read = (key) => { try { return localStorage.getItem(key); } catch (e) { return null; } };
const write = (key, v) => { try { localStorage.setItem(key, v); } catch (e) { /* ignore */ } };

let look = new URLSearchParams(location.search).get('look') || read(LOOK_KEY) || 'classic';
if (!valid(LOOKS, look)) look = 'classic';
let appearance = read(APP_KEY) || 'system';
if (!valid(APPEARANCES, appearance)) appearance = 'system';

const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export const getLook = () => look;
export const getAppearance = () => appearance;

// Web-font backups for Linen, for devices without Apple's Baskerville/Didot. Added only
// when Linen is picked, and not render-blocking. Browsers download a font file only
// when a local font earlier in the stack is missing, so iPads and iPhones fetch nothing
// but this small stylesheet.
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Baskervville:wght@400..700&family=Playfair+Display:wght@400;600&display=swap';
function loadLookFonts() {
  if (look !== 'linen' || document.getElementById('look-fonts')) return;
  const link = document.createElement('link');
  link.id = 'look-fonts'; link.rel = 'stylesheet'; link.href = FONT_CSS;
  document.head.appendChild(link);
}

/** Marks <html> with the look and its tone (light/dark) once app.js has set data-theme. */
export function applyLook() {
  loadLookFonts();
  const root = document.documentElement;
  const theme = root.dataset.theme;
  const dark = theme === 'dark' || theme === 'night' || (!theme && !!(darkQuery && darkQuery.matches));
  root.dataset.tone = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';  // form controls follow a forced appearance
  if (look !== 'classic' && theme !== 'night') root.dataset.look = look;
  else delete root.dataset.look;
}

export function setLook(v) {
  look = valid(LOOKS, v) ? v : 'classic';
  write(LOOK_KEY, look);
  applyLook();
}

/** app.js listens for this and re-applies the theme. */
export function setAppearance(v) {
  appearance = valid(APPEARANCES, v) ? v : 'system';
  write(APP_KEY, appearance);
  window.dispatchEvent(new Event('wall-appearance'));
}

if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', applyLook);
applyLook();
