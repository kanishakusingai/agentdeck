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

/** The typed API exposed to the renderer as `window.api`. */
export interface AgentDeckApi {
  platform: string
  app: {
    getSnapshot(): Promise<AppSnapshot>
    getLayouts(): Promise<Record<string, unknown>>
    setLayout(workspaceId: string, layout: unknown): Promise<void>
    setUi(ui: UiState): Promise<void>
    setSettings(settings: Settings): Promise<void>
    openExternal(url: string): Promise<void>
    onSnapshot(cb: (snapshot: AppSnapshot) => void): Unsubscribe
  }
  workspaces: {
    add(): Promise<string | null>
    rename(id: string, name: string): Promise<void>
    remove(id: string): Promise<void>
    setAccountOverride(id: string, provider: Provider, accountId: string | null): Promise<void>
    reveal(id: string): Promise<void>
  }
  agents: {
    detect(): Promise<DetectedAgent[]>
  }
  pty: {
    create(opts: PtyCreateOptions): Promise<PtyInfo>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    /** Stop the process and forget the pane. */
    dispose(id: string): Promise<void>
    snapshot(id: string): Promise<PtySnapshot>
    list(): Promise<PtyInfo[]>
    onData(cb: (id: string, chunk: string, end: number) => void): Unsubscribe
    onInfo(cb: (list: PtyInfo[]) => void): Unsubscribe
    onLimit(cb: (event: UsageLimitEvent) => void): Unsubscribe
  }
  accounts: {
    add(provider: Provider, name: string): Promise<Account>
    rename(id: string, name: string): Promise<void>
    remove(id: string): Promise<void>
    setDefault(provider: Provider, accountId: string | null): Promise<void>
    reveal(id: string): Promise<void>
  }
  threads: {
    list(): Promise<ThreadSummary[]>
    get(id: string): Promise<Thread | null>
    forPty(ptyId: string): Promise<ThreadSummary | null>
  }
  routines: {
    save(routine: Routine): Promise<void>
    remove(id: string): Promise<void>
    runNow(id: string): Promise<void>
    listRuns(): Promise<RunSummary[]>
    getRun(id: string): Promise<RoutineRun | null>
    onRuns(cb: (runs: RunSummary[]) => void): Unsubscribe
  }
  limits: {
    continueOnAccount(ptyId: string, accountId: string, cols: number, rows: number): Promise<PtyInfo>
    resumeLater(ptyId: string): Promise<void>
    dismiss(ptyId: string): Promise<void>
  }
  voice: {
    enhance(text: string): Promise<string>
  }
}
