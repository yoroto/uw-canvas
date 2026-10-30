import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { normaliseFeedUrl } from './feedUrl'

export interface StoredFeed {
  id: string
  name: string
  /** The https URL. May contain a secret token: never log it or send it to the renderer. */
  url: string
  color: string
}

interface FileShape {
  version: 1
  feeds: StoredFeed[]
}

export const FEED_COLORS = ['#0a7aff', '#ff9500', '#34c759', '#af52de', '#ff2d55', '#5ac8fa', '#ffcc00', '#a2845e']

const isStoredFeed = (f: unknown): f is StoredFeed => {
  if (typeof f !== 'object' || f === null) return false
  const o = f as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.name === 'string' && typeof o.url === 'string' && typeof o.color === 'string'
}

/** The user's calendar feeds, kept in a local JSON file that is git-ignored. */
export class FeedStore {
  private feeds: StoredFeed[]

  constructor(private readonly file: string) {
    this.feeds = this.load()
  }

  list(): StoredFeed[] {
    return this.feeds.map((f) => ({ ...f }))
  }

  /** Validates the URL, rejects duplicates, and picks the first unused color. */
  add(name: string, rawUrl: string): StoredFeed {
    const url = normaliseFeedUrl(rawUrl)
    if (this.feeds.some((f) => f.url === url)) throw new Error('That feed is already added')
    const used = new Set(this.feeds.map((f) => f.color))
    const color = FEED_COLORS.find((c) => !used.has(c)) ?? FEED_COLORS[this.feeds.length % FEED_COLORS.length]
    const feed: StoredFeed = { id: randomUUID(), name: name.trim() || new URL(url).host, url, color }
    this.feeds.push(feed)
    this.save()
    return { ...feed }
  }

  remove(id: string): boolean {
    const before = this.feeds.length
    this.feeds = this.feeds.filter((f) => f.id !== id)
    if (this.feeds.length === before) return false
    this.save()
    return true
  }

  private load(): StoredFeed[] {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<FileShape>
      if (raw?.version === 1 && Array.isArray(raw.feeds)) {
        return raw.feeds.filter(isStoredFeed).filter((f) => {
          try {
            normaliseFeedUrl(f.url)
            return true
          } catch {
            return false
          }
        })
      }
    } catch {
      // missing or corrupt: start empty
    }
    return []
  }

  private save(): void {
    const data: FileShape = { version: 1, feeds: this.feeds }
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file)
  }
}
