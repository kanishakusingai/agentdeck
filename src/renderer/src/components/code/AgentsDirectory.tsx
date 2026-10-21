import * as RDialog from '@radix-ui/react-dialog'
import { Check, Copy, Download, ExternalLink, LayoutGrid, Play, RefreshCw, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { create } from 'zustand'
import { agentRank } from '@shared/agents'
import type { DetectedAgent } from '@shared/types'
import { openTerminal } from '../../lib/canvas'
import { cn } from '../../lib/cn'
import { subscribePty, writePty } from '../../lib/pty-bus'
import { refreshAgents, toast, useApp } from '../../lib/store'
import { AgentIcon, Button, IconButton } from '../ui'

/*
 * "All agents": every coding-agent CLI AgentDeck knows, with what each one is, whether
 * it's on this PC, and how to install it. Opened from the Launch menu.
 */

interface Target {
  workspaceId: string
  sessionId?: string
}

const useDirectory = create<{ target: Target | null }>(() => ({ target: null }))
export const openAgentsDirectory = (target: Target): void => useDirectory.setState({ target })
const close = (): void => useDirectory.setState({ target: null })

type Filter = 'all' | 'installed' | 'missing'

/** Open a terminal and run `command` in it once the shell has shown its prompt. */
async function runInNewTerminal(target: Target, command: string): Promise<void> {
  const info = await openTerminal({ workspaceId: target.workspaceId, sessionId: target.sessionId })
  if (!info) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, 5000)
    const unsubscribe = subscribePty(info.id, (chunk) => {
      if (/PS[^\r\n]*>\s*$/.test(chunk) || /PS>\s/.test(chunk)) done()
    })
    function done(): void {
      clearTimeout(timer)
      unsubscribe()
      resolve()
    }
  })
  writePty(info.id, `${command}\r`)
}

function AgentCard({ agent, target }: { agent: DetectedAgent; target: Target }) {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    if (!agent.install) return
    await navigator.clipboard.writeText(agent.install)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const launch = (): void => {
    close()
    void openTerminal({ workspaceId: target.workspaceId, sessionId: target.sessionId, agentId: agent.id })
  }
  const install = (): void => {
    if (!agent.install) return
    close()
    void runInNewTerminal(target, agent.install)
    toast(`Installing ${agent.label} in a new terminal. When it finishes, open Launch › All agents › Scan again.`)
  }
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4" data-testid="agent-card" data-agent={agent.id}>
      <div className="flex items-start gap-3">
        <AgentIcon agentId={agent.id} size={18} tile />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-fg">{agent.label}</span>
            {agent.top && <span className="rounded-md border border-line-strong px-1.5 text-2xs text-fg-faint">Popular</span>}
          </div>
          <div className="truncate text-xs text-fg-faint">{agent.maker}</div>
        </div>
        {agent.installed ? (
          <span className="flex shrink-0 items-center gap-1.5 text-2xs font-medium text-ok">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" /> On this PC
          </span>
        ) : (
          <span className="shrink-0 text-2xs text-fg-faint">Not installed</span>
        )}
      </div>
      <p className="text-[13px] leading-snug text-fg-muted">{agent.blurb}</p>
      <div className="mt-auto flex items-center gap-2">
        {agent.installed ? (
          <Button size="sm" variant="primary" onClick={launch} data-testid="agent-launch">
            <Play size={12} /> Launch
          </Button>
        ) : agent.install ? (
          <>
            <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-panel px-2 py-1.5 font-mono text-2xs text-fg-muted" title={agent.install}>
              {agent.install}
            </code>
            <IconButton label={copied ? 'Copied' : 'Copy the install command'} onClick={() => void copy()} className="h-7 w-7 shrink-0">
              {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
            </IconButton>
            <Button size="sm" variant="secondary" onClick={install} title="Run the install command in a new terminal" data-testid="agent-install">
              <Download size={12} /> Install
            </Button>
          </>
        ) : (
          <span className="flex-1 text-xs text-fg-faint">Install steps are on its website.</span>
        )}
        <IconButton label={`${agent.label} website`} onClick={() => void window.api.app.openExternal(agent.url)} className="h-7 w-7 shrink-0">
          <ExternalLink size={13} />
        </IconButton>
      </div>
    </li>
  )
}

