import { useEffect, useMemo, useRef } from 'react'
import { formatDayLabel } from '../../shared/assignments/format'
import { buildTimeline } from '../../shared/assignments/timeline'
import type { AssignmentView } from '../../shared/assignments/types'
import { AssignmentRow } from './AssignmentRow'

interface Props {
  items: AssignmentView[]
  /** courseId -> hue, from the full (unfiltered) course list. */
  hues: ReadonlyMap<string, number>
  now: Date
}

export function Timeline({ items, hues, now }: Props): React.JSX.Element {
  const entries = useMemo(() => buildTimeline(items, now), [items, now])
  const nowRef = useRef<HTMLDivElement>(null)

  // Open with "now" in the middle. Runs once: later refreshes keep the scroll position.
  useEffect(() => {
    nowRef.current?.scrollIntoView({ block: 'center' })
  }, [])

  const jumpToNow = (): void => nowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })

  return (
    <div className="timeline-wrap">
      <div className="timeline">
        <div className="columns">
          <span>Due</span>
          <span>Assignment</span>
          <span>Submitted</span>
          <span>Status</span>
          <span>Grade</span>
        </div>
        <div className="timeline-body">
          {entries.map((e) => {
            switch (e.type) {
              case 'day':
                return (
                  <div key={e.key} className="day">
                    {formatDayLabel(e.dayKey, now)}
                  </div>
                )
              case 'now':
                return (
                  <div key={e.key} className="now" ref={nowRef}>
                    <span>Now · {now.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                )
              case 'noDueDate':
                return (
                  <div key={e.key} className="day">
                    No due date
                  </div>
                )
              case 'assignment':
                return <AssignmentRow key={e.key} a={e.item} hue={hues.get(e.item.courseId) ?? 210} now={now} />
            }
          })}
        </div>
      </div>
      <button className="jump" onClick={jumpToNow}>
        Jump to now
      </button>
    </div>
  )
}
