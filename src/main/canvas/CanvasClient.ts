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
  /** When Canvas reports fewer than this many requests left in its rate-limit bucket, slow down. */
  lowQuotaRemaining?: number
  /** The pause between requests while the quota is low. */
  lowQuotaGapMs?: number
  /** How many requests may be in flight at once (separate loads share this client). */
  maxConcurrent?: number
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Read-only Canvas API client. All features go through `get` / `getAll`, so
 * auth, throttling, pagination and error mapping live in one place.
 */
export class CanvasClient {
  private active = 0
  private readonly waiting: (() => void)[] = []
  /** Earliest time the next request may start. */
  private nextStart = 0
  private readonly maxConcurrent: number
  private readonly minGapMs: number
  private readonly perPage: number
  private readonly maxPages: number
  private readonly lowQuotaRemaining: number
  private readonly lowQuotaGapMs: number
  private lowQuota = false

  constructor(
    private readonly auth: AuthProvider,
    opts: ClientOptions = {}
  ) {
    this.minGapMs = opts.minGapMs ?? 150
    this.perPage = opts.perPage ?? 100
    this.maxPages = opts.maxPages ?? 100
    this.lowQuotaRemaining = opts.lowQuotaRemaining ?? 100
    this.lowQuotaGapMs = opts.lowQuotaGapMs ?? 1500
    this.maxConcurrent = Math.max(1, opts.maxConcurrent ?? 3)
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

  /**
   * Like `getAll`, for lists sorted newest first: stops after the page whose
   * last item `isOld` says is past the cutoff (at most `maxPages` pages), so
   * long histories are not downloaded in full.
   */
  async getRecent<T>(path: string, query: Query, isOld: (lastItem: T) => boolean, maxPages = 3): Promise<T[]> {
    const all: T[] = []
    let url: string | null = this.buildUrl(path, { per_page: this.perPage, ...query })
    for (let page = 0; url && page < maxPages; page++) {
      const res: { body: T[]; next: string | null } = await this.request<T[]>(url)
      all.push(...res.body)
      if (res.body.length > 0 && isOld(res.body[res.body.length - 1])) break
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

  // At most `maxConcurrent` requests run at once, first come first served, and their starts are at least
  // `minGapMs` apart (longer while Canvas says the quota is low). Independent loads therefore overlap
  // instead of queueing behind each other.
  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++
      return Promise.resolve()
    }
    return new Promise((resolve) => this.waiting.push(resolve)) // the slot is handed over when one is released
  }

  private release(): void {
    const next = this.waiting.shift()
    if (next) next()
    else this.active--
  }

  private async schedule<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      const start = Math.max(Date.now(), this.nextStart)
      this.nextStart = start + this.minGapMs
      if (start > Date.now()) await sleep(start - Date.now())
      return await fn()
    } finally {
      if (this.lowQuota) this.nextStart = Math.max(this.nextStart, Date.now() + this.lowQuotaGapMs)
      this.release()
    }
  }

  private request<T>(url: string): Promise<{ body: T; next: string | null }> {
    return this.schedule(async () => {
      const res = await this.auth.fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json+canvas-string-ids' }
      })

      // Canvas tells us how much of its rate-limit bucket is left; ease off before it runs out.
      const remaining = res.headers.get('x-rate-limit-remaining')
      if (remaining !== null && Number.isFinite(Number(remaining))) this.lowQuota = Number(remaining) < this.lowQuotaRemaining

      // With redirect: 'manual', an expired session shows up as 401 or a redirect to login.
      if (res.status === 401 || (res.status >= 300 && res.status < 400) || res.type === 'opaqueredirect') {
        throw new CanvasError('unauthenticated', 'Not signed in to Canvas', res.status)
      }
      if (res.status === 403 && /rate limit/i.test(await res.text().catch(() => ''))) {
        throw new CanvasError('rate-limit', 'Canvas is limiting requests right now; wait a minute and refresh', 403)
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
