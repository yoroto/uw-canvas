import { formatDuration, gradeTone, scorePercent } from '../assignments/format'
import { deriveStatus, type Status } from '../assignments/status'
import type { AssignmentView } from '../assignments/types'

export type ProblemKind = 'missing' | 'cross' | 'late' | 'low-score'

interface Ctx {
  item: AssignmentView
  status: Status
  now: Date
}

export interface ProblemDef {
  kind: ProblemKind
  title: string
  description: string
  matches(c: Ctx): boolean
  /** Short chip text for this problem on one item. */
  reason(c: Ctx): string
  /** Order of items inside the group. */
  compare(a: Ctx, b: Ctx): number
}

const ms = (iso: string | null): number | null => (iso ? new Date(iso).getTime() : null)
const notExcused = (c: Ctx): boolean => c.status.primary !== 'excused'

/**
 * The problem categories, in display order. To tweak: reorder, edit or add an
 * entry here; the view and the tests follow the array.
 */
export const PROBLEMS: ProblemDef[] = [
  {
    kind: 'missing',
    title: 'Missing',
    description: 'Past the deadline and nothing turned in. Most overdue first.',
    matches: (c) => c.status.primary === 'missing',
    reason: (c) => (c.item.dueAt ? `Overdue ${formatDuration(c.now.getTime() - new Date(c.item.dueAt).getTime())}` : 'Missing'),
    compare: (a, b) => (ms(a.item.dueAt) ?? Infinity) - (ms(b.item.dueAt) ?? Infinity)
  },
  {
    kind: 'cross',
    title: 'Incomplete',
    description: 'Pass/fail work marked incomplete (✗). Newest first.',
    matches: (c) => notExcused(c) && c.item.gradingType === 'pass_fail' && c.item.grade === 'incomplete',
    reason: () => 'Cross score',
    compare: (a, b) => (ms(b.item.gradedAt) ?? 0) - (ms(a.item.gradedAt) ?? 0)
  },
  {
    kind: 'late',
    title: 'Late',
    description: 'Turned in after the deadline. Most recent first.',
    matches: (c) => notExcused(c) && c.item.late,
    reason: (c) =>
      c.item.submittedAt && c.item.dueAt
        ? `Late ${formatDuration(new Date(c.item.submittedAt).getTime() - new Date(c.item.dueAt).getTime())}`
        : 'Late',
    compare: (a, b) => (ms(b.item.submittedAt) ?? 0) - (ms(a.item.submittedAt) ?? 0)
  },
  {
    kind: 'low-score',
    title: 'Red scores',
    description: 'Scored in the red (see GRADE_BANDS). Lowest first.',
    matches: (c) => notExcused(c) && c.item.gradingType !== 'pass_fail' && gradeTone(c.item) === 'red',
    reason: (c) => `Score ${Math.round(scorePercent(c.item) ?? 0)}%`,
    compare: (a, b) => (scorePercent(a.item) ?? 0) - (scorePercent(b.item) ?? 0) || (ms(b.item.gradedAt) ?? 0) - (ms(a.item.gradedAt) ?? 0)
  }
]

export interface ProblemEntry {
  item: AssignmentView
  /** One per matching category; the first is the group the item is listed under. */
  reasons: { kind: ProblemKind; text: string }[]
}

export interface ProblemGroup {
  kind: ProblemKind
  title: string
  description: string
  entries: ProblemEntry[]
}

/**
 * Only assignments with a problem, grouped by category in `defs` order. An
 * item is listed once, under its first matching category, and carries a
 * reason for every category it matches. Empty groups are left out.
 */
export function findProblems(items: readonly AssignmentView[], now: Date, defs: readonly ProblemDef[] = PROBLEMS): ProblemGroup[] {
  const buckets = new Map<ProblemKind, { ctx: Ctx; reasons: ProblemEntry['reasons'] }[]>()

  for (const item of items) {
    const ctx: Ctx = { item, status: deriveStatus(item, now), now }
    const matched = defs.filter((d) => d.matches(ctx))
    if (matched.length === 0) continue
    const list = buckets.get(matched[0].kind) ?? []
    list.push({ ctx, reasons: matched.map((d) => ({ kind: d.kind, text: d.reason(ctx) })) })
    buckets.set(matched[0].kind, list)
  }

  return defs.flatMap((def) => {
    const list = buckets.get(def.kind)
    if (!list) return []
    list.sort(
      (a, b) =>
        def.compare(a.ctx, b.ctx) ||
        a.ctx.item.courseName.localeCompare(b.ctx.item.courseName) ||
        a.ctx.item.name.localeCompare(b.ctx.item.name) ||
        a.ctx.item.key.localeCompare(b.ctx.item.key)
    )
    return [{ kind: def.kind, title: def.title, description: def.description, entries: list.map((l) => ({ item: l.ctx.item, reasons: l.reasons })) }]
  })
}
