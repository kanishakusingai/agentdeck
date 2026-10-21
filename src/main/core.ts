import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, join, resolve } from 'path'
import type { AppSnapshot, PtySnapshot } from '@shared/api'
import { accountLabel } from '@shared/accounts'
import { agentById, PROVIDERS } from '@shared/agents'
import {
  SYSTEM_ACCOUNT_ID,
  type Account,
  type DetectedAgent,
  type Session,
  type Provider,
  type PtyCreateOptions,
  type PtyInfo,
  type Settings,
  type Thread,
  type ThreadSummary,
  type UiState,
  type Workspace
} from '@shared/types'
import { accountEnv, resolveAccount } from './accounts'
import { detectAgents } from './agents'
import { asPastedMessage } from '@shared/paste'
import { buildHandoffSummary, handoffPrompt } from './handoff'
import { ENHANCE_INSTRUCTION, runHeadless } from './headless'
import { buildShellLaunch } from './launch'
import { paneTitle } from '@shared/pane-names'
import { PtyManager } from './pty-manager'
import { JsonStore } from './store'
import { listThreads, readThread, type ThreadIndexEntry, type TranscriptRoot } from './transcripts'
import { detectUsageLimit, stripAnsi } from './usage-limit'

type Send = (channel: string, ...args: unknown[]) => void

const samePath = (a: string, b: string): boolean =>
  resolve(a).replace(/[\\/]+$/, '').toLowerCase() === resolve(b).replace(/[\\/]+$/, '').toLowerCase()

/** All app behaviour that isn't window management. IPC handlers call into this. */
export class AppCore {
  readonly store: JsonStore
  readonly ptys = new PtyManager()
  private readonly infos = new Map<string, PtyInfo>()
  private readonly limitTails = new Map<string, string>()
  private readonly limitMutedUntil = new Map<string, number>()
  private readonly resumeTimers = new Map<string, NodeJS.Timeout>()
  private readonly threadIndex = new Map<string, ThreadIndexEntry>()
  private agents: DetectedAgent[] | undefined

  constructor(
    private readonly dataDir: string,
    private readonly send: Send
  ) {
    this.store = new JsonStore(dataDir)
    this.ptys.on('data', (id: string, chunk: string, end: number) => {
      this.send('pty:data', id, chunk, end)
      this.watchForLimit(id, chunk)
    })
    this.ptys.on('exit', (id: string, exitCode: number) => {
      const info = this.infos.get(id)
      if (info) {
        this.infos.set(id, { ...info, status: 'exited', exitCode })
        this.broadcastPtys()
      }
    })
  }

  // ---------- snapshot ----------

  snapshot(): AppSnapshot {
    const { layouts: _layouts, ...rest } = this.store.snapshot()
    return rest
  }

  broadcast(): void {
    this.send('app:snapshot', this.snapshot())
  }

  setUi(ui: UiState): void {
    this.store.set('ui', ui)
  }

  setSettings(settings: Settings): void {
    this.store.set('settings', settings)
    this.broadcast()
  }

  getLayouts(): Record<string, unknown> {
    return this.store.get('layouts')
  }

  setLayout(workspaceId: string, layout: unknown): void {
    this.store.update('layouts', (l) => ({ ...l, [workspaceId]: layout }))
  }

  // ---------- workspaces ----------

  /**
   * Add a project. Without a name, opening a folder that is already a project just returns it;
   * a named project is always new (several projects may share a folder, e.g. the user folder).
   */
  addWorkspace(path: string, name?: string): string {
    const clean = name?.trim().slice(0, 60)
    const existing = this.store.get('workspaces').find((w) => samePath(w.path, path) && (!clean || w.name === clean))
    if (existing) return existing.id
    const ws: Workspace = { id: randomUUID(), name: clean || basename(path) || path, path, accountOverrides: {}, createdAt: Date.now() }
    this.store.update('workspaces', (list) => [...list, ws])
    this.broadcast()
    return ws.id
  }

  renameWorkspace(id: string, name: string): void {
    const clean = name.trim()
    if (!clean) return
    this.store.update('workspaces', (list) => list.map((w) => (w.id === id ? { ...w, name: clean } : w)))
    this.broadcast()
  }

  /** Save a project's sessions (names trimmed and capped; unnamed or duplicate ids dropped). */
  setSessions(id: string, sessions: Session[]): void {
    const seen = new Set<string>()
    const clean = (Array.isArray(sessions) ? sessions : [])
      .map((p) => ({ id: String(p?.id ?? ''), name: String(p?.name ?? '').trim().slice(0, 60) }))
      .filter((p) => p.id && p.name && !seen.has(p.id) && Boolean(seen.add(p.id)))
    this.store.update('workspaces', (list) => list.map((w) => (w.id === id ? { ...w, sessions: clean, projects: undefined } : w)))
    // A deleted session's saved layout goes too (the first session's layout is keyed by the workspace id).
    const keep = new Set([id, ...clean.map((c) => c.id)])
    this.store.update('layouts', (layouts) =>
      Object.fromEntries(Object.entries(layouts).filter(([key]) => keep.has(key) || !this.isSessionOf(key, id)))
    )
    this.broadcast()
  }

