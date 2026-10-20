import type {
  Account,
  AppData,
  DetectedAgent,
  Provider,
  PtyCreateOptions,
  PtyInfo,
  Routine,
  RoutineRun,
  Settings,
  Thread,
  ThreadSummary,
  UiState,
  UsageLimitEvent
} from './types'

/** What the renderer sees of the app's saved data (big collections load separately). */
export type AppSnapshot = Omit<AppData, 'runs' | 'layouts'>

export type RunSummary = Omit<RoutineRun, 'output'> & { preview: string }

export interface PtySnapshot {
  data: string
  end: number
}

export type Unsubscribe = () => void

/**
 * Every request/response IPC channel and its signature — the single source of
 * truth used by the preload (caller) and the main process (handler).
 */
export interface InvokeChannels {
  'app:getSnapshot': () => AppSnapshot
  'app:getLayouts': () => Record<string, unknown>
  'app:setLayout': (workspaceId: string, layout: unknown) => void
  'app:setUi': (ui: UiState) => void
  'app:setSettings': (settings: Settings) => void
  'app:openExternal': (url: string) => void
  'workspaces:add': () => string | null
  'workspaces:rename': (id: string, name: string) => void
  'workspaces:remove': (id: string) => void
  'workspaces:setAccountOverride': (id: string, provider: Provider, accountId: string | null) => void
  'workspaces:reveal': (id: string) => void
  'agents:detect': () => DetectedAgent[]
  'pty:create': (opts: PtyCreateOptions) => PtyInfo
  'pty:dispose': (id: string) => void
  'pty:snapshot': (id: string) => PtySnapshot
  'pty:list': () => PtyInfo[]
  'accounts:add': (provider: Provider, name: string) => Account
  'accounts:rename': (id: string, name: string) => void
  'accounts:remove': (id: string) => void
  'accounts:setDefault': (provider: Provider, accountId: string | null) => void
  'accounts:reveal': (id: string) => void
  'threads:list': () => ThreadSummary[]
  'threads:get': (id: string) => Thread | null
  'threads:forPty': (ptyId: string) => ThreadSummary | null
  'threads:search': (query: string) => string[]
  'routines:save': (routine: Routine) => void
  'routines:remove': (id: string) => void
  'routines:runNow': (id: string) => void
  'routines:listRuns': () => RunSummary[]
  'routines:getRun': (id: string) => RoutineRun | null
  'limits:continueOnAccount': (ptyId: string, accountId: string, cols: number, rows: number) => PtyInfo
  'limits:resumeLater': (ptyId: string) => void
  'limits:dismiss': (ptyId: string) => void
  'voice:enhance': (text: string) => string
}

/** Fire-and-forget channels (renderer → main). */
export interface SendChannels {
  'pty:write': (id: string, data: string) => void
  'pty:resize': (id: string, cols: number, rows: number) => void
}

/** Events pushed from main → renderer. */
export interface EventChannels {
  'app:snapshot': (snapshot: AppSnapshot) => void
  'pty:data': (id: string, chunk: string, end: number) => void
  'pty:info': (list: PtyInfo[]) => void
  'pty:limit': (event: UsageLimitEvent) => void
  'routines:runs': (runs: RunSummary[]) => void
}

type Invoke<C extends keyof InvokeChannels> = (...args: Parameters<InvokeChannels[C]>) => Promise<ReturnType<InvokeChannels[C]>>
type On<C extends keyof EventChannels> = (cb: EventChannels[C]) => Unsubscribe

/** The typed API exposed to the renderer as `window.api`. */
export interface AgentDeckApi {
  platform: string
  app: {
    getSnapshot: Invoke<'app:getSnapshot'>
    getLayouts: Invoke<'app:getLayouts'>
    setLayout: Invoke<'app:setLayout'>
    setUi: Invoke<'app:setUi'>
    setSettings: Invoke<'app:setSettings'>
    openExternal: Invoke<'app:openExternal'>
    onSnapshot: On<'app:snapshot'>
  }
  workspaces: {
    add: Invoke<'workspaces:add'>
    rename: Invoke<'workspaces:rename'>
    remove: Invoke<'workspaces:remove'>
    setAccountOverride: Invoke<'workspaces:setAccountOverride'>
    reveal: Invoke<'workspaces:reveal'>
  }
  agents: {
    detect: Invoke<'agents:detect'>
  }
  pty: {
    create: Invoke<'pty:create'>
    write: SendChannels['pty:write']
    resize: SendChannels['pty:resize']
    /** Stop the process and forget the pane. */
    dispose: Invoke<'pty:dispose'>
    snapshot: Invoke<'pty:snapshot'>
    list: Invoke<'pty:list'>
    onData: On<'pty:data'>
    onInfo: On<'pty:info'>
    onLimit: On<'pty:limit'>
  }
  accounts: {
    add: Invoke<'accounts:add'>
    rename: Invoke<'accounts:rename'>
    remove: Invoke<'accounts:remove'>
    setDefault: Invoke<'accounts:setDefault'>
    reveal: Invoke<'accounts:reveal'>
  }
  threads: {
    list: Invoke<'threads:list'>
    get: Invoke<'threads:get'>
    forPty: Invoke<'threads:forPty'>
    search: Invoke<'threads:search'>
  }
  routines: {
    save: Invoke<'routines:save'>
    remove: Invoke<'routines:remove'>
    runNow: Invoke<'routines:runNow'>
    listRuns: Invoke<'routines:listRuns'>
    getRun: Invoke<'routines:getRun'>
    onRuns: On<'routines:runs'>
  }
  limits: {
    continueOnAccount: Invoke<'limits:continueOnAccount'>
    resumeLater: Invoke<'limits:resumeLater'>
    dismiss: Invoke<'limits:dismiss'>
  }
  voice: {
    enhance: Invoke<'voice:enhance'>
  }
}
