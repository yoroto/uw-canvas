import { dayKeyOf } from '../assignments/timeline'

export interface DayOption {
  /** YYYY-MM-DD */
  value: string
  label: string
}

/** Adds (or subtracts) whole days to a YYYY-MM-DD date. */
export function shiftDay(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return dayKeyOf(new Date(y, m - 1, d + days))
}

/** The days offered in the picker: `before` days back to `after` days ahead of today. */
export function dayOptions(today: Date, before = 14, after = 60): DayOption[] {
  const todayKey = dayKeyOf(today)
  const out: DayOption[] = []
  for (let offset = -before; offset <= after; offset++) {
    const value = shiftDay(todayKey, offset)
    const [y, m, d] = value.split('-').map(Number)
    const label = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    out.push({ value, label: offset === 0 ? `${label} · Today` : label })
  }
  return out
}