  /** Session ids are "<workspaceId>:<uuid>" (the first session is the workspace id itself). */
  private isSessionOf(key: string, workspaceId: string): boolean {
    return key === workspaceId || key.startsWith(`${workspaceId}:`)
  }
  removeWorkspace(id: string): void {
    for (const info of [...this.infos.values()]) if (info.workspaceId === id) this.disposePty(info.id)
    this.store.update('workspaces', (list) => list.filter((w) => w.id !== id))
    this.store.update('layouts', (layouts) => Object.fromEntries(Object.entries(layouts).filter(([key]) => !this.isSessionOf(key, id))))
    this.broadcast()
  }

  setAccountOverride(id: string, provider: Provider, accountId: string | null): void {
    this.store.update('workspaces', (list) =>
      list.map((w) => {
        if (w.id !== id) return w
        const overrides = { ...w.accountOverrides }
        if (accountId) overrides[provider] = accountId
        else delete overrides[provider]
        return { ...w, accountOverrides: overrides }
      })
    )
    this.broadcast()
  }

  workspace(id: string): Workspace | undefined {
    return this.store.get('workspaces').find((w) => w.id === id)
  }

  // ---------- agents ----------

  detectAgents(force = false): DetectedAgent[] {
    if (!this.agents || force) this.agents = detectAgents()
    return this.agents
  }

  private agent(id: string | undefined): DetectedAgent | undefined {
    return id ? this.detectAgents().find((a) => a.id === id) : undefined
  }

  // ---------- accounts ----------

  addAccount(provider: Provider, name: string): Account {
    const id = randomUUID()
    const account: Account = {
      id,
      provider,
      name: name.trim() || `${PROVIDERS[provider].label} account`,
      configDir: join(this.dataDir, 'accounts', id),
      createdAt: Date.now()
    }
    mkdirSync(account.configDir, { recursive: true })
    this.store.update('accounts', (list) => [...list, account])
    this.broadcast()
    return account
  }

  renameAccount(id: string, name: string): void {
    const clean = name.trim()
    if (!clean) return
    this.store.update('accounts', (list) => list.map((a) => (a.id === id ? { ...a, name: clean } : a)))
    this.broadcast()
  }

