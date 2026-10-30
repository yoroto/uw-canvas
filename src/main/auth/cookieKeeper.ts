import type { CookieVault, StoredCookie } from './cookieVault'

/** The few cookie fields the keeper needs; Electron's cookies are adapted to this in CookieSessionAuth. */
export interface JarCookie {
  name: string
  value: string
  domain?: string
  hostOnly?: boolean
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expirationDate?: number
  sameSite?: string
}

export interface SetCookie {
  url: string
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expirationDate?: number
  sameSite?: string
}

export interface CookieJar {
  all(): Promise<JarCookie[]>
  set(cookie: SetCookie): Promise<void>
  /** Called whenever any cookie is added, changed or removed. */
  onChange(listener: () => void): void
}

const SAVE_DELAY_MS = 1000

/**
 * Restores the saved login cookies into the browser session on start, and
 * saves them again (shortly after any change, since Canvas rotates its session
 * cookie as you use it). Restored cookies stay session cookies inside Chromium,
 * so nothing is written to its cookie file in plain text.
 */
export class CookieKeeper {
  private timer: ReturnType<typeof setTimeout> | null = null
  private watching = false

  constructor(
    private readonly jar: CookieJar,
    private readonly vault: CookieVault
  ) {}

  /** Puts the saved cookies back. Resolves to how many were restored. */
  async restore(): Promise<number> {
    let restored = 0
    for (const c of this.vault.load()) {
      try {
        await this.jar.set(toSetCookie(c))
        restored++
      } catch {
        // one bad cookie should not stop the rest
      }
    }
    return restored
  }

  /** Starts saving whenever the cookies change. Call after `restore`. */
  watch(): void {
    if (this.watching) return
    this.watching = true
    this.jar.onChange(() => this.scheduleSave())
  }

  /** Forget everything saved (sign out). */
  forget(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.vault.clear()
  }

  async saveNow(): Promise<void> {
    const cookies = await this.jar.all()
    this.vault.save(cookies.map(toStored))
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.saveNow().catch(() => undefined)
    }, SAVE_DELAY_MS)
  }
}

function toStored(c: JarCookie): StoredCookie {
  return {
    name: c.name,
    value: c.value,
    domain: c.domain ?? '',
    hostOnly: c.hostOnly ?? false,
    path: c.path ?? '/',
    secure: c.secure ?? false,
    httpOnly: c.httpOnly ?? false,
    sameSite: c.sameSite ?? 'unspecified',
    ...(c.expirationDate !== undefined ? { expirationDate: c.expirationDate } : {})
  }
}

function toSetCookie(c: StoredCookie): SetCookie {
  const host = c.domain.replace(/^\./, '')
  return {
    url: `https://${host}${c.path || '/'}`,
    name: c.name,
    value: c.value,
    // Host-only cookies must not carry a domain, or they would become domain cookies.
    ...(c.hostOnly ? {} : { domain: c.domain }),
    path: c.path || '/',
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite,
    ...(c.expirationDate !== undefined ? { expirationDate: c.expirationDate } : {})
  }
}
