import { describe, expect, it } from 'vitest'
import { RULES } from '../src/shared/importance/rules'
import { DEFAULT_SETTINGS, moveRule, normaliseSettings, resetSettings, toggleRule } from '../src/shared/importance/settings'

const order = (s: readonly { id: string }[]): string[] => s.map((x) => x.id)

describe('normaliseSettings', () => {
  it('falls back to defaults for junk', () => {
    for (const junk of [null, undefined, 42, 'x', {}, [1, 'a', null]]) {
      expect(normaliseSettings(junk)).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('keeps a saved order and enabled flags', () => {
    const saved = [
      { id: 'cross-score', enabled: false },
      { id: 'overdue', enabled: true },
      { id: 'due-soon', enabled: true },
      { id: 'new-feedback', enabled: true }
    ]
    expect(normaliseSettings(saved)).toEqual(saved)
  })

  it('drops unknown and duplicate ids and appends rules missing from the save', () => {
    const out = normaliseSettings([
      { id: 'ghost', enabled: true },
      { id: 'due-soon', enabled: false },
      { id: 'due-soon', enabled: true }
    ])
    expect(order(out)).toEqual(['due-soon', ...RULES.map((r) => r.id).filter((id) => id !== 'due-soon')])
    expect(out[0].enabled).toBe(false)
  })

  it('defaults a bad enabled flag to on', () => {
    expect(normaliseSettings([{ id: 'overdue', enabled: 'yes' }])[0]).toEqual({ id: 'overdue', enabled: true })
  })
})

describe('moveRule', () => {
  it('swaps with the neighbour in the same zone', () => {
    expect(order(moveRule(DEFAULT_SETTINGS, 'cross-score', -1))).toEqual(['overdue', 'due-soon', 'cross-score', 'new-feedback'])
    expect(order(moveRule(DEFAULT_SETTINGS, 'overdue', 1))).toEqual(['due-soon', 'overdue', 'new-feedback', 'cross-score'])
  })

  it('skips over rules from the other zone', () => {
    const mixed = [
      { id: 'new-feedback', enabled: true },
      { id: 'overdue', enabled: true },
      { id: 'cross-score', enabled: true },
      { id: 'due-soon', enabled: true }
    ]
    expect(order(moveRule(mixed, 'cross-score', -1))).toEqual(['cross-score', 'overdue', 'new-feedback', 'due-soon'])
    expect(order(moveRule(mixed, 'overdue', 1))).toEqual(['new-feedback', 'due-soon', 'cross-score', 'overdue'])
  })

  it('does nothing at the ends of a zone, for unknown ids, and never mutates the input', () => {
    expect(order(moveRule(DEFAULT_SETTINGS, 'overdue', -1))).toEqual(order(DEFAULT_SETTINGS))
    expect(order(moveRule(DEFAULT_SETTINGS, 'new-feedback', -1))).toEqual(order(DEFAULT_SETTINGS))
    expect(order(moveRule(DEFAULT_SETTINGS, 'cross-score', 1))).toEqual(order(DEFAULT_SETTINGS))
    expect(order(moveRule(DEFAULT_SETTINGS, 'nope', 1))).toEqual(order(DEFAULT_SETTINGS))
    expect(order(DEFAULT_SETTINGS)).toEqual(RULES.map((r) => r.id))
  })
})

describe('toggleRule / resetSettings', () => {
  it('toggles one rule without touching the rest', () => {
    const next = toggleRule(DEFAULT_SETTINGS, 'due-soon')
    expect(next.find((s) => s.id === 'due-soon')?.enabled).toBe(false)
    expect(next.filter((s) => s.enabled)).toHaveLength(RULES.length - 1)
    expect(DEFAULT_SETTINGS.every((s) => s.enabled)).toBe(true)
  })

  it('resets to the default order, all enabled', () => {
    expect(resetSettings()).toEqual(DEFAULT_SETTINGS)
  })
})
