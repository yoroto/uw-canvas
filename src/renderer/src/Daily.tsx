import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import scheduleData from '../../../data/schedule.json'
import { dayKeyOf } from '../../shared/assignments/timeline'
import type { AssignmentView } from '../../shared/assignments/types'
import { assignmentsForDay, dayRange } from '../../shared/daily/assignments'
import { dayOptions, shiftDay } from '../../shared/daily/days'
import { carriedListTop, HOUR_PX, hourLabel, initialScrollHour, minutesIntoDay, pxForMinutes } from '../../shared/daily/grid'
import { layoutEvents } from '../../shared/daily/layout'
import { mergeDay } from '../../shared/daily/merge'
import type { CalEvent, DayFeedEvents, FeedInfo, PlacedEvent } from '../../shared/daily/types'
import { resolveDay } from '../../shared/schedule/schedule'
import type { ScheduleFile } from '../../shared/schedule/types'
import { AssignmentChip } from './AssignmentChip'
import { FeedsManager } from './FeedsManager'

const schedule = scheduleData as unknown as ScheduleFile

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const CHIP_H = 40
const CARRIED_H = 38
const CARRIED_GAP = 4
const LANE_START_HOUR = 21
const MIN_EVENT_MS = 15 * 60 * 1000
const CHIP_MS = (CHIP_H / HOUR_PX) * 3_600_000

const ms = (iso: string): number => new Date(iso).getTime()
const timeText = (d: Date): string => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

interface Props {
  items: AssignmentView[]
  hues: ReadonlyMap<string, number>
  now: Date
  /** Changes whenever the header Refresh button is pressed: re-download the feeds too. */
  refreshTick: number
}

