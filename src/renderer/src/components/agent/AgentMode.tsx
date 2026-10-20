import { Bot, CalendarClock, CheckCircle2, CircleDashed, Loader2, Pencil, Play, Plus, Trash2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { agentById } from '@shared/agents'
import { describeSchedule } from '@shared/schedule'
import type { Routine, RoutineRun, RunStatus } from '@shared/types'
import { cn, formatTime, timeAgo } from '../../lib/cn'
import { useApp } from '../../lib/store'
import { Markdown } from '../Markdown'
import { Button, EmptyState, IconButton, SectionLabel, Toggle } from '../ui'
import { RoutineEditor } from './RoutineEditor'

const TEMPLATES: Partial<Routine>[] = [
  { name: 'Morning summary', prompt: "Summarise the commits from the last 24 hours in plain English and point out anything that looks risky or unfinished.", schedule: { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] } },
  { name: 'Check for problems', prompt: 'Run the project\'s tests and type checks. Report what fails and the most likely cause. Do not change any files.', schedule: { kind: 'daily', time: '18:00', days: [] } },
  { name: 'Dependency review', prompt: 'List outdated or vulnerable dependencies in this project and recommend which ones are safe to update.', schedule: { kind: 'daily', time: '10:00', days: [1] } }
]

function RunIcon({ status }: { status: RunStatus }) {
  if (status === 'running') return <Loader2 size={14} className="shrink-0 animate-spin text-accent" />
  if (status === 'success') return <CheckCircle2 size={14} className="shrink-0 text-ok" />
  return <XCircle size={14} className="shrink-0 text-err" />
}

const openEditor = (r: Partial<Routine>): void => useApp.setState({ routineDraft: r })

