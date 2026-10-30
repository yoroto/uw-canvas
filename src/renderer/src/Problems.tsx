import { useMemo } from 'react'
import type { AssignmentView } from '../../shared/assignments/types'
import { findProblems } from '../../shared/problems/problems'
import { AssignmentRow } from './AssignmentRow'

interface Props {
  items: AssignmentView[]
  hues: ReadonlyMap<string, number>
  now: Date
}

/** Only what needs attention, grouped: missing, cross, late, red scores. */
export function Problems({ items, hues, now }: Props): React.JSX.Element {
  const groups = useMemo(() => findProblems(items, now), [items, now])

  return (
    <div className="timeline-wrap importance">
      <div className="timeline">
        <div className="columns">
          <span>Due</span>
          <span>Assignment</span>
          <span>Submitted</span>
          <span>Status</span>
          <span>Grade</span>
        </div>
        <div className="timeline-body">
          {groups.length === 0 && <p className="hint pad">No problems found.</p>}
          {groups.map((g) => (
            <section key={g.kind}>
              <div className="zone">
                <h2>
                  {g.title} <span className="count">{g.entries.length}</span>
                </h2>
                <span className="hint">{g.description}</span>
              </div>
              {g.entries.map((e) => (
                <AssignmentRow
                  key={e.item.key}
                  a={e.item}
                  hue={hues.get(e.item.courseId) ?? 210}
                  now={now}
                  reasons={e.reasons.map((r) => ({ text: r.text, title: g.title }))}
                />
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
