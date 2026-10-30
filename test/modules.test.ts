import { describe, expect, it, vi } from 'vitest'
import { fetchCourseModules, ModulesService } from '../src/main/canvas/modules'
import type { CanvasClient } from '../src/main/canvas/CanvasClient'
import { CanvasError } from '../src/main/errors'
import { itemsDueOnDay, moduleItemTypeLabel } from '../src/shared/modules/dayItems'
import type { ModuleView } from '../src/shared/modules/types'
import { validateSchedule } from '../src/shared/schedule/schedule'
import type { ScheduleFile } from '../src/shared/schedule/types'
import schedule from '../data/schedule.json'
import { at } from './helpers'

const item = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  title,
  type: 'Assignment',
  html_url: `https://canvas.uw.edu/courses/1/modules/items/${id}`,
  position: Number(id),
  indent: 0,
  content_details: { due_at: null },
  ...over
})

function clientFor(routes: Record<string, unknown>) {
  const calls: { path: string; query: Record<string, unknown> }[] = []
  const client = {
    getAll: vi.fn(async (path: string, query: Record<string, unknown> = {}) => {
      calls.push({ path, query })
      const r = routes[path]
      if (r instanceof Error) throw r
      if (typeof r === 'function') return (r as () => unknown)()
      return r ?? []
    })
  } as unknown as CanvasClient
  return { client, calls }
}

describe('fetchCourseModules', () => {
  it('asks for items and their due dates, and keeps clickable published items', async () => {
    const { client, calls } = clientFor({
      '/api/v1/courses/1/modules': [
        {
          id: '10',
          name: ' Week 1 ',
          position: 1,
          items: [
            item('1', 'Reading quiz', { type: 'Quiz', content_details: { due_at: '2026-10-28T06:59:00Z' } }),
            item('2', 'Unit overview', { html_url: null, type: 'SubHeader' }),
            item('3', 'Draft', { published: false }),
            item('4', 'Notes page', { type: 'Page' })
          ]
        },
        { id: '11', name: 'Hidden module', position: 2, published: false, items: [item('5', 'x')] }
      ]
    })
    const modules = await fetchCourseModules(client, '1')
    expect(calls[0].query).toEqual({ 'include[]': ['items', 'content_details'] })
    expect(modules).toEqual([
      {
        id: '10',
        name: 'Week 1',
        position: 1,
        items: [
          { id: '1', title: 'Reading quiz', type: 'Quiz', htmlUrl: 'https://canvas.uw.edu/courses/1/modules/items/1', dueAt: '2026-10-28T06:59:00Z', position: 1, indent: 0 },
          { id: '4', title: 'Notes page', type: 'Page', htmlUrl: 'https://canvas.uw.edu/courses/1/modules/items/4', dueAt: null, position: 4, indent: 0 }
        ]
      }
    ])
  })

  it('fetches the items of a large module separately, with due dates', async () => {
    const { client, calls } = clientFor({
      '/api/v1/courses/1/modules': [
        { id: '10', name: 'Big module', position: 1, items_count: 2 }, // no items key: Canvas left them out
        { id: '11', name: 'Empty', position: 2, items_count: 0 }
      ],
      '/api/v1/courses/1/modules/10/items': [item('1', 'HW 1', { content_details: { due_at: '2026-10-28T06:59:00Z' } }), item('2', 'HW 2')]
    })
    const modules = await fetchCourseModules(client, '1')
    expect(modules.map((m) => m.items.length)).toEqual([2, 0])
    expect(calls.map((c) => c.path)).toEqual(['/api/v1/courses/1/modules', '/api/v1/courses/1/modules/10/items'])
    expect(calls[1].query).toEqual({ 'include[]': ['content_details'] })
  })

  it('copes with missing names and empty courses', async () => {
    expect(await fetchCourseModules(clientFor({}).client, '1')).toEqual([])
    const { client } = clientFor({ '/api/v1/courses/1/modules': [{ id: '1', items: [item('1', '')] }] })
    const [m] = await fetchCourseModules(client, '1')
    expect(m.name).toBe('(Untitled module)')
    expect(m.items[0].title).toBe('(Untitled)')
  })
})

