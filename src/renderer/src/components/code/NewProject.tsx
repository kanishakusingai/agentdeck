import * as RDialog from '@radix-ui/react-dialog'
import { ArrowLeft, ArrowRight, FolderOpen, FolderPlus, Loader2, SquareTerminal, Zap } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { openTerminal } from '../../lib/canvas'
import { cn } from '../../lib/cn'
import { errorText, setActiveWorkspace, toast } from '../../lib/store'
import { Button } from '../ui'

/*
 * Creating a project is two steps: 1) name it, 2) choose where it works — a folder on
 * the PC, or no folder (the user's own folder, C:\Users\<name>).
 */

const useNewProject = create<{ open: boolean }>(() => ({ open: false }))
export const openNewProject = (): void => useNewProject.setState({ open: true })

async function createProject(name: string, where: 'folder' | 'none'): Promise<boolean> {
  try {
    const id = where === 'folder' ? await window.api.workspaces.add(name) : await window.api.workspaces.addScratch(name)
    if (!id) return false // folder picker cancelled
    setActiveWorkspace(id)
    toast(`Project “${name}” is ready. Use Launch to open a terminal or an agent.`, 'success')
    return true
  } catch (err) {
    toast(errorText(err), 'error')
    return false
  }
}

/** Where "Continue without a project" works: the user's own folder, under this name in the side panel. */
export const QUICK_SESSIONS = 'Quick sessions'

/** Skip making a project: open a terminal in the user's own folder straight away. */
async function continueWithoutProject(): Promise<boolean> {
  try {
    const id = await window.api.workspaces.addScratch(QUICK_SESSIONS)
    setActiveWorkspace(id)
    await openTerminal({ workspaceId: id })
    return true
  } catch (err) {
    toast(errorText(err), 'error')
    return false
  }
}

