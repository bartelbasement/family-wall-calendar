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

/** editId: the item being edited, shown as a text box with Save and Delete. Its text
 *  is filled in by the caller, so a background redraw can't wipe what is being typed. */
export function groceryListHtml(items, editId) {
  const open = items.filter((x) => !x.done), done = items.filter((x) => x.done);
  if (!items.length) return `<p class="gr-empty">The list is empty. Add what you need above.</p>`;
  const row = (x) => {
    const saving = String(x.id).startsWith('tmp-');
    if (x.id === editId) {
      return `<div class="gr-item editing">
      <input id="gr-edit-in" class="gr-edit-in" type="text" maxlength="100" autocomplete="off" enterkeyhint="done" aria-label="Item name">
      <button class="gr-save" data-gr-save="${esc(x.id)}">Save</button>
      <button class="gr-del" data-gr-del="${esc(x.id)}" aria-label="Delete ${esc(x.name)}">🗑</button></div>`;
    }
    return `<div class="gr-item"><button class="gr-row${x.done ? ' done' : ''}${saving ? ' saving' : ''}" data-gr-toggle="${esc(x.id)}">
    <span class="box" aria-hidden="true">${x.done ? '✓' : ''}</span><span class="gr-name">${esc(x.name)}</span></button>${
      saving ? '' : `<button class="gr-edit" data-gr-edit="${esc(x.id)}" aria-label="Edit ${esc(x.name)}">✎</button>`}</div>`;
  };
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
