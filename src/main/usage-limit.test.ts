import { describe, expect, it } from 'vitest'
import { detectUsageLimit, stripAnsi } from './usage-limit'

// Tuesday 20 Oct 2026, 13:00 local time
const now = new Date(2026, 9, 20, 13, 0, 0)

describe('detectUsageLimit', () => {
  it('ignores normal agent output', () => {
    expect(detectUsageLimit('Edited src/app.ts (+12 -3). All tests pass.', now)).toEqual({ limited: false })
  })

  it('reads the Claude epoch-style limit message', () => {
    expect(detectUsageLimit('Claude AI usage limit reached|1792500000', now)).toEqual({
      limited: true,
      resetAt: 1792500000 * 1000
    })
  })

  it('reads a Claude "resets 3pm" message as the next 3pm', () => {
    const r = detectUsageLimit("5-hour limit reached ∙ resets 3pm", now)
    expect(r.limited).toBe(true)
    expect(r.resetAt).toBe(new Date(2026, 9, 20, 15, 0, 0).getTime())
  })

  it('rolls a reset time that already passed today over to tomorrow', () => {
    const r = detectUsageLimit("You've hit your limit · resets 9:30am (Asia/Calcutta)", now)
    expect(r.resetAt).toBe(new Date(2026, 9, 21, 9, 30, 0).getTime())
  })

  it('reads the Codex "try again in" message', () => {
    const r = detectUsageLimit("You've hit your usage limit. Upgrade to Pro or try again in 2 hours 5 minutes.", now)
    expect(r).toEqual({ limited: true, resetAt: now.getTime() + (2 * 60 + 5) * 60000 })
  })

  it('still reports a limit when no reset time is given', () => {
    expect(detectUsageLimit('Claude usage limit reached.', now)).toEqual({ limited: true })
  })

  it('sees through terminal colour codes', () => {
    expect(detectUsageLimit(stripAnsi('\u001b[31mUsage limit\u001b[0m reached'), now).limited).toBe(true)
  })
})
