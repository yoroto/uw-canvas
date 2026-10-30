import { formatDateTime, formatGrade, formatRelative, gradeTone } from '../../shared/assignments/format'
import { deriveStatus, type Status, type StatusFlag, type StatusKind } from '../../shared/assignments/status'
import type { AssignmentView } from '../../shared/assignments/types'

const STATUS_LABEL: Record<StatusKind, string> = {
  excused: 'Excused',
  graded: 'Graded',
  'no-submission': 'No submission',
  submitted: 'Submitted',
  missing: 'Missing',
  'not-open': 'Not open yet',
  'due-soon': 'Due soon',
  open: 'Open'
}

const STATUS_TONE: Record<StatusKind, string> = {
  excused: 'muted',
  graded: 'good',
  'no-submission': 'muted',
  submitted: 'good',
  missing: 'danger',
  'not-open': 'muted',
  'due-soon': 'warn',
  open: 'muted'
}

const FLAG_LABEL: Record<StatusFlag, string> = { late: 'Late', 'pending-review': 'Pending review' }
const FLAG_TONE: Record<StatusFlag, string> = { late: 'danger', 'pending-review': 'warn' }

/** The status chip plus any flags (Late, Pending review). */
export function StatusChips({ status }: { status: Status }): React.JSX.Element {
  return (
    <>
      <span className={`chip ${STATUS_TONE[status.primary]}`}>{STATUS_LABEL[status.primary]}</span>
      {status.flags.map((f) => (
        <span key={f} className={`chip ${FLAG_TONE[f]}`}>
          {FLAG_LABEL[f]}
        </span>
      ))}
    </>
  )
}

interface Props {
  a: AssignmentView
  hue: number
  now: Date
  /** Why the row is listed (Importance/Problems views): chips shown before the status. */
  reasons?: { text: string; title: string }[]
  /** Importance view: the submission changed since the user last looked. */
  changed?: boolean
  onSeen?: (key: string) => void
}

/** One assignment line, shared by the Timeline and Importance views. */
export function AssignmentRow({ a, hue, now, reasons, changed, onSeen }: Props): React.JSX.Element {
  const status = deriveStatus(a, now)
  return (
    <div className={`row${changed ? ' changed' : ''}`} style={{ '--h': hue } as React.CSSProperties}>
      <div className="due">
        {a.dueAt ? (
          <>
            <div>{formatDateTime(a.dueAt)}</div>
            <div className="hint">{formatRelative(new Date(a.dueAt), now)}</div>
          </>
        ) : (
          <span className="hint">No due date</span>
        )}
      </div>
      <div className="title">
        <span className="course">{a.courseName}</span>
        <a href={a.htmlUrl} target="_blank" rel="noreferrer" onClick={() => changed && onSeen?.(a.key)}>
          {a.name}
        </a>
      </div>
      <div className="submitted">{formatDateTime(a.submittedAt)}</div>
      <div className="chips">
        {reasons?.map((r) => (
          <span key={r.text} className="chip reason" title={r.title}>
            {r.text}
          </span>
        ))}
        <StatusChips status={status} />
        {changed && onSeen && (
          <button className="seen" onClick={() => onSeen(a.key)}>
            Seen
          </button>
        )}
      </div>
      <div className={`grade ${gradeTone(a) ?? ''}`}>{formatGrade(a)}</div>
    </div>
  )
}
