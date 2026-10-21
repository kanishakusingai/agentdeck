import { app, BrowserWindow, dialog, ipcMain, session, shell, type WebContents } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import type { InvokeChannels, SendChannels } from '@shared/api'
import { AppCore } from './core'

// Tests run against a throwaway data folder.
if (process.env.AGENTDECK_USER_DATA) app.setPath('userData', process.env.AGENTDECK_USER_DATA)

const BG = '#08080a'
const BROWSER_PARTITION = 'persist:agentdeck-browser'
let mainWindow: BrowserWindow | null = null
let core: AppCore

const isHttpUrl = (url: string): boolean => {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function send(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args)
}

function hardenWebContents(contents: WebContents): void {
  // Links that try to open a new window go to the user's real browser.
  contents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: BG,
    title: 'AgentDeck',
    icon: join(__dirname, '../../resources/icon.png'),
    // The app draws its own title bar; the system keeps its own window buttons
    // (Windows: minimise / maximise / close on the right, macOS: traffic lights).
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 16 } }
      : { titleBarOverlay: { color: BG, symbolColor: '#d4d4d8', height: 36 } }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  hardenWebContents(mainWindow.webContents)

  // The app itself never navigates away from its own page.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const dev = process.env.ELECTRON_RENDERER_URL
    if (!(dev && url.startsWith(dev))) event.preventDefault()
  })

  // Docked browser panes: no Node, no preload, own locked-down session, http(s) only.
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    webPreferences.partition = BROWSER_PARTITION
    if (!isHttpUrl(params.src) && params.src !== 'about:blank') event.preventDefault()
  })
  mainWindow.webContents.on('did-attach-webview', (_event, contents) => hardenWebContents(contents))

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function setupPermissions(): void {
  // Allow the microphone (dictation) and clipboard for the app window only.
  const allowed = new Set(['media', 'clipboard-sanitized-write', 'clipboard-read'])
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(contents === mainWindow?.webContents && allowed.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((contents, permission) => {
    return contents === mainWindow?.webContents && allowed.has(permission)
  })
  // Websites in the docked browser get no device or location access at all.
  const browser = session.fromPartition(BROWSER_PARTITION)
  const browserAllowed = new Set(['clipboard-sanitized-write', 'fullscreen'])
  browser.setPermissionRequestHandler((_contents, permission, callback) => callback(browserAllowed.has(permission)))
  browser.setPermissionCheckHandler((_contents, permission) => browserAllowed.has(permission))
}

async function pickFolder(): Promise<string | null> {
  if (process.env.AGENTDECK_E2E_PICK_FOLDER) return process.env.AGENTDECK_E2E_PICK_FOLDER
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Choose a folder for this workspace',
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

function registerIpc(): void {
  type Handler<C extends keyof InvokeChannels> = (
    ...args: Parameters<InvokeChannels[C]>
  ) => ReturnType<InvokeChannels[C]> | Promise<ReturnType<InvokeChannels[C]>>
  const handle = <C extends keyof InvokeChannels>(channel: C, fn: Handler<C>): void => {
    ipcMain.handle(channel, (_event, ...args) => fn(...(args as Parameters<InvokeChannels[C]>)))
  }
  const listen = <C extends keyof SendChannels>(channel: C, fn: SendChannels[C]): void => {
    ipcMain.on(channel, (_event, ...args) => (fn as (...a: unknown[]) => void)(...args))
  }

  handle('app:getSnapshot', () => core.snapshot())
  handle('app:getLayouts', () => core.getLayouts())
  handle('app:setLayout', (id, layout) => core.setLayout(id, layout))
  handle('app:setUi', (ui) => core.setUi(ui))
  handle('app:setSettings', (s) => core.setSettings(s))
  handle('app:openExternal', async (url) => {
    if (isHttpUrl(url)) await shell.openExternal(url)
  })

  handle('workspaces:add', async (name) => {
    const folder = await pickFolder()
    return folder ? core.addWorkspace(folder, typeof name === 'string' ? name : undefined) : null
  })
  handle('workspaces:addScratch', (name) => {
    // No folder chosen: work in the user's own folder (C:\Users\<name>).
    // Tests use a folder inside their throwaway data folder instead.
    const dir = process.env.AGENTDECK_USER_DATA ? join(app.getPath('userData'), 'Home') : app.getPath('home')
    mkdirSync(dir, { recursive: true })
    return core.addWorkspace(dir, typeof name === 'string' && name.trim() ? name : 'Home')
  })
  handle('workspaces:rename', (id, name) => core.renameWorkspace(id, name))
  handle('workspaces:setSessions', (id, sessions) => core.setSessions(id, sessions))
  handle('workspaces:remove', (id) => core.removeWorkspace(id))
  handle('workspaces:setAccountOverride', (id, p, a) => core.setAccountOverride(id, p, a))
  handle('workspaces:reveal', (id) => {
    const ws = core.workspace(id)
    if (ws) void shell.openPath(ws.path)
  })

  handle('agents:detect', () => core.detectAgents(true))

  handle('pty:create', (opts) => core.createPty(opts))
  handle('pty:dispose', (id) => core.disposePty(id))
  handle('pty:snapshot', (id) => core.ptySnapshot(id))
  handle('pty:list', () => core.listPtys())
  listen('pty:write', (id, data) => core.ptys.write(id, data))
  listen('pty:resize', (id, cols, rows) => core.ptys.resize(id, cols, rows))

  handle('accounts:add', (p, name) => core.addAccount(p, name))
  handle('accounts:rename', (id, name) => core.renameAccount(id, name))
  handle('accounts:remove', (id) => core.removeAccount(id))
  handle('accounts:setDefault', (p, id) => core.setDefaultAccount(p, id))
  handle('accounts:reveal', (id) => {
    const dir = core.accountDir(id)
    if (dir) void shell.openPath(dir)
  })

  handle('threads:list', () => core.listThreads())
  handle('threads:get', (id) => core.getThread(id))
  handle('threads:forPty', (id) => core.threadForPty(id))
  handle('threads:search', (query) => core.searchThreads(String(query ?? '')))

  handle('routines:save', (r) => core.saveRoutine(r))
  handle('routines:remove', (id) => core.removeRoutine(id))
  handle('routines:runNow', (id) => core.runRoutineNow(id))
  handle('routines:listRuns', () => core.listRuns())
  handle('routines:getRun', (id) => core.getRun(id))

  handle('limits:continueOnAccount', (ptyId, accountId, cols, rows) => core.continueOnAccount(ptyId, accountId, cols, rows))
  handle('limits:resumeLater', (id) => core.resumeLater(id))
  handle('limits:dismiss', (id) => core.dismissLimit(id))

  handle('voice:enhance', (text) => core.enhancePrompt(String(text ?? '')))

  handle('composer:commands', (workspaceId, agentId) => core.customCommands(workspaceId, agentId))
  handle('composer:files', (workspaceId) => core.workspaceFiles(workspaceId))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.kanishak.agentdeck')
    core = new AppCore(app.getPath('userData'), send)
    registerIpc()
    setupPermissions()
    createWindow()
    core.start()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', () => core?.shutdown())
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
