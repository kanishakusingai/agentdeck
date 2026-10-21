import { describe, expect, it } from 'vitest'
import { sessionsOf } from './types'

describe('sessionsOf', () => {
  it('gives a project without sessions one session whose id is the project id (older layouts keep loading)', () => {
    expect(sessionsOf({ id: 'p1' })).toEqual([{ id: 'p1', name: 'Session 1' }])
    expect(sessionsOf({ id: 'p1', sessions: [] })).toEqual([{ id: 'p1', name: 'Session 1' }])
  })

  it('keeps the sessions the user made', () => {
    const sessions = [
      { id: 'p1', name: 'Claude' },
      { id: 'p1:x', name: 'Codex' }
    ]
    expect(sessionsOf({ id: 'p1', sessions })).toBe(sessions)
  })
})