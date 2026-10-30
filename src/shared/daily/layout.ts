import type { PlacedEvent } from './types'

export interface TimeSpan {
  /** Milliseconds since the epoch. */
  start: number
  end: number
}

/**
 * Places overlapping items side by side, the way macOS Calendar does:
 * items that overlap, directly or through a chain of others, form a cluster;
 * inside a cluster each item takes the first free column, and every item in the
 * cluster gets the same column count (so they share the width equally).
 * Items that only touch (one ends exactly when the next starts) do not overlap.
 * `minMs` gives very short or zero-length items a minimum duration for placement.
 */
export function layoutEvents<T>(items: readonly T[], span: (item: T) => TimeSpan, minMs = 0): PlacedEvent<T>[] {
  const spans = items
    .map((item) => {
      const s = span(item)
      return { item, start: s.start, end: Math.max(s.end, s.start + minMs) }
    })
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const placed: PlacedEvent<T>[] = []
  let cluster: { entry: PlacedEvent<T>; column: number }[] = []
  let columnEnds: number[] = []
  let clusterEnd = -Infinity

  const closeCluster = (): void => {
    for (const c of cluster) c.entry.columns = columnEnds.length
    cluster = []
    columnEnds = []
  }

  for (const s of spans) {
    if (s.start >= clusterEnd) closeCluster()
    let column = columnEnds.findIndex((end) => end <= s.start)
    if (column === -1) column = columnEnds.length
    columnEnds[column] = s.end
    clusterEnd = cluster.length === 0 ? s.end : Math.max(clusterEnd, s.end)
    const entry: PlacedEvent<T> = { event: s.item, column, columns: 1 }
    cluster.push({ entry, column })
    placed.push(entry)
  }
  closeCluster()
  return placed
}
