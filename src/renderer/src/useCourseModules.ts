import { useCallback, useRef, useState } from 'react'
import scheduleData from '../../../data/schedule.json'
import type { ModuleView } from '../../shared/modules/types'
import { isActiveCourse, matchCourse, type CourseRef } from '../../shared/schedule/courseMatch'
import type { ScheduleFile } from '../../shared/schedule/types'

const schedule = scheduleData as unknown as ScheduleFile
const MAX_COURSES = 12

export interface ClassCourse {
  course: CourseRef
  /** Several Canvas courses fit the class title; the shortest name was taken. */
  ambiguous: boolean
  modules: ModuleView[]
}

/** Key of a class block's course: the term it belongs to and the block title. */
export const classCourseKey = (termId: string, title: string): string => `${termId}\u0000${title}`

export interface CourseModulesState {
  byClass: ReadonlyMap<string, ClassCourse>
  error: string | null
  loadedAt: string | null
  /** A load is running (the previous result, if any, is still shown). */
  loading: boolean
}

const EMPTY: CourseModulesState = { byClass: new Map(), error: null, loadedAt: null, loading: false }

/**
 * Finds the Canvas course of every class in the schedule and loads those
 * courses' modules. Lives in App so the result survives switching tabs, and the
 * previous result stays while a new load runs.
 */
export function useCourseModules(onSignedOut: () => void): {
  state: CourseModulesState
  load: (force: boolean) => Promise<void>
  reset: () => void
} {
  const [state, setState] = useState<CourseModulesState>(EMPTY)
  const courses = useRef<CourseRef[] | null>(null)
  const latest = useRef(0)

  const load = useCallback(
    async (force: boolean) => {
      const mine = ++latest.current
      setState((s) => ({ ...s, loading: true }))
      try {
        if (!courses.current || force) {
          const res = await window.canvas.courses.list()
          if (!res.ok) {
            if (res.error.code === 'unauthenticated') onSignedOut()
            else if (mine === latest.current) setState((s) => ({ ...s, error: res.error.message }))
            return
          }
          courses.current = res.data.filter(isActiveCourse).map((c) => ({ id: c.id, name: c.name }))
        }

        // Match every class title of every term to a Canvas course.
        const matches = new Map<string, { course: CourseRef; ambiguous: boolean }>()
        for (const term of schedule.terms) {
          const titles = new Set(Object.values(term.weekly).flatMap((blocks) => (blocks ?? []).filter((b) => b.kind === 'class').map((b) => b.title)))
          for (const title of titles) {
            const m = matchCourse(title, courses.current, term.courseNames)
            if (m) matches.set(classCourseKey(term.id, title), m)
          }
        }

        const ids = [...new Set([...matches.values()].map((m) => m.course.id))].slice(0, MAX_COURSES)
        const res = ids.length ? await window.canvas.modules.list(ids, force) : null
        if (mine !== latest.current) return // a newer load has started
        if (res && !res.ok) {
          if (res.error.code === 'unauthenticated') onSignedOut()
          else setState((s) => ({ ...s, error: res.error.message }))
          return
        }

        const byClass = new Map<string, ClassCourse>()
        for (const [key, m] of matches) byClass.set(key, { ...m, modules: res?.ok ? (res.data.courses[m.course.id] ?? []) : [] })
        const errors = res?.ok ? res.data.errors : []
        setState({
          byClass,
          error: errors.length ? errors.map((e) => `${matchedName(matches, e.courseId)}: ${e.message}`).join('; ') : null,
          loadedAt: res?.ok ? res.data.fetchedAt : new Date().toISOString(),
          loading: false
        })
      } catch (e) {
        if (mine === latest.current) setState((s) => ({ ...s, error: e instanceof Error ? e.message : 'Could not load course modules' }))
      } finally {
        // Every path that returns early leaves "loading" on; clear it unless a newer load has taken over.
        if (mine === latest.current) setState((s) => (s.loading ? { ...s, loading: false } : s))
      }
    },
    [onSignedOut]
  )

  const reset = useCallback(() => {
    latest.current++
    courses.current = null
    setState(EMPTY)
  }, [])

  return { state, load, reset }
}

const matchedName = (matches: Map<string, { course: CourseRef }>, courseId: string): string =>
  [...matches.values()].find((m) => m.course.id === courseId)?.course.name ?? `course ${courseId}`
