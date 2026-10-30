import { describe, expect, it } from 'vitest'
import { parseFeed, resolveIana, zonedToInstant } from '../src/main/feeds/ics'

const ics = (...lines: string[]): string => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...lines, 'END:VCALENDAR'].join('\r\n')
const vevent = (...lines: string[]): string => ['BEGIN:VEVENT', 'UID:' + (lines.find((l) => l.startsWith('UID:'))?.slice(4) ?? 'u1'), 'DTSTAMP:20260101T000000Z', ...lines.filter((l) => !l.startsWith('UID:')), 'END:VEVENT'].join('\r\n')

// A Los Angeles day: 2026-10-26 00:00 PDT to 2026-10-27 00:00 PDT
const dayStart = new Date('2026-10-26T07:00:00Z')
const dayEnd = new Date('2026-10-27T07:00:00Z')
const parse = (text: string, from = dayStart, to = dayEnd) => parseFeed(text, 'f1', from, to)

const LA_TIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:America/Los_Angeles',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0800',
  'TZOFFSETTO:-0700',
  'TZNAME:PDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0700',
  'TZOFFSETTO:-0800',
  'TZNAME:PST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE'
].join('\r\n')

describe('parseFeed: single events', () => {
  it('reads UTC times', () => {
    const { events } = parse(ics(vevent('UID:a', 'SUMMARY:Standup', 'DTSTART:20261026T170000Z', 'DTEND:20261026T173000Z', 'LOCATION:Room 4')))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      source: 'feed',
      feedId: 'f1',
      title: 'Standup',
      start: '2026-10-26T17:00:00.000Z',
      end: '2026-10-26T17:30:00.000Z',
      allDay: false,
      location: 'Room 4'
    })
  })

  it('applies a TZID defined by a VTIMEZONE', () => {
    const { events } = parse(
      ics(LA_TIMEZONE, vevent('UID:a', 'SUMMARY:Class', 'DTSTART;TZID=America/Los_Angeles:20261026T090000', 'DTEND;TZID=America/Los_Angeles:20261026T100000'))
    )
    expect(events.map((e) => [e.start, e.end])).toEqual([['2026-10-26T16:00:00.000Z', '2026-10-26T17:00:00.000Z']])
  })

  it('handles a TZID with no VTIMEZONE: IANA names and Windows names', () => {
    const iana = parse(ics(vevent('UID:a', 'SUMMARY:NY', 'DTSTART;TZID=America/New_York:20261026T090000', 'DTEND;TZID=America/New_York:20261026T100000')), new Date('2026-10-26T00:00:00Z'), new Date('2026-10-27T00:00:00Z'))
    expect(iana.events[0].start).toBe('2026-10-26T13:00:00.000Z')
    const win = parse(ics(vevent('UID:b', 'SUMMARY:Outlook', 'DTSTART;TZID=Pacific Standard Time:20261026T090000', 'DTEND;TZID=Pacific Standard Time:20261026T100000')))
    expect(win.events[0].start).toBe('2026-10-26T16:00:00.000Z')
  })

  it('reads all-day events as local midnight to midnight, including multi-day ones', () => {
    const one = parse(ics(vevent('UID:a', 'SUMMARY:Holiday', 'DTSTART;VALUE=DATE:20261026', 'DTEND;VALUE=DATE:20261027')), new Date(2026, 9, 26), new Date(2026, 9, 27))
    expect(one.events[0]).toMatchObject({ allDay: true, start: new Date(2026, 9, 26).toISOString(), end: new Date(2026, 9, 27).toISOString() })
    const multi = parse(ics(vevent('UID:b', 'SUMMARY:Trip', 'DTSTART;VALUE=DATE:20261024', 'DTEND;VALUE=DATE:20261028')), new Date(2026, 9, 26), new Date(2026, 9, 27))
    expect(multi.events).toHaveLength(1)
    const noEnd = parse(ics(vevent('UID:c', 'SUMMARY:No end', 'DTSTART;VALUE=DATE:20261026')), new Date(2026, 9, 26), new Date(2026, 9, 27))
    expect(noEnd.events[0].end).toBe(new Date(2026, 9, 27).toISOString())
  })

  it('keeps only events overlapping the range', () => {
    const feed = ics(
      vevent('UID:before', 'SUMMARY:Before', 'DTSTART:20261025T100000Z', 'DTEND:20261025T110000Z'),
      vevent('UID:overlap', 'SUMMARY:Overnight', 'DTSTART:20261026T060000Z', 'DTEND:20261026T080000Z'),
      vevent('UID:inside', 'SUMMARY:Inside', 'DTSTART:20261026T200000Z', 'DTEND:20261026T210000Z'),
      vevent('UID:edge', 'SUMMARY:Edge', 'DTSTART:20261027T070000Z', 'DTEND:20261027T080000Z'),
      vevent('UID:after', 'SUMMARY:After', 'DTSTART:20261028T100000Z', 'DTEND:20261028T110000Z')
    )
    expect(parse(feed).events.map((e) => e.title)).toEqual(['Overnight', 'Inside'])
  })

  it('keeps zero-length events that fall inside the range', () => {
    const { events } = parse(ics(vevent('UID:a', 'SUMMARY:Reminder', 'DTSTART:20261026T180000Z')))
    expect(events.map((e) => e.title)).toEqual(['Reminder'])
  })

  it('skips cancelled events and gives untitled ones a name', () => {
    const feed = ics(
      vevent('UID:a', 'SUMMARY:Gone', 'STATUS:CANCELLED', 'DTSTART:20261026T170000Z', 'DTEND:20261026T180000Z'),
      vevent('UID:b', 'DTSTART:20261026T190000Z', 'DTEND:20261026T200000Z')
    )
    expect(parse(feed).events.map((e) => e.title)).toEqual(['(No title)'])
  })

  it('returns the calendar name and sorts by start', () => {
    const feed = ics(
      'X-WR-CALNAME:Soccer',
      vevent('UID:b', 'SUMMARY:Later', 'DTSTART:20261026T200000Z', 'DTEND:20261026T210000Z'),
      vevent('UID:a', 'SUMMARY:Earlier', 'DTSTART:20261026T150000Z', 'DTEND:20261026T160000Z')
    )
    const res = parse(feed)
    expect(res.name).toBe('Soccer')
    expect(res.events.map((e) => e.title)).toEqual(['Earlier', 'Later'])
  })

  it('rejects text that is not a calendar', () => {
    expect(() => parse('<html>Not found</html>')).toThrow(/iCalendar/)
    expect(() => parse('')).toThrow(/iCalendar/)
  })
})

