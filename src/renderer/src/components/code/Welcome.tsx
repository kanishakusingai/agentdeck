import { ArrowRight, FolderOpen, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import { useApp } from '../../lib/store'
import { Logo } from '../TitleBar'
import { AgentIcon, Kbd } from '../ui'
import { addWorkspace, continueWithoutFolder } from './CodeRail'

function Choice({ icon, title, body, hint, onClick, testId, primary }: { icon: ReactNode; title: string; body: string; hint?: ReactNode; onClick: () => void; testId: string; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={
        'group flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-colors ' +
        (primary ? 'border-accent/40 bg-accent-soft hover:border-accent/70' : 'border-line-strong bg-surface hover:border-fg-faint/60 hover:bg-raised')
      }
    >
      <div className="flex w-full items-center justify-between">
        <span className={'flex h-9 w-9 items-center justify-center rounded-lg ' + (primary ? 'bg-accent-solid text-white' : 'bg-hover text-fg')}>{icon}</span>
        <ArrowRight size={16} className="text-fg-faint transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
      </div>
      <div>
        <div className="text-[15px] font-semibold text-fg">{title}</div>
        <div className="mt-1 text-sm leading-relaxed text-fg-muted">{body}</div>
      </div>
      {hint && <div className="mt-auto text-xs text-fg-faint">{hint}</div>}
    </button>
  )
}

/** First run: pick a project folder, or just start in a scratch folder. */
export function Welcome() {
  const agents = useApp((s) => s.agents).filter((a) => a.installed)
  return (
    <div className="card relative flex h-full flex-col items-center justify-center overflow-hidden p-8">
      <div aria-hidden className="pointer-events-none absolute -top-48 left-1/2 h-96 w-[720px] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />
      <div className="relative flex w-full max-w-[660px] flex-col items-center text-center">
        <Logo size={44} />
        <h1 className="mt-5 text-[26px] font-semibold tracking-tight text-fg">Welcome to AgentDeck</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-fg-muted">
          Run Claude Code, Codex and other coding agents side by side, and watch them work. Choose where they should start.
        </p>

        <div className="mt-8 grid w-full grid-cols-2 gap-3">
          <Choice
            primary
            testId="add-first-workspace"
            icon={<FolderOpen size={18} />}
            title="Open a project folder"
            body="Agents read and change the files inside a folder you pick."
            hint={
              <span className="flex items-center gap-1">
                Shortcut <Kbd>Ctrl</Kbd> <Kbd>O</Kbd>
              </span>
            }
            onClick={() => void addWorkspace()}
          />
          <Choice
            testId="continue-without-folder"
            icon={<Zap size={18} />}
            title="Continue without a folder"
            body="Start right away in a private scratch folder. You can add a real project any time."
            hint="Saved in Documents › AgentDeck › Scratchpad"
            onClick={() => void continueWithoutFolder()}
          />
        </div>

        {agents.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-xs text-fg-faint">
            <span>Ready on this PC</span>
            {agents.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-fg-muted">
                <AgentIcon agentId={a.id} size={12} />
                {a.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
