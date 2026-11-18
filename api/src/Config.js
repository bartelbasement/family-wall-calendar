/**
 * Runtime configuration. Generic defaults live here; family-specific values
 * (names, board ID, keywords) come from Private.js, which is git-ignored but
 * pushed by clasp. The on-wall settings screen (later) will override both via
 * Script Properties.
 */

var CONFIG_DEFAULTS_ = {
  trello: {
    boardId: null,
    todoList: 'To Do',
    eventList: 'Coming Up',
    doneList: 'Done',
    offDayLabel: 'No school'
  },
  changeWindowHours: 48,
  windowDays: 30,
  // Google calendars to read: [{ id, defaultPerson? }]. Set in Private.js.
  calendars: [],
  // Calendar that wall quick-add events are created on (defaults to the first calendar).
  addCalendarId: null,
  // Merge tuning. ignoreWords: extra words to drop from titles (e.g. school labels).
  merge: { maxMinutes: 90, minJaccard: 0.5, ignoreWords: [], synonyms: [] },
  // code: S/R/C kids, M/D/P adults, F family (fallback). Names come from Private.js.
  people: []
};

function getConfig_() {
  var priv = (typeof PRIVATE_CONFIG !== 'undefined') ? PRIVATE_CONFIG : {};
  var cfg = JSON.parse(JSON.stringify(CONFIG_DEFAULTS_));
  if (priv.trello) Object.keys(priv.trello).forEach(function (k) { cfg.trello[k] = priv.trello[k]; });
  if (priv.people) cfg.people = priv.people;
  if (priv.changeWindowHours) cfg.changeWindowHours = priv.changeWindowHours;
  if (priv.windowDays) cfg.windowDays = priv.windowDays;
  if (priv.calendars) cfg.calendars = priv.calendars;
  if (priv.addCalendarId) cfg.addCalendarId = priv.addCalendarId;
  if (priv.merge) Object.keys(priv.merge).forEach(function (k) { cfg.merge[k] = priv.merge[k]; });
  if (!cfg.trello.boardId) throw new Error('Trello boardId is not configured (see Private.example.js)');
  return cfg;
}
