import * as RDialog from '@radix-ui/react-dialog'
import * as RMenu from '@radix-ui/react-dropdown-menu'
import * as RSelect from '@radix-ui/react-select'
import * as RTooltip from '@radix-ui/react-tooltip'
import { cva, type VariantProps } from 'class-variance-authority'
import { Asterisk, Atom, Boxes, Check, ChevronDown, Feather, Moon, Orbit, SquareTerminal, X, Zap } from 'lucide-react'
import { Children, forwardRef, isValidElement, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactElement, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import type { PaneStatus } from '@shared/types'
import type { Activity } from '../lib/activity'
import { cn } from '../lib/cn'

// ---------- Button ----------
// Call-to-action style: a soft top-to-bottom gradient, a crisp 1px border in a
// deeper shade, a bright inner top edge and a small drop shadow, so buttons look
// pressable. Blue for the main action, white for the second one.

const button = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium tracking-[-0.005em] transition-[background,box-shadow,border-color,color,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45 no-drag',
  {
    variants: {
      variant: {
        primary:
          'border border-[#1d4ed8] bg-linear-to-b from-[#4c8df6] to-[#2563eb] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_1px_2px_rgba(0,0,0,0.45),0_0_0_1px_rgba(37,99,235,0.15)] hover:from-[#5d9bff] hover:to-[#3071f0] active:from-[#2f6fe8] active:to-[#2563eb]',
        secondary:
          'border border-[#d4d4d8] bg-linear-to-b from-white to-[#ececef] text-[#18181b] shadow-[inset_0_1px_0_#ffffff,0_1px_2px_rgba(0,0,0,0.4)] hover:to-[#e2e2e6] active:from-[#f1f1f3] active:to-[#e4e4e7]',
        ghost: 'rounded-md text-fg-muted hover:bg-hover hover:text-fg active:translate-y-0',
        danger:
          'border border-[#b91c1c] bg-linear-to-b from-[#f05252] to-[#dc2626] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.45)] hover:from-[#f56565] hover:to-[#e02d2d]'
      },
      size: {
        sm: 'h-8 rounded-[9px] px-3 text-xs',
        md: 'h-9 rounded-[10px] px-4 text-[13px]',
        lg: 'h-11 rounded-xl px-5 text-sm',
        icon: 'h-7 w-7 rounded-md text-fg-muted hover:text-fg'
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
  'w-full rounded-[10px] border border-line-strong bg-surface px-3 text-sm text-fg shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] placeholder:text-fg-faint focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(field, 'h-9', className)} {...props} />
))
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(field, 'resize-none py-2 leading-relaxed', className)} {...props} />
))
Textarea.displayName = 'Textarea'

// ---------- Select (dropdown) ----------
// Same call style as a native <select> with <option> children, but drawn by the
// app so the open list matches the menus instead of Windows' grey system list.

interface OptionProps {
  value?: string | number
  disabled?: boolean
  children?: ReactNode
}

/** Radix reserves "" for "nothing chosen", so empty values travel under a stand-in. */
const EMPTY = '__agentdeck_empty__'
const encode = (v: string | number | readonly string[] | undefined): string => (v === undefined || v === '' ? EMPTY : String(v))
const decode = (v: string): string => (v === EMPTY ? '' : v)

function collectOptions(children: ReactNode, out: OptionProps[] = []): OptionProps[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const el = child as ReactElement<OptionProps & { children?: ReactNode }>
    if (el.type === 'option') out.push(el.props)
    else if (el.props.children) collectOptions(el.props.children, out)
  })
  return out
}

export interface SelectProps {
  value?: string | number
  onChange?: (e: { target: { value: string } }) => void
  children?: ReactNode
  className?: string
  disabled?: boolean
  'aria-label'?: string
}

