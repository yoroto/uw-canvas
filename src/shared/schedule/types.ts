// Shape of data/schedule.json: weekly class schedules per term, plus dated exceptions.

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export const BLOCK_KINDS = ['class', 'advisory', 'office-hours', 'study-session', 'lunch', 'ad-hoc', 'early-release'] as const
export type BlockKind = (typeof BLOCK_KINDS)[number]

/** One slot in a day. Times are local 24-hour "HH:MM" strings (see `timezone`). */
export interface ScheduleBlock {
  start: string
  end: string
  title: string
  kind: BlockKind
  /** Extra text, e.g. the subject of a study session. */
  detail?: string
  /** The source document does not print this time; it was derived from the table layout. Confirm and remove. */
  inferred?: true
}

export interface Building {
  name: string
  opens: string
  closes: string
  notes?: string[]
}

/**
 * A day that differs from the weekly pattern. Applies to `date`, or to every
 * day from `from` to `to` (inclusive). Exactly one of `use`, `blocks`, `closed`.
 */
export interface Override {
  date?: string
  from?: string
  to?: string
  /** Shown in the Daily view, e.g. "Assembly schedule". */
  label?: string
  /** Follow another weekday's schedule from the same term. */
  use?: Weekday
  /** A fully custom day. */
  blocks?: ScheduleBlock[]
  /** No school. */
  closed?: true
}

export interface Term {
  id: string
  name: string
  /**
   * First and last day of the term, "YYYY-MM-DD". null = open-ended: no start means "from the beginning",
   * no end means "ongoing until a term that starts later takes over".
   */
  startDate: string | null
  endDate: string | null
  /** The file this was extracted from. */
  source?: string
  building?: Building
  /** Weekly pattern. A weekday that is missing has no school. */
  weekly: Partial<Record<Weekday, ScheduleBlock[]>>
  overrides: Override[]
}

export interface ScheduleFile {
  schemaVersion: 1
  /** IANA time zone the times are in. */
  timezone: string
  terms: Term[]
}

/** What a given date looks like once the term, exceptions and weekday are applied. */
export interface ResolvedDay {
  date: string
  term: Term | null
  /** weekly = normal pattern; override = an exception applied; none = no term covers the date, or no school. */
  source: 'weekly' | 'override' | 'none'
  label?: string
  closed: boolean
  blocks: ScheduleBlock[]
}