export function AgentsDirectory() {
  const target = useDirectory((s) => s.target)
  const agents = useApp((s) => s.agents)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [scanning, setScanning] = useState(false)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...agents]
      .sort((a, b) => Number(b.installed) - Number(a.installed) || agentRank(a) - agentRank(b))
      .filter((a) => (filter === 'installed' ? a.installed : filter === 'missing' ? !a.installed : true))
      .filter((a) => !q || `${a.label} ${a.maker} ${a.blurb}`.toLowerCase().includes(q))
  }, [agents, query, filter])
  const installedCount = agents.filter((a) => a.installed).length

  const scan = async (): Promise<void> => {
    setScanning(true)
    await refreshAgents()
    setScanning(false)
    toast('Checked this PC again for installed agents.')
  }

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: `All ${agents.length}` },
    { id: 'installed', label: `On this PC ${installedCount}` },
    { id: 'missing', label: `Not installed ${agents.length - installedCount}` }
  ]

  return (
    <RDialog.Root open={target !== null} onOpenChange={(o) => !o && close()}>
      <RDialog.Portal>
        <RDialog.Overlay className="ask-fade fixed inset-0 z-[70] bg-black/55 backdrop-blur-[3px]" />
        <RDialog.Content
          data-testid="agents-directory"
          className="ask-pop fixed left-1/2 top-1/2 z-[71] flex h-[min(760px,calc(100vh-64px))] w-[920px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-white/[0.09] bg-[#121215] shadow-[0_28px_80px_-12px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.05)] focus:outline-none"
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-line px-6 py-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-surface text-fg-muted">
              <LayoutGrid size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <RDialog.Title className="text-[16px] font-semibold text-fg">All coding agents</RDialog.Title>
              <RDialog.Description className="mt-0.5 text-[13px] text-fg-muted">
                {agents.length} agents that run in a terminal. Launch the ones on this PC, or install one with a click.
              </RDialog.Description>
            </div>
            <Button size="sm" variant="secondary" onClick={() => void scan()} disabled={scanning}>
              <RefreshCw size={12} className={cn(scanning && 'animate-spin')} /> Scan again
            </Button>
            <RDialog.Close asChild>
              <IconButton label="Close" className="h-8 w-8">
                <X size={15} />
              </IconButton>
            </RDialog.Close>
          </header>
          <div className="flex shrink-0 flex-wrap items-center gap-3 px-6 pt-4">
            <label className="relative min-w-[220px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
              <input
                aria-label="Search agents"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or company"
                className="h-9 w-full rounded-[10px] border border-line-strong bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-fg-faint focus:border-[#6b6b75] focus:outline-none focus:ring-3 focus:ring-white/[0.07]"
                data-testid="agents-search"
              />
            </label>
            <div role="radiogroup" aria-label="Show" className="flex items-center gap-0.5 rounded-lg border border-line bg-panel p-0.5">
              {filters.map((f) => (
                <button
                  key={f.id}
                  role="radio"
                  aria-checked={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn('h-7 rounded-md px-2.5 text-xs font-medium transition-colors', filter === f.id ? 'bg-hover text-fg' : 'text-fg-faint hover:text-fg')}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {shown.length === 0 ? (
              <div className="py-16 text-center text-sm text-fg-faint">No agents match “{query}”.</div>
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {shown.map((a) => (
                  <AgentCard key={a.id} agent={a} target={target!} />
                ))}
              </ul>
            )}
          </div>
          <footer className="shrink-0 border-t border-line px-6 py-3 text-xs text-fg-faint">
            Install commands come from each tool's own docs. Some agents need Node.js (npm) or Python (uv / pip) first. If a new agent doesn't show up after installing, restart AgentDeck.
          </footer>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}
