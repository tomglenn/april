import { app, shell, BrowserWindow, screen, globalShortcut, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { execSync } from 'child_process'
import { watch, existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// Packaged Electron apps on macOS launch with a minimal PATH (/usr/bin:/bin:…).
// Restore the user's login shell PATH so spawned processes (npx, node, etc.) work.
if (app.isPackaged && process.platform === 'darwin') {
  try {
    const loginShell = process.env.SHELL || '/bin/zsh'
    const result = execSync(`${loginShell} -lc 'printf "%s" "$PATH"'`, {
      encoding: 'utf-8',
      timeout: 5000
    })
    if (result) process.env.PATH = result
  } catch {
    // Fallback: add common locations for Homebrew / nvm
    const extra = ['/opt/homebrew/bin', '/usr/local/bin']
    process.env.PATH = [...extra, process.env.PATH].join(':')
  }
}
import { setPlatform, mcpManager, loadAndScheduleReminders } from '@april/core'
import { electronPlatform } from './platform'
import { registerAllHandlers } from './ipc'
import { runMigrationIfNeeded } from './migrate'
import {
  localStore,
  getDataFolder,
  getSettings,
  getSyncedSettings,
  ensureDataFolderExists,
  isOwnRecentWrite,
  setOnDataFolderChanged
} from './store'
import type { FSWatcher } from 'fs'

app.setName('April')

const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'icon.icns')
  : join(__dirname, '../../resources/logo.png')

function getSavedBounds(): { x?: number; y?: number; width: number; height: number } {
  const saved = localStore.get('windowBounds')
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
      localStore.set('windowBounds', win.getBounds())
    }
  }, 500)
}

// ── File watcher for external sync changes ──────────────────────────────────

let watcher: FSWatcher | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function startWatching(win: BrowserWindow): void {
  stopWatching()
  const dir = getDataFolder()
  if (!existsSync(dir)) return

  try {
    watcher = watch(dir, { recursive: true }, (_eventType, filename) => {
      if (!filename) return
      // Only care about .json files in our folder
      if (!filename.endsWith('.json')) return
      // Skip events triggered by our own writes
      if (isOwnRecentWrite()) return

      // Debounce: many writes can fire in quick succession
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (!win.isDestroyed()) {
          win.webContents.send('sync:changed')
        }
      }, 500)
    })
  } catch {
    // fs.watch can fail on some platforms/paths — not critical
  }
}

function stopWatching(): void {
  if (watcher) {
    watcher.close()
    watcher = null
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

// ── Window creation ─────────────────────────────────────────────────────────

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
  mainWindow.on('close', (event) => {
    if (!mainWindow.isMinimized() && !mainWindow.isMaximized()) {
      localStore.set('windowBounds', mainWindow.getBounds())
    }
    const settings = getSyncedSettings()
    if (settings.runInBackground && !isQuitting) {
      event.preventDefault()
      mainWindow.hide()
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

  // Start watching the data folder for external sync changes
  startWatching(mainWindow)

  return mainWindow
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

// ── Tray icon + background persistence ───────────────────────────────────

function createTray(): void {
  if (tray) return
  const icon = nativeImage.createFromPath(
    app.isPackaged
      ? join(process.resourcesPath, 'logo.png')
      : join(__dirname, '../../resources/logo.png')
  ).resize({ width: 18, height: 18 })

  tray = new Tray(icon)
  tray.setToolTip('April')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open April',
      click: (): void => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          mainWindow = createWindow()
        } else {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit April',
      click: (): void => {
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)

  // Non-macOS: click tray icon to toggle window
  if (process.platform !== 'darwin') {
    tray.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = createWindow()
      } else if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    })
  }
}

function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

// ── Overlay window + global shortcut ─────────────────────────────────────

let overlayWindow: BrowserWindow | null = null
let currentHotkey: string | null = null

function createOverlayWindow(): BrowserWindow {
  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const { x, y, width, height } = display.workArea

  const overlayWidth = 600
  const overlayHeight = 480
  const ox = x + Math.round((width - overlayWidth) / 2)
  const oy = y + Math.round(height * 0.18)

  const win = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x: ox,
    y: oy,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Hide on blur (click outside)
  win.on('blur', () => {
    if (!win.isDestroyed()) win.hide()
  })

  win.on('closed', () => {
    overlayWindow = null
  })

  // Open links in system browser
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + '?overlay=true')
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { search: 'overlay=true' })
  }

  return win
}

function toggleOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (overlayWindow.isVisible()) {
      overlayWindow.hide()
    } else {
      // Reposition to cursor's display
      const cursorPoint = screen.getCursorScreenPoint()
      const display = screen.getDisplayNearestPoint(cursorPoint)
      const { x, y, width, height } = display.workArea
      const ox = x + Math.round((width - 600) / 2)
      const oy = y + Math.round(height * 0.18)
      overlayWindow.setPosition(ox, oy)
      overlayWindow.show()
      overlayWindow.focus()
    }
  } else {
    overlayWindow = createOverlayWindow()
    overlayWindow.once('ready-to-show', () => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.show()
        overlayWindow.focus()
      }
    })
  }
}

function registerQuickPromptShortcut(): void {
  const hotkey = getSyncedSettings().quickPromptHotkey || 'CmdOrCtrl+Shift+Space'

  if (currentHotkey) {
    globalShortcut.unregister(currentHotkey)
    currentHotkey = null
  }

  const ok = globalShortcut.register(hotkey, toggleOverlay)
  if (ok) {
    currentHotkey = hotkey
  } else {
    console.warn(`[hotkey] Failed to register global shortcut: ${hotkey}`)
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.april-agent')

  if (process.platform === 'darwin') {
    try { app.dock.setIcon(iconPath) } catch { /* non-critical */ }
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize platform adapter for @april/core
  setPlatform(electronPlatform)

  // Run migration before registering handlers
  runMigrationIfNeeded()
  ensureDataFolderExists()

  // Register IPC handlers once
  registerAllHandlers()

  // Load and schedule any pending reminders
  loadAndScheduleReminders()

  // Start any enabled MCP servers from saved settings
  const settings = getSettings()
  if (settings.mcpServers?.length) {
    mcpManager.syncServers(settings.mcpServers).catch(() => {})
  }

  mainWindow = createWindow()
  registerQuickPromptShortcut()

  // Restart the file watcher when the data folder changes
  setOnDataFolderChanged(() => {
    if (mainWindow && !mainWindow.isDestroyed()) startWatching(mainWindow)
  })

  // Create tray if running in background
  if (settings.runInBackground) createTray()

  ipcMain.on('settings:hotkeyChanged', () => registerQuickPromptShortcut())
  ipcMain.on('settings:backgroundChanged', () => {
    const s = getSyncedSettings()
    if (s.runInBackground) {
      createTray()
    } else {
      destroyTray()
    }
  })

  ipcMain.on('overlay:forwardChunk', (_event, data: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('chat:chunk', data)
    }
  })

  ipcMain.on('overlay:openInApp', (_event, conversationId: string) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createWindow()
    }
    // Show + focus main window BEFORE hiding overlay so the app stays active on macOS
    mainWindow.show()
    mainWindow.focus()
    if (process.platform === 'darwin') app.focus({ steal: true })
    // Then hide overlay
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide()
    }
    // Tell the main window which conversation to open.
    // Small delay ensures the renderer is focused and ready to process.
    const win = mainWindow
    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.webContents.send('open-conversation', conversationId)
      }
    }, 200)
  })

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createWindow()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })
})

app.on('before-quit', () => {
  isQuitting = true
  stopWatching()
  mcpManager.stopAll()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  const settings = getSyncedSettings()
  if (settings.runInBackground) return
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
