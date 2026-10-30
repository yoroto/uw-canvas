import { describe, expect, it } from 'vitest'
import { courseOptions, filterByCourses } from '../src/shared/assignments/courses'
import { makeAssignment } from './helpers'

const items = [
  makeAssignment({ id: '1', courseId: 'c2', courseName: 'MATH 126' }),
  makeAssignment({ id: '2', courseId: 'c1', courseName: 'CSE 142' }),
  makeAssignment({ id: '3', courseId: 'c2', courseName: 'MATH 126' }),
  makeAssignment({ id: '4', courseId: 'c3', courseName: 'ART 101' })
]

describe('courseOptions', () => {
  it('lists each course once, sorted by name', () => {
    expect(courseOptions(items).map((c) => c.name)).toEqual(['ART 101', 'CSE 142', 'MATH 126'])
  })

  it('gives every course a different hue', () => {
    const hues = courseOptions(items).map((c) => c.hue)
    expect(new Set(hues).size).toBe(hues.length)
    for (const h of hues) {
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(360)
    }
  })

  it('keeps colors independent of any filtering', () => {
    expect(courseOptions(items)).toEqual(courseOptions([...items].reverse()))
  })

  it('handles no assignments', () => {
    expect(courseOptions([])).toEqual([])
  })
})

describe('filterByCourses', () => {
  it('returns everything when nothing is hidden', () => {
    expect(filterByCourses(items, new Set())).toHaveLength(4)
  })

  it('drops hidden courses', () => {
    expect(filterByCourses(items, new Set(['c2'])).map((i) => i.id)).toEqual(['2', '4'])
  })

  it('shows courses it has not seen before', () => {
    expect(filterByCourses(items, new Set(['gone'])).map((i) => i.id)).toEqual(['1', '2', '3', '4'])
  })

  it('can hide all courses', () => {
    expect(filterByCourses(items, new Set(['c1', 'c2', 'c3']))).toEqual([])
  })
})
