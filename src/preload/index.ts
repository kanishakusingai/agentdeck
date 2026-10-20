import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AgentDeckApi, Unsubscribe } from '@shared/api'

const call =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args)

function on<A extends unknown[]>(channel: string, cb: (...args: A) => void): Unsubscribe {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as A))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: AgentDeckApi = {
  platform: process.platform,
  app: {
    getSnapshot: call('app:getSnapshot'),
    getLayouts: call('app:getLayouts'),
    setLayout: call('app:setLayout'),
    setUi: call('app:setUi'),
    setSettings: call('app:setSettings'),
    openExternal: call('app:openExternal'),
    onSnapshot: (cb) => on('app:snapshot', cb)
  },
  workspaces: {
    add: call('workspaces:add'),
    rename: call('workspaces:rename'),
    remove: call('workspaces:remove'),
    setAccountOverride: call('workspaces:setAccountOverride'),
    reveal: call('workspaces:reveal')
  },
  agents: {
    detect: call('agents:detect')
  },
  pty: {
    create: call('pty:create'),
    // Keystrokes and resizes are fire-and-forget for low latency.
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    dispose: call('pty:dispose'),
    snapshot: call('pty:snapshot'),
    list: call('pty:list'),
    onData: (cb) => on('pty:data', cb),
    onInfo: (cb) => on('pty:info', cb),
    onLimit: (cb) => on('pty:limit', cb)
  },
  accounts: {
    add: call('accounts:add'),
    rename: call('accounts:rename'),
    remove: call('accounts:remove'),
    setDefault: call('accounts:setDefault'),
    reveal: call('accounts:reveal')
  },
  threads: {
    list: call('threads:list'),
    get: call('threads:get'),
    forPty: call('threads:forPty')
  },
  routines: {
    save: call('routines:save'),
    remove: call('routines:remove'),
    runNow: call('routines:runNow'),
    listRuns: call('routines:listRuns'),
    getRun: call('routines:getRun'),
    onRuns: (cb) => on('routines:runs', cb)
  },
  limits: {
    continueOnAccount: call('limits:continueOnAccount'),
    resumeLater: call('limits:resumeLater'),
    dismiss: call('limits:dismiss')
  },
  voice: {
    enhance: call('voice:enhance')
  }
} as AgentDeckApi

contextBridge.exposeInMainWorld('api', api)
