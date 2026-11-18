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

/** Writes a <style> block giving each person code its swatch in light and dark themes. */
export function applyPeopleColors(people) {
  const rules = (fn) => (people || []).map((p) => {
    const sw = SWATCHES[p.swatch] || SWATCHES[DEFAULTS[p.code]] || SWATCHES.slate;
    return `.p-${p.code} { ${fn(sw)} }`;
  }).join('\n');
  const light = rules((s) => `--bg-p: ${s.l[0]}; --tx-p: ${s.l[1]}; --bd-p: ${s.l[2]};`);
  const dark = rules((s) => `--bg-p: ${s.d[0]}; --tx-p: ${s.d[1]}; --bd-p: ${s.l[2]};`);
  const css = `${light}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) ${dark.replace(/\n/g, '\n:root:not([data-theme="light"]) ')} }
:root[data-theme="dark"] ${dark.replace(/\n/g, '\n:root[data-theme="dark"] ')}
:root[data-theme="night"] ${dark.replace(/\n/g, '\n:root[data-theme="night"] ')}`;
  let el = document.getElementById('people-colors');
  if (!el) { el = document.createElement('style'); el.id = 'people-colors'; document.head.appendChild(el); }
  if (el.textContent !== css) el.textContent = css;
}
