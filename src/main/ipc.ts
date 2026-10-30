import { ipcMain } from 'electron'
import { Channels, type IpcResult } from '../shared/types'
import type { AuthProvider } from './auth/AuthProvider'
import { listAssignments } from './canvas/assignments'
import { listCourses } from './canvas/courses'
import type { CanvasClient } from './canvas/CanvasClient'
import { CanvasError } from './errors'
import type { FeedService } from './feeds/feedService'
import type { SeenStore } from './store/seenStore'

// Wraps a handler so errors cross the IPC boundary as plain data.
function handle<A extends unknown[], T>(channel: string, fn: (...args: A) => Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
    try {
      return { ok: true, data: await fn(...(args as A)) }
    } catch (e) {
      if (e instanceof CanvasError) {
        return { ok: false, error: { code: e.code, message: e.message, status: e.status } }
      }
      return { ok: false, error: { code: 'unknown', message: e instanceof Error ? e.message : String(e) } }
    }
  })
}

// Renderer input is untrusted: check shapes before using it.
function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new CanvasError('unknown', 'Expected an array of strings')
  }
  return value
}

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new CanvasError('unknown', `Expected ${what} to be text`)
  return value
}

function asDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new CanvasError('unknown', 'Expected a date as YYYY-MM-DD')
  return value
}

/** One line per feature: register new endpoints here and in `CanvasBridge`. */
export function registerIpc(auth: AuthProvider, client: CanvasClient, seenStore: SeenStore, feeds: FeedService): void {
  handle(Channels.authStatus, async () => ({ signedIn: await auth.isSignedIn() }))
  handle(Channels.authLogin, async () => ({ signedIn: await auth.signIn() }))
  handle(Channels.authLogout, async () => {
    await auth.signOut()
    return { signedIn: false }
  })

  handle(Channels.coursesList, () => listCourses(client))
  handle(Channels.assignmentsList, async () => {
    const result = await listAssignments(client)
    return { ...result, seen: seenStore.reconcile(result.items) }
  })
  handle(Channels.seenMark, async (keys: unknown) => seenStore.markSeen(asStringArray(keys)))

  handle(Channels.feedsList, async () => feeds.list())
  handle(Channels.feedsAdd, (name: unknown, url: unknown) => feeds.add(asString(name, 'name'), asString(url, 'url')))
  handle(Channels.feedsRemove, async (id: unknown) => feeds.remove(asString(id, 'id')))
  handle(Channels.feedsRefresh, async () => {
    feeds.refresh()
    return null
  })
  handle(Channels.feedsEvents, (date: unknown) => feeds.eventsForDay(asDate(date)))
}
