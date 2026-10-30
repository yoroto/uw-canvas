import { describe, expect, it } from 'vitest'
import type { AssignmentView } from '../src/shared/assignments/types'
import { findProblems, PROBLEMS, type ProblemGroup } from '../src/shared/problems/problems'
import { at, makeAssignment } from './helpers'

const now = new Date(2026, 9, 29, 12, 0) // Oct 29 2026, 12:00 local

const graded = (over: Partial<AssignmentView>): AssignmentView =>
  makeAssignment({ workflowState: 'graded', submittedAt: at(2026, 10, 15), gradedAt: at(2026, 10, 24), dueAt: at(2026, 10, 16), ...over })

const ok = graded({ id: 'ok', score: 18, pointsPossible: 20 })
const missingOld = makeAssignment({ id: 'miss-old', dueAt: at(2026, 10, 20, 12) })
const missingNew = makeAssignment({ id: 'miss-new', dueAt: at(2026, 10, 28, 20) })
const cross = graded({ id: 'cross', gradingType: 'pass_fail', grade: 'incomplete', score: 0, gradedAt: at(2026, 10, 25) })
const crossOlder = graded({ id: 'cross-old', gradingType: 'pass_fail', grade: 'incomplete', score: 0, gradedAt: at(2026, 10, 20) })
const lateRecent = graded({ id: 'late-new', late: true, score: 9, pointsPossible: 10, dueAt: at(2026, 10, 20), submittedAt: at(2026, 10, 21, 3) })
const lateOlder = graded({ id: 'late-old', late: true, score: 9, pointsPossible: 10, dueAt: at(2026, 10, 10), submittedAt: at(2026, 10, 10, 5) })
const red = graded({ id: 'red', score: 3, pointsPossible: 10 })
const redLower = graded({ id: 'red-low', score: 1, pointsPossible: 10 })
const lateAndRed = graded({ id: 'late-red', late: true, score: 2, pointsPossible: 10, dueAt: at(2026, 10, 20), submittedAt: at(2026, 10, 22, 12) })
const upcoming = makeAssignment({ id: 'upcoming', dueAt: at(2026, 11, 20) })
const yellow = graded({ id: 'yellow', score: 7, pointsPossible: 10 })
const excusedMissing = makeAssignment({ id: 'ex', excused: true, dueAt: at(2026, 10, 1) })
const noSubmission = makeAssignment({ id: 'paper', submissionTypes: ['on_paper'], dueAt: at(2026, 10, 1) })

const everything = [ok, missingOld, missingNew, cross, crossOlder, lateRecent, lateOlder, red, redLower, lateAndRed, upcoming, yellow, excusedMissing, noSubmission]

const shape = (groups: ProblemGroup[]): Record<string, string[]> =>
  Object.fromEntries(groups.map((g) => [g.kind, g.entries.map((e) => e.item.id)]))

describe('findProblems', () => {
  it('lists groups in the required order: missing, cross, late, red scores', () => {
    expect(PROBLEMS.map((p) => p.kind)).toEqual(['missing', 'cross', 'late', 'low-score'])
    expect(findProblems(everything, now).map((g) => g.kind)).toEqual(['missing', 'cross', 'late', 'low-score'])
  })

  it('shows only problem items, sorted inside each group', () => {
    expect(shape(findProblems(everything, now))).toEqual({
      missing: ['miss-old', 'miss-new'], // most overdue first
      cross: ['cross', 'cross-old'], // newest graded first
      late: ['late-red', 'late-new', 'late-old'], // most recently submitted first
      'low-score': ['red-low', 'red'] // lowest first
    })
  })

  it('leaves out everything that is fine, excused or not expected to be submitted', () => {
    const listed = findProblems(everything, now).flatMap((g) => g.entries.map((e) => e.item.id))
    for (const id of ['ok', 'upcoming', 'yellow', 'ex', 'paper']) expect(listed).not.toContain(id)
  })

  it('lists an item once, under its first category, with a reason for each category it matches', () => {
    const groups = findProblems([lateAndRed], now)
    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('late')
    expect(groups[0].entries[0].reasons).toEqual([
      { kind: 'late', text: 'Late 2d' },
      { kind: 'low-score', text: 'Score 20%' }
    ])
  })

  it('writes readable reasons', () => {
    const reasons = Object.fromEntries(
      findProblems(everything, now).flatMap((g) => g.entries.map((e) => [e.item.id, e.reasons[0].text]))
    )
    expect(reasons).toMatchObject({
      'miss-old': 'Overdue 9d',
      'miss-new': 'Overdue 16h',
      cross: 'Incomplete',
      'late-new': 'Late 27h',
      'red-low': 'Score 10%'
    })
  })

  it('treats the red boundary as under 50 percent', () => {
    const edge = [graded({ id: 'fifty', score: 5, pointsPossible: 10 }), graded({ id: 'under', score: 4.9, pointsPossible: 10 })]
    expect(shape(findProblems(edge, now))).toEqual({ 'low-score': ['under'] })
  })

  it('omits empty groups and returns nothing when there are no problems', () => {
    expect(findProblems([ok, upcoming, yellow], now)).toEqual([])
    expect(findProblems([], now)).toEqual([])
    expect(findProblems([missingOld], now).map((g) => g.kind)).toEqual(['missing'])
  })

  it('gives the same result for shuffled input', () => {
    expect(shape(findProblems([...everything].reverse(), now))).toEqual(shape(findProblems(everything, now)))
  })

  it('follows the order of the definitions it is given', () => {
    const reversed = [...PROBLEMS].reverse()
    expect(findProblems(everything, now, reversed).map((g) => g.kind)).toEqual(['low-score', 'late', 'cross', 'missing'])
  })
})
