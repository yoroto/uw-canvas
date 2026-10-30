// Geometry of the one-day calendar grid (pixels per hour, where things sit, where to scroll).

export const HOUR_PX = 56
export const DAY_MINUTES = 24 * 60

/**
 * Minutes from midnight on the wall clock, with times before the day clamped
 * to 0 and times after it clamped to 24:00. Wall-clock minutes (not elapsed
 * time) keep the hour lines aligned on daylight-saving days.
 */
export function minutesIntoDay(t: Date, dayStart: Date, dayEnd: Date): number {
  if (t.getTime() <= dayStart.getTime()) return 0
  if (t.getTime() >= dayEnd.getTime()) return DAY_MINUTES
  return t.getHours() * 60 + t.getMinutes() + t.getSeconds() / 60
}

export const pxForMinutes = (minutes: number, hourPx = HOUR_PX): number => (minutes / 60) * hourPx

export interface ScrollInput {
  isToday: boolean
  now: Date
  /** Opening hour of the building, in hours (8 = 8:00), if known. */
  opensHour: number | null
  /** Start of the earliest timed item on the day, in hours, if any. */
  firstItemHour: number | null
}

/** The hour that should be at the top of the view when the day opens. */
export function initialScrollHour({ isToday, now, opensHour, firstItemHour }: ScrollInput): number {
  if (isToday) return Math.max(0, now.getHours() + now.getMinutes() / 60 - 2)
  const candidates = [opensHour ?? 8, ...(firstItemHour === null ? [] : [firstItemHour])]
  return Math.max(0, Math.min(...candidates) - 0.5)
}

/**
 * Top of the "also due soon" list: at `startPx` (9 PM), or just below the lowest
 * deadline chip in that part of the day, so the two never overlap.
 */
export function carriedListTop(deadlineBottoms: readonly number[], startPx: number, gapPx = 8): number {
  const late = deadlineBottoms.filter((b) => b > startPx)
  return late.length ? Math.max(startPx, Math.max(...late) + gapPx) : startPx
}

/** Label for an hour line: "1 AM", "12 PM". */
export function hourLabel(hour: number, locale?: string): string {
  return new Date(2000, 0, 1, hour).toLocaleTimeString(locale, { hour: 'numeric' })
}

/** Height of a block's title and time lines, and of one item line. */
export const BLOCK_HEADER_PX = 34
export const ITEM_LINE_PX = 16

/** How many item lines fit in a block of this height. */
export function linesThatFit(heightPx: number, headerPx = BLOCK_HEADER_PX, linePx = ITEM_LINE_PX): number {
  return Math.max(0, Math.floor((heightPx - headerPx - 2) / linePx))
}

/**
 * Which of `count` items to list in a block of this height. When they do not all
 * fit, the last line becomes "+N more"; if not even two lines fit, only a toggle
 * is shown (`visible` is 0) and the items appear when the block is expanded.
 */
export function planItemLines(count: number, heightPx: number): { visible: number; more: number } {
  const lines = linesThatFit(heightPx)
  if (count <= lines) return { visible: count, more: 0 }
  if (lines >= 2) return { visible: lines - 1, more: count - (lines - 1) }
  return { visible: 0, more: count }
}
