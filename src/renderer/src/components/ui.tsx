import * as RDialog from '@radix-ui/react-dialog'
import * as RMenu from '@radix-ui/react-dropdown-menu'
import * as RTooltip from '@radix-ui/react-tooltip'
import { cva, type VariantProps } from 'class-variance-authority'
import { Aperture, Asterisk, Atom, Bot, Boxes, CodeXml, Feather, Moon, MousePointer2, Orbit, Sparkle, SquareTerminal, X, Zap } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import type { PaneStatus } from '@shared/types'
import type { Activity } from '../lib/activity'
import { cn } from '../lib/cn'

// ---------- Button ----------

const button = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 no-drag',
  {
    variants: {
      variant: {
        primary: 'bg-accent-solid text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] hover:bg-accent',
        secondary: 'bg-raised text-fg border border-line-strong hover:bg-hover',
        ghost: 'text-fg-muted hover:text-fg hover:bg-hover',
        danger: 'bg-err/12 text-err border border-err/30 hover:bg-err/20'
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-8 px-3 text-sm',
        lg: 'h-10 px-4 text-sm',
        icon: 'h-7 w-7 text-fg-muted hover:text-fg'
      }
    },
    defaultVariants: { variant: 'secondary', size: 'md' }
  }
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn(button({ variant, size }), className)} {...props} />
))
Button.displayName = 'Button'

// ---------- Tooltip + icon button ----------

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RTooltip.Provider delayDuration={350} skipDelayDuration={150}>
      {children}
    </RTooltip.Provider>
  )
}

export function Tip({ label, children, side = 'bottom' }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 rounded-md border border-line-strong bg-raised px-2 py-1 text-xs text-fg shadow-[0_6px_20px_rgba(0,0,0,0.45)]"
        >
          {label}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  )
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string; tipSide?: 'top' | 'bottom' | 'left' | 'right' }>(
  ({ label, tipSide, className, children, ...props }, ref) => (
    <Tip label={label} side={tipSide}>
      <Button ref={ref} variant="ghost" size="icon" aria-label={label} className={className} {...props}>
        {children}
      </Button>
    </Tip>
  )
)
IconButton.displayName = 'IconButton'

// ---------- Form controls ----------

const field =
  'w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(field, 'h-8', className)} {...props} />
))
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(field, 'resize-none py-2 leading-relaxed', className)} {...props} />
))
Textarea.displayName = 'Textarea'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(field, 'h-8 cursor-pointer pr-7', className)} {...props} />
))
Select.displayName = 'Select'

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-fg-faint">{hint}</span>}
    </label>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors',
        checked ? 'border-accent-solid bg-accent-solid' : 'border-line-strong bg-raised'
      )}
    >
      <span className={cn('h-3 w-3 rounded-full transition-transform', checked ? 'translate-x-[15px] bg-white' : 'translate-x-[2px] bg-fg-muted')} />
    </button>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface px-1 font-sans text-2xs text-fg-muted">
      {children}
    </kbd>
  )
}

// ---------- Status ----------

const statusColor: Record<PaneStatus, string> = {
  running: 'bg-ok',
  limited: 'bg-warn',
  exited: 'bg-fg-faint'
}

export function StatusDot({ status, className }: { status: PaneStatus; className?: string }) {
  return (
    <span
      role="img"
      aria-label={status === 'running' ? 'Running' : status === 'limited' ? 'Usage limit' : 'Exited'}
      className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', statusColor[status], status === 'running' && 'pulse-dot', className)}
    />
  )
}

const activityStyle: Record<Activity, { dot: string; text: string; label: string }> = {
  working: { dot: 'bg-ok', text: 'text-ok', label: 'Working' },
  needs: { dot: 'bg-warn', text: 'text-warn', label: 'Needs you' },
  idle: { dot: 'bg-fg-faint', text: 'text-fg-faint', label: 'Idle' }
}

export const activityLabel = (a: Activity): string => activityStyle[a].label
export const activityText = (a: Activity): string => activityStyle[a].text

