import { describe, expect, it } from 'vitest'
import schedule from '../data/schedule.json'
import { resolveDay, validateSchedule, weekdayOf } from '../src/shared/schedule/schedule'
import type { ScheduleFile, Term } from '../src/shared/schedule/types'

const file = schedule as unknown as ScheduleFile

// A copy of the real Fall term with dates filled in, since the file has none yet.
const fall: Term = { ...file.terms[0], startDate: '2026-09-30', endDate: '2026-12-11' }
const withFall = (overrides: Term['overrides'] = []): ScheduleFile => ({ ...file, terms: [{ ...fall, overrides }] })

const titles = (day: { blocks: { title: string }[] }): string[] => day.blocks.map((b) => b.title)

describe('data/schedule.json', () => {
  it('is valid', () => {
    expect(validateSchedule(file)).toEqual([])
  })

  it('has the Fall 2026 term with Monday to Friday and no weekend', () => {
    expect(file.terms.map((t) => t.id)).toEqual(['2026-fall'])
    expect(Object.keys(file.terms[0].weekly)).toEqual(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])
  })

  it('matches the printed schedule for each day', () => {
    const w = file.terms[0].weekly
    const line = (day: keyof typeof w): string[] => w[day]!.map((b) => `${b.start}-${b.end} ${b.title}${b.detail ? ` (${b.detail})` : ''}`)
    expect(line('monday')).toEqual([
      '08:30-08:40 Office Hours by Appt. Only',
      '08:40-10:40 History',
      '10:50-11:50 Precalc',
      '11:50-12:30 Lunch',
      '12:30-13:00 Advisory',
      '13:00-13:30 Study Session (History)',
      '13:35-14:35 English',
      '14:40-15:30 Office Hours'
    ])
    expect(line('thursday')).toEqual([
      '08:30-08:40 Office Hours by Appt. Only',
      '08:40-10:40 English',
      '10:50-11:50 Precalc',
      '11:50-12:30 Lunch',
      '12:30-14:30 Biology',
      '14:40-16:00 Early Release (TS Staff Meeting)'
    ])
    expect(w.tuesday!.find((b) => b.title === 'Biology')).toMatchObject({ start: '13:35', end: '15:35' })
    expect(w.wednesday!.find((b) => b.title === 'Health & Wellness')).toMatchObject({ start: '13:35', end: '15:00' })
    expect(w.friday!.find((b) => b.title === 'Study Session')).toMatchObject({ detail: 'Biology' })
  })

  it('has no unconfirmed times left, and Tuesday/Wednesday match the confirmed guesses', () => {
    const inferred = Object.values(file.terms[0].weekly).flatMap((blocks) => blocks!.filter((b) => b.inferred))
    expect(inferred).toEqual([])
    const w = file.terms[0].weekly
    expect(w.tuesday!.find((b) => b.title === 'Precalc')).toMatchObject({ start: '08:40', end: '09:40' })
    expect(w.tuesday!.find((b) => b.title === 'Office Hours')).toMatchObject({ start: '12:30', end: '13:30' })
    expect(w.wednesday!.find((b) => b.title === 'Ad Hoc')).toMatchObject({ start: '12:30', end: '13:00' })
    expect(w.wednesday!.filter((b) => b.title === 'Office Hours').pop()).toMatchObject({ start: '15:00', end: '15:30' })
  })

  it('is open-ended: Fall applies to any date until another term starts', () => {
    expect(file.terms[0]).toMatchObject({ startDate: null, endDate: null })
    expect(resolveDay(file, '2026-10-26')).toMatchObject({ source: 'weekly' })
    expect(resolveDay(file, '2027-02-01')).toMatchObject({ source: 'weekly' })
  })
})

