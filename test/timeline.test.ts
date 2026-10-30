import { describe, expect, it } from 'vitest'
import { buildTimeline, type TimelineEntry } from '../src/shared/assignments/timeline'
import { at, makeAssignment } from './helpers'

const now = new Date(2026, 9, 29, 12, 0)

// Compact view of a timeline: day:YYYY-MM-DD | now | undated | assignment id
const shape = (entries: TimelineEntry[]): string[] =>
  entries.map((e) => (e.type === 'day' ? `day:${e.dayKey}` : e.type === 'assignment' ? e.item.id : e.type === 'noDueDate' ? 'undated' : 'now'))

describe('buildTimeline', () => {
  it('places the now divider between past and future items, with day headers', () => {
    const items = [
      makeAssignment({ id: 'future', dueAt: at(2026, 10, 30, 9) }),
      makeAssignment({ id: 'past', dueAt: at(2026, 10, 28, 9) }),
      makeAssignment({ id: 'later-today', dueAt: at(2026, 10, 29, 18) }),
      makeAssignment({ id: 'earlier-today', dueAt: at(2026, 10, 29, 8) })
    ]
    expect(shape(buildTimeline(items, now))).toEqual([
      'day:2026-10-28', 'past',
      'day:2026-10-29', 'earlier-today', 'now', 'later-today',
      'day:2026-10-30', 'future'
    ])
  })

  it('puts now at the end when everything is past', () => {
    const items = [makeAssignment({ id: 'a', dueAt: at(2026, 10, 1, 9) })]
    expect(shape(buildTimeline(items, now))).toEqual(['day:2026-10-01', 'a', 'now'])
  })

  it('puts now at the start when everything is in the future', () => {
    const items = [makeAssignment({ id: 'a', dueAt: at(2026, 12, 1, 9) })]
    expect(shape(buildTimeline(items, now))).toEqual(['now', 'day:2026-12-01', 'a'])
  })

  it('still shows the now divider with no items', () => {
    expect(shape(buildTimeline([], now))).toEqual(['now'])
  })

  it('moves assignments without a due date to a section at the bottom', () => {
    const items = [makeAssignment({ id: 'u' }), makeAssignment({ id: 'a', dueAt: at(2026, 11, 3, 9) })]
    expect(shape(buildTimeline(items, now))).toEqual(['now', 'day:2026-11-03', 'a', 'undated', 'u'])
  })

  it('treats an item due exactly now as upcoming', () => {
    const items = [makeAssignment({ id: 'a', dueAt: now.toISOString() })]
    expect(shape(buildTimeline(items, now))).toEqual(['now', 'day:2026-10-29', 'a'])
  })

  it('is stable regardless of input order (ties by course, name, key)', () => {
    const due = at(2026, 11, 3, 9)
    const a = makeAssignment({ id: '1', courseId: 'c1', courseName: 'ART 101', name: 'B', dueAt: due })
    const b = makeAssignment({ id: '2', courseId: 'c2', courseName: 'ART 101', name: 'A', dueAt: due })
    const c = makeAssignment({ id: '3', courseId: 'c3', courseName: 'BIO 200', name: 'A', dueAt: due })
    const expected = shape(buildTimeline([a, b, c], now))
    expect(shape(buildTimeline([c, a, b], now))).toEqual(expected)
    expect(shape(buildTimeline([b, c, a], now))).toEqual(expected)
    expect(expected).toEqual(['now', 'day:2026-11-03', '2', '1', '3'])
  })
})
