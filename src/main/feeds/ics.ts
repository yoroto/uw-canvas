import ICAL from 'ical.js'
import type { CalEvent } from '../../shared/daily/types'

/** Windows-style time zone names that some feeds (Outlook) use, mapped to IANA names. */
const WINDOWS_TZ: Record<string, string> = {
  'Pacific Standard Time': 'America/Los_Angeles',
  'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix',
  'Central Standard Time': 'America/Chicago',
  'Eastern Standard Time': 'America/New_York',
  'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'China Standard Time': 'Asia/Shanghai',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'India Standard Time': 'Asia/Kolkata',
  UTC: 'UTC'
}

const MAX_OCCURRENCES = 10_000

export function resolveIana(tzid: string | null | undefined): string | null {
  if (!tzid) return null
  const name = WINDOWS_TZ[tzid] ?? tzid
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name })
    return name
  } catch {
    return null
  }
}

function offsetMs(ts: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
  }).formatToParts(new Date(ts))
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(ts / 1000) * 1000
}

/** The instant at which the wall clock in `timeZone` shows these components. */
export function zonedToInstant(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  const first = guess - offsetMs(guess, timeZone)
  const second = guess - offsetMs(first, timeZone) // corrects across a DST change
  return new Date(second)
}

function tzidOf(component: ICAL.Component, prop: 'dtstart' | 'dtend'): string | null {
  const p = component.getFirstProperty(prop)
  const v = p?.getParameter('tzid')
  return typeof v === 'string' ? v : null
}

/** A time from the feed as a real instant. Times in a zone ical.js does not know are converted from their TZID. */
function toInstant(time: ICAL.Time, tzid: string | null): Date {
  if (time.isDate) return new Date(time.year, time.month - 1, time.day)
  const zone = time.zone?.tzid
  const known = zone && zone !== 'floating'
  if (known) return time.toJSDate()
  const iana = resolveIana(tzid)
  if (iana) return zonedToInstant(time.year, time.month, time.day, time.hour, time.minute, time.second, iana)
  return time.toJSDate() // floating: the viewer's local time
}

export interface ParsedFeed {
  /** X-WR-CALNAME, if the feed has one. */
  name: string | null
  events: CalEvent[]
}

/**
 * Reads an iCalendar feed and returns the events that overlap
 * [rangeStart, rangeEnd), with recurring events expanded, exceptions applied
 * and cancelled occurrences dropped.
 */
export function parseFeed(text: string, feedId: string, rangeStart: Date, rangeEnd: Date): ParsedFeed {
  let root: ICAL.Component
  try {
    root = new ICAL.Component(ICAL.parse(text))
  } catch {
    throw new Error('This does not look like an iCalendar (.ics) feed')
  }
  if (root.name !== 'vcalendar') throw new Error('This does not look like an iCalendar (.ics) feed')

  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(tz)
    } catch {
      // a broken VTIMEZONE only affects events that use it
    }
  }

  const rawName = root.getFirstPropertyValue('x-wr-calname')
  const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : null

  // Group masters and their per-occurrence exceptions by UID.
  const masters = new Map<string, ICAL.Component>()
  const exceptions = new Map<string, ICAL.Component[]>()
  const standalone: ICAL.Component[] = []
  for (const vevent of root.getAllSubcomponents('vevent')) {
    const uid = vevent.getFirstPropertyValue('uid')
    if (typeof uid !== 'string') {
      standalone.push(vevent)
    } else if (vevent.hasProperty('recurrence-id')) {
      exceptions.set(uid, [...(exceptions.get(uid) ?? []), vevent])
    } else {
      masters.set(uid, vevent)
    }
  }
  // An exception whose master is not in the feed is shown as an ordinary event.
  for (const [uid, list] of exceptions) if (!masters.has(uid)) standalone.push(...list)

  const events: CalEvent[] = []
  const from = rangeStart.getTime()
  const to = rangeEnd.getTime()

  const add = (component: ICAL.Component, start: ICAL.Time, end: ICAL.Time, uid: string): void => {
    if (component.getFirstPropertyValue('status') === 'CANCELLED') return
    const s = toInstant(start, tzidOf(component, 'dtstart'))
    let e = toInstant(end, tzidOf(component, 'dtend') ?? tzidOf(component, 'dtstart'))
    if (e.getTime() < s.getTime()) e = s
    const allDay = start.isDate
    // Zero-length timed events still need to be visible.
    const overlaps = e.getTime() > from && s.getTime() < to
    const instant = !allDay && s.getTime() === e.getTime() && s.getTime() >= from && s.getTime() < to
    if (!overlaps && !instant) return
    const summary = component.getFirstPropertyValue('summary')
    const location = component.getFirstPropertyValue('location')
    events.push({
      id: `${feedId}:${uid}:${s.toISOString()}`,
      source: 'feed',
      feedId,
      title: typeof summary === 'string' && summary.trim() ? summary.trim() : '(No title)',
      start: s.toISOString(),
      end: e.toISOString(),
      allDay,
      ...(typeof location === 'string' && location.trim() ? { location: location.trim() } : {})
    })
  }

  for (const component of standalone) {
    const ev = new ICAL.Event(component)
    add(component, ev.startDate, ev.endDate, ev.uid || `anon-${events.length}`)
  }

  for (const [uid, component] of masters) {
    const ev = new ICAL.Event(component)
    for (const ex of exceptions.get(uid) ?? []) ev.relateException(ex)

    if (!ev.isRecurring()) {
      add(component, ev.startDate, ev.endDate, uid)
      continue
    }

    const it = ev.iterator()
    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      const next = it.next()
      if (!next) break
      const details = ev.getOccurrenceDetails(next)
      const item = details.item as ICAL.Event
      // Stop once occurrences start after the range (they are produced in order).
      if (toInstant(details.startDate, tzidOf(item.component, 'dtstart') ?? tzidOf(component, 'dtstart')).getTime() >= to) break
      add(item.component, details.startDate, details.endDate, uid)
    }
  }

  events.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
  return { name, events }
}
