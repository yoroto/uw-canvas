import { deriveStatus } from '../assignments/status'
import type { AssignmentView } from '../assignments/types'

export type GradeSort = 'postedAt' | 'gradedAt' | 'lastCommentAt'

export const DEFAULT_GRADE_SORT: GradeSort = 'postedAt'

export const GRADE_SORTS: { key: GradeSort; label: string; description: string }[] = [
  { key: 'postedAt', label: 'Posted', description: 'When the grade was released to you' },
  { key: 'gradedAt', label: 'Graded', description: 'When the teacher entered the grade' },
  { key: 'lastCommentAt', label: 'Last comment', description: 'When the teacher last commented' }
]

const ms = (iso: string | null): number | null => (iso ? new Date(iso).getTime() : null)

/** Newest first; missing dates go last. */
const newestFirst = (a: string | null, b: string | null): number => {
  const ta = ms(a)
  const tb = ms(b)
  if (ta === null || tb === null) return (ta === null ? 1 : 0) - (tb === null ? 1 : 0)
  return tb - ta
}

/**
 * Graded assignments only (excused work and ungraded work are left out),
 * most recent first by the chosen date. Ties and missing dates fall back to
 * the other dates, then to course, name and key, so the order is stable.
 */
export function listGraded(items: readonly AssignmentView[], now: Date, sort: GradeSort = DEFAULT_GRADE_SORT): AssignmentView[] {
  const tieBreakers: GradeSort[] = (['postedAt', 'gradedAt', 'lastCommentAt'] as const).filter((k) => k !== sort)
  return items
    .filter((i) => deriveStatus(i, now).primary === 'graded')
    .sort(
      (a, b) =>
        newestFirst(a[sort], b[sort]) ||
        tieBreakers.reduce((r, k) => r || newestFirst(a[k], b[k]), 0) ||
        a.courseName.localeCompare(b.courseName) ||
        a.name.localeCompare(b.name) ||
        a.key.localeCompare(b.key)
    )
}
