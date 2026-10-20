import { AlertTriangle, ArrowRightLeft, Clock, X } from 'lucide-react'
import { useState } from 'react'
import { agentById } from '@shared/agents'
import { SYSTEM_ACCOUNT_ID } from '@shared/types'
import { openPtyBeside } from '../../lib/canvas'
import { formatTime } from '../../lib/cn'
import { errorText, toast, useApp } from '../../lib/store'
import { Button, Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '../ui'

/** Shown on a pane whose agent ran out of quota: turns the dead end into a choice. */
export function LimitBanner({ ptyId }: { ptyId: string }) {
  const info = useApp((s) => s.ptys[ptyId])
  const accounts = useApp((s) => s.snapshot!.accounts)
  const [scheduled, setScheduled] = useState(false)
  if (!info || info.status !== 'limited') return null

  const provider = agentById(info.agentId)?.provider
  const current = info.accountId ?? SYSTEM_ACCOUNT_ID
  const others = [
    ...(current !== SYSTEM_ACCOUNT_ID ? [{ id: SYSTEM_ACCOUNT_ID, name: 'System login' }] : []),
    ...accounts.filter((a) => a.provider === provider && a.id !== current)
  ]

  const moveTo = async (accountId: string): Promise<void> => {
    try {
      const next = await window.api.limits.continueOnAccount(ptyId, accountId, 100, 30)
      openPtyBeside(ptyId, next)
      toast('Continuing in a new pane on the other account, with a summary of the conversation.', 'success')
    } catch (err) {
      toast(errorText(err), 'error')
    }
  }

  return (
    <div role="alert" className="flex shrink-0 flex-col gap-2 border-b border-warn/30 bg-warn/10 px-3 py-2.5 text-sm">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
        <div className="min-w-0 flex-1 leading-snug">
          <span className="font-medium text-fg">Usage limit reached.</span>{' '}
          <span className="text-fg-muted">
            {scheduled && info.resetAt
              ? `AgentDeck will type "continue" at ${formatTime(info.resetAt + 60000)}.`
              : info.resetAt
                ? `Resets ${formatTime(info.resetAt)}.`
                : 'The reset time wasn’t shown.'}
          </span>
        </div>
        <button aria-label="Dismiss" className="shrink-0 rounded p-1 text-fg-muted hover:bg-hover hover:text-fg" onClick={() => void window.api.limits.dismiss(ptyId)}>
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-wrap gap-2 pl-[25px]">
        {info.resetAt && !scheduled && (
          <Button
            size="sm"
            onClick={() => {
              void window.api.limits.resumeLater(ptyId)
              setScheduled(true)
            }}
          >
            <Clock size={13} /> Resume when it resets
          </Button>
        )}
        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" variant="primary">
              <ArrowRightLeft size={13} /> Continue on another account
            </Button>
          </MenuTrigger>
          <MenuContent align="start">
            <MenuLabel>Move this conversation to</MenuLabel>
            {others.length === 0 && (
              <MenuItem onSelect={() => useApp.setState({ settingsOpen: 'agents' })}>Add an account in Settings…</MenuItem>
            )}
            {others.map((a) => (
              <MenuItem key={a.id} onSelect={() => void moveTo(a.id)}>
                {a.name}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      </div>
    </div>
  )
}
