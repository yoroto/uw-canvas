import type { CalEvent, DayFeedEvents, FeedError, FeedInfo } from '../../shared/daily/types'
import { dayRange } from '../../shared/daily/assignments'
import { fetchFeedText } from './fetchText'
import { parseFeed } from './ics'
import { normaliseFeedUrl } from './feedUrl'
import type { FeedStore, StoredFeed } from './feedStore'

const CACHE_MS = 15 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const toInfo = (f: StoredFeed): FeedInfo => ({ id: f.id, name: f.name, host: new URL(f.url).host, color: f.color })

/** Adds, removes and reads calendar feeds. Downloaded feeds are cached for 15 minutes. */
export class FeedService {
  private cache = new Map<string, { text: string; at: number }>()

  constructor(
    private readonly store: FeedStore,
    private readonly fetchText: (url: string) => Promise<string> = (url) => fetchFeedText(url),
    private readonly now: () => number = Date.now
  ) {}

  list(): FeedInfo[] {
    return this.store.list().map(toInfo)
  }

  /**
   * Checks that the URL really is a calendar feed before saving it, and counts
   * its events over the next 30 days. The name defaults to the feed's own
   * calendar name, then to its host.
   */
  async add(name: string, rawUrl: string): Promise<{ feed: FeedInfo; upcomingCount: number }> {
    // Validate and reject duplicates first (throws), without saving yet.
    const normalised = normaliseFeedUrl(rawUrl)
    if (this.store.list().some((f) => f.url === normalised)) throw new Error('That feed is already added')

    const text = await this.fetchText(normalised)
    const start = new Date(this.now())
    const { name: calName, events } = parseFeed(text, 'probe', start, new Date(start.getTime() + 30 * DAY_MS))
    const stored = this.store.add(name.trim() || calName || '', normalised)
    this.cache.set(stored.id, { text, at: this.now() })
    return { feed: toInfo(stored), upcomingCount: events.length }
  }

  remove(id: string): FeedInfo[] {
    this.store.remove(id)
    this.cache.delete(id)
    return this.list()
  }

  /** Forget downloaded feeds so the next read fetches them again. */
  refresh(): void {
    this.cache.clear()
  }

  /** Events from every feed that touch `date` (YYYY-MM-DD). One broken feed does not hide the others. */
  async eventsForDay(date: string): Promise<DayFeedEvents> {
    const { from, to } = dayRange(date)
    const events: CalEvent[] = []
    const errors: FeedError[] = []

    await Promise.all(
      this.store.list().map(async (feed) => {
        try {
          const text = await this.textFor(feed)
          events.push(...parseFeed(text, feed.id, from, to).events)
        } catch (e) {
          errors.push({ feedId: feed.id, feedName: feed.name, message: e instanceof Error ? e.message : 'Could not read the feed' })
        }
      })
    )
    events.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
    return { events, errors }
  }

  private async textFor(feed: StoredFeed): Promise<string> {
    const hit = this.cache.get(feed.id)
    if (hit && this.now() - hit.at < CACHE_MS) return hit.text
    const text = await this.fetchText(feed.url)
    this.cache.set(feed.id, { text, at: this.now() })
    return text
  }
}
