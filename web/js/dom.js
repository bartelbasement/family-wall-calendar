// Redraw a block without losing scroll positions. Rebuilding HTML replaces any
// scrollable lists inside it, which would jump back to the top (or start) on
// every redraw: each tap, each minute's clock tick, each data refresh.

/** A key that finds "the same" element after a rebuild: its id, else its tag and
 *  first class, plus which one it is among elements with that key. */
function keyOf(el, seen) {
  const base = el.id ? '#' + el.id : el.tagName + '.' + (el.classList[0] || '');
  const n = seen.get(base) || 0;
  seen.set(base, n + 1);
  return base + ':' + n;
}

/**
 * Run redraw(), then put back the scroll position of `root`, every scrolled
 * element inside it, and the page. If redraw() returns false (nothing changed),
 * nothing is touched. Only differing values are written, so a swipe in progress
 * isn't interrupted. Returns what redraw() returned.
 */
export function keepScroll(root, redraw) {
  const saved = new Map();
  const seen = new Map();
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const k = keyOf(el, seen);
    if (el.scrollTop || el.scrollLeft) saved.set(k, [el.scrollTop, el.scrollLeft]);
  }
  const page = window.scrollY;
  const out = redraw();
  if (out === false) return out;
  if (saved.size) {
    const seen2 = new Map();
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const v = saved.get(keyOf(el, seen2));
      if (!v) continue;
      if (el.scrollTop !== v[0]) el.scrollTop = v[0];
      if (el.scrollLeft !== v[1]) el.scrollLeft = v[1];
    }
  }
  if (window.scrollY !== page) window.scrollTo(0, page);
  return out;
}
