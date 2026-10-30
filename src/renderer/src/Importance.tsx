import { useMemo } from 'react'
import type { AssignmentView, Fingerprint } from '../../shared/assignments/types'
import { rankAssignments, type RankedItem } from '../../shared/importance/rank'
import type { RuleSetting } from '../../shared/importance/settings'
import { AssignmentRow } from './AssignmentRow'

interface Props {
  items: AssignmentView[]
  seen: Record<string, Fingerprint>
  hues: ReadonlyMap<string, number>
  now: Date
  settings: readonly RuleSetting[]
  onSeen: (keys: string[]) => void
}

export function Importance({ items, seen, hues, now, settings, onSeen }: Props): React.JSX.Element {
  // Pure re-rank: runs again whenever the rules (order or on/off) or the data change.
  const ranked = useMemo(() => rankAssignments(items, seen, now, settings), [items, seen, now, settings])

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
          <Zone title="To do" list={ranked.toDo} empty="Nothing outstanding." hues={hues} now={now} onSeen={onSeen} />
          <Zone title="Turned in" list={ranked.turnedIn} empty="Nothing turned in yet." hues={hues} now={now} onSeen={onSeen} />
        </div>
      </div>
    </div>
  )
}

interface ZoneProps {
  title: string
  list: RankedItem[]
  empty: string
  hues: ReadonlyMap<string, number>
  now: Date
  onSeen: (keys: string[]) => void
}

function Zone({ title, list, empty, hues, now, onSeen }: ZoneProps): React.JSX.Element {
  const changedKeys = list.filter((r) => r.change).map((r) => r.item.key)
  return (
    <section>
      <div className="zone">
        <h2>
          {title} <span className="count">{list.length}</span>
        </h2>
        {changedKeys.length > 0 && <button onClick={() => onSeen(changedKeys)}>Mark all seen ({changedKeys.length})</button>}
      </div>
      {list.length === 0 && <p className="hint pad">{empty}</p>}
      {list.map((r) => (
        <AssignmentRow
          key={r.item.key}
          a={r.item}
          hue={hues.get(r.item.courseId) ?? 210}
          now={now}
          reasons={r.rule ? [{ text: r.rule.reason, title: r.rule.description }] : []}
          changed={r.change !== null}
          onSeen={(key) => onSeen([key])}
        />
      ))}
    </section>
  )
}
