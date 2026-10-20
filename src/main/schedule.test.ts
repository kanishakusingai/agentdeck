import { describe, expect, it } from 'vitest'
import type { Routine, RoutineRun } from '@shared/types'
import { describeSchedule, nextRun, Scheduler } from './schedule'

// Tuesday 20 Oct 2026, 13:00 local time
const now = new Date(2026, 9, 20, 13, 0, 0)

describe('nextRun', () => {
  it('adds the interval', () => {
    expect(nextRun({ kind: 'interval', minutes: 30 }, now)).toBe(new Date(2026, 9, 20, 13, 30).getTime())
  })

  it('runs later today when the daily time is still ahead', () => {
    expect(nextRun({ kind: 'daily', time: '18:15', days: [] }, now)).toBe(new Date(2026, 9, 20, 18, 15).getTime())
  })

  it('runs tomorrow when the daily time has passed', () => {
    expect(nextRun({ kind: 'daily', time: '09:00', days: [] }, now)).toBe(new Date(2026, 9, 21, 9, 0).getTime())
  })

  it('skips the weekend for a weekdays schedule', () => {
    const friday = new Date(2026, 9, 23, 10, 0)
    expect(nextRun({ kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] }, friday)).toBe(
      new Date(2026, 9, 26, 9, 0).getTime()
    )
  })
})

describe('describeSchedule', () => {
  it('reads like plain English', () => {
    expect(describeSchedule({ kind: 'interval', minutes: 90 })).toBe('Every 90 minutes')
    expect(describeSchedule({ kind: 'daily', time: '09:00', days: [] })).toBe('Every day at 09:00')
    expect(describeSchedule({ kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] })).toBe('Weekdays at 09:00')
    expect(describeSchedule({ kind: 'daily', time: '08:30', days: [1, 3] })).toBe('Mon, Wed at 08:30')
  })
})

describe('Scheduler', () => {
  const routine = (over: Partial<Routine> = {}): Routine => ({
    id: 'r1', name: 'Morning summary', prompt: 'Summarise commits', workspaceId: 'w1', agentId: 'claude',
    schedule: { kind: 'interval', minutes: 60 }, allowEdits: false, enabled: true, createdAt: 0,
    nextRunAt: now.getTime() - 1000, ...over
  })

  function harness(routines: Routine[]) {
    let state = routines
    const runs: RoutineRun[] = []
    const executed: string[] = []
    const scheduler = new Scheduler({
      getRoutines: () => state,
      saveRoutines: (next) => { state = next },
      saveRun: (run) => {
        const i = runs.findIndex((r) => r.id === run.id)
        if (i >= 0) runs[i] = run
        else runs.push(run)
      },
      execute: async (r) => {
        executed.push(r.id)
        return { exitCode: 0, output: `done: ${r.prompt}` }
      }
    })
    return { scheduler, runs, executed, routines: () => state }
  }

  it('runs a due routine once, records the run and schedules the next one', async () => {
    const h = harness([routine()])
    await h.scheduler.tick(now)
    await h.scheduler.tick(now)

    expect(h.executed).toEqual(['r1'])
    expect(h.runs).toHaveLength(1)
    expect(h.runs[0]).toMatchObject({ routineId: 'r1', status: 'success', output: 'done: Summarise commits', trigger: 'schedule' })
    expect(h.routines()[0].nextRunAt).toBe(new Date(2026, 9, 20, 14, 0).getTime())
    expect(h.routines()[0].lastRunAt).toBe(now.getTime())
  })

  it('leaves paused and not-yet-due routines alone', async () => {
    const h = harness([
      routine({ id: 'paused', enabled: false }),
      routine({ id: 'later', nextRunAt: now.getTime() + 60000 })
    ])
    await h.scheduler.tick(now)
    expect(h.executed).toEqual([])
  })

  it('marks a failing run as failed', async () => {
    const h = harness([routine()])
    const failing = new Scheduler({
      getRoutines: () => h.routines(),
      saveRoutines: () => {},
      saveRun: (run) => h.runs.push(run),
      execute: async () => ({ exitCode: 1, output: 'error: not logged in' })
    })
    await failing.runNow('r1', now)
    expect(h.runs.at(-1)).toMatchObject({ status: 'failed', exitCode: 1, trigger: 'manual' })
  })
})
