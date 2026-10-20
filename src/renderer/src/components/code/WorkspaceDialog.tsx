import { useState } from 'react'
import { PROVIDER_LABEL } from '@shared/agents'
import type { Provider } from '@shared/types'
import { accountName } from '../../lib/accounts'
import { useApp } from '../../lib/store'
import { Button, Dialog, Field, Input, Select } from '../ui'

export function WorkspaceDialog({ workspaceId, mode, onClose }: { workspaceId: string; mode: 'rename' | 'accounts'; onClose: () => void }) {
  const snap = useApp((s) => s.snapshot!)
  const ws = snap.workspaces.find((w) => w.id === workspaceId)
  const [name, setName] = useState(ws?.name ?? '')
  if (!ws) return null

  if (mode === 'rename') {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()} title="Rename workspace" description={ws.path}>
        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault()
            void window.api.workspaces.rename(ws.id, name).then(onClose)
          }}
        >
          <Field label="Name">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>
    )
  }

  const providers: Provider[] = ['claude', 'codex']
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Accounts for ${ws.name}`} description="Agents launched in this workspace use these accounts instead of your defaults.">
      <div className="flex flex-col gap-4 p-5">
        {providers.map((p) => (
          <Field key={p} label={PROVIDER_LABEL[p]} hint={`Your default is ${accountName(snap, snap.defaults[p])}.`}>
            <Select
              value={ws.accountOverrides[p] ?? ''}
              onChange={(e) => void window.api.workspaces.setAccountOverride(ws.id, p, e.target.value || null)}
            >
              <option value="">Use my default</option>
              <option value="system">System login</option>
              {snap.accounts
                .filter((a) => a.provider === p)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Field>
        ))}
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
