/**
 * Web app entry points. Every request must carry the wall key (?key= on GET,
 * "key" in the JSON body on POST). POST bodies are sent as text/plain JSON so
 * browsers skip the CORS preflight, which Apps Script cannot answer.
 */

var GET_ACTIONS = {
  ping: function () {
    var tz = Session.getScriptTimeZone(), now = new Date();
    var probe = function (iso) { return Utilities.formatDate(new Date(iso), tz, 'yyyy-MM-dd HH:mm XXX'); };
    return {
      ok: true, now: now.toISOString(), tz: tz,
      local: Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm XXX'),
      // tzdata check: BC is UTC-7 year-round from 2026-03-08.
      probes: [probe('2026-03-01T20:00:00Z'), probe('2026-11-17T20:00:00Z'), probe('2027-01-15T20:00:00Z')]
    };
  },
  // Milestone 2 check: normalized Trello items. ?fresh=1 bypasses the 5-minute cache.
  trello: function (p) {
    var r = getTrelloItems_(p.fresh === '1');
    return { ok: true, boardName: r.boardName, fetchedAt: r.fetchedAt, count: r.items.length, items: r.items };
  },
  // The wall's data: stored merged snapshot (rebuilt every 5 minutes by trigger).
  snapshot: function () {
    var s = getSnapshot_();
    s.ok = true;
    return s;
  },
  // Milestone 4 check: which items merged, near misses.
  mergeReport: function (p) {
    var r = getMerged_(p.fresh === '1');
    return { ok: true, fetchedAt: r.fetchedAt, errors: r.errors, pairs: r.pairs, nearMisses: r.nearMisses, count: r.items.length };
  },
  // Milestone 3 check: normalized Google Calendar events (today .. +windowDays).
  calendar: function (p) {
    var r = getCalendarItems_(p.fresh === '1');
    return { ok: true, fetchedAt: r.fetchedAt, errors: r.errors, count: r.items.length, items: r.items };
  }
};

var POST_ACTIONS = {
  completeTodo: function (b) { return completeTodo_(b); }
};

function doGet(e) {
  var p = (e && e.parameter) || {};
  return handle_(p.key, p.action || 'ping', GET_ACTIONS, p);
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad_json' });
  }
  return handle_(body.key, body.action, POST_ACTIONS, body);
}

// Actions that return no family data and may be called without the key.
var PUBLIC_ACTIONS = { ping: true };

function handle_(key, action, table, args) {
  if (!(table === GET_ACTIONS && PUBLIC_ACTIONS[action]) && !checkKey_(key)) {
    return json_({ ok: false, error: 'forbidden' });
  }
  var fn = table[action];
  if (!fn) return json_({ ok: false, error: 'unknown_action', action: String(action) });
  try {
    return json_(fn(args));
  } catch (err) {
    console.error(action + ' failed: ' + (err && err.stack || err));
    return json_({ ok: false, error: 'server_error', message: String(err && err.message || err) });
  }
}
