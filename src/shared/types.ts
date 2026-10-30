// Types and IPC contract shared by main, preload and renderer.
import type { AssignmentsPayload, Fingerprint } from './assignments/types'

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

export type ErrorCode = 'unauthenticated' | 'http' | 'network' | 'parse' | 'unknown'

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; status?: number } }

export const Channels = {
  authStatus: 'auth:status',
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  coursesList: 'courses:list',
  assignmentsList: 'assignments:list',
  seenMark: 'seen:mark'
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
}
