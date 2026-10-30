import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CookieKeeper, type CookieJar, type JarCookie, type SetCookie } from '../src/main/auth/cookieKeeper'
import { CookieVault, MAX_AGE_MS, type Cipher, type StoredCookie } from '../src/main/auth/cookieVault'

// A stand-in for the OS keychain cipher: not secure, but never leaves the text readable.
const fakeCipher = (available = true): Cipher => ({
  isAvailable: () => available,
  encrypt: (text) => Buffer.from(Buffer.from(text, 'utf8').map((b) => b ^ 0x5a)),
  decrypt: (data) => Buffer.from(Buffer.from(data).map((b) => b ^ 0x5a)).toString('utf8')
})

const session: StoredCookie = {
  name: 'canvas_session',
  value: 'SECRET-VALUE-123',
  domain: 'canvas.uw.edu',
  hostOnly: true,
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'unspecified'
}
const sso: StoredCookie = { ...session, name: 'idp', value: 'other', domain: '.washington.edu', hostOnly: false, path: '/idp', expirationDate: 2_000_000_000 }

let dir: string
let file: string
let clock: number
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vault-'))
  file = join(dir, 'nested', 'session-cookies.bin')
  clock = Date.UTC(2026, 9, 29)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('CookieVault', () => {
  const vault = (cipher = fakeCipher()) => new CookieVault(file, cipher, () => clock)

  it('round-trips cookies', () => {
    expect(vault().save([session, sso])).toBe(true)
    expect(vault().load()).toEqual([session, sso])
  })

  it('never writes cookie values or names in plain text, and keeps the file private', () => {
    vault().save([session])
    const bytes = readFileSync(file).toString('latin1')
    expect(bytes).not.toContain('SECRET-VALUE-123')
    expect(bytes).not.toContain('canvas_session')
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(existsSync(`${file}.tmp`)).toBe(false)
  })

  it('stores nothing when the OS cannot encrypt', () => {
    expect(vault(fakeCipher(false)).save([session])).toBe(false)
    expect(existsSync(file)).toBe(false)
    vault().save([session])
    expect(vault(fakeCipher(false)).load()).toEqual([])
  })

  it('ignores logins older than 14 days, and cookies that have expired', () => {
    vault().save([session, { ...sso, expirationDate: clock / 1000 + 60 }])
    clock += 2 * 60_000
    expect(vault().load().map((c) => c.name)).toEqual(['canvas_session']) // the expiring cookie is gone
    clock += MAX_AGE_MS + 1
    expect(vault().load()).toEqual([])
  })

  it('treats a missing, corrupt, or foreign file as empty', () => {
    expect(vault().load()).toEqual([])
    vault().save([session])
    writeFileSync(file, 'not encrypted at all')
    expect(vault().load()).toEqual([])
    writeFileSync(file, fakeCipher().encrypt(JSON.stringify({ version: 2, savedAt: clock, cookies: [session] })))
    expect(vault().load()).toEqual([])
    writeFileSync(file, fakeCipher().encrypt(JSON.stringify({ version: 1, savedAt: clock, cookies: [session, 'junk', { name: 1 }] })))
    expect(vault().load()).toEqual([session])
  })

  it('saving no cookies removes the file; clear() is safe to repeat', () => {
    const v = vault()
    v.save([session])
    v.save([])
    expect(existsSync(file)).toBe(false)
    expect(() => v.clear()).not.toThrow()
  })
})

describe('CookieKeeper', () => {
  function makeJar(initial: JarCookie[] = []) {
    const listeners: (() => void)[] = []
    const set = vi.fn<(c: SetCookie) => Promise<void>>().mockResolvedValue(undefined)
    let cookies = initial
    const jar: CookieJar = { all: async () => cookies, set, onChange: (l) => void listeners.push(l) }
    return { jar, set, listeners, change: (next: JarCookie[]) => { cookies = next; listeners.forEach((l) => l()) } }
  }
  const vaultWith = (...cookies: StoredCookie[]) => {
    const v = new CookieVault(file, fakeCipher(), () => clock)
    v.save(cookies)
    return v
  }

  it('restores saved cookies as session cookies: host-only ones without a domain, the rest with it', async () => {
    const { jar, set } = makeJar()
    const n = await new CookieKeeper(jar, vaultWith(session, { ...sso, expirationDate: undefined })).restore()
    expect(n).toBe(2)
    expect(set.mock.calls[0][0]).toEqual({
      url: 'https://canvas.uw.edu/',
      name: 'canvas_session',
      value: 'SECRET-VALUE-123',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'unspecified'
    })
    expect(set.mock.calls[0][0]).not.toHaveProperty('domain')
    expect(set.mock.calls[0][0]).not.toHaveProperty('expirationDate') // stays a session cookie inside Chromium
    expect(set.mock.calls[1][0]).toMatchObject({ url: 'https://washington.edu/idp', domain: '.washington.edu' })
  })

  it('keeps restoring when one cookie is rejected', async () => {
    const { jar, set } = makeJar()
    set.mockRejectedValueOnce(new Error('bad cookie'))
    expect(await new CookieKeeper(jar, vaultWith(session, sso)).restore()).toBe(1)
    expect(set).toHaveBeenCalledTimes(2)
  })

  describe('saving', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('saves shortly after cookies change, once for a burst of changes', async () => {
      const { jar, change } = makeJar()
      const vault = vaultWith()
      const saveSpy = vi.spyOn(vault, 'save')
      const keeper = new CookieKeeper(jar, vault)
      keeper.watch()
      keeper.watch() // watching twice must not double-subscribe

      const live: JarCookie[] = [{ name: 'canvas_session', value: 'rotated', domain: 'canvas.uw.edu', hostOnly: true, path: '/', secure: true, httpOnly: true, sameSite: 'unspecified' }]
      change(live)
      change(live)
      change(live)
      expect(saveSpy).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1100)
      expect(saveSpy).toHaveBeenCalledTimes(1)
      expect(new CookieVault(file, fakeCipher(), () => clock).load()).toMatchObject([{ name: 'canvas_session', value: 'rotated', hostOnly: true }])
    })

    it('saves an empty jar as "nothing saved"', async () => {
      const { jar, change } = makeJar()
      vaultWith(session)
      const keeper = new CookieKeeper(jar, new CookieVault(file, fakeCipher(), () => clock))
      keeper.watch()
      change([])
      await vi.advanceTimersByTimeAsync(1100)
      expect(existsSync(file)).toBe(false)
    })

    it('forget() clears the file and cancels a pending save', async () => {
      const { jar, change } = makeJar()
      const keeper = new CookieKeeper(jar, vaultWith(session))
      keeper.watch()
      change([{ name: 'a', value: 'b', domain: 'canvas.uw.edu', path: '/' }])
      keeper.forget()
      await vi.advanceTimersByTimeAsync(2000)
      expect(existsSync(file)).toBe(false)
    })
  })
})
