import { randomUUID } from 'crypto'
import type { Routine, RoutineRun, Schedule } from '@shared/types'

export { describeSchedule } from '@shared/schedule'

/** When a schedule should next fire, strictly after `from`. */
export function nextRun(schedule: Schedule, from: Date): number {
  if (schedule.kind === 'interval') {
    return from.getTime() + Math.max(1, schedule.minutes) * 60000
  }
  const [h, m] = schedule.time.split(':').map(Number)
  const days = schedule.days.length ? schedule.days : [0, 1, 2, 3, 4, 5, 6]
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset, h, m, 0, 0)
    if (candidate.getTime() > from.getTime() && days.includes(candidate.getDay())) return candidate.getTime()
  }
  return from.getTime() + 86400000
}

export interface ExecuteResult {
  exitCode: number
  output: string
}

export interface SchedulerDeps {
  getRoutines: () => Routine[]
  saveRoutines: (routines: Routine[]) => void
  saveRun: (run: RoutineRun) => void
  execute: (routine: Routine, onOutput: (chunk: string) => void) => Promise<ExecuteResult>
}

const MAX_OUTPUT = 100_000

/** Runs routines when they are due. Call `tick()` periodically. */
export class Scheduler {
  private readonly running = new Set<string>()
  private timer: NodeJS.Timeout | undefined

  constructor(private readonly deps: SchedulerDeps) {}

  start(intervalMs = 30000): void {
    this.stop()
    void this.tick()
    this.timer = setInterval(() => void this.tick(), intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  isRunning(routineId: string): boolean {
    return this.running.has(routineId)
  }

  /** Give routines without a next run time one. */
  normalise(now: Date = new Date()): void {
    const routines = this.deps.getRoutines()
    if (routines.every((r) => r.nextRunAt)) return
    this.deps.saveRoutines(routines.map((r) => (r.nextRunAt ? r : { ...r, nextRunAt: nextRun(r.schedule, now) })))
  }

  async tick(now: Date = new Date()): Promise<void> {
    const due = this.deps
      .getRoutines()
      .filter((r) => r.enabled && r.nextRunAt !== undefined && r.nextRunAt <= now.getTime() && !this.running.has(r.id))
    await Promise.all(due.map((r) => this.run(r, 'schedule', now)))
  }

  async runNow(routineId: string, now: Date = new Date()): Promise<void> {
    const routine = this.deps.getRoutines().find((r) => r.id === routineId)
    if (!routine || this.running.has(routineId)) return
    await this.run(routine, 'manual', now)
  }

  private async run(routine: Routine, trigger: RoutineRun['trigger'], now: Date): Promise<void> {
    this.running.add(routine.id)
    // Move the schedule forward before running so a slow run can't double-fire.
    this.patchRoutine(routine.id, {
      lastRunAt: now.getTime(),
      ...(trigger === 'schedule' ? { nextRunAt: nextRun(routine.schedule, now) } : {})
    })
    const run: RoutineRun = {
      id: randomUUID(),
      routineId: routine.id,
      routineName: routine.name,
      startedAt: now.getTime(),
      status: 'running',
      output: '',
      trigger
    }
    this.deps.saveRun(run)
    try {
      const result = await this.deps.execute(routine, (chunk) => {
        run.output = (run.output + chunk).slice(-MAX_OUTPUT)
      })
      this.deps.saveRun({
        ...run,
        endedAt: Date.now(),
        exitCode: result.exitCode,
        output: result.output.slice(-MAX_OUTPUT),
        status: result.exitCode === 0 ? 'success' : 'failed'
      })
    } catch (err) {
      this.deps.saveRun({ ...run, endedAt: Date.now(), status: 'failed', output: `${run.output}\n${String(err)}` })
    } finally {
      this.running.delete(routine.id)
    }
  }

  private patchRoutine(id: string, patch: Partial<Routine>): void {
    this.deps.saveRoutines(this.deps.getRoutines().map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
}