export function ActivityDot({ activity, className }: { activity: Activity; className?: string }) {
  return (
    <span
      role="img"
      aria-label={activityStyle[activity].label}
      className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', activityStyle[activity].dot, activity === 'working' && 'pulse-dot', className)}
    />
  )
}

// ---------- Agent marks ----------

const AGENT_MARKS: Record<string, { icon: typeof Asterisk; color: string }> = {
  claude: { icon: Asterisk, color: 'var(--color-claude)' },
  codex: { icon: Aperture, color: '#ededef' },
  gemini: { icon: Sparkle, color: '#60a5fa' },
  'cursor-agent': { icon: MousePointer2, color: '#ededef' },
  copilot: { icon: Bot, color: '#a1a1aa' },
  grok: { icon: Orbit, color: '#ededef' },
  droid: { icon: Boxes, color: '#f5a524' },
  opencode: { icon: CodeXml, color: '#ededef' },
  kimi: { icon: Moon, color: '#a1a1aa' },
  amp: { icon: Zap, color: '#f97316' },
  antigravity: { icon: Atom, color: '#60a5fa' },
  aider: { icon: Feather, color: '#22c55e' }
}

/** A small brand-coloured mark for an agent (or a terminal icon for plain shells). */
export function AgentIcon({ agentId, size = 14, tile, className }: { agentId?: string; size?: number; tile?: boolean; className?: string }) {
  const mark = agentId ? AGENT_MARKS[agentId] : undefined
  const Icon = mark?.icon ?? SquareTerminal
  const glyph = <Icon size={size} strokeWidth={mark?.icon === Asterisk ? 2.75 : 2} style={{ color: mark?.color ?? 'var(--color-fg-muted)' }} aria-hidden className={tile ? undefined : className} />
  if (!tile) return glyph
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-lg border border-line bg-surface', className)} style={{ width: size + 14, height: size + 14 }}>
      {glyph}
    </span>
  )
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between pl-3.5 pr-2 text-xs font-medium text-fg-faint">
      <span>{children}</span>
      {action}
    </div>
  )
}

export function EmptyState({ icon, title, body, children }: { icon?: ReactNode; title: string; body?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      {icon && <div className="text-fg-faint">{icon}</div>}
      <div className="text-base font-semibold text-fg">{title}</div>
      {body && <div className="max-w-sm text-sm leading-relaxed text-fg-muted">{body}</div>}
      {children && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  )
}

// ---------- Dialog ----------

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" />
        <RDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[520px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line-strong bg-panel shadow-[0_24px_64px_rgba(0,0,0,0.6)] focus:outline-none',
            className
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <RDialog.Title className="text-base font-semibold text-fg">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-1 text-sm text-fg-muted">{description}</RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">{title}</RDialog.Description>
              )}
            </div>
            <RDialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X size={16} />
              </Button>
            </RDialog.Close>
          </div>
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}

// ---------- Menu ----------

export const Menu = RMenu.Root
export const MenuTrigger = RMenu.Trigger

export function MenuContent({ children, align = 'start', className }: { children: ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <RMenu.Portal>
      <RMenu.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 min-w-[220px] rounded-lg border border-line-strong bg-raised p-1 text-sm shadow-[0_12px_32px_rgba(0,0,0,0.55)]',
          className
        )}
      >
        {children}
      </RMenu.Content>
    </RMenu.Portal>
  )
}

export function MenuItem({
  children,
  onSelect,
  disabled,
  hint,
  danger
}: {
  children: ReactNode
  onSelect?: () => void
  disabled?: boolean
  hint?: ReactNode
  danger?: boolean
}) {
  return (
    <RMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-hover',
        danger ? 'text-err' : 'text-fg'
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {hint && <span className="text-xs text-fg-faint">{hint}</span>}
    </RMenu.Item>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <RMenu.Label className="px-2 pb-1 pt-2 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-faint">{children}</RMenu.Label>
}

export function MenuSeparator() {
  return <RMenu.Separator className="my-1 h-px bg-line" />
}
