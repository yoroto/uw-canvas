import { describe, expect, it } from 'vitest'
import type { AssignmentView, Fingerprint } from '../src/shared/assignments/types'
import { fingerprintOf } from '../src/shared/importance/fingerprint'
import { rankAssignments } from '../src/shared/importance/rank'
import { DEFAULT_SETTINGS, moveRule, toggleRule } from '../src/shared/importance/settings'
import { at, makeAssignment } from './helpers'

const now = new Date(2026, 9, 29, 12, 0) // Oct 29 2026, 12:00 local

const graded = (over: Partial<AssignmentView>): AssignmentView =>
  makeAssignment({ workflowState: 'graded', submittedAt: at(2026, 10, 15), gradedAt: at(2026, 10, 24), score: 9, ...over })

// Feedback: the teacher added a second comment after the user last looked.
const feedbackBase = graded({ id: 'fb', dueAt: at(2026, 10, 22), commentCount: 1, lastCommentId: 'c1' })
const feedback = { ...feedbackBase, commentCount: 2, lastCommentId: 'c2', lastCommentAt: at(2026, 10, 28) }

const items: AssignmentView[] = [
  makeAssignment({ id: 'od-old', dueAt: at(2026, 10, 20, 12) }),
  makeAssignment({ id: 'od-new', dueAt: at(2026, 10, 28, 20) }),
  makeAssignment({ id: 'soon-3h', dueAt: at(2026, 10, 29, 15) }),
  makeAssignment({ id: 'soon-30h', dueAt: at(2026, 10, 30, 18) }),
  makeAssignment({ id: 'later', dueAt: at(2026, 11, 20) }),
  makeAssignment({ id: 'undated' }),
  makeAssignment({ id: 'sub', workflowState: 'submitted', submittedAt: at(2026, 10, 24), dueAt: at(2026, 10, 25) }),
  feedback,
  graded({ id: 'cross', gradingType: 'pass_fail', grade: 'incomplete', score: 0, dueAt: at(2026, 10, 21) }),
  graded({ id: 'g-new', dueAt: at(2026, 10, 20) }),
  graded({ id: 'g-old', dueAt: at(2026, 10, 1) })
]

const seen: Record<string, Fingerprint> = { [feedbackBase.key]: fingerprintOf(feedbackBase) }

const ids = (list: { item: AssignmentView }[]): string[] => list.map((r) => r.item.id)
const rank = (settings = DEFAULT_SETTINGS, input = items) => rankAssignments(input, seen, now, settings)

describe('rankAssignments, default rules', () => {
  it('orders To do: overdue (most overdue first), due soon (soonest first), then by due date', () => {
    expect(ids(rank().toDo)).toEqual(['od-old', 'od-new', 'soon-3h', 'soon-30h', 'later', 'undated'])
  })

  it('orders Turned in: new feedback, cross score, then most recent deadline first', () => {
    expect(ids(rank().turnedIn)).toEqual(['fb', 'cross', 'sub', 'g-new', 'g-old'])
  })

  it('explains each placement with a reason', () => {
    const { toDo, turnedIn } = rank()
    const reasons = Object.fromEntries([...toDo, ...turnedIn].map((r) => [r.item.id, r.rule?.reason ?? null]))
    expect(reasons).toEqual({
      'od-old': 'Overdue 9d',
      'od-new': 'Overdue 16h',
      'soon-3h': 'Due in 3h',
      'soon-30h': 'Due in 30h',
      later: null,
      undated: null,
      fb: 'New feedback',
      cross: 'Incomplete',
      sub: null,
      'g-new': null,
      'g-old': null
    })
  })

  it('gives the same order for shuffled input', () => {
    const shuffled = [...items].reverse()
    expect(ids(rank(DEFAULT_SETTINGS, shuffled).toDo)).toEqual(ids(rank().toDo))
    expect(ids(rank(DEFAULT_SETTINGS, shuffled).turnedIn)).toEqual(ids(rank().turnedIn))
  })

  it('puts excused work in Turned in', () => {
    const res = rank(DEFAULT_SETTINGS, [makeAssignment({ id: 'ex', excused: true, dueAt: at(2026, 10, 20) })])
    expect(ids(res.toDo)).toEqual([])
    expect(ids(res.turnedIn)).toEqual(['ex'])
  })

  it('labels a score-only change as a new grade', () => {
    const regraded = { ...feedbackBase, score: 5 }
    const res = rank(DEFAULT_SETTINGS, [regraded])
    expect(res.turnedIn[0].rule?.reason).toBe('New grade')
    expect(res.turnedIn[0].change).toBe('grade')
  })

  it('flags nothing without a seen record', () => {
    const res = rankAssignments([feedback], {}, now)
    expect(res.turnedIn[0].change).toBeNull()
    expect(res.turnedIn[0].rule).toBeNull()
  })
})

describe('rankAssignments, rules applied dynamically', () => {
  it('moving a rule up changes the order', () => {
    const moved = moveRule(DEFAULT_SETTINGS, 'due-soon', -1)
    expect(ids(rank(moved).toDo)).toEqual(['soon-3h', 'soon-30h', 'od-old', 'od-new', 'later', 'undated'])
  })

  it('reordering Turned in rules puts cross score first', () => {
    const moved = moveRule(DEFAULT_SETTINGS, 'cross-score', -1)
    expect(ids(rank(moved).turnedIn)).toEqual(['cross', 'fb', 'sub', 'g-new', 'g-old'])
  })

  it('turning a rule off drops its items to the fallback order without hiding them', () => {
    const off = toggleRule(DEFAULT_SETTINGS, 'overdue')
    const { toDo } = rank(off)
    expect(ids(toDo)).toEqual(['soon-3h', 'soon-30h', 'od-old', 'od-new', 'later', 'undated'])
    expect(toDo.find((r) => r.item.id === 'od-old')?.rule).toBeNull()
  })

  it('with every rule off, each zone uses only its fallback order', () => {
    const allOff = DEFAULT_SETTINGS.map((s) => ({ ...s, enabled: false }))
    const res = rank(allOff)
    expect(ids(res.toDo)).toEqual(['od-old', 'od-new', 'soon-3h', 'soon-30h', 'later', 'undated'])
    expect(ids(res.turnedIn)).toEqual(['sub', 'fb', 'cross', 'g-new', 'g-old'])
    expect(res.toDo.concat(res.turnedIn).every((r) => r.rule === null)).toBe(true)
  })

  it('ignores settings for unknown rules', () => {
    const odd = [{ id: 'nope', enabled: true }, ...DEFAULT_SETTINGS]
    expect(ids(rank(odd).toDo)).toEqual(ids(rank().toDo))
  })
})
