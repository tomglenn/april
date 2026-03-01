import { app, shell, BrowserWindow, screen, globalShortcut, ipcMain } from 'electron'
import { join } from 'path'
import { execSync } from 'child_process'
import { watch, existsSync, readFileSync, writeFileSync } from 'fs'
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
import { registerAllHandlers } from './ipc'
import {
  localStore,
  getDataFolder,
  getSettings,
  getSyncedSettings,
  ensureDataFolderExists,
  saveConversation,
  setSyncedSettings,
  isOwnRecentWrite,
  DEFAULT_SYSTEM_PROMPT,
  LEGACY_CONFIG_PATH
} from './store'
import { mcpManager } from './mcp'
import type { FSWatcher } from 'fs'
import type { Conversation, Settings } from '../renderer/src/types'

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

// ── Migration from legacy single-file store ─────────────────────────────────

function runMigrationIfNeeded(): void {
  const localPath = join(app.getPath('appData'), 'april-agent', 'local.json')
  const settingsJsonPath = join(getDataFolder(), 'settings.json')

  // If local.json exists but settings.json doesn't, a previous buggy migration
  // may have run (when synced config was written to config.json then overwritten).
  // Re-extract synced settings from the legacy config.json.
  if (existsSync(localPath) && !existsSync(settingsJsonPath) && existsSync(LEGACY_CONFIG_PATH)) {
    try {
      const legacy = JSON.parse(readFileSync(LEGACY_CONFIG_PATH, 'utf-8'))
      const s = legacy.settings
      if (s) {
        console.log('[migration] Recovering synced settings to settings.json...')
        setSyncedSettings({
          defaultProvider: s.defaultProvider || 'anthropic',
          defaultModel: s.defaultModel || 'claude-sonnet-4-6',
          theme: s.theme || 'dark',
          systemPrompt: s.systemPrompt || DEFAULT_SYSTEM_PROMPT,
          userName: s.userName || '',
          userLocation: s.userLocation || '',
          userBio: s.userBio || '',
          mcpServers: s.mcpServers || []
        })
      }
    } catch {
      // non-critical
    }
    return
  }

  // Check if we already have a local.json — if so, migration is done
  if (existsSync(localPath)) return

  // Check if the legacy config.json exists and has data
  if (!existsSync(LEGACY_CONFIG_PATH)) return

  let legacy: { conversations?: Conversation[]; settings?: Settings; windowBounds?: { x: number; y: number; width: number; height: number } }
  try {
    legacy = JSON.parse(readFileSync(LEGACY_CONFIG_PATH, 'utf-8'))
  } catch {
    return
  }

  if (!legacy.settings && !legacy.conversations?.length) return

  console.log('[migration] Migrating from legacy config.json...')

  const settings = legacy.settings
  if (settings) {
    // Local settings
    localStore.set('anthropicApiKey', settings.anthropicApiKey || '')
    localStore.set('openaiApiKey', settings.openaiApiKey || '')
    localStore.set('ollamaBaseUrl', settings.ollamaBaseUrl || 'http://localhost:11434')
    localStore.set('setupCompleted', settings.setupCompleted ?? false)
    // dataFolder defaults to APP_DATA_DIR already

    // Synced settings
    setSyncedSettings({
      defaultProvider: settings.defaultProvider || 'anthropic',
      defaultModel: settings.defaultModel || 'claude-sonnet-4-6',
      theme: settings.theme || 'dark',
      systemPrompt: settings.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      userName: settings.userName || '',
      userLocation: settings.userLocation || '',
      userBio: settings.userBio || '',
      mcpServers: settings.mcpServers || []
    })
  }

  if (legacy.windowBounds) {
    localStore.set('windowBounds', legacy.windowBounds)
  }

  // Migrate conversations to individual files
  if (legacy.conversations?.length) {
    ensureDataFolderExists()
    for (const conv of legacy.conversations) {
      saveConversation(conv)
    }
    console.log(`[migration] Migrated ${legacy.conversations.length} conversations`)
  }

  // Clear conversations from legacy store to free space, keep the file for reference
  try {
    const cleaned = { ...legacy, conversations: [], _migrated: true }
    writeFileSync(LEGACY_CONFIG_PATH, JSON.stringify(cleaned, null, 2), 'utf-8')
  } catch {
    // non-critical
  }

  console.log('[migration] Done.')
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
  mainWindow.on('close', () => {
    if (!mainWindow.isMinimized() && !mainWindow.isMaximized()) {
      localStore.set('windowBounds', mainWindow.getBounds())
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

  // Run migration before registering handlers
  runMigrationIfNeeded()
  ensureDataFolderExists()

  // Register IPC handlers once
  registerAllHandlers()

  // Start any enabled MCP servers from saved settings
  const settings = getSettings()
  if (settings.mcpServers?.length) {
    mcpManager.syncServers(settings.mcpServers).catch(() => {})
  }

  mainWindow = createWindow()
  registerQuickPromptShortcut()

  ipcMain.on('settings:hotkeyChanged', () => registerQuickPromptShortcut())

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
  stopWatching()
  mcpManager.stopAll()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
