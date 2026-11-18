// Grocery list HTML. The add box and the list are separate so background
// refreshes can redraw the list without wiping what is being typed.
import { esc } from './render.js?v=__V__';

export const GROCERY_FORM = `<div class="gr">
  <div class="gr-add">
    <input id="gr-input" type="text" maxlength="100" autocomplete="off" enterkeyhint="send" placeholder="Add an item…">
    <button class="gr-add-btn" data-gr-add aria-label="Add item">＋</button>
  </div>
  <div id="gr-list" class="gr-list"></div>
</div>`;

export function groceryListHtml(items) {
  const open = items.filter((x) => !x.done), done = items.filter((x) => x.done);
  if (!items.length) return `<p class="gr-empty">The list is empty. Add what you need above.</p>`;
  const row = (x) => `<button class="gr-row${x.done ? ' done' : ''}${String(x.id).startsWith('tmp-') ? ' saving' : ''}" data-gr-toggle="${esc(x.id)}">
    <span class="box" aria-hidden="true">${x.done ? '✓' : ''}</span><span class="gr-name">${esc(x.name)}</span></button>`;
  return open.map(row).join('') +
    (done.length ? `<div class="gr-done-h"><span>In the cart · ${done.length}</span>
      <button class="gr-clear" data-gr-clear>Clear checked</button></div>${done.map(row).join('')}` : '');
}

export function grocerySheetHtml() {
  return `<div class="sheet gr-sheet" role="dialog" aria-modal="true" aria-label="Groceries">
    <button class="close" data-close aria-label="Close">✕</button>
    <h3>🛒 Groceries</h3>
    ${GROCERY_FORM}
  </div>`;
}
