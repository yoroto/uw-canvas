import { BLOCK_KINDS, WEEKDAYS, type Override, type ResolvedDay, type ScheduleBlock, type ScheduleFile, type Term, type Weekday } from './types'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

function isRealDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

/** Weekday of a "YYYY-MM-DD" date (calendar math only, no time zone involved). */
export function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split('-').map(Number)
  return WEEKDAYS[(new Date(y, m - 1, d).getDay() + 6) % 7]
}

function checkBlocks(blocks: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(blocks)) {
    errors.push(`${path}: expected an array of blocks`)
    return
  }
  let prevEnd = ''
  blocks.forEach((b: Partial<ScheduleBlock> | null, i) => {
    const at = `${path}[${i}]`
    if (typeof b !== 'object' || b === null) return void errors.push(`${at}: expected an object`)
    if (typeof b.title !== 'string' || b.title.trim() === '') errors.push(`${at}: missing title`)
    if (!BLOCK_KINDS.includes(b.kind as never)) errors.push(`${at}: unknown kind "${String(b.kind)}"`)
    const startOk = typeof b.start === 'string' && TIME.test(b.start)
    const endOk = typeof b.end === 'string' && TIME.test(b.end)
    if (!startOk) errors.push(`${at}: bad start time "${String(b.start)}" (use HH:MM, 24-hour)`)
    if (!endOk) errors.push(`${at}: bad end time "${String(b.end)}" (use HH:MM, 24-hour)`)
    if (!startOk || !endOk) return
    if (b.start! >= b.end!) errors.push(`${at}: ${b.title ?? 'block'} ends (${b.end}) before it starts (${b.start})`)
    if (b.start! < prevEnd) errors.push(`${at}: ${b.title ?? 'block'} (${b.start}) overlaps or comes before the previous block (ends ${prevEnd})`)
    prevEnd = b.end!
  })
}

/** Inclusive range a term covers; a missing date is open-ended. */
function span(t: Pick<Term, 'startDate' | 'endDate'>): [string, string] {
  return [t.startDate ?? '0000-01-01', t.endDate ?? '9999-12-31']
}

function overrideRange(o: Override): [string, string] | null {
  if (o.date) return [o.date, o.date]
  if (o.from && o.to) return [o.from, o.to]
  return null
}

