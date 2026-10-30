import { describe, expect, it } from 'vitest'
import schedule from '../data/schedule.json'
import { isActiveCourse, matchCourse, normaliseName } from '../src/shared/schedule/courseMatch'
import type { ScheduleFile } from '../src/shared/schedule/types'

const c = (id: string, name: string) => ({ id, name })
const courses = [c('1', 'Precalculus'), c('2', 'History'), c('3', 'English'), c('4', 'Biology'), c('5', 'Health & Wellness'), c('6', 'Study Skills')]

describe('normaliseName', () => {
  it('keeps only lowercase words', () => {
    expect(normaliseName('  Health & Wellness ')).toBe('health and wellness')
    expect(normaliseName('Health and Wellness')).toBe('health and wellness')
    expect(normaliseName('AP® U.S. History (Fall 2026)')).toBe('ap u s history fall 2026')
    expect(normaliseName('')).toBe('')
  })
})

describe('matchCourse', () => {
  it('uses the alias for Precalc and finds the obvious ones directly', () => {
    const names = { Precalc: 'Precalculus' }
    expect(matchCourse('Precalc', courses, names)?.course.id).toBe('1')
    expect(matchCourse('History', courses, names)?.course.id).toBe('2')
    expect(matchCourse('English', courses, names)?.course.id).toBe('3')
    expect(matchCourse('Biology', courses, names)?.course.id).toBe('4')
    expect(matchCourse('Health & Wellness', courses, names)?.course.id).toBe('5')
  })

  it('does not match "Precalc" to "Precalculus" without the alias (whole words only)', () => {
    expect(matchCourse('Precalc', courses)).toBeNull()
  })

  it('treats & and "and" alike', () => {
    expect(matchCourse('Health & Wellness', [c('9', 'Health and Wellness 9')])?.course.id).toBe('9')
  })

  it('finds a title inside a longer course name', () => {
    const match = matchCourse('Biology', [c('1', 'AP Biology - Fall 2026')])
    expect(match).toEqual({ course: c('1', 'AP Biology - Fall 2026'), ambiguous: false })
  })

  it('prefers an exact name, then a name that starts with the title, then one that only contains it', () => {
    const list = [c('1', 'World History'), c('2', 'History 101'), c('3', 'History')]
    expect(matchCourse('History', list)?.course.id).toBe('3')
    expect(matchCourse('History', list.slice(0, 2))?.course.id).toBe('2')
    expect(matchCourse('History', list.slice(0, 1))?.course.id).toBe('1')
  })

  it('flags ties, taking the shortest name and then the lowest id', () => {
    const tie = matchCourse('History', [c('12', 'World History'), c('3', 'US History')])
    expect(tie).toEqual({ course: c('3', 'US History'), ambiguous: true })
    const sameLength = matchCourse('History', [c('20', 'Art History'), c('7', 'Old History')])
    expect(sameLength?.course.id).toBe('7')
    expect(matchCourse('History', [c('1', 'History'), c('2', 'World History')])?.ambiguous).toBe(false)
  })

  it('returns null when nothing fits or there is nothing to look for', () => {
    expect(matchCourse('Chemistry', courses)).toBeNull()
    expect(matchCourse('', courses)).toBeNull()
    expect(matchCourse('History', [])).toBeNull()
    expect(matchCourse('History', courses, { History: '   ' })).toBeNull()
  })

  it('does not match part of a word', () => {
    expect(matchCourse('Art', [c('1', 'Party Planning'), c('2', 'Smart Cities')])).toBeNull()
  })
})

describe('isActiveCourse', () => {
  it('keeps published, named, unrestricted courses only', () => {
    expect(isActiveCourse({ id: '1', name: 'A', workflow_state: 'available' })).toBe(true)
    expect(isActiveCourse({ id: '1', name: 'A', workflow_state: 'completed' })).toBe(false)
    expect(isActiveCourse({ id: '1', workflow_state: 'available' })).toBe(false)
    expect(isActiveCourse({ id: '1', name: 'A', workflow_state: 'available', access_restricted_by_date: true })).toBe(false)
  })
})

describe('the Fall 2026 schedule', () => {
  const term = (schedule as unknown as ScheduleFile).terms[0]

  it('maps Precalc to Precalculus', () => {
    expect(term.courseNames).toEqual({ Precalc: 'Precalculus' })
  })

  it('has a Canvas-style name for every class title', () => {
    const titles = new Set(Object.values(term.weekly).flatMap((blocks) => blocks!.filter((b) => b.kind === 'class').map((b) => b.title)))
    expect([...titles].sort()).toEqual(['Biology', 'English', 'Health & Wellness', 'History', 'Precalc'])
    for (const t of titles) expect(matchCourse(t, courses, term.courseNames)).not.toBeNull()
  })
})
