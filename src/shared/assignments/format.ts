import type { AssignmentView } from './types'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const spanText = (abs: number): string => (abs < HOUR ? `${Math.floor(abs / MIN)}m` : abs < 48 * HOUR ? `${Math.floor(abs / HOUR)}h` : `${Math.floor(abs / DAY)}d`)

/** Length of a time span: "<1m", "45m", "5h", "3d". */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms)
  return abs < MIN ? '<1m' : spanText(abs)
}

/** "in 3h", "2d ago", "now". */
export function formatRelative(target: Date, now: Date): string {
  const diff = target.getTime() - now.getTime()
  const abs = Math.abs(diff)
  if (abs < MIN) return 'now'
  const text = spanText(abs)
  return diff > 0 ? `in ${text}` : `${text} ago`
}

export type GradeTone = 'red' | 'orange' | 'yellow' | 'green'

/** Score percentage at or above `min` gets `tone`; anything lower is red. Tune the bands here. */
export const GRADE_BANDS: { min: number; tone: GradeTone }[] = [
  { min: 90, tone: 'green' },
  { min: 70, tone: 'yellow' },
  { min: 50, tone: 'orange' }
]

/** Score as a percentage of points possible; null when ungraded or points are unknown/zero. */
export function scorePercent(a: AssignmentView): number | null {
  if (a.score === null || a.pointsPossible === null || a.pointsPossible <= 0) return null
  return (a.score / a.pointsPossible) * 100
}

/** Color for the grade cell: ✓ green, ✗ red, numeric scores by percentage of points; null when ungraded. */
export function gradeTone(a: AssignmentView): GradeTone | null {
  if (a.gradingType === 'pass_fail') {
    if (a.grade === 'complete') return 'green'
    if (a.grade === 'incomplete') return 'red'
    return null
  }
  const percent = scorePercent(a)
  if (percent === null) return null
  return GRADE_BANDS.find((b) => percent >= b.min)?.tone ?? 'red'
}

/** Score cell: numbers, a tick/cross for pass-fail, or a dash. */
export function formatGrade(a: AssignmentView): string {
  if (a.gradingType === 'pass_fail') {
    if (a.grade === 'complete') return '✓'
    if (a.grade === 'incomplete') return '✗'
    return '—'
  }
  if (a.score !== null) {
    const base = a.pointsPossible !== null ? `${a.score}/${a.pointsPossible}` : String(a.score)
    const letter = (a.gradingType === 'letter_grade' || a.gradingType === 'gpa_scale') && a.grade ? ` (${a.grade})` : ''
    return base + letter
  }
  return a.grade ?? '—'
}

/** "Today", "Tomorrow", "Yesterday", else "Mon, Oct 27" (year added when not the current one). */
export function formatDayLabel(dayKey: string, now: Date): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const day = new Date(y, m - 1, d)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const offset = Math.round((day.getTime() - today.getTime()) / DAY)
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  if (offset === -1) return 'Yesterday'
  return day.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: y === now.getFullYear() ? undefined : 'numeric'
  })
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