/** Returns a list of problems with a parsed schedule file; empty = valid. */
export function validateSchedule(raw: unknown): string[] {
  const errors: string[] = []
  const file = raw as Partial<ScheduleFile> | null
  if (typeof file !== 'object' || file === null) return ['schedule: expected an object']
  if (file.schemaVersion !== 1) errors.push(`schemaVersion: expected 1, got ${String(file.schemaVersion)}`)
  if (typeof file.timezone !== 'string' || !file.timezone) errors.push('timezone: missing')
  if (!Array.isArray(file.terms)) return [...errors, 'terms: expected an array']

  const ids = new Set<string>()
  file.terms.forEach((t: Partial<Term>, ti) => {
    const tp = `terms[${ti}]`
    if (typeof t.id !== 'string' || !t.id) errors.push(`${tp}: missing id`)
    else if (ids.has(t.id)) errors.push(`${tp}: duplicate id "${t.id}"`)
    else ids.add(t.id)
    if (typeof t.name !== 'string' || !t.name) errors.push(`${tp}: missing name`)

    for (const key of ['startDate', 'endDate'] as const) {
      if (t[key] !== null && !isRealDate(t[key])) errors.push(`${tp}.${key}: expected "YYYY-MM-DD" or null`)
    }
    if (isRealDate(t.startDate) && isRealDate(t.endDate) && t.startDate > t.endDate) errors.push(`${tp}: startDate is after endDate`)

    if (t.building) {
      for (const key of ['opens', 'closes'] as const) {
        if (!TIME.test(String(t.building[key]))) errors.push(`${tp}.building.${key}: bad time`)
      }
    }

    if (typeof t.weekly !== 'object' || t.weekly === null) {
      errors.push(`${tp}.weekly: expected an object`)
    } else {
      for (const [day, blocks] of Object.entries(t.weekly)) {
        if (!WEEKDAYS.includes(day as Weekday)) errors.push(`${tp}.weekly: unknown weekday "${day}"`)
        else checkBlocks(blocks, `${tp}.weekly.${day}`, errors)
      }
    }

    if (!Array.isArray(t.overrides)) return void errors.push(`${tp}.overrides: expected an array`)
    const ranges: [string, string, number][] = []
    t.overrides.forEach((o: Override, oi) => {
      const op = `${tp}.overrides[${oi}]`
      const range = overrideRange(o)
      const datesOk = o.date ? isRealDate(o.date) && !o.from && !o.to : isRealDate(o.from) && isRealDate(o.to) && o.from <= o.to
      if (!range || !datesOk) errors.push(`${op}: give either "date", or "from" and "to" (from <= to), as YYYY-MM-DD`)
      const modes = [o.use !== undefined, o.blocks !== undefined, o.closed !== undefined].filter(Boolean).length
      if (modes !== 1) errors.push(`${op}: give exactly one of "use", "blocks", "closed"`)
      if (o.use !== undefined && !WEEKDAYS.includes(o.use)) errors.push(`${op}.use: unknown weekday "${String(o.use)}"`)
      if (o.closed !== undefined && o.closed !== true) errors.push(`${op}.closed: must be true`)
      if (o.blocks !== undefined) checkBlocks(o.blocks, `${op}.blocks`, errors)
      if (range && datesOk) {
        if (t.startDate && t.endDate && (range[0] < t.startDate || range[1] > t.endDate)) errors.push(`${op}: falls outside the term dates`)
        for (const [a, b, other] of ranges) {
          if (range[0] <= b && a <= range[1]) errors.push(`${op}: overlaps overrides[${other}]`)
        }
        ranges.push([range[0], range[1], oi])
      }
    })
  })

  // Terms may only overlap when the earlier one is open-ended (no endDate): the later term then takes over.
  const valid = file.terms.filter((t) => (t.startDate === null || isRealDate(t.startDate)) && (t.endDate === null || isRealDate(t.endDate)))
  valid.forEach((a, i) =>
    valid.slice(i + 1).forEach((b) => {
      if (!(span(a)[0] <= span(b)[1] && span(b)[0] <= span(a)[1])) return
      const [first, second] = span(a)[0] <= span(b)[0] ? [a, b] : [b, a]
      if (span(first)[0] === span(second)[0]) errors.push(`terms "${a.id}" and "${b.id}" start on the same day`)
      else if (first.endDate !== null) errors.push(`terms "${first.id}" and "${second.id}" overlap`)
    })
  )
  return errors
}

/**
 * The schedule for one date: the term that covers it, an exception for that
 * day if there is one, otherwise the weekly pattern. When an open-ended term
 * and a later one both cover the date, the one that started last wins. A date
 * no term covers (or a weekday with no entry) resolves to an empty day.
 */
export function resolveDay(file: ScheduleFile, date: string): ResolvedDay {
  const term =
    file.terms
      .filter((t) => span(t)[0] <= date && date <= span(t)[1])
      .sort((a, b) => span(b)[0].localeCompare(span(a)[0]))[0] ?? null
  if (!term) return { date, term: null, source: 'none', closed: false, blocks: [] }

  const override = term.overrides.find((o) => {
    const r = overrideRange(o)
    return r !== null && r[0] <= date && date <= r[1]
  })
  if (override) {
    const label = override.label
    if (override.closed) return { date, term, source: 'override', label, closed: true, blocks: [] }
    const blocks: ScheduleBlock[] = override.blocks ?? term.weekly[override.use ?? weekdayOf(date)] ?? []
    return { date, term, source: 'override', label, closed: false, blocks }
  }

  const blocks = term.weekly[weekdayOf(date)]
  return blocks ? { date, term, source: 'weekly', closed: false, blocks } : { date, term, source: 'none', closed: false, blocks: [] }
}
