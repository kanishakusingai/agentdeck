// Types shared by the main process, preload and renderer.
// Everything here must be plain data (it crosses IPC).

export type Mode = 'agent' | 'code' | 'thread'
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
}

export interface HeadlessSpec {
  /** Args for a read-only headless run; the prompt is written to stdin. */
  args: string[]
  /** Args used instead when the routine may edit files. */
  editArgs: string[]
}

export interface AgentDef {
  id: string
  label: string
  /** Executable names to look for on PATH (without extension). */
  bins: string[]
  provider?: Provider
  headless?: HeadlessSpec
  /** Whether the CLI accepts an initial prompt as its first positional arg. */
  acceptsPromptArg?: boolean
  /** Fixed args that reopen the most recent conversation in the folder. */
  resumeArgs?: string[]
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

export type Schedule =
  | { kind: 'interval'; minutes: number }
  | { kind: 'daily'; time: string; days: number[] }

export interface Routine {
  id: string
  name: string
  prompt: string
  workspaceId: string
  agentId: string
  accountId?: string
  schedule: Schedule
  allowEdits: boolean
  enabled: boolean
  createdAt: number
  lastRunAt?: number
  nextRunAt?: number
}

export type RunStatus = 'running' | 'success' | 'failed'

export interface RoutineRun {
  id: string
  routineId: string
  routineName: string
  startedAt: number
  endedAt?: number
  status: RunStatus
  exitCode?: number
  output: string
  trigger: 'schedule' | 'manual'
}

export type ShellKind = 'powershell' | 'pwsh' | 'cmd' | 'bash'

export interface Settings {
  shell: ShellKind
  terminalFontSize: number
  pushToTalkKey: string
  whisperModel: string
  enhanceAgentId: string
  browserHomeUrl: string
}

export type SidebarTab = 'browser' | 'dashboard'

export interface UiState {
  mode: Mode
  activeWorkspaceId?: string
  sidebarOpen: boolean
  sidebarTab: SidebarTab
}

export interface AppData {
  workspaces: Workspace[]
  layouts: Record<string, unknown>
  accounts: Account[]
  defaults: Partial<Record<Provider, string>>
  routines: Routine[]
  runs: RoutineRun[]
  settings: Settings
  ui: UiState
}

export const DEFAULT_SETTINGS: Settings = {
  shell: 'powershell',
  terminalFontSize: 13,
  pushToTalkKey: 'F9',
  whisperModel: 'Xenova/whisper-base.en',
  enhanceAgentId: 'claude',
  browserHomeUrl: 'http://localhost:3000'
}

export const DEFAULT_UI: UiState = {
  mode: 'code',
  sidebarOpen: true,
  sidebarTab: 'dashboard'
}

export function emptyAppData(): AppData {
  return {
    workspaces: [],
    layouts: {},
    accounts: [],
    defaults: {},
    routines: [],
    runs: [],
    settings: { ...DEFAULT_SETTINGS },
    ui: { ...DEFAULT_UI }
  }
}
