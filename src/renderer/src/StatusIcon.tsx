import type { AssignmentState } from '../../shared/daily/assignments'

const LABEL: Record<AssignmentState, string> = {
  submitted: 'Submitted',
  outstanding: 'Outstanding',
  'past-due': 'Outstanding, past due',
  'no-submission': 'Nothing to submit'
}

/**
 * Green check = submitted. Hollow circle with "!" = still to turn in (red once
 * past due). Grey circle with a dash = no online submission needed.
 */
export function StatusIcon({ state }: { state: AssignmentState }): React.JSX.Element {
  const label = LABEL[state]
  const svg = { width: 18, height: 18, viewBox: '0 0 18 18', role: 'img', 'aria-label': label } as const
  if (state === 'submitted') {
    return (
      <svg className="status-icon done" {...svg}>
        <title>{label}</title>
        <circle cx="9" cy="9" r="9" fill="currentColor" />
        <path d="M5 9.4l2.6 2.6L13 6.6" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (state === 'no-submission') {
    return (
      <svg className="status-icon none" {...svg}>
        <title>{label}</title>
        <circle cx="9" cy="9" r="7.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.6 2" />
        <path d="M5.6 9h6.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg className={`status-icon ${state === 'past-due' ? 'late' : 'todo'}`} {...svg}>
      <title>{label}</title>
      <circle cx="9" cy="9" r="7.8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M9 4.8v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9" cy="12.6" r="1.2" fill="currentColor" />
    </svg>
  )
}