describe('ModulesService', () => {
  const mod = (name: string) => [{ id: '1', name, position: 1, items: [] }]

  it('caches each course for 30 minutes and force reloads', async () => {
    const { client, calls } = clientFor({ '/api/v1/courses/1/modules': mod('A') })
    let clock = 1_000_000
    const svc = new ModulesService(client, () => clock)
    await svc.list(['1'], false)
    await svc.list(['1'], false)
    expect(calls).toHaveLength(1)
    clock += 29 * 60_000
    await svc.list(['1'], false)
    expect(calls).toHaveLength(1)
    clock += 2 * 60_000
    await svc.list(['1'], false)
    expect(calls).toHaveLength(2)
    await svc.list(['1'], true)
    expect(calls).toHaveLength(3)
  })

  it('returns modules by course id with a load time', async () => {
    const { client } = clientFor({ '/api/v1/courses/1/modules': mod('A'), '/api/v1/courses/2/modules': mod('B') })
    const res = await new ModulesService(client, () => Date.UTC(2026, 9, 29)).list(['1', '2'], false)
    expect(Object.keys(res.courses)).toEqual(['1', '2'])
    expect(res.courses['2'][0].name).toBe('B')
    expect(res.errors).toEqual([])
    expect(res.fetchedAt).toBe('2026-10-29T00:00:00.000Z')
  })

  it('skips a course whose modules are not offered, without an error', async () => {
    const { client } = clientFor({ '/api/v1/courses/1/modules': new CanvasError('unauthenticated', 'unauthorized', 401), '/api/v1/courses/2/modules': mod('B') })
    const res = await new ModulesService(client).list(['1', '2'], false)
    expect(res.courses['1']).toEqual([])
    expect(res.courses['2']).toHaveLength(1)
    expect(res.errors).toEqual([])
  })

  it('keeps the earlier modules and says so when a reload fails, including for a rate limit', async () => {
    const routes: Record<string, unknown> = { '/api/v1/courses/1/modules': mod('Earlier') }
    const { client } = clientFor(routes)
    const svc = new ModulesService(client)
    await svc.list(['1'], false)
    routes['/api/v1/courses/1/modules'] = new CanvasError('http', 'Canvas returned 500', 500)
    let res = await svc.list(['1'], true)
    expect(res.courses['1'][0].name).toBe('Earlier')
    expect(res.errors).toEqual([{ courseId: '1', message: 'Canvas returned 500; showing the earlier modules' }])
    routes['/api/v1/courses/1/modules'] = new CanvasError('rate-limit', 'Canvas is limiting requests right now', 403)
    res = await svc.list(['1'], true)
    expect(res.courses['1'][0].name).toBe('Earlier')
    expect(res.errors[0].message).toMatch(/limiting/)
  })

  it('reports a first-time failure and passes a real sign-out up', async () => {
    const failing = clientFor({ '/api/v1/courses/1/modules': new CanvasError('http', 'boom', 500) })
    expect((await new ModulesService(failing.client).list(['1'], false)).errors).toEqual([{ courseId: '1', message: 'boom' }])
    const signedOut = clientFor({ '/api/v1/courses/1/modules': new CanvasError('unauthenticated', 'Not signed in', 302) })
    await expect(new ModulesService(signedOut.client).list(['1'], false)).rejects.toMatchObject({ code: 'unauthenticated' })
  })
})

