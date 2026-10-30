import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import scheduleData from '../../../data/schedule.json'
import { dayKeyOf } from '../../shared/assignments/timeline'
import type { AssignmentView } from '../../shared/assignments/types'
import { assignmentsForDay, dayRange } from '../../shared/daily/assignments'
import { dayOptions, shiftDay } from '../../shared/daily/days'
import { carriedListTop, HOUR_PX, hourLabel, initialScrollHour, minutesIntoDay, planItemLines, pxForMinutes } from '../../shared/daily/grid'
import { layoutEvents } from '../../shared/daily/layout'
import { mergeDay } from '../../shared/daily/merge'
import type { CalEvent, DayFeedEvents, FeedInfo, PlacedEvent } from '../../shared/daily/types'
import { resolveDay } from '../../shared/schedule/schedule'
import type { ScheduleFile } from '../../shared/schedule/types'
import { itemsDueOnDay, moduleItemTypeLabel, type DayModuleItem } from '../../shared/modules/dayItems'
import { AssignmentChip } from './AssignmentChip'
import { assignmentUpdates, updatesForDay, type CourseUpdates } from '../../shared/updates/updates'
import { UpdatesPanel } from './UpdatesPanel'
import { FeedsManager } from './FeedsManager'
import { classCourseKey, type ClassCourse, type CourseModulesState } from './useCourseModules'

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
  /** Announcements, discussions, files and pages (loaded by App, so they survive switching tabs). */
  courseUpdates: CourseUpdates | null
  updatesLoading: boolean
  updatesError: string | null
  /** The Canvas course behind each class block, with its modules (loaded by App). */
  classCourses: CourseModulesState
}

export function Daily({ items, hues, now, refreshTick, courseUpdates, updatesLoading, updatesError, classCourses }: Props): React.JSX.Element {
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

  const assignmentEvents = useMemo(() => assignmentUpdates(items), [items])
  const dayUpdates = useMemo(() => updatesForDay([...assignmentEvents, ...(courseUpdates?.events ?? [])], date), [assignmentEvents, courseUpdates, date])
  const beyondReach = courseUpdates !== null && dayRange(date).to.getTime() <= new Date(courseUpdates.since).getTime()

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
          {(loading || classCourses.loading) && (
            <span className="hint">{classCourses.loading && !loading ? 'Loading module items…' : 'Loading…'}</span>
          )}
          <FeedsManager feeds={feeds} onFeedsChange={setFeeds} onRefreshed={() => setReload((n) => n + 1)} />
        </div>
      </div>

      {loadError && <p className="error">{loadError}</p>}
      {classCourses.error && <p className="error">Course modules: {classCourses.error}</p>}
      {feedDay.errors.map((e) => (
        <p key={e.feedId} className="error">
          Could not load “{e.feedName}”: {e.message}
        </p>
      ))}

      <div className="daily-body">
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
              {left.map((p) => {
                const isClass = p.event.source === 'class' && p.event.kind === 'class'
                const course = isClass && day.term ? classCourses.byClass.get(classCourseKey(day.term.id, p.event.title)) : undefined
                return (
                  <EventBlock
                    key={p.event.id}
                    placed={p}
                    color={p.event.feedId ? feedColor.get(p.event.feedId) : undefined}
                    y={y}
                    course={course}
                    unmatched={isClass && !course && classCourses.loadedAt !== null && !classCourses.loading}
                    loadingItems={isClass && !course && classCourses.loading}
                    moduleItems={course ? itemsDueOnDay(course.modules, date) : []}
                  />
                )
              })}
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

        <UpdatesPanel
          events={dayUpdates}
          loading={updatesLoading}
          errors={courseUpdates?.errors ?? []}
          hues={hues}
          loadedAt={courseUpdates?.fetchedAt ?? null}
          note={
            updatesError
              ? `Could not load course updates: ${updatesError}`
              : beyondReach
                ? 'Announcements, discussions, files and pages are only loaded for the last 30 days.'
                : null
          }
        />
      </div>
    </div>
  )
}

interface BlockProps {
  placed: PlacedEvent<CalEvent>
  color?: string
  y: (t: Date) => number
  /** Class blocks: the Canvas course this block was matched to. */
  course?: ClassCourse
  /** Class blocks: no Canvas course matched the title. */
  unmatched?: boolean
  /** The courses and their modules are still loading for the first time. */
  loadingItems?: boolean
  /** Module items due on this day for the matched course. */
  moduleItems: DayModuleItem[]
}

function EventBlock({ placed, color, y, course, unmatched, loadingItems, moduleItems }: BlockProps): React.JSX.Element {
  const { event: e, column, columns } = placed
  const [open, setOpen] = useState(false)
  const start = new Date(e.start)
  const end = new Date(e.end)
  const top = y(start)
  const height = Math.max(y(end) - top, 18)
  const range = `${timeText(start)} – ${timeText(end)}`
  const plan = planItemLines(moduleItems.length, height)
  const shown = open ? moduleItems : moduleItems.slice(0, plan.visible)
  const canvasNote = course
    ? `Canvas course: ${course.course.name}${course.ambiguous ? ' (several courses fit; check the aliases in data/schedule.json)' : ''}`
    : unmatched
      ? `No matching Canvas course found for "${e.title}"`
      : ''
  const blockStyle: Record<string, string | number | undefined> = {
    top,
    ...(open ? { minHeight: height } : { height }),
    left: `${(column / columns) * 100}%`,
    width: `calc(${100 / columns}% - 3px)`,
    '--c': color
  }
  return (
    <div
      className={`event ${e.source === 'class' ? `kind-${e.kind ?? 'class'}` : 'feed'}${open ? ' expanded' : ''}`}
      style={blockStyle as React.CSSProperties}
      title={`${e.title}${e.detail ? ` (${e.detail})` : ''}\n${range}${e.location ? `\n${e.location}` : ''}${canvasNote ? `\n${canvasNote}` : ''}`}
    >
      <div className="event-title">
        {e.title}
        {e.detail ? <span className="event-detail"> ({e.detail})</span> : null}
      </div>
      {height >= 34 && <div className="event-time">{range}</div>}
      {height >= 50 && e.location ? <div className="event-time">{e.location}</div> : null}
      {loadingItems && (
        <div className="event-loading" role="status">
          Loading module items…
        </div>
      )}
      {shown.map(({ item, moduleName, due }) => (
        <a
          key={item.id}
          className="event-item"
          href={item.htmlUrl}
          target="_blank"
          rel="noreferrer"
          title={`${moduleItemTypeLabel(item.type)}: ${item.title}\n${moduleName}\nDue ${due.toLocaleString()}`}
        >
          <span className="event-item-type">{moduleItemTypeLabel(item.type)}</span>
          {item.title}
        </a>
      ))}
      {!open && plan.more > 0 && (
        <button className="event-more" onClick={() => setOpen(true)}>
          {plan.visible > 0 ? `+${plan.more} more` : `${plan.more} due`} ▾
        </button>
      )}
      {open && (
        <button className="event-more" onClick={() => setOpen(false)}>
          Show less ▴
        </button>
      )}
    </div>
  )
}
