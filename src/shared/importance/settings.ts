import { RULES, RULES_BY_ID } from './rules'

export interface RuleSetting {
  id: string
  enabled: boolean
}

export const DEFAULT_SETTINGS: readonly RuleSetting[] = RULES.map((r) => ({ id: r.id, enabled: true }))

/**
 * Turns whatever was persisted into valid settings: unknown or duplicate ids
 * are dropped, rules added since the save are appended, junk gives defaults.
 */
export function normaliseSettings(raw: unknown): RuleSetting[] {
  const out: RuleSetting[] = []
  const seen = new Set<string>()
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry !== 'object' || entry === null) continue
      const { id, enabled } = entry as Record<string, unknown>
      if (typeof id !== 'string' || !RULES_BY_ID.has(id) || seen.has(id)) continue
      seen.add(id)
      out.push({ id, enabled: typeof enabled === 'boolean' ? enabled : true })
    }
  }
  for (const d of DEFAULT_SETTINGS) if (!seen.has(d.id)) out.push({ ...d })
  return out
}

export function toggleRule(settings: readonly RuleSetting[], id: string): RuleSetting[] {
  return settings.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
}

/**
 * Swaps a rule with its nearest neighbour in the same zone (-1 = up, 1 = down).
 * Rules in the other zone never interact, so the move always has a visible effect.
 * Returns the same array when the rule is already at that end.
 */
export function moveRule(settings: readonly RuleSetting[], id: string, dir: -1 | 1): RuleSetting[] {
  const from = settings.findIndex((s) => s.id === id)
  if (from < 0) return [...settings]
  const zone = RULES_BY_ID.get(id)?.zone
  let to = from + dir
  while (to >= 0 && to < settings.length && RULES_BY_ID.get(settings[to].id)?.zone !== zone) to += dir
  if (to < 0 || to >= settings.length) return [...settings]
  const next = [...settings]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

export function resetSettings(): RuleSetting[] {
  return DEFAULT_SETTINGS.map((s) => ({ ...s }))
}
