import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AgentDeckApi, EventChannels, InvokeChannels, SendChannels, Unsubscribe } from '@shared/api'

function call<C extends keyof InvokeChannels>(channel: C) {
  return (...args: Parameters<InvokeChannels[C]>) => ipcRenderer.invoke(channel, ...args) as Promise<ReturnType<InvokeChannels[C]>>
}

function send<C extends keyof SendChannels>(channel: C) {
  return (...args: Parameters<SendChannels[C]>): void => ipcRenderer.send(channel, ...args)
}

function on<C extends keyof EventChannels>(channel: C) {
  return (cb: EventChannels[C]): Unsubscribe => {
    const listener = (_e: IpcRendererEvent, ...args: unknown[]): void =>
      (cb as (...a: unknown[]) => void)(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

const api = {
  platform: process.platform,
  osBuild: process.platform === 'win32' ? Number(process.getSystemVersion().split('.')[2]) || 0 : 0,
  app: {
    getSnapshot: call('app:getSnapshot'),
    getLayouts: call('app:getLayouts'),
    setLayout: call('app:setLayout'),
    setUi: call('app:setUi'),
    setSettings: call('app:setSettings'),
    openExternal: call('app:openExternal'),
    onSnapshot: on('app:snapshot')
  },
  workspaces: {
    add: call('workspaces:add'),
    addScratch: call('workspaces:addScratch'),
    rename: call('workspaces:rename'),
    setProjects: call('workspaces:setProjects'),
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
    write: send('pty:write'),
    resize: send('pty:resize'),
    dispose: call('pty:dispose'),
    snapshot: call('pty:snapshot'),
    list: call('pty:list'),
    onData: on('pty:data'),
    onInfo: on('pty:info'),
    onLimit: on('pty:limit')
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
    forPty: call('threads:forPty'),
    search: call('threads:search')
  },
  routines: {
    save: call('routines:save'),
    remove: call('routines:remove'),
    runNow: call('routines:runNow'),
    listRuns: call('routines:listRuns'),
    getRun: call('routines:getRun'),
    onRuns: on('routines:runs')
  },
  limits: {
    continueOnAccount: call('limits:continueOnAccount'),
    resumeLater: call('limits:resumeLater'),
    dismiss: call('limits:dismiss')
  },
  voice: {
    enhance: call('voice:enhance')
  },
  composer: {
    commands: call('composer:commands'),
    files: call('composer:files')
  }
} satisfies AgentDeckApi

contextBridge.exposeInMainWorld('api', api)
