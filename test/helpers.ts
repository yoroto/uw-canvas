import type { AssignmentView } from '../src/shared/assignments/types'

/** A not-yet-submitted, ungraded assignment; override what each test cares about. */
export function makeAssignment(over: Partial<AssignmentView> = {}): AssignmentView {
  const id = over.id ?? '1'
  const courseId = over.courseId ?? 'c1'
  return {
    key: `${courseId}:${id}`,
    id,
    courseId,
    courseName: 'CSE 142',
    name: 'Homework',
    htmlUrl: `https://canvas.uw.edu/courses/${courseId}/assignments/${id}`,
    dueAt: null,
    unlockAt: null,
    lockAt: null,
    updatedAt: null,
    pointsPossible: 10,
    gradingType: 'points',
    submissionTypes: ['online_upload'],
    workflowState: 'unsubmitted',
    submittedAt: null,
    gradedAt: null,
    postedAt: null,
    score: null,
    grade: null,
    late: false,
    missing: false,
    excused: false,
    commentCount: 0,
    lastCommentId: null,
    lastCommentAt: null,
    comments: [],
    ...over
  }
}

/** Local-time ISO string, so tests do not depend on the machine's time zone. */
export const at = (y: number, m: number, d: number, h = 0, min = 0): string => new Date(y, m - 1, d, h, min).toISOString()
