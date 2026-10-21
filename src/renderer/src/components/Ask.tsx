import * as RDialog from '@radix-ui/react-dialog'
import { AlertTriangle, FolderPlus, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { cn } from '../lib/cn'
import { Button } from './ui'

/**
 * The app's own confirm / name-it dialogs (instead of the browser's grey `confirm()` box).
 *   if (await askConfirm({ title: 'Remove "Docs"?', ... })) remove()
 *   const name = await askText({ title: 'New project', ... })
 */

type Tone = 'danger' | 'neutral'
type IconKind = 'trash' | 'warning' | 'folder' | 'rename'

interface ConfirmRequest {
  kind: 'confirm'
  title: string
  body?: ReactNode
  confirmLabel: string
  tone: Tone
  icon: IconKind
  resolve: (ok: boolean) => void
}

interface TextRequest {
  kind: 'text'
  title: string
  body?: ReactNode
  label: string
  initial: string
  placeholder?: string
  confirmLabel: string
  icon: IconKind
  resolve: (value: string | null) => void
}

const useAsk = create<{ request: ConfirmRequest | TextRequest | null }>(() => ({ request: null }))

export function askConfirm(opts: { title: string; body?: ReactNode; confirmLabel?: string; tone?: Tone; icon?: IconKind }): Promise<boolean> {
  return new Promise((resolve) => {
    useAsk.getState().request?.kind === 'confirm' && (useAsk.getState().request as ConfirmRequest).resolve(false)
    useAsk.setState({
      request: {
        kind: 'confirm',
        title: opts.title,
        body: opts.body,
        confirmLabel: opts.confirmLabel ?? 'Confirm',
        tone: opts.tone ?? 'danger',
        icon: opts.icon ?? (opts.tone === 'neutral' ? 'warning' : 'trash'),
        resolve
      }
    })
  })
}

export function askText(opts: {
  title: string
  body?: ReactNode
  label: string
  initial?: string
  placeholder?: string
  confirmLabel?: string
  icon?: IconKind
}): Promise<string | null> {
  return new Promise((resolve) => {
    useAsk.setState({
      request: {
        kind: 'text',
        title: opts.title,
        body: opts.body,
        label: opts.label,
        initial: opts.initial ?? '',
        placeholder: opts.placeholder,
        confirmLabel: opts.confirmLabel ?? 'Save',
        icon: opts.icon ?? 'folder',
        resolve
      }
    })
  })
}

const ICONS = { trash: Trash2, warning: AlertTriangle, folder: FolderPlus, rename: Pencil }

function finish(value: boolean | string | null): void {
  const req = useAsk.getState().request
  if (!req) return
  useAsk.setState({ request: null })
  if (req.kind === 'confirm') req.resolve(value === true)
  else req.resolve(typeof value === 'string' ? value : null)
}

/** Mounted once at the app root. */
export function AskHost() {
  const request = useAsk((s) => s.request)
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (request?.kind === 'text') setText(request.initial)
  }, [request])

  if (!request) return null
  const danger = request.kind === 'confirm' && request.tone === 'danger'
  const Icon = ICONS[request.icon]
  const canSubmit = request.kind === 'confirm' || text.trim().length > 0

  return (
    <RDialog.Root open onOpenChange={(open) => !open && finish(request.kind === 'confirm' ? false : null)}>
      <RDialog.Portal>
        <RDialog.Overlay className="ask-fade fixed inset-0 z-[70] bg-black/55 backdrop-blur-[3px]" />
        <RDialog.Content
          data-testid="ask-dialog"
          onOpenAutoFocus={(e) => {
            if (request.kind === 'text') {
              e.preventDefault()
              requestAnimationFrame(() => input.current?.select())
            }
          }}
          className="ask-pop fixed left-1/2 top-1/2 z-[71] w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#121215] shadow-[0_28px_80px_-12px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.05)] focus:outline-none"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (canSubmit) finish(request.kind === 'confirm' ? true : text.trim())
            }}
          >
            <div className="flex gap-4 px-6 pb-5 pt-6">
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                  danger ? 'border-err/25 bg-err/10 text-err' : 'border-accent/25 bg-accent/10 text-accent-strong'
                )}
              >
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <RDialog.Title className="text-[15px] font-semibold leading-snug tracking-tight text-fg">{request.title}</RDialog.Title>
                {request.body ? (
                  <RDialog.Description asChild>
                    <div className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{request.body}</div>
                  </RDialog.Description>
                ) : (
                  <RDialog.Description className="sr-only">{request.title}</RDialog.Description>
                )}
                {request.kind === 'text' && (
                  <label className="mt-4 block">
                    <span className="mb-1.5 block text-xs font-medium text-fg-muted">{request.label}</span>
                    <input
                      ref={input}
                      value={text}
                      maxLength={60}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={request.placeholder}
                      className="h-9 w-full rounded-[10px] border border-line-strong bg-surface px-3 text-sm text-fg shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] placeholder:text-fg-faint focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20"
                    />
                  </label>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/[0.06] bg-black/20 px-6 py-3.5">
              <Button type="button" variant="ghost" onClick={() => finish(request.kind === 'confirm' ? false : null)}>
                Cancel
              </Button>
              <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={!canSubmit} autoFocus={request.kind === 'confirm'} data-testid="ask-confirm">
                {request.confirmLabel}
              </Button>
            </div>
          </form>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}
