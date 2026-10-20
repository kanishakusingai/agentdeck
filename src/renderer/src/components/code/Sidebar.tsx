import { Globe, LayoutDashboard } from 'lucide-react'
import { agentById } from '@shared/agents'
import type { PtyInfo } from '@shared/types'
import { accountName } from '../../lib/accounts'
import { tracker, useActivityClock, type Activity } from '../../lib/activity'
import { focusPty, openBrowserPane } from '../../lib/canvas'
import { cn } from '../../lib/cn'
import { setSidebarTab, useApp } from '../../lib/store'
import { ActivityDot, activityLabel, activityText, AgentIcon } from '../ui'
import { BrowserView } from './BrowserView'

function elapsed(ms: number, now: number): string {
  const m = Math.floor((now - ms) / 60000)
  if (m < 1) return ''
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

const ORDER: Activity[] = ['needs', 'working', 'idle']

function Stat({ activity, value }: { activity: Activity; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5" data-testid={`stat-${activity}`}>
      <div className="flex items-center gap-1.5 text-2xs font-medium text-fg-muted">
        <ActivityDot activity={activity} />
        {activityLabel(activity)}
      </div>
      <div className="tabular mt-1 text-xl font-semibold leading-none text-fg">{value}</div>
    </div>
  )
}

function Dashboard({ rows }: { rows: { info: PtyInfo; activity: Activity }[] }) {
  const snap = useApp((s) => s.snapshot!)
  const now = useActivityClock()
  const count = (a: Activity): number => rows.filter((r) => r.activity === a).length
  const wsName = (id: string): string => snap.workspaces.find((w) => w.id === id)?.name ?? ''

  const subtitle = (p: PtyInfo): string => {
    const agent = agentById(p.agentId)
    const parts = [agent?.label ?? 'Terminal', wsName(p.workspaceId)]
    if (agent?.provider) parts.push(accountName(snap, p.accountId))
    return parts.filter(Boolean).join(' · ')
  }
  const statusText = (p: PtyInfo, a: Activity): string => {
    if (p.status === 'limited') return 'Usage limit'
    if (p.status === 'exited') return 'Exited'
    const since = tracker.since(p.id, a)
    const time = since !== undefined && a !== 'idle' ? elapsed(since, now) : ''
    return time ? `${activityLabel(a)} ${time}` : activityLabel(a)
  }

  return (
    <div className="flex h-full flex-col" data-testid="dashboard">
      <div className="grid shrink-0 grid-cols-3 gap-2 p-3">
        {ORDER.map((a) => (
          <Stat key={a} activity={a} value={count(a)} />
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 pb-3">
        {rows.length === 0 && (
          <div className="px-4 py-10 text-center text-xs leading-relaxed text-fg-faint">
            Nothing running yet.
            <br />
            Launch an agent and it shows up here.
          </div>
        )}
        {ORDER.map((a) => {
          const list = rows.filter((r) => r.activity === a)
          if (list.length === 0) return null
          return (
            <section key={a} className="mb-1">
              <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-3 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-faint">
                {activityLabel(a)} <span className="tabular text-fg-muted">{list.length}</span>
              </div>
              <ul className="flex flex-col gap-px">
                {list.map(({ info: p }) => (
                  <li key={p.id}>
                    <button onClick={() => focusPty(p.id)} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-hover/70" data-testid="dashboard-row">
                      <AgentIcon agentId={p.agentId} size={14} tile />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-fg">{p.title}</div>
                        <div className="truncate text-2xs text-fg-faint">{subtitle(p)}</div>
                      </div>
                      <span className={cn('tabular flex shrink-0 items-center gap-1.5 text-2xs font-medium', activityText(a))}>
                        <ActivityDot activity={a} />
                        {statusText(p, a)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

export function Sidebar() {
  const tab = useApp((s) => s.snapshot!.ui.sidebarTab)
  const home = useApp((s) => s.snapshot!.settings.browserHomeUrl)
  const workspaceId = useApp((s) => s.snapshot!.ui.activeWorkspaceId)
  const ptyMap = useApp((s) => s.ptys)
  const now = useActivityClock()
  const rows = Object.values(ptyMap)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((info) => ({ info, activity: tracker.activity(info, now) }))
  const needs = rows.filter((r) => r.activity === 'needs').length
  const tabs = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard, badge: needs },
    { id: 'browser' as const, label: 'Browser', icon: Globe, badge: 0 }
  ]
  return (
    <aside aria-label="Sidebar" className="flex h-full flex-col">
      <div role="tablist" className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setSidebarTab(t.id)}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
              tab === t.id ? 'bg-hover text-fg' : 'text-fg-faint hover:text-fg'
            )}
          >
            <t.icon size={13} /> {t.label}
            {t.badge > 0 && <span className="tabular rounded bg-warn/15 px-1 text-2xs text-warn">{t.badge}</span>}
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
            <Dashboard rows={rows} />
          </div>
        )}
      </div>
    </aside>
  )
}
