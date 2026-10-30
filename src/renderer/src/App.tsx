import { useCallback, useEffect, useMemo, useState } from 'react'
import { courseOptions, filterByCourses } from '../../shared/assignments/courses'
import type { AssignmentsPayload } from '../../shared/assignments/types'
import { DEFAULT_GRADE_SORT, type GradeSort } from '../../shared/grades/grades'
import type { IpcResult } from '../../shared/types'
import { CourseFilter } from './CourseFilter'
import { Daily } from './Daily'
import { GradeSortFilter } from './GradeSortFilter'
import { Grades } from './Grades'
import { Problems } from './Problems'
import { Timeline } from './Timeline'

type Phase = 'loading' | 'signedOut' | 'signedIn'
type View = 'daily' | 'timeline' | 'problems' | 'grades'

const VIEW_LABEL: Record<View, string> = { daily: 'Daily', timeline: 'Timeline', problems: 'Problems', grades: 'Grades' }

export function App(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading')
  const [view, setView] = useState<View>('daily')
  const [data, setData] = useState<AssignmentsPayload | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  // Bumped by the Refresh button, only while the Daily tab is showing, so it also re-downloads the calendar feeds.
  const [refreshTick, setRefreshTick] = useState(0)
  const [gradeSort, setGradeSort] = useState<GradeSort>(DEFAULT_GRADE_SORT)
  // Timeline: deselected course ids. Everything is shown by default, including courses that show up later.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())

  const courses = useMemo(() => courseOptions(data?.items ?? []), [data])
  const hues = useMemo(() => new Map(courses.map((c) => [c.id, c.hue])), [courses])
  const visibleItems = useMemo(() => filterByCourses(data?.items ?? [], hidden), [data, hidden])
  const visibleCourses = courses.filter((c) => !hidden.has(c.id)).length

  // Keep "now" (and so the divider, relative times and rankings) current.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Runs an IPC call; a failed call becomes an error message, an
  // 'unauthenticated' one also sends the user back to the signed-out screen.
  const run = useCallback(async <T,>(call: () => Promise<IpcResult<T>>): Promise<T | null> => {
    setBusy(true)
    setError(null)
    try {
      const res = await call()
      if (res.ok) return res.data
      if (res.error.code === 'unauthenticated') setPhase('signedOut')
      else setError(res.error.message)
      return null
    } finally {
      setBusy(false)
    }
  }, [])

  const load = useCallback(async () => {
    const res = await run(() => window.canvas.assignments.list())
    if (res) {
      setData(res)
      setNow(new Date())
    }
  }, [run])

  const applyStatus = useCallback(
    async (signedIn: boolean) => {
      setPhase(signedIn ? 'signedIn' : 'signedOut')
      if (signedIn) await load()
      else setData(null)
    },
    [load]
  )

  useEffect(() => {
    void run(() => window.canvas.auth.status()).then((s) => applyStatus(s?.signedIn ?? false))
  }, [run, applyStatus])

  const signIn = async (): Promise<void> => {
    const s = await run(() => window.canvas.auth.login())
    if (s) await applyStatus(s.signedIn)
  }

  const signOut = async (): Promise<void> => {
    const s = await run(() => window.canvas.auth.logout())
    if (s) await applyStatus(s.signedIn)
  }

  return (
    <main>
      <header>
        <div className="title-bar">
          <h1>UW Canvas</h1>
          {phase === 'signedIn' && (
            <nav className="tabs">
              {(['daily', 'timeline', 'problems', 'grades'] as const).map((v) => (
                <button key={v} className={view === v ? 'tab active' : 'tab'} aria-pressed={view === v} onClick={() => setView(v)}>
                  {VIEW_LABEL[v]}
                </button>
              ))}
            </nav>
          )}
        </div>
        {phase === 'signedIn' && (
          <div className="actions">
            {busy && <span className="hint">Loading…</span>}
            {view === 'timeline' && <CourseFilter courses={courses} hidden={hidden} onChange={setHidden} />}
            {view === 'grades' && <GradeSortFilter value={gradeSort} onChange={setGradeSort} />}
            <button
              onClick={() => {
                if (view === 'daily') setRefreshTick((n) => n + 1)
                void load()
              }}
              disabled={busy}
            >
              Refresh
            </button>
            <button onClick={() => void signOut()} disabled={busy}>
              Sign out
            </button>
          </div>
        )}
      </header>

      {error && <p className="error">{error}</p>}
      {data && data.failedCourses.length > 0 && (
        <p className="error">
          Some data could not be loaded: {data.failedCourses.map((c) => `${c.courseName} (${c.message})`).join('; ')}. Press Refresh to retry.
        </p>
      )}

      {phase === 'loading' && <p className="pad">Checking session…</p>}

      {phase === 'signedOut' && (
        <section className="center">
          <p>Sign in with your UW NetID to load your assignments.</p>
          <button className="primary" onClick={() => void signIn()} disabled={busy}>
            Sign in
          </button>
        </section>
      )}

      {phase === 'signedIn' && !data && <p className="pad">Loading assignments…</p>}
      {phase === 'signedIn' && data && view === 'timeline' && (
        <>
          {courses.length > 0 && visibleCourses === 0 && <p className="hint pad">No courses selected.</p>}
          <Timeline items={visibleItems} hues={hues} now={now} />
        </>
      )}
      {phase === 'signedIn' && view === 'daily' && <Daily items={data?.items ?? []} hues={hues} now={now} refreshTick={refreshTick} />}
      {phase === 'signedIn' && data && view === 'problems' && <Problems items={data.items} hues={hues} now={now} />}
      {phase === 'signedIn' && data && view === 'grades' && <Grades items={data.items} hues={hues} now={now} sort={gradeSort} />}
    </main>
  )
}