describe('parseFeed: recurring events', () => {
  const weekly = ['UID:r', 'SUMMARY:Practice', 'DTSTART:20261012T170000Z', 'DTEND:20261012T180000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=6']

  it('expands occurrences into the requested day', () => {
    expect(parse(ics(vevent(...weekly))).events.map((e) => e.start)).toEqual(['2026-10-26T17:00:00.000Z'])
    expect(parse(ics(vevent(...weekly)), new Date('2026-10-27T07:00:00Z'), new Date('2026-10-28T07:00:00Z')).events).toEqual([])
  })

  it('stops at COUNT and honours EXDATE', () => {
    const feed = ics(vevent(...weekly, 'EXDATE:20261026T170000Z'))
    expect(parse(feed).events).toEqual([])
    expect(parse(feed, new Date('2026-11-02T07:00:00Z'), new Date('2026-11-03T07:00:00Z')).events).toHaveLength(1)
    expect(parse(ics(vevent(...weekly)), new Date('2026-12-07T07:00:00Z'), new Date('2026-12-08T07:00:00Z')).events).toEqual([])
  })

  it('applies a moved occurrence (RECURRENCE-ID) and drops the original', () => {
    const feed = ics(
      vevent(...weekly),
      vevent('UID:r', 'RECURRENCE-ID:20261026T170000Z', 'SUMMARY:Practice (moved)', 'DTSTART:20261026T190000Z', 'DTEND:20261026T200000Z')
    )
    expect(parse(feed).events.map((e) => [e.title, e.start])).toEqual([['Practice (moved)', '2026-10-26T19:00:00.000Z']])
  })

  it('drops a cancelled single occurrence', () => {
    const feed = ics(
      vevent(...weekly),
      vevent('UID:r', 'RECURRENCE-ID:20261026T170000Z', 'STATUS:CANCELLED', 'SUMMARY:Practice', 'DTSTART:20261026T170000Z', 'DTEND:20261026T180000Z')
    )
    expect(parse(feed).events).toEqual([])
  })

  it('keeps wall-clock time across a daylight-saving change', () => {
    const feed = ics(
      LA_TIMEZONE,
      vevent('UID:d', 'SUMMARY:Class', 'DTSTART;TZID=America/Los_Angeles:20261026T090000', 'DTEND;TZID=America/Los_Angeles:20261026T100000', 'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4')
    )
    const before = parse(feed)
    const after = parse(feed, new Date('2026-11-02T08:00:00Z'), new Date('2026-11-03T08:00:00Z'))
    expect(before.events[0].start).toBe('2026-10-26T16:00:00.000Z') // PDT
    expect(after.events[0].start).toBe('2026-11-02T17:00:00.000Z') // PST
  })

  it('treats an exception without its master as a normal event', () => {
    const feed = ics(vevent('UID:x', 'RECURRENCE-ID:20261026T170000Z', 'SUMMARY:Orphan', 'DTSTART:20261026T170000Z', 'DTEND:20261026T180000Z'))
    expect(parse(feed).events.map((e) => e.title)).toEqual(['Orphan'])
  })
})

describe('time zone helpers', () => {
  it('converts wall-clock time in a zone to an instant, across DST', () => {
    expect(zonedToInstant(2026, 10, 26, 9, 0, 0, 'America/Los_Angeles').toISOString()).toBe('2026-10-26T16:00:00.000Z')
    expect(zonedToInstant(2026, 11, 2, 9, 0, 0, 'America/Los_Angeles').toISOString()).toBe('2026-11-02T17:00:00.000Z')
    expect(zonedToInstant(2026, 3, 9, 9, 0, 0, 'America/Los_Angeles').toISOString()).toBe('2026-03-09T16:00:00.000Z')
    expect(zonedToInstant(2026, 10, 26, 9, 0, 0, 'UTC').toISOString()).toBe('2026-10-26T09:00:00.000Z')
  })

  it('maps Windows names and rejects unknown ones', () => {
    expect(resolveIana('Pacific Standard Time')).toBe('America/Los_Angeles')
    expect(resolveIana('America/Chicago')).toBe('America/Chicago')
    expect(resolveIana('Mars/Olympus')).toBeNull()
    expect(resolveIana(null)).toBeNull()
  })
})
