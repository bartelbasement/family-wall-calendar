/** Trello REST access. Credentials live in Script Properties TRELLO_KEY / TRELLO_TOKEN. */

var TRELLO_API_ = 'https://api.trello.com/1';
var TRELLO_CACHE_KEY_ = 'trello:items:v1';
var TRELLO_CACHE_SECONDS_ = 300;

function trelloAuth_() {
  var key = prop_('TRELLO_KEY'), token = prop_('TRELLO_TOKEN');
  if (!key || !token) throw new Error('TRELLO_KEY / TRELLO_TOKEN are not set in Script Properties');
  return { key: key, token: token };
}

function trelloGet_(path, params) {
  var auth = trelloAuth_();
  var qs = Object.keys(params || {}).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  });
  qs.push('key=' + encodeURIComponent(auth.key), 'token=' + encodeURIComponent(auth.token));
  var res = UrlFetchApp.fetch(TRELLO_API_ + path + '?' + qs.join('&'), { muteHttpExceptions: true });
  var code = res.getResponseCode();
  // Never include the URL in errors: it carries the key and token.
  if (code !== 200) throw new Error('Trello ' + path + ' returned HTTP ' + code + ': ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText());
}

/** Whole board in one call: open cards, open lists, labels. */
function trelloBoard_(boardId) {
  return trelloGet_('/boards/' + boardId, {
    fields: 'name',
    cards: 'open',
    card_fields: 'name,desc,due,dueComplete,idList,labels,shortUrl',
    lists: 'open',
    list_fields: 'name,pos',
    labels: 'all',
    label_fields: 'name,color',
    labels_limit: 1000
  });
}

function trelloRecentActions_(boardId, hours) {
  var since = new Date(Date.now() - hours * 3600e3).toISOString();
  return trelloGet_('/boards/' + boardId + '/actions', {
    filter: 'createCard,updateCard',
    since: since,
    limit: 500,
    fields: 'type,data,date'
  });
}

/** Run from the editor to authorize external requests and smoke-test Trello access. */
function testTrello() {
  var r = getTrelloItems_(true);
  var bySection = r.items.reduce(function (acc, x) { acc[x.section] = (acc[x.section] || 0) + 1; return acc; }, {});
  console.log(r.boardName + ': ' + r.items.length + ' items ' + JSON.stringify(bySection));
}

/** Fetches and normalizes the school board. Cached for 5 minutes unless fresh=true. */
function getTrelloItems_(fresh) {
  var cache = CacheService.getScriptCache();
  if (!fresh) {
    var hit = cache.get(TRELLO_CACHE_KEY_);
    if (hit) return JSON.parse(hit);
  }

  var cfg = getConfig_();
  var board = trelloBoard_(cfg.trello.boardId);

  var listSections = {};
  (board.lists || []).forEach(function (l) {
    var name = String(l.name).trim().toLowerCase();
    if (name === cfg.trello.todoList.toLowerCase()) listSections[l.id] = 'todo';
    else if (name === cfg.trello.eventList.toLowerCase()) listSections[l.id] = 'event';
  });

  var labelPeople = {};
  cfg.people.forEach(function (p) {
    (p.trelloLabels || []).forEach(function (n) { labelPeople[n.toLowerCase()] = p.code; });
  });

  var changes = {};
  try {
    changes = changeMarkers(trelloRecentActions_(cfg.trello.boardId, cfg.changeWindowHours));
  } catch (err) {
    console.warn('Change markers skipped: ' + err.message);
  }

  var tz = Session.getScriptTimeZone();
  var ctx = {
    listSections: listSections,
    labelPeople: labelPeople,
    offDayLabel: cfg.trello.offDayLabel.toLowerCase(),
    personNames: cfg.people.map(function (p) { return p.name; }),
    localDate: function (iso) { return Utilities.formatDate(new Date(iso), tz, 'yyyy-MM-dd'); },
    changes: changes
  };

  var items = (board.cards || []).map(function (c) { return normalizeCard(c, ctx); })
    .filter(function (x) { return x; });

  var result = { boardName: board.name, fetchedAt: new Date().toISOString(), items: items };
  try {
    cache.put(TRELLO_CACHE_KEY_, JSON.stringify(result), TRELLO_CACHE_SECONDS_);
  } catch (err) {
    console.warn('Trello result too large to cache: ' + err.message);
  }
  return result;
}
