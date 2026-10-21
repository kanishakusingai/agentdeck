import { useApp } from '../../lib/store'
import { Logo } from '../TitleBar'
import { AgentIcon } from '../ui'
import { NewProjectForm } from './NewProject'

/** First run: create a project (name, then a folder or none). */
export function Welcome() {
  const agents = useApp((s) => s.agents).filter((a) => a.installed)
  return (
    <div className="card relative flex h-full flex-col items-center justify-center overflow-hidden p-8">
      <div aria-hidden className="pointer-events-none absolute -top-48 left-1/2 h-96 w-[720px] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />
      <div className="relative flex w-full max-w-[660px] flex-col items-center text-center">
        <Logo size={44} />
        <h1 className="mt-5 text-[26px] font-semibold tracking-tight text-fg">Welcome to AgentDeck</h1>
        <p className="mb-8 mt-2 max-w-md text-sm leading-relaxed text-fg-muted">
          Run Claude Code, Codex and other coding agents side by side, and watch them work. Start by creating your first project.
        </p>
        <NewProjectForm />
        {agents.length > 0 && (
          <div className="mt-9 flex flex-wrap items-center justify-center gap-2 text-xs text-fg-faint">
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
