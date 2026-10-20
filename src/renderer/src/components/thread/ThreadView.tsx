import { ChevronRight, Loader2, Wrench } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Thread, ThreadMessage } from '@shared/types'
import { cn, formatTime } from '../../lib/cn'
import { useApp } from '../../lib/store'
import { Markdown } from '../Markdown'
import { EmptyState } from '../ui'

type Item = { kind: 'message'; message: ThreadMessage } | { kind: 'tools'; steps: ThreadMessage[] }

function group(messages: ThreadMessage[]): Item[] {
  const items: Item[] = []
  for (const m of messages) {
    if (m.role === 'tool') {
      const last = items.at(-1)
      if (last?.kind === 'tools') last.steps.push(m)
      else items.push({ kind: 'tools', steps: [m] })
    } else {
      items.push({ kind: 'message', message: m })
    }
  }
  return items
}

/** First useful bit of a tool call's input, e.g. the file path or command. */
function toolSummary(text: string): string {
  try {
    const v = JSON.parse(text) as Record<string, unknown>
    const pick = v.file_path ?? v.path ?? v.command ?? v.pattern ?? v.url ?? v.description ?? Object.values(v)[0]
    return Array.isArray(pick) ? pick.join(' ') : String(pick ?? '')
  } catch {
    return text.split('\n')[0]
  }
}

function ToolSteps({ steps }: { steps: ThreadMessage[] }) {
  const [open, setOpen] = useState(false)
  const calls = steps.filter((s) => s.toolName !== 'result')
  const names = [...new Set(calls.map((c) => c.toolName))].slice(0, 4).join(', ')
  return (
    <div className="rounded-md border border-line">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-fg-muted hover:text-fg">
        <ChevronRight size={13} className={cn('transition-transform', open && 'rotate-90')} />
        <Wrench size={12} />
        <span>
          {calls.length} tool {calls.length === 1 ? 'step' : 'steps'}
          {names && <span className="text-fg-faint"> · {names}</span>}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-1 border-t border-line px-3 py-2">
          {steps.map((s, i) =>
            s.toolName === 'result' ? (
              <pre key={i} className="ml-5 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-surface p-2 font-mono text-2xs text-fg-muted [user-select:text]">
                {s.text}
              </pre>
            ) : (
              <div key={i} className="flex min-w-0 items-baseline gap-2 text-xs">
                <span className="shrink-0 font-medium text-fg">{s.toolName}</span>
                <span className="truncate font-mono text-2xs text-fg-faint">{toolSummary(s.text)}</span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

export function ThreadView({ threadId }: { threadId: string }) {
  const [thread, setThread] = useState<Thread | null | undefined>(undefined)
  const accounts = useApp((s) => s.snapshot!.accounts)

  useEffect(() => {
    let live = true
    setThread(undefined)
    void window.api.threads.get(threadId).then((t) => live && setThread(t))
    return () => {
      live = false
    }
  }, [threadId])

  const items = useMemo(() => group(thread?.messages ?? []), [thread])

  if (thread === undefined)
    return (
      <div className="flex h-full items-center justify-center text-fg-muted">
        <Loader2 size={16} className="animate-spin" />
      </div>
    )
  if (thread === null) return <EmptyState title="This thread is no longer on disk" body="The agent may have cleaned up its session files." />

  const account = thread.accountId === 'system' ? 'System login' : (accounts.find((a) => a.id === thread.accountId)?.name ?? 'Account')

  return (
    <div className="h-full overflow-y-auto">
      <article className="mx-auto flex max-w-[760px] flex-col gap-5 px-8 py-8">
        <header className="flex flex-col gap-1.5 border-b border-line pb-5">
          <h1 className="text-lg font-semibold leading-snug text-fg [user-select:text]">{thread.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
            <span>{thread.agent === 'claude' ? 'Claude Code' : 'Codex'}</span>
            <span className="text-fg-faint">·</span>
            <span>{account}</span>
            <span className="text-fg-faint">·</span>
            <span className="truncate">{thread.cwd}</span>
            <span className="text-fg-faint">·</span>
            <span>{formatTime(thread.updatedAt)}</span>
          </div>
        </header>
        {items.map((item, i) =>
          item.kind === 'tools' ? (
            <ToolSteps key={i} steps={item.steps} />
          ) : item.message.role === 'user' ? (
            <section key={i} className="rounded-lg border border-line bg-surface px-4 py-3">
              <div className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-accent">You</div>
              <Markdown text={item.message.text} />
            </section>
          ) : (
            <section key={i} className="px-1">
              <div className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-faint">Agent</div>
              <Markdown text={item.message.text} />
            </section>
          )
        )}
      </article>
    </div>
  )
}
