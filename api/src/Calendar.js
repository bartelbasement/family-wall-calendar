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
  console.log(r.items.length + ' events from ' + r.calendars.length + ' calendar(s), ' + r.errors.length + ' error(s)');
  var tz = Session.getScriptTimeZone();
  // Per calendar, so the small subscribed calendars are not hidden behind the busy ones.
  r.calendars.forEach(function (id) {
    var mine = r.items.filter(function (e) { return e.calendarId === id; });
    console.log('--- ' + id.slice(0, 24) + '… (' + mine.length + ')');
    mine.slice(0, 6).forEach(function (e) {
      var when = e.allDay ? 'all-day' : Utilities.formatDate(new Date(e.start), tz, 'HH:mm');
      console.log(e.date + ' ' + when + '  [' + e.people.join(',') + ']  ' + e.title);
    });
  });
}

/**
 * Fallback for calendars the advanced API refuses (subscribed ICS feeds,
 * "@import.calendar.google.com", return 404 there). Reads them with CalendarApp
 * and reshapes each event into the v3 resource shape normalizeCalendarEvent expects.
 */
function fetchViaCalendarApp_(calendarId, timeMin, timeMax, tz) {
  var cal = CalendarApp.getCalendarById(calendarId);
  if (!cal) throw new Error('CalendarApp cannot open ' + calendarId);
  var ymd = function (d) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); };
  var iso = function (d) { return Utilities.formatDate(d, tz, "yyyy-MM-dd'T'HH:mm:ssXXX"); };
  return cal.getEvents(timeMin, timeMax).map(function (e) {
    var allDay = e.isAllDayEvent();
    return {
      id: 'app_' + Utilities.base64EncodeWebSafe(e.getId() + '|' + e.getStartTime().getTime()).replace(/=+$/, ''),
      iCalUID: e.getId(),
      summary: e.getTitle(),
      location: e.getLocation() || null,
      start: allDay ? { date: ymd(e.getAllDayStartDate()) } : { dateTime: iso(e.getStartTime()) },
      end: allDay ? { date: ymd(e.getAllDayEndDate()) } : { dateTime: iso(e.getEndTime()) }
    };
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
      var raw;
      try {
        raw = fetchCalendarEvents_(c.id, timeMin, timeMax);
      } catch (apiErr) {
        console.warn('Advanced API failed for ' + c.id + ' (' + apiErr.message + '); using CalendarApp');
        raw = fetchViaCalendarApp_(c.id, timeMin, timeMax, tz);
      }
      raw.forEach(function (ev) {
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
