import { describe, expect, it } from 'vitest'
import type { AuthProvider } from '../src/main/auth/AuthProvider'
import { CanvasClient } from '../src/main/canvas/CanvasClient'

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** An auth provider whose requests take a while, recording how many overlap and when they start. */
function probe(workMs = 15, failOn?: string) {
  const state = { inFlight: 0, maxInFlight: 0, starts: [] as { path: string; at: number }[] }
  const auth: AuthProvider = {
    isSignedIn: async () => true,
    signIn: async () => true,
    signOut: async () => undefined,
    fetch: async (url) => {
      const path = new URL(url).pathname
      state.starts.push({ path, at: Date.now() })
      state.inFlight++
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight)
      await delay(workMs)
      state.inFlight--
      if (path === failOn) return new Response('boom', { status: 500 })
      return new Response('{"ok":true}', { status: 200 })
    }
  }
  return { auth, state }
}

describe('CanvasClient concurrency', () => {
  it('runs up to three requests at once by default, and no more', async () => {
    const { auth, state } = probe()
    const client = new CanvasClient(auth, { minGapMs: 0 })
    await Promise.all(Array.from({ length: 9 }, (_, i) => client.get(`/api/v1/x${i}`)))
    expect(state.maxInFlight).toBe(3)
    expect(state.starts).toHaveLength(9)
  })

  it('honours a smaller limit, down to strictly one at a time', async () => {
    for (const limit of [1, 2]) {
      const { auth, state } = probe(8)
      const client = new CanvasClient(auth, { minGapMs: 0, maxConcurrent: limit })
      await Promise.all(Array.from({ length: 5 }, (_, i) => client.get(`/api/v1/x${i}`)))
      expect(state.maxInFlight).toBe(limit)
    }
  })

  it('starts requests in the order they were made', async () => {
    const { auth, state } = probe(5)
    const client = new CanvasClient(auth, { minGapMs: 0, maxConcurrent: 2 })
    await Promise.all(Array.from({ length: 6 }, (_, i) => client.get(`/api/v1/x${i}`)))
    expect(state.starts.map((s) => s.path)).toEqual(Array.from({ length: 6 }, (_, i) => `/api/v1/x${i}`))
  })

  it('keeps the minimum gap between request starts, even when several could run together', async () => {
    const { auth, state } = probe(5)
    const client = new CanvasClient(auth, { minGapMs: 30 })
    await Promise.all(Array.from({ length: 4 }, (_, i) => client.get(`/api/v1/x${i}`)))
    const times = state.starts.map((s) => s.at)
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(25)
  })

  it('a failed request frees its slot for the others', async () => {
    const { auth } = probe(5, '/api/v1/bad')
    const client = new CanvasClient(auth, { minGapMs: 0, maxConcurrent: 1 })
    const results = await Promise.allSettled([client.get('/api/v1/a'), client.get('/api/v1/bad'), client.get('/api/v1/c')])
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled'])
  })

  it('lets separate paginated loads overlap instead of waiting for each other', async () => {
    const { auth } = probe(40)
    const client = new CanvasClient(auth, { minGapMs: 0 })
    const t = Date.now()
    await Promise.all([client.get('/api/v1/a'), client.get('/api/v1/b'), client.get('/api/v1/c')])
    expect(Date.now() - t).toBeLessThan(100) // three 40 ms requests in parallel, not 120 ms in a row
  })
})
