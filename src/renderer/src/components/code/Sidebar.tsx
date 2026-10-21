import { AppWindow, Globe, LayoutDashboard, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { create } from 'zustand'
import { agentById } from '@shared/agents'
import { SIDEBAR_WIDTH, type PtyInfo } from '@shared/types'
import { accountName } from '../../lib/accounts'
import { tracker, useActivityClock, type Activity } from '../../lib/activity'
import { focusPty, openBrowserPane } from '../../lib/canvas'
import { cn } from '../../lib/cn'
import { setSidebarTab, setSidebarWidth, useApp } from '../../lib/store'
import { ActivityDot, activityLabel, activityText, AgentIcon, Menu, MenuContent, MenuItem, MenuTrigger } from '../ui'
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

/** The sidebar's browser tabs ('main' is always there; more can be added with +). Lives outside the
 *  component so the list survives hiding the sidebar. */
const useBrowsers = create<{ tabs: string[]; current: string }>(() => ({ tabs: ['main'], current: 'main' }))
let nextBrowser = 2

function newBrowserTab(): void {
  const id = `b${nextBrowser++}`
  useBrowsers.setState((s) => ({ tabs: [...s.tabs, id], current: id }))
  setSidebarTab('browser')
}

function closeBrowserTab(id: string): void {
  useBrowsers.setState((s) => ({ tabs: s.tabs.filter((t) => t !== id), current: s.current === id ? 'main' : s.current }))
}

const tabClass = (on: boolean): string =>
  cn('flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors', on ? 'bg-hover text-fg' : 'text-fg-faint hover:text-fg')

export function Sidebar() {
  const tab = useApp((s) => s.snapshot!.ui.sidebarTab)
  const home = useApp((s) => s.snapshot!.settings.browserHomeUrl)
  const workspaceId = useApp((s) => s.snapshot!.ui.activeWorkspaceId)
  const ptyMap = useApp((s) => s.ptys)
  const { tabs: browsers, current } = useBrowsers()
  const now = useActivityClock()
  const rows = Object.values(ptyMap)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((info) => ({ info, activity: tracker.activity(info, now) }))
  const needs = rows.filter((r) => r.activity === 'needs').length
  const showBrowser = (id: string): void => {
    useBrowsers.setState({ current: id })
    setSidebarTab('browser')
  }
  return (
    <aside aria-label="Sidebar" className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line pl-2 pr-1.5">
        <div role="tablist" className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <button role="tab" aria-selected={tab === 'dashboard'} onClick={() => setSidebarTab('dashboard')} className={tabClass(tab === 'dashboard')}>
            <LayoutDashboard size={13} /> Dashboard
            {needs > 0 && <span className="tabular rounded bg-warn/15 px-1 text-2xs text-warn">{needs}</span>}
          </button>
          {browsers.map((id, i) => {
            const on = tab === 'browser' && current === id
            const label = i === 0 ? 'Browser' : `Browser ${i + 1}`
            return (
              <div key={id} className={cn(tabClass(on), 'group pr-1')}>
                <button role="tab" aria-selected={on} onClick={() => showBrowser(id)} className="flex items-center gap-1.5" data-testid="sidebar-browser-tab">
                  <Globe size={13} /> {label}
                </button>
                {i > 0 && (
                  <button aria-label={`Close ${label}`} onClick={() => closeBrowserTab(id)} className="rounded p-0.5 text-fg-faint opacity-0 hover:bg-raised hover:text-fg focus:opacity-100 group-hover:opacity-100">
                    <X size={11} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <Menu>
          <MenuTrigger asChild>
            <button aria-label="Add a browser" title="Add a browser" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-faint transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg" data-testid="sidebar-add">
              <Plus size={14} />
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={newBrowserTab} data-testid="sidebar-new-browser">
              <Globe size={13} className="text-fg-muted" /> New browser tab
            </MenuItem>
            <MenuItem disabled={!workspaceId} onSelect={() => workspaceId && void openBrowserPane(workspaceId, home)}>
              <AppWindow size={13} className="text-fg-muted" /> Browser on screen, as a pane
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <div className="relative min-h-0 flex-1">
        {/* Keep every browser mounted so pages don't reload when switching tabs. */}
        {browsers.map((id) => (
          <div key={id} className={cn('absolute inset-0', (tab !== 'browser' || current !== id) && 'invisible')}>
            <BrowserView initialUrl={home} onPopOut={workspaceId ? (url) => void openBrowserPane(workspaceId, url) : undefined} />
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

/** Keep at least this much room for the panes in the middle. */
const MIN_CANVAS = 480

function maxWidth(): number {
  return Math.max(SIDEBAR_WIDTH.min, window.innerWidth - MIN_CANVAS)
}

function useWindowWidth(): number {
  const [w, setW] = useState(window.innerWidth)
  useEffect(() => {
    const on = (): void => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return w
}

/** The right sidebar with a drag handle on its left edge (double-click it to reset the size). */
export function ResizableSidebar() {
  const saved = useApp((s) => s.snapshot!.ui.sidebarWidth ?? SIDEBAR_WIDTH.default)
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const drag = useRef<{ x: number; w: number } | null>(null)
  useWindowWidth() // re-clamp when the window changes size
  const clamp = (w: number): number => Math.min(maxWidth(), Math.max(SIDEBAR_WIDTH.min, w))
  const width = clamp(dragWidth ?? saved)

  const onDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, w: width }
    setDragWidth(width)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return
    // Dragging left makes the sidebar wider.
    setDragWidth(clamp(drag.current.w + (drag.current.x - e.clientX)))
  }
  const onUp = (): void => {
    if (!drag.current) return
    drag.current = null
    if (dragWidth !== null) setSidebarWidth(dragWidth)
    setDragWidth(null)
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const step = e.shiftKey ? 80 : 20
    if (e.key === 'ArrowLeft') setSidebarWidth(clamp(width + step))
    else if (e.key === 'ArrowRight') setSidebarWidth(clamp(width - step))
    else return
    e.preventDefault()
  }

  return (
    <div className="relative shrink-0" style={{ width }} data-testid="sidebar">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={SIDEBAR_WIDTH.min}
        aria-valuemax={maxWidth()}
        aria-valuenow={width}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => setSidebarWidth(SIDEBAR_WIDTH.default)}
        onKeyDown={onKey}
        className="group absolute -left-2 top-0 bottom-0 z-10 flex w-2 cursor-col-resize justify-center outline-none"
        data-testid="sidebar-resizer"
      >
        <span className={cn('my-3 w-0.5 rounded-full bg-transparent transition-colors group-hover:bg-accent/70 group-focus-visible:bg-accent', dragWidth !== null && 'bg-accent')} />
      </div>
      <div className="card h-full overflow-hidden">
        <Sidebar />
      </div>
      {/* While dragging, a cover stops the browser and terminals from grabbing the mouse. */}
      {dragWidth !== null && <div className="fixed inset-0 z-[70] cursor-col-resize" />}
    </div>
  )
}