export function Daily({ items, hues, now, refreshTick }: Props): React.JSX.Element {
  const todayKey = dayKeyOf(now)
  const [date, setDate] = useState(todayKey)
  const [feeds, setFeeds] = useState<FeedInfo[]>([])
  const [feedDay, setFeedDay] = useState<DayFeedEvents>({ events: [], errors: [] })
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // The feeds the user added.
  useEffect(() => {
    void window.canvas.feeds.list().then((res) => {
      if (res.ok) setFeeds(res.data)
      else setLoadError(res.error.message)
    })
  }, [])

  // The header Refresh button: drop the cached downloads, then read the feeds again.
  const firstTick = useRef(true)
  useEffect(() => {
    if (firstTick.current) {
      firstTick.current = false
      return
    }
    void window.canvas.feeds.refresh().then(() => setReload((n) => n + 1))
  }, [refreshTick])

  // Feed events for the chosen day; reloads when the day, the feeds or Refresh change.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void window.canvas.feeds
      .events(date)
      .then((res) => {
        if (cancelled) return
        if (res.ok) {
          setFeedDay(res.data)
          setLoadError(null)
        } else {
          setLoadError(res.error.message)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [date, feeds, reload])

  const feedColor = useMemo(() => new Map(feeds.map((f) => [f.id, f.color])), [feeds])
  const { from: dayStart, to: dayEnd } = useMemo(() => dayRange(date), [date])
  const day = useMemo(() => resolveDay(schedule, date), [date])
  const calendar = useMemo(() => mergeDay(day, feedDay.events), [day, feedDay.events])
  const { timed, carried } = useMemo(() => assignmentsForDay(items, date, now), [items, date, now])

  const left = useMemo(() => layoutEvents(calendar.timed, (e) => ({ start: ms(e.start), end: ms(e.end) }), MIN_EVENT_MS), [calendar.timed])
  const right = useMemo(() => layoutEvents(timed, (a) => ({ start: a.due.getTime() - CHIP_MS, end: a.due.getTime() }), 0), [timed])

  const y = (t: Date): number => pxForMinutes(minutesIntoDay(t, dayStart, dayEnd))
  // The "also due soon" list starts at 9 PM, or just below the lowest deadline chip after 9 PM.
  const laneTop = carriedListTop(
    timed.map((a) => y(a.due)),
    pxForMinutes(LANE_START_HOUR * 60)
  )
  const gridHeight = Math.max(24 * HOUR_PX, carried.length ? laneTop + 18 + carried.length * (CARRIED_H + CARRIED_GAP) + 12 : 0)
  const isToday = date === todayKey

  // Open each day scrolled to where the action starts.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const starts = [
      ...day.blocks.map((b) => Number(b.start.slice(0, 2)) + Number(b.start.slice(3)) / 60),
      ...timed.map((a) => a.due.getHours() + a.due.getMinutes() / 60 - CHIP_H / HOUR_PX)
    ]
    const opens = day.term?.building ? Number(day.term.building.opens.slice(0, 2)) : null
    const hour = initialScrollHour({ isToday, now, opensHour: opens, firstItemHour: starts.length ? Math.min(...starts) : null })
    el.scrollTop = pxForMinutes(hour * 60)
    // Only when the day changes, so a refresh does not move the view.
  }, [date])

  const options = useMemo(() => {
    const list = dayOptions(now)
    return list.some((o) => o.value === date) ? list : [...list, { value: date, label: date }].sort((a, b) => a.value.localeCompare(b.value))
  }, [now, date])

  return (
    <div className="daily">
      <div className="daily-bar">
        <div className="day-picker">
          <button aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}>
            ◀
          </button>
          <select value={date} onChange={(e) => setDate(e.target.value)} aria-label="Choose a day">
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button aria-label="Next day" onClick={() => setDate(shiftDay(date, 1))}>
            ▶
          </button>
          <button onClick={() => setDate(todayKey)} disabled={isToday}>
            Today
          </button>
        </div>
        <div className="actions">
          {loading && <span className="hint">Loading…</span>}
          <FeedsManager feeds={feeds} onFeedsChange={setFeeds} onRefreshed={() => setReload((n) => n + 1)} />
        </div>
      </div>

      {loadError && <p className="error">{loadError}</p>}
      {feedDay.errors.map((e) => (
        <p key={e.feedId} className="error">
          Could not load “{e.feedName}”: {e.message}
        </p>
      ))}

      <div className="daily-scroll" ref={scrollRef}>
        <div className="daily-heads">
          <div />
          <div className="head">
            <strong>Schedule</strong>
            {calendar.closed && <span className="banner">No school{calendar.label ? `: ${calendar.label}` : ''}</span>}
            {!calendar.closed && calendar.label && <span className="banner info">{calendar.label}</span>}
            {calendar.allDay.map((e) => (
              <span key={e.id} className="all-day" style={{ '--c': e.feedId ? feedColor.get(e.feedId) : undefined } as React.CSSProperties}>
                {e.title}
              </span>
            ))}
          </div>
          <div className="head">
            <strong>Assignments</strong>
            <span className="hint">
              {timed.length} due{carried.length ? ` · ${carried.length} more soon after` : ''}
            </span>
          </div>
        </div>

        <div className="daily-grid" style={{ height: gridHeight }}>
          {HOURS.map((h) => (
            <div key={h} className="hour" style={{ top: h * HOUR_PX }}>
              <span className="hour-label">{h === 0 ? '' : hourLabel(h)}</span>
            </div>
          ))}

          <div className="col col-left">
            {calendar.hours && !calendar.closed && (
              <>
                <div className="off-hours" style={{ top: 0, height: y(calendar.hours.opens) }} />
                <div className="off-hours" style={{ top: y(calendar.hours.closes), bottom: 0 }} />
              </>
            )}
            {left.map((p) => (
              <EventBlock key={p.event.id} placed={p} color={p.event.feedId ? feedColor.get(p.event.feedId) : undefined} y={y} />
            ))}
          </div>

          <div className="col col-right">
            <div className="deadlines">
              {right.map((p) => {
                const bottom = y(p.event.due)
                return (
                  <AssignmentChip
                    key={p.event.item.key}
                    a={p.event}
                    hue={hues.get(p.event.item.courseId) ?? 210}
                    style={{
                      top: Math.max(0, bottom - CHIP_H),
                      height: CHIP_H,
                      left: `${(p.column / p.columns) * 100}%`,
                      width: `calc(${100 / p.columns}% - 3px)`
                    }}
                  />
                )
              })}
            </div>
            {carried.length > 0 && (
              <div className="lane" style={{ top: laneTop }}>
                <div className="lane-title">Also due soon</div>
                {carried.map((a, i) => (
                  <AssignmentChip
                    key={a.item.key}
                    a={a}
                    hue={hues.get(a.item.courseId) ?? 210}
                    carried
                    style={{ top: 18 + i * (CARRIED_H + CARRIED_GAP), height: CARRIED_H }}
                  />
                ))}
              </div>
            )}
          </div>

          {isToday && (
            <div className="now-line" style={{ top: y(now) }}>
              <span>{timeText(now)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface BlockProps {
  placed: PlacedEvent<CalEvent>
  color?: string
  y: (t: Date) => number
}

function EventBlock({ placed, color, y }: BlockProps): React.JSX.Element {
  const { event: e, column, columns } = placed
  const start = new Date(e.start)
  const end = new Date(e.end)
  const top = y(start)
  const height = Math.max(y(end) - top, 18)
  const range = `${timeText(start)} – ${timeText(end)}`
  return (
    <div
      className={`event ${e.source === 'class' ? `kind-${e.kind ?? 'class'}` : 'feed'}`}
      style={{ top, height, left: `${(column / columns) * 100}%`, width: `calc(${100 / columns}% - 3px)`, '--c': color } as React.CSSProperties}
      title={`${e.title}${e.detail ? ` (${e.detail})` : ''}\n${range}${e.location ? `\n${e.location}` : ''}`}
    >
      <div className="event-title">
        {e.title}
        {e.detail ? <span className="event-detail"> ({e.detail})</span> : null}
      </div>
      {height >= 34 && <div className="event-time">{range}</div>}
      {height >= 50 && e.location ? <div className="event-time">{e.location}</div> : null}
    </div>
  )
}
