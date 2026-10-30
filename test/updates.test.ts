import { describe, expect, it } from 'vitest'
import { assignmentUpdates, updatesForDay, UPDATE_KINDS, type UpdateEvent } from '../src/shared/updates/updates'
import { at, makeAssignment } from './helpers'

describe('assignmentUpdates', () => {
  it('reports a grade that was entered and released together as one "graded" event with the grade', () => {
    const a = makeAssignment({ id: 'g', name: 'Lab 4', score: 9, pointsPossible: 10, workflowState: 'graded', gradedAt: at(2026, 10, 28, 14, 0), postedAt: at(2026, 10, 28, 14, 0) })
    expect(assignmentUpdates([a])).toEqual([
      { id: `graded:${a.key}:${a.postedAt}`, kind: 'graded', at: a.postedAt, title: 'Lab 4', courseId: a.courseId, courseName: 'CSE 142', url: a.htmlUrl, detail: '9/10' }
    ])
  })

  it('reports graded and posted separately when they happened at different times', () => {
    const a = makeAssignment({ id: 'g', score: 9, pointsPossible: 10, gradedAt: at(2026, 10, 27, 9), postedAt: at(2026, 10, 28, 9) })
    expect(assignmentUpdates([a]).map((e) => [e.kind, e.at, e.detail])).toEqual([
      ['graded', at(2026, 10, 27, 9), undefined],
      ['grade-posted', at(2026, 10, 28, 9), '9/10']
    ])
  })

  it('reports a grade that is entered but not yet posted without revealing a score', () => {
    const events = assignmentUpdates([makeAssignment({ gradedAt: at(2026, 10, 27, 9), postedAt: null })])
    expect(events.map((e) => [e.kind, e.detail])).toEqual([['graded', undefined]])
  })

  it('reports each teacher comment with its text', () => {
    const a = makeAssignment({
      comments: [
        { id: 'c1', at: at(2026, 10, 26, 10), text: 'Good start' },
        { id: 'c2', at: at(2026, 10, 28, 16), text: '' }
      ]
    })
    expect(assignmentUpdates([a]).map((e) => [e.kind, e.at, e.detail])).toEqual([
      ['comment', at(2026, 10, 26, 10), 'Good start'],
      ['comment', at(2026, 10, 28, 16), undefined]
    ])
  })

  it('reports availability and edits, and nothing for missing dates or unknown comments', () => {
    const a = makeAssignment({ unlockAt: at(2026, 10, 30, 8), updatedAt: at(2026, 10, 29, 12) })
    expect(assignmentUpdates([a]).map((e) => e.kind)).toEqual(['available', 'assignment-updated'])
    expect(assignmentUpdates([makeAssignment({ comments: null })])).toEqual([])
    expect(assignmentUpdates([])).toEqual([])
  })

  it('does not report created_at, lock_at or the submission time', () => {
    const a = makeAssignment({ lockAt: at(2026, 11, 1), submittedAt: at(2026, 10, 25), workflowState: 'submitted' })
    expect(assignmentUpdates([a])).toEqual([])
  })

  it('gives every event a unique id', () => {
    const a = makeAssignment({ gradedAt: at(2026, 10, 27, 9), postedAt: at(2026, 10, 28, 9), unlockAt: at(2026, 10, 20), updatedAt: at(2026, 10, 21), comments: [{ id: 'c', at: at(2026, 10, 22), text: 'x' }] })
    const ids = assignmentUpdates([a, { ...a, id: '2', key: 'c1:2' }]).map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('updatesForDay', () => {
  const ev = (id: string, when: string, over: Partial<UpdateEvent> = {}): UpdateEvent => ({
    id,
    kind: 'announcement',
    at: when,
    title: id,
    courseId: 'c1',
    courseName: 'CSE 142',
    url: 'https://canvas.uw.edu/x',
    ...over
  })

  it('keeps only the day and lists the newest first', () => {
    const events = [
      ev('before', at(2026, 10, 28, 23, 59)),
      ev('morning', at(2026, 10, 29, 8, 0)),
      ev('midnight', at(2026, 10, 29, 0, 0)),
      ev('evening', at(2026, 10, 29, 20, 30)),
      ev('after', at(2026, 10, 30, 0, 0))
    ]
    expect(updatesForDay(events, '2026-10-29').map((e) => e.id)).toEqual(['evening', 'morning', 'midnight'])
  })

  it('orders simultaneous events the same way every time', () => {
    const t = at(2026, 10, 29, 9)
    const a = ev('a', t, { courseName: 'B' })
    const b = ev('b', t, { courseName: 'A' })
    expect(updatesForDay([a, b], '2026-10-29').map((e) => e.id)).toEqual(['b', 'a'])
    expect(updatesForDay([b, a], '2026-10-29').map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('returns nothing for a quiet day and does not change its input', () => {
    const input = [ev('x', at(2026, 10, 1, 9))]
    expect(updatesForDay(input, '2026-10-29')).toEqual([])
    expect(input).toHaveLength(1)
  })
})

describe('UPDATE_KINDS', () => {
  it('labels every kind', () => {
    for (const info of Object.values(UPDATE_KINDS)) expect(info.label.length).toBeGreaterThan(0)
    expect(Object.keys(UPDATE_KINDS)).toHaveLength(11)
  })
})
