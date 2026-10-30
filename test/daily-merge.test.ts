import { describe, expect, it } from 'vitest'
import schedule from '../data/schedule.json'
import { mergeDay, scheduleToEvents } from '../src/shared/daily/merge'
import type { CalEvent } from '../src/shared/daily/types'
import { resolveDay } from '../src/shared/schedule/schedule'
import type { ScheduleFile } from '../src/shared/schedule/types'
import { at } from './helpers'

const file = schedule as unknown as ScheduleFile
const feed = (id: string, startIso: string, endIso: string, over: Partial<CalEvent> = {}): CalEvent => ({
  id,
  source: 'feed',
  feedId: 'f1',
  title: id,
  start: startIso,
  end: endIso,
  allDay: false,
  ...over
})

describe('scheduleToEvents', () => {
  it("turns Monday's blocks into local-time events", () => {
    const events = scheduleToEvents(resolveDay(file, '2026-10-26'))
    expect(events).toHaveLength(8)
    expect(events[1]).toMatchObject({ source: 'class', title: 'History', kind: 'class', start: at(2026, 10, 26, 8, 40), end: at(2026, 10, 26, 10, 40) })
    expect(events.find((e) => e.title === 'Study Session')).toMatchObject({ detail: 'History', kind: 'study-session' })
  })

  it('is empty on a weekend', () => {
    expect(scheduleToEvents(resolveDay(file, '2026-10-31'))).toEqual([])
  })
})

describe('mergeDay', () => {
  const monday = resolveDay(file, '2026-10-26')

  it('merges feed events with the class schedule and keeps overlaps', () => {
    const club = feed('club', at(2026, 10, 26, 9, 0), at(2026, 10, 26, 10, 0))
    const res = mergeDay(monday, [club])
    expect(res.timed).toHaveLength(9)
    expect(res.timed.map((e) => e.title).slice(0, 3)).toEqual(['Office Hours by Appt. Only', 'History', 'club'])
  })

  it('puts all-day events in their own list', () => {
    const holiday = feed('holiday', at(2026, 10, 26), at(2026, 10, 27), { allDay: true })
    const res = mergeDay(monday, [holiday])
    expect(res.allDay.map((e) => e.title)).toEqual(['holiday'])
    expect(res.timed.some((e) => e.title === 'holiday')).toBe(false)
  })

  it('drops feed events from other days and clips events that cross midnight', () => {
    const other = feed('other', at(2026, 10, 27, 9), at(2026, 10, 27, 10))
    const overnight = feed('overnight', at(2026, 10, 25, 22), at(2026, 10, 26, 2))
    const res = mergeDay(monday, [other, overnight])
    expect(res.timed.find((e) => e.title === 'other')).toBeUndefined()
    expect(res.timed.find((e) => e.title === 'overnight')).toMatchObject({ start: at(2026, 10, 26, 0), end: at(2026, 10, 26, 2) })
  })

  it('keeps zero-length events inside the day and ignores ones on the boundary after it', () => {
    const inside = feed('ping', at(2026, 10, 26, 12), at(2026, 10, 26, 12))
    const nextDay = feed('next', at(2026, 10, 27, 0), at(2026, 10, 27, 0))
    const res = mergeDay(monday, [inside, nextDay])
    expect(res.timed.some((e) => e.title === 'ping')).toBe(true)
    expect(res.timed.some((e) => e.title === 'next')).toBe(false)
  })

  it('reports building hours', () => {
    expect(mergeDay(monday, []).hours).toEqual({ opens: new Date(2026, 9, 26, 8), closes: new Date(2026, 9, 26, 16) })
  })

  it('shows only feed events on a weekend', () => {
    const sat = resolveDay(file, '2026-10-31')
    const game = feed('game', at(2026, 10, 31, 10), at(2026, 10, 31, 12))
    expect(mergeDay(sat, [game]).timed.map((e) => e.title)).toEqual(['game'])
  })

  it('reports a closed day with its label', () => {
    const closed: ScheduleFile = {
      ...file,
      terms: [{ ...file.terms[0], overrides: [{ date: '2026-10-26', label: 'Teacher workday', closed: true }] }]
    }
    const res = mergeDay(resolveDay(closed, '2026-10-26'), [])
    expect(res).toMatchObject({ closed: true, label: 'Teacher workday', timed: [] })
  })
})
