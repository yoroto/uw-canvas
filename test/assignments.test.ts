import { describe, expect, it } from 'vitest'
import { listAssignments, normaliseAssignment, summariseComments } from '../src/main/canvas/assignments'
import type { CanvasClient } from '../src/main/canvas/CanvasClient'
import { CanvasError } from '../src/main/errors'
import raw from './fixtures/assignments.json'

const course = { id: '1033000001', name: 'CSE 142' }

describe('normaliseAssignment', () => {
  it('maps a graded, late submission', () => {
    const a = normaliseAssignment(raw.gradedLate, course)
    expect(a).toMatchObject({
      key: '1033000001:5001',
      courseName: 'CSE 142',
      dueAt: '2026-10-20T06:59:00Z',
      submittedAt: '2026-10-21T01:00:00Z',
      gradedAt: '2026-10-22T18:00:00Z',
      postedAt: '2026-10-22T18:05:00Z',
      score: 18,
      pointsPossible: 20,
      late: true,
      workflowState: 'graded'
    })
  })

  it('maps a pass/fail incomplete', () => {
    const a = normaliseAssignment(raw.passFailIncomplete, course)
    expect(a).toMatchObject({ gradingType: 'pass_fail', grade: 'incomplete', score: 0 })
  })

  it('defaults a missing submission and a null due date', () => {
    const a = normaliseAssignment(raw.noSubmissionNoDue, course)
    expect(a).toMatchObject({ dueAt: null, workflowState: 'unsubmitted', submittedAt: null, postedAt: null, score: null, excused: false, late: false })
  })

  it('keeps long sharded ids as strings', () => {
    expect(normaliseAssignment(raw.gradedLate, course).id).toBe('5001')
    expect(normaliseAssignment(raw.gradedLate, course).courseId).toBe('1033000001')
  })
})

// Stub client: routes by path, optionally failing one course's assignments or comments.
const SELF = '900'
const comments = [
  { id: 'c1', author_id: SELF, created_at: '2026-10-22T10:00:00Z' },
  { id: 'c2', author_id: '77', created_at: '2026-10-22T11:00:00Z' },
  { id: 'c3', author_id: '77', created_at: '2026-10-23T09:00:00Z' }
]

function stubClient(failures: Record<string, Error> = {}, commentFailures: Record<string, Error> = {}): CanvasClient {
  return {
    get: async () => ({ id: SELF }),
    getAll: async (path: string) => {
      if (path === '/api/v1/courses') {
        return [
          { id: '1', name: 'CSE 142', workflow_state: 'available' },
          { id: '2', name: 'MATH 126', workflow_state: 'available' },
          { id: '3', name: 'Old course', workflow_state: 'completed' },
          { id: '4', access_restricted_by_date: true }
        ]
      }
      const [, , , , id, kind] = path.split('/')
      if (kind === 'students') {
        if (commentFailures[id]) throw commentFailures[id]
        return [{ assignment_id: '5001', submission_comments: comments }]
      }
      if (failures[id]) throw failures[id]
      return [raw.gradedLate, { ...raw.unpublished }, raw.noSubmissionNoDue]
    }
  } as unknown as CanvasClient
}

describe('summariseComments', () => {
  it("ignores the student's own comments and finds the latest other one", () => {
    expect(summariseComments(comments, SELF)).toEqual({ count: 2, lastId: 'c3', lastAt: '2026-10-23T09:00:00Z' })
  })

  it('handles none / null', () => {
    expect(summariseComments([], SELF)).toEqual({ count: 0, lastId: null, lastAt: null })
    expect(summariseComments(null, SELF)).toEqual({ count: 0, lastId: null, lastAt: null })
  })
})

describe('listAssignments', () => {
  it('fetches available courses only and drops unpublished assignments', async () => {
    const res = await listAssignments(stubClient())
    expect(res.failedCourses).toEqual([])
    expect(res.items.map((i) => i.key).sort()).toEqual(['1:5001', '1:5003', '2:5001', '2:5003'])
  })

  it('attaches other people\'s comments, and zero for assignments without any', async () => {
    const res = await listAssignments(stubClient())
    const byKey = Object.fromEntries(res.items.map((i) => [i.key, i]))
    expect(byKey['1:5001']).toMatchObject({ commentCount: 2, lastCommentId: 'c3' })
    expect(byKey['1:5003']).toMatchObject({ commentCount: 0, lastCommentId: null })
  })

  it('reports a failing course without losing the others', async () => {
    const res = await listAssignments(stubClient({ '2': new CanvasError('http', 'boom', 500) }))
    expect(res.items.every((i) => i.courseId === '1')).toBe(true)
    expect(res.failedCourses).toEqual([{ courseId: '2', courseName: 'MATH 126', message: 'boom' }])
  })

  it('keeps assignments, with unknown comments, when only the comments call fails', async () => {
    const res = await listAssignments(stubClient({}, { '2': new CanvasError('http', 'nope', 403) }))
    const math = res.items.filter((i) => i.courseId === '2')
    expect(math).toHaveLength(2)
    expect(math.every((i) => i.commentCount === null && i.lastCommentId === null)).toBe(true)
    expect(res.failedCourses).toEqual([{ courseId: '2', courseName: 'MATH 126', message: 'Comments unavailable: nope' }])
  })

  it('rethrows an expired session instead of hiding it', async () => {
    await expect(listAssignments(stubClient({ '1': new CanvasError('unauthenticated', 'expired', 401) }))).rejects.toMatchObject({
      code: 'unauthenticated'
    })
    await expect(listAssignments(stubClient({}, { '1': new CanvasError('unauthenticated', 'expired', 401) }))).rejects.toMatchObject({
      code: 'unauthenticated'
    })
  })
})
