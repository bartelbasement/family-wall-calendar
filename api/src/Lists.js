/**
 * Shared lists (groceries) behind a small adapter, so the storage can move
 * (e.g. to Google Tasks) without touching the wall. Current implementation:
 * one Trello card with a checklist, set by PRIVATE_CONFIG.grocery = { card: '<id or short link>' }.
 *
 * Adapter shape: read() -> { items:[{id,name,done}] }, add(name), setDone(id, done), rename(id, name),
 * remove(id), clearDone().
 */
var GROCERY_CHECKLIST_NAME_ = 'Groceries';

function groceryAdapter_(cfg) {
  if (!cfg.grocery || !cfg.grocery.card) return null;
  return trelloChecklistList_(cfg, String(cfg.grocery.card));
}

function trelloChecklistList_(cfg, cardRef) {
  var cardId = null;
  function card_() {
    if (cardId) return cardId;
    var c = trelloGet_('/cards/' + encodeURIComponent(cardRef), { fields: 'idBoard,closed' });
    var board = trelloGet_('/boards/' + cfg.trello.boardId, { fields: 'id' });
    if (c.idBoard !== board.id) throw new Error('grocery card is not on the configured board');
    cardId = c.id;
    return cardId;
  }
  function checklists_() {
    return trelloGet_('/cards/' + card_() + '/checklists', { checkItems: 'all', checkItem_fields: 'name,state,pos', fields: 'name,pos' });
  }
  /** The first checklist on the card; created on demand when adding. */
  function checklistId_(create) {
    var lists = checklists_();
    if (lists.length) return lists[0].id;
    if (!create) return null;
    return trelloWrite_('post', '/cards/' + card_() + '/checklists', { name: GROCERY_CHECKLIST_NAME_ }).id;
  }
  function read() {
    var items = [];
    checklists_().forEach(function (cl) {
      (cl.checkItems || []).slice().sort(function (a, b) { return a.pos - b.pos; }).forEach(function (it) {
        items.push({ id: it.id, name: it.name, done: it.state === 'complete' });
      });
    });
    return { items: items, updatedAt: new Date().toISOString() };
  }
  return {
    read: read,
    add: function (name) {
      trelloWrite_('post', '/checklists/' + checklistId_(true) + '/checkItems', { name: name, pos: 'bottom' });
    },
    setDone: function (itemId, done) {
      trelloWrite_('put', '/cards/' + card_() + '/checkItem/' + itemId, { state: done ? 'complete' : 'incomplete' });
    },
    rename: function (itemId, name) {
      trelloWrite_('put', '/cards/' + card_() + '/checkItem/' + itemId, { name: name });
    },
    remove: function (itemId) {
      trelloWrite_('delete', '/cards/' + card_() + '/checkItem/' + itemId, {});
    },
    clearDone: function () {
      checklists_().forEach(function (cl) {
        (cl.checkItems || []).forEach(function (it) {
          if (it.state === 'complete') trelloWrite_('delete', '/checklists/' + cl.id + '/checkItems/' + it.id, {});
        });
      });
    }
  };
}

/** Snapshot builder: current list, or null when not configured / unreadable. */
function readGrocery_(cfg) {
  var a = groceryAdapter_(cfg);
  return a ? a.read() : null;
}

/** POST groceryAdd { name } | groceryToggle { itemId, done } | groceryRename { itemId, name }
 *  | groceryRemove { itemId } | groceryClear {}, each with a requestId. */
function groceryWrite_(op, body) {
  return once_(body.requestId, function () {
    var cfg = getConfig_();
    var a = groceryAdapter_(cfg);
    if (!a) throw new Error('No grocery list is set up');
    function name_() {
      var name = String(body.name || '').replace(/\s+/g, ' ').trim();
      if (!name || name.length > 100) throw new Error('item must be 1 to 100 characters');
      return name;
    }
    function itemId_() {
      if (!/^[0-9a-f]{24}$/.test(String(body.itemId || ''))) throw new Error('bad itemId');
      return String(body.itemId);
    }
    if (op === 'add') {
      a.add(name_());
    } else if (op === 'toggle') {
      a.setDone(itemId_(), !!body.done);
    } else if (op === 'rename') {
      a.rename(itemId_(), name_());
    } else if (op === 'remove') {
      a.remove(itemId_());
    } else if (op === 'clear') {
      a.clearDone();
    } else {
      throw new Error('unknown grocery op');
    }
    var list = a.read();
    var snap = readSnapshot_();
    if (snap) { snap.grocery = list; writeSnapshot_(snap); }
    return { ok: true, grocery: list };
  });
}
