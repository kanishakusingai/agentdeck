import { describe, expect, it } from 'vitest'
import { initialPtt, pttReducer, type PttState } from './ptt'

const run = (events: Parameters<typeof pttReducer>[1][], start: PttState = initialPtt): PttState =>
  events.reduce(pttReducer, start)

describe('push-to-talk', () => {
  it('records while the key is held and transcribes on release', () => {
    expect(run([{ type: 'keyDown', at: 0 }])).toMatchObject({ phase: 'recording' })
    expect(run([{ type: 'keyDown', at: 0 }, { type: 'keyUp', at: 2000 }])).toMatchObject({ phase: 'transcribing' })
  })

  it('treats a quick tap as an accident and records nothing', () => {
    expect(run([{ type: 'keyDown', at: 0 }, { type: 'keyUp', at: 150 }])).toEqual({ phase: 'idle' })
  })

  it('ignores key repeat while recording', () => {
    const s = run([{ type: 'keyDown', at: 0 }, { type: 'keyDown', at: 500 }])
    expect(s).toEqual({ phase: 'recording', startedAt: 0 })
  })

  it('returns to idle with the text after transcription', () => {
    const s = run([{ type: 'keyDown', at: 0 }, { type: 'keyUp', at: 1000 }, { type: 'transcribed', text: 'add a login page' }])
    expect(s).toEqual({ phase: 'idle', lastText: 'add a login page' })
  })

  it('does not start a new recording while still transcribing', () => {
    const s = run([{ type: 'keyDown', at: 0 }, { type: 'keyUp', at: 1000 }, { type: 'keyDown', at: 1100 }])
    expect(s.phase).toBe('transcribing')
  })

  it('shows an error and recovers on the next key press', () => {
    const failed = run([{ type: 'keyDown', at: 0 }, { type: 'failed', message: 'Microphone blocked' }])
    expect(failed).toEqual({ phase: 'error', message: 'Microphone blocked' })
    expect(pttReducer(failed, { type: 'keyDown', at: 5000 })).toEqual({ phase: 'recording', startedAt: 5000 })
  })

  it('goes back to idle when nothing was recorded (key released before the mic opened)', () => {
    const s = run([{ type: 'keyDown', at: 0 }, { type: 'keyUp', at: 900 }, { type: 'cancelled' }])
    expect(s).toEqual({ phase: 'idle' })
    expect(pttReducer(s, { type: 'keyDown', at: 2000 })).toEqual({ phase: 'recording', startedAt: 2000 })
  })
})
