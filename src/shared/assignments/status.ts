import type { AssignmentView } from './types'

export type StatusKind =
  | 'excused'
  | 'graded'
  | 'no-submission'
  | 'submitted'
  | 'missing'
  | 'not-open'
  | 'due-soon'
  | 'open'

export type StatusFlag = 'late' | 'pending-review'

export interface Status {
  primary: StatusKind
  flags: StatusFlag[]
}

export const DUE_SOON_MS = 48 * 60 * 60 * 1000

// Submission types that never produce a submission in Canvas.
const NO_SUBMISSION_TYPES = new Set(['none', 'on_paper', 'not_graded'])

const time = (iso: string | null): number | null => (iso ? new Date(iso).getTime() : null)

export function deriveStatus(a: AssignmentView, now: Date): Status {
  const t = now.getTime()
  const due = time(a.dueAt)
  const unlock = time(a.unlockAt)
  const flags: StatusFlag[] = []
  if (a.late) flags.push('late')
  if (a.workflowState === 'pending_review') flags.push('pending-review')

  if (a.excused) return { primary: 'excused', flags: [] }

  if (a.workflowState === 'graded' || a.gradedAt) return { primary: 'graded', flags }

  if (a.submissionTypes.length > 0 && a.submissionTypes.every((s) => NO_SUBMISSION_TYPES.has(s))) {
    return { primary: 'no-submission', flags: [] }
  }

  if (a.submittedAt || a.workflowState === 'submitted' || a.workflowState === 'pending_review') {
    return { primary: 'submitted', flags }
  }

  // Not submitted from here on.
  if (a.missing || (due !== null && due < t)) return { primary: 'missing', flags: [] }
  if (unlock !== null && unlock > t) return { primary: 'not-open', flags: [] }
  if (due !== null && due - t < DUE_SOON_MS) return { primary: 'due-soon', flags: [] }
  return { primary: 'open', flags: [] }
}
