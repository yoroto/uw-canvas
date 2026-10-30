import { deriveStatus, requiresSubmission } from '../assignments/status'
import type { AssignmentView } from '../assignments/types'
import { weekdayOf } from '../schedule/schedule'

/**
 * submitted: turned in, graded or excused (green check).
 * outstanding / past-due: still to turn in (orange / red "!").
 * no-submission: nothing to turn in online, so no warning (grey dash).
 */
export type AssignmentState = 'submitted' | 'outstanding' | 'past-due' | 'no-submission'

export interface DayAssignment {
  item: AssignmentView
  due: Date
  state: AssignmentState
}

export interface DayAssignments {
  /** Due on this day, shown at their deadline time. */
  timed: DayAssignment[]
  /** Due soon after this day (see `carryWindow`), also listed in the evening of this day. */
  carried: DayAssignment[]
}

/** The day's own range: [midnight, next midnight). */
export function dayRange(date: string): { from: Date; to: Date } {
  const [y, m, d] = date.split('-').map(Number)
  return { from: new Date(y, m - 1, d), to: new Date(y, m - 1, d + 1) }
}

/**
 * Deadlines after this day that are also shown on it, as [from, to):
 * Monday-Friday: tomorrow until 12:00 tomorrow.
 * Saturday/Sunday: the rest of the weekend until 12:00 Monday.
 */
export function carryWindow(date: string): { from: Date; to: Date } {
  const [y, m, d] = date.split('-').map(Number)
  const tomorrow = new Date(y, m - 1, d + 1)
  const day = weekdayOf(date)
  const noon = (daysAhead: number): Date => new Date(y, m - 1, d + daysAhead, 12)
  if (day === 'saturday') return { from: tomorrow, to: noon(2) }
  if (day === 'sunday') return { from: tomorrow, to: noon(1) }
  return { from: tomorrow, to: noon(1) }
}

export function isSubmitted(item: AssignmentView, now: Date): boolean {
  const primary = deriveStatus(item, now).primary
  return primary === 'submitted' || primary === 'graded' || primary === 'excused'
}

export function assignmentState(item: AssignmentView, now: Date): AssignmentState {
  if (isSubmitted(item, now)) return 'submitted'
  if (!requiresSubmission(item)) return 'no-submission'
  return new Date(item.dueAt as string).getTime() < now.getTime() ? 'past-due' : 'outstanding'
}

function describe(item: AssignmentView, now: Date): DayAssignment {
  return { item, due: new Date(item.dueAt as string), state: assignmentState(item, now) }
}

const byDue = (a: DayAssignment, b: DayAssignment): number =>
  a.due.getTime() - b.due.getTime() || a.item.courseName.localeCompare(b.item.courseName) || a.item.name.localeCompare(b.item.name) || a.item.key.localeCompare(b.item.key)

/** Assignments with a deadline on `date` (YYYY-MM-DD), plus the ones due soon after it. */
export function assignmentsForDay(items: readonly AssignmentView[], date: string, now: Date): DayAssignments {
  const day = dayRange(date)
  const carry = carryWindow(date)
  const timed: DayAssignment[] = []
  const carried: DayAssignment[] = []
  for (const item of items) {
    if (!item.dueAt) continue
    const t = new Date(item.dueAt).getTime()
    if (t >= day.from.getTime() && t < day.to.getTime()) timed.push(describe(item, now))
    else if (t >= carry.from.getTime() && t < carry.to.getTime()) carried.push(describe(item, now))
  }
  return { timed: timed.sort(byDue), carried: carried.sort(byDue) }
}
