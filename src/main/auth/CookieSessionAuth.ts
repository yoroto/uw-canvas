import { BrowserWindow, session, type Session } from 'electron'
import { CANVAS_HOST, CANVAS_ORIGIN, SESSION_PARTITION } from '../config'
import { CanvasError } from '../errors'
import type { AuthProvider } from './AuthProvider'
import type { CookieKeeper } from './cookieKeeper'

const PROBE_PATH = '/api/v1/users/self'

/**
 * Signs in through a real Canvas/UW SSO page in a dedicated window and reuses
 * the resulting cookies for API calls. The renderer never sees the cookies.
 * With a `keeper`, the login survives restarts: the cookies are saved encrypted
 * (OS keychain) and put back on the next start.
 */
export class CookieSessionAuth implements AuthProvider {
  private readonly ses: Session = session.fromPartition(SESSION_PARTITION)
  private pendingSignIn: Promise<boolean> | null = null
  /** Resolves once saved cookies (if any) are back in the session. */
  private readonly ready: Promise<void>

  constructor(
    private readonly getParent: () => BrowserWindow | null,
    private readonly keeper?: CookieKeeper
  ) {
    this.ready = keeper
      ? keeper
          .restore()
          .then(() => keeper.watch())
          .catch(() => undefined)
      : Promise.resolve()
  }

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    if (new URL(url).origin !== CANVAS_ORIGIN) {
      throw new CanvasError('unknown', `Refusing to send credentials to ${new URL(url).origin}`)
    }
    await this.ready
    try {
      return await this.ses.fetch(url, { ...init, redirect: 'manual' })
    } catch (e) {
      throw new CanvasError('network', e instanceof Error ? e.message : String(e))
    }
  }

  async isSignedIn(): Promise<boolean> {
    const res = await this.fetch(CANVAS_ORIGIN + PROBE_PATH, {
      headers: { Accept: 'application/json' }
    })
    return res.ok
  }

  signIn(): Promise<boolean> {
    this.pendingSignIn ??= this.runLoginWindow().finally(() => {
      this.pendingSignIn = null
    })
    return this.pendingSignIn
  }

  async signOut(): Promise<void> {
    await this.ses.clearStorageData()
    await this.ses.clearCache()
    this.keeper?.forget()
  }

  private async runLoginWindow(): Promise<boolean> {
    if (await this.isSignedIn().catch(() => false)) return true

    return new Promise<boolean>((resolve) => {
      const win = new BrowserWindow({
        width: 520,
        height: 760,
        title: 'Sign in to Canvas',
        parent: this.getParent() ?? undefined,
        webPreferences: {
          partition: SESSION_PARTITION,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false
        }
      })

      let signedIn = false
      let probing = false

      // After every navigation back on the Canvas host, check whether the
      // session is now accepted. Navigations on the IdP/Duo hosts are skipped.
      const check = async (): Promise<void> => {
        if (probing || win.isDestroyed()) return
        if (new URL(win.webContents.getURL()).host !== CANVAS_HOST) return
        probing = true
        try {
          if (await this.isSignedIn()) {
            signedIn = true
            win.close()
          }
        } catch {
          // transient network error: keep the window open and wait for the next navigation
        } finally {
          probing = false
        }
      }

      win.webContents.on('did-navigate', () => void check())
      win.webContents.on('did-navigate-in-page', () => void check())
      win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://')) void win.loadURL(url)
        return { action: 'deny' }
      })
      win.on('closed', () => resolve(signedIn))

      void win.loadURL(`${CANVAS_ORIGIN}/login`)
    })
  }
}
