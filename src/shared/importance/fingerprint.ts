import type { AssignmentView, Fingerprint } from '../assignments/types'

export type ChangeKind = 'feedback' | 'grade'

export function fingerprintOf(a: AssignmentView): Fingerprint {
  return {
    state: a.workflowState,
    gradedAt: a.gradedAt,
    score: a.score,
    grade: a.grade,
    commentCount: a.commentCount,
    lastCommentId: a.lastCommentId
  }
}

/**
 * What changed since the user last looked, or null. Unknown comment info
 * (null on either side) is never counted as a change.
 */
export function describeChange(a: AssignmentView, seen: Fingerprint | undefined): ChangeKind | null {
  if (!seen) return null
  const cur = fingerprintOf(a)

  const commentsKnown = cur.commentCount !== null && seen.commentCount !== null
  if (commentsKnown && (cur.commentCount !== seen.commentCount || cur.lastCommentId !== seen.lastCommentId)) {
    return 'feedback'
  }
  if (cur.state !== seen.state || cur.gradedAt !== seen.gradedAt || cur.score !== seen.score || cur.grade !== seen.grade) {
    return 'grade'
  }
  return null
}

/** The fingerprint to store when the user marks `cur` as seen; keeps old comment info if the new one is unknown. */
export function mergeFingerprint(prev: Fingerprint | undefined, cur: Fingerprint): Fingerprint {
  if (cur.commentCount !== null || !prev) return cur
  return { ...cur, commentCount: prev.commentCount, lastCommentId: prev.lastCommentId }
}
