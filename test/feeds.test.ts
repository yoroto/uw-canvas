import { mkdtempSync, existsSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedService } from '../src/main/feeds/feedService'
import { FEED_COLORS, FeedStore } from '../src/main/feeds/feedStore'
import { normaliseFeedUrl } from '../src/main/feeds/feedUrl'
import { fetchFeedText } from '../src/main/feeds/fetchText'

const SECRET = 'https://calendar.example.com/ical/abc123SECRET/basic.ics'

const calendar = (name: string | null, ...starts: string[]): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    ...(name ? [`X-WR-CALNAME:${name}`] : []),
    ...starts.flatMap((s, i) => ['BEGIN:VEVENT', `UID:e${i}`, 'DTSTAMP:20260101T000000Z', `SUMMARY:Event ${s}`, `DTSTART:${s}`, 'END:VEVENT']),
    'END:VCALENDAR'
  ].join('\r\n')

describe('normaliseFeedUrl', () => {
  it('rewrites webcal and webcals to https', () => {
    expect(normaliseFeedUrl('webcal://cal.example.com/a.ics')).toBe('https://cal.example.com/a.ics')
    expect(normaliseFeedUrl('WEBCALS://cal.example.com/a.ics?token=1')).toBe('https://cal.example.com/a.ics?token=1')
    expect(normaliseFeedUrl('  https://cal.example.com/a.ics \n')).toBe('https://cal.example.com/a.ics')
  })

  it.each(['http://cal.example.com/a.ics', 'file:///etc/passwd', 'javascript:alert(1)', 'ftp://x/y.ics', 'not a url', '', '   '])('rejects %j', (bad) => {
    expect(() => normaliseFeedUrl(bad)).toThrow()
  })
})

describe('FeedStore', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'feeds-'))
    file = join(dir, 'config', 'calendar-feeds.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('starts empty and creates the folder on first add', () => {
    const store = new FeedStore(file)
    expect(store.list()).toEqual([])
    expect(existsSync(file)).toBe(false)
    store.add('Soccer', 'webcal://cal.example.com/soccer.ics')
    expect(existsSync(file)).toBe(true)
  })

  it('saves feeds across restarts with the https url, a unique id and distinct colors', () => {
    const store = new FeedStore(file)
    const a = store.add('Soccer', 'webcal://cal.example.com/soccer.ics')
    const b = store.add('', 'https://cal.example.com/band.ics')
    expect(a.url).toBe('https://cal.example.com/soccer.ics')
    expect(b.name).toBe('cal.example.com')
    expect(a.id).not.toBe(b.id)
    expect(a.color).not.toBe(b.color)
    expect(FEED_COLORS).toContain(a.color)
    expect(new FeedStore(file).list()).toEqual([a, b])
  })

  it('rejects duplicates and unsupported urls without saving them', () => {
    const store = new FeedStore(file)
    store.add('A', 'webcal://cal.example.com/a.ics')
    expect(() => store.add('B', 'https://cal.example.com/a.ics')).toThrow(/already added/)
    expect(() => store.add('C', 'http://cal.example.com/c.ics')).toThrow()
    expect(new FeedStore(file).list()).toHaveLength(1)
  })

  it('removes a feed and reports whether it existed', () => {
    const store = new FeedStore(file)
    const a = store.add('A', 'https://cal.example.com/a.ics')
    expect(store.remove('nope')).toBe(false)
    expect(store.remove(a.id)).toBe(true)
    expect(new FeedStore(file).list()).toEqual([])
  })

  it('reuses a color once a feed is removed', () => {
    const store = new FeedStore(file)
    const a = store.add('A', 'https://cal.example.com/a.ics')
    store.add('B', 'https://cal.example.com/b.ics')
    store.remove(a.id)
    expect(store.add('C', 'https://cal.example.com/c.ics').color).toBe(a.color)
  })

  it('keeps the file private and leaves no temp file behind', () => {
    const store = new FeedStore(file)
    store.add('A', SECRET)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(existsSync(`${file}.tmp`)).toBe(false)
  })

  it('recovers from a corrupt file and drops invalid entries', () => {
    mkdirSync(join(dir, 'config'))
    writeFileSync(file, '{oops')
    expect(new FeedStore(file).list()).toEqual([])
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        feeds: [
          { id: '1', name: 'ok', url: 'https://a.example.com/x.ics', color: '#fff' },
          { id: '2', name: 'plain http', url: 'http://a.example.com/x.ics', color: '#fff' },
          { id: '3', name: 'missing url', color: '#fff' },
          'junk'
        ]
      })
    )
    expect(new FeedStore(file).list().map((f) => f.id)).toEqual(['1'])
  })

  it('hands out copies, not its own records', () => {
    const store = new FeedStore(file)
    store.add('A', 'https://cal.example.com/a.ics')
    store.list()[0].name = 'changed'
    expect(store.list()[0].name).toBe('A')
  })

  it('keeps the on-disk format readable', () => {
    new FeedStore(file).add('A', 'https://cal.example.com/a.ics')
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    expect(raw).toMatchObject({ version: 1, feeds: [{ name: 'A', url: 'https://cal.example.com/a.ics' }] })
  })
})