export function Select({ value, onChange, children, className, disabled, 'aria-label': ariaLabel }: SelectProps) {
  const options = collectOptions(children)
  return (
    <RSelect.Root value={encode(value)} onValueChange={(v) => onChange?.({ target: { value: decode(v) } })} disabled={disabled}>
      <RSelect.Trigger
        aria-label={ariaLabel}
        className={cn(
          field,
          'group flex h-9 cursor-pointer items-center justify-between gap-2 text-left hover:border-fg-faint/60 data-[state=open]:border-accent data-[state=open]:ring-3 data-[state=open]:ring-accent/20',
          className
        )}
      >
        <span className="min-w-0 truncate">
          <RSelect.Value />
        </span>
        <RSelect.Icon className="shrink-0 text-fg-faint transition-transform group-data-[state=open]:rotate-180">
          <ChevronDown size={14} />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content position="popper" sideOffset={6} className={cn(menuSurface, 'max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)]')}>
          <RSelect.Viewport>
            {options.map((o) => (
              <RSelect.Item key={encode(o.value)} value={encode(o.value)} disabled={o.disabled} className={cn(menuItem, 'pr-8')}>
                <RSelect.ItemText>{o.children}</RSelect.ItemText>
                <RSelect.ItemIndicator className="absolute right-2.5 flex items-center">
                  <Check size={14} strokeWidth={2.5} />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  )
}

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

// Real product logos (src/renderer/src/assets/agents, MIT — see LICENSE.md there).
const LOGOS = import.meta.glob('../assets/agents/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const logoUrl = (id: string): string | undefined => LOGOS[`../assets/agents/${id}.svg`]
/** One-colour logos (drawn in currentColor) are tinted with a mask instead of shown as-is. */
const MONO_LOGOS = new Set(['cursor-agent', 'copilot', 'grok', 'opencode', 'goose', 'cline', 'kilocode'])

/** Fallback marks for tools without a published logo. */
const FALLBACK_MARKS: Record<string, { icon: typeof Asterisk; color: string }> = {
  droid: { icon: Boxes, color: '#f5a524' },
  aider: { icon: Feather, color: '#22c55e' },
  crush: { icon: Moon, color: '#c084fc' },
  auggie: { icon: Orbit, color: '#a3e635' },
  codebuff: { icon: Atom, color: '#60a5fa' },
  kimi: { icon: Moon, color: '#a1a1aa' },
  amp: { icon: Zap, color: '#f97316' }
}

/** The product's logo for an agent (or a terminal icon for plain shells). */
export function AgentIcon({ agentId, size = 14, tile, className }: { agentId?: string; size?: number; tile?: boolean; className?: string }) {
  const url = agentId ? logoUrl(agentId) : undefined
  let glyph: ReactElement
  if (url && MONO_LOGOS.has(agentId!)) {
    glyph = (
      <span
        aria-hidden
        className={cn('inline-block shrink-0 bg-[#ededef]', !tile && className)}
        style={{ width: size, height: size, mask: `url("${url}") center / contain no-repeat`, WebkitMask: `url("${url}") center / contain no-repeat` }}
      />
    )
  } else if (url) {
    glyph = <img src={url} alt="" aria-hidden draggable={false} width={size} height={size} className={cn('shrink-0 select-none', !tile && className)} />
  } else {
    const mark = agentId ? FALLBACK_MARKS[agentId] : undefined
    const Icon = mark?.icon ?? SquareTerminal
    glyph = <Icon size={size} strokeWidth={2} style={{ color: mark?.color ?? 'var(--color-fg-muted)' }} aria-hidden className={tile ? undefined : className} />
  }
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

// ---------- Menu (dropdown) ----------
// One look for every dropdown: a raised, slightly glassy panel with a soft
// shadow that fades/scales in from its button; the item under the pointer
// lights up in solid blue with white text.

/** The floating panel of every dropdown menu and select. */
export const menuSurface =
  'menu-pop z-50 min-w-[220px] overflow-hidden rounded-xl border border-white/[0.09] bg-[#141417]/95 p-1.5 text-[13px] text-fg shadow-[0_18px_50px_-8px_rgba(0,0,0,0.75),0_2px_6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl'

/** A row inside a dropdown. */
export const menuItem =
  'relative flex h-8 cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 outline-none transition-colors duration-75 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-linear-to-b data-[highlighted]:from-[#3b82f6] data-[highlighted]:to-[#2563eb] data-[highlighted]:text-white data-[highlighted]:shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] data-[state=open]:bg-hover data-[highlighted]:[&_svg]:text-white! data-[highlighted]:[&_.menu-hint]:text-white/75'

export const Menu = RMenu.Root
export const MenuTrigger = RMenu.Trigger
export const MenuSub = RMenu.Sub

/**
 * Right-click menu: wrap any element; menu holds MenuItem rows. Opens at the pointer.
 * (Built on the dropdown menu so every menu in the app looks and behaves the same.)
 */
export function ContextMenu({ children, menu, className }: { children: ReactNode; menu: ReactNode; className?: string }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  return (
    <div
      className={className}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setAt({ x: e.clientX, y: e.clientY })
      }}
    >
      {children}
      <RMenu.Root open={at !== null} onOpenChange={(open) => !open && setAt(null)} modal={false}>
        {at &&
          createPortal(
            <RMenu.Trigger asChild>
              <span aria-hidden className="pointer-events-none fixed h-px w-px" style={{ left: at.x, top: at.y }} />
            </RMenu.Trigger>,
            document.body
          )}
        <RMenu.Portal>
          <RMenu.Content align="start" side="bottom" sideOffset={2} collisionPadding={8} className={menuSurface} data-testid="context-menu">
            {menu}
          </RMenu.Content>
        </RMenu.Portal>
      </RMenu.Root>
    </div>
  )
}

export function MenuContent({ children, align = 'start', className }: { children: ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <RMenu.Portal>
      <RMenu.Content align={align} sideOffset={6} collisionPadding={8} className={cn(menuSurface, className)}>
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
      className={cn(menuItem, danger && 'text-err data-[highlighted]:from-[#ef4444] data-[highlighted]:to-[#dc2626]')}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2.5">{children}</span>
      {hint && <span className="menu-hint shrink-0 text-xs text-fg-faint">{hint}</span>}
    </RMenu.Item>
  )
}

/** A row that opens a side menu (e.g. pick an account). */
export function MenuSubTrigger({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <RMenu.SubTrigger className={menuItem}>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">{children}</span>
      {hint && <span className="menu-hint shrink-0 text-xs text-fg-faint">{hint}</span>}
      <ChevronDown size={13} className="-rotate-90 text-fg-faint" />
    </RMenu.SubTrigger>
  )
}

export function MenuSubContent({ children }: { children: ReactNode }) {
  return (
    <RMenu.Portal>
      <RMenu.SubContent sideOffset={8} alignOffset={-6} collisionPadding={8} className={cn(menuSurface, 'min-w-[200px]')}>
        {children}
      </RMenu.SubContent>
    </RMenu.Portal>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <RMenu.Label className="px-2.5 pb-1.5 pt-2 text-2xs font-semibold uppercase tracking-[0.07em] text-fg-faint">{children}</RMenu.Label>
}

export function MenuSeparator() {
  return <RMenu.Separator className="-mx-1.5 my-1.5 h-px bg-white/[0.07]" />
}
