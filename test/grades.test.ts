import { describe, expect, it } from 'vitest'
import type { AssignmentView } from '../src/shared/assignments/types'
import { DEFAULT_GRADE_SORT, GRADE_SORTS, listGraded } from '../src/shared/grades/grades'
import { at, makeAssignment } from './helpers'

const now = new Date(2026, 9, 29, 12, 0)

const graded = (id: string, over: Partial<AssignmentView> = {}): AssignmentView =>
  makeAssignment({ id, workflowState: 'graded', score: 9, gradedAt: at(2026, 10, 10), ...over })

// Three dates deliberately ordered differently, so each sort gives a different list.
const a = graded('a', { postedAt: at(2026, 10, 20), gradedAt: at(2026, 10, 12), lastCommentAt: at(2026, 10, 14) })
const b = graded('b', { postedAt: at(2026, 10, 18), gradedAt: at(2026, 10, 19), lastCommentAt: at(2026, 10, 15) })
const c = graded('c', { postedAt: at(2026, 10, 16), gradedAt: at(2026, 10, 11), lastCommentAt: at(2026, 10, 25) })

const ids = (list: AssignmentView[]): string[] => list.map((i) => i.id)

describe('listGraded', () => {
  it('sorts by posted date by default, most recent first', () => {
    expect(DEFAULT_GRADE_SORT).toBe('postedAt')
    expect(ids(listGraded([c, a, b], now))).toEqual(['a', 'b', 'c'])
  })

  it.each([
    ['postedAt', ['a', 'b', 'c']],
    ['gradedAt', ['b', 'a', 'c']],
    ['lastCommentAt', ['c', 'b', 'a']]
  ] as const)('sorts by %s', (sort, expected) => {
    expect(ids(listGraded([a, b, c], now, sort))).toEqual(expected)
  })

  it('offers the three sorts, posted first', () => {
    expect(GRADE_SORTS.map((s) => s.key)).toEqual(['postedAt', 'gradedAt', 'lastCommentAt'])
  })

  it('includes only graded work', () => {
    const items = [
      a,
      makeAssignment({ id: 'unsubmitted', dueAt: at(2026, 10, 1) }),
      makeAssignment({ id: 'submitted', workflowState: 'submitted', submittedAt: at(2026, 10, 20) }),
      graded('excused', { excused: true }),
      graded('by-date-only', { workflowState: 'unsubmitted', gradedAt: at(2026, 10, 21) })
    ]
    expect(ids(listGraded(items, now))).toEqual(['a', 'by-date-only'])
  })

  it('puts items without the chosen date last, ordered by their other dates', () => {
    const noComment = graded('no-comment', { postedAt: at(2026, 10, 30), gradedAt: at(2026, 10, 29), lastCommentAt: null })
    const noCommentOlder = graded('no-comment-older', { postedAt: at(2026, 10, 1), gradedAt: at(2026, 10, 2), lastCommentAt: null })
    expect(ids(listGraded([noCommentOlder, a, noComment, c], now, 'lastCommentAt'))).toEqual(['c', 'a', 'no-comment', 'no-comment-older'])
  })

  it('handles grades that were never posted', () => {
    const unposted = graded('unposted', { postedAt: null, gradedAt: at(2026, 10, 28) })
    expect(ids(listGraded([unposted, c], now, 'postedAt'))).toEqual(['c', 'unposted'])
    expect(ids(listGraded([unposted, c], now, 'gradedAt'))).toEqual(['unposted', 'c'])
  })

  it('breaks ties by the other dates, then course, name and key, regardless of input order', () => {
    const t = at(2026, 10, 20)
    const x = graded('x', { postedAt: t, gradedAt: at(2026, 10, 5), courseName: 'ART 101', name: 'B' })
    const y = graded('y', { postedAt: t, gradedAt: at(2026, 10, 9), courseName: 'ART 101', name: 'A' })
    const z = graded('z', { postedAt: t, gradedAt: at(2026, 10, 9), courseName: 'ART 101', name: 'Z' })
    expect(ids(listGraded([x, z, y], now))).toEqual(['y', 'z', 'x'])
    expect(ids(listGraded([y, x, z], now))).toEqual(['y', 'z', 'x'])
  })

  it('does not change its input', () => {
    const input = [c, a, b]
    listGraded(input, now)
    expect(ids(input)).toEqual(['c', 'a', 'b'])
  })

  it('returns nothing when nothing is graded', () => {
    expect(listGraded([], now)).toEqual([])
  })
})
