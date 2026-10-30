import { describe, expect, it } from 'vitest'
import { formatDayLabel, formatDuration, formatGrade, formatRelative, gradeTone } from '../src/shared/assignments/format'
import { makeAssignment } from './helpers'

const now = new Date(2026, 9, 29, 12, 0)
const plus = (ms: number): Date => new Date(now.getTime() + ms)
const H = 3_600_000

describe('formatRelative', () => {
  it.each([
    [30_000, 'now'],
    [10 * 60_000, 'in 10m'],
    [3 * H, 'in 3h'],
    [-5 * H, '5h ago'],
    [47 * H, 'in 47h'],
    [-72 * H, '3d ago'],
    [10 * 24 * H, 'in 10d']
  ])('%i ms -> %s', (offset, expected) => {
    expect(formatRelative(plus(offset), now)).toBe(expected)
  })
})

describe('formatDuration', () => {
  it.each([
    [10_000, '<1m'],
    [5 * 60_000, '5m'],
    [5 * H, '5h'],
    [-5 * H, '5h'],
    [47 * H, '47h'],
    [72 * H, '3d']
  ])('%i ms -> %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected)
  })
})

describe('formatGrade', () => {
  it('shows score over points', () => {
    expect(formatGrade(makeAssignment({ score: 9, pointsPossible: 10 }))).toBe('9/10')
  })
  it('shows a tick or a cross for pass/fail', () => {
    expect(formatGrade(makeAssignment({ gradingType: 'pass_fail', grade: 'complete', score: 10 }))).toBe('✓')
    expect(formatGrade(makeAssignment({ gradingType: 'pass_fail', grade: 'incomplete', score: 0 }))).toBe('✗')
    expect(formatGrade(makeAssignment({ gradingType: 'pass_fail' }))).toBe('—')
  })
  it('appends the letter for letter-grade assignments', () => {
    expect(formatGrade(makeAssignment({ gradingType: 'letter_grade', score: 92, pointsPossible: 100, grade: 'A-' }))).toBe('92/100 (A-)')
  })
  it('falls back to the raw grade or a dash', () => {
    expect(formatGrade(makeAssignment({ grade: 'B' }))).toBe('B')
    expect(formatGrade(makeAssignment())).toBe('—')
  })
  it('handles a score when points are unknown', () => {
    expect(formatGrade(makeAssignment({ score: 4, pointsPossible: null }))).toBe('4')
  })
})

describe('gradeTone', () => {
  const scored = (score: number, points = 100) => makeAssignment({ score, pointsPossible: points })

  it('colors tick green and cross red', () => {
    expect(gradeTone(makeAssignment({ gradingType: 'pass_fail', grade: 'complete' }))).toBe('green')
    expect(gradeTone(makeAssignment({ gradingType: 'pass_fail', grade: 'incomplete' }))).toBe('red')
    expect(gradeTone(makeAssignment({ gradingType: 'pass_fail' }))).toBeNull()
  })

  it.each([
    [100, 'green'],
    [90, 'green'],
    [89.9, 'yellow'],
    [70, 'yellow'],
    [69.9, 'orange'],
    [50, 'orange'],
    [49.9, 'red'],
    [0, 'red'],
    [110, 'green']
  ])('score %s/100 -> %s', (score, tone) => {
    expect(gradeTone(scored(score))).toBe(tone)
  })

  it('uses the percentage of points, not the raw score', () => {
    expect(gradeTone(scored(9, 10))).toBe('green')
    expect(gradeTone(scored(7, 20))).toBe('red')
  })

  it('has no color when ungraded or points are unknown/zero', () => {
    expect(gradeTone(makeAssignment())).toBeNull()
    expect(gradeTone(makeAssignment({ score: 5, pointsPossible: null }))).toBeNull()
    expect(gradeTone(makeAssignment({ score: 5, pointsPossible: 0 }))).toBeNull()
  })
})

describe('formatDayLabel', () => {
  it('uses relative names around today', () => {
    expect(formatDayLabel('2026-10-29', now)).toBe('Today')
    expect(formatDayLabel('2026-10-30', now)).toBe('Tomorrow')
    expect(formatDayLabel('2026-10-28', now)).toBe('Yesterday')
  })
  it('uses a date otherwise', () => {
    expect(formatDayLabel('2026-11-12', now)).toMatch(/Nov/)
  })
})