describe('itemsDueOnDay', () => {
  const view = (id: string, title: string, dueAt: string | null, position = 1): ModuleView['items'][number] => ({
    id,
    title,
    type: 'Assignment',
    htmlUrl: `https://canvas.uw.edu/${id}`,
    dueAt,
    position,
    indent: 0
  })
  const modules: ModuleView[] = [
    {
      id: 'm2',
      name: 'Week 2',
      position: 2,
      items: [view('a', 'Essay', at(2026, 10, 28, 23, 59)), view('b', 'Reading', at(2026, 10, 29, 9)), view('c', 'Notes', null)]
    },
    {
      id: 'm1',
      name: 'Week 1',
      position: 1,
      items: [view('d', 'Quiz', at(2026, 10, 28, 9, 0)), view('e', 'Lab', at(2026, 10, 28, 9, 0), 2), view('a', 'Essay (again)', at(2026, 10, 28, 23, 59))]
    }
  ]

  it('lists the items due that local day, soonest first, then by module and item order', () => {
    const items = itemsDueOnDay(modules, '2026-10-28')
    expect(items.map((i) => [i.item.title, i.moduleName])).toEqual([
      ['Quiz', 'Week 1'],
      ['Lab', 'Week 1'],
      ['Essay (again)', 'Week 1']
    ])
  })

  it('lists an item that sits in two modules once, from the earlier module', () => {
    expect(itemsDueOnDay(modules, '2026-10-28').filter((i) => i.item.id === 'a')).toHaveLength(1)
  })

  it('respects day boundaries and ignores items with no due date', () => {
    expect(itemsDueOnDay(modules, '2026-10-29').map((i) => i.item.title)).toEqual(['Reading'])
    expect(itemsDueOnDay(modules, '2026-10-30')).toEqual([])
    const edge: ModuleView[] = [{ id: 'm', name: 'M', position: 1, items: [view('x', 'Midnight', at(2026, 10, 29, 0, 0)), view('y', 'Last minute', at(2026, 10, 28, 23, 59))] }]
    expect(itemsDueOnDay(edge, '2026-10-29').map((i) => i.item.title)).toEqual(['Midnight'])
    expect(itemsDueOnDay(edge, '2026-10-28').map((i) => i.item.title)).toEqual(['Last minute'])
  })

  it('returns nothing without modules and does not change its input', () => {
    expect(itemsDueOnDay([], '2026-10-28')).toEqual([])
    const copy = JSON.stringify(modules)
    itemsDueOnDay(modules, '2026-10-28')
    expect(JSON.stringify(modules)).toBe(copy)
  })
})

describe('courseNames in the schedule file', () => {
  const file = schedule as unknown as ScheduleFile
  const clone = (): ScheduleFile => JSON.parse(JSON.stringify(file))

  it('is valid as shipped, and optional', () => {
    expect(validateSchedule(file)).toEqual([])
    const f = clone()
    delete f.terms[0].courseNames
    expect(validateSchedule(f)).toEqual([])
  })

  it('rejects a map that is not title -> text', () => {
    const f = clone()
    f.terms[0].courseNames = ['Precalculus'] as never
    expect(validateSchedule(f).join('\n')).toMatch(/courseNames: expected an object/)
    f.terms[0].courseNames = { Precalc: 5 } as never
    expect(validateSchedule(f).join('\n')).toMatch(/courseNames\["Precalc"\]/)
    f.terms[0].courseNames = { Precalc: '  ' }
    expect(validateSchedule(f).join('\n')).toMatch(/courseNames\["Precalc"\]/)
  })
})

describe('moduleItemTypeLabel', () => {
  it('uses short labels and falls back to the Canvas type', () => {
    expect(moduleItemTypeLabel('ExternalUrl')).toBe('Link')
    expect(moduleItemTypeLabel('ExternalTool')).toBe('Tool')
    expect(moduleItemTypeLabel('Quiz')).toBe('Quiz')
    expect(moduleItemTypeLabel('Assignment')).toBe('Assignment')
    expect(moduleItemTypeLabel('Whatever')).toBe('Whatever')
  })
})
