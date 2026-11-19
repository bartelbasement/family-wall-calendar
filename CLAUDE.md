# Family wall calendar: working notes

The repo is public. Never commit names, calendar IDs, keys, `api/src/Private.js`,
the handoff file, or anything under `web/demo/`. Deploy steps are in README.md.

## UI decisions (keep these unless the owner says otherwise)

- The wall's bottom bar (to-do strip, people chips, ＋ Add) looks identical in
  every view. Don't move controls in or out of it per view. One exception: the
  To-dos view hides the to-do strip, since the page is already the to-do list;
  the chips and ＋ Add stay where they are.
- Views and secondary features (Calendar, People, To-dos, Routines, Grocery,
  plus Refresh and Settings) go in the side panel (`#rail`) on the
  right edge, not as new bottom-bar buttons. The right side keeps a clean left
  edge for the clock. It's a narrow icon strip; tapping the app icon expands
  it leftward over the page. Labels are right-aligned, next to their icons.
  `?rail=left` shows it on the left for comparison.
- The Schedule (timeline) view is in the side panel as "Timeline", after People.
- Today's weather has its own line under the date. It moves beside the clock
  only when Today's events need the room (`fitNow()` in `web/js/app.js`).
- Where a browser's own pop-up looks out of place, use in-app controls (as with
  the Add sheet's time chooser).
- Before changing layout, offer options with pros and cons, and plan before
  building.

## Testing layout changes

- Local server: `npx http-server web -p 8080 -c-1 -s`.
- Exact device frame: `localhost:8080/demo/frame.html?w=1366&h=1024&src=..%2F%3Fdemo%3D1%26mode%3Dauto`
  (the wall is a 12.9" iPad Pro, 1366×1024 in landscape). Use `w=390&h=844`
  for a phone. Measure overflow in the frame, not just by eye.
- The owner checks layouts in Chrome DevTools device mode, which emulates touch
  (`pointer: coarse`). Don't make fixes depend on detecting a mouse.
- Live check: add `?nc=<short sha>` to get past the 10-minute page cache.
- Windows fonts differ from the iPad's (iPadOS 16.7, Safari). Tight layouts
  need a look on the real iPad after a push.
- `npm test` runs the merge, parse and weather tests.
