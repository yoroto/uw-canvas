import { useMemo } from 'react'
import { formatDateTime, formatGrade, formatRelative, gradeTone } from '../../shared/assignments/format'
import { deriveStatus } from '../../shared/assignments/status'
import type { AssignmentView } from '../../shared/assignments/types'
import { GRADE_SORTS, listGraded, type GradeSort } from '../../shared/grades/grades'
import { StatusChips } from './AssignmentRow'

interface Props {
  items: AssignmentView[]
  hues: ReadonlyMap<string, number>
  now: Date
  sort: GradeSort
}

/** Graded assignments only, newest first by the chosen date. */
export function Grades({ items, hues, now, sort }: Props): React.JSX.Element {
  const graded = useMemo(() => listGraded(items, now, sort), [items, now, sort])

  return (
    <div className="timeline-wrap importance">
      <div className="timeline">
        <div className="columns grades-grid">
          <span>Assignment</span>
          {GRADE_SORTS.map((s) => (
            <span key={s.key} className={s.key === sort ? 'sorted' : undefined}>
              {s.label}
              {s.key === sort ? ' ↓' : ''}
            </span>
          ))}
          <span>Status</span>
          <span>Grade</span>
        </div>
        <div className="timeline-body">
          {graded.length === 0 && <p className="hint pad">No graded assignments yet.</p>}
          {graded.map((a) => (
            <div key={a.key} className="row grades-grid" style={{ '--h': hues.get(a.courseId) ?? 210 } as React.CSSProperties}>
              <div className="title">
                <span className="course">{a.courseName}</span>
                <a href={a.htmlUrl} target="_blank" rel="noreferrer">
                  {a.name}
                </a>
              </div>
              {GRADE_SORTS.map((s) => (
                <DateCell key={s.key} iso={a[s.key]} active={s.key === sort} now={now} />
              ))}
              <div className="chips">
                <StatusChips status={deriveStatus(a, now)} />
              </div>
              <div className={`grade ${gradeTone(a) ?? ''}`}>{formatGrade(a)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DateCell({ iso, active, now }: { iso: string | null; active: boolean; now: Date }): React.JSX.Element {
  return (
    <div className={active ? 'date sorted' : 'date'}>
      <div>{formatDateTime(iso)}</div>
      {iso && <div className="hint">{formatRelative(new Date(iso), now)}</div>}
    </div>
  )
}
