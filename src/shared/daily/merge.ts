import type { ResolvedDay } from '../schedule/types'
import { dayRange } from './assignments'
import type { CalEvent } from './types'

const at = (date: string, hhmm: string): Date => {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = hhmm.split(':').map(Number)
  return new Date(y, m - 1, d, h, min)
}

/** The weekly class blocks of a resolved day as calendar events (wall-clock times in the local zone). */
export function scheduleToEvents(day: ResolvedDay): CalEvent[] {
  return day.blocks.map((b) => ({
    id: `class:${day.date}:${b.start}:${b.title}`,
    source: 'class' as const,
    title: b.title,
    start: at(day.date, b.start).toISOString(),
    end: at(day.date, b.end).toISOString(),
    allDay: false,
    kind: b.kind,
    ...(b.detail ? { detail: b.detail } : {})
  }))
}

export interface DayCalendar {
  /** All-day feed events touching this day (shown in a strip). */
  allDay: CalEvent[]
  /** Class blocks and feed events with times, clipped to the day, sorted by start. */
  timed: CalEvent[]
  /** Building hours as instants, when the term defines them. */
  hours: { opens: Date; closes: Date } | null
  /** No school today (an override), with its label. */
  closed: boolean
  label?: string
}

/** Merges the class schedule with feed events for one day. Overlaps are kept: layout places them side by side. */
export function mergeDay(day: ResolvedDay, feedEvents: readonly CalEvent[]): DayCalendar {
  const { from, to } = dayRange(day.date)
  const f = from.getTime()
  const t = to.getTime()

  const allDay: CalEvent[] = []
  const timed: CalEvent[] = [...scheduleToEvents(day)]

  for (const e of feedEvents) {
    const s = new Date(e.start).getTime()
    const en = new Date(e.end).getTime()
    const touches = en > f && s < t
    const instant = s === en && s >= f && s < t
    if (!touches && !instant) continue
    if (e.allDay) allDay.push(e)
    else timed.push({ ...e, start: new Date(Math.max(s, f)).toISOString(), end: new Date(Math.min(en, t)).toISOString() })
  }

  timed.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.title.localeCompare(b.title))
  const b = day.term?.building
  return {
    allDay,
    timed,
    hours: b ? { opens: at(day.date, b.opens), closes: at(day.date, b.closes) } : null,
    closed: day.closed,
    ...(day.label ? { label: day.label } : {})
  }
}
