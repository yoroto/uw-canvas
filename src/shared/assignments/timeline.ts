import type { AssignmentView } from './types'

export type TimelineEntry =
  | { type: 'day'; key: string; dayKey: string }
  | { type: 'assignment'; key: string; item: AssignmentView }
  | { type: 'now'; key: 'now' }
  | { type: 'noDueDate'; key: 'no-due-date' }

/** Local calendar day as YYYY-MM-DD. */
export function dayKeyOf(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function compare(a: AssignmentView, b: AssignmentView): number {
  const da = new Date(a.dueAt as string).getTime()
  const db = new Date(b.dueAt as string).getTime()
  return da - db || a.courseName.localeCompare(b.courseName) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key)
}

/**
 * Chronological list: day headers, assignments, one "now" divider placed
 * before the first assignment due at or after `now`, then undated items.
 */
export function buildTimeline(items: AssignmentView[], now: Date): TimelineEntry[] {
  const dated = items.filter((i) => i.dueAt).sort(compare)
  const undated = items.filter((i) => !i.dueAt).sort((a, b) => a.courseName.localeCompare(b.courseName) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key))

  const out: TimelineEntry[] = []
  let nowPlaced = false
  let currentDay = ''

  for (const item of dated) {
    const due = new Date(item.dueAt as string)
    if (!nowPlaced && due.getTime() >= now.getTime()) {
      out.push({ type: 'now', key: 'now' })
      nowPlaced = true
    }
    const day = dayKeyOf(due)
    if (day !== currentDay) {
      out.push({ type: 'day', key: `day:${day}`, dayKey: day })
      currentDay = day
    }
    out.push({ type: 'assignment', key: item.key, item })
  }
  if (!nowPlaced) out.push({ type: 'now', key: 'now' })

  if (undated.length > 0) {
    out.push({ type: 'noDueDate', key: 'no-due-date' })
    for (const item of undated) out.push({ type: 'assignment', key: item.key, item })
  }
  return out
}
