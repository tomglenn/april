import { app, shell, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerAllHandlers } from './ipc'
import { store } from './store'
import { mcpManager } from './mcp'
import type { Settings } from '../renderer/src/types'

app.setName('April')

const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'icon.icns')
  : join(__dirname, '../../resources/logo.png')

function getSavedBounds(): { x?: number; y?: number; width: number; height: number } {
  const saved = store.get('windowBounds')
  if (!saved) return { width: 1200, height: 800 }
  // Verify the saved position is still reachable on a connected display
  const onScreen = screen.getAllDisplays().some((d) => {
    const wa = d.workArea
    return (
      saved.x + saved.width - 100 >= wa.x &&
      saved.x + 100 <= wa.x + wa.width &&
      saved.y >= wa.y &&
      saved.y + 50 <= wa.y + wa.height
    )
  })
  return onScreen ? saved : { width: saved.width, height: saved.height }
}

let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null

function saveBounds(win: BrowserWindow): void {
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(() => {
    if (!win.isDestroyed() && !win.isMinimized() && !win.isMaximized()) {
      store.set('windowBounds', win.getBounds())
    }
  }, 500)
}

function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const bounds = getSavedBounds()

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: bounds.width,
    height: bounds.height,
    ...(bounds.x !== undefined && { x: bounds.x, y: bounds.y }),
    minWidth: 700,
    minHeight: 500,
    show: false,
    frame: !isMac,
    backgroundColor: '#0d0d0f',
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  }

  if (isMac) {
    windowOptions.titleBarStyle = 'hiddenInset'
  }

  const mainWindow = new BrowserWindow(windowOptions)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Fallback: if ready-to-show never fires (e.g. slow cold start), show after 3s
  const showFallback = setTimeout(() => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show()
  }, 3000)
  mainWindow.once('show', () => clearTimeout(showFallback))

  mainWindow.on('resize', () => saveBounds(mainWindow))
  mainWindow.on('move', () => saveBounds(mainWindow))
  mainWindow.on('close', () => {
    if (!mainWindow.isMinimized() && !mainWindow.isMaximized()) {
      store.set('windowBounds', mainWindow.getBounds())
    }
  })

  // Open target="_blank" links and window.open() calls in the system browser
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Prevent in-window navigation (e.g. clicking an <a> without target="_blank")
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url)
    if (parsed.protocol === 'file:' || parsed.hostname === 'localhost') return
    event.preventDefault()
    shell.openExternal(url)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.april-agent')

  if (process.platform === 'darwin') {
    try { app.dock.setIcon(iconPath) } catch { /* non-critical */ }
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register IPC handlers once
  registerAllHandlers()

  // Start any enabled MCP servers from saved settings
  const settings = store.get('settings') as Settings
  if (settings.mcpServers?.length) {
    mcpManager.syncServers(settings.mcpServers).catch(() => {})
  }

  createWindow()

  app.on('activate', () => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length === 0) createWindow()
    else { wins[0].show(); wins[0].focus() }
  })
})

app.on('before-quit', () => {
  mcpManager.stopAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
