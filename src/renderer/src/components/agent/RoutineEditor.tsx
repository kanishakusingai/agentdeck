import { useState } from 'react'
import { DAY_NAMES } from '@shared/schedule'
import type { Routine, Schedule } from '@shared/types'
import { cn } from '../../lib/cn'
import { errorText, toast, useApp } from '../../lib/store'
import { Button, Dialog, Field, Input, Select, Textarea, Toggle } from '../ui'

type Repeat = 'interval' | 'daily' | 'weekdays' | 'custom'

function repeatOf(s: Schedule): Repeat {
  if (s.kind === 'interval') return 'interval'
  if (s.days.length === 0 || s.days.length === 7) return 'daily'
  if ([...s.days].sort().join() === '1,2,3,4,5') return 'weekdays'
  return 'custom'
}

export function RoutineEditor({ routine, onClose }: { routine: Partial<Routine>; onClose: (savedId?: string) => void }) {
  const snap = useApp((s) => s.snapshot!)
  const allAgents = useApp((s) => s.agents)
  const agents = allAgents.filter((a) => a.headless)
  const [draft, setDraft] = useState<Routine>(() => ({
    id: routine.id ?? crypto.randomUUID(),
    name: routine.name ?? '',
    prompt: routine.prompt ?? '',
    workspaceId: routine.workspaceId ?? snap.ui.activeWorkspaceId ?? snap.workspaces[0]?.id ?? '',
    agentId: routine.agentId ?? agents.find((a) => a.installed)?.id ?? 'claude',
    accountId: routine.accountId,
    schedule: routine.schedule ?? { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] },
    allowEdits: routine.allowEdits ?? false,
    enabled: routine.enabled ?? true,
    createdAt: routine.createdAt ?? Date.now(),
    lastRunAt: routine.lastRunAt,
    nextRunAt: routine.nextRunAt
  }))
  const [repeat, setRepeat] = useState<Repeat>(repeatOf(draft.schedule))
  const set = (patch: Partial<Routine>): void => setDraft((d) => ({ ...d, ...patch }))
  const agent = agents.find((a) => a.id === draft.agentId)
  const accounts = snap.accounts.filter((a) => a.provider === agent?.provider)

  const changeRepeat = (r: Repeat): void => {
    setRepeat(r)
    const time = draft.schedule.kind === 'daily' ? draft.schedule.time : '09:00'
    if (r === 'interval') set({ schedule: { kind: 'interval', minutes: 60 } })
    else if (r === 'daily') set({ schedule: { kind: 'daily', time, days: [] } })
    else if (r === 'weekdays') set({ schedule: { kind: 'daily', time, days: [1, 2, 3, 4, 5] } })
    else set({ schedule: { kind: 'daily', time, days: [1] } })
  }

  const valid = draft.name.trim() && draft.prompt.trim() && draft.workspaceId && agent?.installed

  const save = async (): Promise<void> => {
    try {
      await window.api.routines.save({ ...draft, name: draft.name.trim(), prompt: draft.prompt.trim() })
      toast('Routine saved.', 'success')
      onClose(draft.id)
    } catch (err) {
      toast(errorText(err), 'error')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={routine.id ? 'Edit routine' : 'New routine'} description="An agent runs this prompt in the background on a schedule. Results show up here." className="w-[580px]">
      <form
        className="flex min-h-0 flex-col"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) void save()
        }}
      >
        <div className="flex flex-col gap-4 overflow-y-auto p-5">
          <Field label="Name">
            <Input autoFocus value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Morning summary" />
          </Field>
          <Field label="What should the agent do?">
            <Textarea rows={5} value={draft.prompt} onChange={(e) => set({ prompt: e.target.value })} placeholder="Summarise yesterday's commits and list anything that looks risky." />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Workspace">
              <Select value={draft.workspaceId} onChange={(e) => set({ workspaceId: e.target.value })}>
                {snap.workspaces.length === 0 && <option value="">Add a workspace first</option>}
                {snap.workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Agent">
              <Select value={draft.agentId} onChange={(e) => set({ agentId: e.target.value, accountId: undefined })}>
                {agents.map((a) => (
                  <option key={a.id} value={a.id} disabled={!a.installed}>
                    {a.label}
                    {a.installed ? '' : ' (not installed)'}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {agent?.provider && (
            <Field label="Account">
              <Select value={draft.accountId ?? ''} onChange={(e) => set({ accountId: e.target.value || undefined })}>
                <option value="">Workspace / default account</option>
                <option value="system">System login</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Repeat">
              <Select value={repeat} onChange={(e) => changeRepeat(e.target.value as Repeat)}>
                <option value="weekdays">Weekdays</option>
                <option value="daily">Every day</option>
                <option value="custom">Specific days</option>
                <option value="interval">Every few minutes</option>
              </Select>
            </Field>
            {draft.schedule.kind === 'interval' ? (
              <Field label="Every (minutes)">
                <Input
                  type="number"
                  min={5}
                  value={draft.schedule.minutes}
                  onChange={(e) => set({ schedule: { kind: 'interval', minutes: Math.max(5, Number(e.target.value) || 5) } })}
                />
              </Field>
            ) : (
              <Field label="At">
                <Input
                  type="time"
                  value={draft.schedule.time}
                  onChange={(e) => draft.schedule.kind === 'daily' && set({ schedule: { ...draft.schedule, time: e.target.value || '09:00' } })}
                />
              </Field>
            )}
          </div>
          {repeat === 'custom' && draft.schedule.kind === 'daily' && (
            <div className="flex gap-1" role="group" aria-label="Days">
              {DAY_NAMES.map((d, i) => {
                const on = draft.schedule.kind === 'daily' && draft.schedule.days.includes(i)
                return (
                  <button
                    type="button"
                    key={d}
                    aria-pressed={on}
                    onClick={() => {
                      if (draft.schedule.kind !== 'daily') return
                      const days = on ? draft.schedule.days.filter((x) => x !== i) : [...draft.schedule.days, i]
                      set({ schedule: { ...draft.schedule, days: days.length ? days : [i] } })
                    }}
                    className={cn('h-8 flex-1 rounded-md border text-xs font-medium', on ? 'border-accent bg-accent-soft text-fg' : 'border-line-strong text-fg-muted hover:text-fg')}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex items-start justify-between gap-4 rounded-md border border-line p-3">
            <div>
              <div className="text-sm font-medium text-fg">Allow file changes</div>
              <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">Off: the agent can only read and report. On: it may edit files in the workspace without asking.</div>
            </div>
            <Toggle label="Allow file changes" checked={draft.allowEdits} onChange={(allowEdits) => set({ allowEdits })} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          {!agent?.installed && <span className="mr-auto text-xs text-warn">Install {agent?.label ?? 'an agent'} to use routines.</span>}
          <Button onClick={() => onClose()}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!valid}>
            Save routine
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
