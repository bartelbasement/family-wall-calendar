// Person colour swatches. Each has light [bg, text, border] and dark [bg, text]
// values; the border colour is shared. Settings store the swatch name per person.
export const SWATCHES = {
  purple: { l: ['#EEEDFE', '#3C3489', '#7F77DD'], d: ['#2E2869', '#E4E2FD'] },
  green:  { l: ['#EAF3DE', '#27500A', '#639922'], d: ['#233F0C', '#E2F0D2'] },
  amber:  { l: ['#FAEEDA', '#633806', '#EF9F27'], d: ['#4E2C07', '#FAEEDA'] },
  red:    { l: ['#FCEBEB', '#791F1F', '#E24B4A'], d: ['#5A1A1A', '#FCE3E3'] },
  blue:   { l: ['#E6F1FB', '#0C447C', '#378ADD'], d: ['#0E3358', '#E1EEFB'] },
  teal:   { l: ['#E1F5EE', '#085041', '#1D9E75'], d: ['#0B3B30', '#DDF3EB'] },
  pink:   { l: ['#FBEAF0', '#72243E', '#D4537E'], d: ['#4F1A2D', '#FBE4EC'] },
  orange: { l: ['#FAECE7', '#712B13', '#D85A30'], d: ['#4F1F0E', '#FBE6DE'] },
  slate:  { l: ['#E8EDF2', '#2B3A4A', '#64788C'], d: ['#263240', '#DCE5EE'] }
};
export const DEFAULTS = { S: 'purple', R: 'green', C: 'amber', M: 'red', D: 'red', P: 'red', F: 'slate' };

// Muted, earthy stand-ins used by the Linen look, keyed by the same swatch names so
// each person keeps "their" colour. Same shape as SWATCHES: light [bg, text, border],
// dark [bg, text] (the border is shared). White badge letters on the border stay at
// 3.8:1 or better; text on its background is 6.9:1 or better in both tones.
export const LOOK_SWATCHES = {
  linen: {
    purple: { l: ['#EEEAF3', '#4A3F5E', '#7D6E96'], d: ['#36304A', '#E6E0F0'] },  // lavender
    green:  { l: ['#E7ECE0', '#3B5034', '#6B8460'], d: ['#2E3A29', '#DFE8D6'] },  // sage
    amber:  { l: ['#F5EBD8', '#664A1C', '#A57B3A'], d: ['#43361F', '#F3E6CC'] },  // honey
    red:    { l: ['#F5E5DF', '#7A3427', '#AD5D48'], d: ['#4A2A22', '#F5DDD5'] },  // terracotta
    blue:   { l: ['#E4EAF0', '#2F4558', '#5F7C95'], d: ['#283542', '#DCE6EF'] },  // dusty blue
    teal:   { l: ['#E1ECE8', '#2C4F45', '#5A8577'], d: ['#263A34', '#D9EBE4'] },  // eucalyptus
    pink:   { l: ['#F6E7E8', '#763A45', '#B06A74'], d: ['#47292F', '#F5DEE1'] },  // blush
    orange: { l: ['#F7E8DE', '#713F29', '#B5724F'], d: ['#4A2F22', '#F6E1D3'] },  // apricot
    slate:  { l: ['#ECE9E3', '#48433C', '#837A6E'], d: ['#36322D', '#E8E3DB'] }   // stone
  }
};

/** [bg, text, border] for a swatch in the look and tone showing on this page (Settings previews). */
export function swatchColors(name) {
  const root = document.documentElement;
  const look = LOOK_SWATCHES[root.dataset.look];
  const key = SWATCHES[name] ? name : 'slate';
  if (!look) return SWATCHES[key].l;
  const sw = look[key];
  return root.dataset.tone === 'dark' ? [sw.d[0], sw.d[1], sw.l[2]] : sw.l;
}

/** Writes a <style> block giving each person code its swatch in light and dark themes. */
export function applyPeopleColors(people) {
  const rules = (fn) => (people || []).map((p) => {
    const sw = SWATCHES[p.swatch] || SWATCHES[DEFAULTS[p.code]] || SWATCHES.slate;
    return `.p-${p.code} { ${fn(sw)} }`;
  }).join('\n');
  const light = rules((s) => `--bg-p: ${s.l[0]}; --tx-p: ${s.l[1]}; --bd-p: ${s.l[2]};`);
  const dark = rules((s) => `--bg-p: ${s.d[0]}; --tx-p: ${s.d[1]}; --bd-p: ${s.l[2]};`);
  // Looks swap in their own palette; look.js sets data-look and data-tone on <html>.
  const looks = Object.entries(LOOK_SWATCHES).map(([look, pal]) => (people || []).map((p) => {
    const sw = pal[p.swatch] || pal[DEFAULTS[p.code]] || pal.slate;
    const sel = (tone) => `:root[data-look="${look}"][data-tone="${tone}"] .p-${p.code}`;
    return `${sel('light')} { --bg-p: ${sw.l[0]}; --tx-p: ${sw.l[1]}; --bd-p: ${sw.l[2]}; }\n` +
      `${sel('dark')} { --bg-p: ${sw.d[0]}; --tx-p: ${sw.d[1]}; --bd-p: ${sw.l[2]}; }`;
  }).join('\n')).join('\n');
  const css = `${light}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) ${dark.replace(/\n/g, '\n:root:not([data-theme="light"]) ')} }
:root[data-theme="dark"] ${dark.replace(/\n/g, '\n:root[data-theme="dark"] ')}
:root[data-theme="night"] ${dark.replace(/\n/g, '\n:root[data-theme="night"] ')}
${looks}`;
  let el = document.getElementById('people-colors');
  if (!el) { el = document.createElement('style'); el.id = 'people-colors'; document.head.appendChild(el); }
  if (el.textContent !== css) el.textContent = css;
}
