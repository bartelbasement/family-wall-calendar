# Family Wall Calendar

A Skylight-style family calendar for a wall-mounted iPad, with a phone version too.

- `web/`: static front-end (GitHub Pages). Plain ES modules, no build step.
- `api/src/`: Google Apps Script JSON API (deployed with clasp). It reads Trello and Google Calendar, merges and dedupes them, and handles writes.
- No names, calendar IDs, locations or keys are stored in this repo. Secrets live in Apps Script **Script Properties**, and the page loads people and settings from the API.

## One-time setup

1. Sign in to Google as the account that owns the script, then turn on the Apps Script API at https://script.google.com/home/usersettings.
2. `npx clasp login` (opens a browser; sign in as that same account).
3. `npx clasp create --type standalone --title "Family Wall Calendar API" --rootDir api/src`
   This writes `.clasp.json`, which is git-ignored. If it replaced `api/src/appsscript.json`, restore it with `git checkout api/src/appsscript.json`.
4. `npm run push`
5. In the Apps Script editor, run `setupWallKey` and copy the key from the log.
6. **Deploy → New deployment → Web app.** Execute as: *Me*. Who has access: *Anyone*. Copy the `/exec` URL into `web/js/config.js`.
7. Open the page with `?key=<WALL_KEY>` once on each device. The key is then remembered.

## Deploying changes

```
npm run push
npx clasp deployments                 # find the web app deployment ID
npx clasp redeploy <deploymentId> -d "what changed"
```
Always `redeploy` the **existing** deployment so the `/exec` URL never changes. Never create a new one.

## Local preview

`npm run serve`, then open http://localhost:8080/?key=...

## Tests

`npm test` (Node's built-in test runner; merge logic only).
