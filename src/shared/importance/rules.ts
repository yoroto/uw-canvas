import { formatRelative } from '../assignments/format'
import type { Status, StatusKind } from '../assignments/status'
import type { AssignmentView } from '../assignments/types'
import type { ChangeKind } from './fingerprint'

export type Zone = 'toDo' | 'turnedIn'

const TURNED_IN: ReadonlySet<StatusKind> = new Set(['graded', 'submitted', 'excused', 'no-submission'])

export function zoneOf(status: Status): Zone {
  return TURNED_IN.has(status.primary) ? 'turnedIn' : 'toDo'
}

export interface RuleContext {
  item: AssignmentView
  status: Status
  now: Date
  change: ChangeKind | null
}

export interface RuleDef {
  id: string
  label: string
  description: string
  zone: Zone
  matches(c: RuleContext): boolean
  /** Short text for the row chip. */
  reason(c: RuleContext): string
  /** Order among items matched by this rule. */
  compare(a: RuleContext, b: RuleContext): number
}

const ms = (iso: string | null): number | null => (iso ? new Date(iso).getTime() : null)
const dueAsc = (a: RuleContext, b: RuleContext): number => (ms(a.item.dueAt) ?? Infinity) - (ms(b.item.dueAt) ?? Infinity)
const gradedDesc = (a: RuleContext, b: RuleContext): number => (ms(b.item.gradedAt) ?? 0) - (ms(a.item.gradedAt) ?? 0)
const changedAt = (c: RuleContext): number => Math.max(ms(c.item.gradedAt) ?? 0, ms(c.item.lastCommentAt) ?? 0)

/**
 * Every ranking rule lives here. To add one: append an entry; it shows up in
 * the Importance filter automatically. Default order = array order (per zone).
 */
export const RULES: RuleDef[] = [
  {
    id: 'overdue',
    label: 'Overdue, not turned in',
    description: 'Past the deadline and nothing submitted. Most overdue first.',
    zone: 'toDo',
    matches: (c) => c.status.primary === 'missing',
    reason: (c) => {
      if (!c.item.dueAt) return 'Missing'
      const rel = formatRelative(new Date(c.item.dueAt), c.now).replace(/ ago$/, '')
      return rel === 'now' ? 'Overdue' : `Overdue ${rel}`
    },
    compare: dueAsc
  },
  {
    id: 'due-soon',
    label: 'Due soon',
    description: 'Due within 48 hours and not turned in. Soonest first.',
    zone: 'toDo',
    matches: (c) => c.status.primary === 'due-soon',
    reason: (c) => `Due ${formatRelative(new Date(c.item.dueAt as string), c.now)}`,
    compare: dueAsc
  },
  {
    id: 'new-feedback',
    label: 'New feedback or grade',
    description: 'The teacher commented or graded since you last marked it seen. Newest first.',
    zone: 'turnedIn',
    matches: (c) => c.change !== null,
    reason: (c) => (c.change === 'feedback' ? 'New feedback' : 'New grade'),
    compare: (a, b) => changedAt(b) - changedAt(a)
  },
  {
    id: 'cross-score',
    label: 'Cross in score (incomplete)',
    description: 'A pass/fail assignment marked incomplete (✗). Newest first.',
    zone: 'turnedIn',
    matches: (c) => c.item.gradingType === 'pass_fail' && c.item.grade === 'incomplete',
    reason: () => 'Cross score',
    compare: gradedDesc
  }
]

export const RULES_BY_ID: ReadonlyMap<string, RuleDef> = new Map(RULES.map((r) => [r.id, r]))