  removeAccount(id: string): void {
    const account = this.account(id)
    if (!account) return
    this.store.update('accounts', (list) => list.filter((a) => a.id !== id))
    this.store.update('defaults', (d) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== id)))
    this.store.update('workspaces', (list) =>
      list.map((w) => ({
        ...w,
        accountOverrides: Object.fromEntries(Object.entries(w.accountOverrides).filter(([, v]) => v !== id))
      }))
    )
    // The folder holds that account's sign-in; deleting it signs the account out.
    if (account.configDir.startsWith(join(this.dataDir, 'accounts'))) {
      rmSync(account.configDir, { recursive: true, force: true })
    }
    this.broadcast()
  }

  setDefaultAccount(provider: Provider, accountId: string | null): void {
    this.store.update('defaults', (d) => {
      const next = { ...d }
      if (accountId && accountId !== SYSTEM_ACCOUNT_ID) next[provider] = accountId
      else delete next[provider]
      return next
    })
    this.broadcast()
  }

  account(id: string | undefined): Account | undefined {
    return this.store.get('accounts').find((a) => a.id === id)
  }

  accountDir(id: string): string | undefined {
    return this.account(id)?.configDir
  }

  accountLabel(id: string | undefined): string {
    return accountLabel(this.store.get('accounts'), id)
  }

  private resolveFor(provider: Provider, workspace: Workspace | undefined, explicit?: string): string {
    return resolveAccount({
      provider,
      accounts: this.store.get('accounts'),
      defaults: this.store.get('defaults'),
      workspace,
      explicit
    })
  }

  // ---------- terminals ----------

  createPty(opts: PtyCreateOptions): PtyInfo {
    const workspace = this.workspace(opts.workspaceId)
    const cwd = workspace && existsSync(workspace.path) ? workspace.path : homedir()
    const settings = this.store.get('settings')

    let agent = this.agent(opts.agentId)
    let accountId: string | undefined
    let commandArgs: string[] = []
    let title = 'Terminal'

    if (opts.signInAccountId) {
      const account = this.account(opts.signInAccountId)
      if (!account) throw new Error('That account no longer exists.')
      agent = this.agent(account.provider)
      if (!agent?.installed) throw new Error(`Install ${PROVIDERS[account.provider].agentLabel} first, then try signing in again.`)
      accountId = account.id
      commandArgs = PROVIDERS[account.provider].loginArgs
      title = `Sign in · ${account.name}`
    } else if (agent) {
      if (!agent.installed) throw new Error(`${agent.label} isn't installed on this PC.`)
      if (agent.provider) accountId = this.resolveFor(agent.provider, workspace, opts.accountId)
      if (opts.resume && agent.resumeArgs) commandArgs = agent.resumeArgs
      title = agent.label
    }
    // Agents get a person's name, terminals are numbered ("Terminal 2"), so panes are easy to tell apart.
    const taken = [...this.infos.values()].filter((i) => i.workspaceId === opts.workspaceId).map((i) => i.title)
    title = paneTitle({ base: title, agent: Boolean(agent) && !opts.signInAccountId, taken, wanted: opts.title })

    // Only the detected executable path and fixed, app-defined arguments reach the shell.
    const launch = buildShellLaunch({ shell: settings.shell, command: agent?.path, commandArgs, fullPathPrompt: settings.fullPathPrompt !== false })
    const id = this.ptys.create({
      file: launch.file,
      args: launch.args,
      cwd,
      env: { ...accountEnv(this.account(accountId)), AGENTDECK: '1' },
      cols: opts.cols,
      rows: opts.rows
    })
    const info: PtyInfo = {
      id,
      workspaceId: opts.workspaceId,
      cwd,
      agentId: agent?.id,
      accountId,
      title,
      status: 'running',
      startedAt: Date.now()
    }
    this.infos.set(id, info)
    this.broadcastPtys()
    return info
  }

  ptySnapshot(id: string): PtySnapshot {
    return this.ptys.snapshot(id)
  }

  listPtys(): PtyInfo[] {
    return [...this.infos.values()]
  }

  disposePty(id: string): void {
    this.ptys.kill(id)
    this.infos.delete(id)
    this.limitTails.delete(id)
    this.limitMutedUntil.delete(id)
    const timer = this.resumeTimers.get(id)
    if (timer) clearTimeout(timer)
    this.resumeTimers.delete(id)
    this.broadcastPtys()
  }

  private broadcastPtys(): void {
    this.send('pty:info', this.listPtys())
  }

  private watchForLimit(id: string, chunk: string): void {
    const info = this.infos.get(id)
    if (!info?.agentId || !agentById(info.agentId)?.provider || info.status === 'limited') return
    if ((this.limitMutedUntil.get(id) ?? 0) > Date.now()) return
    const tail = ((this.limitTails.get(id) ?? '') + stripAnsi(chunk)).slice(-3000)
    this.limitTails.set(id, tail)
    // CLIs print the limit notice as their latest status, so only look at the end of
    // the output; this avoids false alarms when an agent merely reads text about limits.
    const result = detectUsageLimit(tail.slice(-600))
    if (!result.limited) return
    this.limitTails.set(id, '')
    const next: PtyInfo = { ...info, status: 'limited', resetAt: result.resetAt }
    this.infos.set(id, next)
    this.send('pty:limit', {
      ptyId: id,
      agentId: info.agentId,
      accountId: info.accountId,
      resetAt: result.resetAt,
      message: tail.trim().split('\n').slice(-3).join('\n')
    })
    this.broadcastPtys()
  }

  // ---------- usage limits ----------

  continueOnAccount(ptyId: string, accountId: string, cols: number, rows: number): PtyInfo {
    const info = this.infos.get(ptyId)
    if (!info?.agentId) throw new Error('This pane is not running an agent.')
    const workspace = this.workspace(info.workspaceId)
    const agent = this.agent(info.agentId)
    const summary = this.threadForPty(ptyId)
    const thread = summary ? this.getThread(summary.id) : null
    const markdown = buildHandoffSummary({
      workspaceName: workspace?.name ?? basename(info.cwd),
      workspacePath: info.cwd,
      agentLabel: agent?.label ?? info.agentId,
      fromAccount: this.accountLabel(info.accountId),
      messages: thread?.messages,
      terminalTail: this.ptys.getBuffer(ptyId)
    })
    const dir = join(this.dataDir, 'handoffs')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `handoff-${new Date().toISOString().replace(/[:.]/g, '-')}.md`)
    writeFileSync(file, markdown, 'utf8')

    // The old pane stays open (with its scrollback) so nothing is lost.
    const next = this.createPty({ workspaceId: info.workspaceId, agentId: info.agentId, accountId, cols, rows })
    this.dismissLimit(ptyId)
    // Type the handoff into the agent once its UI has settled — never via the command line.
    this.typeWhenReady(next.id, asPastedMessage(handoffPrompt(file)))
    return next
  }

  /** Write a message into an agent's input after its startup output goes quiet. */
  private typeWhenReady(ptyId: string, message: string, quietMs = 2500, maxMs = 30000): void {
    let quiet: NodeJS.Timeout | undefined
    const started = Date.now()
    const send = (): void => {
      this.ptys.off('data', onData)
      clearTimeout(quiet)
      clearTimeout(cap)
      if (!this.ptys.has(ptyId)) return
      this.ptys.write(ptyId, message)
      setTimeout(() => this.ptys.write(ptyId, '\r'), 150)
    }
    const onData = (id: string): void => {
      if (id !== ptyId) return
      clearTimeout(quiet)
      quiet = setTimeout(send, Math.max(0, Math.min(quietMs, maxMs - (Date.now() - started))))
    }
    const cap = setTimeout(send, maxMs)
    this.ptys.on('data', onData)
  }

  resumeLater(ptyId: string): void {
    const info = this.infos.get(ptyId)
    if (!info?.resetAt) return
    const existing = this.resumeTimers.get(ptyId)
    if (existing) clearTimeout(existing)
    const delay = Math.max(0, info.resetAt - Date.now()) + 60000
    this.resumeTimers.set(
      ptyId,
      setTimeout(() => {
        this.resumeTimers.delete(ptyId)
        if (!this.ptys.has(ptyId)) return
        this.ptys.write(ptyId, 'continue\r')
        this.dismissLimit(ptyId)
      }, Math.min(delay, 2 ** 31 - 1))
    )
  }

  dismissLimit(ptyId: string): void {
    const info = this.infos.get(ptyId)
    if (!info || info.status !== 'limited') return
    // Terminals repaint old output on resize, which would re-trigger the same notice.
    this.limitMutedUntil.set(ptyId, Date.now() + 30 * 60000)
    this.limitTails.set(ptyId, '')
    this.infos.set(ptyId, { ...info, status: 'running', resetAt: undefined })
    this.broadcastPtys()
  }

  // ---------- conversations (read from the agents' own transcripts, for handoffs) ----------

  private transcriptRoots(): TranscriptRoot[] {
    const roots: TranscriptRoot[] = (Object.keys(PROVIDERS) as Provider[]).map((p) => ({
      agent: p,
      accountId: SYSTEM_ACCOUNT_ID,
      home: process.env[PROVIDERS[p].homeEnv] || join(homedir(), PROVIDERS[p].defaultHome)
    }))
    for (const a of this.store.get('accounts')) roots.push({ agent: a.provider, accountId: a.id, home: a.configDir })
    return roots
  }

  private listThreads(): ThreadSummary[] {
    const entries = listThreads(this.transcriptRoots())
    this.threadIndex.clear()
    for (const e of entries) this.threadIndex.set(e.id, e)
    return entries.map(({ file: _file, ...summary }) => summary)
  }

  private getThread(id: string): Thread | null {
    if (!this.threadIndex.has(id)) this.listThreads()
    const entry = this.threadIndex.get(id)
    return entry ? readThread(entry) : null
  }

  private threadForPty(ptyId: string): ThreadSummary | null {
    const info = this.infos.get(ptyId)
    const provider = agentById(info?.agentId)?.provider
    if (!info || !provider) return null
    const accountId = info.accountId ?? SYSTEM_ACCOUNT_ID
    return (
      this.listThreads().find(
        (t) =>
          t.agent === provider &&
          t.accountId === accountId &&
          samePath(t.cwd || '.', info.cwd) &&
          t.updatedAt >= info.startedAt - 60000
      ) ?? null
    )
  }

  // ---------- voice ----------

  async enhancePrompt(text: string): Promise<string> {
    const settings = this.store.get('settings')
    const candidates = [settings.enhanceAgentId, 'claude', 'codex', 'gemini']
    const agent = candidates.map((id) => this.agent(id)).find((a) => a?.installed && a.headless)
    if (!agent) throw new Error('Enhance Prompt needs Claude Code, Codex or Gemini CLI installed.')
    const accountId = agent.provider ? this.resolveFor(agent.provider, undefined) : undefined
    const result = await runHeadless({
      agent,
      cwd: homedir(),
      env: accountEnv(this.account(accountId)),
      prompt: `${ENHANCE_INSTRUCTION}\n${text}`,
      allowEdits: false,
      timeoutMs: 120000
    })
    if (result.exitCode !== 0) throw new Error(stripAnsi(result.output).trim().slice(-400) || 'The agent could not rewrite the prompt.')
    return stripAnsi(result.output).trim()
  }

  // ---------- lifecycle ----------

  shutdown(): void {
    for (const t of this.resumeTimers.values()) clearTimeout(t)
    this.ptys.disposeAll()
    this.store.flush()
  }
}
