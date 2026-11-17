// Vancouver time formatting. Uses the device's tz database unless it disagrees
// with the server's current offset (e.g. an old device that predates BC's 2026
// move to permanent UTC-7); then it falls back to the server's fixed offset.

const TZ = 'America/Vancouver';
let fixedOffsetMin = null;

function parseOffset(s) {
  const m = /^(?:GMT|UTC)?([+-])(\d{1,2}):?(\d{2})?$/.exec(String(s || '').trim());
  if (!m) return null;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
}

function deviceOffsetMin(d) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(d);
    const name = p.find((x) => x.type === 'timeZoneName').value; // "GMT-07:00"
    return name === 'GMT' ? 0 : parseOffset(name);
  } catch (e) {
    return null;
  }
}

/** Compare device vs server offset; returns a small status object for display. */
export function calibrate(serverOffset) {
  const srv = parseOffset(serverOffset);
  if (srv === null) return { usingFixed: false };
  const dev = deviceOffsetMin(new Date());
  fixedOffsetMin = dev === srv ? null : srv;
  return { usingFixed: fixedOffsetMin !== null, device: dev, server: srv };
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** {y, mo, d, h, mi, dow} in Vancouver time. */
export function parts(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (fixedOffsetMin !== null) {
    const s = new Date(d.getTime() + fixedOffsetMin * 60000);
    return { y: s.getUTCFullYear(), mo: s.getUTCMonth() + 1, d: s.getUTCDate(), h: s.getUTCHours(), mi: s.getUTCMinutes(), dow: s.getUTCDay() };
  }
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short'
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, dow: DOW.indexOf(p.weekday) };
}

export const ymd = (dateLike) => { const p = parts(dateLike); return `${p.y}-${pad(p.mo)}-${pad(p.d)}`; };
export const todayYmd = () => ymd(new Date());

/** "7 am", "3:15 pm" */
export function timeLabel(dateLike) {
  const p = parts(dateLike);
  const h12 = p.h % 12 || 12;
  return `${h12}${p.mi ? ':' + pad(p.mi) : ''} ${p.h < 12 ? 'am' : 'pm'}`;
}

/** "7:42" for clocks */
export function clockLabel(dateLike) {
  const p = parts(dateLike);
  return `${p.h % 12 || 12}:${pad(p.mi)}`;
}

/** 'yyyy-mm-dd' -> "Wed Nov 18" (pure calendar math; no time zone involved). */
export function dayLabel(ymdStr) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DOW[dt.getUTCDay()]} ${MON[m - 1]} ${d}`;
}

export function addDays(ymdStr, n) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
