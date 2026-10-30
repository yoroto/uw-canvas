# UW Canvas Dashboard

A personal macOS desktop app (Electron + React + TypeScript) that shows your assignments from [canvas.uw.edu](https://canvas.uw.edu) in a more organized way than Canvas itself. It is read-only: it never changes anything in Canvas.

## Views

- **Daily**: one chosen day as two calendar columns on a shared hour axis, like the macOS Calendar day view. The left column merges the weekly class schedule (`data/schedule.json`) with your calendar feeds; overlapping events sit side by side. The right column shows that day's assignments at their deadline time, with a green check for submitted work and an orange (red when past due) "!" for outstanding work. Assignments due soon after the day are also listed in a dashed "Also due soon" lane from 9 PM down: weekdays carry tomorrow's deadlines until noon, and Saturday and Sunday carry everything until Monday noon. A third column, **Updates**, is a plain stream (newest first) of what happened on that day: assignments graded or their grades posted, new teacher comments, assignments becoming available or being edited, and, from your courses, announcements, discussion topics and replies, messages other people sent you in the Canvas inbox, and files and pages that were added or changed. A drop-down at the top picks the day; the **Calendars** button adds or removes `webcal://` / `https://` feeds.
- **Timeline**: every assignment in due-date order, with a "Now" line in the middle (past above, upcoming below, no-due-date at the bottom). Each row shows due date, submitted time, status (Missing, Late, Submitted, Graded, ...) and a color-coded grade. A **Courses** filter picks which courses to show.
- **Problems**: only what needs attention, in this order: **Missing** (past due, not turned in), **Incomplete** (pass/fail marked ✗), **Late**, **Red scores** (under 50%).
- **Grades**: graded assignments only, with three dates (Posted, Graded, Last comment), status and grade. A **Sort** button picks which date orders the list (most recent first; default Posted).

Course names are colored per course. Grades are green (90%+), yellow (70-90%), orange (50-70%) or red (under 50%); ✓ is green and ✗ is red.

## How it signs in

UW does not allow personal access tokens, so the app opens a normal Canvas/UW login window (NetID + Duo). The session cookies are used only by the app's main process to call `https://canvas.uw.edu/api/v1/...` with `GET` requests. The interface never sees them.

**Staying signed in:** Canvas's login cookies are session cookies, which a browser engine forgets when the app quits. So the app saves them itself, encrypted with a key from the macOS Keychain (Electron `safeStorage`), in `session-cookies.bin` in the app's user-data folder, and puts them back on the next start. They are re-saved shortly after they change, because Canvas renews its session cookie as you use it. A saved login older than 14 days is ignored. If the Keychain cannot encrypt, nothing is saved and you sign in each time. Whether the restored session still works is up to Canvas and UW (they expire sessions on their side); when it does not, the app shows the sign-in screen. **Sign out** clears the session and deletes the saved file.

Requests are throttled (about 150 ms apart) and made only on launch and when you press **Refresh**.

## Updates column

Assignment events come from the assignments already loaded (`graded_at`, `posted_at`, teacher comments, `unlock_at`, `updated_at`). Announcements, discussions, files and pages come from separate Canvas requests per course, and inbox messages from the Conversations API (each conversation with a new message is opened to list its messages individually, always with `auto_mark_as_read=false`, so reading never marks anything as read in Canvas; archived conversations and your own messages are left out). All cover the last 30 days, loaded when the Daily tab opens and cached for 10 minutes (the header **Refresh** reloads them). The column header shows when they were last loaded. They stay on screen while a new load runs and when you switch tabs, and a source that fails (an error, a Canvas rate limit) keeps showing its earlier results with a note instead of disappearing. A course that does not offer files or pages to students is skipped quietly. Canvas keeps no history of changes, so the app lists only what Canvas timestamps: only the latest reply of a discussion is known, and moved due dates or changed scores are not tracked.

## Calendar feeds

In the Daily tab, **Calendars** lets you paste a `webcal://` or `https://` link (for example from Google Calendar, iCloud or a team calendar). The app downloads the feed in its main process, expands repeating events, and shows the events for the day you pick. Only https is accepted (a `webcal://` link is fetched over https), downloads are limited to 15 seconds and 5 MB, and feeds are cached for 15 minutes (the header **Refresh** button on the Daily tab, or **Refresh feeds** in the Calendars list, forces a new download). While the Daily tab is open, the app also does a full refresh by itself every 15 minutes: assignments, feeds and course updates.

Feed links often contain a private token, so they are saved only in `config/calendar-feeds.json`, which is listed in `.gitignore`, readable only by you, never logged, and never sent to the page (the interface sees just the name and host).

## Requirements

- macOS
- Node.js 20 or newer (developed with Node 24) and npm
- A UW NetID with Canvas access
- Network access to `github.com` during `npm install`, which downloads the Electron binary

## Build and run

```sh
npm install        # also downloads the Electron binary
npm run dev        # start the app with hot reload
```

Other commands:

```sh
npm run build      # bundle main, preload and renderer into out/
npm start          # run the bundled app from out/
npm test           # unit tests (Vitest)
npm run typecheck  # TypeScript check
```

If the app fails to start with "Electron uninstall", the Electron download did not finish. Re-run `node node_modules/electron/install.js`.

There is no packaged `.app` yet; the app runs through `npm run dev` or `npm start`.

## Where data is stored

In the app's user-data folder (typically `~/Library/Application Support/uw-canvas-dashboard/`): the encrypted Canvas login (`session-cookies.bin`), and `seen.json`, which remembers what you have already seen of each submission. Calendar feeds are in `config/calendar-feeds.json` inside the project folder (git-ignored). The Courses selection, Grades sort and selected day reset when you restart the app.

The weekly class schedule is `data/schedule.json`; see `data/README.md` for its format, how to add a term, and how to describe alternate days.

## Project layout

```
src/
  main/        Electron main process: login window, Canvas API client, IPC, seen store
    auth/        AuthProvider interface + cookie-session implementation
    canvas/      CanvasClient (GET only, pagination, throttling) and endpoint modules, incl. per-course updates
    feeds/       calendar feeds: URL checks, download, .ics parsing (ical.js), local config file
    store/       seen.json persistence
  preload/     the small, typed bridge exposed to the UI as window.canvas
  renderer/    React UI (App, Timeline, Daily, Problems, Grades, filters, shared row components)
  shared/      pure, framework-free logic used by both sides and by the tests
    assignments/ status rules, timeline building, formatting, course colors
    daily/       day layout (overlaps), merging schedule + feeds, deadline carry rules, grid geometry
    schedule/    schedule file types, validation and resolveDay(date)
    updates/     update events (graded, comments, announcements, ...) and picking a day's stream
    problems/    Problems categories (PROBLEMS list)
    grades/      Grades filtering and sort options
    importance/  earlier ranked-view logic (rules, ranking, change detection); not currently shown in the UI
data/          schedule.json (weekly class schedule) and its README
config/        local, git-ignored settings (calendar feeds)
test/          Vitest tests and Canvas JSON fixtures
```

To add a Canvas feature: write a module in `src/main/canvas/`, add a channel and bridge entry in `src/shared/types.ts`, and register it in `src/main/ipc.ts` and `src/preload/index.ts`.

## Tweaking the rules

The rules live in small pure modules, so they are easy to change and to test:

- Problem categories and their order: `PROBLEMS` in `src/shared/problems/problems.ts`
- Grade color thresholds: `GRADE_BANDS` in `src/shared/assignments/format.ts`
- Status rules (Missing, Due soon, ...): `src/shared/assignments/status.ts`
- Grades sort options: `GRADE_SORTS` in `src/shared/grades/grades.ts`
- "Also due soon" windows for the Daily view: `carryWindow` in `src/shared/daily/assignments.ts`; the 9 PM lane start is `LANE_START_HOUR` in `src/renderer/src/Daily.tsx`

## Notes and limitations

- Only courses in the `available` state are loaded.
- Late status relies on Canvas's own `late` flag.
- Class schedule times are read as local wall-clock times, so the Mac is assumed to be in the schedule's time zone (Pacific). Feed events are converted to local time; feeds with a time zone the app does not know are read as local time.
- Teacher comments need an extra request per course; if that fails, the app shows a banner and the Last comment column is empty for that course.
- Canvas can change its API or UW can change its login; if sign-in stops working, the login detection in `src/main/auth/CookieSessionAuth.ts` is the place to look.
