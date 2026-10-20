import { chmodSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import type { DetectedAgent } from '@shared/types'
import { runHeadless } from './headless'

const isWin = process.platform === 'win32'

/** A fake agent CLI that prints its arguments, then echoes the prompt it got on stdin. */
function fakeAgent(): DetectedAgent {
  const dir = mkdtempSync(join(tmpdir(), 'agentdeck fake agent '))
  const path = join(dir, isWin ? 'fake.cmd' : 'fake')
  if (isWin) writeFileSync(path, '@echo off\r\necho ARGS: %*\r\nmore\r\n')
  else {
    writeFileSync(path, '#!/bin/sh\necho "ARGS: $@"\ncat\n')
    chmodSync(path, 0o755)
  }
  return {
    id: 'fake', label: 'Fake', bins: ['fake'], installed: true, path,
    headless: { args: ['-p'], editArgs: ['-p', '--edit'] }
  }
}

describe('runHeadless', () => {
  it('passes the prompt on stdin, never on the command line', async () => {
    const prompt = 'Summarise & report "risky" changes | do not run rm -rf'
    const result = await runHeadless({ agent: fakeAgent(), cwd: tmpdir(), env: {}, prompt, allowEdits: false })
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('ARGS: -p')
    expect(result.output).not.toMatch(/ARGS:.*Summarise/)
    expect(result.output).toContain(prompt)
  })

  it('uses the edit arguments only when file changes are allowed', async () => {
    const result = await runHeadless({ agent: fakeAgent(), cwd: tmpdir(), env: {}, prompt: 'x', allowEdits: true })
    expect(result.output).toContain('ARGS: -p --edit')
  })

  it('refuses agents that are not installed', async () => {
    await expect(
      runHeadless({ agent: { ...fakeAgent(), installed: false, path: undefined }, cwd: tmpdir(), env: {}, prompt: 'x', allowEdits: false })
    ).rejects.toThrow("isn't installed")
  })
})
