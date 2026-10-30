// Types and IPC contract shared by main, preload and renderer.
import type { AssignmentsPayload, Fingerprint } from './assignments/types'
import type { DayFeedEvents, FeedInfo } from './daily/types'
import type { ModulesResult } from './modules/types'
import type { CourseUpdates } from './updates/updates'

export interface Term {
  id: string
  name: string
  start_at: string | null
  end_at: string | null
}

// Canvas IDs are strings: we request `application/json+canvas-string-ids`
// because sharded IDs can exceed Number.MAX_SAFE_INTEGER.
export interface Course {
  id: string
  // Courses hidden by date restrictions only carry `id` and `access_restricted_by_date`.
  name?: string
  course_code?: string
  workflow_state?: 'unpublished' | 'available' | 'completed' | 'deleted'
  enrollment_term_id?: string
  term?: Term
  start_at?: string | null
  end_at?: string | null
  access_restricted_by_date?: boolean
}

export interface AuthStatus {
  signedIn: boolean
}

export type ErrorCode = 'unauthenticated' | 'rate-limit' | 'http' | 'network' | 'parse' | 'unknown'

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; status?: number } }

export const Channels = {
  authStatus: 'auth:status',
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  coursesList: 'courses:list',
  assignmentsList: 'assignments:list',
  seenMark: 'seen:mark',
  feedsList: 'feeds:list',
  feedsAdd: 'feeds:add',
  feedsRemove: 'feeds:remove',
  feedsRefresh: 'feeds:refresh',
  feedsEvents: 'feeds:events',
  updatesList: 'updates:list',
  modulesList: 'modules:list'
} as const

// What the renderer sees as `window.canvas`. Add one entry per feature.
export interface CanvasBridge {
  auth: {
    status(): Promise<IpcResult<AuthStatus>>
    login(): Promise<IpcResult<AuthStatus>>
    logout(): Promise<IpcResult<AuthStatus>>
  }
  courses: {
    list(): Promise<IpcResult<Course[]>>
  }
  assignments: {
    list(): Promise<IpcResult<AssignmentsPayload>>
  }
  seen: {
    /** Marks these assignments as seen; resolves to the updated seen map. */
    mark(keys: string[]): Promise<IpcResult<Record<string, Fingerprint>>>
  }
  feeds: {
    list(): Promise<IpcResult<FeedInfo[]>>
    /** Checks the URL is a calendar feed, then saves it. An empty name uses the feed's own name. */
    add(name: string, url: string): Promise<IpcResult<{ feed: FeedInfo; upcomingCount: number }>>
    remove(id: string): Promise<IpcResult<FeedInfo[]>>
    /** Forget downloaded feeds so the next read fetches them again. */
    refresh(): Promise<IpcResult<null>>
    /** Feed events touching a day (YYYY-MM-DD), plus per-feed errors. */
    events(date: string): Promise<IpcResult<DayFeedEvents>>
  }
  updates: {
    /** Announcements, discussions, files and pages changed in the last 30 days. `force` skips the 10-minute cache. */
    list(force: boolean): Promise<IpcResult<CourseUpdates>>
  }
  modules: {
    /** The modules (with items and due dates) of up to 12 courses, by course id. `force` skips the 30-minute cache. */
    list(courseIds: string[], force: boolean): Promise<IpcResult<ModulesResult>>
  }
}
