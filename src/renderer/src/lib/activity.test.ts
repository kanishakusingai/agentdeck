import { describe, expect, it } from 'vitest'
import { ActivityTracker } from './activity'

const agent = { id: 'p1', status: 'running' as const, agentId: 'claude' }
const shell = { id: 'p1', status: 'running' as const, agentId: undefined }

/** Feed output every 100ms between two times. */
function stream(t: InstanceType<typeof ActivityTracker>, from: number, to: number): void {
  for (let now = from; now <= to; now += 100) t.output('p1', now)
}

describe('ActivityTracker', () => {
  it('a freshly started agent is idle, even after its start-up banner', () => {
    const t = new ActivityTracker()
    stream(t, 0, 400)
    expect(t.activity(agent, 500)).toBe('idle')
    expect(t.activity(agent, 10_000)).toBe('idle')
  })

  it('sustained output is working; going quiet afterwards means it needs you', () => {
    const t = new ActivityTracker()
    t.input('p1', 0)
    stream(t, 1000, 4000)
    expect(t.activity(agent, 4100)).toBe('working')
    expect(t.activity(agent, 7000)).toBe('needs')
    expect(t.since('p1', 'needs')).toBe(4000)
  })

  it('typing to the agent clears "needs you", and echoes of typing are not work', () => {
    const t = new ActivityTracker()
    stream(t, 0, 3000)
    expect(t.activity(agent, 6000)).toBe('needs')
    for (let now = 6000; now < 9000; now += 200) {
      t.input('p1', now)
      t.output('p1', now + 20)
    }
    expect(t.activity(agent, 9100)).toBe('idle')
  })

  it('plain terminals go idle (never "needs you") when a command finishes', () => {
    const t = new ActivityTracker()
    stream(t, 0, 3000)
    expect(t.activity(shell, 3100)).toBe('working')
    expect(t.activity(shell, 9000)).toBe('idle')
  })

  it('a usage limit always needs you; an exited pane is idle', () => {
    const t = new ActivityTracker()
    expect(t.activity({ ...agent, status: 'limited' }, 0)).toBe('needs')
    expect(t.activity({ ...agent, status: 'exited' }, 0)).toBe('idle')
  })
})
