import { app, BrowserWindow, safeStorage, session, shell } from 'electron'
import { join } from 'node:path'
import { CookieKeeper } from './auth/cookieKeeper'
import { CookieSessionAuth } from './auth/CookieSessionAuth'
import { CookieVault } from './auth/cookieVault'
import { CanvasClient } from './canvas/CanvasClient'
import { SESSION_PARTITION } from './config'
import { FeedService } from './feeds/feedService'
import { FeedStore } from './feeds/feedStore'
import { registerIpc } from './ipc'
import { SeenStore } from './store/seenStore'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 860,
    minWidth: 900,
    minHeight: 500,
    title: 'UW Canvas Dashboard',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // The renderer only shows our own UI; anything else opens in the default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (url !== mainWindow?.webContents.getURL()) e.preventDefault()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  // Keep the Canvas login between runs: cookies are saved encrypted with a key from the macOS Keychain.
  const ses = session.fromPartition(SESSION_PARTITION)
  const keeper = new CookieKeeper(
    {
      all: () => ses.cookies.get({}),
      set: (c) => ses.cookies.set(c as Electron.CookiesSetDetails),
      onChange: (listener) => {
        ses.cookies.on('changed', () => listener())
      }
    },
    new CookieVault(join(app.getPath('userData'), 'session-cookies.bin'), {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (text) => safeStorage.encryptString(text),
      decrypt: (data) => safeStorage.decryptString(data)
    })
  )
  const auth = new CookieSessionAuth(() => mainWindow, keeper)
  const client = new CanvasClient(auth)
  // Feed URLs may contain secret tokens, so they live in a git-ignored file in the project folder.
  const feeds = new FeedService(new FeedStore(join(app.getAppPath(), 'config', 'calendar-feeds.json')))
  registerIpc(auth, client, new SeenStore(join(app.getPath('userData'), 'seen.json')), feeds)

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
