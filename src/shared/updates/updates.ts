import { formatGrade } from '../assignments/format'
import type { AssignmentView } from '../assignments/types'
import { dayRange } from '../daily/assignments'

export type UpdateKind =
  | 'graded'
  | 'grade-posted'
  | 'comment'
  | 'available'
  | 'assignment-updated'
  | 'announcement'
  | 'discussion'
  | 'discussion-reply'
  | 'file'
  | 'page'

/** One thing that happened, shown in the Daily view's Updates column. */
export interface UpdateEvent {
  id: string
  kind: UpdateKind
  /** ISO time it happened. */
  at: string
  /** Name of the assignment, announcement, file, ... */
  title: string
  courseId: string
  courseName: string
  /** Where to open it in Canvas. */
  url: string
  /** Extra line: a comment's text, a grade, "New". */
  detail?: string
}

/** Events fetched per course (announcements, discussions, files, pages). */
export interface CourseUpdates {
  events: UpdateEvent[]
  /** Problems that should be visible; sources a course does not offer (files turned off) are not errors. */
  errors: { courseName: string; source: string; message: string }[]
  /** Events before this time were not loaded. */
  since: string
  /** When these were loaded from Canvas. */
  fetchedAt: string
}

export type UpdateTone = 'grade' | 'comment' | 'schedule' | 'post' | 'material'

export const UPDATE_KINDS: Record<UpdateKind, { label: string; tone: UpdateTone }> = {
  graded: { label: 'Graded', tone: 'grade' },
  'grade-posted': { label: 'Grade posted', tone: 'grade' },
  comment: { label: 'Comment', tone: 'comment' },
  available: { label: 'Available', tone: 'schedule' },
  'assignment-updated': { label: 'Assignment updated', tone: 'schedule' },
  announcement: { label: 'Announcement', tone: 'post' },
  discussion: { label: 'Discussion', tone: 'post' },
  'discussion-reply': { label: 'New reply', tone: 'post' },
  file: { label: 'File', tone: 'material' },
  page: { label: 'Page', tone: 'material' }
}

/** A grade entered and released within this long of each other counts as one event. */
const SAME_MOMENT_MS = 60_000

const ms = (iso: string): number => new Date(iso).getTime()

/**
 * Events that come from the assignments already loaded: graded, grade posted,
 * teacher comments, made available, and assignment edited. All dates, all
 * courses; use `updatesForDay` to pick a day.
 */
export function assignmentUpdates(items: readonly AssignmentView[]): UpdateEvent[] {
  const out: UpdateEvent[] = []
  for (const a of items) {
    const base = { title: a.name, courseId: a.courseId, courseName: a.courseName, url: a.htmlUrl }
    const add = (kind: UpdateKind, at: string, detail?: string): void => {
      out.push({ id: `${kind}:${a.key}:${at}`, kind, at, ...base, ...(detail ? { detail } : {}) })
    }

    const grade = a.score !== null || a.grade !== null ? formatGrade(a) : undefined
    if (a.gradedAt && a.postedAt && Math.abs(ms(a.gradedAt) - ms(a.postedAt)) <= SAME_MOMENT_MS) {
      add('graded', a.postedAt, grade) // entered and released together
    } else {
      if (a.gradedAt) add('graded', a.gradedAt)
      if (a.postedAt) add('grade-posted', a.postedAt, grade)
    }

    for (const c of a.comments ?? []) add('comment', c.at, c.text || undefined)
    if (a.unlockAt) add('available', a.unlockAt)
    if (a.updatedAt) add('assignment-updated', a.updatedAt)
  }
  return out
}

/** The events that happened on `date` (YYYY-MM-DD, local), newest first. */
export function updatesForDay(events: readonly UpdateEvent[], date: string): UpdateEvent[] {
  const { from, to } = dayRange(date)
  const f = from.getTime()
  const t = to.getTime()
  return events
    .filter((e) => ms(e.at) >= f && ms(e.at) < t)
    .sort((a, b) => ms(b.at) - ms(a.at) || a.courseName.localeCompare(b.courseName) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
}
