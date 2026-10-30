import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** A browser cookie as saved between runs. */
export interface StoredCookie {
  name: string
  value: string
  domain: string
  hostOnly: boolean
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite: string
  /** Seconds since the epoch. Absent for session cookies. */
  expirationDate?: number
}

/** Encryption backed by the OS (the macOS Keychain, via Electron's safeStorage). */
export interface Cipher {
  isAvailable(): boolean
  encrypt(text: string): Buffer
  decrypt(data: Buffer): string
}

/** Saved logins older than this are ignored, however recently the app ran. */
export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

interface FileShape {
  version: 1
  savedAt: number
  cookies: StoredCookie[]
}

/**
 * Keeps the Canvas login cookies between runs in a file that is encrypted with
 * a key held by the OS keychain. Chromium would otherwise drop session cookies
 * on quit (or, if made persistent, store them unencrypted in its cookie file).
 */
export class CookieVault {
  constructor(
    private readonly file: string,
    private readonly cipher: Cipher,
    private readonly now: () => number = Date.now
  ) {}

  /** Returns false (and stores nothing) when the OS cannot encrypt. */
  save(cookies: readonly StoredCookie[]): boolean {
    if (cookies.length === 0) {
      this.clear()
      return true
    }
    if (!this.cipher.isAvailable()) return false
    const data: FileShape = { version: 1, savedAt: this.now(), cookies: [...cookies] }
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, this.cipher.encrypt(JSON.stringify(data)), { mode: 0o600 })
    renameSync(tmp, this.file)
    return true
  }

  /** The saved cookies that are still worth restoring; [] if none, too old, unreadable or not decryptable. */
  load(): StoredCookie[] {
    try {
      if (!this.cipher.isAvailable()) return []
      const raw = JSON.parse(this.cipher.decrypt(readFileSync(this.file))) as Partial<FileShape>
      if (raw?.version !== 1 || typeof raw.savedAt !== 'number' || !Array.isArray(raw.cookies)) return []
      if (this.now() - raw.savedAt > MAX_AGE_MS) return []
      const nowSeconds = this.now() / 1000
      return raw.cookies.filter(isStoredCookie).filter((c) => c.expirationDate === undefined || c.expirationDate > nowSeconds)
    } catch {
      return []
    }
  }

  clear(): void {
    rmSync(this.file, { force: true })
  }
}

function isStoredCookie(c: unknown): c is StoredCookie {
  if (typeof c !== 'object' || c === null) return false
  const o = c as Record<string, unknown>
  return typeof o.name === 'string' && typeof o.value === 'string' && typeof o.domain === 'string' && typeof o.path === 'string'
}
