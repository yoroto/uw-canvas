import type { CourseUpdates, UpdateEvent } from '../../shared/updates/updates'
import { CANVAS_ORIGIN } from '../config'
import { CanvasError } from '../errors'
import type { CanvasClient } from './CanvasClient'
import { listActiveCourses } from './courses'

const DAY_MS = 24 * 60 * 60 * 1000
const CACHE_MS = 10 * 60 * 1000
/** Events older than this are not loaded. */
export const UPDATE_DAYS = 30
/** Canvas accepts at most this many context codes per announcements request. */
const CONTEXT_CODES_PER_REQUEST = 10
/** An item added and last modified within this long counts as new. */
const NEW_WITHIN_MS = 60_000

interface Course {
  id: string
  name: string
}

/** What one request group (a course's files, a batch of announcements, ...) produced. */
interface SourceResult {
  /** Stable across loads, so a failed source can fall back to what it returned last time. */
  key: string
  courseName: string
  source: string
  /** unavailable = the course does not offer it (or Canvas refused with 401/403/404). */
  outcome: 'ok' | 'unavailable' | 'failed'
  events: UpdateEvent[]
  message?: string
}

/** The last good events of a source, and how many loads in a row found it unavailable. */
interface Remembered {
  events: UpdateEvent[]
  misses: number
}

interface RawAnnouncement {
  id: string
  title?: string | null
  posted_at?: string | null
  delayed_post_at?: string | null
  html_url?: string
  context_code?: string
}

interface RawTopic {
  id: string
  title?: string | null
  posted_at?: string | null
  last_reply_at?: string | null
  html_url?: string
  published?: boolean
  discussion_subentry_count?: number
}

interface RawFile {
  id: string
  display_name?: string | null
  updated_at?: string | null
  created_at?: string | null
  hidden?: boolean
}

interface RawPage {
  page_id?: string | number
  url?: string
  title?: string | null
  updated_at?: string | null
  created_at?: string | null
  published?: boolean
  html_url?: string
}

const ms = (iso: string): number => new Date(iso).getTime()
const day = (t: number): string => new Date(t).toISOString().slice(0, 10)

/** A course does not offer a source (Files turned off, no access): not worth showing as an error. */
function isUnavailable(e: unknown): boolean {
  // A rate limit also arrives as a 403, but it is a temporary failure, not a missing feature.
  return e instanceof CanvasError && e.code !== 'rate-limit' && (e.code === 'unauthenticated' || e.status === 401 || e.status === 403 || e.status === 404)
}

/**
 * Announcements, discussions, files and pages that changed in the last `days`
 * days, across the user's active courses, as one result per source. A source
 * that fails for one course does not hide the rest.
 */
async function fetchSources(client: CanvasClient, now: Date, days: number): Promise<{ results: SourceResult[]; sinceMs: number }> {
  const sinceMs = now.getTime() - days * DAY_MS
  const isOld = (iso: string | null | undefined): boolean => !iso || ms(iso) < sinceMs
  const courses: Course[] = await listActiveCourses(client)
  const byCode = new Map(courses.map((c) => [`course_${c.id}`, c]))
  const results: SourceResult[] = []

  const run = async (key: string, courseName: string, source: string, work: () => Promise<UpdateEvent[]>): Promise<void> => {
    try {
      results.push({ key, courseName, source, outcome: 'ok', events: await work() })
    } catch (e) {
      if (e instanceof CanvasError && e.code === 'unauthenticated' && e.status !== 401) throw e // a real sign-out (redirect to login)
      if (isUnavailable(e)) results.push({ key, courseName, source, outcome: 'unavailable', events: [] })
      else results.push({ key, courseName, source, outcome: 'failed', events: [], message: e instanceof Error ? e.message : 'Could not load' })
    }
  }

  // Announcements: one request covers up to ten courses.
  for (let i = 0; i < courses.length; i += CONTEXT_CODES_PER_REQUEST) {
    const chunk = courses.slice(i, i + CONTEXT_CODES_PER_REQUEST)
    await run(`announcements:${chunk.map((c) => c.id).join(',')}`, chunk.map((c) => c.name).join(', '), 'announcements', async () => {
      const out: UpdateEvent[] = []
      const list = await client.getAll<RawAnnouncement>('/api/v1/announcements', {
        'context_codes[]': chunk.map((c) => `course_${c.id}`),
        start_date: day(sinceMs),
        end_date: day(now.getTime() + DAY_MS),
        active_only: true
      })
      for (const a of list) {
        const course = a.context_code ? byCode.get(a.context_code) : undefined
        const at = a.posted_at ?? a.delayed_post_at
        if (!course || !at || ms(at) < sinceMs) continue
        out.push({
          id: `announcement:${course.id}:${a.id}`,
          kind: 'announcement',
          at,
          title: a.title?.trim() || 'Announcement',
          courseId: course.id,
          courseName: course.name,
          url: a.html_url ?? `${CANVAS_ORIGIN}/courses/${course.id}/discussion_topics/${a.id}`
        })
      }
      return out
    })
  }

  for (const course of courses) {
    const base = { courseId: course.id, courseName: course.name }

    await run(`discussions:${course.id}`, course.name, 'discussions', async () => {
      const out: UpdateEvent[] = []
      const topics = await client.getRecent<RawTopic>(
        `/api/v1/courses/${course.id}/discussion_topics`,
        { order_by: 'recent_activity' },
        (last) => isOld(last.last_reply_at ?? last.posted_at)
      )
      for (const t of topics) {
        if (t.published === false) continue
        const title = t.title?.trim() || 'Discussion'
        const url = t.html_url ?? `${CANVAS_ORIGIN}/courses/${course.id}/discussion_topics/${t.id}`
        if (t.posted_at && !isOld(t.posted_at)) {
          out.push({ id: `discussion:${course.id}:${t.id}`, kind: 'discussion', at: t.posted_at, title, url, ...base })
        }
        // Only the latest reply time is known; earlier replies are not listed.
        if (t.last_reply_at && !isOld(t.last_reply_at) && (!t.posted_at || Math.abs(ms(t.last_reply_at) - ms(t.posted_at)) > NEW_WITHIN_MS)) {
          const n = t.discussion_subentry_count
          out.push({
            id: `discussion-reply:${course.id}:${t.id}:${t.last_reply_at}`,
            kind: 'discussion-reply',
            at: t.last_reply_at,
            title,
            url,
            ...base,
            ...(n ? { detail: `${n} ${n === 1 ? 'reply' : 'replies'} in total` } : {})
          })
        }
      }
      return out
    })

    await run(`files:${course.id}`, course.name, 'files', async () => {
      const out: UpdateEvent[] = []
      const files = await client.getRecent<RawFile>(`/api/v1/courses/${course.id}/files`, { sort: 'updated_at', order: 'desc' }, (last) => isOld(last.updated_at))
      for (const f of files) {
        if (f.hidden || !f.updated_at || isOld(f.updated_at)) continue
        const isNew = !!f.created_at && Math.abs(ms(f.updated_at) - ms(f.created_at)) <= NEW_WITHIN_MS
        out.push({
          id: `file:${course.id}:${f.id}:${f.updated_at}`,
          kind: 'file',
          at: f.updated_at,
          title: f.display_name?.trim() || 'File',
          url: `${CANVAS_ORIGIN}/courses/${course.id}/files/${f.id}`,
          ...base,
          detail: isNew ? 'New' : 'Updated'
        })
      }
      return out
    })

    await run(`pages:${course.id}`, course.name, 'pages', async () => {
      const out: UpdateEvent[] = []
      const pages = await client.getRecent<RawPage>(`/api/v1/courses/${course.id}/pages`, { sort: 'updated_at', order: 'desc' }, (last) => isOld(last.updated_at))
      for (const p of pages) {
        if (p.published === false || !p.updated_at || isOld(p.updated_at)) continue
        const isNew = !!p.created_at && Math.abs(ms(p.updated_at) - ms(p.created_at)) <= NEW_WITHIN_MS
        out.push({
          id: `page:${course.id}:${p.page_id ?? p.url}:${p.updated_at}`,
          kind: 'page',
          at: p.updated_at,
          title: p.title?.trim() || 'Page',
          url: p.html_url ?? `${CANVAS_ORIGIN}/courses/${course.id}/pages/${p.url ?? ''}`,
          ...base,
          detail: isNew ? 'New' : 'Updated'
        })
      }
      return out
    })
  }

  return { results, sinceMs }
}

