// Normalised assignment + the user's submission, as the UI and tests see it.
// IDs are strings (see Course in ../types.ts).

/** A comment by someone other than the student (usually teacher feedback). */
export interface AssignmentComment {
  id: string
  /** ISO time the comment was posted. */
  at: string
  /** The start of the comment text (up to 200 characters). */
  text: string
}

export interface AssignmentView {
  /** `${courseId}:${id}`, unique across courses. */
  key: string
  id: string
  courseId: string
  courseName: string
  name: string
  htmlUrl: string
  dueAt: string | null
  unlockAt: string | null
  lockAt: string | null
  /** When the assignment itself was last modified (Canvas `updated_at`). */
  updatedAt: string | null
  pointsPossible: number | null
  /** points | pass_fail | percent | letter_grade | gpa_scale | not_graded */
  gradingType: string
  submissionTypes: string[]

  // From the user's submission (all optional in Canvas, normalised here).
  workflowState: string
  submittedAt: string | null
  gradedAt: string | null
  /** When the grade was released to the student; null if not posted. */
  postedAt: string | null
  score: number | null
  grade: string | null
  late: boolean
  missing: boolean
  excused: boolean

  // Comments by other people (teacher feedback). null = could not be loaded.
  commentCount: number | null
  lastCommentId: string | null
  lastCommentAt: string | null
  /** The comments with their times, oldest first. null = could not be loaded. */
  comments: AssignmentComment[] | null
}

/** What the user has already seen of a submission; a difference means "changed since last looked". */
export interface Fingerprint {
  state: string
  gradedAt: string | null
  score: number | null
  grade: string | null
  /** null = unknown (comments failed to load). */
  commentCount: number | null
  lastCommentId: string | null
}

export interface FailedCourse {
  courseId: string
  courseName: string
  message: string
}

export interface AssignmentsResult {
  items: AssignmentView[]
  failedCourses: FailedCourse[]
}

/** What `assignments:list` returns: the data plus the persisted "seen" fingerprints. */
export interface AssignmentsPayload extends AssignmentsResult {
  seen: Record<string, Fingerprint>
}
