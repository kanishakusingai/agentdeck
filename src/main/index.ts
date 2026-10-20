import { app, BrowserWindow, dialog, ipcMain, session, shell, type WebContents } from 'electron'
import { join } from 'path'
import type { Provider, PtyCreateOptions, Routine, Settings, UiState } from '@shared/types'
import { AppCore } from './core'

// Tests run against a throwaway data folder.
if (process.env.AGENTDECK_USER_DATA) app.setPath('userData', process.env.AGENTDECK_USER_DATA)

const BG = '#0b0d10'
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
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin'
      ? { titleBarOverlay: { color: BG, symbolColor: '#9aa3ad', height: 40 } }
      : { trafficLightPosition: { x: 14, y: 13 } }),
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

  // Docked browser panes: no Node, no preload, http(s) only.
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
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
  const handle = (channel: string, fn: (...args: never[]) => unknown): void => {
    ipcMain.handle(channel, (_event, ...args) => (fn as (...a: unknown[]) => unknown)(...args))
  }

  handle('app:getSnapshot', () => core.snapshot())
  handle('app:getLayouts', () => core.getLayouts())
  handle('app:setLayout', (id: string, layout: unknown) => core.setLayout(id, layout))
  handle('app:setUi', (ui: UiState) => core.setUi(ui))
  handle('app:setSettings', (s: Settings) => core.setSettings(s))
  handle('app:openExternal', (url: string) => (isHttpUrl(url) ? shell.openExternal(url) : undefined))

  handle('workspaces:add', async () => {
    const folder = await pickFolder()
    return folder ? core.addWorkspace(folder) : null
  })
  handle('workspaces:rename', (id: string, name: string) => core.renameWorkspace(id, name))
  handle('workspaces:remove', (id: string) => core.removeWorkspace(id))
  handle('workspaces:setAccountOverride', (id: string, p: Provider, a: string | null) => core.setAccountOverride(id, p, a))
  handle('workspaces:reveal', (id: string) => {
    const ws = core.workspace(id)
    if (ws) void shell.openPath(ws.path)
  })

  handle('agents:detect', () => core.detectAgents(true))

  handle('pty:create', (opts: PtyCreateOptions) => core.createPty(opts))
  handle('pty:dispose', (id: string) => core.disposePty(id))
  handle('pty:snapshot', (id: string) => core.ptySnapshot(id))
  handle('pty:list', () => core.listPtys())
  ipcMain.on('pty:write', (_e, id: string, data: string) => core.ptys.write(id, data))
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => core.ptys.resize(id, cols, rows))

  handle('accounts:add', (p: Provider, name: string) => core.addAccount(p, name))
  handle('accounts:rename', (id: string, name: string) => core.renameAccount(id, name))
  handle('accounts:remove', (id: string) => core.removeAccount(id))
  handle('accounts:setDefault', (p: Provider, id: string | null) => core.setDefaultAccount(p, id))
  handle('accounts:reveal', (id: string) => {
    const dir = core.accountDir(id)
    if (dir) void shell.openPath(dir)
  })

  handle('threads:list', () => core.listThreads())
  handle('threads:get', (id: string) => core.getThread(id))
  handle('threads:forPty', (id: string) => core.threadForPty(id))

  handle('routines:save', (r: Routine) => core.saveRoutine(r))
  handle('routines:remove', (id: string) => core.removeRoutine(id))
  handle('routines:runNow', (id: string) => core.runRoutineNow(id))
  handle('routines:listRuns', () => core.listRuns())
  handle('routines:getRun', (id: string) => core.getRun(id))

  handle('limits:continueOnAccount', (ptyId: string, accountId: string, cols: number, rows: number) =>
    core.continueOnAccount(ptyId, accountId, cols, rows)
  )
  handle('limits:resumeLater', (id: string) => core.resumeLater(id))
  handle('limits:dismiss', (id: string) => core.dismissLimit(id))

  handle('voice:enhance', (text: string) => core.enhancePrompt(String(text ?? '')))
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
