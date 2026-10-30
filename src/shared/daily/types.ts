// Shared shapes for the Daily view.

export interface CalEvent {
  id: string
  /** class = the weekly class schedule; feed = an added calendar feed. */
  source: 'class' | 'feed'
  feedId?: string
  title: string
  /** ISO instants. For all-day events: local midnight of the first day, and of the day after the last (exclusive). */
  start: string
  end: string
  allDay: boolean
  location?: string
  /** Class blocks only: the schedule block kind (class, lunch, ...). */
  kind?: string
  /** Class blocks only: extra text such as the subject of a study session. */
  detail?: string
}

/** What a feed looks like to the renderer. The URL is deliberately not included: it may contain a secret token. */
export interface FeedInfo {
  id: string
  name: string
  /** Host only, e.g. "calendar.google.com". */
  host: string
  color: string
}

export interface FeedError {
  feedId: string
  feedName: string
  message: string
}

export interface DayFeedEvents {
  events: CalEvent[]
  errors: FeedError[]
}

/** A CalEvent placed side by side with the events it overlaps. */
export interface PlacedEvent<T = CalEvent> {
  event: T
  /** 0-based column inside its overlap cluster. */
  column: number
  /** Number of columns in that cluster. */
  columns: number
}