describe('fetchFeedText', () => {
  const response = (status: number, body = '', headers: Record<string, string> = {}): Response => new Response(body, { status, headers })

  it('returns the body of a successful response, requesting it with a timeout and without auto-redirects', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, 'BEGIN:VCALENDAR'))
    await expect(fetchFeedText(SECRET, fetchImpl)).resolves.toBe('BEGIN:VCALENDAR')
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'manual' })
    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('follows https redirects', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(302, '', { location: '/moved.ics' }))
      .mockResolvedValueOnce(response(200, 'ok'))
    await expect(fetchFeedText('https://cal.example.com/a.ics', fetchImpl)).resolves.toBe('ok')
    expect(fetchImpl.mock.calls[1][0]).toBe('https://cal.example.com/moved.ics')
  })

  it('refuses a redirect to plain http, and redirect loops', async () => {
    const toHttp = vi.fn().mockResolvedValue(response(301, '', { location: 'http://evil.example.com/a.ics' }))
    await expect(fetchFeedText(SECRET, toHttp)).rejects.toThrow(/non-https/)
    const loop = vi.fn().mockResolvedValue(response(302, '', { location: SECRET }))
    await expect(fetchFeedText(SECRET, loop)).rejects.toThrow(/too many/)
  })

  it('reports HTTP errors, network errors and timeouts without ever including the url', async () => {
    const cases: [() => Promise<Response>, RegExp][] = [
      [async () => response(404), /HTTP 404/],
      [async () => response(403), /HTTP 403/],
      [async () => { throw new TypeError(`fetch failed for ${SECRET}`) }, /Could not connect/],
      [async () => { throw Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' }) }, /too long/]
    ]
    for (const [impl, expected] of cases) {
      const error = await fetchFeedText(SECRET, vi.fn(impl)).catch((e: Error) => e)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toMatch(expected)
      expect((error as Error).message).not.toContain('SECRET')
    }
  })

  it('stops reading when a feed is larger than 5 MB', async () => {
    const big = 'x'.repeat(5 * 1024 * 1024 + 10)
    await expect(fetchFeedText(SECRET, vi.fn().mockResolvedValue(response(200, big)))).rejects.toThrow(/5 MB/)
    const declared = response(200, 'small', { 'content-length': String(6 * 1024 * 1024) })
    await expect(fetchFeedText(SECRET, vi.fn().mockResolvedValue(declared))).rejects.toThrow(/5 MB/)
  })
})

