import type { CSSProperties } from 'react'
import type { DayAssignment } from '../../shared/daily/assignments'
import { StatusIcon } from './StatusIcon'

interface Props {
  a: DayAssignment
  hue: number
  /** Due after this day: shown dashed, with the real due date and time. */
  carried?: boolean
  style?: CSSProperties
}

const timeOnly = (d: Date): string => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const dayAndTime = (d: Date): string => `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${timeOnly(d)}`

/** One assignment on the day's deadline column. */
export function AssignmentChip({ a, hue, carried = false, style }: Props): React.JSX.Element {
  const when = carried ? dayAndTime(a.due) : timeOnly(a.due)
  return (
    <div
      className={`chip-block${carried ? ' carried' : ''}${a.state === 'submitted' ? ' is-done' : ''}`}
      style={{ ...style, '--h': hue } as CSSProperties}
      title={`${a.item.courseName}: ${a.item.name}\nDue ${a.due.toLocaleString()}`}
    >
      <StatusIcon state={a.state} />
      <div className="chip-text">
        <a href={a.item.htmlUrl} target="_blank" rel="noreferrer">
          {a.item.name}
        </a>
        <span className="chip-sub">
          <span className="course">{a.item.courseName}</span> · {when}
        </span>
      </div>
    </div>
  )
}