export function RoutineRail() {
  const routines = useApp((s) => s.snapshot!.routines)
  const runs = useApp((s) => s.runs)
  const selected = useApp((s) => s.selectedRoutineId)
  return (
    <nav aria-label="Routines" className="flex h-full flex-col">
      <SectionLabel
        action={
          <IconButton label="New routine" onClick={() => openEditor({})} className="h-6 w-6" data-testid="new-routine">
            <Plus size={14} />
          </IconButton>
        }
      >
        Routines
      </SectionLabel>
      <ul className="flex flex-1 flex-col gap-px overflow-y-auto px-1.5 pb-3">
        {routines.length === 0 && <li className="px-2 py-3 text-xs leading-relaxed text-fg-faint">Routines are prompts an agent runs on a schedule — even while you're away from the keyboard.</li>}
        {routines.map((r) => {
          const last = runs.find((x) => x.routineId === r.id)
          return (
            <li key={r.id}>
              <button
                onClick={() => useApp.setState({ selectedRoutineId: r.id, selectedRunId: null })}
                className={cn('flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors', selected === r.id ? 'bg-raised' : 'hover:bg-hover/60')}
              >
                {last ? <RunIcon status={last.status} /> : <CircleDashed size={14} className="mt-px shrink-0 text-fg-faint" />}
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-sm', r.enabled ? 'text-fg' : 'text-fg-faint')}>{r.name}</span>
                  <span className="block truncate text-2xs text-fg-faint">{r.enabled ? describeSchedule(r.schedule) : 'Paused'}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function RunDetail({ runId }: { runId: string }) {
  const [run, setRun] = useState<RoutineRun | null>(null)
  const summary = useApp((s) => s.runs.find((r) => r.id === runId))
  useEffect(() => {
    void window.api.routines.getRun(runId).then(setRun)
  }, [runId, summary?.status])
  if (!run) return null
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <RunIcon status={run.status} />
        <span>{run.status === 'running' ? 'Running…' : run.status === 'success' ? 'Finished' : `Failed${run.exitCode !== undefined ? ` (exit ${run.exitCode})` : ''}`}</span>
        <span className="text-fg-faint">·</span>
        <span>{formatTime(run.startedAt)}</span>
        {run.endedAt && <span className="text-fg-faint">· took {Math.max(1, Math.round((run.endedAt - run.startedAt) / 1000))}s</span>}
      </div>
      <div className="rounded-lg border border-line bg-surface p-4">
        {run.output.trim() ? <Markdown text={run.output} /> : <span className="text-sm text-fg-faint">{run.status === 'running' ? 'Waiting for the agent…' : 'No output.'}</span>}
      </div>
    </div>
  )
}

export function AgentMain() {
  const snap = useApp((s) => s.snapshot!)
  const runs = useApp((s) => s.runs)
  const selectedId = useApp((s) => s.selectedRoutineId)
  const selectedRunId = useApp((s) => s.selectedRunId)
  const editing = useApp((s) => s.routineDraft)
  const setEditing = (r: Partial<Routine> | null): void => useApp.setState({ routineDraft: r })
  const routine = snap.routines.find((r) => r.id === selectedId)
  const routineRuns = runs.filter((r) => r.routineId === routine?.id)
  const runId = selectedRunId ?? routineRuns[0]?.id

  const editor = editing && (
    <RoutineEditor
      routine={editing}
      onClose={(savedId) => {
        setEditing(null)
        if (savedId) useApp.setState({ selectedRoutineId: savedId })
      }}
    />
  )

  if (!routine) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-8 overflow-y-auto p-8">
        <EmptyState
          icon={<Bot size={28} />}
          title="Agents that work while you don't"
          body={
            snap.workspaces.length === 0
              ? 'Add a workspace in Code mode first, then give an agent a job and a schedule.'
              : 'Give an agent a job and a schedule. It runs in the background in your workspace and leaves you a report to read.'
          }
        >
          <Button variant="primary" onClick={() => setEditing({})} disabled={snap.workspaces.length === 0}>
            <Plus size={14} /> New routine
          </Button>
        </EmptyState>
        {snap.workspaces.length > 0 && (
          <div className="w-full max-w-3xl">
            <div className="mb-2 text-center text-2xs font-semibold uppercase tracking-[0.06em] text-fg-faint">Or start from an example</div>
            <div className="grid grid-cols-3 gap-3">
              {TEMPLATES.map((t) => (
                <button key={t.name} onClick={() => setEditing(t)} className="rounded-lg border border-line p-4 text-left transition-colors hover:border-line-strong hover:bg-surface">
                  <div className="text-sm font-medium text-fg">{t.name}</div>
                  <div className="mt-1 text-xs text-fg-faint">{describeSchedule(t.schedule!)}</div>
                  <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-fg-muted">{t.prompt}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        {editor}
      </div>
    )
  }

  const ws = snap.workspaces.find((w) => w.id === routine.workspaceId)
  const running = routineRuns[0]?.status === 'running'

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-start gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-fg">{routine.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
              <CalendarClock size={12} />
              <span>{describeSchedule(routine.schedule)}</span>
              <span className="text-fg-faint">·</span>
              <span>{agentById(routine.agentId)?.label}</span>
              <span className="text-fg-faint">·</span>
              <span>{ws?.name ?? 'Workspace removed'}</span>
              {routine.allowEdits && <span className="rounded bg-warn/12 px-1.5 text-2xs text-warn">Can edit files</span>}
              {routine.enabled && routine.nextRunAt && (
                <>
                  <span className="text-fg-faint">·</span>
                  <span>Next {formatTime(routine.nextRunAt)}</span>
                </>
              )}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            {routine.enabled ? 'On' : 'Paused'}
            <Toggle label="Routine enabled" checked={routine.enabled} onChange={(enabled) => void window.api.routines.save({ ...routine, enabled })} />
          </label>
          <Button size="sm" variant="primary" disabled={running} onClick={() => void window.api.routines.runNow(routine.id)}>
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run now
          </Button>
          <IconButton label="Edit" onClick={() => setEditing(routine)}>
            <Pencil size={14} />
          </IconButton>
          <IconButton
            label="Delete"
            onClick={() => {
              if (confirm(`Delete the routine "${routine.name}" and its run history?`)) {
                void window.api.routines.remove(routine.id)
                useApp.setState({ selectedRoutineId: null })
              }
            }}
          >
            <Trash2 size={14} />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-4 rounded-lg border border-line px-4 py-3">
            <div className="mb-1 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-faint">Prompt</div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-fg-muted [user-select:text]">{routine.prompt}</div>
          </div>
          {runId ? <RunDetail runId={runId} /> : <div className="py-10 text-center text-sm text-fg-faint">No runs yet. Press Run now to try it.</div>}
        </div>
      </div>
      <aside aria-label="Run history" className="flex w-64 shrink-0 flex-col border-l border-line bg-panel">
        <SectionLabel>History</SectionLabel>
        <ul className="flex-1 overflow-y-auto px-1.5 pb-3">
          {routineRuns.length === 0 && <li className="px-2 py-2 text-xs text-fg-faint">Nothing yet.</li>}
          {routineRuns.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => useApp.setState({ selectedRunId: r.id })}
                className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left', r.id === runId ? 'bg-raised' : 'hover:bg-hover/60')}
              >
                <RunIcon status={r.status} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-fg">{timeAgo(r.startedAt)}</span>
                  <span className="block truncate text-2xs text-fg-faint">{r.trigger === 'manual' ? 'Run manually' : 'Scheduled'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {editor}
    </div>
  )
}
