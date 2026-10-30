import { describe, expect, it } from 'vitest'
import { deriveStatus, type Status } from '../src/shared/assignments/status'
import type { AssignmentView } from '../src/shared/assignments/types'
import { at, makeAssignment } from './helpers'

const now = new Date(2026, 9, 29, 12, 0) // Oct 29 2026, 12:00 local

const cases: { name: string; over: Partial<AssignmentView>; expected: Status }[] = [
  { name: 'excused wins over everything', over: { excused: true, workflowState: 'graded', score: 5 }, expected: { primary: 'excused', flags: [] } },
  { name: 'graded', over: { workflowState: 'graded', score: 9, gradedAt: at(2026, 10, 28), submittedAt: at(2026, 10, 27) }, expected: { primary: 'graded', flags: [] } },
  { name: 'graded and late keeps the late flag', over: { workflowState: 'graded', gradedAt: at(2026, 10, 28), late: true }, expected: { primary: 'graded', flags: ['late'] } },
  { name: 'graded on-paper assignment is still graded', over: { submissionTypes: ['on_paper'], gradedAt: at(2026, 10, 28), score: 8 }, expected: { primary: 'graded', flags: [] } },
  { name: 'no submission expected', over: { submissionTypes: ['none'], dueAt: at(2026, 10, 20) }, expected: { primary: 'no-submission', flags: [] } },
  { name: 'submitted on time', over: { workflowState: 'submitted', submittedAt: at(2026, 10, 28), dueAt: at(2026, 10, 30) }, expected: { primary: 'submitted', flags: [] } },
  { name: 'submitted late', over: { workflowState: 'submitted', submittedAt: at(2026, 10, 28), dueAt: at(2026, 10, 27), late: true }, expected: { primary: 'submitted', flags: ['late'] } },
  { name: 'pending review', over: { workflowState: 'pending_review', submittedAt: at(2026, 10, 28) }, expected: { primary: 'submitted', flags: ['pending-review'] } },
  { name: 'missing via Canvas flag', over: { missing: true, dueAt: at(2026, 10, 28) }, expected: { primary: 'missing', flags: [] } },
  { name: 'missing inferred from past due date', over: { dueAt: at(2026, 10, 28, 23, 59) }, expected: { primary: 'missing', flags: [] } },
  { name: 'not open yet', over: { unlockAt: at(2026, 11, 2), dueAt: at(2026, 11, 9) }, expected: { primary: 'not-open', flags: [] } },
  { name: 'due within 48h', over: { dueAt: at(2026, 10, 29, 15) }, expected: { primary: 'due-soon', flags: [] } },
  { name: 'due later', over: { dueAt: at(2026, 11, 20) }, expected: { primary: 'open', flags: [] } },
  { name: 'no due date, unsubmitted', over: {}, expected: { primary: 'open', flags: [] } }
]

describe('deriveStatus', () => {
  it.each(cases)('$name', ({ over, expected }) => {
    expect(deriveStatus(makeAssignment(over), now)).toEqual(expected)
  })
})
