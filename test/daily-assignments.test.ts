import { describe, expect, it } from 'vitest'
import { assignmentsForDay, assignmentState, carryWindow, isSubmitted } from '../src/shared/daily/assignments'
import { at, makeAssignment } from './helpers'

// Oct 26 2026 is a Monday, Oct 30 a Friday, Oct 31 a Saturday, Nov 1 a Sunday.
const due = (id: string, iso: string | null, over = {}) => makeAssignment({ id, dueAt: iso, ...over })
const ids = (list: { item: { id: string } }[]): string[] => list.map((l) => l.item.id)
const now = new Date(2026, 9, 26, 12, 0)

describe('assignmentsForDay, weekdays', () => {
  const items = [
    due('early', at(2026, 10, 26, 8, 0)),
    due('evening', at(2026, 10, 26, 21, 30)),
    due('late', at(2026, 10, 26, 23, 59)),
    due('yesterday', at(2026, 10, 25, 23, 59)),
    due('midnight', at(2026, 10, 27, 0, 0)),
    due('tue-morning', at(2026, 10, 27, 11, 59)),
    due('tue-noon', at(2026, 10, 27, 12, 0)),
    due('wed', at(2026, 10, 28, 9, 0)),
    due('undated', null)
  ]

  it('lists the day by deadline time and carries tomorrow morning (before noon)', () => {
    const res = assignmentsForDay(items, '2026-10-26', now)
    expect(ids(res.timed)).toEqual(['early', 'evening', 'late'])
    expect(ids(res.carried)).toEqual(['midnight', 'tue-morning'])
  })

  it('ignores assignments without a due date', () => {
    const res = assignmentsForDay(items, '2026-10-26', now)
    expect([...ids(res.timed), ...ids(res.carried)]).not.toContain('undated')
  })

  it('shows an item at its real time on the day it is due, and carried the day before', () => {
    expect(ids(assignmentsForDay(items, '2026-10-27', now).timed)).toEqual(['midnight', 'tue-morning', 'tue-noon'])
    expect(ids(assignmentsForDay(items, '2026-10-26', now).carried)).toContain('tue-morning')
  })

  it('on Friday carries only Saturday morning', () => {
    const fri = [due('fri', at(2026, 10, 30, 17)), due('sat-am', at(2026, 10, 31, 11, 59)), due('sat-noon', at(2026, 10, 31, 12)), due('sun', at(2026, 11, 1, 9))]
    const res = assignmentsForDay(fri, '2026-10-30', now)
    expect(ids(res.timed)).toEqual(['fri'])
    expect(ids(res.carried)).toEqual(['sat-am'])
  })
})

describe('assignmentsForDay, weekends', () => {
  const items = [
    due('sat', at(2026, 10, 31, 20)),
    due('sun-am', at(2026, 11, 1, 9)),
    due('sun-pm', at(2026, 11, 1, 23, 59)),
    due('mon-am', at(2026, 11, 2, 11, 59)),
    due('mon-noon', at(2026, 11, 2, 12, 0)),
    due('fri', at(2026, 10, 30, 23, 59))
  ]

  it('on Saturday lists everything due until Monday noon', () => {
    const res = assignmentsForDay(items, '2026-10-31', now)
    expect(ids(res.timed)).toEqual(['sat'])
    expect(ids(res.carried)).toEqual(['sun-am', 'sun-pm', 'mon-am'])
  })

  it('on Sunday lists today plus Monday morning', () => {
    const res = assignmentsForDay(items, '2026-11-01', now)
    expect(ids(res.timed)).toEqual(['sun-am', 'sun-pm'])
    expect(ids(res.carried)).toEqual(['mon-am'])
  })

  it('exposes the windows', () => {
    expect(carryWindow('2026-10-31')).toEqual({ from: new Date(2026, 10, 1), to: new Date(2026, 10, 2, 12) })
    expect(carryWindow('2026-11-01')).toEqual({ from: new Date(2026, 10, 2), to: new Date(2026, 10, 2, 12) })
    expect(carryWindow('2026-10-26')).toEqual({ from: new Date(2026, 9, 27), to: new Date(2026, 9, 27, 12) })
  })
})

describe('submitted / outstanding', () => {
  const t = at(2026, 10, 26, 9)
  it.each([
    ['unsubmitted', {}, false],
    ['submitted', { workflowState: 'submitted', submittedAt: at(2026, 10, 25) }, true],
    ['graded', { workflowState: 'graded', gradedAt: at(2026, 10, 25), score: 3 }, true],
    ['excused', { excused: true }, true],
    ['pending review', { workflowState: 'pending_review', submittedAt: at(2026, 10, 25) }, true],
    ['missing flag only', { missing: true }, false]
  ])('%s', (_name, over, expected) => {
    expect(isSubmitted(makeAssignment({ dueAt: t, ...over }), now)).toBe(expected)
  })

  it('flags outstanding work that is past its deadline', () => {
    const res = assignmentsForDay(
      [
        due('over', at(2026, 10, 26, 9)),
        due('upcoming', at(2026, 10, 26, 18)),
        due('done', at(2026, 10, 26, 9), { workflowState: 'submitted', submittedAt: at(2026, 10, 25) })
      ],
      '2026-10-26',
      now
    )
    expect(res.timed.map((a) => [a.item.id, a.state])).toEqual([
      ['done', 'submitted'],
      ['over', 'past-due'],
      ['upcoming', 'outstanding']
    ])
  })

  describe('assignments that do not need a submission', () => {
    const state = (over: object) => assignmentState(makeAssignment({ dueAt: at(2026, 10, 26, 9), ...over }), now)

    it.each([
      ['none', ['none']],
      ['on paper', ['on_paper']],
      ['not graded', ['not_graded']],
      ['a mix of non-submittable types', ['none', 'on_paper']]
    ])('shows %s as no-submission, even when the deadline has passed', (_name, submissionTypes) => {
      expect(state({ submissionTypes })).toBe('no-submission')
      expect(state({ submissionTypes, dueAt: at(2026, 10, 30, 9) })).toBe('no-submission')
    })

    it.each([
      ['an upload', ['online_upload']],
      ['a quiz', ['online_quiz']],
      ['a discussion', ['discussion_topic']],
      ['an external tool', ['external_tool']],
      ['on paper OR online', ['on_paper', 'online_upload']],
      ['unknown types', []]
    ])('still warns for %s', (_name, submissionTypes) => {
      expect(state({ submissionTypes })).toBe('past-due')
    })

    it('keeps the check for work that was graded or excused anyway', () => {
      expect(state({ submissionTypes: ['on_paper'], workflowState: 'graded', gradedAt: at(2026, 10, 25), score: 4 })).toBe('submitted')
      expect(state({ submissionTypes: ['none'], excused: true })).toBe('submitted')
    })
  })

  it('sorts by deadline, then course and name', () => {
    const same = at(2026, 10, 26, 15)
    const res = assignmentsForDay(
      [due('b', same, { courseName: 'B', name: 'x' }), due('a', same, { courseName: 'A', name: 'z' }), due('c', at(2026, 10, 26, 14))],
      '2026-10-26',
      now
    )
    expect(ids(res.timed)).toEqual(['c', 'a', 'b'])
  })
})
