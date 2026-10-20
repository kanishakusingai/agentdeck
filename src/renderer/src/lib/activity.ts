import { useEffect, useState } from 'react'
import type { PtyInfo } from '@shared/types'
import { onAnyInput, onAnyOutput } from './pty-bus'

/** What a pane is doing right now, as shown on the dashboard. */
export type Activity = 'working' | 'needs' | 'idle'

/** Output this soon after a keystroke is just the terminal echoing what you typed. */
const ECHO_MS = 350
/** A gap this long in the output starts a new burst. */
const BURST_GAP_MS = 1200
/** Output has to keep going this long to count as the agent working (not a redraw). */
const WORK_MS = 1500
/** Output within this window means the pane is still busy. */
const RECENT_MS = 2000

interface Track {
  lastInput: number
  lastOutput: number
  burstStart: number
  /** The agent did real work since you last typed to it. */
  worked: boolean
}

/**
 * Tells working panes from ones waiting for you, from terminal traffic alone:
 * agents stream output (spinners, tool calls) while they work and go quiet when
 * they finish their turn. Short bursts — echoes, redraws, start-up banners — don't count.
 */
export class ActivityTracker {
  private readonly tracks = new Map<string, Track>()

  private get(id: string): Track {
    let t = this.tracks.get(id)
    if (!t) this.tracks.set(id, (t = { lastInput: -Infinity, lastOutput: -Infinity, burstStart: -Infinity, worked: false }))
    return t
  }

  input(id: string, now: number): void {
    const t = this.get(id)
    t.lastInput = now
    t.worked = false
  }

  output(id: string, now: number): void {
    const t = this.get(id)
    if (now - t.lastInput < ECHO_MS) return
    if (now - t.lastOutput > BURST_GAP_MS) t.burstStart = now
    t.lastOutput = now
    if (now - t.burstStart >= WORK_MS) t.worked = true
  }

  activity(info: Pick<PtyInfo, 'id' | 'status' | 'agentId'>, now: number): Activity {
    if (info.status === 'limited') return 'needs'
    if (info.status === 'exited') return 'idle'
    const t = this.tracks.get(info.id)
    if (!t?.worked) return 'idle'
    if (now - t.lastOutput < RECENT_MS) return 'working'
    // Plain terminals finishing a command are just idle; agents are waiting for you.
    return info.agentId ? 'needs' : 'idle'
  }

  /** When the current state began (for "Working 4m"). */
  since(id: string, activity: Activity): number | undefined {
    const t = this.tracks.get(id)
    if (!t) return undefined
    if (activity === 'working') return t.burstStart
    if (activity === 'needs') return t.lastOutput
    return undefined
  }

  forget(id: string): void {
    this.tracks.delete(id)
  }
}

export const tracker = new ActivityTracker()
let installed = false

function install(): void {
  if (installed) return
  installed = true
  onAnyOutput((id) => tracker.output(id, Date.now()))
  onAnyInput((id) => tracker.input(id, Date.now()))
}

/** Re-renders every second so activity labels stay current. */
export function useActivityClock(): number {
  install()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}
