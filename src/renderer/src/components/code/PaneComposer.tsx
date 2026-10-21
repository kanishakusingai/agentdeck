import { ArrowUp, AtSign, File, Folder, Loader2, Mic, Slash, Sparkles } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { agentById } from '@shared/agents'
import { applySuggestion, detectTrigger, rankFiles, type Trigger } from '@shared/composer'
import type { MenuItem } from '@shared/terminal-screen'
import { cn } from '../../lib/cn'
import { boxChanged, pressKey, pressKeys, submit, useBoxText, useTerminalMenu } from '../../lib/live-input'
import { errorText, toast, useApp } from '../../lib/store'
import { registerComposer, toggleRecording, useVoice } from '../../voice/dictation'
import { AgentIcon, IconButton, Kbd, menuSurface, Tip } from '../ui'

export interface PaneComposerHandle {
  focus(): void
}

interface Props {
  ptyId?: string
  workspaceId: string
  agentId?: string
  /** This pane is the one the user is working in. */
  active: boolean
}

/** Keys that drive the agent's own menus and history while the box is empty. */
const PASS_THROUGH: Record<string, string> = {
  ArrowUp: '\u001b[A',
  ArrowDown: '\u001b[B',
  ArrowRight: '\u001b[C',
  ArrowLeft: '\u001b[D',
  Enter: '\r',
  Tab: '\t',
  Backspace: '\u007f'
}
const UP = '\u001b[A'
const DOWN = '\u001b[B'

type Suggestion = { kind: 'command'; id: string; item: MenuItem } | { kind: 'file'; id: string; path: string }

const MAX_HEIGHT = 168
/** Messages sent from each pane, newest last (Alt+↑ / Alt+↓ bring them back). */
const sentHistory = new Map<string, string[]>()
/** Height of the one-line box (padding + one 13px line), so the first letter doesn't change it. */
const ONE_LINE = 36

/**
 * The message box under every terminal pane. It is live: what you type here appears
 * in the terminal's own input line as you type, and what you type in the terminal
 * appears here. "/" shows the commands the agent itself is offering in the terminal
 * (read from its screen, so they are always its real ones), "@" picks a workspace file.
 * While the box is empty, arrows / Enter / Tab go straight to the agent.
 */
