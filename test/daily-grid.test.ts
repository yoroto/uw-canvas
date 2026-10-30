import { describe, expect, it } from 'vitest'
import { carriedListTop, DAY_MINUTES, HOUR_PX, hourLabel, initialScrollHour, linesThatFit, minutesIntoDay, planItemLines, pxForMinutes } from '../src/shared/daily/grid'

const start = new Date(2026, 9, 26)
const end = new Date(2026, 9, 27)

describe('minutesIntoDay', () => {
  it('measures the wall clock inside the day', () => {
    expect(minutesIntoDay(new Date(2026, 9, 26, 9, 30), start, end)).toBe(570)
    expect(minutesIntoDay(new Date(2026, 9, 26, 23, 59), start, end)).toBe(1439)
    expect(minutesIntoDay(start, start, end)).toBe(0)
  })

  it('clamps times outside the day', () => {
    expect(minutesIntoDay(new Date(2026, 9, 25, 22), start, end)).toBe(0)
    expect(minutesIntoDay(end, start, end)).toBe(DAY_MINUTES)
    expect(minutesIntoDay(new Date(2026, 9, 27, 3), start, end)).toBe(DAY_MINUTES)
  })

  it('stays on the wall clock across a daylight-saving change', () => {
    const dstStart = new Date(2026, 10, 1) // fall back in the US; harmless elsewhere
    const dstEnd = new Date(2026, 10, 2)
    expect(minutesIntoDay(new Date(2026, 10, 1, 12), dstStart, dstEnd)).toBe(720)
  })
})

describe('pxForMinutes', () => {
  it('scales by the hour height', () => {
    expect(pxForMinutes(60)).toBe(HOUR_PX)
    expect(pxForMinutes(90, 40)).toBe(60)
    expect(pxForMinutes(0)).toBe(0)
  })
})

describe('initialScrollHour', () => {
  const noon = new Date(2026, 9, 26, 12, 30)
  it('shows a bit before now on today', () => {
    expect(initialScrollHour({ isToday: true, now: noon, opensHour: 8, firstItemHour: 8.67 })).toBe(10.5)
    expect(initialScrollHour({ isToday: true, now: new Date(2026, 9, 26, 0, 30), opensHour: 8, firstItemHour: null })).toBe(0)
  })

  it('starts half an hour before the building opens or the first item, whichever is earlier', () => {
    expect(initialScrollHour({ isToday: false, now: noon, opensHour: 8, firstItemHour: 8.67 })).toBe(7.5)
    expect(initialScrollHour({ isToday: false, now: noon, opensHour: 8, firstItemHour: 6 })).toBe(5.5)
    expect(initialScrollHour({ isToday: false, now: noon, opensHour: null, firstItemHour: null })).toBe(7.5)
    expect(initialScrollHour({ isToday: false, now: noon, opensHour: null, firstItemHour: 0.25 })).toBe(0)
  })
})

describe('hourLabel', () => {
  it('formats hours for the axis', () => {
    expect(hourLabel(13, 'en-US')).toBe('1 PM')
    expect(hourLabel(0, 'en-US')).toBe('12 AM')
    expect(hourLabel(12, 'en-US')).toBe('12 PM')
  })
})

describe('carriedListTop', () => {
  const nine = pxForMinutes(21 * 60)

  it('starts at 9 PM when no deadline reaches the evening', () => {
    expect(carriedListTop([], nine)).toBe(nine)
    expect(carriedListTop([pxForMinutes(8 * 60), nine], nine)).toBe(nine) // a chip ending exactly at 9 PM is not in the way
  })

  it('moves below the lowest deadline chip after 9 PM', () => {
    const lowest = pxForMinutes(23 * 60 + 59)
    expect(carriedListTop([pxForMinutes(10 * 60), pxForMinutes(22 * 60), lowest], nine)).toBe(lowest + 8)
    expect(carriedListTop([pxForMinutes(21 * 60 + 30)], nine, 4)).toBe(pxForMinutes(21 * 60 + 30) + 4)
  })
})

describe('linesThatFit / planItemLines', () => {
  it('counts the lines left under the title and time', () => {
    expect(linesThatFit(18)).toBe(0)
    expect(linesThatFit(52)).toBe(1)
    expect(linesThatFit(112)).toBe(4)
    expect(linesThatFit(0)).toBe(0)
  })

  it('lists everything when it fits', () => {
    expect(planItemLines(3, 112)).toEqual({ visible: 3, more: 0 })
    expect(planItemLines(0, 18)).toEqual({ visible: 0, more: 0 })
  })

  it('turns the last line into "+N more" when not everything fits', () => {
    expect(planItemLines(6, 112)).toEqual({ visible: 3, more: 3 })
    expect(planItemLines(5, 84)).toEqual({ visible: 2, more: 3 }) // 3 lines: 2 items + the "more" line
  })

  it('shows only a toggle in a block too short for two lines', () => {
    expect(planItemLines(2, 52)).toEqual({ visible: 0, more: 2 })
    expect(planItemLines(2, 20)).toEqual({ visible: 0, more: 2 })
  })
})
