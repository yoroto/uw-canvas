import { describe, expect, it } from 'vitest'
import { dayOptions, shiftDay } from '../src/shared/daily/days'

describe('shiftDay', () => {
  it('moves across month, year and leap-day boundaries', () => {
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDay('2028-03-01', -1)).toBe('2028-02-29')
    expect(shiftDay('2026-10-26', 0)).toBe('2026-10-26')
  })

  it('is not thrown off by daylight-saving changes', () => {
    expect(shiftDay('2026-11-01', 1)).toBe('2026-11-02')
    expect(shiftDay('2026-03-08', 1)).toBe('2026-03-09')
    expect(shiftDay('2026-11-02', -1)).toBe('2026-11-01')
  })
})

describe('dayOptions', () => {
  const today = new Date(2026, 9, 29, 15, 30)
  const options = dayOptions(today)

  it('spans 14 days back to 60 days ahead, one per day, in order', () => {
    expect(options).toHaveLength(75)
    expect(options[0].value).toBe('2026-10-15')
    expect(options[options.length - 1].value).toBe('2026-12-28')
    for (let i = 1; i < options.length; i++) expect(options[i].value).toBe(shiftDay(options[i - 1].value, 1))
  })

  it('marks only today', () => {
    expect(options.filter((o) => o.label.includes('Today')).map((o) => o.value)).toEqual(['2026-10-29'])
  })

  it('supports a custom range', () => {
    expect(dayOptions(today, 1, 1).map((o) => o.value)).toEqual(['2026-10-28', '2026-10-29', '2026-10-30'])
  })
})
