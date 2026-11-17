/**
 * Write actions called from the wall/phones (POST, text/plain JSON body).
 * Every write: key already checked by the router, idempotent by requestId,
 * serialized with a script lock, and patched straight into the stored snapshot
 * so the wall reflects it without waiting for the 5-minute rebuild.
 */

var REQ_CACHE_PREFIX_ = 'req:';

/** Runs fn once per requestId; a retried request gets the first result back. */
function once_(requestId, fn) {
  if (!requestId || String(requestId).length > 80) throw new Error('requestId required');
  var cache = CacheService.getScriptCache();
  var hit = cache.get(REQ_CACHE_PREFIX_ + requestId);
  if (hit) return JSON.parse(hit);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    hit = cache.get(REQ_CACHE_PREFIX_ + requestId);
    if (hit) return JSON.parse(hit);
    var result = fn();
    cache.put(REQ_CACHE_PREFIX_ + requestId, JSON.stringify(result), 600);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function trelloWrite_(method, path, params) {
  var auth = trelloAuth_();
  var qs = Object.keys(params || {}).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  });
  qs.push('key=' + encodeURIComponent(auth.key), 'token=' + encodeURIComponent(auth.token));
  var res = UrlFetchApp.fetch(TRELLO_API_ + path + '?' + qs.join('&'), { method: method, muteHttpExceptions: true });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('Trello ' + method + ' ' + path.split('/').slice(0, 2).join('/') + ' returned HTTP ' + code);
  return JSON.parse(res.getContentText() || '{}');
}

/** ID of the board's Done list (by configured name), cached for 6 hours. */
function doneListId_(cfg) {
  var cache = CacheService.getScriptCache();
  var key = 'trello:doneList:' + cfg.trello.boardId;
  var id = cache.get(key);
  if (id) return id;
  var lists = trelloGet_('/boards/' + cfg.trello.boardId + '/lists', { fields: 'name', filter: 'open' });
  var want = cfg.trello.doneList.toLowerCase();
  var hit = lists.filter(function (l) { return String(l.name).trim().toLowerCase() === want; })[0];
  if (!hit) throw new Error('Done list "' + cfg.trello.doneList + '" not found');
  cache.put(key, hit.id, 21600);
  return hit.id;
}

/** Applies fn(items) -> items to the stored snapshot, if there is one. */
function patchSnapshot_(fn) {
  var snap = readSnapshot_();
  if (!snap) return;
  snap.items = fn(snap.items || []);
  writeSnapshot_(snap);
  CacheService.getScriptCache().remove(TRELLO_CACHE_KEY_);
}

/** Marks a Trello to-do complete and moves it to Done. Body: { cardId, requestId } */
function completeTodo_(body) {
  var cardId = String(body.cardId || '');
  if (!/^[0-9a-f]{24}$/.test(cardId)) throw new Error('bad cardId');
  return once_(body.requestId, function () {
    var cfg = getConfig_();
    var card = trelloGet_('/cards/' + cardId, { fields: 'idBoard,closed' });
    // Only cards on the configured board may be changed from the wall.
    var board = trelloGet_('/boards/' + cfg.trello.boardId, { fields: 'id' });
    if (card.idBoard !== board.id) throw new Error('card is not on the school board');
    trelloWrite_('put', '/cards/' + cardId, { dueComplete: 'true', idList: doneListId_(cfg), pos: 'top' });
    patchSnapshot_(function (items) {
      return items.filter(function (x) { return x.trelloId !== cardId || x.section !== 'todo'; });
    });
    return { ok: true, cardId: cardId };
  });
}
