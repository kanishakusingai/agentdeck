import { ArrowUp, AtSign, File, Folder, Loader2, Mic, Slash, Sparkles, Wand2 } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { agentById } from '@shared/agents'
import { applySuggestion, commandsFor, detectTrigger, rankFiles, rankSuggestions, type SlashCommand, type Trigger } from '@shared/composer'
import { asPastedMessage } from '@shared/paste'
import { cn } from '../../lib/cn'
import { writePty } from '../../lib/pty-bus'
import { errorText, toast, useApp } from '../../lib/store'
import { registerComposer, toggleRecording, useVoice } from '../../voice/dictation'
import { IconButton, Kbd, menuSurface, Tip } from '../ui'

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

/** Keys that drive the agent's own menus while the box is empty. */
const PASS_THROUGH: Record<string, string> = {
  ArrowUp: '\u001b[A',
  ArrowDown: '\u001b[B',
  ArrowRight: '\u001b[C',
  ArrowLeft: '\u001b[D',
  Enter: '\r',
  Tab: '\t',
  Backspace: '\u007f'
}

type Suggestion =
  | { kind: 'command'; id: string; command: SlashCommand }
  | { kind: 'file'; id: string; path: string }

const MAX_HEIGHT = 168

/**
 * The message box under every terminal pane: type a message and press Enter,
 * "/" lists the agent's commands (built-in, custom and skills), "@" picks a
 * file from the workspace. While it's empty, arrows / Enter / Esc / Tab go
 * straight to the agent so its menus keep working.
 */
