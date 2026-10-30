import type { AssignmentComment, AssignmentView, AssignmentsResult, FailedCourse } from '../../shared/assignments/types'
import type { Course } from '../../shared/types'
import { CanvasError } from '../errors'
import type { CanvasClient } from './CanvasClient'
import { listActiveCourses } from './courses'

interface RawSubmission {
  workflow_state?: string
  submitted_at?: string | null
  graded_at?: string | null
  posted_at?: string | null
  score?: number | null
  grade?: string | null
  late?: boolean
  missing?: boolean
  excused?: boolean | null
}

interface RawAssignment {
  id: string
  name: string
  html_url: string
  due_at: string | null
  unlock_at: string | null
  lock_at: string | null
  updated_at?: string | null
  points_possible: number | null
  grading_type?: string
  submission_types?: string[]
  published?: boolean
  workflow_state?: string
  submission?: RawSubmission | null
}

export interface RawComment {
  id: string
  author_id: string
  created_at: string
  comment?: string | null
}

/** One entry of GET /courses/:id/students/submissions (only what we read). */
interface RawSubmissionWithComments {
  assignment_id: string
  submission_comments?: RawComment[] | null
}

export interface CommentSummary {
  count: number
  lastId: string | null
  lastAt: string | null
  /** Oldest first. */
  items: AssignmentComment[]
}

type CourseRef = Pick<Course, 'id'> & { name: string }

/** Comments written by someone other than `selfId` (the student's own notes are not feedback). */
export function summariseComments(comments: RawComment[] | null | undefined, selfId: string | null): CommentSummary {
  const others = (comments ?? []).filter((c) => c.author_id !== selfId)
  const last = others.reduce<RawComment | null>(
    (best, c) => (best === null || new Date(c.created_at) > new Date(best.created_at) ? c : best),
    null
  )
  const items = others
    .map((c) => ({ id: c.id, at: c.created_at, text: (c.comment ?? '').trim().slice(0, 200) }))
    .sort((a, b) => a.at.localeCompare(b.at))
  return { count: others.length, lastId: last?.id ?? null, lastAt: last?.created_at ?? null, items }
}

/** `comments` null/undefined = could not be loaded (fields become null = unknown). */
export function normaliseAssignment(raw: RawAssignment, course: CourseRef, comments?: CommentSummary | null): AssignmentView {
  const s = raw.submission ?? {}
  return {
    key: `${course.id}:${raw.id}`,
    id: raw.id,
    courseId: course.id,
    courseName: course.name,
    name: raw.name,
    htmlUrl: raw.html_url,
    dueAt: raw.due_at ?? null,
    unlockAt: raw.unlock_at ?? null,
    lockAt: raw.lock_at ?? null,
    updatedAt: raw.updated_at ?? null,
    pointsPossible: raw.points_possible ?? null,
    gradingType: raw.grading_type ?? 'points',
    submissionTypes: raw.submission_types ?? [],
    workflowState: s.workflow_state ?? 'unsubmitted',
    submittedAt: s.submitted_at ?? null,
    gradedAt: s.graded_at ?? null,
    postedAt: s.posted_at ?? null,
    score: s.score ?? null,
    grade: s.grade ?? null,
    late: s.late ?? false,
    missing: s.missing ?? false,
    excused: s.excused ?? false,
    commentCount: comments ? comments.count : null,
    lastCommentId: comments ? comments.lastId : null,
    lastCommentAt: comments ? comments.lastAt : null,
    comments: comments ? comments.items : null
  }
}

const isVisible = (a: RawAssignment): boolean => a.published !== false && a.workflow_state !== 'deleted'

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const isExpired = (e: unknown): e is CanvasError => e instanceof CanvasError && e.code === 'unauthenticated'

// For every available course: assignments with the user's submission
// (GET .../assignments) plus the comments on those submissions
// (GET .../students/submissions, since the assignments endpoint cannot include
// comments). A failing course is reported, not fatal, except when the session
// has expired. If only the comments fail, assignments are kept with unknown comments.
export async function listAssignments(client: CanvasClient): Promise<AssignmentsResult> {
  const courses = await listActiveCourses(client)
  const selfId = (await client.get<{ id: string }>('/api/v1/users/self')).id

  const settled = await Promise.all(
    courses.map(async (course) => {
      const [assignments, submissions] = await Promise.allSettled([
        client.getAll<RawAssignment>(`/api/v1/courses/${course.id}/assignments`, {
          'include[]': ['submission'],
          order_by: 'due_at'
        }),
        client.getAll<RawSubmissionWithComments>(`/api/v1/courses/${course.id}/students/submissions`, {
          'include[]': ['submission_comments']
        })
      ])
      return { course, assignments, submissions }
    })
  )

  const items: AssignmentView[] = []
  const failedCourses: FailedCourse[] = []
  for (const { course, assignments, submissions } of settled) {
    for (const r of [assignments, submissions]) if (r.status === 'rejected' && isExpired(r.reason)) throw r.reason

    if (assignments.status === 'rejected') {
      failedCourses.push({ courseId: course.id, courseName: course.name, message: errorText(assignments.reason) })
      continue
    }

    const commentsByAssignment = new Map<string, CommentSummary>()
    if (submissions.status === 'fulfilled') {
      for (const s of submissions.value) commentsByAssignment.set(s.assignment_id, summariseComments(s.submission_comments, selfId))
    } else {
      failedCourses.push({
        courseId: course.id,
        courseName: course.name,
        message: `Comments unavailable: ${errorText(submissions.reason)}`
      })
    }

    for (const raw of assignments.value.filter(isVisible)) {
      // Submissions listed without comments (none yet) still count as "0 comments".
      const comments = submissions.status === 'fulfilled' ? (commentsByAssignment.get(raw.id) ?? summariseComments([], selfId)) : null
      items.push(normaliseAssignment(raw, course, comments))
    }
  }
  return { items, failedCourses }
}
