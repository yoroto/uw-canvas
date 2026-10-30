import { CANVAS_ORIGIN } from '../config'
import { CanvasError } from '../errors'
import type { AuthProvider } from '../auth/AuthProvider'

export type QueryValue = string | number | boolean | undefined | readonly (string | number)[]
export type Query = Record<string, QueryValue>

interface ClientOptions {
  /** Pause between requests, so we stay well inside Canvas rate limits. */
  minGapMs?: number
  perPage?: number
  /** Safety cap on pagination. */
  maxPages?: number
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Read-only Canvas API client. All features go through `get` / `getAll`, so
 * auth, throttling, pagination and error mapping live in one place.
 */
export class CanvasClient {
  private queue: Promise<unknown> = Promise.resolve()
  private readonly minGapMs: number
  private readonly perPage: number
  private readonly maxPages: number

  constructor(
    private readonly auth: AuthProvider,
    opts: ClientOptions = {}
  ) {
    this.minGapMs = opts.minGapMs ?? 150
    this.perPage = opts.perPage ?? 100
    this.maxPages = opts.maxPages ?? 100
  }

  /** Single request. `path` is relative to the Canvas origin, e.g. `/api/v1/users/self`. */
  async get<T>(path: string, query: Query = {}): Promise<T> {
    return (await this.request<T>(this.buildUrl(path, query))).body
  }

  /** Follows `Link: rel="next"` and concatenates every page of a list endpoint. */
  async getAll<T>(path: string, query: Query = {}): Promise<T[]> {
    const all: T[] = []
    let url: string | null = this.buildUrl(path, { per_page: this.perPage, ...query })
    for (let page = 0; url && page < this.maxPages; page++) {
      const res: { body: T[]; next: string | null } = await this.request<T[]>(url)
      all.push(...res.body)
      url = res.next
    }
    return all
  }

  private buildUrl(path: string, query: Query): string {
    if (!path.startsWith('/api/v1/')) {
      throw new CanvasError('unknown', `Not a Canvas API path: ${path}`)
    }
    const url = new URL(path, CANVAS_ORIGIN)
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue
      for (const v of Array.isArray(value) ? value : [value]) {
        url.searchParams.append(key, String(v))
      }
    }
    return url.toString()
  }

  // Serialise requests with a minimum gap between them.
  private schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn)
    this.queue = run.then(
      () => sleep(this.minGapMs),
      () => sleep(this.minGapMs)
    )
    return run
  }

  private request<T>(url: string): Promise<{ body: T; next: string | null }> {
    return this.schedule(async () => {
      const res = await this.auth.fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json+canvas-string-ids' }
      })

      // With redirect: 'manual', an expired session shows up as 401 or a redirect to login.
      if (res.status === 401 || (res.status >= 300 && res.status < 400) || res.type === 'opaqueredirect') {
        throw new CanvasError('unauthenticated', 'Not signed in to Canvas', res.status)
      }
      if (!res.ok) {
        throw new CanvasError('http', `Canvas returned ${res.status} for ${new URL(url).pathname}`, res.status)
      }

      // Session-authenticated JSON can be prefixed with `while(1);` (anti-hijacking).
      const text = (await res.text()).replace(/^while\(1\);/, '')
      let body: T
      try {
        body = JSON.parse(text) as T
      } catch {
        throw new CanvasError('parse', 'Canvas returned a response that is not JSON')
      }
      return { body, next: parseNextLink(res.headers.get('link')) }
    })
  }
}

function parseNextLink(header: string | null): string | null {
  if (!header) return null
  for (const part of header.split(',')) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/)
    if (m) return m[1]
  }
  return null
}
