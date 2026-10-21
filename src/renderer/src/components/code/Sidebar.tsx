import { Globe, LayoutDashboard, Maximize2, Minimize2, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react'
import { agentById } from '@shared/agents'
import type { PtyInfo } from '@shared/types'
import { accountName } from '../../lib/accounts'
import { tracker, useActivityClock, type Activity } from '../../lib/activity'
import { focusPty } from '../../lib/canvas'
import { cn } from '../../lib/cn'
import { browserLabel, DEFAULT_BROWSERS, MAIN_BROWSER, maxSidebarWidth, SIDEBAR_WIDTH } from '../../lib/sidebar'
import { closeSidebarBrowser, newSidebarBrowser, rememberSidebarBrowserUrl, setBrowserTitle, setSidebarTab, setSidebarWidth, showSidebarBrowser, shownSidebarBrowser, useApp } from '../../lib/store'
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
  cn('flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition-colors', on ? 'bg-hover text-fg' : 'text-fg-muted hover:text-fg')

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

/** One browser in the sidebar, kept mounted so its page doesn't reload when another tab is shown. */
function SidebarBrowserView({ id, url, shown }: { id: string; url: string; shown: boolean }) {
  const onUrlChange = useCallback((next: string) => rememberSidebarBrowserUrl(id, next), [id])
  const onTitleChange = useCallback((title: string) => setBrowserTitle(id, title), [id])
  return (
    <div className={cn('absolute inset-0', !shown && 'invisible')}>
      <BrowserView initialUrl={url} onUrlChange={onUrlChange} onTitleChange={onTitleChange} />
    </div>
  )
}

/** The sidebar's ⤢: as wide as the window allows, and back. */
function ExpandButton() {
  const width = useApp((s) => s.snapshot!.ui.sidebarWidth ?? SIDEBAR_WIDTH.default)
  const railOpen = useApp((s) => s.snapshot!.ui.railOpen !== false)
  const before = useRef<number>(SIDEBAR_WIDTH.default)
  const max = maxSidebarWidth(window.innerWidth, railOpen)
  const wide = width >= max - 1
  const toggle = (): void => {
    if (wide) return setSidebarWidth(before.current < max - 1 ? before.current : SIDEBAR_WIDTH.default)
    before.current = width
    setSidebarWidth(max)
  }
  const label = wide ? 'Make the sidebar narrower' : 'Make the sidebar as wide as possible'
  return (
    <Tip label={label}>
      <button aria-label={label} onClick={toggle} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-faint transition-colors hover:bg-hover hover:text-fg" data-testid="sidebar-expand">
        {wide ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
    </Tip>
  )
}

export function Sidebar() {
  const tab = useApp((s) => s.snapshot!.ui.sidebarTab)
  const home = useApp((s) => s.snapshot!.settings.browserHomeUrl)
  const browsers = useApp((s) => s.snapshot!.ui.sidebarBrowsers) ?? DEFAULT_BROWSERS
  const shown = useApp((s) => shownSidebarBrowser(s.snapshot!.ui))
  const titles = useApp((s) => s.browserTitles)
  const ptyMap = useApp((s) => s.ptys)
  const panels = useApp((s) => s.panels)
  const now = useActivityClock()
  // A pane's name is the one in its header (agents have a person's name, and panes can be renamed).
  const paneTitles = new Map(Object.values(panels).flatMap((list) => list.flatMap((p) => (p.ptyId ? [[p.ptyId, p.title] as const] : []))))
  const rows = Object.values(ptyMap)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((info) => ({ info: { ...info, title: paneTitles.get(info.id) || info.title }, activity: tracker.activity(info, now) }))
  const running = rows.filter((r) => r.info.status !== 'exited').length
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
        <div ref={tabList} role="tablist" aria-label="Sidebar" onKeyDown={onTabListKey} className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          <button role="tab" aria-selected={tab === 'dashboard'} tabIndex={tab === 'dashboard' ? 0 : -1} onClick={() => setSidebarTab('dashboard')} className={tabClass(tab === 'dashboard')}>
            <LayoutDashboard size={14} /> Dashboard
            {running > 0 && (
              <span className="tabular rounded-[5px] bg-accent/20 px-1.5 text-2xs font-semibold text-accent-strong" data-testid="dashboard-count">
                {running}
              </span>
            )}
          </button>
          {browsers.map((b) => {
            const on = tab === 'browser' && shown === b.id
            const name = browserLabel(b)
            const title = titles[b.id]
            const closable = b.id !== MAIN_BROWSER
            return (
              <div key={b.id} role="presentation" className={cn(tabClass(on), 'group', closable && 'pr-1')}>
                <button
                  role="tab"
                  aria-selected={on}
                  aria-label={name}
                  tabIndex={on ? 0 : -1}
                  aria-keyshortcuts={closable ? 'Delete' : undefined}
                  onClick={() => showSidebarBrowser(b.id)}
                  onKeyDown={(e) => {
                    if (closable && e.key === 'Delete') closeSidebarBrowser(b.id)
                  }}
                  title={title ? `${title} (${name})` : name}
                  className="flex min-w-0 items-center gap-1.5"
                  data-testid="sidebar-browser-tab"
                  data-name={name}
                >
                  {on ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-fg" aria-hidden /> : <Globe size={13} className="shrink-0" />}
                  <span className="max-w-[150px] truncate">{title || name}</span>
                </button>
                {closable && (
                  // Mouse shortcut only — keyboard and screen-reader users close a tab with Delete.
                  <button
                    aria-hidden
                    tabIndex={-1}
                    title={`Close ${name}`}
                    onClick={() => closeSidebarBrowser(b.id)}
                    className={cn('rounded p-0.5 text-fg-faint hover:bg-raised hover:text-fg group-hover:opacity-100', on ? 'opacity-100' : 'opacity-0')}
                    data-testid="sidebar-browser-close"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <Tip label="New browser tab">
          <button aria-label="New browser tab" onClick={newSidebarBrowser} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-faint transition-colors hover:bg-hover hover:text-fg" data-testid="sidebar-add">
            <Plus size={15} />
          </button>
        </Tip>
        <ExpandButton />
      </div>
      <div className="relative min-h-0 flex-1">
        {browsers.map((b) => (
          <SidebarBrowserView key={b.id} id={b.id} url={b.url ?? home} shown={tab === 'browser' && shown === b.id} />
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
