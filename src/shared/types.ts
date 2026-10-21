// Types shared by the main process, preload and renderer.
// Everything here must be plain data (it crosses IPC).

export type Provider = 'claude' | 'codex'

/** Pseudo-account id meaning "use the provider's normal login on this PC". */
export const SYSTEM_ACCOUNT_ID = 'system'

export interface Workspace {
  id: string
  name: string
  path: string
  /** Per-provider account override for agents launched in this workspace. */
  accountOverrides: Partial<Record<Provider, string>>
  createdAt: number
  /**
   * Separate screens inside this project, each with its own panes (up to MAX_PANES_PER_SESSION).
   * The first session's id is the workspace id, so older saved layouts keep working.
   */
  sessions?: Session[]
}

export interface Session {
  id: string
  name: string
}

/** A session holds at most this many panes. */
export const MAX_PANES_PER_SESSION = 8

/** The sessions of a workspace (always at least one). */
export function sessionsOf(ws: Pick<Workspace, 'id' | 'sessions'>): Session[] {
  return ws.sessions?.length ? ws.sessions : [{ id: ws.id, name: 'Session 1' }]
}

export interface HeadlessSpec {
  /** Args for a read-only headless run; the prompt is written to stdin. */
  args: string[]
  /** Args used instead when the run may edit files. */
  editArgs: string[]
}

export interface AgentDef {
  id: string
  label: string
  /** Executable names to look for on PATH (without extension). */
  bins: string[]
  /** PATH folders to ignore: a same-named program there is something else (e.g. the maker's editor). */
  notIn?: string[]
  provider?: Provider
  headless?: HeadlessSpec
  /** Whether the CLI accepts an initial prompt as its first positional arg. */
  acceptsPromptArg?: boolean
  /** Fixed args that reopen the most recent conversation in the folder. */
  resumeArgs?: string[]
  /** For the agents directory: who makes it, one line about it, how to install it on Windows, where to read more. */
  maker: string
  blurb: string
  install?: string
  url: string
  /** Position in the Launch menu's short list of the best-known agents (1 = first). */
  top?: number
}

export interface DetectedAgent extends AgentDef {
  installed: boolean
  /** Absolute path of the executable that will be launched. */
  path?: string
}

export interface Account {
  id: string
  provider: Provider
  name: string
  configDir: string
  createdAt: number
}

export type PaneStatus = 'running' | 'exited' | 'limited'

export interface PtyInfo {
  id: string
  workspaceId: string
  cwd: string
  agentId?: string
  accountId?: string
  title: string
  status: PaneStatus
  exitCode?: number
  startedAt: number
  resetAt?: number
}

export interface PtyCreateOptions {
  workspaceId: string
  agentId?: string
  /** Explicit account for this pane; otherwise resolved from workspace/default. */
  accountId?: string
  /** Login flow: run the provider's sign-in instead of the agent. */
  signInAccountId?: string
  /** Reopen the agent's latest conversation in this folder (layout restore). */
  resume?: boolean
  /** The pane's name when it already has one (layout restore). */
  title?: string
  cols: number
  rows: number
}

export interface UsageLimitEvent {
  ptyId: string
  agentId?: string
  accountId?: string
  resetAt?: number
  message: string
}

export type ThreadAgent = 'claude' | 'codex'

export interface ThreadSummary {
  id: string
  agent: ThreadAgent
  accountId: string
  cwd: string
  title: string
  updatedAt: number
  sizeBytes: number
}

export type ThreadRole = 'user' | 'assistant' | 'tool'

export interface ThreadMessage {
  role: ThreadRole
  text: string
  toolName?: string
  timestamp?: number
}

export interface Thread extends ThreadSummary {
  messages: ThreadMessage[]
}

export type ShellKind = 'powershell' | 'pwsh' | 'cmd' | 'bash'

export interface Settings {
  shell: ShellKind
  terminalFontSize: number
  pushToTalkKey: string
  whisperModel: string
  enhanceAgentId: string
  browserHomeUrl: string
  /** PowerShell prompt shows the whole folder path (on) or just the folder name (off). */
  fullPathPrompt: boolean
}

export type SidebarTab = 'browser' | 'dashboard'

/** A browser tab in the right sidebar. 
 is its number ("Browser 2"), fixed when it's made. */
export interface SidebarBrowser {
  id: string
  n: number
  /** Last address it showed. */
  url?: string
}

export interface UiState {
  activeWorkspaceId?: string
  /** Left rail (workspaces and their sessions). */
  railOpen: boolean
  /** Right sidebar (dashboard / browser). */
  sidebarOpen: boolean
  sidebarTab: SidebarTab
  /** Width of the right sidebar in px (dragged by its left edge). */
  sidebarWidth?: number
  /** The sidebar's browser tabs, and which one is shown. */
  sidebarBrowsers?: SidebarBrowser[]
  sidebarBrowser?: string
  /** Projects folded shut in the left rail. */
  collapsedSessions?: string[]
  /** The session shown for each project (workspace id → session id). */
  activeSessions?: Record<string, string>
}

export interface AppData {
  workspaces: Workspace[]
  layouts: Record<string, unknown>
  accounts: Account[]
  defaults: Partial<Record<Provider, string>>
  settings: Settings
  ui: UiState
}

export const DEFAULT_SETTINGS: Settings = {
  shell: 'powershell',
  terminalFontSize: 13,
  pushToTalkKey: 'F9',
  whisperModel: 'Xenova/whisper-base.en',
  enhanceAgentId: 'claude',
  browserHomeUrl: 'http://localhost:3000',
  fullPathPrompt: true
}

export const DEFAULT_UI: UiState = {
  railOpen: true,
  sidebarOpen: true,
  sidebarTab: 'dashboard'
}

export function emptyAppData(): AppData {
  return {
    workspaces: [],
    layouts: {},
    accounts: [],
    defaults: {},
    settings: { ...DEFAULT_SETTINGS },
    ui: { ...DEFAULT_UI }
  }
}