describe('resolveDay', () => {
  it('uses the weekly pattern for the weekday', () => {
    expect(weekdayOf('2026-10-26')).toBe('monday')
    const mon = resolveDay(withFall(), '2026-10-26')
    expect(mon.source).toBe('weekly')
    expect(titles(mon)).toContain('History')
    expect(titles(resolveDay(withFall(), '2026-10-28'))).toContain('Health & Wellness')
  })

  it('returns an empty day outside a dated term and on weekends', () => {
    expect(resolveDay(withFall(), '2026-08-01')).toMatchObject({ term: null, source: 'none', blocks: [] })
    expect(resolveDay(withFall(), '2026-10-31')).toMatchObject({ source: 'none', blocks: [] }) // Saturday
    expect(resolveDay(file, '2026-10-31')).toMatchObject({ source: 'none', blocks: [] }) // open-ended term, Saturday
  })

  it('lets a later term take over from an open-ended one', () => {
    const winter: Term = { ...fall, id: '2027-winter', name: 'Winter 2027', startDate: '2027-01-04', endDate: null, weekly: { monday: [{ start: '09:00', end: '10:00', title: 'Chemistry', kind: 'class' }] } }
    const sched: ScheduleFile = { ...file, terms: [file.terms[0], winter] }
    expect(validateSchedule(sched)).toEqual([])
    expect(resolveDay(sched, '2027-01-03').term?.id).toBe('2026-fall')
    expect(resolveDay(sched, '2027-01-04').term?.id).toBe('2027-winter')
    expect(titles(resolveDay(sched, '2027-04-05'))).toEqual(['Chemistry'])
    // Order in the file does not matter.
    expect(resolveDay({ ...sched, terms: [winter, file.terms[0]] }, '2027-01-04').term?.id).toBe('2027-winter')
  })

  it('applies a date override that follows another weekday', () => {
    const day = resolveDay(withFall([{ date: '2026-10-26', label: 'Runs like Thursday', use: 'thursday' }]), '2026-10-26')
    expect(day).toMatchObject({ source: 'override', label: 'Runs like Thursday', closed: false })
    expect(titles(day)).toContain('Early Release')
  })

  it('applies a fully custom day, a closure, and a date range', () => {
    const overrides: Term['overrides'] = [
      { date: '2026-10-27', label: 'Assembly', blocks: [{ start: '09:00', end: '10:00', title: 'Assembly', kind: 'ad-hoc' }] },
      { from: '2026-11-25', to: '2026-11-27', label: 'Thanksgiving', closed: true }
    ]
    const sched = withFall(overrides)
    expect(titles(resolveDay(sched, '2026-10-27'))).toEqual(['Assembly'])
    expect(resolveDay(sched, '2026-11-26')).toMatchObject({ source: 'override', closed: true, blocks: [], label: 'Thanksgiving' })
    expect(resolveDay(sched, '2026-11-24').source).toBe('weekly')
    expect(resolveDay(sched, '2026-11-28').source).toBe('none')
  })

  it('picks the term that covers the date when there are several', () => {
    const winter: Term = { ...fall, id: '2027-winter', name: 'Winter 2027', startDate: '2027-01-04', endDate: '2027-03-12', weekly: { monday: [{ start: '09:00', end: '10:00', title: 'Chemistry', kind: 'class' }] } }
    const sched: ScheduleFile = { ...file, terms: [fall, winter] }
    expect(validateSchedule(sched)).toEqual([])
    expect(resolveDay(sched, '2027-01-04').term?.id).toBe('2027-winter')
    expect(titles(resolveDay(sched, '2027-01-04'))).toEqual(['Chemistry'])
    expect(resolveDay(sched, '2026-10-26').term?.id).toBe('2026-fall')
  })
})

describe('validateSchedule', () => {
  const clone = (): ScheduleFile => JSON.parse(JSON.stringify(file))
  const messages = (f: unknown): string => validateSchedule(f).join('\n')

  it('rejects junk', () => {
    expect(validateSchedule(null)).not.toEqual([])
    expect(messages({ schemaVersion: 2, timezone: '', terms: {} })).toMatch(/schemaVersion|terms/)
  })

  it('flags bad times, overlaps and unknown kinds', () => {
    const f = clone()
    const monday = f.terms[0].weekly.monday!
    monday[1].end = '8:40pm'
    monday[2].start = '10:00' // overlaps History
    monday[3].kind = 'nap' as never
    const out = messages(f)
    expect(out).toMatch(/bad end time/)
    expect(out).toMatch(/unknown kind "nap"/)
  })

  it('flags overlapping blocks', () => {
    const f = clone()
    f.terms[0].weekly.monday![2].start = '10:00'
    expect(messages(f)).toMatch(/overlaps or comes before/)
  })

  it('flags duplicate term ids and overlapping term dates', () => {
    const f = clone()
    f.terms.push({ ...f.terms[0], startDate: '2026-09-30', endDate: '2026-12-11' })
    f.terms[0].startDate = '2026-09-30'
    f.terms[0].endDate = '2026-12-11'
    const out = messages(f)
    expect(out).toMatch(/duplicate id/)
    expect(out).toMatch(/start on the same day/)
  })

  it('allows an open-ended term to be superseded, but not two terms starting the same day or dated terms overlapping', () => {
    const f = clone()
    f.terms.push({ ...f.terms[0], id: 'later', startDate: '2027-01-04' })
    expect(messages(f)).toBe('')
    f.terms[1].startDate = null
    expect(messages(f)).toMatch(/start on the same day/)
    f.terms[0].endDate = '2027-02-01'
    f.terms[1].startDate = '2027-01-04'
    expect(messages(f)).toMatch(/overlap/)
  })

  it('flags bad overrides', () => {
    const f = withFall([
      { date: '2026-10-26', use: 'monday', closed: true }, // two modes
      { date: '2026-02-30', closed: true }, // not a real date
      { date: '2026-10-28', use: 'someday' as never }, // unknown weekday
      { date: '2027-05-05', closed: true }, // outside the term
      { from: '2026-11-02', to: '2026-11-01', closed: true } // reversed
    ])
    const out = messages(withFall([...(f.terms[0].overrides)]))
    expect(out).toMatch(/exactly one of/)
    expect(out).toMatch(/give either "date"/)
    expect(out).toMatch(/unknown weekday/)
    expect(out).toMatch(/outside the term/)
  })

  it('flags overlapping overrides', () => {
    const out = messages(withFall([{ date: '2026-10-26', closed: true }, { from: '2026-10-20', to: '2026-10-30', closed: true }]))
    expect(out).toMatch(/overlaps overrides\[0\]/)
  })
})