export const PaneComposer = forwardRef<PaneComposerHandle, Props>(function PaneComposer({ ptyId, workspaceId, agentId, active }, handle) {
  /** What's typed before the process exists (moved into the terminal once it does). */
  const [draft, setDraft] = useState('')
  const live = useBoxText((s) => (ptyId ? s[ptyId] : undefined))
  const text = ptyId ? (live ?? '') : draft
  const [caret, setCaret] = useState(0)
  const [enhancing, setEnhancing] = useState(false)
  const [highlight, setHighlight] = useState(0)
  /** Trigger position the user closed with Esc (stays closed until they type elsewhere). */
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [files, setFiles] = useState<string[] | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const filesLoadedAt = useRef(0)
  const historyAt = useRef(-1)
  const recording = useVoice((s) => s.ptt.phase === 'recording')
  const pttKey = useApp((s) => s.snapshot!.settings.pushToTalkKey)
  const agent = agentById(agentId)

  useImperativeHandle(handle, () => ({ focus: () => ref.current?.focus() }), [])

  const changeText = (value: string): void => {
    if (ptyId) boxChanged(ptyId, value)
    else setDraft(value)
  }

  // The process now exists: hand it what was typed meanwhile.
  useEffect(() => {
    if (!ptyId || !draft) return
    boxChanged(ptyId, draft)
    setDraft('')
  }, [ptyId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Text typed in the terminal moves the caret to the end of the box.
  useEffect(() => {
    if (document.activeElement !== ref.current) setCaret(text.length)
  }, [text])

  // Dictation with nothing focused lands in the active pane's box.
  const textRef = useRef(text)
  textRef.current = text
  useEffect(() => {
    if (!active) return
    return registerComposer((t) => {
      const prev = textRef.current
      changeText(prev && !/\s$/.test(prev) ? `${prev} ${t}` : prev + t)
      ref.current?.focus()
    })
  }, [active, ptyId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Grow with the content. An empty box is always one line (a long placeholder must not
  // wrap): any height change resizes the terminal above, which makes the shell redraw.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!text) {
      el.style.height = `${ONE_LINE}px`
      return
    }
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, ONE_LINE), MAX_HEIGHT)}px`
  }, [text])

  const rawTrigger = detectTrigger(text, caret)
  const trigger: Trigger | null = rawTrigger && rawTrigger.start !== dismissed ? rawTrigger : null
  const { menu, reading } = useTerminalMenu(ptyId, trigger?.kind === 'command' ? text : null)

  // Load the file list when "@" is typed (re-read if it's older than 15 s).
  useEffect(() => {
    if (trigger?.kind !== 'file' || Date.now() - filesLoadedAt.current < 15_000) return
    filesLoadedAt.current = Date.now()
    void window.api.composer
      .files(workspaceId)
      .then(setFiles)
      .catch(() => setFiles([]))
  }, [trigger?.kind, workspaceId])

  const suggestions: Suggestion[] = useMemo(() => {
    if (!trigger) return []
    if (trigger.kind === 'command') return (menu?.items ?? []).map((item, i) => ({ kind: 'command', id: `c:${i}:${item.name}`, item }))
    return rankFiles(files ?? [], trigger.query, 60).map((path) => ({ kind: 'file', id: `f:${path}`, path }))
  }, [trigger?.kind, trigger?.query, menu, files]) // eslint-disable-line react-hooks/exhaustive-deps

  const commandMenu = trigger?.kind === 'command'
  const open = Boolean(trigger) && (suggestions.length > 0 || (commandMenu ? reading : files === null))
  /** The agent's own highlight when it can be told from the screen. */
  const agentHighlight = commandMenu && menu && menu.highlighted >= 0 ? menu.highlighted : -1
  const current = agentHighlight >= 0 ? agentHighlight : Math.min(highlight, Math.max(0, suggestions.length - 1))

  useEffect(() => setHighlight(0), [trigger?.kind, trigger?.query])
  useEffect(() => {
    listRef.current?.querySelector('[data-highlighted]')?.scrollIntoView({ block: 'nearest' })
  }, [current, open])

  const setValue = (value: string, at: number): void => {
    changeText(value)
    setCaret(at)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(at, at)
    })
  }

  const sync = (): void => setCaret(ref.current?.selectionStart ?? 0)

  const send = (): void => {
    if (!text.trim()) return
    if (!ptyId) {
      toast('This pane is still starting — try again in a moment.', 'error')
      return
    }
    const message = text.trim()
    const past = (sentHistory.get(ptyId) ?? []).filter((m) => m !== message)
    sentHistory.set(ptyId, [...past, message].slice(-50))
    historyAt.current = -1
    submit(ptyId)
    setCaret(0)
    setDismissed(null)
  }

  /** Alt+↑ / Alt+↓: step through what was sent from this pane before. */
  const recall = (step: 1 | -1): void => {
    const past = ptyId ? (sentHistory.get(ptyId) ?? []) : []
    if (!past.length) return
    const next = historyAt.current === -1 ? (step === -1 ? past.length - 1 : -1) : historyAt.current + step
    if (next < 0 || next >= past.length) {
      historyAt.current = -1
      return setValue('', 0)
    }
    historyAt.current = next
    setValue(past[next], past[next].length)
  }

  /** Run a command from the agent's menu: move its highlight there and press Enter, as you would in the terminal. */
  const runCommand = (index: number): void => {
    if (!ptyId || !menu) return
    if (agentHighlight >= 0) {
      const delta = index - agentHighlight
      pressKeys(ptyId, [...Array<string>(Math.abs(delta)).fill(delta > 0 ? DOWN : UP), '\r'])
    } else {
      // The agent's highlight can't be seen: type the command, then Enter.
      boxChanged(ptyId, menu.items[index].name)
      pressKey(ptyId, '\r')
    }
    ref.current?.focus()
  }

  const chooseFile = (path: string): void => {
    if (!trigger) return
    const folder = path.endsWith('/')
    const next = applySuggestion(text, caret, trigger, `@${path}`, !folder)
    setValue(next.text, next.caret)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Typing in a different language (IME) — let it compose.
    if (e.nativeEvent.isComposing) return
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      recall(e.key === 'ArrowUp' ? -1 : 1)
      return
    }
    // The agent's command menu: the keys work it just like in the terminal.
    if (open && commandMenu && ptyId && suggestions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        pressKey(ptyId, step === 1 ? DOWN : UP)
        if (agentHighlight < 0) setHighlight((current + step + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (agentHighlight >= 0) pressKey(ptyId, '\r')
        else runCommand(current)
        return
      }
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        pressKey(ptyId, '\t')
        return
      }
    }
    if (open && !commandMenu && suggestions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setHighlight((current + step + suggestions.length) % suggestions.length)
        return
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault()
        const s = suggestions[current]
        if (s.kind === 'file') chooseFile(s.path)
        return
      }
    }
    if (open && e.key === 'Escape') {
      e.preventDefault()
      setDismissed(trigger!.start)
      // The agent closes its own menu too.
      if (commandMenu && ptyId) pressKey(ptyId, '\u001b')
      return
    }
    // Esc always reaches the agent (it interrupts a running task).
    if (e.key === 'Escape') {
      e.preventDefault()
      if (ptyId) pressKey(ptyId, '\u001b')
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && text.trim()) {
      e.preventDefault()
      send()
      return
    }
    const ctrl = e.ctrlKey || e.metaKey
    if (ctrl && e.key.toLowerCase() === 'c' && ref.current?.selectionStart === ref.current?.selectionEnd) {
      e.preventDefault()
      if (text) setValue('', 0)
      else if (ptyId) pressKey(ptyId, '\u0003')
      return
    }
    if (!text && ptyId && !ctrl && !e.altKey) {
      const seq = e.key === 'Tab' && e.shiftKey ? '\u001b[Z' : e.shiftKey && e.key !== 'Tab' ? undefined : PASS_THROUGH[e.key]
      if (seq) {
        e.preventDefault()
        pressKey(ptyId, seq)
      }
    }
  }

  const enhance = async (): Promise<void> => {
    if (!text.trim() || enhancing) return
    setEnhancing(true)
    try {
      const better = await window.api.voice.enhance(text.trim())
      setValue(better, better.length)
      toast('Prompt rewritten — review it, then send.', 'success')
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setEnhancing(false)
    }
  }

  const insertTrigger = (ch: '/' | '@'): void => {
    const el = ref.current
    const at = el?.selectionStart ?? text.length
    if (ch === '/') {
      if (text.trim()) return toast('Commands go at the start of an empty message.')
      return setValue('/', 1)
    }
    const before = text.slice(0, at)
    const pad = before && !/\s$/.test(before) ? ' ' : ''
    setValue(`${before}${pad}@${text.slice(at)}`, at + pad.length + 1)
  }

  const placeholder = agent?.provider || agentId ? `Message ${agent?.label ?? 'the agent'} — / commands, @ files` : 'Type a command — @ for files'

  return (
    <div className="@container relative shrink-0 px-2 pb-2 pt-1.5" data-testid="pane-composer">
      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label={commandMenu ? 'Commands' : 'Files'}
          className={cn(menuSurface, 'absolute bottom-full left-2 right-2 mb-1 max-h-[min(320px,60vh)] overflow-y-auto')}
          // Keep focus in the text box while clicking a suggestion.
          onMouseDown={(e) => e.preventDefault()}
        >
          {!suggestions.length ? (
            <div className="flex h-8 items-center gap-2 px-2.5 text-fg-faint">
              <Loader2 size={13} className="animate-spin" /> {commandMenu ? 'Reading the commands from the terminal…' : 'Reading files…'}
            </div>
          ) : (
            suggestions.map((s, i) => (
              <div
                key={s.id}
                role="option"
                aria-selected={i === current}
                data-highlighted={i === current ? '' : undefined}
                onMouseMove={() => agentHighlight < 0 && i !== current && setHighlight(i)}
                onClick={() => (s.kind === 'command' ? runCommand(i) : chooseFile(s.path))}
                className={cn(
                  'flex h-8 cursor-default select-none items-center gap-2.5 rounded-lg px-2.5',
                  i === current ? 'bg-[#27272d] text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' : 'hover:bg-white/[0.03]'
                )}
              >
                {s.kind === 'command' ? (
                  <>
                    <Slash size={13} className="shrink-0 opacity-70" />
                    <span className="shrink-0 font-mono text-[12.5px]">{s.item.name}</span>
                    {s.item.alias && <span className="shrink-0 font-mono text-[11.5px] text-fg-faint">({s.item.alias})</span>}
                    <span className={cn('min-w-0 truncate text-xs', i === current ? 'text-white/75' : 'text-fg-faint')}>{s.item.description}</span>
                  </>
                ) : (
                  <>
                    {s.path.endsWith('/') ? <Folder size={13} className="shrink-0 opacity-70" /> : <File size={13} className="shrink-0 opacity-70" />}
                    <span className="min-w-0 truncate font-mono text-[12.5px]">{s.path}</span>
                  </>
                )}
              </div>
            ))
          )}
          {commandMenu && menu && menu.more > 0 && (
            <div className="flex h-7 items-center px-2.5 text-xs text-fg-faint" data-testid="menu-more">
              +{menu.more} more — keep typing to narrow it down, or press ↓ to scroll
            </div>
          )}
          <div className="mt-1 flex items-center gap-1 border-t border-white/[0.06] px-2 pb-0.5 pt-1.5 text-2xs text-fg-faint">
            {commandMenu ? (
              <>
                <span className="mr-1">From {agent?.label ?? 'the terminal'}</span>· <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> choose · <Kbd>Enter</Kbd> run · <Kbd>Tab</Kbd> complete · <Kbd>Esc</Kbd> close
              </>
            ) : (
              <>
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> choose · <Kbd>Enter</Kbd> insert · <Kbd>Esc</Kbd> close
              </>
            )}
          </div>
        </div>
      )}

      <div
        className={cn(
          'rounded-[11px] border bg-surface transition-[border-color,box-shadow] duration-150',
          active ? 'border-line-strong' : 'border-line',
          'focus-within:border-[#5b5b66] focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.05)]'
        )}
      >
        <textarea
          ref={ref}
          rows={1}
          value={text}
          spellCheck={false}
          onChange={(e) => {
            changeText(e.target.value)
            setCaret(e.target.selectionStart)
            if (dismissed !== null && detectTrigger(e.target.value, e.target.selectionStart)?.start !== dismissed) setDismissed(null)
          }}
          onSelect={sync}
          onClick={sync}
          onKeyDown={onKeyDown}
          onBlur={() => setDismissed(rawTrigger?.start ?? null)}
          onFocus={() => setDismissed(null)}
          placeholder={placeholder}
          aria-label={`Message to ${agent?.label ?? 'this terminal'}`}
          aria-expanded={open}
          aria-autocomplete="list"
          className={cn(
            'block h-9 w-full resize-none bg-transparent px-3 pb-1 pt-2.5 text-[13px] leading-[21px] text-fg outline-none placeholder:text-fg-faint focus:outline-none focus-visible:outline-none',
            !text && 'overflow-hidden whitespace-nowrap text-ellipsis'
          )}
          style={{ maxHeight: MAX_HEIGHT }}
        />
        <div className="flex items-center gap-1 px-1.5 pb-1.5">
          {agentId && (
            <IconButton label="Commands ( / )" tipSide="top" onClick={() => insertTrigger('/')} className="h-7 w-7 text-fg-faint">
              <Slash size={14} />
            </IconButton>
          )}
          <IconButton label="Mention a file ( @ )" tipSide="top" onClick={() => insertTrigger('@')} className="h-7 w-7 text-fg-faint">
            <AtSign size={14} />
          </IconButton>
          {agentId && (
            <span className="ml-0.5 hidden h-6 shrink-0 items-center gap-1.5 rounded-md border border-line bg-panel px-2 text-2xs text-fg-muted @[380px]:flex" title="Messages from this box go to this agent">
              <AgentIcon agentId={agentId} size={11} />
              {agent?.label ?? agentId}
            </span>
          )}
          <span className="hidden min-w-0 truncate pl-1 text-2xs text-fg-faint @[640px]:inline">
            Live with the terminal · <Kbd>Enter</Kbd> send · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line · <Kbd>Alt</Kbd>+<Kbd>↑</Kbd> last message · hold <Kbd>{pttKey}</Kbd> to talk
          </span>
          <span className="flex-1" />
          <IconButton
            label={recording ? 'Stop dictation' : 'Dictate'}
            tipSide="top"
            onClick={() => {
              ref.current?.focus()
              toggleRecording()
            }}
            className={cn('h-7 w-7', recording ? 'bg-err/15 text-err' : 'text-fg-faint')}
          >
            <Mic size={14} />
          </IconButton>
          <IconButton
            label="Enhance Prompt — rewrite into a clear brief"
            tipSide="top"
            onClick={() => void enhance()}
            disabled={!text.trim() || enhancing}
            className="h-7 w-7 text-fg-faint"
          >
            {enhancing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          </IconButton>
          <Tip label="Send · Enter" side="top">
            <button
              aria-label="Send"
              onClick={() => send()}
              disabled={!text.trim()}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#1d4ed8] bg-linear-to-b from-[#4c8df6] to-[#2563eb] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_1px_2px_rgba(0,0,0,0.45)] transition-all hover:from-[#5d9bff] hover:to-[#3071f0] active:translate-y-px disabled:border-line-strong disabled:from-hover disabled:to-hover disabled:text-fg-faint disabled:shadow-none"
            >
              <ArrowUp size={14} strokeWidth={2.5} />
            </button>
          </Tip>
        </div>
      </div>
    </div>
  )
})
