import { Activity, Globe } from 'lucide-react'
import { useEffect, useState } from 'react'
import { agentById } from '@shared/agents'
import type { PtyInfo } from '@shared/types'
import { accountName } from '../../lib/accounts'
import { focusPty, openBrowserPane } from '../../lib/canvas'
import { cn } from '../../lib/cn'
import { setSidebarTab, useApp } from '../../lib/store'
import { StatusDot } from '../ui'
import { BrowserView } from './BrowserView'

function elapsed(ms: number, now: number): string {
  const m = Math.floor((now - ms) / 60000)
  if (m < 1) return '<1m'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

function Dashboard() {
  const snap = useApp((s) => s.snapshot!)
  const ptyMap = useApp((s) => s.ptys)
  const ptys = Object.values(ptyMap)
  const now = useNow()
  const agentsRunning = ptys.filter((p) => p.agentId && p.status === 'running').length
  const limited = ptys.filter((p) => p.status === 'limited').length
  const byWorkspace = snap.workspaces
    .map((w) => ({ ws: w, list: ptys.filter((p) => p.workspaceId === w.id).sort((a, b) => a.startedAt - b.startedAt) }))
    .filter((g) => g.list.length)

  const statusText = (p: PtyInfo): string => (p.status === 'limited' ? 'Usage limit' : p.status === 'exited' ? `Exited ${p.exitCode ?? ''}`.trim() : 'Running')

  return (
    <div className="flex h-full flex-col" data-testid="dashboard">
      <div className="grid grid-cols-3 border-b border-line">
        {[
          { label: 'Agents working', value: agentsRunning, tone: agentsRunning ? 'text-ok' : 'text-fg' },
          { label: 'Need attention', value: limited, tone: limited ? 'text-warn' : 'text-fg' },
          { label: 'Panes open', value: ptys.length, tone: 'text-fg' }
        ].map((s, i) => (
          <div key={s.label} className={cn('px-3 py-3', i > 0 && 'border-l border-line')}>
            <div className={cn('tabular text-lg font-semibold', s.tone)}>{s.value}</div>
            <div className="text-2xs text-fg-faint">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {byWorkspace.length === 0 && (
          <div className="px-4 py-8 text-center text-xs leading-relaxed text-fg-faint">
            Nothing running yet.
            <br />
            Launch an agent and it will show up here.
          </div>
        )}
        {byWorkspace.map(({ ws, list }) => (
          <section key={ws.id} className="mb-2">
            <div className="px-4 pb-1 pt-2 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-faint">{ws.name}</div>
            <ul>
              {list.map((p) => {
                const provider = agentById(p.agentId)?.provider
                return (
                  <li key={p.id}>
                    <button onClick={() => focusPty(p.id)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover/60" data-testid="dashboard-row">
                      <StatusDot status={p.status} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-fg">{p.title}</div>
                        <div className="truncate text-2xs text-fg-faint">
                          {statusText(p)}
                          {provider && ` · ${accountName(snap, p.accountId)}`}
                        </div>
                      </div>
                      <span className="tabular text-2xs text-fg-faint">{elapsed(p.startedAt, now)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

export function Sidebar() {
  const tab = useApp((s) => s.snapshot!.ui.sidebarTab)
  const home = useApp((s) => s.snapshot!.settings.browserHomeUrl)
  const workspaceId = useApp((s) => s.snapshot!.ui.activeWorkspaceId)
  const tabs = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: Activity },
    { id: 'browser' as const, label: 'Browser', icon: Globe }
  ]
  return (
    <aside aria-label="Sidebar" className="flex h-full flex-col">
      <div role="tablist" className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setSidebarTab(t.id)}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
              tab === t.id ? 'bg-raised text-fg' : 'text-fg-muted hover:text-fg'
            )}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        {/* Keep the browser mounted so the page doesn't reload when switching tabs. */}
        <div className={cn('absolute inset-0', tab !== 'browser' && 'invisible')}>
          <BrowserView initialUrl={home} onPopOut={workspaceId ? (url) => void openBrowserPane(workspaceId, url) : undefined} />
        </div>
        {tab === 'dashboard' && (
          <div className="absolute inset-0 bg-panel">
            <Dashboard />
          </div>
        )}
      </div>
    </aside>
  )
}
