import * as RDialog from '@radix-ui/react-dialog'
import { Check, FolderOpen, Keyboard, LogIn, Mic, Plus, RefreshCw, SquareTerminal, Trash2, UserRound, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { PROVIDER_LABEL } from '@shared/agents'
import { SYSTEM_ACCOUNT_ID, type Provider } from '@shared/types'
import { openTerminal } from '../lib/canvas'
import { cn } from '../lib/cn'
import { errorText, refreshAgents, saveSettings, toast, useApp, type SettingsSection } from '../lib/store'
import { preloadModel, useVoice } from '../voice/dictation'
import { Button, Field, Input, Kbd, Select, Toggle } from './ui'
import { askConfirm } from './Ask'

const SECTIONS: { id: SettingsSection; label: string; icon: typeof Mic }[] = [
  { id: 'agents', label: 'Agents & accounts', icon: UserRound },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'terminal', label: 'Terminal & browser', icon: SquareTerminal },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard }
]

function Group({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {description && <p className="mt-1 text-xs leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function AccountsFor({ provider }: { provider: Provider }) {
  const snap = useApp((s) => s.snapshot!)
  const installed = useApp((s) => s.agents.find((a) => a.id === provider)?.installed)
  const accounts = snap.accounts.filter((a) => a.provider === provider)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)

  const signIn = async (accountId: string): Promise<void> => {
    const workspaceId = snap.ui.activeWorkspaceId ?? snap.workspaces[0]?.id
    if (!workspaceId) return toast('Add a workspace first — the sign-in runs in a terminal pane.', 'error')
    useApp.setState({ settingsOpen: null })
    await openTerminal({ workspaceId, signInAccountId: accountId })
    toast(provider === 'claude' ? 'Finish signing in in the new pane (type /login if it asks).' : 'Finish signing in in the browser window that opens.')
  }

  const add = async (): Promise<void> => {
    try {
      const account = await window.api.accounts.add(provider, name || `${PROVIDER_LABEL[provider]} ${accounts.length + 1}`)
      setName('')
      if (installed) void signIn(account.id)
    } catch (err) {
      toast(errorText(err), 'error')
    }
  }

  return (
    <div className="rounded-lg border border-line">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="text-sm font-medium text-fg">{PROVIDER_LABEL[provider]}</div>
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          Default
          <Select
            className="h-7 w-44 text-xs"
            value={snap.defaults[provider] ?? SYSTEM_ACCOUNT_ID}
            onChange={(e) => void window.api.accounts.setDefault(provider, e.target.value)}
            aria-label={`Default ${PROVIDER_LABEL[provider]} account`}
          >
            <option value={SYSTEM_ACCOUNT_ID}>System login</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <ul className="divide-y divide-line">
        <li className="flex items-center gap-3 px-4 py-2.5">
          <UserRound size={14} className="text-fg-faint" />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-fg">System login</div>
            <div className="text-2xs text-fg-faint">Whatever you're signed into normally on this PC</div>
          </div>
        </li>
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center gap-2 px-4 py-2.5">
            <UserRound size={14} className="text-fg-faint" />
            {renaming?.id === a.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void window.api.accounts.rename(a.id, renaming.name).then(() => setRenaming(null))
                }}
              >
                <Input autoFocus className="h-7" value={renaming.name} onChange={(e) => setRenaming({ id: a.id, name: e.target.value })} />
                <Button size="sm" type="submit" variant="primary" aria-label="Save name">
                  <Check size={13} />
                </Button>
              </form>
            ) : (
              <button className="min-w-0 flex-1 truncate text-left text-sm text-fg hover:underline" onClick={() => setRenaming({ id: a.id, name: a.name })} title="Rename">
                {a.name}
              </button>
            )}
            <Button size="sm" variant="ghost" disabled={!installed} onClick={() => void signIn(a.id)}>
              <LogIn size={13} /> Sign in
            </Button>
            <Button size="icon" variant="ghost" aria-label="Open account folder" onClick={() => void window.api.accounts.reveal(a.id)}>
              <FolderOpen size={13} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Remove ${a.name}`}
              onClick={() => {
                void askConfirm({
                  title: `Remove the account “${a.name}”?`,
                  body: 'This signs it out of AgentDeck and deletes its sign-in folder. Your subscription is not affected.',
                  confirmLabel: 'Remove account'
                }).then((ok) => {
                  if (ok) void window.api.accounts.remove(a.id)
                })
              }}
            >
              <Trash2 size={13} />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2 border-t border-line px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <Input className="h-7" placeholder={`Name, e.g. "Work" or "Personal"`} value={name} onChange={(e) => setName(e.target.value)} aria-label={`New ${PROVIDER_LABEL[provider]} account name`} />
        <Button size="sm" type="submit">
          <Plus size={13} /> Add account
        </Button>
      </form>
      {!installed && <div className="border-t border-line px-4 py-2 text-xs text-warn">{PROVIDER_LABEL[provider]} isn't installed, so accounts can't sign in yet.</div>}
    </div>
  )
}

function AgentsSection() {
  const agents = useApp((s) => s.agents)
  return (
    <div className="flex flex-col gap-7">
      <Group title="Installed agents" description="AgentDeck looks for these command-line tools on your PATH. Install one, then press Scan again.">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {agents.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              {a.installed ? <Check size={13} className="text-ok" /> : <X size={13} className="text-fg-faint" />}
              <span className={a.installed ? 'text-fg' : 'text-fg-faint'}>{a.label}</span>
            </div>
          ))}
        </div>
        <div>
          <Button size="sm" onClick={() => void refreshAgents().then(() => toast('Checked again for installed agents.'))}>
            <RefreshCw size={13} /> Scan again
          </Button>
        </div>
      </Group>
      <Group
        title="Accounts"
        description="Sign in to every Claude Code and Codex account you pay for. Each one logs in through the tool's own sign-in and keeps it in a separate folder — AgentDeck never reads or stores your tokens."
      >
        <AccountsFor provider="claude" />
        <AccountsFor provider="codex" />
      </Group>
    </div>
  )
}

const MODELS = [
  { id: 'Xenova/whisper-tiny.en', label: 'Fast — Whisper tiny (≈40 MB)' },
  { id: 'Xenova/whisper-base.en', label: 'Balanced — Whisper base (≈80 MB)' },
  { id: 'Xenova/whisper-small.en', label: 'Accurate — Whisper small (≈250 MB)' }
]

function VoiceSection() {
  const settings = useApp((s) => s.snapshot!.settings)
  const allAgents = useApp((s) => s.agents)
  const agents = allAgents.filter((a) => a.headless)
  const { modelProgress, modelReady } = useVoice()
  const [capturing, setCapturing] = useState(false)
  return (
    <div className="flex flex-col gap-7">
      <Group title="Push to talk" description="Hold the key, speak, release. The text goes into the pane or box you're working in.">
        <div className="flex items-center gap-3">
          <Button
            onKeyDown={(e) => {
              if (!capturing) return
              e.preventDefault()
              e.stopPropagation()
              if (e.code !== 'Escape') void saveSettings({ pushToTalkKey: e.code })
              setCapturing(false)
            }}
            onClick={() => setCapturing(true)}
            onBlur={() => setCapturing(false)}
            className={cn(capturing && 'border-accent')}
          >
            {capturing ? 'Press any key…' : 'Change key'}
          </Button>
          <span className="text-sm text-fg-muted">
            Current: <Kbd>{settings.pushToTalkKey}</Kbd>
          </span>
        </div>
      </Group>
      <Group title="Speech model" description="Runs entirely on this computer — your voice is never uploaded. The model downloads once the first time you use it.">
        <Field label="Model">
          <Select value={settings.whisperModel} onChange={(e) => void saveSettings({ whisperModel: e.target.value })}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={preloadModel} disabled={modelProgress !== null}>
            {modelReady ? 'Model ready' : modelProgress !== null ? `Downloading ${modelProgress}%` : 'Download now'}
          </Button>
          {modelProgress !== null && (
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={modelProgress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-accent transition-[width]" style={{ width: `${modelProgress}%` }} />
            </div>
          )}
        </div>
      </Group>
      <Group title="Enhance Prompt" description="Rewrites rambling dictation into a clear brief, using your own agent account (no extra cost from AgentDeck).">
        <Field label="Rewrite with">
          <Select value={settings.enhanceAgentId} onChange={(e) => void saveSettings({ enhanceAgentId: e.target.value })}>
            {agents.map((a) => (
              <option key={a.id} value={a.id} disabled={!a.installed}>
                {a.label}
                {a.installed ? '' : ' (not installed)'}
              </option>
            ))}
          </Select>
        </Field>
      </Group>
    </div>
  )
}

function TerminalSection() {
  const settings = useApp((s) => s.snapshot!.settings)
  const [url, setUrl] = useState(settings.browserHomeUrl)
  const win = window.api.platform === 'win32'
  return (
    <div className="flex flex-col gap-7">
      <Group title="Terminal" description="Applies to new panes.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Shell">
            <Select value={settings.shell} onChange={(e) => void saveSettings({ shell: e.target.value as typeof settings.shell })}>
              {win ? (
                <>
                  <option value="powershell">Windows PowerShell</option>
                  <option value="pwsh">PowerShell 7 (pwsh)</option>
                  <option value="cmd">Command Prompt</option>
                </>
              ) : (
                <option value="bash">Login shell</option>
              )}
            </Select>
          </Field>
          <Field label="Font size">
            <Select value={settings.terminalFontSize} onChange={(e) => void saveSettings({ terminalFontSize: Number(e.target.value) })}>
              {[11, 12, 13, 14, 15, 16, 18].map((n) => (
                <option key={n} value={n}>
                  {n}px
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {settings.shell !== 'cmd' && settings.shell !== 'bash' && (
          <div className="flex items-start justify-between gap-6 rounded-xl border border-line bg-surface px-4 py-3">
            <div>
              <div className="text-[13px] font-medium text-fg">Show the full folder path</div>
              <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                On: the whole path (e.g. <span className="font-mono text-fg-faint">C:\Users\you\Projects\site</span>) sits on its own line above <span className="font-mono text-fg-faint">PS&gt;</span>. Off: only the folder name (<span className="font-mono text-fg-faint">PS site&gt;</span>).
              </div>
            </div>
            <Toggle checked={settings.fullPathPrompt !== false} onChange={(v) => void saveSettings({ fullPathPrompt: v })} label="Show the full folder path" />
          </div>
        )}
      </Group>
      <Group title="Docked browser">
        <Field label="Home address" hint="Where the sidebar browser opens — usually your app's dev server.">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => void saveSettings({ browserHomeUrl: url.trim() || 'http://localhost:3000' })} />
        </Field>
      </Group>
    </div>
  )
}

export const SHORTCUTS: [string, string][] = [
  ['Agent / Code / Thread mode', 'Ctrl+1 / 2 / 3'],
  ['New terminal', 'Ctrl+Shift+T'],
  ['Launch default agent (Claude Code)', 'Ctrl+Shift+A'],
  ['Split active pane right', 'Ctrl+Shift+\\'],
  ['Split active pane down', 'Ctrl+Shift+-'],
  ['Tidy the canvas', 'Ctrl+Shift+L'],
  ['Show / hide the right sidebar', 'Ctrl+B'],
  ['Show / hide the left panel', 'Ctrl+Shift+B'],
  ['Add a workspace', 'Ctrl+O'],
  ['Settings', 'Ctrl+,'],
  ['Dictate (hold)', 'Push-to-talk key']
]

function ShortcutsSection() {
  const key = useApp((s) => s.snapshot!.settings.pushToTalkKey)
  return (
    <div className="divide-y divide-line rounded-lg border border-line">
      {SHORTCUTS.map(([label, keys]) => (
        <div key={label} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="text-fg-muted">{label}</span>
          <span className="flex gap-1">
            {(keys === 'Push-to-talk key' ? key : keys).split(' / ').map((k, i) => (
              <Kbd key={i}>{k}</Kbd>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

export function SettingsDialog() {
  const section = useApp((s) => s.settingsOpen)
  const close = (): void => useApp.setState({ settingsOpen: null })
  return (
    <RDialog.Root open={section !== null} onOpenChange={(o) => !o && close()}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/55" />
        <RDialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[min(680px,88vh)] w-[min(860px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-line-strong bg-panel shadow-[0_24px_64px_rgba(0,0,0,0.6)] focus:outline-none">
          <RDialog.Description className="sr-only">AgentDeck settings</RDialog.Description>
          <nav className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-line bg-bg p-2">
            <RDialog.Title className="px-2 pb-3 pt-2 text-base font-semibold text-fg">Settings</RDialog.Title>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => useApp.setState({ settingsOpen: s.id })}
                className={cn('flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors', section === s.id ? 'bg-raised text-fg' : 'text-fg-muted hover:bg-hover/60 hover:text-fg')}
              >
                <s.icon size={14} /> {s.label}
              </button>
            ))}
          </nav>
          <div className="relative min-w-0 flex-1 overflow-y-auto px-7 py-6">
            <RDialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close settings" className="absolute right-3 top-3">
                <X size={16} />
              </Button>
            </RDialog.Close>
            <h2 className="mb-5 text-base font-semibold text-fg">{SECTIONS.find((s) => s.id === section)?.label}</h2>
            {section === 'agents' && <AgentsSection />}
            {section === 'voice' && <VoiceSection />}
            {section === 'terminal' && <TerminalSection />}
            {section === 'shortcuts' && <ShortcutsSection />}
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}
