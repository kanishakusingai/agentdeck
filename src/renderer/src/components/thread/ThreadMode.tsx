import { Loader2, MessagesSquare, PanelTopOpen, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PROVIDERS } from '@shared/agents'
import type { ThreadSummary, Workspace } from '@shared/types'
import { openThreadPane } from '../../lib/canvas'
import { cn, timeAgo } from '../../lib/cn'
import { useApp } from '../../lib/store'
import { Button, EmptyState, IconButton, SectionLabel } from '../ui'
import { ThreadView } from './ThreadView'

const folderName = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p

const norm = (p: string): string => p.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase()

/** The workspace a session belongs to: same folder or any subfolder (deepest match wins). */
function workspaceFor(workspaces: Workspace[], cwd: string): Workspace | undefined {
  const c = norm(cwd)
  return workspaces
    .filter((w) => c === norm(w.path) || c.startsWith(`${norm(w.path)}\\`))
    .sort((a, b) => b.path.length - a.path.length)[0]
}

let cache: ThreadSummary[] | null = null

export function useThreads() {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(cache)
  const [loading, setLoading] = useState(false)
  const reload = useCallback(() => {
    setLoading(true)
    void window.api.threads
      .list()
      .then((t) => {
        cache = t
        setThreads(t)
      })
      .finally(() => setLoading(false))
  }, [])
  useEffect(reload, [reload])
  return { threads, loading, reload }
}

export function ThreadRail() {
  const { threads, loading, reload } = useThreads()
  const query = useApp((s) => s.threadQuery)
  const selected = useApp((s) => s.selectedThreadId)
  const workspaces = useApp((s) => s.snapshot!.workspaces)
  const [textMatches, setTextMatches] = useState<Set<string>>(new Set())

  // Search inside conversations too (debounced; runs in the main process).
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return setTextMatches(new Set())
    const t = setTimeout(() => void window.api.threads.search(q).then((ids) => setTextMatches(new Set(ids))), 250)
    return () => clearTimeout(t)
  }, [query, threads])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (threads ?? []).filter((t) => !q || t.title.toLowerCase().includes(q) || t.cwd.toLowerCase().includes(q) || textMatches.has(t.id))
    const map = new Map<string, { label: string; items: ThreadSummary[] }>()
    for (const t of list) {
      const ws = workspaceFor(workspaces, t.cwd)
      const key = ws ? `ws:${ws.id}` : t.cwd.toLowerCase() || '(unknown folder)'
      const entry = map.get(key) ?? { label: ws?.name ?? (folderName(t.cwd) || 'Unknown folder'), items: [] }
      entry.items.push(t)
      map.set(key, entry)
    }
    return [...map.values()]
  }, [threads, query, workspaces, textMatches])

  return (
    <nav aria-label="Threads" className="flex h-full flex-col">
      <div className="p-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input
            value={query}
            onChange={(e) => useApp.setState({ threadQuery: e.target.value })}
            placeholder="Search threads"
            aria-label="Search threads"
            className="h-8 w-full rounded-md border border-line bg-surface pl-8 pr-2 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
          />
        </div>
      </div>
      <SectionLabel
        action={
          <IconButton label="Refresh" onClick={reload} className="h-6 w-6">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </IconButton>
        }
      >
        Recent sessions
      </SectionLabel>
      <div className="flex-1 overflow-y-auto px-1.5 pb-3">
        {threads && groups.length === 0 && (
          <div className="px-2 py-3 text-xs leading-relaxed text-fg-faint">{query ? 'No threads match.' : 'Sessions from Claude Code and Codex appear here once you use them.'}</div>
        )}
        {groups.map((g) => (
          <section key={g.label + g.items[0].id} className="mb-2">
            <div className="truncate px-2 pb-1 pt-2 text-2xs font-semibold text-fg-faint">{g.label}</div>
            <ul className="flex flex-col gap-px">
              {g.items.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => useApp.setState({ selectedThreadId: t.id })}
                    data-testid="thread-row"
                    className={cn('flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors', selected === t.id ? 'bg-raised' : 'hover:bg-hover/60')}
                  >
                    <span className={cn('line-clamp-2 text-sm leading-snug', selected === t.id ? 'text-fg' : 'text-fg-muted')}>{t.title}</span>
                    <span className="text-2xs text-fg-faint">
                      {PROVIDERS[t.agent].agentLabel} · {timeAgo(t.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  )
}

export function ThreadMain() {
  const selected = useApp((s) => s.selectedThreadId)
  const workspaces = useApp((s) => s.snapshot!.workspaces)
  const activeWs = useApp((s) => s.snapshot!.ui.activeWorkspaceId)
  if (!selected) {
    return (
      <EmptyState
        icon={<MessagesSquare size={28} />}
        title="Read what your agents did"
        body="Pick a session on the left. Each one is shown as a conversation: your requests, the agent's answers, and its tool steps folded away."
      />
    )
  }
  const summary = cache?.find((t) => t.id === selected)
  const ws = (summary && workspaceFor(workspaces, summary.cwd)) ?? workspaces.find((w) => w.id === activeWs)
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center justify-end border-b border-line px-3">
        {ws && (
          <Button size="sm" variant="ghost" onClick={() => void openThreadPane(ws.id, selected, summary?.title ?? 'Thread')}>
            <PanelTopOpen size={13} /> Open beside the code in {ws.name}
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <ThreadView threadId={selected} />
      </div>
    </div>
  )
}
