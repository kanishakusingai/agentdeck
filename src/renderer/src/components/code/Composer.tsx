import { ArrowUp, Loader2, Mic, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { activeTerminalPtyId } from '../../lib/canvas'
import { cn } from '../../lib/cn'
import { errorText, toast, useApp } from '../../lib/store'
import { registerComposer, toggleRecording, useVoice } from '../../voice/dictation'
import { IconButton, Kbd, Tip } from '../ui'

/** Send text to an agent's terminal as one message (bracketed paste keeps newlines together). */
function sendToPty(ptyId: string, text: string): void {
  const body = text.includes('\n') ? `\u001b[200~${text}\u001b[201~` : text
  window.api.pty.write(ptyId, body)
  setTimeout(() => window.api.pty.write(ptyId, '\r'), 60)
}

export function Composer() {
  const [text, setText] = useState('')
  const [enhancing, setEnhancing] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const recording = useVoice((s) => s.ptt.phase === 'recording')
  const pttKey = useApp((s) => s.snapshot!.settings.pushToTalkKey)
  // Re-render when focus moves between panes so the target label stays right.
  const target = useApp((s) => {
    void s.activePanel
    const id = activeTerminalPtyId()
    return id ? s.ptys[id] : undefined
  })

  useEffect(() => {
    registerComposer((t) => {
      setText((prev) => (prev && !/\s$/.test(prev) ? `${prev} ${t}` : prev + t))
      ref.current?.focus()
    })
    return () => registerComposer(null)
  }, [])

  // Grow with content up to ~6 lines.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [text])

  const send = (): void => {
    const value = text.trim()
    if (!value) return
    if (!target) {
      toast('Click a terminal pane first, or launch an agent.', 'error')
      return
    }
    sendToPty(target.id, value)
    setText('')
  }

  const enhance = async (): Promise<void> => {
    if (!text.trim() || enhancing) return
    setEnhancing(true)
    try {
      setText(await window.api.voice.enhance(text.trim()))
      toast('Prompt rewritten — review it, then send.', 'success')
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setEnhancing(false)
    }
  }

  return (
    <div className="shrink-0 border-t border-line bg-bg px-3 pb-3 pt-2.5">
      <div className="mb-1.5 flex items-center gap-2 px-1 text-2xs text-fg-faint">
        <span>To</span>
        <span className={cn('font-medium', target ? 'text-fg-muted' : 'text-fg-faint')}>{target ? target.title : 'no pane selected'}</span>
        <span className="flex-1" />
        <span className="flex items-center gap-1">
          Hold <Kbd>{pttKey}</Kbd> to dictate
        </span>
      </div>
      <div className="flex items-end gap-1.5 rounded-lg border border-line-strong bg-surface p-1.5 focus-within:border-accent">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Tell the agent what to change…  (Enter to send, Shift+Enter for a new line)"
          aria-label="Message to the active pane"
          className="max-h-[132px] min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed text-fg placeholder:text-fg-faint focus:outline-none"
        />
        <IconButton label={recording ? 'Stop dictation' : 'Dictate'} tipSide="top" onClick={toggleRecording} className={recording ? 'bg-err/15 text-err' : undefined}>
          <Mic size={15} />
        </IconButton>
        <IconButton label="Enhance Prompt — rewrite into a clear brief" tipSide="top" onClick={() => void enhance()} disabled={!text.trim() || enhancing}>
          {enhancing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        </IconButton>
        <Tip label="Send · Enter" side="top">
          <button
            aria-label="Send"
            onClick={send}
            disabled={!text.trim()}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-bg transition-colors hover:bg-accent-strong disabled:opacity-35"
          >
            <ArrowUp size={15} strokeWidth={2.5} />
          </button>
        </Tip>
      </div>
    </div>
  )
}