describe('FeedService', () => {
  let dir: string
  let store: FeedStore
  let clock: number
  const noon = '20261026T120000Z'
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'feedsvc-'))
    store = new FeedStore(join(dir, 'feeds.json'))
    clock = Date.UTC(2026, 9, 26, 0, 0, 0)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const service = (texts: Record<string, string | Error>) => {
    const fetchText = vi.fn(async (url: string) => {
      const t = texts[url]
      if (t === undefined) throw new Error('unexpected url')
      if (t instanceof Error) throw t
      return t
    })
    return { svc: new FeedService(store, fetchText, () => clock), fetchText }
  }

  it('adds a webcal feed over https, using the feed name and counting upcoming events', async () => {
    const { svc, fetchText } = service({ 'https://cal.example.com/a.ics': calendar('Soccer', noon, '20261028T120000Z', '20261201T120000Z') })
    const res = await svc.add('', 'webcal://cal.example.com/a.ics')
    expect(fetchText).toHaveBeenCalledWith('https://cal.example.com/a.ics')
    expect(res.feed).toMatchObject({ name: 'Soccer', host: 'cal.example.com' })
    expect(res.upcomingCount).toBe(2) // the December event is beyond 30 days
    expect(svc.list()).toHaveLength(1)
  })

  it('prefers the name the user typed and never exposes the url to the renderer', async () => {
    const { svc } = service({ [SECRET]: calendar('Calendar', noon) })
    const { feed } = await svc.add('  Band  ', SECRET)
    expect(feed.name).toBe('Band')
    expect(JSON.stringify(svc.list())).not.toContain('SECRET')
    expect(JSON.stringify(feed)).not.toContain('SECRET')
    expect(Object.keys(feed).sort()).toEqual(['color', 'host', 'id', 'name'])
  })

  it('does not save a url that is not a calendar, is unreachable, or is a duplicate', async () => {
    const { svc } = service({
      'https://cal.example.com/html': '<html>login</html>',
      'https://cal.example.com/down': new Error('The feed returned HTTP 500'),
      'https://cal.example.com/ok.ics': calendar('OK', noon)
    })
    await expect(svc.add('', 'https://cal.example.com/html')).rejects.toThrow(/iCalendar/)
    await expect(svc.add('', 'https://cal.example.com/down')).rejects.toThrow(/HTTP 500/)
    await expect(svc.add('', 'http://cal.example.com/ok.ics')).rejects.toThrow()
    expect(svc.list()).toEqual([])
    await svc.add('', 'https://cal.example.com/ok.ics')
    await expect(svc.add('', 'webcal://cal.example.com/ok.ics')).rejects.toThrow(/already added/)
    expect(svc.list()).toHaveLength(1)
  })

  it("returns each feed's events for the day, and one broken feed does not hide the others", async () => {
    const urls = { good: 'https://cal.example.com/good.ics', bad: 'https://cal.example.com/bad.ics' }
    const { svc } = service({ [urls.good]: calendar('Good', noon, '20261030T120000Z'), [urls.bad]: calendar('Bad', noon) })
    await svc.add('', urls.good)
    await svc.add('', urls.bad)
    // Make the second feed fail from now on.
    const failing = new FeedService(store, async (u) => { if (u === urls.bad) throw new Error('The feed returned HTTP 500'); return calendar('Good', noon, '20261030T120000Z') }, () => clock)
    const day = await failing.eventsForDay('2026-10-26')
    expect(day.events.map((e) => e.title)).toEqual(['Event ' + noon])
    expect(day.errors).toEqual([{ feedId: expect.any(String), feedName: 'Bad', message: 'The feed returned HTTP 500' }])
    expect((await failing.eventsForDay('2026-10-30')).events).toHaveLength(1)
    expect((await failing.eventsForDay('2026-10-27')).events).toEqual([])
  })

  it('caches downloads for 15 minutes and refresh() bypasses the cache', async () => {
    const url = 'https://cal.example.com/a.ics'
    const { svc, fetchText } = service({ [url]: calendar('A', noon) })
    await svc.add('', url)
    expect(fetchText).toHaveBeenCalledTimes(1)
    await svc.eventsForDay('2026-10-26')
    await svc.eventsForDay('2026-10-27')
    expect(fetchText).toHaveBeenCalledTimes(1) // add() primed the cache
    clock += 14 * 60_000
    await svc.eventsForDay('2026-10-26')
    expect(fetchText).toHaveBeenCalledTimes(1)
    clock += 2 * 60_000
    await svc.eventsForDay('2026-10-26')
    expect(fetchText).toHaveBeenCalledTimes(2)
    svc.refresh()
    await svc.eventsForDay('2026-10-26')
    expect(fetchText).toHaveBeenCalledTimes(3)
  })

  it('removes a feed and its cached data', async () => {
    const url = 'https://cal.example.com/a.ics'
    const { svc } = service({ [url]: calendar('A', noon) })
    const { feed } = await svc.add('', url)
    expect(svc.remove(feed.id)).toEqual([])
    expect(await svc.eventsForDay('2026-10-26')).toEqual({ events: [], errors: [] })
    expect(svc.remove('missing')).toEqual([])
  })
})