function Choice({ icon, title, body, hint, onClick, testId, primary, busy }: { icon: ReactNode; title: string; body: string; hint?: ReactNode; onClick: () => void; testId: string; primary?: boolean; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      data-testid={testId}
      className={cn(
        'group flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-[border-color,background-color,transform] duration-150 active:translate-y-px disabled:opacity-60',
        primary
          ? 'border-[#4a4a54] bg-linear-to-b from-white/[0.07] to-white/[0.02] hover:border-[#71717a]'
          : 'border-line-strong bg-surface hover:border-fg-faint/60 hover:bg-raised'
      )}
    >
      <div className="flex w-full items-center justify-between">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', primary ? 'bg-linear-to-b from-[#4c8df6] to-[#2563eb] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]' : 'bg-hover text-fg-muted')}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : icon}
        </span>
        <ArrowRight size={16} className="text-fg-faint transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
      </div>
      <div>
        <div className="text-[15px] font-semibold text-fg">{title}</div>
        <div className="mt-1 text-[13px] leading-relaxed text-fg-muted">{body}</div>
      </div>
      {hint && <div className="mt-auto font-mono text-2xs text-fg-faint">{hint}</div>}
    </button>
  )
}

/** The two-step form, used on the welcome screen and in the "New project" dialog. */
export function NewProjectForm({ onDone, autoFocus = true }: { onDone?: () => void; autoFocus?: boolean }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<'folder' | 'none' | 'quick' | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (step === 1 && autoFocus) requestAnimationFrame(() => input.current?.focus())
  }, [step, autoFocus])

  const finish = async (where: 'folder' | 'none'): Promise<void> => {
    setBusy(where)
    const ok = await createProject(name.trim(), where)
    setBusy(null)
    if (ok) {
      setStep(1)
      setName('')
      onDone?.()
    }
  }

  const quick = async (): Promise<void> => {
    setBusy('quick')
    const ok = await continueWithoutProject()
    setBusy(null)
    if (ok) onDone?.()
  }

  return (
    <div className="w-full" data-testid="new-project-form">
      <div className="mb-5 flex items-center justify-center gap-2 text-2xs font-medium text-fg-faint" aria-label={`Step ${step} of 2`}>
        <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px]', step === 1 ? 'bg-accent-solid text-white' : 'bg-ok/20 text-ok')}>1</span>
        <span className={step === 1 ? 'text-fg' : undefined}>Name your project</span>
        <span className="mx-1 h-px w-8 bg-line-strong" />
        <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px]', step === 2 ? 'bg-accent-solid text-white' : 'bg-hover text-fg-faint')}>2</span>
        <span className={step === 2 ? 'text-fg' : undefined}>Choose where it works</span>
      </div>

      {step === 1 ? (
        <form
          className="mx-auto flex max-w-md flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) setStep(2)
          }}
        >
          <label className="text-left">
            <span className="mb-1.5 block text-xs font-medium text-fg-muted">Project name</span>
            <input
              ref={input}
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My website, Shop app, Experiments"
              data-testid="project-name"
              className="h-11 w-full rounded-xl border border-line-strong bg-surface px-4 text-[15px] text-fg shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] placeholder:text-fg-faint focus:border-[#6b6b75] focus:outline-none focus:ring-3 focus:ring-white/[0.07]"
            />
          </label>
          <Button type="submit" variant="primary" size="lg" disabled={!name.trim()} data-testid="project-next">
            Continue <ArrowRight size={15} />
          </Button>
          <div className="my-1 flex items-center gap-3 text-2xs uppercase tracking-[0.08em] text-fg-faint" aria-hidden>
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <button
            type="button"
            onClick={() => void quick()}
            disabled={busy !== null}
            data-testid="continue-without-project"
            className="group flex items-center gap-3 rounded-xl border border-line-strong bg-surface px-4 py-3 text-left transition-colors hover:border-[#4a4a54] hover:bg-raised disabled:opacity-60"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-hover text-fg-muted">
              {busy === 'quick' ? <Loader2 size={16} className="animate-spin" /> : <SquareTerminal size={16} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-fg">Continue without a project</span>
              <span className="block text-xs text-fg-faint">Open a terminal in your own folder now — no name, no setup.</span>
            </span>
            <ArrowRight size={15} className="shrink-0 text-fg-faint transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Choice
              primary
              testId="add-first-workspace"
              icon={<FolderOpen size={18} />}
              title="Choose a folder"
              body="Agents read and change the files inside the folder you pick."
              hint="Any folder on this PC"
              busy={busy === 'folder'}
              onClick={() => void finish('folder')}
            />
            <Choice
              testId="continue-without-folder"
              icon={<Zap size={18} />}
              title="Continue without a folder"
              body="Start right away in your own user folder. You can pick a real folder later."
              hint="C:\Users\your-name"
              busy={busy === 'none'}
              onClick={() => void finish('none')}
            />
          </div>
          <button onClick={() => setStep(1)} className="mx-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-fg-faint hover:bg-hover hover:text-fg">
            <ArrowLeft size={13} /> Back — “{name.trim()}”
          </button>
        </div>
      )}
    </div>
  )
}

/** "New project" from the side panel. */
export function NewProjectDialog() {
  const open = useNewProject((s) => s.open)
  const close = (): void => useNewProject.setState({ open: false })
  return (
    <RDialog.Root open={open} onOpenChange={(o) => !o && close()}>
      <RDialog.Portal>
        <RDialog.Overlay className="ask-fade fixed inset-0 z-[70] bg-black/55 backdrop-blur-[3px]" />
        <RDialog.Content
          data-testid="new-project-dialog"
          className="ask-pop fixed left-1/2 top-1/2 z-[71] w-[600px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/[0.09] bg-[#121215] p-6 shadow-[0_28px_80px_-12px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.05)] focus:outline-none"
        >
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent-strong">
              <FolderPlus size={18} />
            </span>
            <div>
              <RDialog.Title className="text-[15px] font-semibold text-fg">New project</RDialog.Title>
              <RDialog.Description className="text-[13px] text-fg-muted">A project keeps its terminals and agents together, in sessions.</RDialog.Description>
            </div>
          </div>
          <NewProjectForm onDone={close} />
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}
