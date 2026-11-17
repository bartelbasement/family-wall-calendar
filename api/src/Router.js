/**
 * Web app entry points. Every request must carry the wall key (?key= on GET,
 * "key" in the JSON body on POST). POST bodies are sent as text/plain JSON so
 * browsers skip the CORS preflight, which Apps Script cannot answer.
 */

var GET_ACTIONS = {
  ping: function () {
    return { ok: true, now: new Date().toISOString(), tz: Session.getScriptTimeZone() };
  }
};

var POST_ACTIONS = {};

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

function handle_(key, action, table, args) {
  if (!checkKey_(key)) return json_({ ok: false, error: 'forbidden' });
  var fn = table[action];
  if (!fn) return json_({ ok: false, error: 'unknown_action', action: String(action) });
  try {
    return json_(fn(args));
  } catch (err) {
    console.error(action + ' failed: ' + (err && err.stack || err));
    return json_({ ok: false, error: 'server_error', message: String(err && err.message || err) });
  }
}
