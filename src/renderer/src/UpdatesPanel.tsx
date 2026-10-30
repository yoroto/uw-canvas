import type { UpdateEvent, CourseUpdates } from '../../shared/updates/updates'
import { UPDATE_KINDS } from '../../shared/updates/updates'

interface Props {
  /** The day's events, newest first. */
  events: UpdateEvent[]
  loading: boolean
  errors: CourseUpdates['errors']
  /** courseId -> hue, so a course has the same color everywhere. */
  hues: ReadonlyMap<string, number>
  /** Shown when the chosen day is older than the course sources reach. */
  note?: string | null
  /** When the course updates were last loaded from Canvas. */
  loadedAt?: string | null
}

const timeText = (iso: string): string => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** A plain stream of what happened on the day, newest first. It is not tied to the hour grid. */
export function UpdatesPanel({ events, loading, errors, hues, note, loadedAt }: Props): React.JSX.Element {
  return (
    <aside className="updates" aria-label="Updates">
      <div className="updates-head">
        <strong>Updates</strong>
        <span className="hint">{loading && events.length === 0 ? 'Loading…' : `${events.length} ${events.length === 1 ? 'event' : 'events'}`}</span>
      </div>
      {loadedAt && (
        <div className="updates-sub hint" title="When announcements, discussions, files and pages were last loaded from Canvas">
          {loading ? 'Refreshing… ' : ''}Course updates loaded {timeText(loadedAt)}
        </div>
      )}
      <div className="updates-body">
        {note && <p className="hint pad-x">{note}</p>}
        {errors.map((e, i) => (
          <p key={i} className="error pad-x">
            Could not load {e.source} for {e.courseName}: {e.message}
          </p>
        ))}
        {events.length === 0 && !loading && <p className="hint pad-x">Nothing happened on this day.</p>}
        <ul>
          {events.map((e) => {
            const kind = UPDATE_KINDS[e.kind]
            return (
              <li key={e.id} className={`update tone-${kind.tone}`} style={{ '--h': hues.get(e.courseId) ?? 210 } as React.CSSProperties}>
                <span className="update-time">{timeText(e.at)}</span>
                <div className="update-main">
                  <span className="update-kind">{kind.label}</span>
                  <a href={e.url} target="_blank" rel="noreferrer">
                    {e.title}
                  </a>
                  <span className="update-course">{e.courseName}</span>
                  {e.detail && <span className="update-detail">{e.detail}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
