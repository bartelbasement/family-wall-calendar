/**
 * Copy to Private.js (git-ignored) and fill in real values. clasp pushes
 * Private.js to Apps Script; it never goes to GitHub.
 *
 * This example file is NOT pushed (see .claspignore).
 */
var PRIVATE_CONFIG = {
  trello: {
    boardId: 'abc123XY' // short link from the board URL: trello.com/b/<boardId>/...
  },
  // Run listCalendars() in the editor to find IDs. defaultPerson is optional.
  calendars: [
    { id: 'family123@group.calendar.google.com' },
    { id: 'someone@gmail.com', defaultPerson: 'D' }
  ],
  // Optional: Open-Meteo weather for a town-level point. Leave out for no weather.
  weather: { lat: 49.28, lon: -123.12, name: 'Your town' },
  people: [
    { code: 'S', name: 'Kid One',   badge: 'S', trelloLabels: ['Kid One'],   keywords: ['kid one'] },
    { code: 'R', name: 'Kid Two',   badge: 'R', trelloLabels: ['Kid Two'],   keywords: ['kid two'] },
    { code: 'C', name: 'Kid Three', badge: 'C', trelloLabels: ['Kid Three'], keywords: ['kid three'] },
    { code: 'M', name: 'Mom',       badge: 'M', trelloLabels: [],            keywords: ['mom'] },
    { code: 'D', name: 'Dad',       badge: 'D', trelloLabels: [],            keywords: ['dad'] },
    { code: 'P', name: 'Parent',    badge: 'P', trelloLabels: ['Parent'],    keywords: [] },
    { code: 'F', name: 'Family',    badge: 'F', trelloLabels: [],            keywords: [] }
  ]
};
