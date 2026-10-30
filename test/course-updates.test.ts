import { describe, expect, it, vi } from 'vitest'
import type { AuthProvider } from '../src/main/auth/AuthProvider'
import { CanvasClient } from '../src/main/canvas/CanvasClient'
import { listCourseUpdates, UpdatesService } from '../src/main/canvas/updates'
import { CanvasError } from '../src/main/errors'

const now = new Date('2026-10-29T20:00:00Z') // since = 2026-09-29T20:00:00Z
const recent = (days: number): string => new Date(now.getTime() - days * 86_400_000).toISOString()

const courseList = (n = 2) =>
  Array.from({ length: n }, (_, i) => ({ id: String(i + 1), name: `Course ${i + 1}`, workflow_state: 'available' }))

type Handler = (query: Record<string, unknown>) => unknown
interface Stub {
  client: CanvasClient
  calls: { path: string; query: Record<string, unknown> }[]
}

/** A client that answers by URL path; list endpoints may also throw. */
function stub(routes: Record<string, unknown | Handler | Error>, courses = courseList()): Stub {
  const calls: Stub['calls'] = []
  const answer = (path: string, query: Record<string, unknown>): unknown => {
    calls.push({ path, query })
    const key = path === '/api/v1/courses' ? path : path.replace(/\/courses\/\d+\//, '/courses/:id/').replace(/\/conversations\/\d+$/, '/conversations/:id')
    const r = key === '/api/v1/courses' ? courses : routes[key]
    if (r instanceof Error) throw r
    if (typeof r === 'function') return (r as Handler)(query)
    return r ?? []
  }
  const client = {
    get: async (path: string, query: Record<string, unknown> = {}) => answer(path, query),
    getAll: async (path: string, query: Record<string, unknown> = {}) => answer(path, query),
    getRecent: async (path: string, query: Record<string, unknown> = {}, isOld: (x: never) => boolean = () => false) => {
      const list = answer(path, query) as never[]
      // behave like the real thing: stop after the first page of 2 whose last item is old
      const out: never[] = []
      for (let i = 0; i < list.length; i += 2) {
        const page = list.slice(i, i + 2)
        out.push(...page)
        if (isOld(page[page.length - 1])) break
      }
      return out
    }
  } as unknown as CanvasClient
  return { client, calls }
}

describe('listCourseUpdates: announcements', () => {
  it('asks once for all courses, with a date window, and keeps recent ones', async () => {
    const { client, calls } = stub({
      '/api/v1/announcements': [
        { id: '10', title: 'Midterm moved', posted_at: recent(1), html_url: 'https://canvas.uw.edu/courses/1/discussion_topics/10', context_code: 'course_1' },
        { id: '11', title: 'Old news', posted_at: recent(40), context_code: 'course_1' },
        { id: '12', title: 'Welcome', posted_at: recent(3), context_code: 'course_2' },
        { id: '13', title: 'Not my course', posted_at: recent(1), context_code: 'course_99' }
      ]
    })
    const res = await listCourseUpdates(client, now)
    const call = calls.find((c) => c.path === '/api/v1/announcements')!
    expect(call.query).toMatchObject({ 'context_codes[]': ['course_1', 'course_2'], start_date: '2026-09-29', end_date: '2026-10-30', active_only: true })
    expect(res.events.filter((e) => e.kind === 'announcement').map((e) => [e.title, e.courseName])).toEqual([
      ['Midterm moved', 'Course 1'],
      ['Welcome', 'Course 2']
    ])
  })

  it('splits more than ten courses into several requests', async () => {
    const { client, calls } = stub({}, courseList(12))
    await listCourseUpdates(client, now)
    const sizes = calls.filter((c) => c.path === '/api/v1/announcements').map((c) => (c.query['context_codes[]'] as string[]).length)
    expect(sizes).toEqual([10, 2])
  })

  it('falls back to a link when Canvas gives none', async () => {
    const { client } = stub({ '/api/v1/announcements': [{ id: '10', title: 'Hi', posted_at: recent(1), context_code: 'course_1' }] })
    const res = await listCourseUpdates(client, now)
    expect(res.events[0].url).toBe('https://canvas.uw.edu/courses/1/discussion_topics/10')
  })
})

describe('listCourseUpdates: discussions', () => {
  const topics = [
    { id: '1', title: 'Week 3 questions', posted_at: recent(5), last_reply_at: recent(1), html_url: 'https://canvas.uw.edu/courses/1/discussion_topics/1', published: true, discussion_subentry_count: 3 },
    { id: '2', title: 'Fresh topic', posted_at: recent(2), last_reply_at: recent(2), published: true },
    { id: '3', title: 'Draft', posted_at: recent(1), published: false },
    { id: '4', title: 'Ancient', posted_at: recent(90), last_reply_at: recent(60), published: true }
  ]

  it('reports new topics and the latest reply, skipping drafts and old ones', async () => {
    const { client } = stub({ '/api/v1/courses/:id/discussion_topics': topics })
    const res = await listCourseUpdates(client, now)
    const mine = res.events.filter((e) => e.courseId === '1' && (e.kind === 'discussion' || e.kind === 'discussion-reply'))
    expect(mine.map((e) => [e.kind, e.title, e.detail])).toEqual([
      ['discussion-reply', 'Week 3 questions', '3 replies in total'],
      ['discussion', 'Fresh topic', undefined],
      ['discussion', 'Week 3 questions', undefined]
    ])
  })
})

describe('listCourseUpdates: files and pages', () => {
  it('reports new and updated files, hiding hidden and old ones', async () => {
    const { client } = stub({
      '/api/v1/courses/:id/files': [
        { id: '7', display_name: 'syllabus.pdf', created_at: recent(2), updated_at: recent(2) },
        { id: '8', display_name: 'notes.pdf', created_at: recent(20), updated_at: recent(1) },
        { id: '9', display_name: 'secret.pdf', created_at: recent(1), updated_at: recent(1), hidden: true },
        { id: '6', display_name: 'ancient.pdf', created_at: recent(100), updated_at: recent(50) }
      ]
    })
    const res = await listCourseUpdates(client, now)
    const files = res.events.filter((e) => e.kind === 'file' && e.courseId === '1')
    expect(files.map((e) => [e.title, e.detail, e.url])).toEqual([
      ['notes.pdf', 'Updated', 'https://canvas.uw.edu/courses/1/files/8'],
      ['syllabus.pdf', 'New', 'https://canvas.uw.edu/courses/1/files/7']
    ])
  })

  it('reports pages, skipping unpublished and old ones', async () => {
    const { client } = stub({
      '/api/v1/courses/:id/pages': [
        { page_id: 1, url: 'week-3', title: 'Week 3', created_at: recent(10), updated_at: recent(1), html_url: 'https://canvas.uw.edu/courses/1/pages/week-3' },
        { page_id: 2, url: 'draft', title: 'Draft', created_at: recent(1), updated_at: recent(1), published: false },
        { page_id: 3, url: 'old', title: 'Old', created_at: recent(80), updated_at: recent(45) }
      ]
    })
    const res = await listCourseUpdates(client, now)
    expect(res.events.filter((e) => e.kind === 'page' && e.courseId === '1').map((e) => [e.title, e.detail])).toEqual([['Week 3', 'Updated']])
  })

  it('stops downloading once a newest-first list reaches old items', async () => {
    const files = Array.from({ length: 6 }, (_, i) => ({ id: String(i), display_name: `f${i}`, created_at: recent(i * 20), updated_at: recent(i * 20) }))
    const { client } = stub({ '/api/v1/courses/:id/files': files })
    const res = await listCourseUpdates(client, now)
    expect(res.events.filter((e) => e.kind === 'file' && e.courseId === '1').map((e) => e.title)).toEqual(['f0', 'f1'])
  })
})

describe('listCourseUpdates: problems', () => {
  it('quietly skips a source a course does not offer (Files turned off)', async () => {
    const { client } = stub({
      '/api/v1/courses/:id/files': new CanvasError('unauthenticated', 'unauthorized', 401),
      '/api/v1/courses/:id/pages': new CanvasError('http', 'not found', 404)
    })
    const res = await listCourseUpdates(client, now)
    expect(res.errors).toEqual([])
  })

  it('reports other failures without losing the rest', async () => {
    const { client } = stub({
      '/api/v1/announcements': [{ id: '1', title: 'Hello', posted_at: recent(1), context_code: 'course_1' }],
      '/api/v1/courses/:id/pages': new CanvasError('http', 'Canvas returned 500', 500)
    })
    const res = await listCourseUpdates(client, now)
    expect(res.events.map((e) => e.title)).toEqual(['Hello'])
    expect(res.errors).toEqual([
      { courseName: 'Course 1', source: 'pages', message: 'Canvas returned 500' },
      { courseName: 'Course 2', source: 'pages', message: 'Canvas returned 500' }
    ])
  })

  it('passes a real sign-out (redirect to login) up so the app can ask for a login', async () => {
    const { client } = stub({ '/api/v1/courses/:id/files': new CanvasError('unauthenticated', 'Not signed in', 302) })
    await expect(listCourseUpdates(client, now)).rejects.toMatchObject({ code: 'unauthenticated' })
  })

  it('returns events newest first, with the cutoff', async () => {
    const { client } = stub({
      '/api/v1/announcements': [
        { id: '1', title: 'Older', posted_at: recent(4), context_code: 'course_1' },
        { id: '2', title: 'Newer', posted_at: recent(1), context_code: 'course_2' }
      ]
    })
    const res = await listCourseUpdates(client, now)
    expect(res.events.map((e) => e.title)).toEqual(['Newer', 'Older'])
    expect(res.since).toBe('2026-09-29T20:00:00.000Z')
  })
})

describe('listCourseUpdates: inbox', () => {
  const ME = '900'
  const conversations = [
    { id: '1', subject: 'Question about Lab 4', last_message_at: recent(1), context_name: 'Course 1' },
    { id: '2', subject: null, last_message_at: recent(2), context_name: 'Some other group' },
    { id: '3', subject: 'Ancient thread', last_message_at: recent(60), context_name: 'Course 1' }
  ]
  const thread1 = {
    participants: [{ id: 900, name: 'Me' }, { id: 77, name: 'Dr. Rivera' }],
    messages: [
      { id: 'm3', created_at: recent(1), body: 'Yes, that works.\n\nSee you Thursday.', author_id: 77 },
      { id: 'm2', created_at: recent(1.5), body: 'Can I hand it in Friday?', author_id: 900 },
      { id: 'm1', created_at: recent(3), body: 'Lab 4 is due Wednesday.', author_id: 77 },
      { id: 'sys', created_at: recent(3), body: 'Dr. Rivera was added', author_id: 77, generated: true }
    ]
  }
  const thread2 = { participants: [{ id: 5, name: 'TA Sam' }], messages: [{ id: 'm9', created_at: recent(2), body: '', author_id: 5 }] }

  const routes = () => ({
    '/api/v1/users/self': { id: ME },
    '/api/v1/conversations': conversations
  })

  /** A stub whose conversation details depend on the conversation id in the path. */
  function inboxStub() {
    const byId: Record<string, unknown> = { '1': thread1, '2': thread2 }
    const base = stub(routes())
    const original = base.client.get.bind(base.client) as (path: string, query?: Record<string, unknown>) => Promise<unknown>
    ;(base.client as unknown as { get: unknown }).get = async (path: string, query: Record<string, unknown> = {}) => {
      const m = path.match(/\/conversations\/(\d+)$/)
      if (m) {
        base.calls.push({ path, query })
        return byId[m[1]]
      }
      return original(path, query)
    }
    return base
  }

  it('lists messages other people sent, one event each, without your own or system notes', async () => {
    const { client } = inboxStub()
    const res = await listCourseUpdates(client, now)
    const inbox = res.events.filter((e) => e.kind === 'message')
    expect(inbox.map((e) => [e.id, e.title, e.detail])).toEqual([
      ['message:1:m3', 'Question about Lab 4', 'Dr. Rivera: Yes, that works. See you Thursday.'],
      ['message:2:m9', '(No subject)', 'TA Sam'],
      ['message:1:m1', 'Question about Lab 4', 'Dr. Rivera: Lab 4 is due Wednesday.']
    ])
  })

  it('keeps showing an earlier message after you replied in the same thread', async () => {
    const { client } = inboxStub()
    const res = await listCourseUpdates(client, now)
    expect(res.events.some((e) => e.id === 'message:1:m1')).toBe(true)
  })

  it('takes the course from the conversation when its name matches, and links to the conversation', async () => {
    const { client } = inboxStub()
    const res = await listCourseUpdates(client, now)
    const first = res.events.find((e) => e.id === 'message:1:m3')!
    expect(first).toMatchObject({ courseId: '1', courseName: 'Course 1', url: 'https://canvas.uw.edu/conversations/1' })
    const other = res.events.find((e) => e.id === 'message:2:m9')!
    expect(other).toMatchObject({ courseId: '', courseName: 'Some other group' })
  })

  it('never marks a conversation as read, and skips threads with no news', async () => {
    const { client, calls } = inboxStub()
    await listCourseUpdates(client, now)
    const opened = calls.filter((c) => /\/conversations\/\d+$/.test(c.path))
    expect(opened.map((c) => c.path)).toEqual(['/api/v1/conversations/1', '/api/v1/conversations/2'])
    for (const c of opened) expect(c.query).toEqual({ auto_mark_as_read: false })
  })

  it('opens a conversation again only when it has a newer message', async () => {
    const { client, calls } = inboxStub()
    let clock = now.getTime()
    const svc = new UpdatesService(client, () => clock)
    const opens = (): number => calls.filter((c) => /\/conversations\/\d+$/.test(c.path)).length
    await svc.list(true)
    expect(opens()).toBe(2)
    clock += 60_000
    await svc.list(true)
    expect(opens()).toBe(2) // nothing changed: remembered
    conversations[0] = { ...conversations[0], last_message_at: recent(0.5) }
    await svc.list(true)
    expect(opens()).toBe(3)
    conversations[0] = { id: '1', subject: 'Question about Lab 4', last_message_at: recent(1), context_name: 'Course 1' }
  })

  it('quietly skips the inbox when Canvas will not show it, and reports other failures', async () => {
    const hidden = stub({ '/api/v1/conversations': new CanvasError('unauthenticated', 'unauthorized', 401) })
    expect((await listCourseUpdates(hidden.client, now)).errors).toEqual([])
    const broken = stub({ '/api/v1/users/self': { id: ME }, '/api/v1/conversations': new CanvasError('http', 'Canvas returned 500', 500) })
    expect((await listCourseUpdates(broken.client, now)).errors).toEqual([{ courseName: 'Inbox', source: 'inbox', message: 'Canvas returned 500' }])
  })
})

describe('UpdatesService keeps earlier results when a source stops answering', () => {
  const filesFor = (title: string, days = 1) => [{ id: '7', display_name: title, created_at: recent(days), updated_at: recent(days) }]

  /** Routes that can be swapped between loads. */
  function mutable(initial: Record<string, unknown>) {
    const routes: Record<string, unknown> = { ...initial }
    const { client } = stub(new Proxy(routes, { get: (target, key) => target[key as string] }) as Record<string, unknown>)
    return { client, routes }
  }

  const loads = async (svc: UpdatesService) => (await svc.list(true)).events.filter((e) => e.kind === 'file' && e.courseId === '1').map((e) => e.title)

  it('after a server error, still shows the files from the last good load and says so', async () => {
    const { client, routes } = mutable({ '/api/v1/courses/:id/files': filesFor('syllabus.pdf') })
    let clock = now.getTime()
    const svc = new UpdatesService(client, () => clock)
    expect(await loads(svc)).toEqual(['syllabus.pdf'])

    routes['/api/v1/courses/:id/files'] = new CanvasError('http', 'Canvas returned 500', 500)
    clock += 11 * 60_000
    const second = await svc.list(false)
    expect(second.events.filter((e) => e.kind === 'file' && e.courseId === '1').map((e) => e.title)).toEqual(['syllabus.pdf'])
    expect(second.errors).toContainEqual({ courseName: 'Course 1', source: 'files', message: 'Canvas returned 500; showing the earlier results' })
  })

  it('treats a rate limit as a failure, not as "this course has no files"', async () => {
    const { client, routes } = mutable({ '/api/v1/courses/:id/files': filesFor('syllabus.pdf') })
    const svc = new UpdatesService(client, () => now.getTime())
    await loads(svc)
    routes['/api/v1/courses/:id/files'] = new CanvasError('rate-limit', 'Canvas is limiting requests right now', 403)
    const res = await svc.list(true)
    expect(res.events.some((e) => e.kind === 'file' && e.courseId === '1')).toBe(true)
    expect(res.errors.some((e) => e.source === 'files' && /limiting/.test(e.message))).toBe(true)
  })

  it('keeps earlier results through one "unavailable" answer, then gives up on a source that is really gone', async () => {
    const { client, routes } = mutable({ '/api/v1/courses/:id/files': filesFor('syllabus.pdf') })
    const svc = new UpdatesService(client, () => now.getTime())
    await loads(svc)
    routes['/api/v1/courses/:id/files'] = new CanvasError('unauthenticated', 'unauthorized', 401)
    expect(await loads(svc)).toEqual(['syllabus.pdf'])
    expect((await svc.list(true)).errors).toEqual([])
    expect(await loads(svc)).toEqual([])
  })

  it('recovers when the source works again and drops events that fell out of the 30-day window', async () => {
    const { client, routes } = mutable({ '/api/v1/courses/:id/files': filesFor('old.pdf', 29) })
    let clock = now.getTime()
    const svc = new UpdatesService(client, () => clock)
    await loads(svc)
    routes['/api/v1/courses/:id/files'] = new CanvasError('http', 'boom', 500)
    clock += 2 * 86_400_000
    const during = await svc.list(true)
    expect(during.events.filter((e) => e.kind === 'file')).toEqual([]) // aged out of the window
    routes['/api/v1/courses/:id/files'] = filesFor('new.pdf', 0)
    clock += 60_000
    expect(await loads(svc)).toEqual(['new.pdf'])
    expect((await svc.list(true)).errors).toEqual([])
  })

  it('records when the events were loaded', async () => {
    const { client } = stub({})
    const res = await new UpdatesService(client, () => now.getTime()).list(false)
    expect(res.fetchedAt).toBe(now.toISOString())
  })
})

describe('UpdatesService', () => {
  it('caches for 10 minutes and force reloads', async () => {
    const { client, calls } = stub({})
    let clock = now.getTime()
    const svc = new UpdatesService(client, () => clock)
    const count = (): number => calls.filter((c) => c.path === '/api/v1/courses').length
    await svc.list(false)
    await svc.list(false)
    expect(count()).toBe(1)
    clock += 9 * 60_000
    await svc.list(false)
    expect(count()).toBe(1)
    clock += 2 * 60_000
    await svc.list(false)
    expect(count()).toBe(2)
    await svc.list(true)
    expect(count()).toBe(3)
  })
})

describe('CanvasClient.getRecent', () => {
  const page = (items: unknown[], next?: string): Response =>
    new Response(JSON.stringify(items), { status: 200, headers: next ? { link: `<${next}>; rel="next"` } : {} })

  function clientWith(responses: Response[]) {
    const fetch = vi.fn(async () => responses.shift() ?? page([]))
    const auth: AuthProvider = { fetch, isSignedIn: async () => true, signIn: async () => true, signOut: async () => undefined }
    return { client: new CanvasClient(auth, { minGapMs: 0 }), fetch }
  }
  const NEXT = 'https://canvas.uw.edu/api/v1/x?page=2'
  const NEXT3 = 'https://canvas.uw.edu/api/v1/x?page=3'

  it('stops after the page whose last item is old', async () => {
    const { client, fetch } = clientWith([page([{ d: 5 }, { d: 4 }], NEXT), page([{ d: 3 }, { d: 0 }], NEXT3), page([{ d: 9 }])])
    const items = await client.getRecent<{ d: number }>('/api/v1/x', {}, (last) => last.d === 0)
    expect(items.map((i) => i.d)).toEqual([5, 4, 3, 0])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('never reads more than maxPages and stops when there is no next page', async () => {
    const many = clientWith([page([{ d: 1 }], NEXT), page([{ d: 2 }], NEXT3), page([{ d: 3 }])])
    expect(await many.client.getRecent<{ d: number }>('/api/v1/x', {}, () => false, 2)).toHaveLength(2)
    expect(many.fetch).toHaveBeenCalledTimes(2)
    const one = clientWith([page([{ d: 1 }])])
    expect(await one.client.getRecent('/api/v1/x', {}, () => false)).toHaveLength(1)
    expect(one.fetch).toHaveBeenCalledTimes(1)
  })

  it('handles an empty list and refuses non-API paths', async () => {
    expect(await clientWith([page([])]).client.getRecent('/api/v1/x', {}, () => true)).toEqual([])
    await expect(clientWith([]).client.getRecent('/courses', {}, () => true)).rejects.toThrow(/Not a Canvas API path/)
  })
})

describe('CanvasClient rate limiting', () => {
  const ok = (remaining?: string): Response =>
    new Response('[]', { status: 200, headers: remaining === undefined ? {} : { 'x-rate-limit-remaining': remaining } })

  function clientWith(responses: Response[], opts = {}) {
    const fetch = vi.fn(async () => responses.shift() ?? ok())
    const auth: AuthProvider = { fetch, isSignedIn: async () => true, signIn: async () => true, signOut: async () => undefined }
    return new CanvasClient(auth, { minGapMs: 0, ...opts })
  }

  it('recognises Canvas\'s "Rate Limit Exceeded" 403 and reports it as such', async () => {
    const client = clientWith([new Response('403 Forbidden (Rate Limit Exceeded)\n', { status: 403 })])
    await expect(client.get('/api/v1/x')).rejects.toMatchObject({ code: 'rate-limit', status: 403 })
  })

  it('leaves other 403s as ordinary HTTP errors', async () => {
    const client = clientWith([new Response('forbidden', { status: 403 })])
    await expect(client.get('/api/v1/x')).rejects.toMatchObject({ code: 'http', status: 403 })
  })

  it('waits longer between requests while the remaining quota is low, and speeds up again after', async () => {
    const client = clientWith([ok('50'), ok(), ok('600'), ok()], { lowQuotaGapMs: 60, lowQuotaRemaining: 100 })
    await client.get('/api/v1/x') // reports 50 left: the next request should wait ~60 ms
    let t = Date.now()
    await client.get('/api/v1/x') // no header: quota state unchanged, still waited ~60 ms before this
    expect(Date.now() - t).toBeGreaterThanOrEqual(50)
    await client.get('/api/v1/x') // reports 600 left: back to normal
    t = Date.now()
    await client.get('/api/v1/x')
    expect(Date.now() - t).toBeLessThan(40)
  })
})
