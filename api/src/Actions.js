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

// ---------------------------------------------------------------- quick add

var VALID_PEOPLE_ = ['S', 'R', 'C', 'M', 'D', 'P', 'F'];

function cleanAddInput_(body) {
  var title = String(body.title || '').replace(/\s+/g, ' ').trim();
  if (!title || title.length > 120) throw new Error('title must be 1 to 120 characters');
  var people = (body.people || []).filter(function (p) { return VALID_PEOPLE_.indexOf(p) !== -1; });
  if (!people.length) people = ['F'];
  var date = body.date ? String(body.date) : null;
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('bad date');
  var time = body.time ? String(body.time) : null;
  if (time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('bad time');
  return { title: title, people: people, date: date, time: time };
}

function addDaysYmd_(ymd, n) {
  var p = ymd.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
}

/** Inserts an item into the stored snapshot, keeping its date order. */
function insertIntoSnapshot_(item) {
  patchSnapshot_(function (items) {
    items = items.filter(function (x) { return x.id !== item.id; });
    items.push(item);
    items.sort(function (a, b) {
      return (a.date || '9999').localeCompare(b.date || '9999') ||
        (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1) ||
        String(a.start || '').localeCompare(String(b.start || ''));
    });
    return items;
  });
}

/**
 * Creates a Google Calendar event on the configured "add" calendar.
 * Body: { title, people[], date, time? ('HH:mm'; omitted = all day), durationMin?, requestId }
 */
function addEvent_(body) {
  var input = cleanAddInput_(body);
  if (!input.date) throw new Error('date required');
  return once_(body.requestId, function () {
    var cfg = getConfig_();
    var tz = Session.getScriptTimeZone();
    var calId = cfg.addCalendarId || (cfg.calendars[0] && cfg.calendars[0].id);
    if (!calId) throw new Error('no calendar configured for adding events');
    var names = input.people.map(function (code) {
      var p = cfg.people.filter(function (x) { return x.code === code; })[0];
      return p ? p.name : code;
    });
    var resource = {
      summary: input.title,
      description: '(' + names.join(', ') + ') added from the family wall',
      extendedProperties: { 'private': {} }
    };
    resource.extendedProperties['private'][PERSON_PROP_] = input.people.join(',');
    if (input.time) {
      var start = Utilities.parseDate(input.date + ' ' + input.time, tz, 'yyyy-MM-dd HH:mm');
      var mins = Math.min(Math.max(Number(body.durationMin) || 60, 15), 12 * 60);
      var end = new Date(start.getTime() + mins * 60000);
      resource.start = { dateTime: start.toISOString(), timeZone: tz };
      resource.end = { dateTime: end.toISOString(), timeZone: tz };
    } else {
      resource.start = { date: input.date };
      resource.end = { date: addDaysYmd_(input.date, 1) };
    }
    var ev = Calendar.Events.insert(resource, calId);
    var cal = cfg.calendars.filter(function (c) { return c.id === calId; })[0] || {};
    var item = normalizeCalendarEvent(ev, {
      calendarId: calId, defaultPerson: cal.defaultPerson || null, people: cfg.people,
      localDate: function (iso) { return Utilities.formatDate(new Date(iso), tz, 'yyyy-MM-dd'); }
    });
    CacheService.getScriptCache().remove(CAL_CACHE_KEY_);
    if (item) insertIntoSnapshot_(item);
    return { ok: true, item: item };
  });
}

/** Board labels by lowercase name, cached for 6 hours. */
function boardLabelIds_(cfg) {
  var cache = CacheService.getScriptCache();
  var key = 'trello:labels:' + cfg.trello.boardId;
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var labels = trelloGet_('/boards/' + cfg.trello.boardId + '/labels', { fields: 'name', limit: 1000 });
  var map = {};
  labels.forEach(function (l) { if (l.name) map[String(l.name).trim().toLowerCase()] = l.id; });
  cache.put(key, JSON.stringify(map), 21600);
  return map;
}

function listIdByName_(cfg, name) {
  var cache = CacheService.getScriptCache();
  var key = 'trello:list:' + cfg.trello.boardId + ':' + name.toLowerCase();
  var id = cache.get(key);
  if (id) return id;
  var lists = trelloGet_('/boards/' + cfg.trello.boardId + '/lists', { fields: 'name', filter: 'open' });
  var hit = lists.filter(function (l) { return String(l.name).trim().toLowerCase() === name.toLowerCase(); })[0];
  if (!hit) throw new Error('Trello list "' + name + '" not found');
  cache.put(key, hit.id, 21600);
  return hit.id;
}

/**
 * Creates a Trello to-do card. Kids map to their labels; Mom/Dad/Parent map to
 * the Parent label. Body: { title, people[], date? (due), requestId }
 */
function addTodo_(body) {
  var input = cleanAddInput_(body);
  return once_(body.requestId, function () {
    var cfg = getConfig_();
    var tz = Session.getScriptTimeZone();
    var labelIds = boardLabelIds_(cfg);
    var want = {};
    input.people.forEach(function (code) {
      var target = (code === 'M' || code === 'D') ? 'P' : code;
      var p = cfg.people.filter(function (x) { return x.code === target; })[0];
      ((p && p.trelloLabels) || []).forEach(function (n) {
        var id = labelIds[String(n).toLowerCase()];
        if (id) want[id] = true;
      });
    });
    var params = { idList: listIdByName_(cfg, cfg.trello.todoList), name: input.title, pos: 'bottom',
      desc: 'Added from the family wall.' };
    var idLabels = Object.keys(want);
    if (idLabels.length) params.idLabels = idLabels.join(',');
    if (input.date) params.due = Utilities.parseDate(input.date + ' 12:00', tz, 'yyyy-MM-dd HH:mm').toISOString();
    var card = trelloWrite_('post', '/cards', params);
    var item = {
      id: 't:' + card.id, trelloId: card.id, icalUid: null, source: 'trello', section: 'todo',
      title: input.title, fullTitle: input.title, start: card.due || null, end: null, allDay: false,
      date: input.date, whenLabel: null, people: input.people, note: null, alert: null, offDay: false,
      done: false, change: 'new', changeNote: 'Added from the wall', location: null, url: card.shortUrl || null
    };
    CacheService.getScriptCache().remove(TRELLO_CACHE_KEY_);
    insertIntoSnapshot_(item);
    return { ok: true, item: item };
  });
}
