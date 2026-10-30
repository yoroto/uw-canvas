# Schedule data

`schedule.json` holds the class schedule used by the Daily view. The shape is defined in `src/shared/schedule/types.ts`, checked by `validateSchedule` (run `npm test`), and turned into "what is on date X" by `resolveDay` in `src/shared/schedule/schedule.ts`.

## Layout

```
schedule.json
  schemaVersion  1
  timezone       IANA zone the times are in ("America/Los_Angeles")
  terms[]        one entry per quarter (Fall, Winter, Spring ...)
    id, name     "2026-fall", "Fall 2026"
    startDate    first / last day of the term, "YYYY-MM-DD"; null = open-ended
    endDate
    source       the document the data came from
    courseNames  class title -> text in the Canvas course name, when it differs ("Precalc": "Precalculus")
    building     opening hours and notes
    weekly       monday ... friday (a missing weekday = no school), each a list of blocks
    overrides[]  exceptions for particular dates
```

A **block** is one slot: `start` and `end` as 24-hour `"HH:MM"`, a `title`, a `kind`
(`class`, `advisory`, `office-hours`, `study-session`, `lunch`, `ad-hoc`, `early-release`)
and an optional `detail` (for example the subject of a study session). Blocks are listed in
time order and must not overlap. `"inferred": true` marks a time the source document does
not print, so it can be confirmed and the flag removed (none are left in Fall 2026).

## Adding a term

Append another object to `terms` (copy the Fall one) with its own `id`, `name` and `weekly`
blocks, and set its `startDate`. Fall 2026 has no dates, so it counts as ongoing; once a
later term starts, that term takes over from its `startDate` on and Fall is used before it.
You only need to give Fall an `endDate` if you want a gap (for example a break with no
school before the next term). When two terms cover a date, the one that started last wins.
Two terms may not start on the same day, and a term with an explicit `endDate` may not overlap
the next one.

## Alternate days

Add an entry to the term's `overrides`. It applies to one `date`, or to every day from `from`
to `to`, and uses exactly one of:

```json
{ "date": "2026-10-14", "label": "Runs like Thursday", "use": "thursday" }
{ "date": "2026-10-27", "label": "Assembly day", "blocks": [ { "start": "09:00", "end": "10:00", "title": "Assembly", "kind": "ad-hoc" } ] }
{ "from": "2026-11-25", "to": "2026-11-27", "label": "Thanksgiving break", "closed": true }
```

- `use` reuses another weekday's blocks from the same term (the common "follow the Friday schedule" case)
- `blocks` is a complete custom day (it replaces the weekly blocks; it does not patch them)
- `closed` means no school

Overrides must fall inside the term's dates and must not overlap each other.

## Linking classes to Canvas courses

On the Daily view each `class` block is matched to a Canvas course by its title: the course whose name contains the title as whole words (an exact name wins over a longer one). When Canvas names the course differently, add the wording to the term's `courseNames`, for example `"Precalc": "Precalculus"`. The matched course supplies the clickable module items that are due on that day.
