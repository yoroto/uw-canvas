import { describe, expect, it } from 'vitest'
import { layoutEvents } from '../src/shared/daily/layout'

const H = 3_600_000
interface Item {
  id: string
  start: number
  end: number
}
const item = (id: string, startH: number, endH: number): Item => ({ id, start: startH * H, end: endH * H })
const place = (items: Item[], minMs = 0) =>
  Object.fromEntries(layoutEvents(items, (i) => i, minMs).map((p) => [p.event.id, `${p.column}/${p.columns}`]))

describe('layoutEvents', () => {
  it('gives separate events the full width', () => {
    expect(place([item('a', 9, 10), item('b', 11, 12)])).toEqual({ a: '0/1', b: '0/1' })
  })

  it('does not treat touching events as overlapping', () => {
    expect(place([item('a', 9, 10), item('b', 10, 11)])).toEqual({ a: '0/1', b: '0/1' })
  })

  it('puts two overlapping events side by side', () => {
    expect(place([item('a', 9, 11), item('b', 10, 12)])).toEqual({ a: '0/2', b: '1/2' })
  })

  it('shares one cluster across a chain of overlaps and reuses free columns', () => {
    // a overlaps b, b overlaps c, but c starts after a ends: c can reuse a's column.
    expect(place([item('a', 9, 10), item('b', 9.5, 11), item('c', 10, 12)])).toEqual({ a: '0/2', b: '1/2', c: '0/2' })
  })

  it('handles three events at once', () => {
    expect(place([item('a', 9, 10), item('b', 9, 10), item('c', 9, 10)])).toEqual({ a: '0/3', b: '1/3', c: '2/3' })
  })

  it('puts a long event first when two start together', () => {
    const placed = layoutEvents([item('short', 9, 10), item('long', 9, 12)], (i) => i)
    expect(placed.map((p) => [p.event.id, p.column])).toEqual([['long', 0], ['short', 1]])
  })

  it('keeps clusters independent', () => {
    expect(place([item('a', 9, 10), item('b', 9, 10), item('c', 13, 14)])).toEqual({ a: '0/2', b: '1/2', c: '0/1' })
  })

  it('gives zero-length events a minimum span so they can overlap', () => {
    expect(place([item('a', 9, 9), item('b', 9, 9)], H / 2)).toEqual({ a: '0/2', b: '1/2' })
    expect(place([item('a', 9, 9), item('b', 9.25, 9.25)], H / 2)).toEqual({ a: '0/2', b: '1/2' })
    expect(place([item('a', 9, 9), item('b', 10, 10)], H / 2)).toEqual({ a: '0/1', b: '0/1' })
  })

  it('does not change its input and handles nothing', () => {
    const input = [item('b', 10, 11), item('a', 9, 10)]
    layoutEvents(input, (i) => i)
    expect(input.map((i) => i.id)).toEqual(['b', 'a'])
    expect(layoutEvents([], (i: Item) => i)).toEqual([])
  })
})
