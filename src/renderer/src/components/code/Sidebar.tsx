import { Globe, LayoutDashboard, Plus, X } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { agentById } from '@shared/agents'
import type { PtyInfo } from '@shared/types'
import { accountName } from '../../lib/accounts'
import { tracker, useActivityClock, type Activity } from '../../lib/activity'
import { focusPty } from '../../lib/canvas'
import { cn } from '../../lib/cn'
import { browserLabel, DEFAULT_BROWSERS, MAIN_BROWSER } from '../../lib/sidebar'
import { closeSidebarBrowser, newSidebarBrowser, rememberSidebarBrowserUrl, setSidebarTab, showSidebarBrowser, shownSidebarBrowser, useApp } from '../../lib/store'
import { ActivityDot, activityLabel, activityText, AgentIcon, Tip } from '../ui'
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

const tabClass = (on: boolean): string =>
  cn('flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors', on ? 'bg-hover text-fg' : 'text-fg-faint hover:text-fg')

/** ←/→/Home/End move between the tabs (only the selected tab is in the Tab order). */
function onTabListKey(e: KeyboardEvent<HTMLDivElement>): void {
  const tabs = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')]
  const i = tabs.indexOf(document.activeElement as HTMLElement)
  if (i < 0) return
  const next = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key]
  if (next === undefined) return
  e.preventDefault()
  tabs[next].focus()
  tabs[next].click()
}

export function Sidebar() {
  const tab = useApp((s) => s.snapshot!.ui.sidebarTab)
  const home = useApp((s) => s.snapshot!.settings.browserHomeUrl)
  const browsers = useApp((s) => s.snapshot!.ui.sidebarBrowsers) ?? DEFAULT_BROWSERS
  const shown = useApp((s) => shownSidebarBrowser(s.snapshot!.ui))
  const ptyMap = useApp((s) => s.ptys)
  const now = useActivityClock()
  const rows = Object.values(ptyMap)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((info) => ({ info, activity: tracker.activity(info, now) }))
  const needs = rows.filter((r) => r.activity === 'needs').length
  const tabList = useRef<HTMLDivElement>(null)
  // When there are more tabs than fit, keep the one on screen scrolled into view.
  useEffect(() => {
    const selected = tabList.current?.querySelector('[aria-selected="true"]')
    // Scroll the whole tab (its name and its ×) into view.
    ;(selected?.closest('[role="presentation"]') ?? selected)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [tab, shown, browsers.length])
  return (
    <aside aria-label="Sidebar" className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line pl-2 pr-1.5">
        <div ref={tabList} role="tablist" aria-label="Sidebar" onKeyDown={onTabListKey} className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <button role="tab" aria-selected={tab === 'dashboard'} tabIndex={tab === 'dashboard' ? 0 : -1} onClick={() => setSidebarTab('dashboard')} className={tabClass(tab === 'dashboard')}>
            <LayoutDashboard size={13} /> Dashboard
            {needs > 0 && <span className="tabular rounded bg-warn/15 px-1 text-2xs text-warn">{needs}</span>}
          </button>
          {browsers.map((b) => {
            const on = tab === 'browser' && shown === b.id
            const label = browserLabel(b)
            const closable = b.id !== MAIN_BROWSER
            return (
              <div key={b.id} role="presentation" className={cn(tabClass(on), 'group', closable && 'pr-1')}>
                <button
                  role="tab"
                  aria-selected={on}
                  tabIndex={on ? 0 : -1}
                  aria-keyshortcuts={closable ? 'Delete' : undefined}
                  onClick={() => showSidebarBrowser(b.id)}
                  onKeyDown={(e) => {
                    if (closable && e.key === 'Delete') closeSidebarBrowser(b.id)
                  }}
                  className="flex items-center gap-1.5"
                  data-testid="sidebar-browser-tab"
                >
                  <Globe size={13} /> {label}
                </button>
                {closable && (
                  // Mouse shortcut only — keyboard and screen-reader users close a tab with Delete.
                  <button
                    aria-hidden
                    tabIndex={-1}
                    title={`Close ${label}`}
                    onClick={() => closeSidebarBrowser(b.id)}
                    className={cn('rounded p-0.5 text-fg-faint hover:bg-raised hover:text-fg group-hover:opacity-100', on ? 'opacity-100' : 'opacity-0')}
                    data-testid="sidebar-browser-close"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <Tip label="New browser tab">
          <button aria-label="New browser tab" onClick={newSidebarBrowser} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-faint transition-colors hover:bg-hover hover:text-fg" data-testid="sidebar-add">
            <Plus size={14} />
          </button>
        </Tip>
      </div>
      <div className="relative min-h-0 flex-1">
        {/* Keep every browser mounted so pages don't reload when switching tabs. */}
        {browsers.map((b) => (
          <div key={b.id} className={cn('absolute inset-0', (tab !== 'browser' || shown !== b.id) && 'invisible')}>
            <BrowserView
              initialUrl={b.url ?? home}
              onUrlChange={(url) => rememberSidebarBrowserUrl(b.id, url)}
            />
          </div>
        ))}
        {tab === 'dashboard' && (
          <div className="absolute inset-0 bg-panel">
            <Dashboard rows={rows} />
          </div>
        )}
      </div>
    </aside>
  )
}