/**
 * Google Calendar access via the Calendar advanced service (userSymbol "Calendar").
 * Calendars to read come from config.calendars: [{ id, defaultPerson? }].
 */

var CAL_CACHE_KEY_ = 'calendar:items:v1';
var CAL_CACHE_SECONDS_ = 300;

/** Run from the editor: logs every calendar this account can see, with IDs. */
function listCalendars() {
  var page, token;
  do {
    page = Calendar.CalendarList.list({ pageToken: token, maxResults: 250 });
    (page.items || []).forEach(function (c) {
      console.log((c.primary ? '[primary] ' : '') + c.summary + '  |  access: ' + c.accessRole + '  |  id: ' + c.id);
    });
    token = page.nextPageToken;
  } while (token);
}

/** Run from the editor after setting calendars in Private.js. */
function testCalendar() {
  var r = getCalendarItems_(true);
  console.log(r.items.length + ' events from ' + r.calendars.length + ' calendar(s)');
  r.items.slice(0, 15).forEach(function (e) {
    console.log(e.date + ' ' + (e.allDay ? 'all-day' : e.start.slice(11, 16) + 'Z') + '  [' + e.people.join(',') + ']  ' + e.title);
  });
}

function fetchCalendarEvents_(calendarId, timeMin, timeMax) {
  var items = [], token;
  do {
    var page = Calendar.Events.list(calendarId, {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,          // expand recurring events
      orderBy: 'startTime',
      showDeleted: false,
      maxResults: 250,
      pageToken: token
    });
    items = items.concat(page.items || []);
    token = page.nextPageToken;
  } while (token);
  return items;
}

/** Fetches and normalizes today .. +windowDays from every configured calendar. */
function getCalendarItems_(fresh) {
  var cache = CacheService.getScriptCache();
  if (!fresh) {
    var hit = cache.get(CAL_CACHE_KEY_);
    if (hit) return JSON.parse(hit);
  }

  var cfg = getConfig_();
  var tz = Session.getScriptTimeZone();
  var todayYmd = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  // Midnight today in Vancouver, expressed as an absolute instant.
  var timeMin = Utilities.parseDate(todayYmd + ' 00:00', tz, 'yyyy-MM-dd HH:mm');
  var timeMax = new Date(timeMin.getTime() + (cfg.windowDays + 1) * 86400e3);
  var localDate = function (iso) { return Utilities.formatDate(new Date(iso), tz, 'yyyy-MM-dd'); };

  var items = [], errors = [];
  cfg.calendars.forEach(function (c) {
    try {
      fetchCalendarEvents_(c.id, timeMin, timeMax).forEach(function (ev) {
        var e = normalizeCalendarEvent(ev, {
          calendarId: c.id, defaultPerson: c.defaultPerson || null, people: cfg.people, localDate: localDate
        });
        if (e) items.push(e);
      });
    } catch (err) {
      // One unreadable calendar should not blank the wall.
      console.error('Calendar ' + c.id + ' failed: ' + err.message);
      errors.push({ calendarId: c.id, error: String(err.message) });
    }
  });

  var result = { fetchedAt: new Date().toISOString(), calendars: cfg.calendars.map(function (c) { return c.id; }), errors: errors, items: items };
  if (!errors.length) {
    try { cache.put(CAL_CACHE_KEY_, JSON.stringify(result), CAL_CACHE_SECONDS_); }
    catch (err) { console.warn('Calendar result too large to cache: ' + err.message); }
  }
  return result;
}
