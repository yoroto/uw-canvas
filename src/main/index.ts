import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { CookieSessionAuth } from './auth/CookieSessionAuth'
import { CanvasClient } from './canvas/CanvasClient'
import { FeedService } from './feeds/feedService'
import { FeedStore } from './feeds/feedStore'
import { registerIpc } from './ipc'
import { SeenStore } from './store/seenStore'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
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
  const auth = new CookieSessionAuth(() => mainWindow)
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
