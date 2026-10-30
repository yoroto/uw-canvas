import { deriveStatus, type Status } from '../assignments/status'
import type { AssignmentView, Fingerprint } from '../assignments/types'
import { describeChange, type ChangeKind } from './fingerprint'
import { RULES_BY_ID, zoneOf, type RuleContext, type RuleDef, type Zone } from './rules'
import { DEFAULT_SETTINGS, type RuleSetting } from './settings'

export interface RankedItem {
  item: AssignmentView
  status: Status
  zone: Zone
  change: ChangeKind | null
  /** The rule that placed this item, or null if it fell to the fallback order. */
  rule: { id: string; reason: string; description: string } | null
}

export interface RankedResult {
  toDo: RankedItem[]
  turnedIn: RankedItem[]
}

interface Entry {
  ctx: RuleContext
  zone: Zone
  /** Position of the matching rule in the enabled list for the zone; Infinity if none. */
  position: number
  rule: RuleDef | null
}

const ms = (iso: string | null): number | null => (iso ? new Date(iso).getTime() : null)

// To do: soonest deadline first, undated last. Turned in: most recent deadline first, undated last.
const fallback: Record<Zone, (a: AssignmentView, b: AssignmentView) => number> = {
  toDo: (a, b) => (ms(a.dueAt) ?? Infinity) - (ms(b.dueAt) ?? Infinity),
  turnedIn: (a, b) => {
    const da = ms(a.dueAt)
    const db = ms(b.dueAt)
    if (da === null || db === null) return (da === null ? 1 : 0) - (db === null ? 1 : 0)
    return db - da
  }
}

function compareEntries(a: Entry, b: Entry): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1
  if (a.rule && a.rule === b.rule) {
    const byRule = a.rule.compare(a.ctx, b.ctx)
    if (byRule) return byRule
  }
  return (
    fallback[a.zone](a.ctx.item, b.ctx.item) ||
    a.ctx.item.courseName.localeCompare(b.ctx.item.courseName) ||
    a.ctx.item.name.localeCompare(b.ctx.item.name) ||
    a.ctx.item.key.localeCompare(b.ctx.item.key)
  )
}

/**
 * Splits assignments into the To do / Turned in zones and orders each by the
 * user's rules: the first enabled matching rule (in settings order) decides an
 * item's position; items matching nothing follow in the fallback order.
 * Pure: `now` and the seen fingerprints are passed in.
 */
export function rankAssignments(
  items: readonly AssignmentView[],
  seen: Readonly<Record<string, Fingerprint>>,
  now: Date,
  settings: readonly RuleSetting[] = DEFAULT_SETTINGS
): RankedResult {
  const enabled: Record<Zone, RuleDef[]> = { toDo: [], turnedIn: [] }
  for (const s of settings) {
    const rule = RULES_BY_ID.get(s.id)
    if (rule && s.enabled) enabled[rule.zone].push(rule)
  }

  const entries: Entry[] = items.map((item) => {
    const status = deriveStatus(item, now)
    const zone = zoneOf(status)
    const ctx: RuleContext = { item, status, now, change: describeChange(item, seen[item.key]) }
    const position = enabled[zone].findIndex((r) => r.matches(ctx))
    return { ctx, zone, position: position < 0 ? Infinity : position, rule: position < 0 ? null : enabled[zone][position] }
  })

  entries.sort(compareEntries)

  const result: RankedResult = { toDo: [], turnedIn: [] }
  for (const e of entries) {
    result[e.zone].push({
      item: e.ctx.item,
      status: e.ctx.status,
      zone: e.zone,
      change: e.ctx.change,
      rule: e.rule ? { id: e.rule.id, reason: e.rule.reason(e.ctx), description: e.rule.description } : null
    })
  }
  return result
}