export const PaneComposer = forwardRef<PaneComposerHandle, Props>(function PaneComposer({ ptyId, workspaceId, agentId, active }, handle) {
  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const [enhancing, setEnhancing] = useState(false)
  const [highlight, setHighlight] = useState(0)
  /** Trigger position the user closed with Esc (stays closed until they type elsewhere). */
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [custom, setCustom] = useState<SlashCommand[]>([])
  const [files, setFiles] = useState<string[] | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const filesLoadedAt = useRef(0)
  const recording = useVoice((s) => s.ptt.phase === 'recording')
  const pttKey = useApp((s) => s.snapshot!.settings.pushToTalkKey)
  const agent = agentById(agentId)

  useImperativeHandle(handle, () => ({ focus: () => ref.current?.focus() }), [])

  // Dictation with nothing focused lands in the active pane's box.
  useEffect(() => {
    if (!active) return
    return registerComposer((t) => {
      setText((prev) => (prev && !/\s$/.test(prev) ? `${prev} ${t}` : prev + t))
      ref.current?.focus()
    })
  }, [active])

  // The user's own commands and skills for this agent.
  useEffect(() => {
    if (!agentId) return setCustom([])
    let cancelled = false
    void window.api.composer
      .commands(workspaceId, agentId)
      .then((list) => !cancelled && setCustom(list))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [workspaceId, agentId])

  // Grow with the content.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [text])

  const rawTrigger = detectTrigger(text, caret)
  const trigger: Trigger | null =
    rawTrigger && rawTrigger.start !== dismissed && (rawTrigger.kind === 'file' || agentId) ? rawTrigger : null

  // Load the file list when "@" is typed (re-read if it's older than 15 s).
  useEffect(() => {
    if (trigger?.kind !== 'file' || Date.now() - filesLoadedAt.current < 15_000) return
    filesLoadedAt.current = Date.now()
    void window.api.composer
      .files(workspaceId)
      .then(setFiles)
      .catch(() => setFiles([]))
  }, [trigger?.kind, workspaceId])

  const allCommands = useMemo(() => {
    const names = new Set(custom.map((c) => c.name))
    return [...commandsFor(agentId).filter((c) => !names.has(c.name)), ...custom]
  }, [agentId, custom])

  const suggestions: Suggestion[] = useMemo(() => {
    if (!trigger) return []
    if (trigger.kind === 'command') {
      return rankSuggestions(allCommands, trigger.query, (c) => c.name)
        .slice(0, 60)
        .map((command) => ({ kind: 'command', id: `c:${command.name}`, command }))
    }
    return rankFiles(files ?? [], trigger.query, 60).map((path) => ({ kind: 'file', id: `f:${path}`, path }))
  }, [trigger?.kind, trigger?.query, allCommands, files]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = Boolean(trigger) && (suggestions.length > 0 || (trigger?.kind === 'file' && files === null))
  const current = Math.min(highlight, Math.max(0, suggestions.length - 1))

  useEffect(() => setHighlight(0), [trigger?.kind, trigger?.query])
  useEffect(() => {
    listRef.current?.querySelector('[data-highlighted]')?.scrollIntoView({ block: 'nearest' })
  }, [current, open])

  const setValue = (value: string, at: number): void => {
    setText(value)
    setCaret(at)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(at, at)
    })
  }

  const sync = (): void => setCaret(ref.current?.selectionStart ?? 0)

  const send = (value = text): void => {
    const message = value.trim()
    if (!message) return
    if (!ptyId) {
      toast('This pane is still starting — try again in a moment.', 'error')
      return
    }
    writePty(ptyId, asPastedMessage(message))
    setTimeout(() => writePty(ptyId, '\r'), 60)
    setValue('', 0)
    setDismissed(null)
  }

  const choose = (s: Suggestion, run: boolean): void => {
    if (!trigger) return
    if (s.kind === 'command') {
      const next = applySuggestion(text, caret, trigger, `/${s.command.name}`)
      if (run) send(next.text)
      else setValue(next.text, next.caret)
      return
    }
    const folder = s.path.endsWith('/')
    const next = applySuggestion(text, caret, trigger, `@${s.path}`, !folder)
    setValue(next.text, next.caret)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Typing in a different language (IME) — let it compose.
    if (e.nativeEvent.isComposing) return
    if (open && suggestions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setHighlight((current + step + suggestions.length) % suggestions.length)
        return
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault()
        choose(suggestions[current], e.key === 'Enter')
        return
      }
    }
    if (open && e.key === 'Escape') {
      e.preventDefault()
      setDismissed(trigger!.start)
      return
    }
    // Esc always reaches the agent (it interrupts a running task); the draft stays.
    if (e.key === 'Escape') {
      e.preventDefault()
      if (ptyId) writePty(ptyId, '\u001b')
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
      else if (ptyId) writePty(ptyId, '\u0003')
      return
    }
    if (!text && ptyId && !ctrl && !e.altKey) {
      const seq = e.key === 'Tab' && e.shiftKey ? '\u001b[Z' : e.shiftKey && e.key !== 'Tab' ? undefined : PASS_THROUGH[e.key]
      if (seq) {
        e.preventDefault()
        writePty(ptyId, seq)
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

  const placeholder = agent?.provider || agentId
    ? `Message ${agent?.label ?? 'the agent'} — / for commands, @ for files`
    : 'Type a command and press Enter — @ for files'

  return (
    <div className="@container relative shrink-0 px-2 pb-2 pt-1.5" data-testid="pane-composer">
      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label={trigger!.kind === 'command' ? 'Commands' : 'Files'}
          className={cn(menuSurface, 'absolute bottom-full left-2 right-2 mb-1 max-h-[min(280px,60vh)] overflow-y-auto')}
          // Keep focus in the text box while clicking a suggestion.
          onMouseDown={(e) => e.preventDefault()}
        >
          {trigger!.kind === 'file' && files === null ? (
            <div className="flex h-8 items-center gap-2 px-2.5 text-fg-faint">
              <Loader2 size={13} className="animate-spin" /> Reading files…
            </div>
          ) : (
            suggestions.map((s, i) => (
              <div
                key={s.id}
                role="option"
                aria-selected={i === current}
                data-highlighted={i === current ? '' : undefined}
                onMouseMove={() => i !== current && setHighlight(i)}
                onClick={() => choose(s, false)}
                className={cn(
                  'flex h-8 cursor-default select-none items-center gap-2.5 rounded-lg px-2.5',
                  i === current && 'bg-linear-to-b from-[#3b82f6] to-[#2563eb] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
                )}
              >
                {s.kind === 'command' ? (
                  <>
                    {s.command.source === 'skill' ? <Wand2 size={13} className="shrink-0 opacity-70" /> : <Slash size={13} className="shrink-0 opacity-70" />}
                    <span className="shrink-0 font-mono text-[12.5px]">/{s.command.name}</span>
                    <span className={cn('min-w-0 truncate text-xs', i === current ? 'text-white/75' : 'text-fg-faint')}>{s.command.description}</span>
                    {s.command.source !== 'builtin' && (
                      <span className={cn('ml-auto shrink-0 rounded px-1.5 text-2xs', i === current ? 'bg-white/15 text-white' : 'bg-surface text-fg-muted')}>
                        {s.command.source === 'skill' ? 'skill' : 'custom'}
                      </span>
                    )}
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
          <div className="mt-1 flex items-center gap-1 border-t border-white/[0.06] px-2 pb-0.5 pt-1.5 text-2xs text-fg-faint">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> choose · <Kbd>Enter</Kbd> {trigger!.kind === 'command' ? 'run' : 'insert'} · <Kbd>Tab</Kbd> insert · <Kbd>Esc</Kbd> close
          </div>
        </div>
      )}

      <div
        className={cn(
          'rounded-[11px] border bg-surface transition-[border-color,box-shadow] duration-150',
          active ? 'border-line-strong' : 'border-line',
          'focus-within:border-accent/70 focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.12)]'
        )}
      >
        <textarea
          ref={ref}
          rows={1}
          value={text}
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value)
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
          className="block w-full resize-none bg-transparent px-3 pb-1 pt-2.5 text-[13px] leading-relaxed text-fg outline-none placeholder:text-fg-faint focus:outline-none focus-visible:outline-none"
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
          <span className="hidden min-w-0 truncate pl-1 text-2xs text-fg-faint @[520px]:inline">
            <Kbd>Enter</Kbd> send · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line · <Kbd>Esc</Kbd> to agent · hold <Kbd>{pttKey}</Kbd> to talk
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
