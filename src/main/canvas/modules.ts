import type { ModuleItemView, ModulesResult, ModuleView } from '../../shared/modules/types'
import { CanvasError } from '../errors'
import type { CanvasClient } from './CanvasClient'

const CACHE_MS = 30 * 60 * 1000

interface RawItem {
  id: string | number
  title?: string | null
  type?: string
  html_url?: string | null
  position?: number
  indent?: number
  published?: boolean
  content_details?: { due_at?: string | null } | null
}

interface RawModule {
  id: string | number
  name?: string | null
  position?: number
  published?: boolean
  items_count?: number
  items?: RawItem[] | null
}

const toItem = (raw: RawItem): ModuleItemView | null => {
  // Sub-headers have no page to open, and unpublished items are not for students.
  if (!raw.html_url || raw.published === false) return null
  return {
    id: String(raw.id),
    title: raw.title?.trim() || '(Untitled)',
    type: raw.type ?? 'Item',
    htmlUrl: raw.html_url,
    dueAt: raw.content_details?.due_at ?? null,
    position: raw.position ?? 0,
    indent: raw.indent ?? 0
  }
}

/**
 * A course's modules with their items and due dates. Canvas leaves the items out
 * of very large modules, so those are fetched one module at a time.
 */
export async function fetchCourseModules(client: CanvasClient, courseId: string): Promise<ModuleView[]> {
  const modules = await client.getAll<RawModule>(`/api/v1/courses/${courseId}/modules`, { 'include[]': ['items', 'content_details'] })
  const out: ModuleView[] = []
  for (const m of modules) {
    if (m.published === false) continue
    let rawItems = m.items
    if (!rawItems && (m.items_count ?? 0) > 0) {
      rawItems = await client.getAll<RawItem>(`/api/v1/courses/${courseId}/modules/${m.id}/items`, { 'include[]': ['content_details'] })
    }
    out.push({
      id: String(m.id),
      name: m.name?.trim() || '(Untitled module)',
      position: m.position ?? 0,
      items: (rawItems ?? []).map(toItem).filter((i): i is ModuleItemView => i !== null)
    })
  }
  return out
}

/** A course that does not show modules to students (module tab hidden, no access). */
const isUnavailable = (e: unknown): boolean =>
  e instanceof CanvasError && e.code !== 'rate-limit' && (e.code === 'unauthenticated' || e.status === 401 || e.status === 403 || e.status === 404)

/**
 * Modules per course, cached for 30 minutes. If a course cannot be loaded, its
 * earlier modules stay (with a note) instead of vanishing.
 */
export class ModulesService {
  private cache = new Map<string, { at: number; modules: ModuleView[] }>()

  constructor(
    private readonly client: CanvasClient,
    private readonly now: () => number = Date.now
  ) {}

  async list(courseIds: readonly string[], force: boolean): Promise<ModulesResult> {
    type Outcome = { id: string; modules: ModuleView[]; error?: string }
    const load = async (id: string): Promise<Outcome> => {
      const hit = this.cache.get(id)
      if (!force && hit && this.now() - hit.at < CACHE_MS) return { id, modules: hit.modules }
      try {
        const modules = await fetchCourseModules(this.client, id)
        this.cache.set(id, { at: this.now(), modules })
        return { id, modules }
      } catch (e) {
        if (e instanceof CanvasError && e.code === 'unauthenticated' && e.status !== 401) throw e // a real sign-out
        if (isUnavailable(e)) {
          this.cache.delete(id)
          return { id, modules: [] }
        }
        const message = e instanceof Error ? e.message : 'Could not load modules'
        return { id, modules: hit?.modules ?? [], error: hit ? `${message}; showing the earlier modules` : message }
      }
    }

    const outcomes = await Promise.all(courseIds.map(load))
    const courses: ModulesResult['courses'] = {}
    const errors: ModulesResult['errors'] = []
    for (const o of outcomes) {
      courses[o.id] = o.modules
      if (o.error) errors.push({ courseId: o.id, message: o.error })
    }
    return { courses, errors, fetchedAt: new Date(this.now()).toISOString() }
  }
}