/**
 * Turns source results into the final list. A source that worked is remembered.
 * One that then fails keeps showing what it returned last time (with a note), so a
 * hiccup, a rate limit or a flaky response does not make events vanish. A source that
 * is "unavailable" twice in a row is treated as really gone.
 */
export function combineSources(
  results: readonly SourceResult[],
  remembered: Map<string, Remembered>,
  sinceMs: number,
  fetchedAt: Date
): CourseUpdates {
  const events: UpdateEvent[] = []
  const errors: CourseUpdates['errors'] = []
  const recent = (list: readonly UpdateEvent[]): UpdateEvent[] => list.filter((e) => ms(e.at) >= sinceMs)

  for (const r of results) {
    const before = remembered.get(r.key)
    if (r.outcome === 'ok') {
      remembered.set(r.key, { events: r.events, misses: 0 })
      events.push(...r.events)
      continue
    }
    if (r.outcome === 'unavailable') {
      if (before && before.misses < 1) {
        remembered.set(r.key, { events: before.events, misses: before.misses + 1 })
        events.push(...recent(before.events))
        errors.push({ courseName: r.courseName, source: r.source, message: 'Canvas did not answer; showing the earlier results' })
      } else {
        remembered.delete(r.key)
      }
      continue
    }
    if (before) {
      events.push(...recent(before.events))
      errors.push({ courseName: r.courseName, source: r.source, message: `${r.message}; showing the earlier results` })
    } else {
      errors.push({ courseName: r.courseName, source: r.source, message: r.message ?? 'Could not load' })
    }
  }

  const live = new Set(results.map((r) => r.key))
  for (const key of remembered.keys()) if (!live.has(key)) remembered.delete(key)

  events.sort((a, b) => ms(b.at) - ms(a.at) || a.id.localeCompare(b.id))
  return { events, errors, since: new Date(sinceMs).toISOString(), fetchedAt: fetchedAt.toISOString() }
}

/** One load of the course updates, without memory of earlier loads. */
export async function listCourseUpdates(client: CanvasClient, now: Date, days = UPDATE_DAYS): Promise<CourseUpdates> {
  const { results, sinceMs } = await fetchSources(client, now, days)
  return combineSources(results, new Map(), sinceMs, now)
}

/** Course updates with a 10-minute cache (the header Refresh forces a new load), remembering each source's last good result. */
export class UpdatesService {
  private cached: { at: number; value: CourseUpdates } | null = null
  private readonly remembered = new Map<string, Remembered>()

  constructor(
    private readonly client: CanvasClient,
    private readonly now: () => number = Date.now
  ) {}

  async list(force: boolean): Promise<CourseUpdates> {
    if (!force && this.cached && this.now() - this.cached.at < CACHE_MS) return this.cached.value
    const started = new Date(this.now())
    const { results, sinceMs } = await fetchSources(this.client, started, UPDATE_DAYS)
    const value = combineSources(results, this.remembered, sinceMs, started)
    this.cached = { at: this.now(), value }
    return value
  }
}
